# Bookkeeper

Full-stack personal book tracking app. FastAPI backend, vanilla JS frontend, PostgreSQL database.

## Start the app

### Local development (API only)

```bash
# 1. Start Postgres (Docker)
docker compose up -d db

# 2. Apply migrations, then start the API (from backend/)
cd backend
source venv/bin/activate
alembic upgrade head
uvicorn main:app --reload
```

App runs at http://localhost:8000

### Full stack via Docker (API + Postgres together)

```bash
# Requires SECRET_KEY in shell env or a .env file at repo root
docker compose up -d
```

Builds `backend/Dockerfile`, wires the `web` service to the `db` service over Docker's internal network.

## Project structure

```
backend/
  main.py           # FastAPI app, mounts static files at /
  auth.py           # JWT (HS256, 7-day expiry), bcrypt, get_current_user dep
  database.py       # SQLAlchemy engine, reads DATABASE_URL env var
  models.py         # User, Book, JournalEntry, ReadingGoal, ReadingLog (SQLAlchemy ORM)
  schemas.py        # Pydantic v2: BookCreate, BookUpdate, BookOut, Token, etc.
  routers/
    auth.py         # POST /auth/register, /auth/login, /auth/refresh
    books.py        # GET/POST /books/, GET/PATCH/DELETE /books/{id}, GET/POST /books/{id}/journal
    search.py       # GET /search/, /search/detail (auth required)
    goals.py        # GET/PUT/DELETE /goals/{year}
    reading_log.py  # GET /reading-log/, POST/DELETE /reading-log/{date}
  static/
    index.html      # Homepage — browse/discover (genre rows, stats bar, goal banner)
    shelf.html      # Personal shelf — tabbed by status, filter + sort
    login.html      # Login / register
    shared.css      # All shared styles + design tokens
    shared.js       # Shared utils: apiFetch, checkAuth, openBookDetail, openModal, makeBookCard, showToast, initCalendar, etc.
    browse.js       # Browse page logic: genre rows, shelf index, goal banner
    app.js          # Shelf page logic: loadShelf, renderGrid, applyFilterAndSort, saveBook
  Dockerfile        # python:3.12-slim, exposes 8000, runs `alembic upgrade head` then uvicorn
  alembic/versions/ # Schema migrations — 0001 is the baseline of all existing tables
  requirements.txt  # Full pip freeze (used by Dockerfile)
docker-compose.yml  # web + db services; web builds from backend/Dockerfile
```

## Environment

Copy `.env.example` → `.env` inside `backend/` and fill in values. The app will refuse to start if `SECRET_KEY` is missing.

Generate a key: `python3 -c "import secrets; print(secrets.token_hex(32))"`

## Database

Connection string lives in `.env` as `DATABASE_URL` (default: `postgresql://bookkeeper:bookkeeper@localhost:5432/books`).

## Migrations (Alembic)

Alembic is the only thing that changes the schema — `main.py` no longer calls `create_all`, and there are no manual `ALTER TABLE`s. The Docker image runs `alembic upgrade head` on every start, so pushing a migration to `master` applies it in production when Coolify redeploys. A failed migration stops the container rather than serving a mismatched schema.

After any change to `models.py`:

```bash
cd backend
venv/bin/alembic revision --autogenerate -m "describe the change"   # review the generated file in alembic/versions/
venv/bin/alembic upgrade head                                        # apply locally
venv/bin/alembic check                                               # "No new upgrade operations detected." = models and DB match
```

Commit the migration file together with the model change.

`0001_baseline_schema` creates every table that existed before Alembic took over. Databases that already had those tables (local and production) were marked as being at `0001` with `alembic stamp 0001` instead of running it. `0002` makes `books.user_id` NOT NULL — production had created it nullable before auth existed.

## Tests

Tests use a separate `books_test` database. Create it once:

```bash
docker compose exec db psql -U bookkeeper -d books -c "CREATE DATABASE books_test;"
```

Run tests (from `backend/`):

```bash
venv/bin/pytest
```

Tests use a transaction-rollback fixture — each test is isolated and leaves no data behind. 39 tests across `test_auth.py`, `test_books.py`, `test_reading_log.py`.

## Key architectural notes

### Auth
- JWT stored in `localStorage` as `bk_token`, username as `bk_username`
- `checkAuth()` in shared.js silently refreshes on page load when token is within 24h of expiry
- `apiFetch` retries once on 401 before redirecting to `/login.html`
- `SECRET_KEY` missing → `RuntimeError` at startup (no silent fallback)

### Search sources
`GET /search/` fires Open Library + Google Books in parallel, merges and deduplicates by ISBN then title+author. OL results take priority. Google Books IDs are stored as `gb:<volumeId>` in the `open_library_key` field. `GET /search/detail` routes to the right API based on the `gb:` prefix. Both endpoints require auth.

### Frontend script loading
Scripts are plain (non-module) files sharing global scope. Cache-busting via `?v=N` query params — bump the version in the HTML `<script>`/`<link>` tag whenever a JS or CSS file changes. `shared.js` and `shared.css` are referenced from both `index.html` and `shelf.html`; bump both.

**Current versions:**
- `shared.css?v=1`
- `shared.js?v=15`
- `browse.js?v=11`
- `app.js?v=23`

### Reading Tracker
`current_page` and `total_pages` on the Book model. All tracker code is wrapped in `/* ══ Reading Tracker (removable) ══ */` comment blocks for easy removal. Journal entries save to the `journal_entries` table via `POST /books/{id}/journal` and display as a list in the shelf modal. The `notes` field is free-form text, separate from journal entries.

### Reading calendar (backend only)
Daily reading log stored in the `reading_log` table (unique constraint on `user_id + date`). `POST /reading-log/{date}` marks a day; `DELETE /reading-log/{date}` unmarks it. Future dates rejected with 400. Both return `{"date": "...", "marked": bool}`. The frontend calendar widget has been removed — the API and tests remain in place.

### On-shelf indicator (browse page)
`loadShelfIndex()` in browse.js fetches all user books on init and builds `_shelfIndex` keyed by `i:<isbn>` and `k:<open_library_key>`. It also derives the stats bar counts from the same response (no separate API calls). Browse cards show a green ✓ badge if the book is already on the shelf. The detail panel shows the current status instead of "Add to Shelf".

### Reading goal
Persisted in the `reading_goals` table via `GET/PUT/DELETE /goals/{year}`. `GET` always returns 200 (`target: 0` if not set) to avoid spurious 404 toasts. `localStorage` (`bk_goal_<year>`) is kept in sync as a client-side cache. Click the count text in the goal banner to set/change the target.

### Year filter (shelf)
On the "Read" tab, a year `<select>` appears in the filter bar when there are books with `date_read` set. Filters the grid client-side from `_shelfBooks` without re-fetching.

## Deployment

Production is https://bookkeeping.juntopia.tech, deployed by **Coolify** on a Hostinger VPS from `master` of `github.com/Jfrancisjr21/bookkeeping` (builds `backend/Dockerfile`). Workflow: change locally → test → commit → push → Coolify redeploys. `/root/projects/bookkeeping` on the VPS is an old manual clone and is **not** what's served.

## Common gotchas

- Homebrew Postgres conflicts with Docker on port 5432 — stop it with `brew services stop postgresql@<version>` before running Docker
- `psycopg2` must be `psycopg2-binary` on Python 3.13
- `dashboard.html`, `dashboard.js`, `home.js`, `browse.html` have been deleted — do not recreate them
- `docker compose up` of the `web` service on Apple Silicon crashes with exit code 132 (illegal instruction in `cryptography`'s native code). Build with `--platform linux/amd64` to match the server, or run the API from the venv
- Test DB setup command needs `-d books` flag: `psql -U bookkeeper -d books -c "CREATE DATABASE books_test;"`
