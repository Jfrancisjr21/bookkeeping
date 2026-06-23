from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Enum as PgEnum
from sqlalchemy.sql import func
import enum
from database import Base


class ReadStatus(str, enum.Enum):
    reading = "reading"
    plan_to_read = "plan_to_read"
    read = "read"


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False)
    author = Column(String(512), nullable=False)
    isbn = Column(String(20), nullable=True)
    cover_url = Column(Text, nullable=True)
    open_library_key = Column(String(64), nullable=True)
    status = Column(PgEnum(ReadStatus), nullable=False, default=ReadStatus.plan_to_read)
    rating = Column(Integer, nullable=True)  # 1–5
    notes = Column(Text, nullable=True)
    date_added = Column(DateTime(timezone=True), server_default=func.now())
    date_read = Column(Date, nullable=True)
