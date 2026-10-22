from datetime import UTC, datetime
from decimal import Decimal

import pytest

from backend.domain.one_rm import epley
from backend.domain.progression import Target, next_target
from backend.domain.sessions import local_session_date
from backend.domain.volume import volume

D = Decimal
INC = D("5")


def test_hit_target_adds_one_rep():
    assert next_target(Target(10, D("30")), 10, D("30"), INC) == Target(11, D("30"))


def test_eleven_to_twelve():
    assert next_target(Target(11, D("30")), 11, D("30"), INC) == Target(12, D("30"))


def test_twelve_resets_to_eight_and_adds_load():
    assert next_target(Target(12, D("30")), 12, D("30"), INC) == Target(8, D("35"))


def test_custom_increment():
    assert next_target(Target(12, D("30")), 12, D("30"), D("2.5")) == Target(8, D("32.5"))


def test_below_target_reps_keeps_target():
    assert next_target(Target(10, D("30")), 8, D("30"), INC) == Target(10, D("30"))


def test_lower_weight_keeps_target():
    assert next_target(Target(10, D("30")), 10, D("25"), INC) == Target(10, D("30"))


def test_heavier_weight_becomes_base():
    assert next_target(Target(10, D("30")), 10, D("32.5"), INC) == Target(11, D("32.5"))


def test_heavier_weight_but_fewer_reps_keeps_target():
    assert next_target(Target(10, D("30")), 8, D("35"), INC) == Target(10, D("30"))


def test_more_reps_than_target_still_plus_one_on_target():
    assert next_target(Target(10, D("30")), 12, D("30"), INC) == Target(11, D("30"))


def test_epley():
    assert epley(D("100"), 3) == D("110.0")
    assert epley(60, 10) == D("80")


def test_volume():
    assert volume([(10, D("20")), (8, D("25.5"))]) == D("404")
    assert volume([]) == 0


@pytest.mark.parametrize(
    ("utc", "tz", "expected"),
    [
        # 03:59 em São Paulo (06:59 UTC) ainda é o dia anterior
        (datetime(2026, 10, 22, 6, 59, tzinfo=UTC), "America/Sao_Paulo", "2026-10-21"),
        (datetime(2026, 10, 22, 7, 0, tzinfo=UTC), "America/Sao_Paulo", "2026-10-22"),
        # Manaus (UTC-4): 04:00 local = 08:00 UTC
        (datetime(2026, 10, 22, 7, 59, tzinfo=UTC), "America/Manaus", "2026-10-21"),
        (datetime(2026, 10, 22, 8, 0, tzinfo=UTC), "America/Manaus", "2026-10-22"),
        (datetime(2026, 10, 22, 23, 30, tzinfo=UTC), "America/Sao_Paulo", "2026-10-22"),
    ],
)
def test_session_date_rollover(utc, tz, expected):
    assert local_session_date(utc, tz).isoformat() == expected
