from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routers import books, search, auth, goals, reading_log

# Schema is managed by Alembic — run `alembic upgrade head` (the Docker image does this on start)
app = FastAPI(title="Bookkeeper")

app.include_router(auth.router)
app.include_router(books.router)
app.include_router(search.router)
app.include_router(goals.router)
app.include_router(reading_log.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")
