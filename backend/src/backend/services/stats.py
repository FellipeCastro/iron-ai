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

WEEKS_SHOWN = 6


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _week_label(start: date) -> dict:
    end = start + timedelta(days=6)
    fmt = lambda d: f"{d.day:02d}/{d.month:02d}"  # noqa: E731
    return {"week": fmt(start), "range": f"{fmt(start)} - {fmt(end)}", "week_start": start.isoformat()}


def _today(user: User, now: datetime | None) -> date:
    return local_session_date(now or datetime.now(UTC), user.timezone)


def recent_week_starts(today: date, count: int = WEEKS_SHOWN) -> list[date]:
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
        .with_only_columns(
            SetLog.exercise_id, SetLog.reps, SetLog.weight_kg, WorkoutSession.local_date, WorkoutSession.id
        )
        .where(WorkoutSession.local_date >= since)
    ).all()


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


def dashboard(session: Session, user: User, now: datetime | None = None) -> dict:
    today = _today(user, now)
    starts = recent_week_starts(today)
    rows = _weekly_rows(session, user, starts[0])

    weekly = {s: {"volume": Decimal(0), "sessions": set()} for s in starts}
    per_exercise: dict[int, dict[date, Decimal]] = defaultdict(dict)
    for exercise_id, reps, kg, day, session_id in rows:
        start = _week_start(day)
        if start not in weekly:
            continue
        weekly[start]["volume"] += Decimal(reps) * kg
        weekly[start]["sessions"].add(session_id)
        one_rm = epley(kg, reps)
        if one_rm > per_exercise[exercise_id].get(start, Decimal(0)):
            per_exercise[exercise_id][start] = one_rm

    weekly_out = [
        {**_week_label(s), "volume": float(weekly[s]["volume"]), "treinos": len(weekly[s]["sessions"])} for s in starts
    ]

    month_start = today.replace(day=1)
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    all_days = set(
        session.scalars(select(WorkoutSession.local_date).where(WorkoutSession.user_id == user.id))
    )
    in_month = sum(1 for d in all_days if d >= month_start)
    in_prev_month = sum(1 for d in all_days if prev_month_start <= d < month_start)
    streak, record = _streak_weeks(all_days, today)

    current_volume = weekly_out[-1]["volume"]
    previous_volume = weekly_out[-2]["volume"]
    volume_change = round((current_volume - previous_volume) / previous_volume * 100) if previous_volume else None

    # os 3 exercícios mais frequentes no período entram no gráfico de 1RM
    top = sorted(per_exercise, key=lambda e: len(per_exercise[e]), reverse=True)[:3]
    names = {e.id: e.canonical_name for e in session.scalars(select(Exercise).where(Exercise.id.in_(top)))} if top else {}
    series = [{"key": f"e{i}", "name": names[eid]} for i, eid in enumerate(top)]
    one_rm_data = []
    for start in starts:
        point = _week_label(start)
        for i, eid in enumerate(top):
            value = per_exercise[eid].get(start)
            point[f"e{i}"] = float(value) if value is not None else None
        one_rm_data.append(point)

    return {
        "stats": {
            "workouts_month": in_month,
            "workouts_month_change": in_month - in_prev_month,
            "volume_week": current_volume,
            "volume_week_change_pct": volume_change,
            "streak_weeks": streak,
            "streak_record_weeks": record,
        },
        "weekly": weekly_out,
        "one_rm": {"series": series, "data": one_rm_data},
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
        .where(SetLog.exercise_id == exercise.id, WorkoutSession.local_date >= since)
    ).all()
    buckets: dict[date, dict] = {}
    for reps, kg, day in rows:
        b = buckets.setdefault(_week_start(day), {"kg": Decimal(0), "rm": Decimal(0), "volume": Decimal(0)})
        b["kg"] = max(b["kg"], kg)
        b["rm"] = max(b["rm"], epley(kg, reps))
        b["volume"] += Decimal(reps) * kg
    points = [
        {**_week_label(start), "kg": float(b["kg"]), "rm": float(b["rm"]), "volume": float(b["volume"])}
        for start, b in sorted(buckets.items())
    ]
    summary = None
    if points:
        first, last = points[0], points[-1]
        summary = {
            "kg": last["kg"],
            "rm": last["rm"],
            "volume": last["volume"],
            "kg_change": round(last["kg"] - first["kg"], 1),
            "rm_change": round(last["rm"] - first["rm"], 1),
            "volume_change_pct": round((last["volume"] - first["volume"]) / first["volume"] * 100) if first["volume"] else None,
        }
    return {"exercise": exercise.canonical_name, "points": points, "summary": summary}
