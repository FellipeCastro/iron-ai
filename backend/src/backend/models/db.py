from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    clerk_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String)
    timezone: Mapped[str] = mapped_column(String, default="America/Sao_Paulo")
    reminder_time: Mapped[time | None] = mapped_column(Time, default=time(18, 0), server_default="18:00:00")
    training_days: Mapped[list[int] | None] = mapped_column(ARRAY(SmallInteger))  # 0 = segunda ... 6 = domingo
    weight_increment_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=Decimal("5.0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChannelLink(Base):
    __tablename__ = "channel_links"
    __table_args__ = (UniqueConstraint("channel", "external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    channel: Mapped[str] = mapped_column(String)
    external_id: Mapped[str] = mapped_column(String)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LinkCode(Base):
    __tablename__ = "link_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LinkAttempt(Base):
    __tablename__ = "link_attempts"
    __table_args__ = (Index("ix_link_attempts_external_id_attempted_at", "external_id", "attempted_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(String)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String, unique=True)
    muscle_group: Mapped[str | None] = mapped_column(String)

    aliases: Mapped[list[ExerciseAlias]] = relationship(cascade="all, delete-orphan")


class ExerciseAlias(Base):
    __tablename__ = "exercise_aliases"

    alias: Mapped[str] = mapped_column(String, primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), index=True)


class Routine(Base):
    __tablename__ = "routines"
    __table_args__ = (
        Index("uq_routines_one_active_per_user", "user_id", unique=True, postgresql_where=text("active")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workouts: Mapped[list[Workout]] = relationship(order_by="Workout.position", cascade="all, delete-orphan")


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String)
    position: Mapped[int] = mapped_column(Integer)
    weekday_hint: Mapped[int | None] = mapped_column(SmallInteger)  # 0 = segunda ... 6 = domingo

    exercises: Mapped[list[WorkoutExercise]] = relationship(
        order_by="WorkoutExercise.position", cascade="all, delete-orphan"
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    sets_count: Mapped[int] = mapped_column(Integer, default=3)

    exercise: Mapped[Exercise] = relationship()


class WorkoutSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "local_date"),
        Index("ix_sessions_user_id_local_date", "user_id", "local_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    workout_id: Mapped[int | None] = mapped_column(ForeignKey("workouts.id", ondelete="SET NULL"))
    local_date: Mapped[date] = mapped_column(Date)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    summary_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # resumo pós-treino já enviado

    workout: Mapped[Workout | None] = relationship()


class SetLog(Base):
    __tablename__ = "set_logs"
    __table_args__ = (Index("ix_set_logs_session_id_exercise_id", "session_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    set_number: Mapped[int] = mapped_column(Integer)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    # meta vigente no momento do registro, para recalcular a progressão numa correção
    target_reps: Mapped[int | None] = mapped_column(Integer)
    target_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    supersedes_id: Mapped[int | None] = mapped_column(ForeignKey("set_logs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercise: Mapped[Exercise] = relationship()


class Target(Base):
    __tablename__ = "targets"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), primary_key=True)
    set_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2))


class Inbox(Base):
    __tablename__ = "inbox"
    __table_args__ = (
        UniqueConstraint("channel", "update_id"),
        Index("ix_inbox_status_received_at", "status", "received_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    update_id: Mapped[int] = mapped_column()
    channel: Mapped[str] = mapped_column(String)
    external_id: Mapped[str] = mapped_column(String)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | processing | done | failed
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PendingConfirmation(Base):
    __tablename__ = "pending_confirmations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReminderLog(Base):
    __tablename__ = "reminder_log"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    local_date: Mapped[date] = mapped_column(Date, primary_key=True)


class DailyUsage(Base):
    __tablename__ = "daily_usage"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    local_date: Mapped[date] = mapped_column(Date, primary_key=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    """Histórico curto da conversa, usado como contexto do agente."""

    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_user_id_id", "user_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String)  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
