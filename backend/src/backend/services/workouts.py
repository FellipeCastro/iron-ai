from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, aliased, selectinload

from backend.domain.one_rm import epley
from backend.domain.progression import Target as ProgTarget
from backend.domain.progression import next_target
from backend.domain.sessions import local_session_date
from backend.domain.volume import volume
from backend.models.db import (
    Exercise,
    Routine,
    SetLog,
    Target,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSession,
)
from backend.services.catalog import resolve_exercise

WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


class ServiceError(Exception):
    """Erro de regra de negócio que o agente pode explicar ao usuário."""


def _dec(value: float | Decimal | str) -> Decimal:
    return Decimal(str(value))


# --- rotina ---------------------------------------------------------------------------------


def active_routine(session: Session, user_id: int) -> Routine | None:
    return session.scalars(
        select(Routine)
        .where(Routine.user_id == user_id, Routine.active)
        .options(selectinload(Routine.workouts).selectinload(Workout.exercises).selectinload(WorkoutExercise.exercise))
    ).first()


def workout_letter(position: int) -> str:
    return chr(ord("A") + position)


def workout_focus(workout: Workout) -> str:
    groups: list[str] = []
    for item in workout.exercises:
        group = item.exercise.muscle_group
        if group and group not in groups:
            groups.append(group)
    if not groups:
        return ""
    text = groups[0] if len(groups) == 1 else ", ".join(groups[:-1]) + " e " + groups[-1]
    return text[:1] + text[1:].lower() if len(groups) > 1 else text


def next_workout(session: Session, user_id: int) -> Workout | None:
    """O seguinte ao último treino da rotina ativa registrado; o primeiro se ainda não houve nenhum."""
    routine = active_routine(session, user_id)
    if routine is None or not routine.workouts:
        return None
    ids = [w.id for w in routine.workouts]
    last_workout_id = session.scalars(
        select(WorkoutSession.workout_id)
        .where(WorkoutSession.user_id == user_id, WorkoutSession.workout_id.in_(ids))
        .order_by(WorkoutSession.local_date.desc(), WorkoutSession.id.desc())
        .limit(1)
    ).first()
    if last_workout_id is None:
        return routine.workouts[0]
    index = ids.index(last_workout_id)
    return routine.workouts[(index + 1) % len(ids)]


def current_targets(session: Session, user_id: int) -> dict[tuple[int, int], Target]:
    rows = session.scalars(select(Target).where(Target.user_id == user_id))
    return {(t.exercise_id, t.set_number): t for t in rows}


@dataclass
class ExerciseSpec:
    exercise_id: int
    name: str
    sets: int = 3


@dataclass
class WorkoutSpec:
    name: str
    exercises: list[ExerciseSpec] = field(default_factory=list)
    weekday: int | None = None


def routine_specs_to_payload(specs: list[WorkoutSpec]) -> dict:
    return {
        "workouts": [
            {
                "name": w.name,
                "weekday": w.weekday,
                "exercises": [{"exercise_id": e.exercise_id, "name": e.name, "sets": e.sets} for e in w.exercises],
            }
            for w in specs
        ]
    }


def payload_to_routine_specs(payload: dict) -> list[WorkoutSpec]:
    return [
        WorkoutSpec(
            name=w["name"],
            weekday=w.get("weekday"),
            exercises=[ExerciseSpec(e["exercise_id"], e["name"], e["sets"]) for e in w["exercises"]],
        )
        for w in payload["workouts"]
    ]


def save_routine(session: Session, user_id: int, specs: list[WorkoutSpec]) -> Routine:
    """Troca a rotina ativa. A anterior fica inativa para preservar o histórico das sessões."""
    if not specs or any(not w.exercises for w in specs):
        raise ServiceError("A rotina precisa ter ao menos um treino com exercícios.")
    old = session.scalars(select(Routine).where(Routine.user_id == user_id, Routine.active)).first()
    if old:
        old.active = False
        session.flush()
    routine = Routine(user_id=user_id, active=True)
    for position, spec in enumerate(specs):
        workout = Workout(name=spec.name, position=position, weekday_hint=spec.weekday)
        for index, item in enumerate(spec.exercises):
            workout.exercises.append(
                WorkoutExercise(exercise_id=item.exercise_id, position=index, sets_count=max(1, min(item.sets, 10)))
            )
        routine.workouts.append(workout)
    session.add(routine)
    session.flush()
    return routine


def describe_routine(specs: list[WorkoutSpec]) -> str:
    lines = []
    for position, w in enumerate(specs):
        day = f" ({WEEKDAYS[w.weekday]})" if w.weekday is not None else ""
        lines.append(f"Treino {workout_letter(position)} - {w.name}{day}")
        lines.extend(f"  • {e.name}: {e.sets} séries" for e in w.exercises)
    return "\n".join(lines)


def build_specs(session: Session, user_id: int, raw: list[dict]) -> tuple[list[WorkoutSpec], list[dict]]:
    """Resolve nomes de exercícios. Devolve as specs e os nomes ambíguos que precisam de esclarecimento."""
    specs: list[WorkoutSpec] = []
    ambiguous: list[dict] = []
    for w in raw:
        spec = WorkoutSpec(name=w["name"], weekday=w.get("weekday"))
        for item in w["exercises"]:
            resolution = resolve_exercise(session, user_id, item["name"])
            if resolution.status == "ambiguous":
                ambiguous.append({"typed": item["name"], "options": resolution.options})
                continue
            spec.exercises.append(ExerciseSpec(resolution.exercise.id, resolution.exercise.canonical_name, item.get("sets", 3)))
        specs.append(spec)
    return specs, ambiguous


# --- sessões e séries -------------------------------------------------------------------------


def _superseded(model=SetLog):
    other = aliased(SetLog)
    return exists().where(other.supersedes_id == model.id)


def active_sets(user_id: int):
    """Séries em vigor (não substituídas por uma correção) do usuário."""
    return (
        select(SetLog)
        .join(WorkoutSession, WorkoutSession.id == SetLog.session_id)
        .where(WorkoutSession.user_id == user_id, ~_superseded())
    )


def _workout_for_new_session(session: Session, user_id: int, exercise_id: int) -> Workout | None:
    routine = active_routine(session, user_id)
    nxt = next_workout(session, user_id)
    if routine is None or nxt is None:
        return None
    start = routine.workouts.index(nxt)
    ordered = routine.workouts[start:] + routine.workouts[:start]
    for workout in ordered:
        if any(item.exercise_id == exercise_id for item in workout.exercises):
            return workout
    return None


def get_or_create_session(session: Session, user: User, exercise_id: int, now: datetime) -> WorkoutSession:
    day = local_session_date(now, user.timezone)
    found = session.scalars(
        select(WorkoutSession).where(WorkoutSession.user_id == user.id, WorkoutSession.local_date == day)
    ).first()
    if found:
        return found
    workout = _workout_for_new_session(session, user.id, exercise_id)
    created = WorkoutSession(user_id=user.id, workout_id=workout.id if workout else None, local_date=day, started_at=now)
    session.add(created)
    session.flush()
    return created


def _target_dict(reps: int, kg: Decimal) -> dict:
    return {"reps": reps, "kg": float(kg)}


def _upsert_target(session: Session, user_id: int, exercise_id: int, set_number: int, new: ProgTarget) -> None:
    row = session.get(Target, (user_id, exercise_id, set_number))
    if row is None:
        session.add(Target(user_id=user_id, exercise_id=exercise_id, set_number=set_number, reps=new.reps, weight_kg=new.kg))
    else:
        row.reps, row.weight_kg = new.reps, new.kg
    session.flush()


def _in_workout(session: Session, workout_id: int | None, exercise_id: int) -> bool:
    if workout_id is None:
        return False
    return bool(
        session.scalars(
            select(WorkoutExercise.id).where(WorkoutExercise.workout_id == workout_id, WorkoutExercise.exercise_id == exercise_id)
        ).first()
    )


def log_set(
    session: Session,
    user: User,
    exercise_name: str,
    reps: int,
    kg: float | Decimal,
    set_number: int | None = None,
    now: datetime | None = None,
) -> dict:
    """Registra uma série e atualiza a meta pela progressão. Devolve fatos para o LLM redigir a resposta."""
    now = now or datetime.now(UTC)
    if reps < 1 or reps > 100:
        raise ServiceError("Repetições inválidas.")
    weight = _dec(kg)
    if weight < 0 or weight > 1000:
        raise ServiceError("Carga inválida.")

    resolution = resolve_exercise(session, user.id, exercise_name)
    if resolution.status == "ambiguous":
        return {"status": "ambiguous", "typed": exercise_name, "options": resolution.options}
    exercise = resolution.exercise

    workout_session = get_or_create_session(session, user, exercise.id, now)
    if set_number is None:
        done = session.scalars(
            active_sets(user.id).where(SetLog.session_id == workout_session.id, SetLog.exercise_id == exercise.id)
        ).all()
        set_number = len(done) + 1

    previous = session.get(Target, (user.id, exercise.id, set_number))
    target_before = ProgTarget(previous.reps, previous.weight_kg) if previous else None
    session.add(
        SetLog(
            session_id=workout_session.id,
            exercise_id=exercise.id,
            set_number=set_number,
            reps=reps,
            weight_kg=weight,
            target_reps=target_before.reps if target_before else None,
            target_kg=target_before.kg if target_before else None,
            created_at=now,
        )
    )
    # sem meta, a própria série vira a base da progressão
    baseline = target_before or ProgTarget(reps, weight)
    new_target = next_target(baseline, reps, weight, user.weight_increment_kg)
    _upsert_target(session, user.id, exercise.id, set_number, new_target)

    hit = bool(target_before) and reps >= target_before.reps and weight >= target_before.kg
    return {
        "status": "ok",
        "exercise": exercise.canonical_name,
        "set_number": set_number,
        "reps": reps,
        "kg": float(weight),
        "one_rm": float(epley(weight, reps)),
        "target_before": _target_dict(target_before.reps, target_before.kg) if target_before else None,
        "hit_target": hit if target_before else None,
        "next_target": _target_dict(new_target.reps, new_target.kg),
        "is_new_exercise": resolution.status == "new" or target_before is None,
        "off_routine": not _in_workout(session, workout_session.workout_id, exercise.id),
        "workout": workout_session.workout.name if workout_session.workout else None,
        "session_date": workout_session.local_date.isoformat(),
    }


def last_active_set(session: Session, user_id: int) -> SetLog | None:
    return session.scalars(active_sets(user_id).order_by(SetLog.created_at.desc(), SetLog.id.desc()).limit(1)).first()


def correct_last_set(
    session: Session,
    user: User,
    reps: int | None = None,
    kg: float | Decimal | None = None,
    exercise_name: str | None = None,
    now: datetime | None = None,
) -> dict:
    """Corrige a última série: cria uma nova linha que substitui a anterior e refaz a meta."""
    now = now or datetime.now(UTC)
    last = last_active_set(session, user.id)
    if last is None:
        return {"status": "nothing_to_correct"}
    if reps is None and kg is None and not exercise_name:
        return {"status": "needs_clarification", "last": _set_dict(last)}

    exercise = last.exercise
    if exercise_name:
        resolution = resolve_exercise(session, user.id, exercise_name)
        if resolution.status == "ambiguous":
            return {"status": "ambiguous", "typed": exercise_name, "options": resolution.options}
        exercise = resolution.exercise
    new_reps = reps if reps is not None else last.reps
    new_kg = _dec(kg) if kg is not None else last.weight_kg
    if new_reps < 1 or new_reps > 100 or new_kg < 0 or new_kg > 1000:
        raise ServiceError("Valores inválidos.")

    old_dict = _set_dict(last)
    target_before = ProgTarget(last.target_reps, last.target_kg) if last.target_reps is not None else None

    if exercise.id != last.exercise_id:
        # a série pertencia a outro exercício: devolve a meta anterior dele
        old_row = session.get(Target, (user.id, last.exercise_id, last.set_number))
        if target_before is None:
            if old_row:
                session.delete(old_row)
        else:
            _upsert_target(session, user.id, last.exercise_id, last.set_number, target_before)
        current = session.get(Target, (user.id, exercise.id, last.set_number))
        target_before = ProgTarget(current.reps, current.weight_kg) if current else None

    corrected = SetLog(
        session_id=last.session_id,
        exercise_id=exercise.id,
        set_number=last.set_number,
        reps=new_reps,
        weight_kg=new_kg,
        target_reps=target_before.reps if target_before else None,
        target_kg=target_before.kg if target_before else None,
        supersedes_id=last.id,
        created_at=now,
    )
    session.add(corrected)
    baseline = target_before or ProgTarget(new_reps, new_kg)
    new_target = next_target(baseline, new_reps, new_kg, user.weight_increment_kg)
    _upsert_target(session, user.id, exercise.id, last.set_number, new_target)
    session.flush()
    return {
        "status": "ok",
        "before": old_dict,
        "after": _set_dict(corrected, exercise),
        "next_target": _target_dict(new_target.reps, new_target.kg),
    }


def _set_dict(row: SetLog, exercise: Exercise | None = None) -> dict:
    return {
        "exercise": (exercise or row.exercise).canonical_name,
        "set_number": row.set_number,
        "reps": row.reps,
        "kg": float(row.weight_kg),
    }


def next_workout_summary(session: Session, user: User) -> dict:
    workout = next_workout(session, user.id)
    if workout is None:
        return {"status": "no_routine"}
    targets = current_targets(session, user.id)
    exercises = []
    for item in workout.exercises:
        sets = []
        for number in range(1, item.sets_count + 1):
            t = targets.get((item.exercise_id, number))
            sets.append({"set": number, "reps": t.reps if t else None, "kg": float(t.weight_kg) if t else None})
        exercises.append({"name": item.exercise.canonical_name, "sets": sets})
    letter = workout_letter(workout.position)
    return {"status": "ok", "letter": letter, "name": workout.name, "exercises": exercises}


# --- consultas -------------------------------------------------------------------------------


def exercise_history(session: Session, user_id: int, exercise_id: int, limit: int = 8) -> list[dict]:
    rows = session.execute(
        active_sets(user_id)
        .with_only_columns(SetLog.reps, SetLog.weight_kg, SetLog.set_number, WorkoutSession.local_date)
        .where(SetLog.exercise_id == exercise_id)
        .order_by(WorkoutSession.local_date.desc(), SetLog.set_number)
    ).all()
    by_day: dict = {}
    for reps, kg, set_number, day in rows:
        by_day.setdefault(day, []).append((set_number, reps, kg))
    history = []
    for day in list(by_day)[:limit]:
        sets = by_day[day]
        history.append(
            {
                "date": day.isoformat(),
                "sets": [{"set": n, "reps": r, "kg": float(k)} for n, r, k in sets],
                "best_kg": float(max(k for _, _, k in sets)),
                "best_one_rm": float(max(epley(k, r) for _, r, k in sets)),
                "volume": float(volume([(r, k) for _, r, k in sets])),
            }
        )
    return history


def progress_summary(session: Session, user: User, exercise_name: str) -> dict:
    resolution = resolve_exercise(session, user.id, exercise_name, create=False)
    if resolution.status != "ok":
        return {"status": "ambiguous", "typed": exercise_name, "options": resolution.options}
    history = exercise_history(session, user.id, resolution.exercise.id)
    if not history:
        return {"status": "no_data", "exercise": resolution.exercise.canonical_name}
    targets = [
        {"set": t.set_number, "reps": t.reps, "kg": float(t.weight_kg)}
        for t in session.scalars(
            select(Target)
            .where(Target.user_id == user.id, Target.exercise_id == resolution.exercise.id)
            .order_by(Target.set_number)
        )
    ]
    return {
        "status": "ok",
        "exercise": resolution.exercise.canonical_name,
        "sessions_newest_first": history,
        "current_targets": targets,
    }
