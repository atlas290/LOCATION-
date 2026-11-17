/* ============================================================
   LOCATION — js/auth.js
   Connexion Login / Register ↔ Backend FastAPI
   ============================================================ */

'use strict';

/**
 * Connexion utilisateur.
 * Le backend FastAPI attend un POST x-www-form-urlencoded (OAuth2PasswordRequestForm).
 * ⚠️ On utilise fetch() direct (PAS fetchAPI) pour éviter la déconnexion automatique
 *    sur 401, car un 401 ici signifie simplement "mauvais identifiants".
 */
async function loginUser(email, password) {
  const body = new URLSearchParams();
  // FastAPI OAuth2 attend "username" (contenant l'email dans notre cas)
  body.append('username', email);
  body.append('password', password);

  let response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (networkError) {
    throw new Error('Impossible de contacter le serveur. Vérifiez que le backend est bien démarré.');
  }

  // --- Erreur identifiants ---
  if (response.status === 401) {
    throw new Error('Email ou mot de passe incorrect.');
  }

  // --- Autres erreurs (400, 422, 500...) ---
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const msg = data.detail || `Erreur ${response.status}`;
    throw new Error(typeof msg === 'string' ? msg : 'Une erreur est survenue.');
  }

  const data = await response.json().catch(() => null);

  if (!data || !data.access_token) {
    throw new Error('Réponse invalide du serveur (token manquant).');
  }

  // --- Stockage des tokens ---
  localStorage.setItem('access_token', data.access_token);
  if (data.refresh_token) {
    localStorage.setItem('refresh_token', data.refresh_token);
  }

  // --- Redirection ---
  window.location.href = 'index.html';
}

/**
 * Inscription utilisateur.
 * Format JSON avec les champs attendus par le schéma Pydantic du backend.
 */
async function registerUser({ fullName, email, phone, password, role }) {
  const payload = {
    full_name: fullName,
    email,
    phone,
    password,
    role, // 'locataire' | 'proprietaire' | 'agence'
  };

  let response;
  try {
    response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error('Impossible de contacter le serveur. Vérifiez que le backend est bien démarré.');
  }

  // --- Email déjà utilisé ---
  if (response.status === 409) {
    throw new Error('Cet email est déjà utilisé. Essayez de vous connecter.');
  }

  // --- Erreur de validation Pydantic (422) ---
  if (response.status === 422) {
    const data = await response.json().catch(() => ({}));
    let msg = 'Données invalides. Vérifiez les informations saisies.';
    if (Array.isArray(data.detail)) {
      msg = data.detail
        .map((err) => {
          const field = (err.loc || []).slice(-1)[0] || 'champ';
          return `${field} : ${err.msg}`;
        })
        .join(' | ');
    } else if (typeof data.detail === 'string') {
      msg = data.detail;
    }
    throw new Error(msg);
  }

  // --- Autres erreurs ---
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const msg = data.detail || `Erreur ${response.status}`;
    throw new Error(typeof msg === 'string' ? msg : "Échec de l'inscription.");
  }

  // --- Succès : redirection vers la page de connexion avec notice ---
  window.location.href = 'login.html?registered=1';
}

/* ============================================================
   Validation du mot de passe (register)
   Règles : ≥ 8 caractères, ≥ 1 lettre, ≥ 1 chiffre
   ============================================================ */
function isPasswordValid(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password)
  );
}

/* ============================================================
   Initialisation des formulaires
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ---------- FORM LOGIN ---------- */
  const loginForm = document.getElementById('login-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const errorBox = document.getElementById('form-error');
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      hideError(errorBox);

      const email    = loginForm.elements['email'].value.trim();
      const password = loginForm.elements['password'].value;

      // --- Validation côté client ---
      if (!email || !password) {
        showError(errorBox, 'Veuillez renseigner tous les champs.');
        return;
      }

      // --- Requête ---
      setLoading(submitBtn, true, 'Connexion…');

      try {
        await loginUser(email, password);
        // Redirection gérée dans loginUser()
      } catch (err) {
        showError(errorBox, err.message || 'Échec de la connexion.');
        setLoading(submitBtn, false, 'Se connecter');
      }
    });
  }

  /* ---------- FORM REGISTER ---------- */
  const registerForm = document.getElementById('register-form');

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const errorBox = document.getElementById('form-error');
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      hideError(errorBox);

      const fullName = registerForm.elements['full_name'].value.trim();
      const email    = registerForm.elements['email'].value.trim();
      const phone    = registerForm.elements['phone'].value.trim();
      const password = registerForm.elements['password'].value;
      const role     = registerForm.elements['role'].value;

      // --- Champs obligatoires ---
      if (!fullName || !email || !phone || !password || !role) {
        showError(errorBox, 'Tous les champs sont obligatoires.');
        return;
      }

      // --- Validation mot de passe ---
      if (!isPasswordValid(password)) {
        showError(
          errorBox,
          'Le mot de passe doit contenir au moins 8 caractères, dont 1 lettre et 1 chiffre.'
        );
        return;
      }

      // --- Requête ---
      setLoading(submitBtn, true, 'Inscription…');

      try {
        await registerUser({ fullName, email, phone, password, role });
        // Redirection gérée dans registerUser()
      } catch (err) {
        showError(errorBox, err.message || "Échec de l'inscription.");
        setLoading(submitBtn, false, "S'inscrire");
      }
    });
  }

  /* ---------- Message d'accueil après inscription ---------- */
  const params = new URLSearchParams(window.location.search);
  if (params.get('registered') === '1') {
    const notice = document.getElementById('form-notice');
    if (notice) {
      notice.textContent = 'Inscription réussie ! Vous pouvez maintenant vous connecter.';
      notice.hidden = false;
    }
  }
});

/* ============================================================
   Utilitaires UI partagés
   ============================================================ */
function showError(box, msg) {
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
  // Scroll en haut pour que l'utilisateur voie l'erreur
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError(box) {
  if (!box) return;
  box.textContent = '';
  box.hidden = true;
}

function setLoading(btn, isLoading, label) {
  if (!btn) return;

  // Mémorise le texte initial
  if (!btn.dataset.originalLabel) {
    btn.dataset.originalLabel = btn.textContent.trim();
  }

  btn.disabled = isLoading;

  if (isLoading) {
    btn.textContent = label || 'Chargement…';
  } else {
    btn.textContent = label || btn.dataset.originalLabel;
  }
}