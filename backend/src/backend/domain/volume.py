from collections.abc import Iterable
from decimal import Decimal


def volume(sets: Iterable[tuple[int, Decimal | float]]) -> Decimal:
    """Soma de reps x kg."""
    return sum((Decimal(reps) * Decimal(str(kg)) for reps, kg in sets), Decimal(0))
