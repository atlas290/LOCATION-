/* ============================================================
   LOCATION — js/dashboard.js
   Version DEMO : affiche des données fictives si pas de connexion
   CONTRAINTE DESIGN : Zéro emoji, SVG uniquement, tokens CSS
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const STORAGE_KEY = 'location_properties';
  const USER_KEY    = 'user';
  const LOGIN_URL   = 'login.html';
  const PUBLISH_URL = 'publier.html';
  const DETAIL_URL  = 'annonce.html';

  const ALLOWED_ROLES = ['proprietaire', 'agence'];

  // ⚠️ MODE DEMO : met à true pour voir le dashboard sans être connecté
  // ⚠️ Repasser à false quand inscription/connexion seront actives
  const DEMO_MODE = true;

  const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatPrice = (amount) => new Intl.NumberFormat('fr-FR').format(Number(amount) || 0);

  const safeParse = (raw, fallback) => {
    try { return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  };

  // --- 1. AUTHENTIFICATION (avec fallback démo) ---
  let user = safeParse(localStorage.getItem(USER_KEY), null);

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    if (DEMO_MODE) {
      user = { id: 1, email: 'demo@location.bj', full_name: 'Koffi Demo', role: 'proprietaire' };
    } else {
      window.location.replace(LOGIN_URL);
      return;
    }
  }

  // --- 2. LECTURE DES ANNONCES (avec fallback démo) ---
  let allProperties = safeParse(localStorage.getItem(STORAGE_KEY), []);

  if (DEMO_MODE && (!Array.isArray(allProperties) || allProperties.length === 0)) {
    allProperties = [
      { id: 101, title: 'Studio moderne Akpakpa', price: 35000, city: 'Cotonou', district: 'Akpakpa', type: 'studio', is_available: false, owner_id: 1, image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=300&q=80', created_at: '2025-01-15T10:00:00' },
      { id: 102, title: 'Chambre salon Calavi', price: 25000, city: 'Abomey-Calavi', district: 'Zogbadjè', type: 'chambre', is_available: false, owner_id: 1, image_url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=300&q=80', created_at: '2025-01-10T14:30:00' },
      { id: 103, title: 'Appartement Fidjrossè', price: 80000, city: 'Cotonou', district: 'Fidjrossè', type: 'appartement', is_available: true, owner_id: 1, image_url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=300&q=80', created_at: '2025-01-05T09:15:00' }
    ];
  }

  const myProperties = Array.isArray(allProperties)
    ? allProperties.filter((p) => String(p.owner_id) === String(user.id))
    : [];

  // --- 3. STATISTIQUES ---
  const totalCount  = myProperties.length;
  const rentedList  = myProperties.filter((p) => p.is_available === false);
  const rentedCount = rentedList.length;
  const revenue     = rentedList.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  const statsRentedEl  = document.getElementById('stats-rented');
  const statsTotalEl   = document.getElementById('stats-total');
  const statsRevenueEl = document.getElementById('stats-revenue');

  if (statsRentedEl)  statsRentedEl.textContent  = String(rentedCount);
  if (statsTotalEl)   statsTotalEl.textContent   = String(totalCount);
  if (statsRevenueEl) statsRevenueEl.textContent = formatPrice(revenue);

  // --- 4. LISTE DES BIENS ---
  const listContainer = document.getElementById('properties-list');
  if (!listContainer) return;

  if (myProperties.length === 0) {
    listContainer.innerHTML = ''
      + '<div class="empty-state">'
      +   '<div class="empty-state__icon" aria-hidden="true">'
      +     '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
      +       '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/>'
      +     '</svg>'
      +   '</div>'
      +   '<h3 class="empty-state__title">Aucune annonce pour le moment</h3>'
      +   '<p class="empty-state__text">Vous n\'avez pas encore publié d\'annonce. Cliquez sur le bouton ci-dessous pour commencer.</p>'
      +   '<a href="' + PUBLISH_URL + '" class="btn btn--primary">Publier une annonce</a>'
      + '</div>';
    return;
  }

  const renderPropertyItem = (property) => {
    const img = property.image_url || 'assets/img/placeholder.jpg';
    const isRented    = property.is_available === false;
    const statusLabel = isRented ? 'Loué' : 'Disponible';
    const statusClass = isRented ? 'badge--success' : 'badge--warning';

    const location = [property.city, property.district]
      .filter(Boolean)
      .map(escapeHtml)
      .join(', ');

    const price = formatPrice(property.price);

    return ''
      + '<article class="property-item" data-id="' + escapeHtml(property.id) + '">'
      +   '<div class="property-item__media">'
      +     '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(property.title) + '" loading="lazy">'
      +   '</div>'
      +   '<div class="property-item__body">'
      +     '<div class="property-item__header">'
      +       '<h3 class="property-item__title">' + escapeHtml(property.title) + '</h3>'
      +       '<span class="badge ' + statusClass + '">' + statusLabel + '</span>'
      +     '</div>'
      +     (location ? '<p class="property-item__location">' + location + '</p>' : '')
      +     '<p class="property-item__price"><strong>' + price + ' FCFA</strong><span style="color: var(--text-muted); font-weight: 400; font-size: 12px;"> /mois</span></p>'
      +   '</div>'
      +   '<a href="' + DETAIL_URL + '?id=' + encodeURIComponent(property.id) + '" class="property-item__link" aria-label="Voir l\'annonce ' + escapeHtml(property.title) + '">'
      +     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +       '<path d="m9 18 6-6-6-6"/>'
      +     '</svg>'
      +   '</a>'
      + '</article>';
  };

  myProperties.sort((a, b) => {
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    if (db !== da) return db - da;
    return Number(b.id) - Number(a.id);
  });

  listContainer.innerHTML = '<div class="properties-list">'
    + myProperties.map(renderPropertyItem).join('')
    + '</div>';

});