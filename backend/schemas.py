from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from models import ReadStatus


class BookCreate(BaseModel):
    title: str
    author: str
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    open_library_key: Optional[str] = None
    status: ReadStatus = ReadStatus.plan_to_read


class BookUpdate(BaseModel):
    status: Optional[ReadStatus] = None
    rating: Optional[int] = None  # 1–5
    notes: Optional[str] = None
    date_read: Optional[date] = None


class BookOut(BookCreate):
    id: int
    rating: Optional[int]
    notes: Optional[str]
    date_added: datetime
    date_read: Optional[date]

    model_config = {"from_attributes": True}
