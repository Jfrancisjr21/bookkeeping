from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import ReadingGoal, User
from schemas import ReadingGoalOut, ReadingGoalUpsert
from auth import get_current_user

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/{year}", response_model=ReadingGoalOut)
def get_goal(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(ReadingGoal).filter(
        ReadingGoal.user_id == current_user.id,
        ReadingGoal.year == year,
    ).first()
    # Return target=0 when no goal is set so the frontend avoids a 404 toast
    return {"year": year, "target": goal.target if goal else 0}


@router.put("/{year}", response_model=ReadingGoalOut)
def upsert_goal(
    year: int,
    payload: ReadingGoalUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(ReadingGoal).filter(
        ReadingGoal.user_id == current_user.id,
        ReadingGoal.year == year,
    ).first()
    if goal:
        goal.target = payload.target
    else:
        goal = ReadingGoal(user_id=current_user.id, year=year, target=payload.target)
        db.add(goal)
    db.commit()
    db.refresh(goal)
    return {"year": goal.year, "target": goal.target}


@router.delete("/{year}", status_code=204)
def delete_goal(
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = db.query(ReadingGoal).filter(
        ReadingGoal.user_id == current_user.id,
        ReadingGoal.year == year,
    ).first()
    if goal:
        db.delete(goal)
        db.commit()
