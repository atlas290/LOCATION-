/* ============================================================
   LOCATION — js/app.js
   Rôle : Splash Screen + Thème + WhatsApp + Visite Assistée
   (Les favoris et la recherche sont gérés par properties.js)
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ============================================================
     0. SPLASH SCREEN (Animation de démarrage)
     ============================================================ */
  const splash = document.getElementById('splash-screen');
if (splash) {
  document.body.classList.add('no-scroll');
  
  // On attend 2 secondes (2000ms) pour que l'utilisateur voie le logo
  setTimeout(() => {
    splash.classList.add('is-hiding');
    // On le retire complètement après l'animation de fondu
    setTimeout(() => {
      splash.remove();
      document.body.classList.remove('no-scroll');
    }, 400); // 400ms correspond à la transition CSS
  }, 2000); 
}
  /* ============================================================
     1. GESTION DU THÈME (Mode Sombre / Clair)
     ============================================================ */
  const themeToggle = document.querySelector('[data-theme-toggle]') || document.querySelector('.theme-toggle');
  
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 
                           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }

  /* ============================================================
     2. BOUTON "CONTACTER" → WhatsApp (page annonce.html)
     ============================================================ */
  const contactButton = Array.from(document.querySelectorAll('button')).find(el => /contacter/i.test(el.textContent));

  if (contactButton) {
    contactButton.addEventListener('click', (event) => {
      event.preventDefault();
      const titleEl = document.querySelector('.detail-title');
      const title = titleEl ? titleEl.textContent.trim() : 'Annonce';
      const message = `Bonjour, je suis intéressé par l'annonce LOCATION : ${title}. Est-elle toujours disponible ?`;
      window.open(`https://wa.me/22900000000?text=${encodeURIComponent(message)}`, '_blank');
    });
  }

  /* ============================================================
     3. BOUTON "VISITE ASSISTÉE"
     ============================================================ */
  const visitButton = Array.from(document.querySelectorAll('button')).find(el => /visite/i.test(el.textContent));
  if (visitButton) {
    visitButton.addEventListener('click', (event) => {
      event.preventDefault();
      alert('La visite assistée sera bientôt disponible !');
    });
  }

});
