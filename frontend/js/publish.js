/* ============================================================
   LOCATION — js/publish.js
   Dynamisation du formulaire de publication (publier.html)
   Inclut : Carte, GPS, Aperçu photos compressées, Aperçu vidéo,
            Chips commodités, Soumission Backend avec JWT
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ============================================================
     ÉLÉMENTS COMMUNS & VARIABLES DE LA CARTE
     ============================================================ */
  const btnGeoloc     = document.getElementById('btn-geoloc');
  const btnGeolocText = document.getElementById('btn-geoloc-text');
  const latInput      = document.getElementById('latitude');
  const lngInput      = document.getElementById('longitude');
  const geoFeedback   = document.getElementById('geo-feedback');
  const mapsInput     = document.getElementById('google-maps-link');

  let map    = null;
  let marker = null;

  const updateMap = (lat, lng) => {
    if (!map) return;
    try {
      if (marker) map.removeLayer(marker);

      marker = L.marker([lat, lng], { draggable: true }).addTo(map);

      marker.on('dragend', function () {
        const position = marker.getLatLng();
        if (latInput) latInput.value = position.lat.toFixed(6);
        if (lngInput) lngInput.value = position.lng.toFixed(6);
        if (geoFeedback) {
          geoFeedback.hidden = false;
          geoFeedback.textContent = `Position ajustée : ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
        }
      });

      map.setView([lat, lng], 16);
    } catch (error) {
      console.error("Erreur d'affichage de la carte :", error);
    }
  };


  /* ============================================================
     1. INITIALISATION DE LA CARTE (LEAFLET)
     ============================================================ */
  const mapContainer = document.getElementById('map-preview');

  if (mapContainer) {
    const defaultLat = 6.3653;
    const defaultLng = 2.4183;

    map = L.map('map-preview').setView([defaultLat, defaultLng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    updateMap(defaultLat, defaultLng);

    if (latInput) latInput.value = defaultLat.toFixed(6);
    if (lngInput) lngInput.value = defaultLng.toFixed(6);

    map.on('click', function (e) {
      const { lat, lng } = e.latlng;
      if (latInput) latInput.value = lat.toFixed(6);
      if (lngInput) lngInput.value = lng.toFixed(6);
      updateMap(lat, lng);
      if (geoFeedback) {
        geoFeedback.hidden = false;
        geoFeedback.textContent = `Position choisie : ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    });
  }


  /* ============================================================
     2. GÉOLOCALISATION — Bouton "Utiliser ma position actuelle"
     ============================================================ */
  if (btnGeoloc && latInput && lngInput) {
    if (btnGeoloc.tagName === 'BUTTON' && !btnGeoloc.hasAttribute('type')) {
      btnGeoloc.setAttribute('type', 'button');
    }

    btnGeoloc.addEventListener('click', (event) => {
      event.preventDefault();

      if (!window.isSecureContext) {
        alert("La géolocalisation nécessite une connexion sécurisée (HTTPS). En attendant, cliquez sur la carte pour placer le marqueur.");
        return;
      }

      if (!('geolocation' in navigator)) {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        return;
      }

      const originalText = btnGeolocText ? btnGeolocText.textContent : 'Utiliser ma position actuelle';
      btnGeoloc.disabled = true;
      if (btnGeolocText) btnGeolocText.textContent = 'Localisation en cours…';

      let isResolved = false;
      const safetyTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          alert("Impossible de vous localiser. Veuillez cliquer sur la carte pour choisir votre position manuellement.");
          btnGeoloc.disabled = false;
          if (btnGeolocText) btnGeolocText.textContent = originalText;
        }
      }, 8000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(safetyTimeout);

          const { latitude, longitude } = position.coords;
          latInput.value = latitude.toFixed(6);
          lngInput.value = longitude.toFixed(6);

          if (geoFeedback) {
            geoFeedback.hidden = false;
            geoFeedback.textContent = `Position enregistrée : ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          }

          updateMap(latitude, longitude);
          btnGeoloc.disabled = false;
          if (btnGeolocText) btnGeolocText.textContent = originalText;
        },
        (error) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(safetyTimeout);

          console.warn('[LOCATION] Géolocalisation échouée :', error.code, error.message);

          let errorMsg = 'Impossible de récupérer votre position.';
          if (error.code === 1) errorMsg = "Vous avez refusé la localisation. Allez dans les paramètres de votre navigateur pour l'autoriser.";
          if (error.code === 2) errorMsg = 'Position indisponible. Vérifiez que le GPS de votre téléphone est bien activé.';
          if (error.code === 3) errorMsg = 'Délai dépassé. Le signal GPS est trop faible.';

          alert(errorMsg);
          btnGeoloc.disabled = false;
          if (btnGeolocText) btnGeolocText.textContent = originalText;
        },
        {
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 0
        }
      );
    });
  }


  /* ============================================================
     3. EXTRACTION DES COORDONNÉES DEPUIS UN LIEN GOOGLE MAPS
     ============================================================ */
  if (mapsInput) {
    mapsInput.addEventListener('change', () => {
      const url = mapsInput.value;
      if (!url) return;

      const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
      const match = url.match(regex);

      if (match && match[1] && match[2]) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);

        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);

        if (geoFeedback) {
          geoFeedback.hidden = false;
          geoFeedback.textContent = 'Coordonnées extraites du lien Google Maps !';
        }

        updateMap(lat, lng);
      }
    });
  }


  /* ============================================================
     4. COMPRESSION AUTOMATIQUE DES PHOTOS (CLIENT-SIDE)
     ============================================================ */

  // Tableau global : contiendra les Blobs compressés prêts pour l'envoi futur
  let compressedPhotos = [];

  // Suivi des URLs blob pour révocation mémoire
  let photoObjectURLs = [];

  /**
   * Formate un poids en octets vers "Ko" ou "Mo".
   */
  const formatSize = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
    return (n / (1024 * 1024)).toFixed(1) + ' Mo';
  };

  /**
   * Charge un fichier image via <img> classique (fallback).
   */
  const loadImageElement = (file) => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  };

  /**
   * Compresse une image côté client.
   * - Redimensionne à 1600px max (ratio préservé)
   * - Convertit en JPEG qualité 0.8
   * - Gère l'orientation EXIF via createImageBitmap (Safari moderne)
   * - Retourne toujours un Blob (fallback : fichier original)
   */
  const compressImage = async (file) => {
    try {
      let drawable;
      let srcWidth;
      let srcHeight;
      let isBitmap = false;

      // --- Tentative createImageBitmap (gère l'orientation EXIF) ---
      if (typeof createImageBitmap === 'function') {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
          drawable  = bitmap;
          srcWidth  = bitmap.width;
          srcHeight = bitmap.height;
          isBitmap  = true;
        } catch (e) {
          // Fallback : <img> classique (pas d'orientation EXIF sur vieux Safari)
        }
      }

      // --- Fallback <img> ---
      if (!drawable) {
        const img = await loadImageElement(file);
        drawable  = img;
        srcWidth  = img.naturalWidth || img.width;
        srcHeight = img.naturalHeight || img.height;
      }

      if (!srcWidth || !srcHeight) {
        throw new Error('Dimensions invalides');
      }

      // --- Calcul des dimensions cibles ---
      const MAX_DIM = 1600;
      let targetWidth  = srcWidth;
      let targetHeight = srcHeight;

      if (srcWidth > MAX_DIM || srcHeight > MAX_DIM) {
        if (srcWidth >= srcHeight) {
          targetWidth  = MAX_DIM;
          targetHeight = Math.round((srcHeight / srcWidth) * MAX_DIM);
        } else {
          targetHeight = MAX_DIM;
          targetWidth  = Math.round((srcWidth / srcHeight) * MAX_DIM);
        }
      }

      // --- Dessin sur canvas ---
      const canvas = document.createElement('canvas');
      canvas.width  = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);

      // --- Conversion en Blob JPEG 0.8 ---
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob vide'))),
          'image/jpeg',
          0.8
        );
      });

      // --- Nettoyage mémoire du bitmap ---
      if (isBitmap && drawable && typeof drawable.close === 'function') {
        drawable.close();
      }

      return blob;

    } catch (error) {
      console.warn('[COMPRESSION] Échec, fichier original conservé :', error);
      return file; // Fallback : on renvoie le fichier original
    }
  };


  /* ============================================================
     5. APERÇU DES PHOTOS (avec compression intégrée)
     ============================================================ */
  const photoInput   = document.getElementById('photo-input');
  const photoPreview = document.getElementById('photo-preview');

  if (photoInput && photoPreview) {
    photoInput.addEventListener('change', async () => {
      // --- Nettoyage des URLs et des Blobs précédents ---
      photoObjectURLs.forEach((url) => URL.revokeObjectURL(url));
      photoObjectURLs  = [];
      compressedPhotos = [];
      photoPreview.innerHTML = '';

      // --- Filtrage des fichiers (images uniquement) ---
      const files = Array.from(photoInput.files || [])
        .filter((f) => f.type.startsWith('image/'));

      if (files.length === 0) return;

      // --- Indicateur de chargement ---
      const loading = document.createElement('div');
      loading.textContent = `Compression de ${files.length} photo${files.length > 1 ? 's' : ''} en cours…`;
      loading.style.cssText =
        'grid-column: 1 / -1; text-align: center; padding: 16px; ' +
        'color: var(--text-muted); font-size: 13px; font-style: italic;';
      photoPreview.appendChild(loading);

      // --- Compression en parallèle (ordre préservé) ---
      const blobs = await Promise.all(files.map((f) => compressImage(f)));

      // --- Remplissage du tableau global (pour envoi futur) ---
      compressedPhotos.push(...blobs);

      // --- Construction des aperçus ---
      const fragment = document.createDocumentFragment();

      blobs.forEach((blob, index) => {
        const objectURL = URL.createObjectURL(blob);
        photoObjectURLs.push(objectURL);

        const item = document.createElement('div');
        item.className = 'photo-preview-item';
        item.style.cssText = 'position: relative;';

        const img = document.createElement('img');
        img.src = objectURL;
        img.alt = files[index].name || 'Aperçu photo';
        img.loading = 'lazy';

        // Badge poids en overlay
        const weight = document.createElement('span');
        weight.textContent = formatSize(blob.size);
        weight.style.cssText =
          'position: absolute; bottom: 4px; right: 4px; ' +
          'background: rgba(0, 0, 0, 0.7); color: #FFFFFF; ' +
          'padding: 2px 6px; border-radius: 4px; ' +
          'font-size: 10px; font-weight: 600; line-height: 1.4;';

        item.appendChild(img);
        item.appendChild(weight);
        fragment.appendChild(item);
      });

      // --- Remplacement du loader par les aperçus ---
      loading.remove();
      photoPreview.appendChild(fragment);
    });
  }


  /* ============================================================
     6. APERÇU DE LA VIDÉO
     ============================================================ */
  const videoInput   = document.getElementById('video-input');
  const videoPreview = document.getElementById('video-preview');
  let videoObjectURL = null;

  if (videoInput && videoPreview) {
    videoInput.addEventListener('change', () => {
      if (videoObjectURL) URL.revokeObjectURL(videoObjectURL);
      videoObjectURL = null;
      videoPreview.innerHTML = '';

      const file = videoInput.files && videoInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) return;

      videoObjectURL = URL.createObjectURL(file);

      const video = document.createElement('video');
      video.src = videoObjectURL;
      video.controls = true;
      video.preload = 'metadata';
      video.style.width = '100%';
      video.style.borderRadius = '8px';
      video.style.display = 'block';

      videoPreview.appendChild(video);
    });
  }


  /* ============================================================
     7. COMMODITÉS (Chips)
     ============================================================ */
  const amenitiesGrid = document.querySelector('.amenities-grid');

  if (amenitiesGrid) {
    const chips = amenitiesGrid.querySelectorAll('.chip');

    chips.forEach((chip) => {
      if (chip.tagName === 'BUTTON' && !chip.hasAttribute('type')) {
        chip.setAttribute('type', 'button');
      }
      chip.setAttribute('aria-pressed', chip.classList.contains('is-active') ? 'true' : 'false');

      chip.addEventListener('click', (event) => {
        event.preventDefault();
        chip.classList.toggle('is-active');
        const isActive = chip.classList.contains('is-active');
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });
  }


  /* ============================================================
     8. SOUMISSION DU FORMULAIRE (Connexion Backend)
     ============================================================ */
  const publishForm = document.getElementById('publish-form');

  if (publishForm) {
    publishForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      // -- Éléments UI --
      const submitBtn  = document.querySelector('button[form="publish-form"]');
      const errorBox   = document.getElementById('form-error');
      const successBox = document.getElementById('form-success');

      if (errorBox)   errorBox.hidden = true;
      if (successBox) successBox.hidden = true;

      // -- Récupération des valeurs --
      const title       = (document.getElementById('property-title')?.value || '').trim();
      const price       = parseFloat(document.getElementById('property-price')?.value) || 0;
      const city        = (document.getElementById('property-city')?.value || '').trim();
      const district    = (document.getElementById('property-district')?.value || '').trim();
      const description = (document.getElementById('property-description')?.value || '').trim();
      const type        = document.getElementById('property-type')?.value || '';
      const latitude    = parseFloat(latInput?.value) || null;
      const longitude   = parseFloat(lngInput?.value) || null;

      // Commodités sélectionnées
      const selectedAmenities = Array.from(document.querySelectorAll('.chip.is-active'))
        .map((chip) => chip.dataset.amenity || chip.textContent.trim());

      // Payload JSON (les médias seront ajoutés dans une prochaine itération)
      const payload = {
        title: title,
        description: description,
        price: price,
        location: `${city}, ${district}`,
        city: city,
        type: type,
        latitude: latitude,
        longitude: longitude,
        amenities: selectedAmenities
      };

      // Log des médias prêts (utile pour le futur envoi Cloudinary)
      if (compressedPhotos.length > 0) {
        const totalSize = compressedPhotos.reduce((sum, b) => sum + b.size, 0);
        console.info(
          `[MÉDIAS] ${compressedPhotos.length} photo(s) compressée(s) prête(s) ` +
          `(${formatSize(totalSize)} au total). Envoi vers Cloudinary à venir.`
        );
      } else {
        console.info('[MÉDIAS] Aucune photo sélectionnée.');
      }
      console.warn('[MÉDIAS] Vidéo ignorée pour l\'instant.');

      // -- Auth --
      const token = localStorage.getItem('access_token');

      if (!token) {
        if (errorBox) {
          errorBox.textContent = 'Vous devez être connecté pour publier une annonce.';
          errorBox.hidden = false;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // -- État de chargement --
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Publier';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publication en cours…';
      }

      try {
        const response = await fetch('http://localhost:8000/api/properties', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (response.status === 201 || response.ok) {
          if (successBox) {
            successBox.textContent = 'Votre annonce a été publiée avec succès ! Elle sera vérifiée par un administrateur.';
            successBox.hidden = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }

          if (submitBtn) submitBtn.textContent = 'Publiée !';

          setTimeout(() => {
            window.location.href = 'proprietaire.html';
          }, 2000);

        } else {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = 'Une erreur est survenue lors de la publication.';

          if (errorData.detail) {
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail;
            } else if (Array.isArray(errorData.detail)) {
              errorMessage = errorData.detail
                .map((err) => `${(err.loc || []).join('.')} : ${err.msg}`)
                .join(' | ');
            }
          }

          if (errorBox) {
            errorBox.textContent = `Erreur : ${errorMessage}`;
            errorBox.hidden = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }

          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
        }

      } catch (networkError) {
        console.error('[API] Erreur réseau :', networkError);
        if (errorBox) {
          errorBox.textContent = 'Impossible de contacter le serveur. Vérifiez que le backend est bien démarré.';
          errorBox.hidden = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }

});