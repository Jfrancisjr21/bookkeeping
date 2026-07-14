let _shelfIndex = {};
const _GOAL_KEY = `bk_goal_${new Date().getFullYear()}`;
const _GOAL_YEAR = new Date().getFullYear();

function _countReadThisYear(books) {
  return (books || []).filter(b => {
    if (b.status !== "read") return false;
    const d = b.date_read || (b.date_added || "").slice(0, 10);
    return d.startsWith(String(_GOAL_YEAR));
  }).length;
}

function _renderGoal(readThisYear) {
  const goal = parseInt(localStorage.getItem(_GOAL_KEY)) || 0;
  const labelEl  = document.getElementById("goal-year-label");
  const barWrap  = document.getElementById("goal-bar-wrap");
  const fillEl   = document.getElementById("goal-bar-fill");
  const countEl  = document.getElementById("goal-count");

  if (goal) {
    const pct = Math.min(100, Math.round(readThisYear / goal * 100));
    labelEl.textContent  = `${_GOAL_YEAR} Reading Goal`;
    barWrap.hidden = false;
    fillEl.style.width   = `${pct}%`;
    countEl.textContent  = `${readThisYear} of ${goal}`;
  } else {
    labelEl.textContent  = `${_GOAL_YEAR}`;
    barWrap.hidden = true;
    countEl.textContent  = `${readThisYear} book${readThisYear !== 1 ? "s" : ""} read · set a goal`;
  }
}

function _shelfEntry(book) {
  if (book.isbn && _shelfIndex[`i:${book.isbn}`]) return _shelfIndex[`i:${book.isbn}`];
  if (book.open_library_key && _shelfIndex[`k:${book.open_library_key}`]) return _shelfIndex[`k:${book.open_library_key}`];
  return null;
}

async function loadShelfIndex() {
  const [books, goal] = await Promise.all([
    apiFetch("/books/"),
    apiFetch(`/goals/${_GOAL_YEAR}`),
  ]);
  if (!books) return;
  _shelfIndex = {};
  books.forEach(b => {
    const entry = { status: b.status, id: b.id };
    if (b.isbn) _shelfIndex[`i:${b.isbn}`] = entry;
    if (b.open_library_key) _shelfIndex[`k:${b.open_library_key}`] = entry;
  });
  // Derive stats from the same fetch — no separate API calls needed
  document.getElementById("stat-reading").textContent = books.filter(b => b.status === "reading").length;
  document.getElementById("stat-want").textContent    = books.filter(b => b.status === "plan_to_read").length;
  document.getElementById("stat-read").textContent    = books.filter(b => b.status === "read").length;
  // Sync localStorage from API so _renderGoal picks it up
  const target = goal ? goal.target : 0;
  if (target > 0) localStorage.setItem(_GOAL_KEY, String(target));
  else localStorage.removeItem(_GOAL_KEY);
  _renderGoal(_countReadThisYear(books));
}

function _markCardOnShelf(book) {
  const isbn = book.isbn, key = book.open_library_key;
  document.querySelectorAll(".book-card").forEach(card => {
    if ((isbn && card.dataset.isbn === isbn) || (key && card.dataset.olkey === key)) {
      if (!card.querySelector(".shelf-check-badge")) {
        const badge = document.createElement("div");
        badge.className = "shelf-check-badge";
        badge.textContent = "✓";
        card.querySelector(".cover-wrap").appendChild(badge);
      }
    }
  });
}

const GENRES = [
  { label: "Popular Right Now",   query: "bestseller popular fiction novel" },
  { label: "Science Fiction",     query: "science fiction award winner" },
  { label: "Mystery & Thriller",  query: "mystery thriller suspense detective" },
  { label: "Fantasy",             query: "fantasy epic magic award" },
  { label: "Biography & Memoir",  query: "biography memoir autobiography" },
  { label: "History",             query: "history nonfiction popular" },
  { label: "Romance",             query: "romance bestseller fiction" },
  { label: "Horror",              query: "horror dark fiction suspense" },
];

document.addEventListener("DOMContentLoaded", async () => {
  if (!await checkAuth()) return;

  const username = localStorage.getItem("bk_username");
  if (username) document.getElementById("dropdown-username").textContent = username;

  document.getElementById("user-btn").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("user-dropdown").classList.toggle("open");
  });
  document.addEventListener("click", e => {
    document.getElementById("user-dropdown").classList.remove("open");
    if (!e.target.closest("#header-search") && !e.target.closest("#search-icon-btn")) {
      closeHeaderSearch();
    }
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.removeItem("bk_token");
    localStorage.removeItem("bk_username");
    window.location.href = "/login.html";
  });

  function closeHeaderSearch() {
    document.getElementById("header-search").classList.remove("open");
    document.getElementById("search-icon-btn").classList.remove("active");
    document.getElementById("header-search-input").value = "";
    document.getElementById("header-search-results").innerHTML = "";
  }
  document.getElementById("search-icon-btn").addEventListener("click", e => {
    e.stopPropagation();
    const open = document.getElementById("header-search").classList.toggle("open");
    document.getElementById("search-icon-btn").classList.toggle("active", open);
    if (open) document.getElementById("header-search-input").focus();
    else closeHeaderSearch();
  });
  document.getElementById("header-search-close").addEventListener("click", closeHeaderSearch);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeHeaderSearch();
      closeBookDetail();
      document.getElementById("user-dropdown").classList.remove("open");
    }
  });
  let headerSearchTimer;
  document.getElementById("header-search-input").addEventListener("input", () => {
    clearTimeout(headerSearchTimer);
    const q = document.getElementById("header-search-input").value.trim();
    if (!q) { document.getElementById("header-search-results").innerHTML = ""; return; }
    document.getElementById("header-search-results").innerHTML = '<div class="header-search-hint">Searching…</div>';
    headerSearchTimer = setTimeout(() => runHeaderSearch(q), 350);
  });

  document.getElementById("menu-btn").addEventListener("click", openSidebar);
  document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);
  document.getElementById("sidebar-shelf-btn").addEventListener("click", () => {
    window.location.href = "/shelf.html";
    closeSidebar();
  });
  document.querySelectorAll(".sidebar nav button[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `/shelf.html?tab=${btn.dataset.tab}`;
    });
  });

  document.getElementById("book-detail-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeBookDetail();
  });
  document.getElementById("book-detail-close").addEventListener("click", closeBookDetail);

  document.getElementById("status-modal-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeStatusModal();
  });
  document.getElementById("status-modal-cancel").addEventListener("click", closeStatusModal);
  document.querySelectorAll(".status-opt").forEach(opt => {
    opt.addEventListener("click", async () => {
      if (!_pendingBook) return;
      const book = _pendingBook, btn = _pendingBtn, btnText = _pendingBtnText;
      const status = opt.dataset.status;
      closeStatusModal();
      if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
      const result = await apiFetch("/books/", {
        method: "POST",
        body: JSON.stringify({
          title: book.title, author: book.author,
          isbn: book.isbn || null, cover_url: book.cover_url || null,
          open_library_key: book.open_library_key || null,
          first_publish_year: book.first_publish_year || null, status,
        }),
      });
      if (result) {
        const entry = { status, id: result.id };
        if (book.isbn) _shelfIndex[`i:${book.isbn}`] = entry;
        if (book.open_library_key) _shelfIndex[`k:${book.open_library_key}`] = entry;
        _markCardOnShelf(book);
        if (btn) btn.textContent = "✓ Added";
        showToast("Added to your shelf!", "success");
        loadShelfIndex();
      } else {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      }
    });
  });

  loadShelfIndex();
  initCalendar();

  // Goal banner interactions
  const goalCount = document.getElementById("goal-count");
  const goalInput = document.getElementById("goal-input");

  goalCount.addEventListener("click", () => {
    goalInput.value = localStorage.getItem(_GOAL_KEY) || "";
    goalInput.hidden = false;
    goalCount.hidden = true;
    goalInput.focus();
    goalInput.select();
  });

  async function _commitGoal() {
    goalInput.hidden = true;
    goalCount.hidden = false;
    const val = parseInt(goalInput.value);
    if (val > 0) {
      localStorage.setItem(_GOAL_KEY, String(val));
      await apiFetch(`/goals/${_GOAL_YEAR}`, {
        method: "PUT",
        body: JSON.stringify({ target: val }),
      });
    } else {
      localStorage.removeItem(_GOAL_KEY);
      await apiFetch(`/goals/${_GOAL_YEAR}`, { method: "DELETE" });
    }
    apiFetch("/books/").then(books => { if (books) _renderGoal(_countReadThisYear(books)); });
  }

  goalInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { goalInput.blur(); }
    if (e.key === "Escape") { goalInput.hidden = true; }
  });
  goalInput.addEventListener("blur", _commitGoal);

  // Build genre row shells and observe them for lazy loading
  const container = document.getElementById("genre-rows");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      loadGenreRow(entry.target);
    });
  }, { rootMargin: "300px" });

  GENRES.forEach(genre => {
    const section = buildRowShell(genre);
    container.appendChild(section);
    observer.observe(section.querySelector(".row-scroll"));
  });

  // Delegated arrow click handler (rows are dynamic)
  container.addEventListener("click", e => {
    const arrow = e.target.closest(".row-arrow");
    if (!arrow) return;
    const scroll = arrow.closest(".row-wrapper").querySelector(".row-scroll");
    scroll.scrollBy({ left: parseInt(arrow.dataset.dir) * 640, behavior: "smooth" });
  });
});


function buildRowShell(genre) {
  const section = document.createElement("section");
  section.className = "shelf-section";
  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${esc(genre.label)}</h2>
    </div>
    <div class="row-wrapper">
      <button class="row-arrow left" data-dir="-1">‹</button>
      <div class="row-scroll" data-query="${esc(genre.query)}">
        <div class="row-loading">Loading…</div>
      </div>
      <button class="row-arrow right" data-dir="1">›</button>
    </div>
  `;
  return section;
}

async function loadGenreRow(scrollEl) {
  const query = scrollEl.dataset.query;
  const results = await apiFetch(`/search/?q=${encodeURIComponent(query)}&limit=20`);
  scrollEl.innerHTML = "";
  if (!results || !results.length) {
    scrollEl.innerHTML = '<div class="row-empty">No results found.</div>';
    return;
  }
  results.forEach(book => scrollEl.appendChild(makeBrowseCard(book)));
}

function makeBrowseCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";
  card.style.cursor = "pointer";
  if (book.isbn) card.dataset.isbn = book.isbn;
  if (book.open_library_key) card.dataset.olkey = book.open_library_key;

  const coverWrap = document.createElement("div");
  coverWrap.className = "cover-wrap";
  coverWrap.appendChild(makeCoverEl(book.cover_url, book.title, book.author));

  if (_shelfEntry(book)) {
    const badge = document.createElement("div");
    badge.className = "shelf-check-badge";
    badge.textContent = "✓";
    coverWrap.appendChild(badge);
  }

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = `
    <div class="card-title">${esc(book.title)}</div>
    <div class="card-author">${esc(book.author || "Unknown")}</div>
  `;

  card.append(coverWrap, meta);
  card.addEventListener("click", () => openBookDetail(book, false, _shelfEntry(book)));
  return card;
}
