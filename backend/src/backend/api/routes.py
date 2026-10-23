from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from backend.api import schemas
from backend.api.auth import current_user, get_db
from backend.config import settings
from backend.models.db import User
from backend.services import linking, stats, users, workouts

router = APIRouter()


def _me(db: Session, user: User) -> schemas.Me:
    link = users.get_link(db, user.id)
    return schemas.Me(
        id=user.id,
        name=user.name,
        email=user.email,
        timezone=user.timezone,
        linked=link is not None,
        telegram=schemas.TelegramInfo(linked_at=link.linked_at) if link else None,
        bot_username=settings.telegram_bot_username,
    )


@router.get("/me", response_model=schemas.Me)
def get_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _me(db, user)


@router.delete("/me", status_code=204)
def delete_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    clerk_id = user.clerk_id
    users.delete_account(db, user)
    try:
        users.delete_clerk_user(clerk_id)
    except Exception:  # os dados locais já foram apagados; a conta no Clerk pode ser removida depois
        pass
    return Response(status_code=204)


@router.post("/link-code", response_model=schemas.LinkCodeOut)
def create_link_code(user: User = Depends(current_user), db: Session = Depends(get_db)):
    code, expires_at = linking.create_link_code(db, user)
    return schemas.LinkCodeOut(
        code=code,
        expires_at=expires_at,
        deep_link=f"https://t.me/{settings.telegram_bot_username}?start={code}",
        bot_username=settings.telegram_bot_username,
    )


def _target_out(number: int, target) -> schemas.TargetOut:
    if target is None:
        return schemas.TargetOut(set=number, reps=None, kg=None)
    return schemas.TargetOut(set=number, reps=target.reps, kg=float(target.weight_kg))


def _routine_out(db: Session, user: User) -> schemas.RoutineOut:
    routine = workouts.active_routine(db, user.id)
    nxt = workouts.next_workout(db, user.id)
    targets = workouts.current_targets(db, user.id)
    out = []
    for w in routine.workouts if routine else []:
        exercises = []
        for item in w.exercises:
            exercises.append(
                schemas.RoutineExerciseOut(
                    exercise_id=item.exercise_id,
                    name=item.exercise.canonical_name,
                    group=item.exercise.muscle_group,
                    sets=item.sets_count,
                    targets=[_target_out(n, targets.get((item.exercise_id, n))) for n in range(1, item.sets_count + 1)],
                )
            )
        out.append(
            schemas.WorkoutOut(
                id=w.id,
                letter=workouts.workout_letter(w.position),
                name=w.name,
                focus=workouts.workout_focus(w),
                weekday=w.weekday_hint,
                exercises=exercises,
            )
        )
    return schemas.RoutineOut(workouts=out, next_workout_id=nxt.id if nxt else None, reminder_time=user.reminder_time)


@router.get("/routine", response_model=schemas.RoutineOut)
def get_routine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _routine_out(db, user)


@router.put("/routine", response_model=schemas.RoutineOut)
def put_routine(body: schemas.RoutineIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    specs, ambiguous = workouts.build_specs(db, user.id, [w.model_dump() for w in body.workouts])
    if ambiguous:
        raise HTTPException(status_code=422, detail={"message": "Exercício ambíguo", "ambiguous": ambiguous})
    try:
        workouts.save_routine(db, user.id, specs)
    except workouts.ServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _routine_out(db, user)


@router.get("/sessions", response_model=list[schemas.SessionOut])
def get_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return stats.list_sessions(db, user, limit, offset)


@router.get("/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(
    months: int = Query(2),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if months not in (1, 2, 3, 6):
        raise HTTPException(status_code=422, detail="months deve ser 1, 2, 3 ou 6")
    return stats.dashboard(db, user, months=months)


@router.get("/records", response_model=list[schemas.RecordOut])
def get_records(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return stats.records(db, user)


@router.get("/exercises", response_model=list[str])
def get_exercises(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return stats.exercises_with_data(db, user)


@router.get("/progress/{exercise}", response_model=schemas.ProgressOut)
def get_progress(exercise: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    result = stats.exercise_progress(db, user, exercise)
    if result is None:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    return result


def _settings_out(user: User) -> schemas.SettingsOut:
    return schemas.SettingsOut(
        reminder_time=user.reminder_time,
        weight_increment_kg=float(user.weight_increment_kg),
        timezone=user.timezone,
    )


@router.get("/settings", response_model=schemas.SettingsOut)
def get_settings(user: User = Depends(current_user)):
    return _settings_out(user)


@router.put("/settings", response_model=schemas.SettingsOut)
def put_settings(body: schemas.SettingsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        users.update_settings(
            db, user, body.reminder_time.replace(second=0, microsecond=0) if body.reminder_time else None,
            Decimal(str(body.weight_increment_kg)), body.timezone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _settings_out(user)
