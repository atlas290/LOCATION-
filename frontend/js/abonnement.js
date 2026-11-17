/* =========================================================
   LOCATION — Page Abonnement
   - Bascule entre les onglets Visibilité / Gestion Locative
   - Redirection vers paiement.html avec le plan en paramètre
   ========================================================= */

(function () {
  'use strict';

  /* -------------------------------------------------------
     1. GESTION DES ONGLETS
     ------------------------------------------------------- */
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.tab-content');

  function activateTab(tab) {
    var target = tab.getAttribute('data-tab');

    tabs.forEach(function (t) {
      t.classList.remove('is-active');
      t.setAttribute('aria-selected', 'false');
    });
    panels.forEach(function (p) {
      p.classList.remove('is-active');
    });

    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');

    var targetPanel = document.querySelector('[data-tab-content="' + target + '"]');
    if (targetPanel) {
      targetPanel.classList.add('is-active');
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activateTab(tab);
    });
  });

  /* -------------------------------------------------------
     2. REDIRECTION VERS PAIEMENT
     Chaque CTA porte un attribut data-plan (ex: "visibilite-active").
     On encode le paramètre pour éviter toute injection.
     ------------------------------------------------------- */
  var planButtons = document.querySelectorAll('[data-plan]');

  planButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var plan = btn.getAttribute('data-plan');
      if (!plan) return;
      window.location.href = 'paiement.html?plan=' + encodeURIComponent(plan);
    });
  });

})();