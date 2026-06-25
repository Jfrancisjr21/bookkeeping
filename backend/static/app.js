let activeTab = "reading";
let currentBookId = null;
let currentRating = null;

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadShelf();

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

async function addBook(bookData, btn) {
  btn.disabled = true;
  btn.textContent = "Adding…";
  const result = await apiFetch("/books/", {
    method: "POST",
    body: JSON.stringify({
      title: bookData.title,
      author: bookData.author,
      isbn: bookData.isbn || null,
      cover_url: bookData.cover_url || null,
      open_library_key: bookData.open_library_key || null,
      status: "plan_to_read",
    }),
  });
  if (result) {
    btn.textContent = "✓ Added";
    if (activeTab === "plan_to_read") loadShelf();
  } else {
    btn.disabled = false;
    btn.textContent = "+ Add to shelf";
  }
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
  card.addEventListener("click", () => openModal(book));
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

// ── API ───────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
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
