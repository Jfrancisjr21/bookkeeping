from fastapi import APIRouter, Depends
import httpx
import asyncio
from models import User
from auth import get_current_user

router = APIRouter(prefix="/search", tags=["search"])

OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json"
OPEN_LIBRARY_BASE   = "https://openlibrary.org"
COVER_BASE          = "https://covers.openlibrary.org/b/id/{}-M.jpg"
GOOGLE_BOOKS_URL    = "https://www.googleapis.com/books/v1/volumes"


def _parse_ol(data: dict) -> list:
    results = []
    for doc in data.get("docs", []):
        cover_i = doc.get("cover_i")
        isbns = doc.get("isbn", [])
        results.append({
            "title": doc.get("title", ""),
            "author": ", ".join(doc.get("author_name", [])[:2]),
            "isbn": isbns[0] if isbns else None,
            "cover_url": COVER_BASE.format(cover_i) if cover_i else None,
            "open_library_key": doc.get("key"),
            "first_publish_year": doc.get("first_publish_year"),
        })
    return results


def _parse_gb(data: dict) -> list:
    results = []
    for item in data.get("items", []):
        info = item.get("volumeInfo", {})
        isbn = None
        for ident in info.get("industryIdentifiers", []):
            if ident.get("type") == "ISBN_13":
                isbn = ident["identifier"]
                break
        if not isbn:
            for ident in info.get("industryIdentifiers", []):
                if ident.get("type") == "ISBN_10":
                    isbn = ident["identifier"]
                    break
        images = info.get("imageLinks", {})
        raw = images.get("thumbnail") or images.get("smallThumbnail")
        cover_url = (
            raw.replace("http://", "https://")
               .replace("zoom=1", "zoom=0")
               .replace("&edge=curl", "")
            if raw else None
        )
        year_str = info.get("publishedDate", "")
        results.append({
            "title": info.get("title", ""),
            "author": ", ".join(info.get("authors", [])[:2]),
            "isbn": isbn,
            "cover_url": cover_url,
            "open_library_key": f"gb:{item['id']}",
            "first_publish_year": int(year_str[:4]) if year_str and year_str[:4].isdigit() else None,
        })
    return results


def _merge(ol: list, gb: list) -> list:
    """OL results take priority; GB fills in books not already present."""
    seen_isbns: set[str] = set()
    seen_titles: set[tuple] = set()
    out = []

    for r in ol:
        isbn = r.get("isbn")
        title_key = (r.get("title", "").lower().strip(), r.get("author", "").lower().strip())
        if isbn:
            if isbn in seen_isbns:
                continue
            seen_isbns.add(isbn)
        else:
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)
        out.append(r)

    for r in gb:
        isbn = r.get("isbn")
        title_key = (r.get("title", "").lower().strip(), r.get("author", "").lower().strip())
        if isbn and isbn in seen_isbns:
            continue
        if title_key in seen_titles:
            continue
        if isbn:
            seen_isbns.add(isbn)
        seen_titles.add(title_key)
        out.append(r)

    return out


@router.get("/")
async def search_books(q: str, limit: int = 10, _: User = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=10.0) as client:
        ol_resp, gb_resp = await asyncio.gather(
            client.get(
                OPEN_LIBRARY_SEARCH,
                params={"q": q, "limit": limit, "fields": "title,author_name,isbn,cover_i,key,first_publish_year"},
            ),
            client.get(
                GOOGLE_BOOKS_URL,
                params={"q": q, "maxResults": min(limit, 40), "printType": "books"},
            ),
            return_exceptions=True,
        )

    ol = _parse_ol(ol_resp.json()) if not isinstance(ol_resp, Exception) and ol_resp.is_success else []
    gb = _parse_gb(gb_resp.json()) if not isinstance(gb_resp, Exception) and gb_resp.is_success else []

    return _merge(ol, gb)


async def _detail_open_library(key: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        work_resp, ed_resp = await asyncio.gather(
            client.get(f"{OPEN_LIBRARY_BASE}{key}.json"),
            client.get(f"{OPEN_LIBRARY_BASE}{key}/editions.json", params={"limit": 5}),
            return_exceptions=True,
        )

    work = work_resp.json() if not isinstance(work_resp, Exception) and work_resp.is_success else {}
    editions = []
    if not isinstance(ed_resp, Exception) and ed_resp.is_success:
        editions = ed_resp.json().get("entries", [])

    desc = work.get("description", "")
    if isinstance(desc, dict):
        desc = desc.get("value", "")

    subjects = work.get("subjects", [])[:8]
    pages, publisher, publish_year = None, None, None
    for ed in editions:
        if not pages and ed.get("number_of_pages"):
            pages = ed["number_of_pages"]
        if not publisher and ed.get("publishers"):
            publisher = ed["publishers"][0]
        if not publish_year and ed.get("publish_date"):
            publish_year = ed["publish_date"]
        if pages and publisher and publish_year:
            break

    return {"description": desc, "subjects": subjects, "pages": pages, "publisher": publisher, "publish_year": publish_year}


async def _detail_google_books(volume_id: str) -> dict:
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(f"{GOOGLE_BOOKS_URL}/{volume_id}")

    if not resp.is_success:
        return {"description": "", "subjects": [], "pages": None, "publisher": None, "publish_year": None}

    info = resp.json().get("volumeInfo", {})
    year_str = info.get("publishedDate", "")

    images = info.get("imageLinks", {})
    raw = (images.get("extraLarge") or images.get("large") or
           images.get("medium") or images.get("small") or images.get("thumbnail"))
    cover_url = (
        raw.replace("http://", "https://").replace("&edge=curl", "")
        if raw else None
    )

    return {
        "description": info.get("description", ""),
        "subjects": info.get("categories", [])[:8],
        "pages": info.get("pageCount"),
        "publisher": info.get("publisher"),
        "publish_year": year_str[:4] if year_str else None,
        "cover_url": cover_url,
    }


@router.get("/detail")
async def book_detail(key: str, _: User = Depends(get_current_user)):
    if key.startswith("gb:"):
        return await _detail_google_books(key[3:])
    return await _detail_open_library(key)
