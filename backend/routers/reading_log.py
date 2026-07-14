from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date as date_type
from database import get_db
from models import ReadingLog, User
from auth import get_current_user

router = APIRouter(prefix="/reading-log", tags=["reading-log"])


def _parse_date(date_str: str) -> date_type:
    try:
        return date_type.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date — use YYYY-MM-DD")


@router.get("/")
def get_log(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = date_type(year, month, 1)
    end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
    entries = (
        db.query(ReadingLog)
        .filter(
            ReadingLog.user_id == current_user.id,
            ReadingLog.date >= start,
            ReadingLog.date < end,
        )
        .all()
    )
    return [e.date.isoformat() for e in entries]


@router.post("/{date_str}")
def mark_day(
    date_str: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _parse_date(date_str)
    if d > date_type.today():
        raise HTTPException(status_code=400, detail="Cannot mark a future date")
    existing = db.query(ReadingLog).filter(
        ReadingLog.user_id == current_user.id,
        ReadingLog.date == d,
    ).first()
    if not existing:
        db.add(ReadingLog(user_id=current_user.id, date=d))
        db.commit()
    return {"date": date_str, "marked": True}


@router.delete("/{date_str}")
def unmark_day(
    date_str: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = _parse_date(date_str)
    entry = db.query(ReadingLog).filter(
        ReadingLog.user_id == current_user.id,
        ReadingLog.date == d,
    ).first()
    if entry:
        db.delete(entry)
        db.commit()
    return {"date": date_str, "marked": False}
