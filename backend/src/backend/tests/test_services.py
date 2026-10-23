from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from backend.models.db import ChannelLink, Exercise, SetLog, Target
from backend.services import confirmations, linking, workouts
from backend.services.catalog import resolve_exercise
from backend.services.stats import list_sessions
from backend.services.workouts import ServiceError

NOON = datetime(2026, 10, 22, 15, 0, tzinfo=UTC)  # 12:00 em São Paulo


def routine(db, user, *specs):
    ws, amb = workouts.build_specs(db, user.id, list(specs))
    assert not amb, amb
    return workouts.save_routine(db, user.id, ws)


# --- catálogo ---------------------------------------------------------------------------------


def test_resolve_exact_alias_and_accents(db, make_user):
    u = make_user()
    assert resolve_exercise(db, u.id, "supino reto").exercise.canonical_name == "Supino reto"
    assert resolve_exercise(db, u.id, "Triceps Corda").exercise.canonical_name == "Tríceps corda"
    assert resolve_exercise(db, u.id, "triceps pulley").exercise.canonical_name == "Tríceps corda"


def test_bare_supino_is_ambiguous_until_routine_disambiguates(db, make_user):
    u = make_user()
    r = resolve_exercise(db, u.id, "supino")
    assert r.status == "ambiguous" and "Supino reto" in r.options and "Supino inclinado" in r.options
    routine(db, u, {"name": "A", "exercises": [{"name": "Supino inclinado"}, {"name": "Crucifixo"}]})
    assert resolve_exercise(db, u.id, "supino").exercise.canonical_name == "Supino inclinado"


def test_typo_and_new_exercise(db, make_user):
    u = make_user()
    assert resolve_exercise(db, u.id, "agachamneto livre").exercise.canonical_name == "Agachamento livre"
    r = resolve_exercise(db, u.id, "rosca zottman")
    assert r.status == "new" and r.exercise.canonical_name == "Rosca zottman"


# --- séries e progressão ------------------------------------------------------------------------


def test_first_set_creates_target_and_advances(db, make_user):
    u = make_user()
    res = workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    assert res["status"] == "ok" and res["set_number"] == 1
    assert res["target_before"] is None and res["is_new_exercise"]
    assert res["next_target"] == {"reps": 11, "kg": 20.0}
    assert res["one_rm"] == 26.7


def test_set_numbers_increment_within_session(db, make_user):
    u = make_user()
    assert workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)["set_number"] == 1
    assert workouts.log_set(db, u, "supino reto", 10, 25, now=NOON + timedelta(minutes=3))["set_number"] == 2


def test_hit_target_progresses_and_miss_keeps(db, make_user):
    u = make_user()
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)  # meta passa a 11x20
    nxt = NOON + timedelta(days=2)
    hit = workouts.log_set(db, u, "supino reto", 11, 20, now=nxt)
    assert hit["hit_target"] is True and hit["next_target"] == {"reps": 12, "kg": 20.0}
    miss = workouts.log_set(db, u, "supino reto", 9, 20, now=nxt + timedelta(days=2))
    assert miss["hit_target"] is False and miss["next_target"] == {"reps": 12, "kg": 20.0}


def test_twelve_reps_resets_with_increment(db, make_user):
    u = make_user(weight_increment_kg=Decimal("2.5"))
    exercise = resolve_exercise(db, u.id, "supino reto").exercise
    db.add(Target(user_id=u.id, exercise_id=exercise.id, set_number=1, reps=12, weight_kg=Decimal("30")))
    db.flush()
    res = workouts.log_set(db, u, "supino reto", 12, 30, now=NOON)
    assert res["next_target"] == {"reps": 8, "kg": 32.5}


def test_ambiguous_exercise_is_not_logged(db, make_user):
    u = make_user()
    res = workouts.log_set(db, u, "supino", 10, 20, now=NOON)
    assert res["status"] == "ambiguous"
    assert workouts.last_active_set(db, u.id) is None


def test_invalid_values(db, make_user):
    u = make_user()
    with pytest.raises(ServiceError):
        workouts.log_set(db, u, "supino reto", 0, 20, now=NOON)


def test_session_day_rolls_over_at_four(db, make_user):
    u = make_user()
    late = datetime(2026, 10, 22, 6, 30, tzinfo=UTC)  # 03:30 em SP, ainda dia 21
    a = workouts.log_set(db, u, "supino reto", 10, 20, now=late)
    b = workouts.log_set(db, u, "supino reto", 10, 20, now=late + timedelta(hours=1))
    assert a["session_date"] == "2026-10-21" and b["session_date"] == "2026-10-22"


# --- correção -----------------------------------------------------------------------------------


def test_correct_last_set_recomputes_target(db, make_user):
    u = make_user()
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    nxt = NOON + timedelta(days=2)
    workouts.log_set(db, u, "supino reto", 11, 20, now=nxt)  # meta 12x20
    res = workouts.correct_last_set(db, u, kg=25, now=nxt + timedelta(minutes=1))
    assert res["status"] == "ok" and res["after"]["kg"] == 25.0
    # a meta anterior era 11x20: 11 reps com 25 kg bate a meta e a carga base vira 25
    assert res["next_target"] == {"reps": 12, "kg": 25.0}
    last = workouts.last_active_set(db, u.id)
    assert last.weight_kg == Decimal("25") and last.supersedes_id is not None


def test_corrected_set_is_not_counted_twice(db, make_user):
    u = make_user()
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    workouts.correct_last_set(db, u, reps=9, now=NOON + timedelta(minutes=1))
    sets = list_sessions(db, u)[0]["sets"]
    assert len(sets) == 1 and sets[0]["reps"] == 9
    assert workouts.log_set(db, u, "supino reto", 10, 20, now=NOON + timedelta(minutes=2))["set_number"] == 2


def test_correct_without_fields_asks_for_clarification(db, make_user):
    u = make_user()
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    assert workouts.correct_last_set(db, u)["status"] == "needs_clarification"
    assert workouts.correct_last_set(db, make_user("other"), kg=10)["status"] == "nothing_to_correct"


def test_correct_exercise_restores_old_target(db, make_user):
    u = make_user()
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    res = workouts.correct_last_set(db, u, exercise_name="crucifixo", now=NOON + timedelta(minutes=1))
    assert res["after"]["exercise"] == "Crucifixo"
    supino = resolve_exercise(db, u.id, "supino reto").exercise
    assert db.get(Target, (u.id, supino.id, 1)) is None


# --- rotina -------------------------------------------------------------------------------------


def test_next_workout_rotates(db, make_user):
    u = make_user()
    routine(
        db,
        u,
        {"name": "Peito", "exercises": [{"name": "Supino reto"}]},
        {"name": "Costas", "exercises": [{"name": "Puxada frontal"}]},
        {"name": "Pernas", "exercises": [{"name": "Leg press"}]},
    )
    assert workouts.next_workout(db, u.id).name == "Peito"
    day = NOON
    for exercise, expected in [("supino reto", "Costas"), ("puxada frontal", "Pernas"), ("leg press", "Peito")]:
        workouts.log_set(db, u, exercise, 10, 20, now=day)
        assert workouts.next_workout(db, u.id).name == expected
        day += timedelta(days=1)


def test_session_takes_workout_that_contains_exercise(db, make_user):
    u = make_user()
    routine(
        db,
        u,
        {"name": "Peito", "exercises": [{"name": "Supino reto"}]},
        {"name": "Costas", "exercises": [{"name": "Puxada frontal"}]},
    )
    res = workouts.log_set(db, u, "puxada frontal", 10, 40, now=NOON)
    assert res["workout"] == "Costas" and res["off_routine"] is False
    off = workouts.log_set(db, u, "rosca direta", 10, 10, now=NOON + timedelta(minutes=5))
    assert off["off_routine"] is True


def test_replacing_routine_keeps_history(db, make_user):
    u = make_user()
    routine(db, u, {"name": "Peito", "exercises": [{"name": "Supino reto"}]})
    workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    routine(db, u, {"name": "Full body", "exercises": [{"name": "Agachamento livre"}]})
    assert workouts.active_routine(db, u.id).workouts[0].name == "Full body"
    assert len(list_sessions(db, u)) == 1


def test_routine_with_ambiguous_exercise_asks(db, make_user):
    u = make_user()
    _, ambiguous = workouts.build_specs(db, u.id, [{"name": "A", "exercises": [{"name": "supino"}]}])
    assert ambiguous and ambiguous[0]["typed"] == "supino"


def test_confirmation_flow(db, make_user):
    u = make_user()
    specs, _ = workouts.build_specs(db, u.id, [{"name": "A", "exercises": [{"name": "Supino reto", "sets": 4}]}])
    pending = confirmations.create_pending(db, u.id, "routine", workouts.routine_specs_to_payload(specs))
    assert workouts.active_routine(db, u.id) is None  # só salva depois de confirmar
    assert confirmations.resolve_pending(db, u, True, pending.id)["status"] == "saved"
    assert workouts.active_routine(db, u.id).workouts[0].exercises[0].sets_count == 4
    assert confirmations.resolve_pending(db, u, True, pending.id)["status"] == "nothing_pending"


def test_expired_confirmation_is_ignored(db, make_user):
    u = make_user()
    specs, _ = workouts.build_specs(db, u.id, [{"name": "A", "exercises": [{"name": "Supino reto"}]}])
    pending = confirmations.create_pending(db, u.id, "routine", workouts.routine_specs_to_payload(specs), now=NOON)
    later = NOON + timedelta(hours=2)
    assert confirmations.resolve_pending(db, u, True, pending.id, now=later)["status"] == "nothing_pending"


# --- vínculo ------------------------------------------------------------------------------------


def test_link_code_single_use_and_expiry(db, make_user):
    u = make_user()
    code, expires = linking.create_link_code(db, u, now=NOON)
    assert expires == NOON + timedelta(minutes=15)
    assert linking.consume_link_code(db, code, "111", now=NOON + timedelta(minutes=1)).status == "linked"
    assert linking.consume_link_code(db, code, "222", now=NOON + timedelta(minutes=2)).status == "invalid"
    code2, _ = linking.create_link_code(db, u, now=NOON)
    assert linking.consume_link_code(db, code2, "333", now=NOON + timedelta(minutes=16)).status == "invalid"


def test_new_code_invalidates_previous(db, make_user):
    u = make_user()
    old, _ = linking.create_link_code(db, u, now=NOON)
    new, _ = linking.create_link_code(db, u, now=NOON)
    assert linking.consume_link_code(db, old, "111", now=NOON).status == "invalid"
    assert linking.consume_link_code(db, new, "111", now=NOON).status == "linked"


def test_link_attempts_are_rate_limited_per_chat(db, make_user):
    u = make_user()
    code, _ = linking.create_link_code(db, u, now=NOON)
    for _ in range(5):
        assert linking.consume_link_code(db, "IRON-WRONG1", "999", now=NOON).status == "invalid"
    assert linking.consume_link_code(db, code, "999", now=NOON).status == "rate_limited"
    assert linking.consume_link_code(db, code, "888", now=NOON).status == "linked"  # outro chat não é afetado


def test_chat_cannot_link_two_users_and_relink_replaces(db, make_user):
    a, b = make_user("a"), make_user("b")
    ca, _ = linking.create_link_code(db, a, now=NOON)
    cb, _ = linking.create_link_code(db, b, now=NOON)
    assert linking.consume_link_code(db, ca, "111", now=NOON).status == "linked"
    assert linking.consume_link_code(db, cb, "111", now=NOON).status == "chat_taken"
    ca2, _ = linking.create_link_code(db, a, now=NOON)
    assert linking.consume_link_code(db, ca2, "222", now=NOON).status == "linked"
    links = db.query(ChannelLink).filter_by(user_id=a.id).all()
    assert [link.external_id for link in links] == ["222"]


def test_extract_code():
    assert linking.extract_code("/start IRON-7k3q9b") == "IRON-7K3Q9B"
    assert linking.extract_code("oi") is None


# --- retorno rico do log_set ---------------------------------------------------------------------


def test_log_set_reports_progress_in_workout_and_next_exercise(db, make_user):
    u = make_user()
    routine(db, u, {"name": "Peito", "exercises": [{"name": "Supino reto", "sets": 2}, {"name": "Crucifixo", "sets": 3}]})
    first = workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)
    assert (first["sets_done"], first["sets_planned"], first["exercise_done"]) == (1, 2, False)
    assert first["next_exercise"] is None
    second = workouts.log_set(db, u, "supino reto", 10, 20, now=NOON + timedelta(minutes=3))
    assert second["exercise_done"] is True and second["next_exercise"] == {"name": "Crucifixo", "sets": 3}


def test_log_set_flags_record_only_after_first_history(db, make_user):
    u = make_user()
    assert workouts.log_set(db, u, "supino reto", 10, 20, now=NOON)["is_record"] is False
    assert workouts.log_set(db, u, "supino reto", 10, 20, now=NOON + timedelta(minutes=3))["is_record"] is False
    assert workouts.log_set(db, u, "supino reto", 8, 25, now=NOON + timedelta(minutes=6))["is_record"] is True


# --- relatórios ---------------------------------------------------------------------------------


def _train(db, user, day_offset, exercise, sets):
    now = NOON + timedelta(days=day_offset)
    for i, (reps, kg) in enumerate(sets):
        workouts.log_set(db, user, exercise, reps, kg, now=now + timedelta(minutes=3 * i))
    db.flush()


def test_session_summary_counts_records_targets_and_volume_change(db, make_user):
    from backend.models.db import WorkoutSession
    from backend.services import reports

    u = make_user()
    routine(db, u, {"name": "Peito", "exercises": [{"name": "Supino reto", "sets": 2}]})
    _train(db, u, 0, "supino reto", [(10, 20), (10, 20)])
    _train(db, u, 2, "supino reto", [(11, 20), (8, 30)])  # 1ª bate a meta 11x20; 2ª passa a carga mas falha as reps
    last = db.query(WorkoutSession).order_by(WorkoutSession.local_date.desc()).first()
    s = reports.session_summary(db, u, last.id)
    assert s["status"] == "ok" and s["sets"] == 2 and s["letter"] == "A"
    assert s["records"] == [{"exercise": "Supino reto", "kg": 30.0, "reps": 8}]
    assert (s["targets_hit"], s["targets_total"]) == (1, 2)
    assert s["volume"] == 460.0 and s["volume_change_pct"] == 15  # 400 -> 460
    assert s["missed"] == [{"exercise": "Supino reto", "reps": 10, "kg": 20.0}]
    text = reports.format_session_summary(s)
    assert "Treino A concluído" in text and "Metas batidas: 1/2" in text and "Recorde: Supino reto 8x30kg" in text


def test_finish_today_sends_summary_once(db, make_user):
    from backend.services import reports

    u = make_user()
    assert reports.finish_today(db, u, NOON)["status"] == "no_session"
    _train(db, u, 0, "supino reto", [(10, 20)])
    assert reports.finish_today(db, u, NOON)["status"] == "ok"
    assert reports.finish_today(db, u, NOON)["status"] == "already_sent"


def test_exercise_report_numbers(db, make_user):
    from backend.services import reports

    u = make_user()
    _train(db, u, 0, "supino reto", [(10, 20)])
    _train(db, u, 7, "supino reto", [(10, 30)])
    _train(db, u, 14, "supino reto", [(8, 40)])
    r = reports.exercise_report(db, u, "supino reto", "90d", NOON + timedelta(days=15))
    assert r["status"] == "ok" and r["first_kg"] == 20.0 and r["last_kg"] == 40.0 and r["change_pct"] == 100
    assert r["record"]["kg"] == 40.0 and r["sessions"] == 3 and r["sessions_per_week"] == 1.0
    assert r["stagnant_weeks"] == 0


def test_exercise_report_stagnation_and_no_data(db, make_user):
    from backend.services import reports

    u = make_user()
    for week in range(3):
        _train(db, u, week * 7, "supino reto", [(10, 30)])
    r = reports.exercise_report(db, u, "supino reto", "90d", NOON + timedelta(days=15))
    assert r["stagnant_weeks"] == 2
    assert reports.exercise_report(db, u, "remada curvada", "90d", NOON)["status"] == "no_data"
    assert reports.exercise_report(db, u, "supino", "90d", NOON)["status"] == "ambiguous"


def test_muscle_group_report(db, make_user):
    from backend.services import reports

    u = make_user()
    _train(db, u, 0, "supino reto", [(10, 20), (10, 20)])
    _train(db, u, 0, "crucifixo", [(12, 10)])
    _train(db, u, 7, "supino reto", [(10, 30)])
    _train(db, u, 7, "agachamento livre", [(10, 50)])
    group = db.query(Exercise).filter_by(canonical_name="Supino reto").one().muscle_group
    r = reports.muscle_group_report(db, u, group.lower(), "30d", NOON + timedelta(days=8))
    assert r["status"] == "ok" and r["group"] == group and r["sessions"] == 2 and r["sets"] == 4
    assert r["exercises"][0]["exercise"] == "Supino reto" and r["exercises"][0]["change_kg"] == 10.0
    assert 0 < r["volume_share_pct"] < 100 and r["least_trained"] == "Crucifixo"
    assert reports.muscle_group_report(db, u, "pescoço", "30d", NOON)["status"] == "unknown_group"


def test_log_set_with_existing_number_replaces_it(db, make_user):
    user = make_user()
    for reps, kg in [(10, 20), (10, 20), (8, 30)]:
        workouts.log_set(db, user, "elevação lateral", reps, kg)
    for number, (reps, kg) in enumerate([(10, 10), (10, 10), (8, 15)], 1):
        workouts.log_set(db, user, "elevação lateral", reps, kg, number)
    rows = db.scalars(workouts.active_sets(user.id).order_by(SetLog.set_number)).all()
    assert [(r.set_number, r.reps, float(r.weight_kg)) for r in rows] == [(1, 10, 10.0), (2, 10, 10.0), (3, 8, 15.0)]
