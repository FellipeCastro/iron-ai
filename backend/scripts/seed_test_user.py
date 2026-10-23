"""Cria (ou recria) um usuário de teste com rotina, histórico de séries e metas já registrados.

Sem o ngrok o webhook do Clerk não chega, então o usuário só nasce na primeira chamada autenticada.
Este script antecipa isso: informe o clerk_id da conta que você usa no login (Clerk Dashboard > Users)
e os dados de teste passam a aparecer nessa conta.

    uv run python scripts/seed_test_user.py --clerk-id user_xxx
    uv run python scripts/seed_test_user.py --clerk-id user_xxx --telegram-id 123456789
    uv run python scripts/seed_test_user.py --clerk-id user_xxx --reset
"""

import argparse
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from backend.models.db import ChannelLink, User
from backend.services import workouts
from backend.services.catalog import resolve_exercise, seed_catalog
from backend.services.users import delete_account
from backend.utils.database import SessionLocal

TZ = "America/Sao_Paulo"
WEEKS = 4

# treino -> exercícios (nome, séries, reps, carga inicial em kg, ganho de carga por semana)
PLAN = {
    "Peito e tríceps": [
        ("Supino reto", 3, 10, 60, 2.5),
        ("Supino inclinado com halteres", 3, 10, 22, 1),
        ("Tríceps corda", 3, 12, 25, 2.5),
    ],
    "Costas e bíceps": [
        ("Puxada frontal", 3, 10, 55, 2.5),
        ("Remada baixa", 3, 10, 50, 2.5),
        ("Rosca direta", 3, 10, 25, 1.25),
    ],
    "Pernas": [
        ("Agachamento livre", 3, 8, 70, 5),
        ("Leg press", 3, 12, 160, 10),
        ("Mesa flexora", 3, 12, 40, 2.5),
    ],
}


def _specs(session, user_id: int) -> list[workouts.WorkoutSpec]:
    specs = []
    for weekday, (name, items) in zip((0, 2, 4), PLAN.items(), strict=True):
        spec = workouts.WorkoutSpec(name=name, weekday=weekday)
        for exercise_name, sets, *_ in items:
            exercise = resolve_exercise(session, user_id, exercise_name).exercise
            spec.exercises.append(workouts.ExerciseSpec(exercise.id, exercise.canonical_name, sets))
        specs.append(spec)
    return specs


def _training_days() -> list[tuple[datetime, str]]:
    """Segunda, quarta e sexta das últimas semanas, até ontem, às 18h locais, do mais antigo ao mais novo."""
    zone = ZoneInfo(TZ)
    today = datetime.now(zone).date()
    start = today - timedelta(days=7 * WEEKS)
    days = []
    for offset in range(7 * WEEKS):
        day = start + timedelta(days=offset)
        if day < today and day.weekday() in (0, 2, 4):
            moment = datetime.combine(day, time(18, 0), zone).astimezone(UTC)
            days.append((moment, list(PLAN)[(0, 2, 4).index(day.weekday())]))
    return days


def _log_history(session, user: User) -> int:
    count = 0
    for week_index, (moment, workout_name) in enumerate(_training_days()):
        week = week_index // 3
        for exercise_name, sets, reps, kg, step in PLAN[workout_name]:
            for number in range(1, sets + 1):
                load = Decimal(str(kg + step * week))
                # a última série de cada exercício costuma ficar 1 repetição abaixo
                done = reps - 1 if number == sets and week % 2 else reps
                workouts.log_set(
                    session, user, exercise_name, done, load, now=moment + timedelta(minutes=count % 40)
                )
                count += 1
    return count


def seed(clerk_id: str, telegram_id: str | None, reset: bool) -> None:
    with SessionLocal.begin() as session:
        seed_catalog(session)
        user = session.scalars(select(User).where(User.clerk_id == clerk_id)).first()
        if user and reset:
            delete_account(session, user)
            session.flush()
            user = None
        if user is None:
            user = User(
                clerk_id=clerk_id,
                email="teste@iron.local",
                name="Usuário de Teste",
                timezone=TZ,
                reminder_time=time(18, 0),
                weight_increment_kg=Decimal("2.5"),
            )
            session.add(user)
            session.flush()
        elif workouts.active_routine(session, user.id):
            print(f"Usuário {clerk_id} já tem rotina. Use --reset para recriar.")
            return

        workouts.save_routine(session, user.id, _specs(session, user.id))
        logged = _log_history(session, user)

        if telegram_id and not session.scalars(select(ChannelLink).where(ChannelLink.user_id == user.id)).first():
            session.add(ChannelLink(user_id=user.id, channel="telegram", external_id=telegram_id))

        print(f"Usuário de teste pronto: id={user.id} clerk_id={clerk_id}")
        print(f"  rotina: {len(PLAN)} treinos | séries registradas: {logged}")
        print(f"  telegram: {telegram_id or 'não vinculado (use /vincular no site)'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--clerk-id", default="user_teste_local", help="clerk_id da conta de login (padrão: fictício)")
    parser.add_argument("--telegram-id", help="chat id do Telegram para já deixar a conta vinculada")
    parser.add_argument("--reset", action="store_true", help="apaga o usuário existente e recria")
    args = parser.parse_args()
    seed(args.clerk_id, args.telegram_id, args.reset)
