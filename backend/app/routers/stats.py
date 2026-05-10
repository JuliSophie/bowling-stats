from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Game, Player, Score
from app.schemas import HighScoreEntry, PlayerAverage, PlayerTrend, StatsResponse, TrendPoint


router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)) -> StatsResponse:
    trend_rows = db.execute(
        select(Player.name, Game.played_at, Score.total_score)
        .join(Score, Score.player_id == Player.id)
        .join(Game, Game.id == Score.game_id)
        .order_by(Player.name, desc(Game.played_at))
    ).all()

    grouped_points: dict[str, list[TrendPoint]] = defaultdict(list)
    for player_name, played_at, total_score in trend_rows:
        if len(grouped_points[player_name]) >= 10:
            continue
        grouped_points[player_name].append(TrendPoint(played_at=played_at, total_score=total_score))

    score_trends = [
        PlayerTrend(player_name=player_name, games=list(reversed(points)))
        for player_name, points in grouped_points.items()
    ]

    averages = [
        PlayerAverage(player_name=row[0], average_score=float(round(row[1], 1)), games_played=row[2])
        for row in db.execute(
            select(Player.name, func.avg(Score.total_score), func.count(Score.id))
            .join(Score, Score.player_id == Player.id)
            .group_by(Player.name)
            .order_by(desc(func.avg(Score.total_score)))
        ).all()
    ]

    hall_of_fame = [
        HighScoreEntry(
            player_name=row[0],
            total_score=row[1],
            played_at=row[2],
            location=row[3],
        )
        for row in db.execute(
            select(Player.name, Score.total_score, Game.played_at, Game.location)
            .join(Score, Score.player_id == Player.id)
            .join(Game, Game.id == Score.game_id)
            .order_by(desc(Score.total_score), desc(Game.played_at))
            .limit(10)
        ).all()
    ]

    return StatsResponse(score_trends=score_trends, averages=averages, hall_of_fame=hall_of_fame)
