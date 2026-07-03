from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    ticker: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    corp_code: Mapped[str | None] = mapped_column(String, nullable=True)
    sector: Mapped[str] = mapped_column(String, nullable=False)
    market_cap: Mapped[float | None] = mapped_column(Float, nullable=True)
    auditor: Mapped[str | None] = mapped_column(String, nullable=True)
    dart_no: Mapped[str | None] = mapped_column(String, nullable=True)
    fiscal_year: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    prev_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    metrics_history: Mapped[list["MetricsHistory"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    score_history: Mapped[list["ScoreHistory"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    flags: Mapped[list["Flag"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    ownership: Mapped[list["Ownership"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    related_tx: Mapped[list["RelatedTx"]] = relationship(back_populates="company", cascade="all, delete-orphan")


class MetricsHistory(Base):
    __tablename__ = "metrics_history"
    __table_args__ = (UniqueConstraint("company_id", "year", name="uq_metrics_company_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    year: Mapped[str] = mapped_column(String, nullable=False)
    revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    debt_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    op_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    altman_z: Mapped[float | None] = mapped_column(Float, nullable=True)
    beneish_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    company: Mapped["Company"] = relationship(back_populates="metrics_history")


class ScoreHistory(Base):
    __tablename__ = "score_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    prev_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    company: Mapped["Company"] = relationship(back_populates="score_history")


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    tag: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)  # high | medium | low
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    basis: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    company: Mapped["Company"] = relationship(back_populates="flags")


class Ownership(Base):
    __tablename__ = "ownership"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    entity: Mapped[str] = mapped_column(String, nullable=False)
    share: Mapped[float] = mapped_column(Float, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)

    company: Mapped["Company"] = relationship(back_populates="ownership")


class RelatedTx(Base):
    __tablename__ = "related_tx"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    party: Mapped[str] = mapped_column(String, nullable=False)
    desc: Mapped[str | None] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship(back_populates="related_tx")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    google_sub: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Watchlist(Base):
    __tablename__ = "watchlist"
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_watchlist_user_company"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)  # score | disclosure
    target: Mapped[str] = mapped_column(String, nullable=False)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    channel: Mapped[str] = mapped_column(String, nullable=False)  # email | slack
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
