let currentBookId = null;
let currentRating = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar
  document.getElementById('menu-btn').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-search-btn').addEventListener('click', () => {
    window.location.href = '/shelf.html';
  });
  document.querySelectorAll('.sidebar nav button[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.section)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeSidebar();
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
  card.addEventListener('click', () => openModal(book));
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
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Adding…';
    const result = await apiFetch('/books/', {
      method: 'POST',
      body: JSON.stringify({
        title: book.title,
        author: book.author,
        isbn: book.isbn || null,
        cover_url: book.cover_url || null,
        open_library_key: book.open_library_key || null,
        status: 'plan_to_read',
      }),
    });
    if (result) {
      btn.textContent = '✓ Added';
      const el = document.getElementById('stat-want');
      el.textContent = parseInt(el.textContent || '0') + 1;
    } else {
      btn.disabled = false;
      btn.textContent = '+ Add to shelf';
    }
  });
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
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
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
