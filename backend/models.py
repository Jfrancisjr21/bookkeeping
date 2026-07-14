from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Enum as PgEnum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class ReadStatus(str, enum.Enum):
    reading = "reading"
    plan_to_read = "plan_to_read"
    read = "read"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    books = relationship("Book", back_populates="owner")
    goals = relationship("ReadingGoal", back_populates="owner")


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(512), nullable=False)
    author = Column(String(512), nullable=False)
    isbn = Column(String(20), nullable=True)
    cover_url = Column(Text, nullable=True)
    open_library_key = Column(String(64), nullable=True)
    first_publish_year = Column(Integer, nullable=True)
    status = Column(PgEnum(ReadStatus), nullable=False, default=ReadStatus.plan_to_read)
    rating = Column(Integer, nullable=True)  # 1–5
    notes = Column(Text, nullable=True)
    current_page = Column(Integer, nullable=True)
    total_pages = Column(Integer, nullable=True)
    started_reading_at = Column(DateTime(timezone=True), nullable=True)
    date_added = Column(DateTime(timezone=True), server_default=func.now())
    date_read = Column(Date, nullable=True)

    owner = relationship("User", back_populates="books")
    journal_entries = relationship(
        "JournalEntry", back_populates="book",
        cascade="all, delete-orphan",
        order_by="JournalEntry.created_at.desc()",
    )


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    page = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    book = relationship("Book", back_populates="journal_entries")


class ReadingLog(Base):
    __tablename__ = "reading_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_reading_date"),)


class ReadingGoal(Base):
    __tablename__ = "reading_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    target = Column(Integer, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "year", name="uq_user_year_goal"),)

    owner = relationship("User", back_populates="goals")
