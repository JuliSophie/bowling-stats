from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    scores: Mapped[list["Score"]] = relationship(back_populates="player")


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    played_at: Mapped[date] = mapped_column(Date, index=True)
    played_at_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    location: Mapped[str] = mapped_column(String(120))
    mode: Mapped[str] = mapped_column(String(40), default="10-Pin")
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    scores: Mapped[list["Score"]] = relationship(back_populates="game", cascade="all, delete-orphan")


class Score(Base):
    __tablename__ = "scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    total_score: Mapped[int] = mapped_column(Integer)
    frames: Mapped[list[dict[str, int | str]] | list[int] | None] = mapped_column(JSON, default=list)

    game: Mapped[Game] = relationship(back_populates="scores")
    player: Mapped[Player] = relationship(back_populates="scores")


class TrashTalkBatch(Base):
    __tablename__ = "trash_talk_batches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    source: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    cost: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class TrashTalkCandidate(Base):
    __tablename__ = "trash_talk_candidates"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("trash_talk_batches.id"), index=True)
    scenario_id: Mapped[str] = mapped_column(String(120), index=True)
    text: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    errors: Mapped[list[str]] = mapped_column(JSON, default=list)


class TrashTalkDisabledTemplate(Base):
    __tablename__ = "trash_talk_disabled_templates"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
