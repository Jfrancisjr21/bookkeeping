from fastapi import APIRouter
import httpx

router = APIRouter(prefix="/search", tags=["search"])

OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json"
COVER_BASE = "https://covers.openlibrary.org/b/id/{}-M.jpg"


@router.get("/")
async def search_books(q: str, limit: int = 10):
    fields = "title,author_name,isbn,cover_i,key,first_publish_year"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            OPEN_LIBRARY_SEARCH,
            params={"q": q, "limit": limit, "fields": fields},
        )
        resp.raise_for_status()
        data = resp.json()

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
        })
    return results
