from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, Time, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    clerk_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String)
    timezone: Mapped[str] = mapped_column(String, default="America/Sao_Paulo")
    reminder_time: Mapped[time | None] = mapped_column(Time)
    weight_increment_kg: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=Decimal("5.0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
