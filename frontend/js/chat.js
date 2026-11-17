/* ============================================================
   LOCATION — js/chat.js
   Assistant IA conversationnel (simulation locale)
   CONTRAINTE DESIGN : Zéro emoji, SVG uniquement, tokens CSS
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const overlay    = document.getElementById('chat-overlay');
  const openBtn    = document.getElementById('chat-open-btn');
  const messagesEl = document.getElementById('chat-messages');
  const formEl     = document.getElementById('chat-form');
  const inputEl    = document.getElementById('chat-input');
  const closeBtn   = document.getElementById('chat-close-btn');
  const resetBtn   = document.getElementById('chat-reset-btn');
  const sendBtn    = formEl ? formEl.querySelector('.chat-send-btn') : null;

  if (!overlay || !openBtn || !messagesEl || !formEl || !inputEl) return;

  const STORAGE_KEY    = 'chat_history';
  const PROPERTIES_KEY = 'location_properties';

  const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='m3 16 5-5 4 4 3-3 6 6'/%3E%3Ccircle cx='9' cy='9' r='1.5'/%3E%3C/svg%3E";

  const WELCOME = "Bonjour ! Je suis l'assistant LOCATION. Décrivez-moi le logement que vous cherchez (type, ville, budget).";

  const DEFAULT_PROPERTIES = [
    { id: 1, title: 'Studio moderne Akpakpa',    price: 35000,  city: 'Cotonou',       district: 'Akpakpa',      type: 'studio' },
    { id: 2, title: 'Chambre salon Calavi',      price: 25000,  city: 'Abomey-Calavi', district: 'Zogbadjè',     type: 'chambre' },
    { id: 3, title: 'Appartement Fidjrossè',     price: 80000,  city: 'Cotonou',       district: 'Fidjrossè',    type: 'appartement' },
    { id: 4, title: 'Villa Porto-Novo',          price: 150000, city: 'Porto-Novo',    district: 'Djègan-Kpèvi', type: 'villa' },
    { id: 5, title: 'Chambre ordinaire Calavi',  price: 15000,  city: 'Abomey-Calavi', district: 'Godomey',      type: 'chambre' },
    { id: 6, title: 'Studio Cotonou centre',     price: 45000,  city: 'Cotonou',       district: 'Ganhi',        type: 'studio' },
    { id: 7, title: 'Maison familiale Parakou',  price: 120000, city: 'Parakou',       district: 'Zongo',        type: 'maison' },
    { id: 8, title: 'Chambre sanitaire Akpakpa', price: 20000,  city: 'Cotonou',       district: 'Akpakpa',      type: 'chambre' }
  ];

  const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const formatPrice = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

  const normalize = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const getProperties = () => {
    try {
      const raw = localStorage.getItem(PROPERTIES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_PROPERTIES;
    } catch {
      return DEFAULT_PROPERTIES;
    }
  };

  const defaultState = () => ({
    history: [],
    context: { type: null, city: null, priceMax: null, excludedIds: [] }
  });

  const loadState = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.history) && parsed.context) {
        return {
          history: parsed.history,
          context: {
            type: parsed.context.type ?? null,
            city: parsed.context.city ?? null,
            priceMax: parsed.context.priceMax ?? null,
            excludedIds: Array.isArray(parsed.context.excludedIds) ? parsed.context.excludedIds : []
          }
        };
      }
    } catch (e) {}
    return defaultState();
  };

  const saveState = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  };

  let state = loadState();
  let isTyping = false;

  const parseQuery = (text) => {
    const lower = normalize(text);
    const result = {};

    const types = ['chambre', 'studio', 'appartement', 'maison', 'villa', 'terrain', 'bureau', 'boutique'];
    for (const t of types) {
      if (lower.includes(t)) { result.type = t; break; }
    }

    const cities = ['calavi', 'cotonou', 'akpakpa', 'fidjrosse', 'porto', 'parakou', 'abomey', 'zogbadje'];
    for (const c of cities) {
      if (lower.includes(c)) { result.city = c; break; }
    }

    const priceMatch = lower.match(/(\d[\d\s]{2,})\s*(k|mille)?/);
    if (priceMatch) {
      let num = parseInt(priceMatch[1].replace(/\s/g, ''), 10);
      if (!isNaN(num) && num > 0) {
        if ((priceMatch[2] === 'k' || priceMatch[2] === 'mille') && num < 1000) {
          num *= 1000;
        }
        if (num >= 5000) result.priceMax = num;
      }
    }

    if (/(moins\s*cher|moins\s*chere|pas\s*cher|moins\s*eleve)/.test(lower)) {
      result.cheaper = true;
    }
    if (/(autre|autres|different|differents)/.test(lower)) {
      result.other = true;
    }

    return result;
  };

  const findMatches = (properties, context) => {
    return properties
      .filter((p) => {
        if (context.excludedIds.length && context.excludedIds.includes(String(p.id))) return false;
        if (context.type && !normalize(p.type).includes(context.type)) return false;
        if (context.city && !normalize(p.city).includes(context.city)) return false;
        if (context.priceMax && Number(p.price) > context.priceMax) return false;
        return true;
      })
      .sort((a, b) => Number(a.price) - Number(b.price));
  };

  const buildResponseText = (count, context) => {
    if (count === 0) {
      return "Je n'ai pas trouvé d'annonce correspondante. Essayez d'élargir vos critères (ville, type, budget).";
    }
    const parts = ["J'ai trouvé " + count + ' logement' + (count > 1 ? 's' : '')];
    if (context.type) parts.push('de type ' + context.type);
    if (context.city) parts.push('à ' + context.city);
    if (context.priceMax) parts.push('pour moins de ' + formatPrice(context.priceMax) + ' FCFA');
    return parts.join(' ') + '.';
  };

  const generateResponse = (text) => {
    const parsed = parseQuery(text);

    if (parsed.type)     state.context.type     = parsed.type;
    if (parsed.city)     state.context.city     = parsed.city;
    if (parsed.priceMax) state.context.priceMax = parsed.priceMax;

    if (parsed.cheaper && state.context.priceMax) {
      state.context.priceMax = Math.round(state.context.priceMax * 0.8);
    }

    if (parsed.other) {
      const seenIds = state.history
        .filter((h) => h.role === 'ai' && Array.isArray(h.cardIds))
        .flatMap((h) => h.cardIds.map(String));
      state.context.excludedIds = Array.from(new Set(seenIds));
    }

    const properties = getProperties();
    const matches    = findMatches(properties, state.context);
    const limited    = matches.slice(0, 3);
    const remaining  = matches.slice(3);

    return {
      text: buildResponseText(matches.length, state.context),
      cardIds: limited.map((p) => p.id),
      remainingIds: remaining.map((p) => p.id),
      totalMatches: matches.length
    };
  };

  const scrollToBottom = () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const renderCard = (property) => {
    const img = property.image_url || (Array.isArray(property.images) && property.images[0]) || PLACEHOLDER_IMG;
    const meta = [property.city, property.district].filter(Boolean).map(escapeHtml).join(' · ');

    return ''
      + '<a href="annonce.html?id=' + encodeURIComponent(property.id) + '" class="chat-card">'
      +   '<div class="chat-card__media">'
      +     '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(property.title) + '" loading="lazy">'
      +   '</div>'
      +   '<div class="chat-card__body">'
      +     '<p class="chat-card__title">' + escapeHtml(property.title) + '</p>'
      +     '<p class="chat-card__meta">' + meta + '</p>'
      +     '<p class="chat-card__price">' + formatPrice(property.price) + ' FCFA</p>'
      +   '</div>'
      +   '<svg class="chat-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
      + '</a>';
  };

  const addMessage = (role, text, cardIds, remainingIds) => {
    const div = document.createElement('div');
    const hasCards = Array.isArray(cardIds) && cardIds.length > 0;

    div.className = 'chat-message chat-message--' + role;
    if (hasCards) div.classList.add('chat-message--with-cards');

    const textP = document.createElement('p');
    textP.className = 'chat-message__text';
    textP.textContent = text;
    div.appendChild(textP);

    if (hasCards) {
      const props = getProperties();
      const cardsEl = document.createElement('div');
      cardsEl.className = 'chat-cards';

      cardIds.forEach((id) => {
        const p = props.find((x) => String(x.id) === String(id));
        if (p) cardsEl.insertAdjacentHTML('beforeend', renderCard(p));
      });
      div.appendChild(cardsEl);

      if (Array.isArray(remainingIds) && remainingIds.length > 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-see-more';
        const total = remainingIds.length;
        btn.textContent = 'Voir ' + total + ' autre' + (total > 1 ? 's' : '') + ' résultat' + (total > 1 ? 's' : '');

        btn.addEventListener('click', () => {
          const freshProps = getProperties();
          remainingIds.forEach((id) => {
            const p = freshProps.find((x) => String(x.id) === String(id));
            if (p) cardsEl.insertAdjacentHTML('beforeend', renderCard(p));
          });
          btn.remove();
          scrollToBottom();
        });

        div.appendChild(btn);
      }
    }

    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  };

  const showTyping = () => {
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-label', "L'assistant réfléchit");
    div.innerHTML = '<span class="chat-typing__dot"></span><span class="chat-typing__dot"></span><span class="chat-typing__dot"></span>';
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  };

  const sendMessage = (rawText) => {
    if (isTyping) return;
    const clean = String(rawText || '').trim();
    if (!clean) return;

    addMessage('user', clean);
    state.history.push({ role: 'user', text: clean });
    saveState();

    isTyping = true;
    if (sendBtn) sendBtn.disabled = true;
    const typingEl = showTyping();

    setTimeout(() => {
      typingEl.remove();
      const response = generateResponse(clean);
      addMessage('ai', response.text, response.cardIds, response.remainingIds);

      state.history.push({
        role: 'ai',
        text: response.text,
        cardIds: response.cardIds,
        remainingIds: response.remainingIds
      });
      saveState();

      isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.focus();
    }, 800);
  };

  const renderWelcome = () => {
    addMessage('ai', WELCOME);
  };

  const replayHistory = () => {
    if (!state.history.length) {
      renderWelcome();
      return;
    }
    state.history.forEach((item) => {
      if (item.role === 'user') {
        addMessage('user', item.text);
      } else if (item.role === 'ai') {
        addMessage('ai', item.text, item.cardIds, item.remainingIds);
      }
    });
  };

  const resetChat = () => {
    state = defaultState();
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    messagesEl.innerHTML = '';
    renderWelcome();
  };

  openBtn.addEventListener('click', () => {
    overlay.hidden = false;
    document.body.classList.add('chat-open');
    if (messagesEl.children.length === 0) {
      replayHistory();
    }
    setTimeout(() => {
      if (inputEl) inputEl.focus();
      scrollToBottom();
    }, 50);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.hidden = true;
      document.body.classList.remove('chat-open');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetChat);
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(inputEl.value);
    inputEl.value = '';
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      overlay.hidden = true;
      document.body.classList.remove('chat-open');
    }
  });
});