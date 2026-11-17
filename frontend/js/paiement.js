/* ============================================================
   LOCATION — js/paiement.js
   Dynamisation de la page paiement.html (Checkout)
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ============================================================
     0. TABLE DES PLANS DISPONIBLES
     ============================================================ */
  const PLANS = {
    'visibilite-semaine':    { nom: 'Offre Semaine',  prix: 2000,  duree: '/ 7 jours',  type: 'visibility' },
    'visibilite-active':     { nom: 'Offre Active',   prix: 5000,  duree: '/ 30 jours', type: 'visibility' },
    'visibilite-premium':    { nom: 'Offre Premium',  prix: 10000, duree: '/ 30 jours', type: 'visibility' },
    'gestion-gratuit':       { nom: 'Palier Gratuit', prix: 0,     duree: '/ mois',     type: 'management' },
    'gestion-pro-essentiel': { nom: 'Pro Essentiel',  prix: 1000,  duree: '/ mois',     type: 'management' },
    'gestion-pro-confort':   { nom: 'Pro Confort',    prix: 5000,  duree: '/ mois',     type: 'management' }
  };


  /* ============================================================
     1. LECTURE DU PARAMÈTRE ?plan=xxx DANS L'URL
     ============================================================ */
  const params  = new URLSearchParams(window.location.search);
  const planKey = params.get('plan');
  const plan    = planKey ? PLANS[planKey] : null;

  // Plan inconnu ou absent → redirection vers la page d'abonnement
  if (!plan) {
    window.location.replace('abonnement.html');
    return; // On stoppe l'exécution du script
  }


  /* ============================================================
     2. REMPLISSAGE DYNAMIQUE DE LA PAGE
     ============================================================ */
  // Formatage du prix avec espace (ex: "10 000")
  const formatPrice = (amount) => new Intl.NumberFormat('fr-FR').format(amount);

  // Sélecteurs des éléments à mettre à jour
  const nameEl       = document.getElementById('plan-name');
  const priceEl      = document.getElementById('plan-price');
  const durationEl   = document.getElementById('plan-duration');
  const totalEl      = document.getElementById('total-amount');
  const payBtn       = document.getElementById('pay-btn');
  const totalLabelEl = document.querySelector('.payment-bar__total-label');

  // --- Nom de l'offre ---
  if (nameEl) nameEl.textContent = plan.nom;

  // --- Prix dans le récap (haut de page) ---
  if (priceEl) priceEl.textContent = formatPrice(plan.prix);

  // --- Durée ---
  if (durationEl) durationEl.textContent = plan.duree;

  // --- Prix dans la barre sticky (bas de page) ---
  if (totalEl) totalEl.textContent = formatPrice(plan.prix);

  // --- Texte du bouton (différent si gratuit) ---
  const isFree = plan.prix === 0;
  if (payBtn) {
    payBtn.textContent = isFree
      ? 'Activer gratuitement'
      : `Payer ${formatPrice(plan.prix)} FCFA`;
  }

  // --- Si gratuit : on adapte aussi le label de la barre sticky ---
  if (isFree && totalLabelEl) {
    totalLabelEl.textContent = 'Montant';
  }


  /* ============================================================
     3. CAS SPÉCIAL : PLAN GRATUIT
     On cache les moyens de paiement et le champ téléphone
     ============================================================ */
  const paymentMethodsSection = document.querySelector('.payment-methods');
  const sectionTitleEl = document.querySelector('.checkout-section-title');
  const phoneGroup     = document.getElementById('phone-group')
                      || document.getElementById('phone-field');
  const phoneInput     = document.getElementById('phone');

  if (isFree) {
    // Cacher le titre "Choisissez votre moyen de paiement"
    if (sectionTitleEl) sectionTitleEl.style.display = 'none';
    // Cacher la liste des moyens de paiement
    if (paymentMethodsSection) paymentMethodsSection.style.display = 'none';
    // Cacher le champ téléphone
    if (phoneGroup) phoneGroup.hidden = true;
  }


  /* ============================================================
     4. GESTION DES MOYENS DE PAIEMENT
     - Toggle visuel .is-active sur la carte cliquée
     - Affiche/masque le champ téléphone selon le moyen
     ============================================================ */
  const radios = document.querySelectorAll('input[name="payment"]');

  /**
   * Met à jour l'état visuel des cartes + la visibilité du champ téléphone
   * en fonction du radio actuellement coché.
   */
  const updatePaymentUI = () => {
    const selected = document.querySelector('input[name="payment"]:checked');

    // --- Toggle .is-active sur chaque carte ---
    radios.forEach((radio) => {
      const card = radio.closest('.payment-method');
      if (!card) return;
      if (radio.checked) {
        card.classList.add('is-active');
      } else {
        card.classList.remove('is-active');
      }
    });

    // --- Gestion du champ téléphone ---
    if (isFree || !selected) return;

    const needsPhone = selected.getAttribute('data-requires-phone') === 'true';

    if (phoneGroup) {
      if (needsPhone) {
        phoneGroup.removeAttribute('hidden');
        phoneGroup.hidden = false;
        if (phoneInput) phoneInput.setAttribute('required', 'required');
      } else {
        phoneGroup.setAttribute('hidden', '');
        phoneGroup.hidden = true;
        if (phoneInput) {
          phoneInput.removeAttribute('required');
          phoneInput.value = ''; // On nettoie pour éviter un envoi fantôme
        }
      }
    }
  };

  // Écouteurs sur chaque radio
  radios.forEach((radio) => {
    radio.addEventListener('change', updatePaymentUI);
  });

  // Initialisation au chargement
  updatePaymentUI();


  /* ============================================================
     5. SOUMISSION (Simulation)
     ============================================================ */
  if (payBtn) {
    payBtn.addEventListener('click', (event) => {
      event.preventDefault();

      // --- Cas gratuit : activation directe ---
      if (isFree) {
        alert(`Activation de ${plan.nom} en cours...`);
        return;
      }

      // --- Récupération du moyen de paiement sélectionné ---
      const selected = document.querySelector('input[name="payment"]:checked');
      if (!selected) {
        alert('Veuillez choisir un moyen de paiement.');
        return;
      }

      // --- Validation du numéro de téléphone si Mobile Money ---
      const needsPhone = selected.getAttribute('data-requires-phone') === 'true';
      if (needsPhone && phoneInput && !phoneInput.value.trim()) {
        alert('Veuillez saisir votre numéro Mobile Money.');
        phoneInput.focus();
        return;
      }

      // --- Nom lisible du moyen de paiement ---
      const labels = {
        mtn:     'MTN Mobile Money',
        moov:    'Moov Money',
        celtiis: 'Celtiis Cash',
        card:    'Carte bancaire'
      };
      const methodName = labels[selected.value] || selected.value;

      // --- Simulation de la redirection ---
      alert(`Redirection vers le paiement ${methodName}...`);

      // TODO (plus tard) : remplacer par l'appel réel à l'API de paiement
      // Ex : fetchAPI('/payments', { method: 'POST', body: JSON.stringify({...}) })
    });
  }

});