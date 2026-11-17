/* ============================================================
   LOCATION — js/map-annonce.js
   Carte Leaflet pour la fiche annonce (annonce.html)
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const mapContainer = document.getElementById('map-annonce');

  if (!mapContainer) return; // Sécurité : on n'est pas sur annonce.html

  // 1. Récupération des coordonnées (depuis data-lat / data-lng, ou fallback)
  const defaultLat = 6.4478; // Abomey-Calavi par défaut
  const defaultLng = 2.3556;

  const lat = parseFloat(mapContainer.dataset.lat) || defaultLat;
  const lng = parseFloat(mapContainer.dataset.lng) || defaultLng;

  // 2. Initialisation de la carte
  const map = L.map('map-annonce', {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([lat, lng], 15);

  // ⬇️ LIGNE CRITIQUE POUR poi.js ⬇️
  window.annonceMap = map;

  // 3. Ajout des tuiles OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // 4. Ajout du marqueur (Pin)
  const marker = L.marker([lat, lng]).addTo(map);

  // (Optionnel) Ajout d'une petite infobulle au clic sur le marqueur
  marker.bindPopup('<b>Position du bien</b><br>Cliquez pour fermer').openPopup();

  // 5. Sécurité supplémentaire : on s'assure que le zoom molette est bien désactivé
  map.scrollWheelZoom.disable();
});