/* Rando Radar v1.0 — mobile-first PWA */
(() => {
  'use strict';

  const state = {
    map: null,
    baseLayers: {},
    activeBase: 'topo',
    radarFrames: [],
    radarHost: '',
    radarLayer: null,
    radarEnabled: true,
    radarTimer: null,
    location: null,
    locationMarker: null,
    accuracyCircle: null,
    watchId: null,
    route: null,
    routeLine: null,
    routeMarkers: [],
    mode: 'hike',
    deferredInstall: null,
    lastWeather: null,
  };

  const $ = (id) => document.getElementById(id);
  const ui = {
    locateBtn: $('locateBtn'), installBtn: $('installBtn'), gpsBadge: $('gpsBadge'),
    radarToggle: $('radarToggle'), radarPanel: $('radarPanel'), radarSlider: $('radarSlider'),
    radarPlay: $('radarPlay'), radarTime: $('radarTime'),
    tempNow: $('tempNow'), rainNow: $('rainNow'), gustNow: $('gustNow'), feelNow: $('feelNow'), elevationNow: $('elevationNow'), weatherIcon: $('weatherIcon'),
    alertCard: $('alertCard'), alertIcon: $('alertIcon'), alertTitle: $('alertTitle'), alertText: $('alertText'),
    gpxInput: $('gpxInput'), analyzeBtn: $('analyzeBtn'), routeCard: $('routeCard'), routeName: $('routeName'), routeDistance: $('routeDistance'), routeGain: $('routeGain'), routeLoss: $('routeLoss'), routeHigh: $('routeHigh'), routeForecast: $('routeForecast'), clearRouteBtn: $('clearRouteBtn'),
    hourlyForecast: $('hourlyForecast'), refreshWeatherBtn: $('refreshWeatherBtn'), toast: $('toast')
  };

  function initMap() {
    state.map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([44.2, 6.7], 8);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    state.baseLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)'
    });
    state.baseLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });
    state.baseLayers.topo.addTo(state.map);
  }

  function switchBase(name) {
    if (!state.baseLayers[name] || name === state.activeBase) return;
    state.map.removeLayer(state.baseLayers[state.activeBase]);
    state.baseLayers[name].addTo(state.map);
    state.activeBase = name;
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.classList.toggle('active', btn.dataset.basemap === name));
    if (state.radarLayer && state.radarEnabled) state.radarLayer.bringToFront();
    if (state.routeLine) state.routeLine.bringToFront();
  }

  async function loadRadar() {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Radar indisponible');
      const data = await res.json();
      state.radarHost = data.host;
      state.radarFrames = data.radar?.past || [];
      if (!state.radarFrames.length) throw new Error('Aucune image radar');
      ui.radarSlider.max = String(state.radarFrames.length - 1);
      ui.radarSlider.value = String(state.radarFrames.length - 1);
      showRadarFrame(state.radarFrames.length - 1);
    } catch (err) {
      ui.radarTime.textContent = 'Radar indisponible';
      toast('Impossible de charger le radar pour le moment.');
    }
  }

  function showRadarFrame(index) {
    if (!state.radarFrames.length) return;
    index = Math.max(0, Math.min(index, state.radarFrames.length - 1));
    const frame = state.radarFrames[index];
    if (state.radarLayer) state.map.removeLayer(state.radarLayer);
    const url = `${state.radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`;
    state.radarLayer = L.tileLayer(url, {
      opacity: 0.62,
      maxNativeZoom: 7,
      maxZoom: 19,
      tileSize: 256,
      attribution: 'Weather radar © RainViewer'
    });
    if (state.radarEnabled) state.radarLayer.addTo(state.map);
    ui.radarSlider.value = String(index);
    const d = new Date(frame.time * 1000);
    ui.radarTime.textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (state.routeLine) state.routeLine.bringToFront();
  }

  function toggleRadar() {
    state.radarEnabled = !state.radarEnabled;
    ui.radarToggle.classList.toggle('active', state.radarEnabled);
    ui.radarPanel.classList.toggle('hidden', !state.radarEnabled);
    if (!state.radarLayer) return;
    if (state.radarEnabled) state.radarLayer.addTo(state.map); else state.map.removeLayer(state.radarLayer);
    if (state.routeLine) state.routeLine.bringToFront();
  }

  function toggleRadarAnimation() {
    if (state.radarTimer) {
      clearInterval(state.radarTimer);
      state.radarTimer = null;
      ui.radarPlay.textContent = '▶';
      return;
    }
    ui.radarPlay.textContent = '⏸';
    state.radarTimer = setInterval(() => {
      let i = Number(ui.radarSlider.value) + 1;
      if (i >= state.radarFrames.length) i = 0;
      showRadarFrame(i);
    }, 650);
  }

  function startLocation(center = true) {
    if (!('geolocation' in navigator)) {
      toast('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }
    ui.gpsBadge.textContent = 'GPS : recherche…';
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = navigator.geolocation.watchPosition(
      pos => updateLocation(pos, center),
      err => {
        ui.gpsBadge.textContent = 'GPS : erreur';
        toast(err.code === 1 ? 'Autorise la localisation pour utiliser le GPS.' : 'Position GPS indisponible.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function updateLocation(pos, center) {
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    state.location = { lat: latitude, lon: longitude, accuracy, altitude };
    const ll = [latitude, longitude];
    if (!state.locationMarker) {
      const icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [18,18], iconAnchor:[9,9] });
      state.locationMarker = L.marker(ll, { icon, zIndexOffset: 1000 }).addTo(state.map);
      state.accuracyCircle = L.circle(ll, { radius: accuracy || 10, weight: 1, fillOpacity: .07, opacity: .35 }).addTo(state.map);
    } else {
      state.locationMarker.setLatLng(ll);
      state.accuracyCircle.setLatLng(ll).setRadius(accuracy || 10);
    }
    ui.gpsBadge.textContent = `GPS : ±${Math.round(accuracy || 0)} m`;
    if (altitude != null && Number.isFinite(altitude)) ui.elevationNow.textContent = `${Math.round(altitude)} m`;
    if (center) {
      state.map.setView(ll, Math.max(state.map.getZoom(), 13));
      center = false;
    }
    scheduleWeather(latitude, longitude);
  }

  let weatherDebounce = null;
  let lastWeatherKey = '';
  function scheduleWeather(lat, lon) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (key === lastWeatherKey) return;
    clearTimeout(weatherDebounce);
    weatherDebounce = setTimeout(() => {
      lastWeatherKey = key;
      loadWeather(lat, lon);
    }, 500);
  }

  async function loadWeather(lat, lon) {
    try {
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_gusts_10m',
        forecast_days: '2',
        timezone: 'auto'
      });
      const res = await fetch(`https://api.open-meteo.com/v1/meteofrance?${params}`);
      if (!res.ok) throw new Error('Météo indisponible');
      const data = await res.json();
      state.lastWeather = data;
      renderCurrentWeather(data);
      renderHourly(data);
      if (data.elevation != null) ui.elevationNow.textContent = `${Math.round(data.elevation)} m`;
    } catch (err) {
      toast('Impossible de récupérer la météo locale.');
    }
  }

  function renderCurrentWeather(data) {
    const c = data.current || {};
    ui.tempNow.textContent = number(c.temperature_2m, 0, '--');
    ui.rainNow.textContent = `${number(c.precipitation, 1, '--')} mm`;
    ui.gustNow.textContent = `${number(c.wind_gusts_10m, 0, '--')} km/h`;
    ui.feelNow.textContent = `${number(c.apparent_temperature, 0, '--')}°`;
    ui.weatherIcon.textContent = weatherEmoji(c.weather_code);

    const rain = Number(c.precipitation || 0);
    const gust = Number(c.wind_gusts_10m || 0);
    if (rain >= 4 || gust >= 70) setAlert('danger', '⚠️', 'Conditions difficiles', `Pluie ${rain.toFixed(1)} mm et rafales ${Math.round(gust)} km/h actuellement.`);
    else if (rain > 0.2 || gust >= 45) setAlert('warn', '🌦️', 'Conditions à surveiller', `Pluie ${rain.toFixed(1)} mm · rafales ${Math.round(gust)} km/h actuellement.`);
    else setAlert('safe', '✅', 'Conditions locales calmes', `Pas de signal météo fort à ta position. Rafales ${Math.round(gust)} km/h.`);
  }

  function renderHourly(data) {
    const h = data.hourly;
    if (!h?.time?.length) return;
    const now = Date.now();
    const items = [];
    for (let i = 0; i < h.time.length && items.length < 10; i++) {
      const t = new Date(h.time[i]).getTime();
      if (t < now - 30 * 60 * 1000) continue;
      items.push({
        time: new Date(h.time[i]), temp: h.temperature_2m[i], rain: h.precipitation[i], pop: h.precipitation_probability?.[i], code: h.weather_code[i], gust: h.wind_gusts_10m[i]
      });
    }
    ui.hourlyForecast.innerHTML = items.map(x => `
      <div class="hour-card">
        <div class="time">${x.time.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</div>
        <div class="ico">${weatherEmoji(x.code)}</div>
        <div class="temp">${Math.round(x.temp)}°</div>
        <div class="rain">${x.pop ?? '--'}% · ${Number(x.rain || 0).toFixed(1)}mm</div>
      </div>`).join('');
  }

  function setAlert(level, icon, title, text) {
    ui.alertCard.className = `alert-card ${level}`;
    ui.alertIcon.textContent = icon;
    ui.alertTitle.textContent = title;
    ui.alertText.textContent = text;
  }

  async function importGpx(file) {
    try {
      const text = await file.text();
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('GPX illisible');
      const trkpts = [...xml.querySelectorAll('trkpt')];
      const rtepts = [...xml.querySelectorAll('rtept')];
      const nodes = trkpts.length ? trkpts : rtepts;
      if (nodes.length < 2) throw new Error('Aucun tracé exploitable');
      const pts = nodes.map(n => ({
        lat: Number(n.getAttribute('lat')),
        lon: Number(n.getAttribute('lon')),
        ele: n.querySelector('ele') ? Number(n.querySelector('ele').textContent) : null,
        time: n.querySelector('time')?.textContent || null
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (pts.length < 2) throw new Error('Tracé vide');

      let distance = 0, gain = 0, loss = 0;
      let high = -Infinity, low = Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (i) distance += haversine(pts[i-1], pts[i]);
        if (pts[i].ele != null && Number.isFinite(pts[i].ele)) {
          high = Math.max(high, pts[i].ele); low = Math.min(low, pts[i].ele);
          if (i && pts[i-1].ele != null && Number.isFinite(pts[i-1].ele)) {
            const d = pts[i].ele - pts[i-1].ele;
            if (d > 1) gain += d; else if (d < -1) loss += -d;
          }
        }
      }
      const name = xml.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || file.name.replace(/\.gpx$/i, '');
      state.route = { points: pts, distanceKm: distance, gain, loss, high: Number.isFinite(high) ? high : null, low: Number.isFinite(low) ? low : null, name };
      drawRoute();
      renderRouteStats();
      toast(`Parcours chargé : ${distance.toFixed(1)} km`);
    } catch (err) {
      toast(err.message || 'Impossible de lire ce GPX.');
    }
  }

  function drawRoute() {
    if (state.routeLine) state.map.removeLayer(state.routeLine);
    state.routeMarkers.forEach(m => state.map.removeLayer(m));
    state.routeMarkers = [];
    const latlngs = state.route.points.map(p => [p.lat, p.lon]);
    state.routeLine = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: .95 }).addTo(state.map);
    state.map.fitBounds(state.routeLine.getBounds(), { padding: [24,24] });
    state.routeLine.bringToFront();
  }

  function renderRouteStats() {
    const r = state.route;
    ui.routeCard.classList.remove('hidden');
    ui.routeName.textContent = r.name;
    ui.routeDistance.textContent = `${r.distanceKm.toFixed(1)} km`;
    ui.routeGain.textContent = r.high == null ? '—' : `${Math.round(r.gain)} m`;
    ui.routeLoss.textContent = r.high == null ? '—' : `${Math.round(r.loss)} m`;
    ui.routeHigh.textContent = r.high == null ? '—' : `${Math.round(r.high)} m`;
    ui.analyzeBtn.disabled = false;
    ui.routeForecast.classList.add('hidden');
    ui.routeForecast.innerHTML = '';
  }

  function clearRoute() {
    if (state.routeLine) state.map.removeLayer(state.routeLine);
    state.routeMarkers.forEach(m => state.map.removeLayer(m));
    state.routeMarkers = [];
    state.routeLine = null; state.route = null;
    ui.routeCard.classList.add('hidden');
    ui.analyzeBtn.disabled = true;
    ui.gpxInput.value = '';
  }

  async function analyzeRoute() {
    if (!state.route) return;
    ui.analyzeBtn.disabled = true;
    ui.analyzeBtn.querySelector('small').textContent = 'Analyse en cours…';
    try {
      const samples = sampleRoute(state.route.points, 6);
      const lats = samples.map(s => s.point.lat).join(',');
      const lons = samples.map(s => s.point.lon).join(',');
      const params = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'temperature_2m,precipitation,weather_code,wind_gusts_10m',
        forecast_days: '2',
        timezone: 'auto'
      });
      const res = await fetch(`https://api.open-meteo.com/v1/meteofrance?${params}`);
      if (!res.ok) throw new Error('Analyse météo indisponible');
      let forecasts = await res.json();
      if (!Array.isArray(forecasts)) forecasts = [forecasts];
      const speed = state.mode === 'bike' ? 20 : 4;
      const now = Date.now();
      const results = samples.map((s, i) => {
        const f = forecasts[i] || forecasts[0];
        const etaHours = s.distanceKm / speed;
        const eta = new Date(now + etaHours * 3600000);
        const idx = nearestTimeIndex(f.hourly?.time || [], eta);
        return {
          distanceKm: s.distanceKm,
          eta,
          temp: f.hourly?.temperature_2m?.[idx],
          precip: f.hourly?.precipitation?.[idx],
          gust: f.hourly?.wind_gusts_10m?.[idx],
          code: f.hourly?.weather_code?.[idx],
          point: s.point
        };
      });
      renderRouteForecast(results);
      summarizeRouteRisk(results);
    } catch (err) {
      toast(err.message || 'Impossible d’analyser le parcours.');
    } finally {
      ui.analyzeBtn.disabled = false;
      ui.analyzeBtn.querySelector('small').textContent = 'Météo sur le trajet';
    }
  }

  function renderRouteForecast(results) {
    state.routeMarkers.forEach(m => state.map.removeLayer(m));
    state.routeMarkers = [];
    ui.routeForecast.innerHTML = results.map((r, i) => {
      const risk = riskFor(r.precip, r.gust, r.code);
      const meta = `${r.eta.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${number(r.temp,0,'--')}° · raf. ${number(r.gust,0,'--')} km/h`;
      return `<div class="route-step">
        <div class="km">${r.distanceKm.toFixed(1)} km</div>
        <div class="desc"><strong>${weatherEmoji(r.code)} ${weatherText(r.code)}</strong><div class="meta">${meta}</div></div>
        <div class="risk">${risk.emoji} ${number(r.precip,1,'--')}mm</div>
      </div>`;
    }).join('');
    ui.routeForecast.classList.remove('hidden');

    results.forEach((r, idx) => {
      if (idx === 0 || idx === results.length - 1) return;
      const icon = L.divIcon({ className: '', html: '<div class="route-marker"></div>', iconSize:[10,10], iconAnchor:[5,5] });
      state.routeMarkers.push(L.marker([r.point.lat, r.point.lon], { icon, interactive:false }).addTo(state.map));
    });
  }

  function summarizeRouteRisk(results) {
    const ranked = results.map(r => ({...r, risk: riskFor(r.precip, r.gust, r.code)})).sort((a,b) => b.risk.score - a.risk.score);
    const worst = ranked[0];
    if (!worst || worst.risk.score === 0) {
      setAlert('safe', '✅', 'Parcours plutôt favorable', 'Aucun signal fort détecté aux points analysés du parcours.');
      return;
    }
    const when = worst.eta.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
    const text = `Vers ${worst.distanceKm.toFixed(1)} km (~${when}) : ${number(worst.precip,1,'--')} mm de pluie, rafales ${number(worst.gust,0,'--')} km/h.`;
    setAlert(worst.risk.score >= 3 ? 'danger' : 'warn', worst.risk.emoji, worst.risk.score >= 3 ? 'Point météo défavorable sur le parcours' : 'Un passage est à surveiller', text);
  }

  function sampleRoute(points, count) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i-1] + haversine(points[i-1], points[i]));
    const total = cum[cum.length - 1];
    const out = [];
    for (let k = 0; k < count; k++) {
      const target = (total * k) / (count - 1);
      let idx = 0;
      while (idx < cum.length - 1 && cum[idx] < target) idx++;
      out.push({ point: points[idx], distanceKm: cum[idx] });
    }
    return out;
  }

  function nearestTimeIndex(times, date) {
    if (!times.length) return 0;
    let best = 0, bestDiff = Infinity;
    const target = date.getTime();
    times.forEach((t, i) => {
      const d = Math.abs(new Date(t).getTime() - target);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
  }

  function riskFor(precip = 0, gust = 0, code = 0) {
    precip = Number(precip || 0); gust = Number(gust || 0); code = Number(code || 0);
    let score = 0, emoji = '✅';
    if (precip >= 0.5 || gust >= 40 || code >= 61) { score = 1; emoji = '🟡'; }
    if (precip >= 2 || gust >= 55 || [65,67,82,95,96,99].includes(code)) { score = 2; emoji = '🟠'; }
    if (precip >= 5 || gust >= 70 || [96,99].includes(code)) { score = 3; emoji = '🔴'; }
    return { score, emoji };
  }

  function haversine(a, b) {
    const R = 6371;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const rad = d => d * Math.PI / 180;
  const number = (v, digits = 0, fallback = '--') => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : fallback;

  function weatherEmoji(code) {
    code = Number(code);
    if (code === 0) return '☀️';
    if ([1,2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,56,57].includes(code)) return '🌦️';
    if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '🌨️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '🌤️';
  }
  function weatherText(code) {
    code = Number(code);
    if (code === 0) return 'Ciel clair';
    if ([1,2].includes(code)) return 'Peu nuageux';
    if (code === 3) return 'Couvert';
    if ([45,48].includes(code)) return 'Brouillard';
    if ([51,53,55,56,57].includes(code)) return 'Bruine';
    if ([61,63,65,66,67].includes(code)) return 'Pluie';
    if ([80,81,82].includes(code)) return 'Averses';
    if ([71,73,75,77,85,86].includes(code)) return 'Neige';
    if ([95,96,99].includes(code)) return 'Orage';
    return 'Variable';
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }

  function bindEvents() {
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.addEventListener('click', () => switchBase(btn.dataset.basemap)));
    ui.radarToggle.addEventListener('click', toggleRadar);
    ui.radarSlider.addEventListener('input', e => showRadarFrame(Number(e.target.value)));
    ui.radarPlay.addEventListener('click', toggleRadarAnimation);
    ui.locateBtn.addEventListener('click', () => startLocation(true));
    ui.gpxInput.addEventListener('change', e => e.target.files?.[0] && importGpx(e.target.files[0]));
    ui.clearRouteBtn.addEventListener('click', clearRoute);
    ui.analyzeBtn.addEventListener('click', analyzeRoute);
    ui.refreshWeatherBtn.addEventListener('click', () => state.location ? loadWeather(state.location.lat, state.location.lon) : startLocation(false));
    document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      if (state.route && !ui.routeForecast.classList.contains('hidden')) analyzeRoute();
    }));

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.deferredInstall = e;
      ui.installBtn.classList.remove('hidden');
    });
    ui.installBtn.addEventListener('click', async () => {
      if (!state.deferredInstall) return;
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      ui.installBtn.classList.add('hidden');
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initMap();
  bindEvents();
  registerSW();
  loadRadar();
  setTimeout(() => startLocation(true), 400);
})();
