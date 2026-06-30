let activeTab = "reading";
let currentBookId = null;
let currentRating = null;
let _pendingBook = null;
let _pendingBtn = null;
let _pendingBtnText = "";

function openStatusModal(bookData, btn) {
  _pendingBook = bookData;
  _pendingBtn = btn;
  _pendingBtnText = btn ? btn.textContent : "";
  document.getElementById("status-modal-book").textContent =
    bookData.title + (bookData.author ? " · " + bookData.author : "");
  document.getElementById("status-modal-overlay").classList.add("open");
}

function closeStatusModal() {
  document.getElementById("status-modal-overlay").classList.remove("open");
  _pendingBook = null; _pendingBtn = null; _pendingBtnText = "";
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("bk_token")) {
    window.location.href = "/login.html";
    return;
  }

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
    window.location.href = "/login.html";
  });

  // ── Detail modal ──────────────────────────────────────
  document.getElementById("detail-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.getElementById("detail-close").addEventListener("click", closeDetailModal);

  // ── Status picker modal ───────────────────────────────
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

  // ── Header search ─────────────────────────────────────
  function closeHeaderSearch() {
    document.getElementById("header-search").classList.remove("open");
    document.getElementById("search-icon-btn").classList.remove("active");
    document.getElementById("header-search-input").value = "";
    document.getElementById("header-search-results").innerHTML = "";
  }

  document.getElementById("search-icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = document.getElementById("header-search").classList.toggle("open");
    document.getElementById("search-icon-btn").classList.toggle("active", open);
    if (open) document.getElementById("header-search-input").focus();
    else closeHeaderSearch();
  });

  document.getElementById("header-search-close").addEventListener("click", closeHeaderSearch);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHeaderSearch();
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

  loadShelf();

  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab && ["reading", "plan_to_read", "read"].includes(urlTab)) {
    activeTab = urlTab;
    document.querySelectorAll(".sidebar nav button[data-tab]").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === activeTab);
    });
  }

  document.getElementById("search-btn").addEventListener("click", runSearch);
  document.getElementById("search-input").addEventListener("keydown", e => {
    if (e.key === "Enter") runSearch();
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
    if (e.target.checked) {
      dateInput.value = "";
      dateInput.disabled = true;
    } else {
      dateInput.disabled = false;
    }
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

// ── Sidebar ───────────────────────────────────────────────────
function goHome() {
  window.location.href = "/";
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

// ── Search ────────────────────────────────────────────────────
async function runSearch() {
  const q = document.getElementById("search-input").value.trim();
  if (!q) return;
  const container = document.getElementById("search-results");
  container.innerHTML = '<span class="search-hint">Searching…</span>';
  const results = await apiFetch(`/search/?q=${encodeURIComponent(q)}&limit=12`);
  container.innerHTML = "";
  if (!results || !results.length) {
    container.innerHTML = '<span class="search-hint">No results found.</span>';
    return;
  }
  results.forEach(r => container.appendChild(makeSearchCard(r)));
}

function makeSearchCard(r) {
  const card = document.createElement("div");
  card.className = "search-card";

  const coverWrap = document.createElement("div");
  coverWrap.className = "cover-wrap";
  coverWrap.appendChild(makeCoverEl(r.cover_url, r.title, r.author));

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = `<div class="card-title">${esc(r.title)}</div><div class="card-author">${esc(r.author || "Unknown")}</div>`;

  const addBtn = document.createElement("button");
  addBtn.className = "add-btn";
  addBtn.textContent = "+ Add to shelf";
  addBtn.addEventListener("click", () => addBook(r, addBtn));

  card.append(coverWrap, meta, addBtn);
  return card;
}

function addBook(bookData, btn) {
  openStatusModal(bookData, btn);
}

// ── Shelf ─────────────────────────────────────────────────────
async function loadShelf() {
  const grid = document.getElementById("book-grid");
  grid.innerHTML = "";
  const books = await apiFetch(`/books/?status=${activeTab}`);
  if (!books || !books.length) {
    grid.innerHTML = `<div class="empty-state">No books here yet — search and add some above.</div>`;
    return;
  }
  books.forEach(book => grid.appendChild(makeBookCard(book)));
}

function makeBookCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";

  const coverWrap = document.createElement("div");
  coverWrap.className = "cover-wrap";
  coverWrap.appendChild(makeCoverEl(book.cover_url, book.title, book.author));

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const stars = book.rating ? "★".repeat(book.rating) + "☆".repeat(5 - book.rating) : "";
  meta.innerHTML = `
    <div class="card-title">${esc(book.title)}</div>
    <div class="card-author">${esc(book.author)}</div>
    ${stars ? `<div class="card-stars">${stars}</div>` : ""}
  `;

  card.append(coverWrap, meta);
  card.addEventListener("click", () => openDetailModal(book));
  return card;
}

function makeCoverEl(coverUrl, title, author) {
  if (coverUrl) {
    const img = document.createElement("img");
    img.className = "cover-img";
    img.src = coverUrl;
    img.alt = title;
    img.onerror = () => {
      const ph = makePlaceholder(title, author);
      img.replaceWith(ph);
    };
    return img;
  }
  return makePlaceholder(title, author);
}

function makePlaceholder(title, author) {
  const div = document.createElement("div");
  div.className = "cover-placeholder";
  div.innerHTML = `<div class="ph-title">${esc(title)}</div><div class="ph-author">${esc(author || "")}</div>`;
  return div;
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(book) {
  currentBookId = book.id;
  currentRating = book.rating || null;

  document.getElementById("modal-title").textContent = book.title;
  document.getElementById("modal-author").textContent = book.author;
  document.getElementById("modal-status").value = book.status;
  document.getElementById("modal-notes").value = book.notes || "";
  const dateInput = document.getElementById("modal-date-read");
  const dateNa = document.getElementById("modal-date-na");
  dateInput.value = book.date_read || "";
  dateInput.disabled = false;
  dateNa.checked = false;

  const coverEl = document.getElementById("modal-cover");
  coverEl.innerHTML = "";
  if (book.cover_url) {
    const img = document.createElement("img");
    img.src = book.cover_url;
    img.alt = book.title;
    img.onerror = () => {
      img.replaceWith(makePlaceholderFull(book.title));
    };
    coverEl.appendChild(img);
  } else {
    coverEl.appendChild(makePlaceholderFull(book.title));
  }

  renderStars(currentRating);
  document.getElementById("modal-overlay").classList.add("open");
}

function makePlaceholderFull(title) {
  const div = document.createElement("div");
  div.className = "modal-cover-placeholder";
  div.textContent = title;
  return div;
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  currentBookId = null;
}

function renderStars(rating) {
  document.querySelectorAll(".star").forEach(s => {
    s.classList.toggle("lit", parseInt(s.dataset.v) <= (rating || 0));
  });
}

async function saveBook() {
  if (!currentBookId) return;
  const result = await apiFetch(`/books/${currentBookId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: document.getElementById("modal-status").value,
      rating: currentRating,
      notes: document.getElementById("modal-notes").value || null,
      date_read: document.getElementById("modal-date-read").value || null,
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

// ── Detail modal ──────────────────────────────────────────────
const STATUS_LABELS = { reading: "Currently Reading", plan_to_read: "Want to Read", read: "Read" };

function openDetailModal(book) {
  const coverEl = document.getElementById("detail-cover");
  coverEl.innerHTML = "";
  if (book.cover_url) {
    const img = document.createElement("img");
    img.src = book.cover_url;
    img.alt = book.title;
    img.onerror = () => img.replaceWith(makeDetailPlaceholder(book.title));
    coverEl.appendChild(img);
  } else {
    coverEl.appendChild(makeDetailPlaceholder(book.title));
  }
  document.getElementById("detail-title").textContent = book.title;
  document.getElementById("detail-author").textContent = book.author;
  document.getElementById("detail-badge").textContent = STATUS_LABELS[book.status] || book.status;
  document.getElementById("detail-stars").textContent =
    book.rating ? "★".repeat(book.rating) + "☆".repeat(5 - book.rating) : "";
  const notesEl = document.getElementById("detail-notes");
  notesEl.textContent = book.notes ? `"${book.notes}"` : "";
  notesEl.style.display = book.notes ? "" : "none";
  document.getElementById("detail-edit-btn").onclick = () => { closeDetailModal(); openModal(book); };
  document.getElementById("detail-overlay").classList.add("open");
}

function closeDetailModal() {
  document.getElementById("detail-overlay").classList.remove("open");
}

function makeDetailPlaceholder(title) {
  const div = document.createElement("div");
  div.className = "detail-cover-ph";
  div.textContent = title;
  return div;
}

// ── Header search ─────────────────────────────────────────────
async function runHeaderSearch(q) {
  const container = document.getElementById("header-search-results");
  if (!container) return;
  const results = await apiFetch(`/search/?q=${encodeURIComponent(q)}&limit=8`);
  container.innerHTML = "";
  if (!results || !results.length) {
    container.innerHTML = '<div class="header-search-hint">No results found.</div>';
    return;
  }
  results.forEach(r => {
    const item = document.createElement("div");
    item.className = "header-result-item";

    const cover = document.createElement("div");
    cover.className = "header-result-cover";
    if (r.cover_url) {
      const img = document.createElement("img");
      img.src = r.cover_url;
      img.alt = r.title;
      cover.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "header-result-info";
    info.innerHTML = `<div class="header-result-title">${esc(r.title)}</div><div class="header-result-author">${esc(r.author || "Unknown")}</div>`;

    const btn = document.createElement("button");
    btn.className = "header-add-btn";
    btn.textContent = "+ Add";
    btn.addEventListener("click", () => openStatusModal(r, btn));

    item.append(cover, info, btn);
    container.appendChild(item);
  });
}

// ── API ───────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("bk_token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("bk_token");
    window.location.href = "/login.html";
    return null;
  }
  if (!res.ok) { console.error("API", res.status, url); return null; }
  if (res.status === 204) return null;
  return res.json();
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
