/* ============================================================
   LOCATION — js/properties.js
   Chargement des annonces + recherche IA
   ============================================================ */

'use strict';

const FAVORITES_KEY = 'location_favorites';

/* ============================================================
   Génération d'une carte d'annonce (design premium)
   ============================================================ */
function createPropertyCard(property) {
  const id    = property.id ?? '';
  const title = escapeHtml(property.title || property.titre || 'Annonce sans titre');
  const city  = escapeHtml(property.city || property.location || property.ville || '');
  const image = escapeAttr(
    property.image_url ||
    (Array.isArray(property.images) && property.images[0]) ||
    'assets/img/placeholder.jpg'
  );

  const prixFormate = property.price != null
    ? new Intl.NumberFormat('fr-FR').format(property.price)
    : '—';

  const isVerified = property.is_verified === true;
  const badgeHTML = isVerified ? `
    <span class="badge badge--verified badge--sm card-vertical__badge">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
      Vérifié
    </span>` : '';

  const article = document.createElement('article');
  article.className = 'card-vertical';
  article.dataset.id = String(id);
  article.innerHTML = `
    <div class="card-vertical__media">
      <img class="card-vertical__img" src="${image}" alt="${title}" loading="lazy" width="400" height="300">
      ${badgeHTML}
      <button class="card-vertical__fav" type="button" aria-label="Ajouter aux favoris" aria-pressed="false" data-id="${escapeAttr(String(id))}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>
        </svg>
      </button>
    </div>
    <div class="card-vertical__body">
      <div class="card-vertical__price">
        <span class="card-vertical__price-amount">${prixFormate}</span>
        <span class="card-vertical__price-unit">F CFA/mois</span>
      </div>
      <h3 class="card-vertical__title">${title}</h3>
      <div class="card-vertical__location">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>${city}</span>
      </div>
    </div>
  `;

  bindFavorite(article.querySelector('.card-vertical__fav'));
  return article;
}

/* ============================================================
   Favoris localStorage
   ============================================================ */
function bindFavorite(btn) {
  if (!btn) return;
  const adId = btn.dataset.id;
  if (!adId) return;

  const read = () => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  };

  if (read().includes(adId)) {
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const favs = read();
    const idx = favs.indexOf(adId);

    if (idx > -1) {
      favs.splice(idx, 1);
      btn.classList.remove('is-active');
      btn.setAttribute('aria-pressed', 'false');
    } else {
      favs.push(adId);
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  });
}

/* ============================================================
   Chargement initial
   ============================================================ */
async function loadProperties() {
  const grid = document.getElementById('properties-grid');
  const msg  = document.getElementById('ai-search-message');
  if (!grid) return;

  if (msg) { msg.hidden = true; msg.textContent = ''; }
  grid.innerHTML = '<p class="loading">Chargement des annonces…</p>';

  try {
    const data = await fetchAPI('/properties');
    const properties = Array.isArray(data) ? data : (data?.items || data?.results || []);

    grid.innerHTML = '';
    if (properties.length === 0) {
      grid.innerHTML = '<p class="empty">Aucune annonce disponible pour le moment.</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    properties.forEach((p) => fragment.appendChild(createPropertyCard(p)));
    grid.appendChild(fragment);
  } catch (err) {
    grid.innerHTML = `<p class="error">Erreur : ${escapeHtml(err.message)}</p>`;
  }
}

/* ============================================================
   Recherche IA
   ============================================================ */
async function searchWithAI(query) {
  const grid = document.getElementById('properties-grid');
  const msg  = document.getElementById('ai-search-message');
  if (!grid) return;

  const q = (query || '').trim();
  if (!q) { loadProperties(); return; }

  grid.innerHTML = '<p class="loading">Recherche en cours…</p>';
  if (msg) { msg.hidden = true; msg.textContent = ''; }

  try {
    const data = await fetchAPI(`/ai-search?query=${encodeURIComponent(q)}`);
    const properties = data.properties || data.results || data.items || [];
    const message    = data.message || `L'IA a trouvé ${properties.length} logement(s).`;

    if (msg) {
      msg.textContent = message;
      msg.hidden = false;
    }

    grid.innerHTML = '';
    if (properties.length === 0) {
      grid.innerHTML = '<p class="empty">Aucun logement ne correspond à votre recherche.</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    properties.forEach((p) => fragment.appendChild(createPropertyCard(p)));
    grid.appendChild(fragment);
  } catch (err) {
    if (msg) { msg.hidden = true; }
    grid.innerHTML = `<p class="error">Erreur : ${escapeHtml(err.message)}</p>`;
  }
}

/* ============================================================
   Branchement barre de recherche
   ============================================================ */
function setupAISearch() {
  const searchInput =
    document.querySelector('input[type="search"], .search-input') ||
    document.querySelector('form[role="search"] input');
  const searchForm =
    document.querySelector('form[role="search"], form.search, .search-form');

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        searchWithAI(searchInput.value);
      }
    }, true);
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      searchWithAI(searchInput ? searchInput.value : '');
    }, true);
  }
}

/* ============================================================
   Helpers XSS
   ============================================================ */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(str) {
  return escapeHtml(str);
}

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('properties-grid')) {
    loadProperties();
    setupAISearch();
  }
});