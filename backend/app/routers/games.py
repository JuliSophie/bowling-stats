from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Game, Player, Score
from app.schemas import GameCreate, GameRead, StoredScore


router = APIRouter(tags=["games"])


@router.post("/games", response_model=GameRead, status_code=status.HTTP_201_CREATED)
def create_game(payload: GameCreate, db: Session = Depends(get_db)) -> GameRead:
    game = Game(
        played_at=payload.played_at,
        location=payload.location,
        mode=payload.mode,
        user_id=payload.user_id,
    )
    db.add(game)
    db.flush()

    stored_scores: list[StoredScore] = []
    for confirmed_score in payload.scores:
        player = db.scalar(select(Player).where(Player.name == confirmed_score.player_name))
        if player is None:
            player = Player(name=confirmed_score.player_name, avatar_url=confirmed_score.avatar_url)
            db.add(player)
            db.flush()
        elif confirmed_score.avatar_url and not player.avatar_url:
            player.avatar_url = confirmed_score.avatar_url

        db.add(
            Score(
                game_id=game.id,
                player_id=player.id,
                total_score=confirmed_score.total_score,
                frames=confirmed_score.frames,
            )
        )
        stored_scores.append(
            StoredScore(
                player_name=confirmed_score.player_name,
                total_score=confirmed_score.total_score,
                frames=confirmed_score.frames,
            )
        )

    db.commit()
    db.refresh(game)

    return GameRead(
        id=game.id,
        played_at=game.played_at,
        location=game.location,
        mode=game.mode,
        user_id=game.user_id,
        scores=stored_scores,
    )
