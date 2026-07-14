let activeTab = "reading";
let _initialLoad = true;
let _shelfBooks = [];
let _sortBy = "default";
let _yearFilter = "";

document.addEventListener("DOMContentLoaded", async () => {
  if (!await checkAuth()) return;

  const username = localStorage.getItem("bk_username");
  if (username) document.getElementById("dropdown-username").textContent = username;

  document.getElementById("user-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("user-dropdown").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
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
          open_library_key: book.open_library_key || null, status,
        }),
      });
      if (result) {
        if (btn) btn.textContent = "✓ Added";
        if (activeTab === status) loadShelf();
      } else {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      }
    });
  });

  function closeHeaderSearch() {
    document.getElementById("header-search").classList.remove("open");
    document.getElementById("search-icon-btn").classList.remove("active");
    document.getElementById("header-search-input").value = "";
    document.getElementById("header-search-results").innerHTML = "";
    // shelf-filter retains the value — grid stays filtered, no jarring reset
  }

  document.getElementById("search-icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = document.getElementById("header-search").classList.toggle("open");
    document.getElementById("search-icon-btn").classList.toggle("active", open);
    if (open) {
      const headerInput = document.getElementById("header-search-input");
      headerInput.value = document.getElementById("shelf-filter").value;
      headerInput.focus();
    } else {
      closeHeaderSearch();
    }
  });
  document.getElementById("header-search-close").addEventListener("click", closeHeaderSearch);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHeaderSearch();
      closeBookDetail();
      document.getElementById("user-dropdown").classList.remove("open");
    }
  });

  let headerSearchTimer;
  document.getElementById("header-search-input").addEventListener("input", () => {
    clearTimeout(headerSearchTimer);
    const q = document.getElementById("header-search-input").value;
    document.getElementById("header-search-results").innerHTML = "";
    document.getElementById("shelf-filter").value = q;
    headerSearchTimer = setTimeout(() => applyFilterAndSort(), 150);
  });

  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab && ["reading", "plan_to_read", "read"].includes(urlTab)) {
    activeTab = urlTab;
    document.querySelectorAll(".sidebar nav button[data-tab]").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === activeTab);
    });
  }

  loadShelf();
  initCalendar();

  document.getElementById("year-filter").addEventListener("change", () => {
    _yearFilter = document.getElementById("year-filter").value;
    applyFilterAndSort();
  });

  document.getElementById("shelf-filter").addEventListener("input", () => {
    const headerSearch = document.getElementById("header-search");
    if (headerSearch.classList.contains("open")) {
      document.getElementById("header-search-input").value = document.getElementById("shelf-filter").value;
    }
    applyFilterAndSort();
  });

  const sortIconBtn = document.getElementById("sort-icon-btn");
  const sortDropdown = document.getElementById("sort-dropdown");
  sortIconBtn.addEventListener("click", e => {
    e.stopPropagation();
    sortDropdown.classList.toggle("open");
  });
  document.addEventListener("click", e => {
    if (!e.target.closest("#sort-picker")) sortDropdown.classList.remove("open");
  });
  document.querySelectorAll(".sort-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      _sortBy = opt.dataset.sort;
      document.querySelectorAll(".sort-opt").forEach(o => o.classList.toggle("active", o === opt));
      sortIconBtn.classList.toggle("active", _sortBy !== "default");
      sortDropdown.classList.remove("open");
      applyFilterAndSort();
    });
  });

  document.getElementById("menu-btn").addEventListener("click", openSidebar);
  document.getElementById("home-btn").addEventListener("click", goHome);
  document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);
  document.getElementById("sidebar-home-btn").addEventListener("click", goHome);

  document.querySelectorAll(".sidebar nav button[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sidebar nav button[data-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      loadShelf();
      closeSidebar();
    });
  });

  document.getElementById("modal-date-na").addEventListener("change", e => {
    const dateInput = document.getElementById("modal-date-read");
    if (e.target.checked) { dateInput.value = ""; dateInput.disabled = true; }
    else { dateInput.disabled = false; }
  });
  document.getElementById("modal-date-read").addEventListener("change", () => {
    document.getElementById("modal-date-na").checked = false;
  });
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", saveBook);
  document.getElementById("modal-delete").addEventListener("click", deleteCurrentBook);

  document.querySelectorAll(".star").forEach(star => {
    star.addEventListener("click", () => {
      const v = parseInt(star.dataset.v);
      currentRating = currentRating === v ? null : v;
      renderStars(currentRating);
    });
  });
});

// ── Navigation ────────────────────────────────────────────────
function goHome() {
  window.location.href = "/";
}

// ── Shelf ─────────────────────────────────────────────────────
async function loadShelf() {
  document.getElementById("shelf-filter").value = "";
  _sortBy = "default";
  _yearFilter = "";
  document.querySelectorAll(".sort-opt").forEach(o => o.classList.toggle("active", o.dataset.sort === "default"));
  document.getElementById("sort-icon-btn").classList.remove("active");
  const grid = document.getElementById("book-grid");
  grid.innerHTML = "";
  const books = await apiFetch(`/books/?status=${activeTab}`);
  if (_initialLoad) {
    _initialLoad = false;
    document.getElementById("page-loader").classList.add("hidden");
    document.getElementById("shelf-content").classList.remove("hidden");
  }
  _shelfBooks = books || [];
  _updateYearFilter(_shelfBooks);
  renderGrid(_shelfBooks, "");
}

function applyFilterAndSort() {
  const q = document.getElementById("shelf-filter").value.trim().toLowerCase();
  const filtered = _shelfBooks.filter(b => {
    const matchText = !q || b.title.toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q);
    const matchYear = !_yearFilter || (b.date_read && b.date_read.startsWith(_yearFilter));
    return matchText && matchYear;
  });
  renderGrid(sortBooks(filtered), q);
}

function sortBooks(books) {
  if (_sortBy === "default") return books;
  const copy = [...books];
  if (_sortBy === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (_sortBy === "author") {
    copy.sort((a, b) => (a.author || "").localeCompare(b.author || ""));
  } else if (_sortBy === "rating") {
    copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  } else if (_sortBy === "date_read") {
    copy.sort((a, b) => {
      if (!a.date_read && !b.date_read) return 0;
      if (!a.date_read) return 1;
      if (!b.date_read) return -1;
      return b.date_read.localeCompare(a.date_read);
    });
  }
  return copy;
}

function _updateYearFilter(books) {
  const sel = document.getElementById("year-filter");
  if (activeTab !== "read") {
    sel.hidden = true;
    return;
  }
  const years = [...new Set(
    books.filter(b => b.date_read).map(b => b.date_read.slice(0, 4))
  )].sort().reverse();
  sel.innerHTML = '<option value="">All years</option>';
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
  sel.hidden = years.length === 0;
}

function renderGrid(books, query) {
  const grid = document.getElementById("book-grid");
  grid.innerHTML = "";
  if (!books.length) {
    grid.innerHTML = query
      ? `<div class="empty-state">No books match "${esc(query)}".</div>`
      : `<div class="empty-state">No books here yet — browse and add some from the home page.</div>`;
    return;
  }
  books.forEach(book => grid.appendChild(makeBookCard(book)));
}

// ── Save / delete (shelf reloads its grid) ────────────────────
async function saveBook() {
  if (!currentBookId) return;
  const titleVal = document.getElementById("modal-title").value.trim();
  if (!titleVal) { showToast("Title can't be empty."); return; }
  // ══ Reading Tracker (removable) ══
  const pageInput = document.getElementById("tracker-current-page");
  // ══ End Reading Tracker ══
  const coverUrlInput = document.getElementById("modal-cover-url");
  const result = await apiFetch(`/books/${currentBookId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: titleVal,
      author: document.getElementById("modal-author").value.trim() || null,
      cover_url: coverUrlInput ? (coverUrlInput.value.trim() || null) : undefined,
      status: document.getElementById("modal-status").value,
      rating: currentRating,
      notes: document.getElementById("modal-notes").value || null,
      date_read: document.getElementById("modal-date-read").value || null,
      current_page: pageInput ? (parseInt(pageInput.value) || null) : undefined,
      total_pages: _currentBookTotalPages || undefined,
    }),
  });
  if (result) { closeModal(); loadShelf(); }
}

async function deleteCurrentBook() {
  if (!currentBookId) return;
  if (!confirm("Remove this book from your shelf?")) return;
  await apiFetch(`/books/${currentBookId}`, { method: "DELETE" });
  closeModal();
  loadShelf();
}
