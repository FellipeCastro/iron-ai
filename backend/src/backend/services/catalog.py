import re
import unicodedata
from dataclasses import dataclass, field
from difflib import get_close_matches

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.db import Exercise, ExerciseAlias, Routine, Workout, WorkoutExercise

# canonical_name -> (grupo muscular, apelidos)
SEED: dict[str, tuple[str, list[str]]] = {
    "Supino reto": ("Peito", ["supino reto com barra", "supino barra", "bench press"]),
    "Supino inclinado": ("Peito", ["supino inclinado com barra", "supino 45"]),
    "Supino declinado": ("Peito", []),
    "Supino reto com halteres": ("Peito", ["supino halteres", "supino com halteres"]),
    "Supino inclinado com halteres": ("Peito", ["supino inclinado halteres"]),
    "Crucifixo": ("Peito", ["crucifixo reto", "crucifixo com halteres"]),
    "Crucifixo inclinado": ("Peito", []),
    "Crossover": ("Peito", ["cross over", "crucifixo na polia"]),
    "Peck deck": ("Peito", ["voador", "peck-deck", "crucifixo maquina"]),
    "Flexão de braço": ("Peito", ["flexao", "flexoes"]),
    "Puxada frontal": ("Costas", ["puxada", "puxada na frente", "pulldown", "puxada alta"]),
    "Puxada neutra": ("Costas", ["puxada triangulo"]),
    "Barra fixa": ("Costas", ["pull up", "pullup"]),
    "Remada curvada": ("Costas", ["remada com barra", "remada curvada com barra"]),
    "Remada baixa": ("Costas", ["remada sentada", "remada no cabo"]),
    "Remada unilateral": ("Costas", ["serrote", "remada serrote", "remada com halter"]),
    "Remada cavalinho": ("Costas", ["cavalinho", "remada t"]),
    "Pulldown": ("Costas", ["pulldown corda", "pullover na polia"]),
    "Levantamento terra": ("Costas", ["terra", "deadlift"]),
    "Desenvolvimento": ("Ombros", ["desenvolvimento com halteres", "desenvolvimento militar", "shoulder press"]),
    "Desenvolvimento com barra": ("Ombros", ["desenvolvimento barra"]),
    "Elevação lateral": ("Ombros", ["elevacao lateral", "lateral raise", "elevacao lateral com halteres"]),
    "Elevação frontal": ("Ombros", ["elevacao frontal"]),
    "Crucifixo invertido": ("Ombros", ["posterior de ombro", "reverse fly", "voador invertido"]),
    "Encolhimento": ("Trapézio", ["encolhimento de ombros", "shrug"]),
    "Rosca direta": ("Bíceps", ["rosca direta com barra", "rosca barra", "rosca"]),
    "Rosca alternada": ("Bíceps", ["rosca alternada com halteres"]),
    "Rosca martelo": ("Bíceps", ["martelo", "hammer"]),
    "Rosca scott": ("Bíceps", ["scott", "rosca banco scott"]),
    "Rosca concentrada": ("Bíceps", []),
    "Tríceps corda": ("Tríceps", ["triceps corda", "triceps na polia", "triceps pulley", "pushdown"]),
    "Tríceps testa": ("Tríceps", ["triceps testa", "triceps frances", "testa"]),
    "Tríceps francês": ("Tríceps", ["triceps frances com halter"]),
    "Tríceps barra": ("Tríceps", ["triceps barra reta", "triceps pulley barra"]),
    "Mergulho": ("Tríceps", ["paralelas", "dips", "mergulho nas paralelas"]),
    "Agachamento livre": ("Pernas", ["agachamento", "agachamento com barra", "squat"]),
    "Agachamento smith": ("Pernas", ["smith", "agachamento no smith"]),
    "Agachamento búlgaro": ("Pernas", ["agachamento bulgaro", "bulgaro"]),
    "Leg press": ("Pernas", ["leg press 45", "legpress", "leg 45"]),
    "Cadeira extensora": ("Pernas", ["extensora", "extensao de pernas"]),
    "Mesa flexora": ("Pernas", ["flexora", "flexora deitada", "flexao de pernas"]),
    "Cadeira flexora": ("Pernas", ["flexora sentada"]),
    "Stiff": ("Pernas", ["stiff com barra", "stiff com halteres", "romanian deadlift"]),
    "Afundo": ("Pernas", ["avanço", "avanco", "passada", "lunge"]),
    "Cadeira adutora": ("Pernas", ["adutora"]),
    "Cadeira abdutora": ("Pernas", ["abdutora"]),
    "Elevação pélvica": ("Glúteos", ["elevacao pelvica", "hip thrust", "ponte"]),
    "Panturrilha em pé": ("Panturrilha", ["panturrilha", "gemeos", "panturrilha no smith"]),
    "Panturrilha sentado": ("Panturrilha", ["panturrilha sentada"]),
    "Abdominal": ("Abdômen", ["abdominal supra", "abdominal crunch", "crunch"]),
    "Abdominal infra": ("Abdômen", ["elevacao de pernas", "infra"]),
    "Prancha": ("Abdômen", ["plank"]),
}


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.lower())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", stripped).split())


def seed_catalog(session: Session) -> None:
    """Insere exercícios e apelidos que ainda não existem. Idempotente."""
    existing = {e.canonical_name: e for e in session.scalars(select(Exercise))}
    known_aliases = set(session.scalars(select(ExerciseAlias.alias)))
    for name, (group, aliases) in SEED.items():
        exercise = existing.get(name)
        if exercise is None:
            exercise = Exercise(canonical_name=name, muscle_group=group)
            session.add(exercise)
            session.flush()
            existing[name] = exercise
        for alias in aliases:
            key = normalize(alias)
            if key and key not in known_aliases and key != normalize(name):
                session.add(ExerciseAlias(alias=key, exercise_id=exercise.id))
                known_aliases.add(key)
    session.flush()


@dataclass
class Resolution:
    status: str  # ok | ambiguous | new
    exercise: Exercise | None = None
    options: list[str] = field(default_factory=list)


def _routine_exercise_ids(session: Session, user_id: int) -> set[int]:
    rows = session.scalars(
        select(WorkoutExercise.exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .join(Routine, Routine.id == Workout.routine_id)
        .where(Routine.user_id == user_id, Routine.active)
    )
    return set(rows)


def resolve_exercise(session: Session, user_id: int, text: str, create: bool = True) -> Resolution:
    """Normaliza o nome dito pelo usuário para um exercício do catálogo.

    Ordem: nome exato/apelido -> candidatos da rotina do usuário -> candidatos do catálogo
    (mais de um vira pedido de esclarecimento) -> aproximação por similaridade -> novo exercício.
    """
    query = normalize(text)
    if not query:
        return Resolution("ambiguous", options=[])

    exercises = list(session.scalars(select(Exercise)))
    by_key: dict[str, Exercise] = {normalize(e.canonical_name): e for e in exercises}
    by_id = {e.id: e for e in exercises}
    for alias, exercise_id in session.execute(select(ExerciseAlias.alias, ExerciseAlias.exercise_id)):
        if exercise_id in by_id:
            by_key.setdefault(alias, by_id[exercise_id])

    if query in by_key:
        return Resolution("ok", by_key[query])

    q_tokens = set(query.split())
    routine_ids = _routine_exercise_ids(session, user_id)

    def subset_matches(pool: list[Exercise]) -> list[Exercise]:
        found: dict[int, Exercise] = {}
        for key, exercise in by_key.items():
            if exercise in pool and q_tokens <= set(key.split()):
                found[exercise.id] = exercise
        return list(found.values())

    in_routine = subset_matches([e for e in exercises if e.id in routine_ids])
    if len(in_routine) == 1:
        return Resolution("ok", in_routine[0])

    candidates = in_routine or subset_matches(exercises)
    if len(candidates) == 1:
        return Resolution("ok", candidates[0])
    if len(candidates) > 1:
        return Resolution("ambiguous", options=sorted(e.canonical_name for e in candidates)[:6])

    close = get_close_matches(query, list(by_key), n=3, cutoff=0.8)
    close_exercises = {by_key[k].id: by_key[k] for k in close}
    if len(close_exercises) == 1:
        return Resolution("ok", next(iter(close_exercises.values())))
    if len(close_exercises) > 1:
        return Resolution("ambiguous", options=sorted(e.canonical_name for e in close_exercises.values()))

    if not create:
        return Resolution("ambiguous", options=[])
    name = " ".join(text.strip().split())[:60]
    name = name[:1].upper() + name[1:]
    exercise = Exercise(canonical_name=name)
    session.add(exercise)
    session.flush()
    return Resolution("new", exercise)
