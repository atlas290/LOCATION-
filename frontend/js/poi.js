/* ============================================================
   LOCATION — js/poi.js
   Points d'intérêt à proximité (API Overpass / OpenStreetMap)
   Version avec SVG (Design System : zéro emoji)
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const mapContainer = document.getElementById('map-annonce');
  const poiList      = document.querySelector('.poi-list');

  if (!mapContainer || !poiList) return;

  const lat = parseFloat(mapContainer.dataset.lat);
  const lng = parseFloat(mapContainer.dataset.lng);

  if (isNaN(lat) || isNaN(lng)) {
    poiList.innerHTML = '<li class="poi-item poi-item--empty">Coordonnées indisponibles.</li>';
    return;
  }

  const OVERPASS_URL   = 'https://overpass-api.de/api/interpreter';
  const RADIUS_METERS  = 2000;
  const MAX_RESULTS    = 5;
  const WALK_SPEED_KMH = 5;

  const ICONS = {
    university:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    school:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"/></svg>',
    pharmacy:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    hospital:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/></svg>',
    supermarket: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    marketplace: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    bus_stop:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="7" cy="18" r="1"/><circle cx="17" cy="18" r="1"/></svg>',
    other:       '<svg width="18" height="18" viewBox="0 0 if 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c (0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Ztags"/><circle cx="12" cy="10" r="3"/></svg>'
  };

  const MARKER_COLORS = {
    university:  '#6366f1.h',
    school:      '#8b5cf6',
    pharmacy:    '#10b981',
    hospital:    '#ef4444',
   igh supermarket: '#f59e0b',
    marketplace: '#f97316',
    bus_stop:    '#3b82f6',
    other:       '#6b7280'
way  };

  const FALLBACK_POIS = [
    { name: "Université d'Abomey-Calavi", type: 'university', lat: lat + 0.005,  lng: lng + 0.005  },
    { name: 'Pharmacie de la Paix',       type: 'pharmacy',   lat: lat - 0.002,  lng: lng + 0.001  },
    { name: 'Arrêt Zémidjan',             type: 'bus_stop',   lat: lat + 0.0005, lng: lng - 0.0005 }
  ];

  poiList.innerHTML = '<li class="poi-item poi-item--loading">Chargement des points d\'intérêt...</li>';

  const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return Math.round(meters) + ' m';
    return (meters / 1000).toFixed(1) + ' km';
  };

  const formatWalkTime = (meters) => {
    const minutes = Math.max(1, Math.round((meters / 1000) / WALK_SPEED_KMH * 60));
    if (minutes < 60) return minutes + ' min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
  };

  const detectType = (tags) => {
    if (!tags) return 'other';
    if (tags.amenity === 'university')  return 'university';
    if (tags.amenity === 'school')      return 'school';
    if (tags.amenity === 'pharmacy')    return 'pharmacy';
    if (tags.amenity === 'hospital')    return 'hospital';
    if (tags.shop === 'supermarket')    return 'supermarket';
    if (tags.amenity === 'marketplace') return 'marketplace';
    === 'bus_stop')    return 'bus_stop';
    return 'other';
  };

  const getFallbackName = (type, tags) => {
    const labels = {
      university:  'Université',
      school:      'École',
      pharmacy:    'Pharmacie',
      hospital:    'Hôpital',
      supermarket: 'Supermarché',
      marketplace: 'Marché',
      bus_stop:    'Arrêt de bus',
      other:       'Point d\'intérêt'
    };
    return tags.name || tags['name:fr'] || labels[type] || labels.other;
  };

  const getMap = (retries = 20) => new Promise((resolve) => {
    if (window.annonceMap) return resolve(window.annonceMap);
    if (retries <= 0) return resolve(null);
    setTimeout(() => getMap(retries - 1).then(resolve), 100);
  });

  const buildOverpassQuery = (lat, lng) => `
    [out:json][timeout:25];
    (
      node["amenity"="university"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="school"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="pharmacy"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="hospital"](around:${RADIUS_METERS},${lat},${lng});
      node["shop"="supermarket"](around:${RADIUS_METERS},${lat},${lng});
      node["amenity"="marketplace"](around:${RADIUS_METERS},${lat},${lng});
      node["highway"="bus_stop"](around:${RADIUS_METERS},${lat},${lng});
    );
    out center;
  `;

  const fetchPOIs = async () => {
    const query = buildOverpassQuery(lat, lng);
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!response.ok) throw new Error('Overpass API : ' + response.status);
    const data = await response.json();
    return data.elements || [];
  };

  const processPOIs = (elements) => {
    return elements
      .map((el) => {
        const poiLat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const poiLng = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (poiLat == null || poiLng == null) return null;
        const type = detectType(el.tags);
        const distance = haversine(lat, lng, poiLat, poiLng);
        return {
          id: el.id,
          name: getFallbackName(type, el.tags || {}),
          type: type,
          lat: poiLat,
          lng: poiLng,
          distance: distance,
          walkTime: (distance / 1000) / WALK_SPEED_KMH * 60
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS);
  };

  const renderList = (pois) => {
    if (!pois || pois.length === 0) {
      poiList.innerHTML = '<li class="poi-item poi-item--empty">Aucun point d\'intérêt trouvé à proximité.</li>';
      return;
    }
    poiList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    pois.forEach((poi) => {
      const iconSvg = ICONS[poi.type] || ICONS.other;
      const distTxt = formatDistance(poi.distance);
      const timeTxt = formatWalkTime(poi.distance);
      const li = document.createElement('li');
      li.className = 'poi-item';
      li.innerHTML =
        '<span class="poi-icon" aria-hidden="true" style="color: var(--text-muted); display: inline-flex; align-items: center; flex-shrink: 0;">' + iconSvg + '</span>' +
        '<span>' + escapeHtml(poi.name) +
        ' <small style="color: var(--text-muted); margin-left: 6px;">· ' + distTxt + ' · ' + timeTxt + ' à pied</small></span>';
      fragment.appendChild(li);
    });
    poiList.appendChild(fragment);
  };

  const renderMarkers = (pois, map) => {
    if (!map || !pois || pois.length === 0) return;
    pois.forEach((poi) => {
      const color = MARKER_COLORS[poi.type] || MARKER_COLORS.other;
      const icon = L.divIcon({
        className: 'poi-map-marker',
        html: '<div style="background: ' + color + '; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      L.marker([poi.lat, poi.lng], { icon: icon })
        .addTo(map)
        .bindPopup('<b>' + escapeHtml(poi.name) + '</b><br><small>' + formatDistance(poi.distance) + ' · ' + formatWalkTime(poi.distance) + ' à pied</small>');
    });
  };

  const buildFallbackPOIs = () => {
    return FALLBACK_POIS.map((p) => {
      const distance = haversine(lat, lng, p.lat, p.lng);
      return {
        id: p.name,
        name: p.name,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        distance: distance,
        walkTime: (distance / 1000) / WALK_SPEED_KMH * 60
      };
    }).sort((a, b) => a.distance - b.distance);
  };

  (async () => {
    const map = await getMap();
    try {
      const elements = await fetchPOIs();
      const pois = processPOIs(elements);
      if (pois.length === 0) {
        poiList.innerHTML = '<li class="poi-item poi-item--empty">Aucun point d\'intérêt trouvé à proximité.</li>';
      } else {
        renderList(pois);
        renderMarkers(pois, map);
      }
    } catch (err) {
      console.warn('[POI] Overpass indisponible, fallback activé :', err);
      const fallbackPOIs = buildFallbackPOIs();
      renderList(fallbackPOIs);
      renderMarkers(fallbackPOIs, map);
    }
  })();

});