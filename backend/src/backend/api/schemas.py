from datetime import datetime, time

from pydantic import BaseModel, Field


class TelegramInfo(BaseModel):
    linked_at: datetime


class Me(BaseModel):
    id: int
    name: str | None
    email: str | None
    timezone: str
    linked: bool
    telegram: TelegramInfo | None
    bot_username: str


class LinkCodeOut(BaseModel):
    code: str
    expires_at: datetime
    deep_link: str
    bot_username: str


class TargetOut(BaseModel):
    set: int
    reps: int | None
    kg: float | None


class RoutineExerciseOut(BaseModel):
    exercise_id: int
    name: str
    group: str | None
    sets: int
    targets: list[TargetOut]


class WorkoutOut(BaseModel):
    id: int
    letter: str
    name: str
    focus: str
    weekday: int | None
    exercises: list[RoutineExerciseOut]


class RoutineOut(BaseModel):
    workouts: list[WorkoutOut]
    next_workout_id: int | None
    reminder_time: time | None


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    sets: int = Field(default=3, ge=1, le=10)


class WorkoutIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    weekday: int | None = Field(default=None, ge=0, le=6)
    exercises: list[ExerciseIn] = Field(min_length=1, max_length=30)


class RoutineIn(BaseModel):
    workouts: list[WorkoutIn] = Field(min_length=1, max_length=7)


class SetOut(BaseModel):
    exercise: str
    set_number: int
    reps: int
    kg: float


class SessionOut(BaseModel):
    id: int
    date: str
    workout: str
    letter: str | None
    focus: str
    volume: float
    sets: list[SetOut]


class WeekPoint(BaseModel):
    week: str
    range: str
    week_start: str


class DashboardStats(BaseModel):
    workouts_month: int
    workouts_month_change: int
    volume_week: float
    volume_week_change_pct: int | None
    streak_weeks: int
    streak_record_weeks: int


class WeeklyOut(WeekPoint):
    volume: float
    treinos: int


class OneRmSeries(BaseModel):
    key: str
    name: str


class OneRmOut(BaseModel):
    series: list[OneRmSeries]
    data: list[dict]  # {week, range, week_start, e0: float|null, e1: ...}


class DashboardOut(BaseModel):
    stats: DashboardStats
    weekly: list[WeeklyOut]
    one_rm: OneRmOut


class ProgressPoint(WeekPoint):
    kg: float
    rm: float
    volume: float


class ProgressSummary(BaseModel):
    kg: float
    rm: float
    volume: float
    kg_change: float
    rm_change: float
    volume_change_pct: int | None


class ProgressOut(BaseModel):
    exercise: str
    points: list[ProgressPoint]
    summary: ProgressSummary | None


class SettingsOut(BaseModel):
    reminder_time: time | None
    weight_increment_kg: float
    timezone: str


class SettingsIn(BaseModel):
    reminder_time: time | None
    weight_increment_kg: float = Field(ge=0.5, le=20)
    timezone: str = Field(max_length=64)
