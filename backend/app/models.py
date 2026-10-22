from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, JSON, Numeric, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .clock import now_jst
from .db import Base


class Trend(Base):
    __tablename__ = "trend"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    opinion: Mapped[str] = mapped_column(String(255), nullable=False)
    type_daily_trend: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    perspectives: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    price_at_fetch: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, index=True, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendGroup(Base):
    __tablename__ = "trend_group"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendPrice(Base):
    __tablename__ = "trend_price"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    trend_group_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    buy_category: Mapped[int] = mapped_column(nullable=False, default=0)
    buy_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, default=None)
    buy_quantity: Mapped[int | None] = mapped_column(nullable=True, default=None)
    sale_price_target: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCandidate(Base):
    __tablename__ = "trend_candidate"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCandidateCondition(Base):
    __tablename__ = "trend_candidate_condition"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCandidateResult(Base):
    __tablename__ = "trend_candidate_result"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    condition_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendSystem(Base):
    __tablename__ = "trend_system"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendSystemType(Base):
    __tablename__ = "trend_system_type"
    __table_args__ = (
        UniqueConstraint("type_column", "type_value", name="uq_trend_system_type_column_value"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type_column: Mapped[str] = mapped_column(String(100), nullable=False)
    type_name: Mapped[str] = mapped_column(String(100), nullable=False)
    type_value: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCodeName(Base):
    __tablename__ = "trend_code_name"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
