from decimal import ROUND_HALF_UP, Decimal


def epley(kg: Decimal | float, reps: int) -> Decimal:
    """1RM estimado: kg x (1 + reps / 30), com 1 casa decimal."""
    value = Decimal(str(kg)) * (30 + reps) / 30
    return value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
