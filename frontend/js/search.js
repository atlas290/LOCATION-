/* ============================================================
   LOCATION — js/search.js
   Recherche intelligente + filtres + favoris
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ============================================================
     1. ÉLÉMENTS
     ============================================================ */
  const searchInput = document.querySelector('input[type="search"]');
  const searchForm  = document.querySelector('form[role="search"]');
  const cardGrid    = document.querySelector('.card-grid');
  const chips       = document.querySelectorAll('.chip-row .chip');

  if (!cardGrid) return;

  // --- Message de feedback (à créer dynamiquement) ---
  let feedbackEl = document.getElementById('search-feedback');
  if (!feedbackEl) {
    feedbackEl = document.createElement('div');
    feedbackEl.id = 'search-feedback';
    feedbackEl.style.cssText = 'padding: 12px 16px; font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;';
    cardGrid.parentNode.insertBefore(feedbackEl, cardGrid);
  }

  const allCards = Array.from(cardGrid.querySelectorAll('.card-vertical'));

  // Sauvegarde l'état initial de chaque carte (affichée/cachée)
  const cardData = allCards.map((card) => {
    const title    = (card.querySelector('.card-vertical__title')?.textContent || '').toLowerCase();
    const location = (card.querySelector('.card-vertical__location')?.textContent || '').toLowerCase();
    const priceTxt = (card.querySelector('.card-vertical__price-amount')?.textContent || '0').replace(/\s/g, '');
    const price    = parseInt(priceTxt, 10) || 0;
    return { el: card, title, location, price };
  });


  /* ============================================================
     2. PARSER LA REQUÊTE (Simulation IA)
     ============================================================ */
  const parseQuery = (query) => {
    const q = query.toLowerCase();
    const result = { type: null, city: null, maxPrice: null };

    // Détection du type
    const types = ['chambre', 'studio', 'appartement', 'maison', 'villa', 'bureau', 'boutique'];
    for (const t of types) {
      if (q.includes(t)) { result.type = t; break; }
    }

    // Détection de la ville
    const villes = ['calavi', 'cotonou', 'akpakpa', 'fidjrossè', 'fidjrosse', 'cadjèhoun', 'cadjèhoun', 'zogbadjè', 'zogbadje', 'abomey'];
    for (const v of villes) {
      if (q.includes(v)) { result.city = v; break; }
    }

    // Détection du prix (ex: "30000", "30 000", "30k")
    const prixMatch = q.match(/(\d+[\s\.]?\d*)\s*k?/);
    if (prixMatch) {
      let num = prixMatch[1].replace(/[\s\.]/g, '');
      if (q.includes(num + 'k') || q.includes(num + ' k')) {
        result.maxPrice = parseInt(num, 10) * 1000;
      } else {
        result.maxPrice = parseInt(num, 10);
      }
    }

    return result;
  };


  /* ============================================================
     3. FILTRER LES CARTES
     ============================================================ */
  const filterCards = (query) => {
    const q = (query || '').trim().toLowerCase();

    if (q === '') {
      // Afficher tout
      cardData.forEach((c) => c.el.style.display = '');
      feedbackEl.textContent = '';
      feedbackEl.style.display = 'none';
      return;
    }

    const { type, city, maxPrice } = parseQuery(q);
    let count = 0;

    cardData.forEach((c) => {
      const matchesType   = !type || c.title.includes(type);
      const matchesCity   = !city || c.location.includes(city);
      const matchesPrice  = !maxPrice || c.price <= maxPrice;

      if (matchesType && matchesCity && matchesPrice) {
        c.el.style.display = '';
        count++;
      } else {
        c.el.style.display = 'none';
      }
    });

    // Message de feedback
    feedbackEl.style.display = '';
    if (count > 0) {
      feedbackEl.innerHTML = '🤖 L\'IA a trouvé <strong>' + count + '</strong> logement(s) pour : <em>"' + query + '"</em>';
    } else {
      feedbackEl.innerHTML = '😔 Aucun logement ne correspond à : <em>"' + query + '"</em>. Essayez d\'élargir vos critères.';
    }
  };


  /* ============================================================
     4. GESTION DES CHIPS (Filtres rapides)
     ============================================================ */
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');

      const ville = chip.textContent.trim().toLowerCase();
      if (ville === 'tout') {
        filterCards('');
      } else {
        filterCards(ville);
      }
    });
  });


  /* ==================================
==========================     5. RECHERCHE (Entrée + Submit)
     ============================================================ */
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        filterCards(searchInput.value);
      }
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      filterCards(searchInput ? searchInput.value : '');
    });
  }


  /* ============================================================
     6. FAVORIS (Cœurs)
     ============================================================ */
  const FAVORITES_KEY = 'location_favorites';
  const getFavs = () => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
  };
  const saveFavs = (arr) => { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr)); } catch {} };

  document.querySelectorAll('.card-vertical__fav').forEach((btn, index) => {
    const card = btn.closest('.card-vertical');
    const id = card?.dataset.id || 'card-' + index;

    // État initial
    if (getFavs().includes(id)) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const favs = getFavs();
      const pos = favs.indexOf(id);
      if (pos > -1) {
        favs.splice(pos, 1);
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        favs.push(id);
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      }
      saveFavs(favs);
    });
  });

});