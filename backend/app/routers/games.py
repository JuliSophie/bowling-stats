from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Game, Player, Score
from app.schemas import GameCreate, GameRead, PlayerRenameRequest, PlayerRenameResponse, StoredScore


router = APIRouter(tags=["games"])


def normalize_player_name(name: str) -> str:
    return " ".join(name.split())


def find_existing_player(db: Session, raw_name: str) -> Player | None:
    normalized_name = normalize_player_name(raw_name)
    if not normalized_name:
        return None

    players = db.scalars(select(Player)).all()
    normalized_lookup = normalized_name.casefold()
    for player in players:
        if normalize_player_name(player.name).casefold() == normalized_lookup:
            return player
    return None


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
        normalized_name = normalize_player_name(confirmed_score.player_name)
        player = find_existing_player(db, normalized_name)
        if player is None:
            player = Player(name=normalized_name, avatar_url=confirmed_score.avatar_url)
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
                player_name=player.name,
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


@router.patch("/players/rename", response_model=PlayerRenameResponse)
def rename_player(payload: PlayerRenameRequest, db: Session = Depends(get_db)) -> PlayerRenameResponse:
    normalized_current_name = normalize_player_name(payload.current_name)
    normalized_new_name = normalize_player_name(payload.new_name)

    if not normalized_current_name or not normalized_new_name:
        raise HTTPException(status_code=400, detail="Der Spielername darf nicht leer sein.")

    current_player = find_existing_player(db, normalized_current_name)
    if current_player is None:
        raise HTTPException(status_code=404, detail="Spieler nicht gefunden.")

    target_player = find_existing_player(db, normalized_new_name)

    if target_player is None or target_player.id == current_player.id:
        previous_name = current_player.name
        current_player.name = normalized_new_name
        db.commit()
        return PlayerRenameResponse(previous_name=previous_name, player_name=current_player.name, merged=False)

    previous_name = current_player.name
    target_player.name = normalized_new_name
    if not target_player.avatar_url and current_player.avatar_url:
        target_player.avatar_url = current_player.avatar_url

    for score in db.scalars(select(Score).where(Score.player_id == current_player.id)).all():
        score.player_id = target_player.id

    db.delete(current_player)
    db.commit()

    return PlayerRenameResponse(previous_name=previous_name, player_name=target_player.name, merged=True)
