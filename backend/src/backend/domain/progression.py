from dataclasses import dataclass
from decimal import Decimal

MAX_REPS = 12
RESET_REPS = 8


@dataclass(frozen=True)
class Target:
    reps: int
    kg: Decimal


def next_target(current: Target, done_reps: int, done_kg: Decimal, increment: Decimal) -> Target:
    """Meta da próxima sessão para uma série.

    Bateu a meta (reps e carga iguais ou maiores) -> +1 rep até 12. Com 12 reps volta
    para 8 reps e soma o incremento de carga. Não bateu -> mantém a meta. Se a carga
    feita passou da meta, a nova carga base é a feita.
    """
    if done_reps < current.reps or done_kg < current.kg:
        return current
    base_kg = max(current.kg, done_kg)
    if current.reps >= MAX_REPS:
        return Target(RESET_REPS, base_kg + increment)
    return Target(current.reps + 1, base_kg)
