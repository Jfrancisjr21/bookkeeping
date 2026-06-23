from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from database import engine, Base
from routers import books, search

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bookkeeper")

app.include_router(books.router)
app.include_router(search.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")
