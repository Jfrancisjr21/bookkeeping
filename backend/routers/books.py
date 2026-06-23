from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import Book, ReadStatus
from schemas import BookCreate, BookUpdate, BookOut

router = APIRouter(prefix="/books", tags=["books"])


@router.get("/", response_model=list[BookOut])
def list_books(status: Optional[ReadStatus] = None, db: Session = Depends(get_db)):
    q = db.query(Book)
    if status:
        q = q.filter(Book.status == status)
    return q.order_by(Book.date_added.desc()).all()


@router.post("/", response_model=BookOut, status_code=201)
def add_book(payload: BookCreate, db: Session = Depends(get_db)):
    book = Book(**payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.patch("/{book_id}", response_model=BookOut)
def update_book(book_id: int, payload: BookUpdate, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(book, field, value)
    db.commit()
    db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
    db.commit()
