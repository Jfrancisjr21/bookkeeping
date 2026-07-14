# Bookkeeper

Full-stack personal book tracking app. FastAPI backend, vanilla JS frontend, PostgreSQL database.

## Start the app

```bash
# 1. Start Postgres (Docker)
docker compose up -d

# 2. Start the API (from backend/)
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

App runs at http://localhost:8000

## Project structure

```
backend/
  main.py           # FastAPI app, mounts static files at /
  auth.py           # JWT (HS256, 7-day expiry), bcrypt, get_current_user dep
  database.py       # SQLAlchemy engine, reads DATABASE_URL env var
  models.py         # User, Book (SQLAlchemy ORM)
  schemas.py        # Pydantic: BookCreate, BookUpdate, BookOut, Token, etc.
  routers/
    auth.py         # POST /auth/register, /auth/login, /auth/refresh
    books.py        # GET/POST /books/, PATCH/DELETE /books/{id}
    search.py       # GET /search/, /search/detail
  static/
    index.html      # Homepage — browse/discover (genre rows, stats bar, goal banner)
    shelf.html      # Personal shelf — tabbed by status, filter + sort
    login.html      # Login / register
    shared.css      # All shared styles + design tokens
    shared.js       # Shared utils: apiFetch, checkAuth, openBookDetail, openModal, makeBookCard, showToast, etc.
    browse.js       # Browse page logic: genre rows, shelf index, goal banner
    app.js          # Shelf page logic: loadShelf, renderGrid, applyFilterAndSort, saveBook
```

## Environment

Copy `.env.example` → `.env` inside `backend/` and fill in values. The app will refuse to start if `SECRET_KEY` is missing.

Generate a key: `python3 -c "import secrets; print(secrets.token_hex(32))"`

## Database

Connection string lives in `.env` as `DATABASE_URL` (default: `postgresql://bookkeeper:bookkeeper@localhost:5432/books`).

**SQLAlchemy does not auto-add columns to existing tables.** After any model change, run ALTER TABLE manually:

```bash
psql postgresql://bookkeeper:bookkeeper@localhost:5432/books -c "ALTER TABLE books ADD COLUMN IF NOT EXISTS <col> <type>;"
```

Columns added manually so far: `current_page`, `total_pages`, `first_publish_year`, `started_reading_at`

New tables (`journal_entries`, `reading_goals`) are created automatically by SQLAlchemy on startup.

## Migrations (Alembic)

Alembic is configured but optional — `create_all` still handles new tables on startup. Use Alembic for column additions to existing tables.

```bash
cd backend
# Apply all migrations
venv/bin/alembic upgrade head

# Generate a new migration after a model change
venv/bin/alembic revision --autogenerate -m "describe the change"
```

## Tests

Tests use a separate `books_test` database. Create it once:

```bash
docker exec -it $(docker compose ps -q db) psql -U bookkeeper -c "CREATE DATABASE books_test;"
```

Run tests (from `backend/`):

```bash
venv/bin/pytest
```

Tests use a transaction-rollback fixture — each test is isolated and leaves no data behind.

## Key architectural notes

### Auth
- JWT stored in `localStorage` as `bk_token`, username as `bk_username`
- `checkAuth()` in shared.js silently refreshes on page load when token is within 24h of expiry
- `apiFetch` retries once on 401 before redirecting to `/login.html`

### Search sources
`GET /search/` fires Open Library + Google Books in parallel, merges and deduplicates by ISBN then title+author. OL results take priority. Google Books IDs are stored as `gb:<volumeId>` in the `open_library_key` field. `GET /search/detail` routes to the right API based on the `gb:` prefix.

### Frontend script loading
Scripts are plain (non-module) files sharing global scope. Cache-busting via `?v=N` query params — bump the version in the HTML `<script>` tag whenever the JS file changes.

**Current versions:**
- `shared.js?v=14`
- `browse.js?v=11`
- `app.js?v=23`

### Reading Tracker
`current_page` and `total_pages` on the Book model. All tracker code is wrapped in `/* ══ Reading Tracker (removable) ══ */` comment blocks for easy removal. Journal entries save to the `journal_entries` table via `POST /books/{id}/journal` and display as a list in the shelf modal. The `notes` field is free-form text, separate from journal entries.

### On-shelf indicator (browse page)
`loadShelfIndex()` in browse.js fetches all user books on init and builds `_shelfIndex` keyed by `i:<isbn>` and `k:<open_library_key>`. Browse cards show a green ✓ badge if the book is already on the shelf. The detail panel shows the current status instead of "Add to Shelf".

### Reading goal
Persisted in the `reading_goals` table via `GET/PUT/DELETE /goals/{year}`. `localStorage` (`bk_goal_<year>`) is kept in sync as a client-side cache. Click the count text in the goal banner to set/change the target.

## Common gotchas

- Homebrew Postgres conflicts with Docker on port 5432 — stop it with `brew services stop postgresql@<version>` before running Docker
- `psycopg2` must be `psycopg2-binary` on Python 3.13
- `dashboard.html`, `dashboard.js`, `home.js`, `browse.html` have been deleted — do not recreate them
