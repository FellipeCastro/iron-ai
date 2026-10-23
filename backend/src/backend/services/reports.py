"""Relatórios: resumo pós-treino e evolução por exercício ou grupo muscular.

Tudo aqui devolve fatos (números já calculados); o texto do resumo pós-treino é montado em
format_session_summary e o dos relatórios sob demanda é redigido pelo LLM a partir destes dicts.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.domain.one_rm import epley
from backend.domain.sessions import local_session_date
from backend.domain.volume import volume
from backend.models.db import Exercise, SetLog, User, WorkoutSession
from backend.services.catalog import normalize, resolve_exercise
from backend.services.workouts import (
    WEEKDAYS,
    active_sets,
    next_workout,
    workout_letter,
)

PERIOD_DAYS = {"30d": 30, "90d": 90, "all": None}
IDLE_MINUTES = 45  # sem série há tanto tempo = treino encerrado


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _kg(value: Decimal | float) -> float:
    return round(float(value), 2)


# --- resumo pós-treino ------------------------------------------------------------------------


def session_summary(session: Session, user: User, session_id: int) -> dict:
    ws = session.get(WorkoutSession, session_id)
    if ws is None or ws.user_id != user.id:
        return {"status": "no_session"}
    logs = session.scalars(
        active_sets(user.id).where(SetLog.session_id == ws.id).order_by(SetLog.id)
    ).all()
    if not logs:
        return {"status": "no_sets"}

    total_volume = volume([(s.reps, s.weight_kg) for s in logs])
    minutes = round((max(s.created_at for s in logs) - min(s.created_at for s in logs)).total_seconds() / 60)

    with_target = [s for s in logs if s.target_reps is not None]
    hit = sum(1 for s in with_target if s.reps >= s.target_reps and s.weight_kg >= s.target_kg)

    best_now: dict[int, tuple[Decimal, int]] = {}
    for s in logs:
        best_now[s.exercise_id] = max(best_now.get(s.exercise_id, (Decimal(0), 0)), (s.weight_kg, s.reps))
    prior = session.execute(
        active_sets(user.id)
        .with_only_columns(SetLog.exercise_id, SetLog.weight_kg, SetLog.reps)
        .where(SetLog.exercise_id.in_(best_now), WorkoutSession.local_date < ws.local_date)
    ).all()
    best_before: dict[int, tuple[Decimal, int]] = {}
    for exercise_id, kg, reps in prior:
        best_before[exercise_id] = max(best_before.get(exercise_id, (Decimal(0), 0)), (kg, reps))
    names = {e.id: e.canonical_name for e in session.scalars(select(Exercise).where(Exercise.id.in_(best_now)))}
    records = [
        {"exercise": names[eid], "kg": _kg(kg), "reps": reps}
        for eid, (kg, reps) in best_now.items()
        if eid in best_before and (kg, reps) > best_before[eid]
    ]

    missed: dict[int, SetLog] = {}
    for s in with_target:
        if not (s.reps >= s.target_reps and s.weight_kg >= s.target_kg):
            missed.setdefault(s.exercise_id, s)

    volume_change_pct = None
    if ws.workout_id is not None:
        previous_id = session.scalars(
            select(WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user.id,
                WorkoutSession.workout_id == ws.workout_id,
                WorkoutSession.local_date < ws.local_date,
            )
            .order_by(WorkoutSession.local_date.desc())
            .limit(1)
        ).first()
        if previous_id is not None:
            prev_logs = session.scalars(active_sets(user.id).where(SetLog.session_id == previous_id)).all()
            prev_volume = volume([(s.reps, s.weight_kg) for s in prev_logs])
            if prev_volume > 0:
                volume_change_pct = round(float((total_volume - prev_volume) / prev_volume * 100))

    nxt = next_workout(session, user.id)
    return {
        "status": "ok",
        "letter": workout_letter(ws.workout.position) if ws.workout else None,
        "workout": ws.workout.name if ws.workout else None,
        "minutes": minutes,
        "sets": len(logs),
        "volume": _kg(total_volume),
        "volume_change_pct": volume_change_pct,
        "targets_hit": hit,
        "targets_total": len(with_target),
        "records": records,
        "missed": [
            {"exercise": names[eid], "reps": s.target_reps, "kg": _kg(s.target_kg)}
            for eid, s in list(missed.items())[:2]
        ],
        "next_workout": (
            {
                "letter": workout_letter(nxt.position),
                "name": nxt.name,
                "weekday": WEEKDAYS[nxt.weekday_hint] if nxt.weekday_hint is not None else None,
            }
            if nxt
            else None
        ),
    }


def format_session_summary(s: dict) -> str:
    title = f"Treino {s['letter']} concluído!" if s["letter"] else "Treino concluído!"
    lines = [f"{title} 🔥" + (f" ({s['minutes']} min)" if s["minutes"] else "")]
    volume_line = f"• {s['sets']} séries · {s['volume']:g}kg de volume"
    if s["volume_change_pct"] is not None:
        volume_line += f" ({s['volume_change_pct']:+d}% vs última vez)"
    lines.append(volume_line)
    if s["targets_total"]:
        lines.append(f"• Metas batidas: {s['targets_hit']}/{s['targets_total']}")
    for record in s["records"]:
        lines.append(f"• Recorde: {record['exercise']} {record['reps']}x{record['kg']:g}kg 🏆")
    for miss in s["missed"]:
        lines.append(f"• Pra próxima: {miss['exercise']} segue em {miss['reps']}x{miss['kg']:g}kg")
    nxt = s["next_workout"]
    if nxt:
        when = f" — {nxt['weekday']}" if nxt["weekday"] else ""
        lines.append(f"Próximo treino: {nxt['letter']} ({nxt['name']}){when}.")
    return "\n".join(lines)


def finish_today(session: Session, user: User, now: datetime | None = None) -> dict:
    """Encerra a sessão de hoje a pedido do usuário. O resumo só sai uma vez por sessão."""
    now = now or datetime.now(UTC)
    ws = session.scalars(
        select(WorkoutSession).where(
            WorkoutSession.user_id == user.id,
            WorkoutSession.local_date == local_session_date(now, user.timezone),
        )
    ).first()
    if ws is None:
        return {"status": "no_session"}
    summary = session_summary(session, user, ws.id)
    if summary["status"] != "ok":
        return summary
    if ws.summary_sent_at is not None:
        return {"status": "already_sent"}
    ws.summary_sent_at = now
    return summary


def idle_sessions_without_summary(session: Session, now: datetime) -> list[tuple[int, int]]:
    """(user_id, session_id) das sessões com série, sem resumo enviado e paradas há IDLE_MINUTES."""
    rows = session.execute(
        select(WorkoutSession.user_id, WorkoutSession.id, SetLog.created_at)
        .join(SetLog, SetLog.session_id == WorkoutSession.id)
        .where(WorkoutSession.summary_sent_at.is_(None))
    ).all()
    last: dict[tuple[int, int], datetime] = {}
    for user_id, session_id, created_at in rows:
        key = (user_id, session_id)
        last[key] = max(last.get(key, created_at), created_at)
    limit = now - timedelta(minutes=IDLE_MINUTES)
    return [key for key, at in last.items() if at <= limit]


# --- relatórios sob demanda -------------------------------------------------------------------


def _since(days: int | None, now: datetime | None, user: User) -> date | None:
    if days is None:
        return None
    return local_session_date(now or datetime.now(UTC), user.timezone) - timedelta(days=days)


def _trend(weekly_volume: list[float]) -> str:
    if len(weekly_volume) < 2:
        return "estável"
    half = len(weekly_volume) // 2
    first = sum(weekly_volume[:half]) / half
    second = sum(weekly_volume[half:]) / (len(weekly_volume) - half)
    if first == 0:
        return "estável"
    change = (second - first) / first
    return "subindo" if change > 0.05 else "caindo" if change < -0.05 else "estável"


def exercise_report(
    session: Session, user: User, exercise_name: str, period: str = "90d", now: datetime | None = None
) -> dict:
    resolution = resolve_exercise(session, user.id, exercise_name, create=False)
    if resolution.status != "ok":
        return {"status": "ambiguous", "typed": exercise_name, "options": resolution.options}
    exercise = resolution.exercise
    since = _since(PERIOD_DAYS.get(period, 90), now, user)

    query = (
        active_sets(user.id)
        .with_only_columns(SetLog.reps, SetLog.weight_kg, WorkoutSession.local_date)
        .where(SetLog.exercise_id == exercise.id)
        .order_by(WorkoutSession.local_date, SetLog.id)
    )
    if since:
        query = query.where(WorkoutSession.local_date >= since)
    rows = session.execute(query).all()
    if not rows:
        return {"status": "no_data", "exercise": exercise.canonical_name, "period": period}

    days = sorted({day for _, _, day in rows})
    by_week: dict[date, Decimal] = defaultdict(Decimal)
    max_kg_by_day: dict[date, Decimal] = {}
    record = (Decimal(0), 0, rows[0][2])
    best_rm = Decimal(0)
    for reps, kg, day in rows:
        by_week[_week_start(day)] += Decimal(reps) * kg
        max_kg_by_day[day] = max(max_kg_by_day.get(day, Decimal(0)), kg)
        if (kg, reps) > (record[0], record[1]):
            record = (kg, reps, day)
        best_rm = max(best_rm, epley(kg, reps))

    first_kg, last_kg = max_kg_by_day[days[0]], max_kg_by_day[days[-1]]
    change_pct = round(float((last_kg - first_kg) / first_kg * 100)) if first_kg > 0 else None
    weeks_span = max(1, (_week_start(days[-1]) - _week_start(days[0])).days // 7 + 1)
    weekly_volume = [float(by_week.get(_week_start(days[0]) + timedelta(weeks=i), 0)) for i in range(weeks_span)]

    # semanas desde o início da sequência final de sessões com a mesma carga máxima
    streak_start = days[-1]
    for day in reversed(days):
        if max_kg_by_day[day] != last_kg:
            break
        streak_start = day
    stagnant_weeks = (days[-1] - streak_start).days // 7

    return {
        "status": "ok",
        "exercise": exercise.canonical_name,
        "period": period,
        "first_kg": _kg(first_kg),
        "last_kg": _kg(last_kg),
        "change_pct": change_pct,
        "record": {"kg": _kg(record[0]), "reps": record[1], "date": record[2].isoformat()},
        "one_rm": _kg(best_rm),
        "sessions": len(days),
        "sessions_per_week": round(len(days) / weeks_span, 1),
        "avg_weekly_volume": _kg(sum(weekly_volume) / len(weekly_volume)),
        "volume_trend": _trend(weekly_volume),
        "stagnant_weeks": stagnant_weeks,
    }


def resolve_group(session: Session, text: str) -> str | None:
    """Casa 'peito', 'costas' etc. com um muscle_group do catálogo, ignorando acento e caixa."""
    key = normalize(text)
    groups = {g for g in session.scalars(select(Exercise.muscle_group).distinct()) if g}
    exact = next((g for g in groups if normalize(g) == key), None)
    if exact:
        return exact
    return next((g for g in sorted(groups) if key and (key in normalize(g) or normalize(g) in key)), None)


def muscle_group_report(
    session: Session, user: User, group_name: str, period: str = "30d", now: datetime | None = None
) -> dict:
    group = resolve_group(session, group_name)
    if group is None:
        known = sorted({g for g in session.scalars(select(Exercise.muscle_group).distinct()) if g})
        return {"status": "unknown_group", "typed": group_name, "options": known}
    since = _since(PERIOD_DAYS.get(period, 30), now, user)

    query = (
        active_sets(user.id)
        .with_only_columns(SetLog.exercise_id, SetLog.reps, SetLog.weight_kg, WorkoutSession.local_date)
        .order_by(WorkoutSession.local_date, SetLog.id)
    )
    if since:
        query = query.where(WorkoutSession.local_date >= since)
    rows = session.execute(query).all()
    catalog = {e.id: e for e in session.scalars(select(Exercise))}
    mine = [r for r in rows if catalog[r[0]].muscle_group == group]
    if not mine:
        return {"status": "no_data", "group": group, "period": period}

    total_volume = volume([(r[1], r[2]) for r in rows])
    group_volume = volume([(r[1], r[2]) for r in mine])
    per_exercise: dict[int, dict] = {}
    for exercise_id, _reps, kg, day in mine:
        item = per_exercise.setdefault(exercise_id, {"sets": 0, "max_kg_by_day": {}})
        item["sets"] += 1
        item["max_kg_by_day"][day] = max(item["max_kg_by_day"].get(day, Decimal(0)), kg)
    exercises = []
    for eid, item in per_exercise.items():
        by_day = item["max_kg_by_day"]
        days = sorted(by_day)
        first_kg, last_kg = by_day[days[0]], by_day[days[-1]]
        exercises.append(
            {
                "exercise": catalog[eid].canonical_name,
                "sets": item["sets"],
                "last_kg": _kg(last_kg),
                "change_kg": _kg(last_kg - first_kg),
            }
        )
    exercises.sort(key=lambda e: e["sets"], reverse=True)
    return {
        "status": "ok",
        "group": group,
        "period": period,
        "sessions": len({r[3] for r in mine}),
        "sets": len(mine),
        "volume": _kg(group_volume),
        "volume_share_pct": round(float(group_volume / total_volume * 100)) if total_volume > 0 else None,
        "exercises": exercises,
        "least_trained": exercises[-1]["exercise"] if len(exercises) > 1 else None,
    }
