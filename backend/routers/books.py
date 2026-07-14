from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime, timezone
from database import get_db
from models import Book, JournalEntry, ReadStatus, User
from schemas import BookCreate, BookUpdate, BookOut, JournalEntryCreate, JournalEntryOut
from auth import get_current_user

router = APIRouter(prefix="/books", tags=["books"])


@router.get("/", response_model=list[BookOut])
def list_books(
    status: Optional[ReadStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Book).filter(Book.user_id == current_user.id)
    if status:
        q = q.filter(Book.status == status)
    return q.order_by(Book.date_added.desc()).all()


@router.get("/{book_id}", response_model=BookOut)
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == current_user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.post("/", response_model=BookOut, status_code=201)
def add_book(
    payload: BookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = Book(**payload.model_dump(), user_id=current_user.id)
    if book.status == ReadStatus.reading:
        book.started_reading_at = datetime.now(timezone.utc)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.patch("/{book_id}", response_model=BookOut)
def update_book(
    book_id: int,
    payload: BookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == current_user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    payload_data = payload.model_dump(exclude_unset=True)
    for field, value in payload_data.items():
        setattr(book, field, value)

    if "status" in payload_data:
        if payload_data["status"] == ReadStatus.read:
            if "date_read" not in payload_data and book.date_read is None:
                book.date_read = date.today()
        if payload_data["status"] == ReadStatus.reading:
            if book.started_reading_at is None:
                book.started_reading_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=204)
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == current_user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
    db.commit()


@router.get("/{book_id}/journal", response_model=list[JournalEntryOut])
def list_journal(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == current_user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return (
        db.query(JournalEntry)
        .filter(JournalEntry.book_id == book_id)
        .order_by(JournalEntry.created_at.desc())
        .all()
    )


@router.post("/{book_id}/journal", response_model=JournalEntryOut, status_code=201)
def add_journal_entry(
    book_id: int,
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == current_user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    entry = JournalEntry(
        book_id=book_id,
        user_id=current_user.id,
        text=payload.text,
        page=payload.page,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
