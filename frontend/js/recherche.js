```javascript
/* LOCATION — Recherche intelligente (v2) */

'use strict';


document.addEventListener('DOMContentLoaded', () => {

  /* ============================================================
     0. RÉFÉRENCES DOM
     ============================================================ */
  const searchPage       = document.getElementById('search-page');
  const searchForm       = document.getElementById('search-form');
  const searchInput      = document.getElementById('search-input');
  const micBtn           = document.querySelector('.search-bar-hero__mic');
  const suggestions      = document.querySelectorAll('.search-suggestion');
  const resultsContainer = document.getElementById('search-results-container');
  const aiSummaryText    = document.getElementById('ai-summary-text');
  const chips            = document.querySelectorAll('.chip');
  const grid             = document.getElementById('properties-grid');
  const emptyState       = document.getElementById('search-empty');
  const refineBox        = document.getElementById('search-refine');
  const refineText       = document.getElementById('search-refine-text');

  // Sécurité : éléments critiques
  if (!searchPage || !searchForm || !searchInput) return;

  /* ============================================================
     1. COLLECTE DES CARTES
     ============================================================ */
  const allCards = Array.from(document.querySelectorAll('.card-vertical'));

  const cardData = allCards.map((card) => ({
    el:    card,
    id:    card.dataset.id || '',
    plan:  (card.dataset.plan || 'free').toLowerCase(),
    type:  (card.dataset.type || '').toLowerCase(),
    city:  (card.dataset.city || '').toLowerCase(),
    price: parseInt(card.dataset.price, 10) || 0
  }));

  /* ============================================================
     2. ÉTAT LOCAL
     ============================================================ */
  let currentQuery = '';
  let activeFilter = 'all';    // Filtre issu des chips (type uniquement)
  let isSearchMode = false;

  // État initial
  if (resultsContainer) resultsContainer.hidden = true;
  if (refineBox)        refineBox.hidden = true;
  if (emptyState)       emptyState.hidden = true;

  /* ============================================================
     3. CONSTANTES
     ============================================================ */
  const PLAN_WEIGHTS = { premium: 3, active: 2, free: 1 };
  const TYPES  = ['chambre', 'studio', 'appartement', 'maison', 'villa'];
  const CITIES = ['calavi', 'cotonou', 'akpakpa', 'fidjrosse', 'porto', 'parakou', 'abomey'];
  const MIN_CRITERIA = 2; // Nombre minimum de critères pour afficher des résultats

  /* ============================================================
     4. UTILITAIRES
     ============================================================ */
  const normalize = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  /* ============================================================
     5. PARSING DE LA REQUÊTE
     ============================================================ */
  const parseQuery = (query) => {
    const lower = normalize(query);
    let type = null;
    let city = null;
    let priceMax = null;

    for (const t of TYPES) {
      if (lower.includes(t)) { type = t; break; }
    }
    for (const c of CITIES) {
      if (lower.includes(c)) { city = c; break; }
    }

    const matches = lower.match(/\d[\d\s]{2,}/g);
    if (matches) {
      for (const m of matches) {
        const num = parseInt(m.replace(/\s/g, ''), 10);
        if (!isNaN(num) && num >= 5000 && num <= 200000) {
          priceMax = num;
          break;
        }
      }
    }

    return { type, city, priceMax };
  };

  /* ============================================================
     6. COMPTAGE DES CRITÈRES
     Le chip actif remplace/déclenche le critère type.
     ============================================================ */
  const countCriteria = (parsed) => {
    const chipIsActive  = activeFilter !== 'all';
    const effectiveType = chipIsActive ? activeFilter : parsed.type;

    let count = 0;
    if (effectiveType)  count++;
    if (parsed.city)    count++;
    if (parsed.priceMax) count++;

    return { count, effectiveType };
  };

  /* ============================================================
     7. MODE RECHERCHE (transitions)
     ============================================================ */
  const enterSearchMode = () => {
    isSearchMode = true;
    searchPage.classList.add('is-searching');
    if (resultsContainer) resultsContainer.hidden = false;
  };

  const exitSearchMode = () => {
    isSearchMode = false;
    searchPage.classList.remove('is-searching');
    if (resultsContainer) resultsContainer.hidden = true;
    if (refineBox)        refineBox.hidden = true;
    if (emptyState)       emptyState.hidden = true;

    // Réinitialiser l'affichage des cartes (défensif)
    cardData.forEach((c) => { c.el.style.display = ''; });
  };

  /* ============================================================
     8. TRI PAR PLAN (Premium > Active > Free)
     ============================================================ */
  const sortByPlan = () => {
    if (!grid) return;

    const sorted = [...allCards].sort((a, b) => {
      const pa = PLAN_WEIGHTS[(a.dataset.plan || 'free').toLowerCase()] || 1;
      const pb = PLAN_WEIGHTS[(b.dataset.plan || 'free').toLowerCase()] || 1;
      return pb - pa;
    });

    sorted.forEach((card) => grid.appendChild(card));
  };

  /* ============================================================
     9. AFFICHAGE DES ÉTATS
     ============================================================ */
  const showEmpty = () => {
    if (emptyState) emptyState.hidden = false;
    if (grid)       grid.style.display = 'none';
    if (refineBox)  refineBox.hidden = true;
  };

  const showRefine = (message) => {
    if (refineText) refineText.textContent = message;
    if (refineBox)  refineBox.hidden = false;
    if (grid)       grid.style.display = 'none';
    if (emptyState) emptyState.hidden = true;
    if (aiSummaryText) aiSummaryText.textContent = '';
  };

  const showResults = (count) => {
    if (grid)       grid.style.display = '';
    if (emptyState) emptyState.hidden = true;
    if (refineBox)  refineBox.hidden = true;
    if (aiSummaryText) {
      aiSummaryText.textContent =
        `J'ai trouvé ${count} logement${count > 1 ? 's' : ''} pour votre recherche.`;
    }
  };

  /* ============================================================
     10. MESSAGE CONTEXTUEL (cas 1 critère)
     ============================================================ */
  const getRefineMessage = (parsed, effectiveType) => {
    if (effectiveType && !parsed.city && !parsed.priceMax) {
      return 'Dans quelle ville cherchez-vous ? (Calavi, Cotonou, Akpakpa...)';
    }
    if (parsed.city && !effectiveType && !parsed.priceMax) {
      return 'Quel type de bien cherchez-vous ? (chambre, studio, appartement...)';
    }
    if (parsed.priceMax && !effectiveType && !parsed.city) {
      return 'Précisez le type et la ville pour affiner.';
    }
    return 'Précisez votre recherche (type, ville ou budget).';
  };

  /* ============================================================
     11. RECHERCHE PRINCIPALE
     ============================================================ */
  const performSearch = (query) => {
    currentQuery = String(query || '');
    const parsed = parseQuery(currentQuery);
    const { count: criteriaCount, effectiveType } = countCriteria(parsed);

    // Cas A : query vide → retour Hero
    if (currentQuery.trim() === '') {
      exitSearchMode();
      return;
    }

    enterSearchMode();

    // Cas B : 0 critère → état vide
    if (criteriaCount === 0) {
      if (aiSummaryText) aiSummaryText.textContent = '';
      showEmpty();
      return;
    }

    // Cas C : 1 critère → invitation à préciser
    if (criteriaCount < MIN_CRITERIA) {
      showRefine(getRefineMessage(parsed, effectiveType));
      return;
    }

    // Cas D : 2+ critères → filtrage et affichage
    let visibleCount = 0;

    cardData.forEach((c) => {
      let match = true;
      if (effectiveType    && !c.type.includes(effectiveType)) match = false;
      if (parsed.city      && !c.city.includes(parsed.city))   match = false;
      if (parsed.priceMax  && c.price > parsed.priceMax)       match = false;

      c.el.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    sortByPlan();

    if (visibleCount === 0) {
      if (aiSummaryText) aiSummaryText.textContent = '';
      showEmpty();
    } else {
      showResults(visibleCount);
    }
  };

  /* ============================================================
     12. SCROLL VERS RÉSULTATS
     ============================================================ */
  const scrollToResults = () => {
    if (!resultsContainer) return;
    requestAnimationFrame(() => {
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /* ============================================================
     13. SOUMISSION DU FORMULAIRE
     ============================================================ */
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    performSearch(query);
    searchInput.blur();       // Ferme le clavier virtuel
    scrollToResults();
  });

  /* ============================================================
     14. SUGGESTIONS CLIQUABLES
     ============================================================ */
  suggestions.forEach((sug) => {
    sug.addEventListener('click', () => {
      const text = sug.textContent.trim();
      searchInput.value = text;
      performSearch(text);
      searchInput.blur();
      scrollToResults();
    });
  });

  /* ============================================================
     15. CHIPS FILTRES
     ============================================================ */
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      // Toggle visuel
      chips.forEach((c) => {
        c.classList.remove('is-active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('is-active');
      chip.setAttribute('aria-pressed', 'true');

      // Détermination du filtre
      const label    = normalize(chip.textContent.trim());
      const dataType = normalize(chip.dataset.type || '');

      if (dataType) {
        activeFilter = dataType === 'all' ? 'all' : dataType;
      } else if (label.includes('tout')) {
        activeFilter = 'all';
      } else {
        activeFilter = TYPES.find((t) => label.includes(t)) || 'all';
      }

      // Ré-applique si on est déjà en mode recherche avec une query
      if (isSearchMode && currentQuery) {
        performSearch(currentQuery);
      }
    });
  });

  /* ============================================================
     16. BOUTON MICRO
     ============================================================ */
  if (micBtn) {
    micBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      alert('La recherche vocale sera bientôt disponible !');
    });
  }

  /* ============================================================
     17. RECHERCHE EN TEMPS RÉEL (debounce 300ms)
     ============================================================ */
  let debounceTimer = null;

  searchInput.addEventListener('input', () => {
    const value = searchInput.value.trim();
    clearTimeout(debounceTimer);

    if (value.length === 0) {
      exitSearchMode();
      return;
    }

    if (value.length > 2) {
      debounceTimer = setTimeout(() => {
        performSearch(value);
      }, 300);
    }
  });

});
```