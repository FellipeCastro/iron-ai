from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.domain.one_rm import epley
from backend.domain.sessions import local_session_date
from backend.domain.volume import volume
from backend.models.db import Exercise, ExerciseAlias, SetLog, User, Workout, WorkoutExercise, WorkoutSession
from backend.services.catalog import normalize
from backend.services.workouts import active_routine, active_sets, workout_focus, workout_letter

MONTHS_SHOWN = 2


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _week_label(start: date) -> dict:
    end = start + timedelta(days=6)
    fmt = lambda d: f"{d.day:02d}/{d.month:02d}"  # noqa: E731
    return {"week": fmt(start), "range": f"{fmt(start)} - {fmt(end)}", "week_start": start.isoformat()}


def _today(user: User, now: datetime | None) -> date:
    return local_session_date(now or datetime.now(UTC), user.timezone)


def months_ago(today: date, months: int) -> date:
    index = today.year * 12 + today.month - 1 - months
    year, month = divmod(index, 12)
    first_next = date(year + (month + 1) // 12, (month + 1) % 12 + 1, 1)
    last_day = (first_next - timedelta(days=1)).day
    return date(year, month + 1, min(today.day, last_day))


def recent_week_starts(today: date, count: int) -> list[date]:
    current = _week_start(today)
    return [current - timedelta(weeks=i) for i in range(count - 1, -1, -1)]


def list_sessions(session: Session, user: User, limit: int = 20, offset: int = 0) -> list[dict]:
    rows = session.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .options(selectinload(WorkoutSession.workout).selectinload(Workout.exercises).selectinload(WorkoutExercise.exercise))
        .order_by(WorkoutSession.local_date.desc(), WorkoutSession.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    if not rows:
        return []
    by_session: dict[int, list[SetLog]] = defaultdict(list)
    sets = session.scalars(
        active_sets(user.id)
        .where(SetLog.session_id.in_([r.id for r in rows]))
        .options(selectinload(SetLog.exercise))
        .order_by(SetLog.id)
    )
    for row in sets:
        by_session[row.session_id].append(row)
    result = []
    for ws in rows:
        logs = by_session.get(ws.id, [])
        # séries do mesmo exercício ficam juntas, na ordem em que o exercício apareceu
        order = list(dict.fromkeys(s.exercise_id for s in logs))
        logs = sorted(logs, key=lambda s: (order.index(s.exercise_id), s.set_number, s.id))
        if ws.workout:
            name, focus = ws.workout.name, workout_focus(ws.workout)
            letter = workout_letter(ws.workout.position)
        else:
            name, focus, letter = "Treino avulso", "", None
        result.append(
            {
                "id": ws.id,
                "date": ws.local_date.isoformat(),
                "workout": name,
                "letter": letter,
                "focus": focus,
                "volume": float(volume([(s.reps, s.weight_kg) for s in logs])),
                "sets": [
                    {"exercise": s.exercise.canonical_name, "set_number": s.set_number, "reps": s.reps, "kg": float(s.weight_kg)}
                    for s in logs
                ],
            }
        )
    return result


def _weekly_rows(session: Session, user: User, since: date):
    return session.execute(
        active_sets(user.id)
        .with_only_columns(SetLog.exercise_id, WorkoutSession.local_date, WorkoutSession.id)
        .where(WorkoutSession.local_date >= since)
    ).all()


def _update_record(best: dict, key: int, reps: int, kg: Decimal, day: date) -> None:
    """Recorde = maior carga; em empate, mais reps. Só uma série melhor substitui, então vale a 1ª vez que foi feito."""
    current = best.get(key)
    if current is None:
        best[key] = {"kg": kg, "reps": reps, "date": day, "first": day}
    elif (kg, reps) > (current["kg"], current["reps"]):
        current.update(kg=kg, reps=reps, date=day)


def _exercise_records(session: Session, user: User) -> dict[int, dict]:
    rows = session.execute(
        active_sets(user.id)
        .with_only_columns(SetLog.exercise_id, SetLog.reps, SetLog.weight_kg, WorkoutSession.local_date)
        .order_by(WorkoutSession.local_date, SetLog.id)
    )
    best: dict[int, dict] = {}
    for exercise_id, reps, kg, day in rows:
        _update_record(best, exercise_id, reps, kg, day)
    return best


def records(session: Session, user: User) -> list[dict]:
    best = _exercise_records(session, user)
    if not best:
        return []
    exercises = {e.id: e for e in session.scalars(select(Exercise).where(Exercise.id.in_(best)))}
    out = [
        {
            "exercise": exercises[eid].canonical_name,
            "group": exercises[eid].muscle_group,
            "weight_kg": float(r["kg"]),
            "reps": r["reps"],
            "date": r["date"].isoformat(),
        }
        for eid, r in best.items()
    ]
    out.sort(key=lambda r: r["exercise"])
    return sorted(out, key=lambda r: r["date"], reverse=True)


def _streak_weeks(days: set[date], today: date) -> tuple[int, int]:
    """Semanas seguidas com ao menos um treino: (atual, recorde)."""
    weeks = sorted({_week_start(d) for d in days})
    if not weeks:
        return 0, 0
    best = run = 1
    for prev, cur in zip(weeks, weeks[1:], strict=False):
        run = run + 1 if cur - prev == timedelta(weeks=1) else 1
        best = max(best, run)
    current_week = _week_start(today)
    if weeks[-1] < current_week - timedelta(weeks=1):
        return 0, best
    current = 1
    for prev, cur in zip(reversed(weeks[:-1]), reversed(weeks[1:]), strict=False):
        if cur - prev == timedelta(weeks=1):
            current += 1
        else:
            break
    return current, best


def _sessions_by_workout(session: Session, user: User, since: date) -> list[dict]:
    """Quantas vezes cada treino da rotina foi feito no período; sessões sem treino viram "Treino avulso"."""
    rows = session.execute(
        select(Workout.name, Workout.position)
        .select_from(WorkoutSession)
        .outerjoin(Workout, Workout.id == WorkoutSession.workout_id)
        .where(WorkoutSession.user_id == user.id, WorkoutSession.local_date >= since)
    ).all()
    counts: dict[str, int] = defaultdict(int)
    order: dict[str, int] = {}
    for name, position in rows:
        label = f"{workout_letter(position)} · {name}" if name is not None else "Avulso"
        counts[label] += 1
        order[label] = position if position is not None else 99
    return [{"name": label, "treinos": counts[label]} for label in sorted(counts, key=lambda k: (order[k], k))]


def dashboard(session: Session, user: User, now: datetime | None = None, months: int = MONTHS_SHOWN) -> dict:
    today = _today(user, now)
    since = months_ago(today, months)
    starts = recent_week_starts(today, (_week_start(today) - _week_start(since)).days // 7 + 1)
    rows = _weekly_rows(session, user, since)

    groups = {e.id: e.muscle_group or "Outros" for e in session.scalars(select(Exercise))}
    weekly: dict[date, set[int]] = {s: set() for s in starts}
    per_group: dict[str, int] = defaultdict(int)
    for exercise_id, day, session_id in rows:
        start = _week_start(day)
        if start not in weekly:
            continue
        weekly[start].add(session_id)
        per_group[groups.get(exercise_id, "Outros")] += 1

    weekly_out = [{**_week_label(s), "treinos": len(weekly[s])} for s in starts]

    total = sum(per_group.values())
    muscles = sorted(
        ({"name": name, "sets": n, "pct": round(n / total * 100)} for name, n in per_group.items()),
        key=lambda m: m["sets"],
        reverse=True,
    )

    by_workout = _sessions_by_workout(session, user, since)

    all_days = set(session.scalars(select(WorkoutSession.local_date).where(WorkoutSession.user_id == user.id)))
    month_start = today.replace(day=1)
    streak, record = _streak_weeks(all_days, today)
    routine = active_routine(session, user.id)

    last_30 = today - timedelta(days=30)
    records_month = sum(1 for r in _exercise_records(session, user).values() if r["date"] >= last_30 and r["date"] > r["first"])

    return {
        "stats": {
            "days_trained_week": sum(1 for d in all_days if _week_start(today) <= d <= today),
            "days_planned_week": len(routine.workouts) if routine else 0,
            "records_month": records_month,
            "top_muscle": muscles[0] if muscles else None,
            "streak_weeks": streak,
            "streak_record_weeks": record,
        },
        "weekly": weekly_out,
        "muscles": muscles,
        "by_workout": by_workout,
        "calendar": {"month": month_start.strftime("%Y-%m"), "days": sorted(d.isoformat() for d in all_days if d >= month_start)},
    }


def exercises_with_data(session: Session, user: User) -> list[str]:
    """Exercícios que o usuário já registrou ou que estão na rotina ativa."""
    logged = set(session.scalars(active_sets(user.id).with_only_columns(SetLog.exercise_id).distinct()))
    routine = active_routine(session, user.id)
    if routine:
        logged |= {item.exercise_id for w in routine.workouts for item in w.exercises}
    if not logged:
        return []
    names = session.scalars(select(Exercise.canonical_name).where(Exercise.id.in_(logged)))
    return sorted(names, key=normalize)


def exercise_progress(session: Session, user: User, exercise_name: str, weeks: int = 12, now: datetime | None = None) -> dict | None:
    key = normalize(exercise_name)
    exercise = next(
        (e for e in session.scalars(select(Exercise)) if normalize(e.canonical_name) == key),
        None,
    )
    if exercise is None:
        alias = session.scalars(select(ExerciseAlias).where(ExerciseAlias.alias == key)).first()
        exercise = session.get(Exercise, alias.exercise_id) if alias else None
    if exercise is None:
        return None

    today = _today(user, now)
    since = _week_start(today) - timedelta(weeks=weeks - 1)
    rows = session.execute(
        active_sets(user.id)
        .with_only_columns(SetLog.reps, SetLog.weight_kg, WorkoutSession.local_date)
        .where(SetLog.exercise_id == exercise.id)
        .order_by(WorkoutSession.local_date, SetLog.id)
    ).all()
    best: dict[int, dict] = {}
    rm = Decimal(0)
    buckets: dict[date, Decimal] = {}
    for reps, kg, day in rows:
        _update_record(best, exercise.id, reps, kg, day)
        rm = max(rm, epley(kg, reps))
        if day >= since:
            start = _week_start(day)
            buckets[start] = max(buckets.get(start, Decimal(0)), kg)
    points = [{**_week_label(start), "kg": float(kg)} for start, kg in sorted(buckets.items())]
    record = best.get(exercise.id)
    return {
        "exercise": exercise.canonical_name,
        "points": points,
        "kg_change": round(points[-1]["kg"] - points[0]["kg"], 1) if points else None,
        "record": {"weight_kg": float(record["kg"]), "reps": record["reps"], "date": record["date"].isoformat()} if record else None,
        "rm_estimate": float(rm) if rows else None,
    }
