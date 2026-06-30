let currentBookId = null;
let currentRating = null;
let _pendingBook = null;
let _pendingBtn = null;
let _pendingBtnText = '';

function openStatusModal(bookData, btn) {
  _pendingBook = bookData;
  _pendingBtn = btn;
  _pendingBtnText = btn ? btn.textContent : '';
  document.getElementById('status-modal-book').textContent =
    bookData.title + (bookData.author ? ' · ' + bookData.author : '');
  document.getElementById('status-modal-overlay').classList.add('open');
}

function closeStatusModal() {
  document.getElementById('status-modal-overlay').classList.remove('open');
  _pendingBook = null; _pendingBtn = null; _pendingBtnText = '';
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!localStorage.getItem('bk_token')) {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('user-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    document.getElementById('user-dropdown').classList.remove('open');
    if (!e.target.closest('#header-search') && !e.target.closest('#search-icon-btn')) {
      closeHeaderSearch();
    }
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('bk_token');
    window.location.href = '/login.html';
  });

  // ── Detail modal ──────────────────────────────────────
  document.getElementById('detail-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.getElementById('detail-close').addEventListener('click', closeDetailModal);

  // ── Status picker modal ───────────────────────────────
  document.getElementById('status-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeStatusModal();
  });
  document.getElementById('status-modal-cancel').addEventListener('click', closeStatusModal);
  document.querySelectorAll('.status-opt').forEach(opt => {
    opt.addEventListener('click', async () => {
      if (!_pendingBook) return;
      const book = _pendingBook, btn = _pendingBtn, btnText = _pendingBtnText;
      const status = opt.dataset.status;
      closeStatusModal();
      if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
      const result = await apiFetch('/books/', {
        method: 'POST',
        body: JSON.stringify({
          title: book.title, author: book.author,
          isbn: book.isbn || null, cover_url: book.cover_url || null,
          open_library_key: book.open_library_key || null, status,
        }),
      });
      if (result) {
        if (btn) btn.textContent = '✓ Added';
        const statMap = { reading: 'stat-reading', plan_to_read: 'stat-want', read: 'stat-read' };
        const el = document.getElementById(statMap[status]);
        if (el) el.textContent = parseInt(el.textContent || '0') + 1;
      } else {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      }
    });
  });

  // ── Header search ─────────────────────────────────────
  function closeHeaderSearch() {
    document.getElementById('header-search').classList.remove('open');
    document.getElementById('search-icon-btn').classList.remove('active');
    document.getElementById('header-search-input').value = '';
    document.getElementById('header-search-results').innerHTML = '';
  }

  document.getElementById('search-icon-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.getElementById('header-search').classList.toggle('open');
    document.getElementById('search-icon-btn').classList.toggle('active', open);
    if (open) document.getElementById('header-search-input').focus();
    else closeHeaderSearch();
  });

  document.getElementById('header-search-close').addEventListener('click', closeHeaderSearch);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeHeaderSearch();
      document.getElementById('user-dropdown').classList.remove('open');
    }
  });

  let headerSearchTimer;
  document.getElementById('header-search-input').addEventListener('input', () => {
    clearTimeout(headerSearchTimer);
    const q = document.getElementById('header-search-input').value.trim();
    if (!q) { document.getElementById('header-search-results').innerHTML = ''; return; }
    document.getElementById('header-search-results').innerHTML = '<div class="header-search-hint">Searching…</div>';
    headerSearchTimer = setTimeout(() => runHeaderSearch(q), 350);
  });

  // Sidebar
  document.getElementById('menu-btn').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-search-btn').addEventListener('click', () => {
    window.location.href = '/shelf.html';
  });
  document.querySelectorAll('.sidebar nav button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `/shelf.html?tab=${btn.dataset.tab}`;
    });
  });

  // Row arrows
  document.querySelectorAll('.row-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const scroll = btn.closest('.row-wrapper').querySelector('.row-scroll');
      scroll.scrollBy({ left: parseInt(btn.dataset.dir) * 640, behavior: 'smooth' });
    });
  });

  // Modal
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveBook);
  document.getElementById('modal-delete').addEventListener('click', deleteBook);
  document.getElementById('modal-date-na').addEventListener('change', e => {
    const inp = document.getElementById('modal-date-read');
    inp.disabled = e.target.checked;
    if (e.target.checked) inp.value = '';
  });
  document.getElementById('modal-date-read').addEventListener('change', () => {
    document.getElementById('modal-date-na').checked = false;
  });
  document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', () => {
      const v = parseInt(star.dataset.v);
      currentRating = currentRating === v ? null : v;
      renderStars(currentRating);
    });
  });

  // Load shelf data in parallel
  const [reading, want, read] = await Promise.all([
    apiFetch('/books/?status=reading'),
    apiFetch('/books/?status=plan_to_read'),
    apiFetch('/books/?status=read'),
  ]);

  const allBooks = [...(reading || []), ...(want || []), ...(read || [])];

  // Stats
  document.getElementById('stat-reading').textContent = (reading || []).length;
  document.getElementById('stat-want').textContent = (want || []).length;
  document.getElementById('stat-read').textContent = (read || []).length;

  // Shelf rows
  renderRow('row-reading', reading || [], false);
  renderRow('row-want', want || [], false);
  renderRow('row-read', read || [], false);

  // Suggestions load async after (slower open library call)
  renderRow('row-suggested', [], false); // placeholder
  loadSuggestions(allBooks).then(suggestions => {
    renderRow('row-suggested', suggestions, true);
  });
});

// ── Detail modal ──────────────────────────────────────────────
const STATUS_LABELS = { reading: 'Currently Reading', plan_to_read: 'Want to Read', read: 'Read' };

function openDetailModal(book) {
  const coverEl = document.getElementById('detail-cover');
  coverEl.innerHTML = '';
  if (book.cover_url) {
    const img = document.createElement('img');
    img.src = book.cover_url;
    img.alt = book.title;
    img.onerror = () => img.replaceWith(makeDetailPlaceholder(book.title));
    coverEl.appendChild(img);
  } else {
    coverEl.appendChild(makeDetailPlaceholder(book.title));
  }
  document.getElementById('detail-title').textContent = book.title;
  document.getElementById('detail-author').textContent = book.author;
  document.getElementById('detail-badge').textContent = STATUS_LABELS[book.status] || book.status;
  document.getElementById('detail-stars').textContent =
    book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : '';
  const notesEl = document.getElementById('detail-notes');
  notesEl.textContent = book.notes ? `"${book.notes}"` : '';
  notesEl.style.display = book.notes ? '' : 'none';
  document.getElementById('detail-edit-btn').onclick = () => { closeDetailModal(); openModal(book); };
  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-overlay').classList.remove('open');
}

function makeDetailPlaceholder(title) {
  const div = document.createElement('div');
  div.className = 'detail-cover-ph';
  div.textContent = title;
  return div;
}

// ── Row rendering ─────────────────────────────────────────────
function renderRow(containerId, books, isSuggested) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!books.length) {
    container.innerHTML = `<div class="row-empty">${
      isSuggested
        ? 'Add some books to your shelf to get suggestions.'
        : 'Nothing here yet — <a href="shelf.html" style="color:var(--accent)">search and add some</a>.'
    }</div>`;
    return;
  }
  books.forEach(book =>
    container.appendChild(isSuggested ? makeSuggestedCard(book) : makeBookCard(book))
  );
}

function makeBookCard(book) {
  const card = document.createElement('div');
  card.className = 'book-card';
  const wrap = document.createElement('div');
  wrap.className = 'cover-wrap';
  wrap.appendChild(makeCoverEl(book.cover_url, book.title, book.author));
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const stars = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : '';
  meta.innerHTML = `
    <div class="card-title">${esc(book.title)}</div>
    <div class="card-author">${esc(book.author)}</div>
    ${stars ? `<div class="card-stars">${stars}</div>` : ''}
  `;
  card.append(wrap, meta);
  card.addEventListener('click', () => openDetailModal(book));
  return card;
}

function makeSuggestedCard(book) {
  const card = document.createElement('div');
  card.className = 'book-card';
  const wrap = document.createElement('div');
  wrap.className = 'cover-wrap';
  wrap.appendChild(makeCoverEl(book.cover_url, book.title, book.author));
  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.innerHTML = `
    <div class="card-title">${esc(book.title)}</div>
    <div class="card-author">${esc(book.author || 'Unknown')}</div>
  `;
  const btn = document.createElement('button');
  btn.className = 'add-btn';
  btn.textContent = '+ Add to shelf';
  btn.addEventListener('click', () => openStatusModal(book, btn));
  card.append(wrap, meta, btn);
  return card;
}

// ── Suggestions ───────────────────────────────────────────────
async function loadSuggestions(allBooks) {
  const existingTitles = new Set(allBooks.map(b => b.title.toLowerCase().trim()));
  const existingKeys = new Set(allBooks.map(b => b.open_library_key).filter(Boolean));
  const suggestions = [];

  if (allBooks.length > 0) {
    const authors = [...new Set(allBooks.map(b => b.author).filter(Boolean))].slice(0, 3);
    for (const author of authors) {
      const results = await apiFetch(`/search/?q=${encodeURIComponent(author)}&limit=10`) || [];
      for (const r of results) {
        if (
          !existingKeys.has(r.open_library_key) &&
          !existingTitles.has(r.title?.toLowerCase().trim())
        ) {
          suggestions.push(r);
        }
      }
      if (suggestions.length >= 20) break;
    }
  }

  if (suggestions.length < 5) {
    const fallback = await apiFetch('/search/?q=bestseller+novel+award&limit=15') || [];
    for (const r of fallback) {
      if (!existingTitles.has(r.title?.toLowerCase().trim())) {
        suggestions.push(r);
      }
    }
  }

  return suggestions.slice(0, 20);
}

// ── Sidebar ───────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(book) {
  currentBookId = book.id;
  currentRating = book.rating || null;
  document.getElementById('modal-title').textContent = book.title;
  document.getElementById('modal-author').textContent = book.author;
  document.getElementById('modal-status').value = book.status;
  document.getElementById('modal-notes').value = book.notes || '';
  const dateInp = document.getElementById('modal-date-read');
  dateInp.value = book.date_read || '';
  dateInp.disabled = false;
  document.getElementById('modal-date-na').checked = false;
  const coverEl = document.getElementById('modal-cover');
  coverEl.innerHTML = '';
  if (book.cover_url) {
    const img = document.createElement('img');
    img.src = book.cover_url;
    img.alt = book.title;
    img.onerror = () => img.replaceWith(makePlaceholderFull(book.title));
    coverEl.appendChild(img);
  } else {
    coverEl.appendChild(makePlaceholderFull(book.title));
  }
  renderStars(currentRating);
  document.getElementById('modal-overlay').classList.add('open');
}

function makePlaceholderFull(title) {
  const div = document.createElement('div');
  div.className = 'modal-cover-placeholder';
  div.textContent = title;
  return div;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  currentBookId = null;
}

function renderStars(rating) {
  document.querySelectorAll('.star').forEach(s =>
    s.classList.toggle('lit', parseInt(s.dataset.v) <= (rating || 0))
  );
}

async function saveBook() {
  if (!currentBookId) return;
  const result = await apiFetch(`/books/${currentBookId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: document.getElementById('modal-status').value,
      rating: currentRating,
      notes: document.getElementById('modal-notes').value || null,
      date_read: document.getElementById('modal-date-read').value || null,
    }),
  });
  if (result) { closeModal(); location.reload(); }
}

async function deleteBook() {
  if (!currentBookId) return;
  if (!confirm('Remove this book from your shelf?')) return;
  await apiFetch(`/books/${currentBookId}`, { method: 'DELETE' });
  closeModal();
  location.reload();
}

// ── Header search ─────────────────────────────────────────────
async function runHeaderSearch(q) {
  const container = document.getElementById('header-search-results');
  if (!container) return;
  const results = await apiFetch(`/search/?q=${encodeURIComponent(q)}&limit=8`);
  container.innerHTML = '';
  if (!results || !results.length) {
    container.innerHTML = '<div class="header-search-hint">No results found.</div>';
    return;
  }
  results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'header-result-item';

    const cover = document.createElement('div');
    cover.className = 'header-result-cover';
    if (r.cover_url) {
      const img = document.createElement('img');
      img.src = r.cover_url;
      img.alt = r.title;
      cover.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'header-result-info';
    info.innerHTML = `<div class="header-result-title">${esc(r.title)}</div><div class="header-result-author">${esc(r.author || 'Unknown')}</div>`;

    const btn = document.createElement('button');
    btn.className = 'header-add-btn';
    btn.textContent = '+ Add';
    btn.addEventListener('click', () => openStatusModal(r, btn));

    item.append(cover, info, btn);
    container.appendChild(item);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function makeCoverEl(coverUrl, title, author) {
  if (coverUrl) {
    const img = document.createElement('img');
    img.className = 'cover-img';
    img.src = coverUrl;
    img.alt = title;
    img.onerror = () => img.replaceWith(makePlaceholder(title, author));
    return img;
  }
  return makePlaceholder(title, author);
}

function makePlaceholder(title, author) {
  const div = document.createElement('div');
  div.className = 'cover-placeholder';
  div.innerHTML = `<div class="ph-title">${esc(title)}</div><div class="ph-author">${esc(author || '')}</div>`;
  return div;
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('bk_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('bk_token');
    window.location.href = '/login.html';
    return null;
  }
  if (!res.ok) { console.error('API', res.status, url); return null; }
  if (res.status === 204) return null;
  return res.json();
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
