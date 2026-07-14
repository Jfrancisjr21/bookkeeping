// ── Shared state ─────────────────────────────────────────────
let currentBookId = null;
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth() + 1; // 1-12
let _calMarked = new Set();               // "YYYY-MM-DD" strings
let currentRating = null;
let _pendingBook = null;
let _pendingBtn = null;
let _pendingBtnText = "";
let _currentBookTotalPages = null; // reading tracker

const STATUS_LABELS = {
  reading: "Currently Reading",
  plan_to_read: "Want to Read",
  read: "Read",
};

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = "error") {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  clearTimeout(toast._hideTimer);
  toast.textContent = message;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
  toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ── API ───────────────────────────────────────────────────────
const API_ERROR_MESSAGES = {
  400: "Invalid request.",
  403: "You don't have permission to do that.",
  404: "Not found.",
  429: "Too many requests — slow down.",
  500: "Server error. Please try again.",
  502: "Server error. Please try again.",
  503: "Service unavailable. Please try again.",
};

function _jwtPayload(token) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}

async function _tryRefresh() {
  const token = localStorage.getItem("bk_token");
  if (!token) return false;
  try {
    const res = await fetch("/auth/refresh", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("bk_token", data.access_token);
    return true;
  } catch { return false; }
}

async function checkAuth() {
  const token = localStorage.getItem("bk_token");
  if (!token) { window.location.href = "/login.html"; return false; }
  const payload = _jwtPayload(token);
  if (!payload) { window.location.href = "/login.html"; return false; }
  const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
  if (expiresIn < 0) {
    localStorage.removeItem("bk_token");
    localStorage.removeItem("bk_username");
    window.location.href = "/login.html";
    return false;
  }
  if (expiresIn < 86400) await _tryRefresh();
  return true;
}

async function apiFetch(url, options = {}) {
  let res;
  try {
    const token = localStorage.getItem("bk_token");
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    showToast("Network error — check your connection.");
    return null;
  }
  if (res.status === 401 && !options._refreshed) {
    const refreshed = await _tryRefresh();
    if (refreshed) return apiFetch(url, { ...options, _refreshed: true });
    localStorage.removeItem("bk_token");
    localStorage.removeItem("bk_username");
    window.location.href = "/login.html";
    return null;
  }
  if (res.status === 401) {
    localStorage.removeItem("bk_token");
    localStorage.removeItem("bk_username");
    window.location.href = "/login.html";
    return null;
  }
  if (!res.ok) {
    console.error("API", res.status, url);
    showToast(API_ERROR_MESSAGES[res.status] || "Something went wrong. Please try again.");
    return null;
  }
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

// ── Status picker modal ───────────────────────────────────────
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
  _pendingBook = null;
  _pendingBtn = null;
  _pendingBtnText = "";
}

// ── Sidebar ───────────────────────────────────────────────────
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

// ── Cover helpers ─────────────────────────────────────────────
function makeCoverEl(coverUrl, title, author) {
  if (coverUrl) {
    const img = document.createElement("img");
    img.className = "cover-img";
    img.src = coverUrl;
    img.alt = title;
    img.onerror = () => img.replaceWith(makePlaceholder(title, author));
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

function makePlaceholderFull(title) {
  const div = document.createElement("div");
  div.className = "modal-cover-placeholder";
  div.textContent = title;
  return div;
}

// ── Book card ─────────────────────────────────────────────────
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

  // ══ Reading Tracker (removable) ══
  if (book.current_page) {
    const overlay = document.createElement("div");
    overlay.className = "book-card-progress-overlay";
    const label = document.createElement("span");
    label.className = "bcp-label";
    if (book.total_pages) {
      const pct = Math.min(100, Math.round(book.current_page / book.total_pages * 100));
      label.textContent = `p.${book.current_page} / ${book.total_pages} · ${pct}%`;
      const bar = document.createElement("div");
      bar.className = "bcp-bar";
      const fill = document.createElement("div");
      fill.className = "bcp-fill";
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      overlay.append(label, bar);
    } else {
      label.textContent = `p.${book.current_page}`;
      overlay.appendChild(label);
    }
    coverWrap.appendChild(overlay);
  }
  // ══ End Reading Tracker ══

  card.append(coverWrap, meta);
  card.addEventListener("click", () => openBookDetail(book, true));
  return card;
}

// ── Book detail panel ─────────────────────────────────────────
function openBookDetail(book, canEdit, shelfEntry = null) {
  const overlay = document.getElementById("book-detail-overlay");

  // Cover
  const coverEl = overlay.querySelector(".book-detail-cover-slot");
  coverEl.innerHTML = "";
  if (book.cover_url) {
    const img = document.createElement("img");
    img.className = "book-detail-cover-img";
    img.src = book.cover_url;
    img.alt = book.title;
    img.onerror = () => img.replaceWith(_detailCoverPh(book.title));
    coverEl.appendChild(img);
  } else {
    coverEl.appendChild(_detailCoverPh(book.title));
  }

  // Status badge (shelf books)
  const badgeEl = overlay.querySelector(".book-detail-badge");
  if (canEdit && book.status) {
    badgeEl.textContent = STATUS_LABELS[book.status] || book.status;
    badgeEl.style.display = "";
  } else {
    badgeEl.style.display = "none";
  }

  // Title / author
  overlay.querySelector(".book-detail-title").textContent = book.title;
  overlay.querySelector(".book-detail-author").textContent = book.author || "";

  // Stars (shelf books)
  const starsEl = overlay.querySelector(".book-detail-stars");
  starsEl.textContent = (canEdit && book.rating)
    ? "★".repeat(book.rating) + "☆".repeat(5 - book.rating) : "";

  // ══ Reading Tracker (removable) ══
  _currentBookTotalPages = null;
  const progressEl = overlay.querySelector(".book-detail-progress");
  if (progressEl) {
    if (canEdit && book.current_page) {
      progressEl.innerHTML = `<span class="bdp-text">Page ${book.current_page}</span>`;
      progressEl.style.display = "";
    } else {
      progressEl.style.display = "none";
    }
  }
  // ══ End Reading Tracker ══

  // Notes (shelf books)
  const notesEl = overlay.querySelector(".book-detail-notes");
  if (canEdit && book.notes) {
    notesEl.textContent = `"${book.notes}"`;
    notesEl.style.display = "";
  } else {
    notesEl.style.display = "none";
  }

  // Actions
  const actionsEl = overlay.querySelector(".book-detail-actions");
  actionsEl.innerHTML = "";
  if (canEdit) {
    const editBtn = document.createElement("button");
    editBtn.className = "btn-save";
    editBtn.textContent = "Annotate";
    editBtn.addEventListener("click", () => { closeBookDetail(); openModal(book); });
    actionsEl.appendChild(editBtn);
  } else if (shelfEntry) {
    const label = document.createElement("div");
    label.className = "on-shelf-label";
    label.textContent = "✓ " + (STATUS_LABELS[shelfEntry.status] || "On Shelf");
    actionsEl.appendChild(label);
  } else {
    const addBtn = document.createElement("button");
    addBtn.className = "btn-save";
    addBtn.textContent = "+ Add to Shelf";
    addBtn.addEventListener("click", () => { closeBookDetail(); openStatusModal(book, null); });
    actionsEl.appendChild(addBtn);
  }

  // Description — loading state
  const descEl = overlay.querySelector(".book-detail-desc");
  descEl.textContent = "Loading description…";
  descEl.classList.add("loading");

  // Meta / subjects — clear while loading
  overlay.querySelector(".book-detail-meta-list").innerHTML = "";
  overlay.querySelector(".book-detail-subjects").innerHTML = "";

  overlay.classList.add("open");

  // Async fetch extended info
  const key = book.open_library_key;
  if (key) {
    apiFetch(`/search/detail?key=${encodeURIComponent(key)}`).then(detail => {
      if (!detail) { descEl.textContent = ""; descEl.classList.remove("loading"); return; }

      // Upgrade cover to highest-res available (Google Books only)
      if (detail.cover_url) {
        const coverSlot = overlay.querySelector(".book-detail-cover-slot");
        const img = document.createElement("img");
        img.className = "book-detail-cover-img";
        img.src = detail.cover_url;
        img.alt = book.title;
        img.onerror = () => {}; // keep existing cover on failure
        coverSlot.innerHTML = "";
        coverSlot.appendChild(img);
      }

      descEl.textContent = detail.description || "";
      descEl.classList.remove("loading");

      // Subjects pills
      const subjectsEl = overlay.querySelector(".book-detail-subjects");
      (detail.subjects || []).slice(0, 6).forEach(s => {
        const pill = document.createElement("span");
        pill.className = "book-detail-subject";
        pill.textContent = s;
        subjectsEl.appendChild(pill);
      });

      // Metadata list
      const metaEl = overlay.querySelector(".book-detail-meta-list");
      const startedVal = canEdit && book.started_reading_at
        ? new Date(book.started_reading_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null;
      const items = [
        { label: "Pages",     value: detail.pages },
        { label: "Published", value: detail.publish_year },
        { label: "Publisher", value: detail.publisher },
        { label: "ISBN",      value: book.isbn },
        { label: "Started",   value: startedVal },
      ].filter(i => i.value);
      metaEl.innerHTML = items.map(i => `
        <div class="book-meta-item">
          <span class="book-meta-label">${esc(i.label)}</span>
          <span class="book-meta-value">${esc(String(i.value))}</span>
        </div>
      `).join("");

      // ══ Reading Tracker (removable) ══
      _currentBookTotalPages = detail.pages || null;
      if (progressEl && canEdit && book.current_page && detail.pages) {
        const pct = Math.min(100, Math.round(book.current_page / detail.pages * 100));
        progressEl.innerHTML = `
          <span class="bdp-text">Page ${book.current_page} of ${detail.pages} · ${pct}%</span>
          <div class="bdp-bar-wrap"><div class="bdp-bar-fill" style="width:${pct}%"></div></div>`;
      }
      // ══ End Reading Tracker ══
    });
  } else {
    descEl.textContent = "";
    descEl.classList.remove("loading");
    if (book.isbn) {
      overlay.querySelector(".book-detail-meta-list").innerHTML = `
        <div class="book-meta-item">
          <span class="book-meta-label">ISBN</span>
          <span class="book-meta-value">${esc(book.isbn)}</span>
        </div>`;
    }
  }
}

function closeBookDetail() {
  const overlay = document.getElementById("book-detail-overlay");
  if (overlay) overlay.classList.remove("open");
}

function _detailCoverPh(title) {
  const div = document.createElement("div");
  div.className = "book-detail-cover-ph";
  div.textContent = title;
  return div;
}

// ── Edit modal ────────────────────────────────────────────────
function openModal(book) {
  currentBookId = book.id;
  currentRating = book.rating || null;

  document.getElementById("modal-title").value = book.title;
  document.getElementById("modal-author").value = book.author || "";
  document.getElementById("modal-status").value = book.status;
  document.getElementById("modal-notes").value = book.notes || "";

  const dateInput = document.getElementById("modal-date-read");
  const dateNa = document.getElementById("modal-date-na");
  dateInput.value = book.date_read || "";
  dateInput.disabled = false;
  dateNa.checked = false;

  const coverEl = document.getElementById("modal-cover");
  function _refreshCoverPreview(url) {
    coverEl.innerHTML = "";
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.onerror = () => img.replaceWith(makePlaceholderFull(document.getElementById("modal-title").value));
      coverEl.appendChild(img);
    } else {
      coverEl.appendChild(makePlaceholderFull(document.getElementById("modal-title").value));
    }
  }
  _refreshCoverPreview(book.cover_url);


  renderStars(currentRating);

  // ══ Reading Tracker (removable) ══
  const pageInput = document.getElementById("tracker-current-page");
  if (pageInput) {
    pageInput.value = book.current_page || "";
    _updateTrackerBar();
    pageInput.oninput = _updateTrackerBar;
  }
  const compose = document.getElementById("tracker-compose");
  const entryText = document.getElementById("tracker-entry-text");
  const entryBtn = document.getElementById("tracker-entry-btn");
  if (compose) compose.hidden = true;
  if (entryText) entryText.value = "";
  if (entryBtn) {
    entryBtn.onclick = () => { compose.hidden = false; entryText.focus(); };
  }
  const entryCancel = document.getElementById("tracker-entry-cancel");
  if (entryCancel) {
    entryCancel.onclick = () => { compose.hidden = true; entryText.value = ""; };
  }
  const entrySave = document.getElementById("tracker-entry-save");
  if (entrySave) {
    entrySave.onclick = async () => {
      const text = entryText.value.trim();
      if (!text) return;
      const page = pageInput ? (parseInt(pageInput.value) || null) : null;
      entrySave.disabled = true;
      const entry = await apiFetch(`/books/${currentBookId}/journal`, {
        method: "POST",
        body: JSON.stringify({ text, page }),
      });
      entrySave.disabled = false;
      if (entry) {
        compose.hidden = true;
        entryText.value = "";
        showToast("Entry saved.", "success");
        _loadJournalEntries(currentBookId);
      }
    };
  }
  // Load existing journal entries
  if (currentBookId) _loadJournalEntries(currentBookId);
  // ══ End Reading Tracker ══

  document.getElementById("modal-overlay").classList.add("open");
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

// ══ Reading Tracker helpers (removable) ═══════════════════════
function _updateTrackerBar() {
  const pageInput = document.getElementById("tracker-current-page");
  const barFill   = document.getElementById("tracker-bar-fill");
  const barWrap   = document.getElementById("tracker-bar-wrap");
  const totalLabel = document.getElementById("tracker-total-label");
  if (!pageInput || !barFill) return;

  const current = parseInt(pageInput.value) || 0;
  if (_currentBookTotalPages && current) {
    const pct = Math.min(100, Math.round(current / _currentBookTotalPages * 100));
    barFill.style.width = `${pct}%`;
    barWrap.hidden = false;
    totalLabel.textContent = `of ${_currentBookTotalPages} · ${pct}%`;
  } else {
    barFill.style.width = "0%";
    barWrap.hidden = true;
    totalLabel.textContent = _currentBookTotalPages ? `of ${_currentBookTotalPages}` : "";
  }
}
// ══ End Reading Tracker helpers ═══════════════════════════════

// ── Journal entries ───────────────────────────────────────────
async function _loadJournalEntries(bookId) {
  const list = document.getElementById("journal-entries-list");
  if (!list) return;
  list.innerHTML = '<div class="journal-loading">Loading…</div>';
  const entries = await apiFetch(`/books/${bookId}/journal`);
  list.innerHTML = "";
  if (!entries || !entries.length) {
    list.innerHTML = '<div class="journal-empty">No entries yet.</div>';
    return;
  }
  entries.forEach(e => {
    const div = document.createElement("div");
    div.className = "journal-entry";
    const d = new Date(e.created_at);
    const stamp = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    div.innerHTML = `
      <div class="journal-entry-header">
        <span class="journal-entry-date">${esc(stamp)}</span>
        ${e.page ? `<span class="journal-entry-page">p.${e.page}</span>` : ""}
      </div>
      <div class="journal-entry-text">${esc(e.text)}</div>
    `;
    list.appendChild(div);
  });
}

// ── Reading calendar ──────────────────────────────────────────
const _MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function _loadCalendar() {
  const data = await apiFetch(`/reading-log/?year=${_calYear}&month=${_calMonth}`);
  _calMarked = new Set(data || []);
  _renderCalendar();
}

function _renderCalendar() {
  const grid  = document.getElementById("cal-grid");
  const label = document.getElementById("cal-month-label");
  const nextBtn = document.getElementById("cal-next");
  if (!grid || !label) return;

  label.textContent = `${_MONTH_NAMES[_calMonth - 1]} ${_calYear}`;

  // Hide next button when already on current month
  const now = new Date();
  const isCurrent = _calYear === now.getFullYear() && _calMonth === now.getMonth() + 1;
  if (nextBtn) nextBtn.hidden = isCurrent;

  const todayStr     = now.toISOString().slice(0, 10);
  const firstDayOfWeek = new Date(_calYear, _calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth    = new Date(_calYear, _calMonth, 0).getDate();

  grid.innerHTML = "";

  // Day-of-week headers
  ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => {
    const h = document.createElement("div");
    h.className = "cal-dow";
    h.textContent = d;
    grid.appendChild(h);
  });

  // Empty leading cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    const e = document.createElement("div");
    e.className = "cal-day cal-empty";
    grid.appendChild(e);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(_calMonth).padStart(2, "0");
    const dd  = String(d).padStart(2, "0");
    const dateStr = `${_calYear}-${mm}-${dd}`;

    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d;

    if (dateStr > todayStr) {
      cell.classList.add("cal-future");
    } else {
      if (dateStr === todayStr) cell.classList.add("cal-today");
      if (_calMarked.has(dateStr)) cell.classList.add("cal-marked");
      cell.addEventListener("click", () => _toggleDay(dateStr, cell));
    }

    grid.appendChild(cell);
  }
}

async function _toggleDay(dateStr, cell) {
  const wasMarked = _calMarked.has(dateStr);
  // Optimistic update
  cell.classList.toggle("cal-marked", !wasMarked);
  wasMarked ? _calMarked.delete(dateStr) : _calMarked.add(dateStr);

  const result = await apiFetch(`/reading-log/${dateStr}`, {
    method: wasMarked ? "DELETE" : "POST",
  });

  if (!result) {
    // Revert on API failure
    cell.classList.toggle("cal-marked", wasMarked);
    wasMarked ? _calMarked.add(dateStr) : _calMarked.delete(dateStr);
  }
}

function initCalendar() {
  const prev = document.getElementById("cal-prev");
  const next = document.getElementById("cal-next");
  if (prev) prev.addEventListener("click", () => {
    _calMonth--;
    if (_calMonth < 1) { _calMonth = 12; _calYear--; }
    _loadCalendar();
  });
  if (next) next.addEventListener("click", () => {
    const now = new Date();
    if (_calYear === now.getFullYear() && _calMonth === now.getMonth() + 1) return;
    _calMonth++;
    if (_calMonth > 12) { _calMonth = 1; _calYear++; }
    _loadCalendar();
  });
  _loadCalendar();
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
