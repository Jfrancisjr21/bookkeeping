from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import date, datetime
from models import ReadStatus


class BookCreate(BaseModel):
    title: str
    author: str
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    open_library_key: Optional[str] = None
    first_publish_year: Optional[int] = None
    status: ReadStatus = ReadStatus.plan_to_read

    @field_validator("cover_url")
    @classmethod
    def valid_cover_url(cls, v):
        if v is not None and not (v.startswith("https://") or v.startswith("http://")):
            raise ValueError("cover_url must be a valid HTTP or HTTPS URL")
        return v


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    cover_url: Optional[str] = None
    status: Optional[ReadStatus] = None
    rating: Optional[int] = None
    notes: Optional[str] = None
    date_read: Optional[date] = None
    current_page: Optional[int] = None
    total_pages: Optional[int] = None

    @field_validator("cover_url")
    @classmethod
    def valid_cover_url(cls, v):
        if v is not None and not (v.startswith("https://") or v.startswith("http://")):
            raise ValueError("cover_url must be a valid HTTP or HTTPS URL")
        return v

    @field_validator("rating")
    @classmethod
    def rating_range(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5")
        return v

    @field_validator("current_page", "total_pages")
    @classmethod
    def page_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError("Page must be a positive number")
        return v


class BookOut(BookCreate):
    id: int
    rating: Optional[int]
    notes: Optional[str]
    current_page: Optional[int] = None
    total_pages: Optional[int] = None
    started_reading_at: Optional[datetime] = None
    date_added: datetime
    date_read: Optional[date]
    first_publish_year: Optional[int] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


class JournalEntryCreate(BaseModel):
    text: str
    page: Optional[int] = None

    @field_validator("page")
    @classmethod
    def page_positive(cls, v):
        if v is not None and v < 1:
            raise ValueError("Page must be a positive number")
        return v


class JournalEntryOut(BaseModel):
    id: int
    text: str
    page: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class ReadingGoalOut(BaseModel):
    year: int
    target: int


class ReadingGoalUpsert(BaseModel):
    target: int

    @field_validator("target")
    @classmethod
    def target_positive(cls, v):
        if v < 1:
            raise ValueError("Goal target must be at least 1")
        return v
