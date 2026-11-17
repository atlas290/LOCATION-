/* ============================================================
   LOCATION — js/api.js
   Couche d'abstraction Fetch avec gestion JWT + refresh
   ============================================================ */

'use strict';

const API_URL = 'http://localhost:8000/api';

/**
 * Effectue une requête API avec injection automatique du JWT.
 * @param {string} endpoint - Chemin relatif (ex: '/properties')
 * @param {Object} options  - Options fetch (method, body, headers…)
 * @returns {Promise<any>}  - Données JSON ou texte
 */
async function fetchAPI(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});

  // Ajout du JWT si présent
  const token = localStorage.getItem('access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const config = { ...options, headers };

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, config);
  } catch (networkError) {
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
  }

  // --- Gestion du 401 : tentative de refresh puis déconnexion ---
  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // On rejoue la requête UNE seule fois
      const newToken = localStorage.getItem('access_token');
      config.headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(`${API_URL}${endpoint}`, config);
      if (response.status === 401) {
        logout();
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }
    } else {
      logout();
      throw new Error('Session expirée. Veuillez vous reconnecter.');
    }
  }

  return parseResponse(response);
}

/**
 * Tente un refresh du token. Renvoie true si succès.
 */
async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;

    const data = await res.json();
    if (data.access_token) localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse la réponse (JSON ou texte) et lève une erreur si !ok.
 */
async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message =
      (data && (data.detail || data.message)) ||
      `Erreur ${response.status}`;
    if (typeof message !== 'string') message = JSON.stringify(message);

    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Déconnecte l'utilisateur et redirige vers login.html.
 * (Évite une boucle si on est déjà sur les pages d'auth.)
 */
function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');

  const path = window.location.pathname;
  if (!path.includes('login.html') && !path.includes('register.html')) {
    window.location.href = 'login.html';
  }
}

/** Helpers d'état d'authentification */
function isAuthenticated() {
  return Boolean(localStorage.getItem('access_token'));
}