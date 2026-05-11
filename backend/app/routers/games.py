from fastapi import APIRouter, Depends, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Game, Player, Score
from app.schemas import GameCreate, GameRead, StoredScore


router = APIRouter(tags=["games"])


@router.get("/games", response_model=list[GameRead])
def list_games(db: Session = Depends(get_db)) -> list[GameRead]:
    games = db.scalars(select(Game).order_by(desc(Game.played_at), desc(Game.id))).all()
    result: list[GameRead] = []
    for game in games:
        scores = db.execute(
            select(Player.name, Score.total_score, Score.frames)
            .join(Score, Score.player_id == Player.id)
            .where(Score.game_id == game.id)
        ).all()
        result.append(GameRead(
            id=game.id,
            played_at=game.played_at,
            location=game.location,
            mode=game.mode,
            user_id=game.user_id,
            scores=[StoredScore(player_name=s[0], total_score=s[1], frames=s[2] or []) for s in scores],
        ))
    return result


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
