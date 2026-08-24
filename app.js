/* Rando Radar v1.3 — carte, GPX, radar, planificateur, suivi d'activité et navigation point */
(() => {
  'use strict';

  const ROUTER_MIN_INTERVAL = 1100;
  const SAVED_ROUTES_KEY = 'randoRadar.savedRoutes.v1';

  const state = {
    map: null,
    mapFullscreen: false,
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
    centerOnNextLocation: false,
    route: null,
    routeLine: null,
    routeMarkers: [],
    mode: 'hike',
    deferredInstall: null,
    lastWeather: null,
    planner: {
      active: false,
      mode: 'hike',
      waypoints: [],
      markers: [],
      line: null,
      routePoints: [],
      routeTimer: null,
      lastRequestAt: 0,
      requestSerial: 0,
      routing: false,
    },
    activity: {
      status: 'idle', // idle | recording | paused | finished
      mode: 'hike',
      startedAt: null,
      pausedAt: null,
      pausedMs: 0,
      finishedAt: null,
      points: [],
      distanceKm: 0,
      currentSpeed: 0,
      line: null,
      timer: null,
      name: '',
      targetSelect: false,
      target: null,
      targetMarker: null,
      targetLine: null,
    }
  };

  const $ = id => document.getElementById(id);
  const ui = {
    locateBtn: $('locateBtn'), installBtn: $('installBtn'), gpsBadge: $('gpsBadge'),
    radarToggle: $('radarToggle'), radarPanel: $('radarPanel'), radarSlider: $('radarSlider'), radarPlay: $('radarPlay'), radarTime: $('radarTime'),
    mapWrap: $('mapWrap'), mapCloseBtn: $('mapCloseBtn'), mapLocateBtn: $('mapLocateBtn'), mapZoomControls: $('mapZoomControls'), mapZoomInBtn: $('mapZoomInBtn'), mapZoomOutBtn: $('mapZoomOutBtn'), mapExpandHint: $('mapExpandHint'),
    tempNow: $('tempNow'), rainNow: $('rainNow'), gustNow: $('gustNow'), feelNow: $('feelNow'), elevationNow: $('elevationNow'), weatherIcon: $('weatherIcon'),
    alertCard: $('alertCard'), alertIcon: $('alertIcon'), alertTitle: $('alertTitle'), alertText: $('alertText'),
    gpxInput: $('gpxInput'), analyzeBtn: $('analyzeBtn'), routeCard: $('routeCard'), routeName: $('routeName'), routeDistance: $('routeDistance'), routeGain: $('routeGain'), routeLoss: $('routeLoss'), routeHigh: $('routeHigh'), routeForecast: $('routeForecast'), clearRouteBtn: $('clearRouteBtn'), exportRouteBtn: $('exportRouteBtn'),
    hourlyForecast: $('hourlyForecast'), refreshWeatherBtn: $('refreshWeatherBtn'), toast: $('toast'),
    createRouteBtn: $('createRouteBtn'), plannerPanel: $('plannerPanel'), plannerStatus: $('plannerStatus'), plannerGpsBtn: $('plannerGpsBtn'), plannerUndoBtn: $('plannerUndoBtn'), plannerClearBtn: $('plannerClearBtn'), plannerSaveBtn: $('plannerSaveBtn'),
    savedRoutesCard: $('savedRoutesCard'), savedRoutesList: $('savedRoutesList'),
    activityOpenBtn: $('activityOpenBtn'), activityCard: $('activityCard'), activityTitle: $('activityTitle'), activityCloseCardBtn: $('activityCloseCardBtn'), activityStartBtn: $('activityStartBtn'), activityExportBtn: $('activityExportBtn'), activityStats: $('activityStats'), activityDistance: $('activityDistance'), activityTime: $('activityTime'), activitySpeed: $('activitySpeed'), activityAvgSpeed: $('activityAvgSpeed'), activityHelp: $('activityHelp'),
    activityMapPanel: $('activityMapPanel'), activityMapTitle: $('activityMapTitle'), activityMapStatus: $('activityMapStatus'), activityMapDistance: $('activityMapDistance'), activityMapTime: $('activityMapTime'), activityMapSpeed: $('activityMapSpeed'), activityPauseBtn: $('activityPauseBtn'), activityStopBtn: $('activityStopBtn'),
    targetSelectBtn: $('targetSelectBtn'), targetGuide: $('targetGuide'), targetArrow: $('targetArrow'), targetDistance: $('targetDistance'), targetBearing: $('targetBearing'), targetEta: $('targetEta'), targetClearBtn: $('targetClearBtn')
  };

  function initMap() {
    state.map = L.map('map', { zoomControl: false, preferCanvas: true, tap: true }).setView([44.2, 6.7], 8);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    state.baseLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)'
    });
    state.baseLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });
    state.baseLayers.topo.addTo(state.map);

    state.map.on('click', handleMapClick);
  }

  function handleMapClick(e) {
    if (!state.mapFullscreen && !state.planner.active && !state.activity.targetSelect) {
      enterMapFullscreen();
      return;
    }
    if (state.planner.active) {
      addPlannerWaypoint({ lat: e.latlng.lat, lon: e.latlng.lng });
      return;
    }
    if (state.activity.targetSelect) {
      setActivityTarget({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
  }

  function enterMapFullscreen() {
    state.mapFullscreen = true;
    ui.mapWrap.classList.add('fullscreen');
    document.body.classList.add('map-fullscreen');
    ui.mapCloseBtn.classList.remove('hidden');
    ui.mapLocateBtn.classList.remove('hidden');
    ui.mapZoomControls.classList.remove('hidden');
    syncActivityMapPanel();
    setTimeout(() => state.map.invalidateSize(), 50);
  }

  function exitMapFullscreen() {
    state.mapFullscreen = false;
    ui.mapWrap.classList.remove('fullscreen');
    document.body.classList.remove('map-fullscreen');
    ui.mapCloseBtn.classList.add('hidden');
    ui.mapLocateBtn.classList.add('hidden');
    ui.mapZoomControls.classList.add('hidden');
    syncActivityMapPanel();
    setTimeout(() => state.map.invalidateSize(), 50);
  }

  function switchBase(name) {
    if (!state.baseLayers[name] || name === state.activeBase) return;
    state.map.removeLayer(state.baseLayers[state.activeBase]);
    state.baseLayers[name].addTo(state.map);
    state.activeBase = name;
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.classList.toggle('active', btn.dataset.basemap === name));
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
  }

  function toggleRadar() {
    state.radarEnabled = !state.radarEnabled;
    ui.radarToggle.classList.toggle('active', state.radarEnabled);
    ui.radarPanel.classList.toggle('hidden', !state.radarEnabled);
    if (!state.radarLayer) return;
    if (state.radarEnabled) state.radarLayer.addTo(state.map);
    else state.map.removeLayer(state.radarLayer);
  }

  function toggleRadarAnimation() {
    if (state.radarTimer) {
      clearInterval(state.radarTimer);
      state.radarTimer = null;
      ui.radarPlay.textContent = '▶';
      return;
    }
    if (!state.radarFrames.length) return;
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

    if (center && state.location) {
      state.map.setView([state.location.lat, state.location.lon], Math.max(state.map.getZoom(), 15));
      state.centerOnNextLocation = false;
    } else if (center) {
      state.centerOnNextLocation = true;
    }

    if (state.watchId !== null) return;
    ui.gpsBadge.textContent = 'GPS : recherche…';
    state.watchId = navigator.geolocation.watchPosition(
      updateLocation,
      err => {
        ui.gpsBadge.textContent = 'GPS : erreur';
        toast(err.code === 1 ? 'Autorise la localisation pour utiliser le GPS.' : 'Position GPS indisponible.');
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  function updateLocation(pos) {
    const { latitude, longitude, accuracy, altitude, speed, heading } = pos.coords;
    state.location = {
      lat: latitude,
      lon: longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      altitude: Number.isFinite(altitude) ? altitude : null,
      speed: Number.isFinite(speed) ? speed * 3.6 : null,
      heading: Number.isFinite(heading) ? heading : null,
      timestamp: pos.timestamp || Date.now()
    };
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
    if (Number.isFinite(altitude)) ui.elevationNow.textContent = `${Math.round(altitude)} m`;

    if (state.centerOnNextLocation) {
      state.map.setView(ll, Math.max(state.map.getZoom(), 15));
      state.centerOnNextLocation = false;
    }

    if (state.activity.status === 'recording') recordActivityPoint(state.location);
    if (state.activity.target) updateTargetGuide();
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
    }, 600);
  }

  async function loadWeather(lat, lon, { silent = false } = {}) {
    try {
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_gusts_10m',
        forecast_days: '2',
        timezone: 'auto'
      });
      const res = await fetch(`https://api.open-meteo.com/v1/meteofrance?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Météo indisponible');
      const data = await res.json();
      state.lastWeather = data;
      renderCurrentWeather(data);
      renderHourly(data);
      if (data.elevation != null) ui.elevationNow.textContent = `${Math.round(data.elevation)} m`;
      if (!silent) {
        const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        toast(`Météo actualisée à ${t}.`);
      }
      return true;
    } catch (err) {
      if (!silent) toast('Impossible de récupérer la météo locale.');
      return false;
    }
  }

  async function refreshWeatherNow() {
    if (ui.refreshWeatherBtn.disabled) return;
    const previousLabel = ui.refreshWeatherBtn.textContent;
    ui.refreshWeatherBtn.disabled = true;
    ui.refreshWeatherBtn.textContent = 'Actualisation…';
    ui.refreshWeatherBtn.setAttribute('aria-busy', 'true');

    try {
      let lat = state.location?.lat;
      let lon = state.location?.lon;

      // Au clic, demander une position fraîche plutôt que de réutiliser
      // silencieusement une ancienne position du suivi GPS.
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 10000
            });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch (_) {
          // Si un suivi GPS est déjà actif, la dernière position connue reste
          // un repli valable. Sinon on affiche une erreur explicite ci-dessous.
        }
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        toast('Position GPS indisponible pour actualiser la météo.');
        return;
      }

      await loadWeather(lat, lon);
    } finally {
      ui.refreshWeatherBtn.disabled = false;
      ui.refreshWeatherBtn.textContent = previousLabel || 'Actualiser';
      ui.refreshWeatherBtn.removeAttribute('aria-busy');
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
    else if (state.activity.status === 'idle' || state.activity.status === 'finished') setAlert('safe', '✅', 'Conditions locales calmes', `Pas de signal météo fort à ta position. Rafales ${Math.round(gust)} km/h.`);
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

  // ---------- GPX / parcours ----------

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
      const name = xml.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || file.name.replace(/\.gpx$/i, '');
      state.route = buildRouteObject(name, pts);
      drawRoute(true);
      renderRouteStats();
      toast(`Parcours chargé : ${state.route.distanceKm.toFixed(1)} km`);
    } catch (err) {
      toast(err.message || 'Impossible de lire ce GPX.');
    }
  }

  function buildRouteObject(name, points) {
    let distance = 0, gain = 0, loss = 0;
    let high = -Infinity, low = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (i) distance += haversine(points[i-1], points[i]);
      if (Number.isFinite(points[i].ele)) {
        high = Math.max(high, points[i].ele);
        low = Math.min(low, points[i].ele);
        if (i && Number.isFinite(points[i-1].ele)) {
          const d = points[i].ele - points[i-1].ele;
          if (d > 1) gain += d;
          else if (d < -1) loss += -d;
        }
      }
    }
    return {
      name: name || 'Parcours',
      points,
      distanceKm: distance,
      gain,
      loss,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      createdAt: Date.now()
    };
  }

  function drawRoute(fit = false) {
    if (!state.route) return;
    if (state.routeLine) state.map.removeLayer(state.routeLine);
    state.routeMarkers.forEach(m => state.map.removeLayer(m));
    state.routeMarkers = [];
    const latlngs = state.route.points.map(p => [p.lat, p.lon]);
    state.routeLine = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: .95 }).addTo(state.map);
    if (fit && latlngs.length > 1) state.map.fitBounds(state.routeLine.getBounds(), { padding: [24,24] });
  }

  function renderRouteStats() {
    const r = state.route;
    if (!r) return;
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
    state.routeLine = null;
    state.route = null;
    ui.routeCard.classList.add('hidden');
    ui.analyzeBtn.disabled = true;
    ui.gpxInput.value = '';
  }

  function exportCurrentRoute() {
    if (!state.route) return;
    downloadGpx(state.route.name, state.route.points, 'route');
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
        const eta = new Date(now + (s.distanceKm / speed) * 3600000);
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
    ui.routeForecast.innerHTML = results.map(r => {
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

  // ---------- Planificateur type Komoot ----------

  function startPlanner() {
    if (state.activity.status === 'recording') {
      toast('Mets d’abord l’activité en pause ou termine-la pour créer un parcours.');
      return;
    }
    state.planner.active = true;
    state.planner.waypoints = [];
    state.planner.routePoints = [];
    clearPlannerLayers();
    ui.plannerPanel.classList.remove('hidden');
    ui.mapWrap.classList.add('planning');
    ui.plannerStatus.textContent = 'Touchez la carte pour placer le départ.';
    updatePlannerButtons();
    enterMapFullscreen();
  }

  function stopPlanner(clear = true) {
    state.planner.active = false;
    clearTimeout(state.planner.routeTimer);
    state.planner.routeTimer = null;
    ui.plannerPanel.classList.add('hidden');
    ui.mapWrap.classList.remove('planning');
    if (clear) {
      state.planner.waypoints = [];
      state.planner.routePoints = [];
      clearPlannerLayers();
    }
  }

  function clearPlannerLayers() {
    if (state.planner.line) state.map.removeLayer(state.planner.line);
    state.planner.line = null;
    state.planner.markers.forEach(m => state.map.removeLayer(m));
    state.planner.markers = [];
  }

  function addPlannerWaypoint(point) {
    state.planner.waypoints.push(point);
    renderPlannerMarkers();
    updatePlannerButtons();
    if (state.planner.waypoints.length === 1) {
      state.planner.routePoints = [{ ...point }];
      ui.plannerStatus.textContent = 'Départ placé. Touchez la carte pour ajouter l’arrivée ou une étape.';
      drawPlannerLine(state.planner.routePoints, true);
      return;
    }
    ui.plannerStatus.textContent = 'Calcul du chemin…';
    drawPlannerLine(state.planner.waypoints, true);
    schedulePlannerRoute();
  }

  function renderPlannerMarkers() {
    state.planner.markers.forEach(m => state.map.removeLayer(m));
    state.planner.markers = state.planner.waypoints.map((p, i, arr) => {
      const cls = i === 0 ? 'start' : (i === arr.length - 1 ? 'end' : '');
      const label = i === 0 ? 'D' : (i === arr.length - 1 ? 'A' : String(i));
      const icon = L.divIcon({ className: '', html: `<div class="plan-waypoint ${cls}">${label}</div>`, iconSize:[24,24], iconAnchor:[12,12] });
      return L.marker([p.lat, p.lon], { icon, zIndexOffset: 800 }).addTo(state.map);
    });
  }

  function updatePlannerButtons() {
    const n = state.planner.waypoints.length;
    ui.plannerUndoBtn.disabled = n === 0;
    ui.plannerClearBtn.disabled = n === 0;
    ui.plannerSaveBtn.disabled = n < 2 || state.planner.routing;
  }

  function undoPlannerWaypoint() {
    if (!state.planner.waypoints.length) return;
    state.planner.waypoints.pop();
    renderPlannerMarkers();
    updatePlannerButtons();
    if (!state.planner.waypoints.length) {
      state.planner.routePoints = [];
      if (state.planner.line) state.map.removeLayer(state.planner.line);
      state.planner.line = null;
      ui.plannerStatus.textContent = 'Touchez la carte pour placer le départ.';
    } else if (state.planner.waypoints.length === 1) {
      state.planner.routePoints = [{...state.planner.waypoints[0]}];
      drawPlannerLine(state.planner.routePoints, true);
      ui.plannerStatus.textContent = 'Ajoutez une arrivée ou une étape.';
    } else {
      schedulePlannerRoute();
    }
  }

  function clearPlanner() {
    state.planner.waypoints = [];
    state.planner.routePoints = [];
    clearPlannerLayers();
    ui.plannerStatus.textContent = 'Touchez la carte pour placer le départ.';
    updatePlannerButtons();
  }

  function useGpsAsPlannerStart() {
    if (!state.location) {
      startLocation(true);
      toast('Recherche de ta position GPS…');
      return;
    }
    if (!state.planner.waypoints.length) addPlannerWaypoint({ lat: state.location.lat, lon: state.location.lon });
    else {
      state.planner.waypoints[0] = { lat: state.location.lat, lon: state.location.lon };
      renderPlannerMarkers();
      if (state.planner.waypoints.length > 1) schedulePlannerRoute();
    }
    state.map.setView([state.location.lat, state.location.lon], Math.max(state.map.getZoom(), 14));
  }

  function schedulePlannerRoute() {
    clearTimeout(state.planner.routeTimer);
    const elapsed = Date.now() - state.planner.lastRequestAt;
    const wait = Math.max(150, ROUTER_MIN_INTERVAL - elapsed);
    state.planner.routeTimer = setTimeout(routePlannerWaypoints, wait);
  }

  async function routePlannerWaypoints() {
    if (state.planner.waypoints.length < 2) return;
    state.planner.routing = true;
    state.planner.lastRequestAt = Date.now();
    const serial = ++state.planner.requestSerial;
    updatePlannerButtons();
    ui.plannerStatus.textContent = 'Calcul du chemin OpenStreetMap…';
    try {
      const prefix = state.planner.mode === 'bike' ? 'routed-bike' : 'routed-foot';
      const coords = state.planner.waypoints.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
      const url = `https://routing.openstreetmap.de/${prefix}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Routeur indisponible');
      const data = await res.json();
      if (serial !== state.planner.requestSerial) return;
      const coordsOut = data.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordsOut) || coordsOut.length < 2) throw new Error('Aucun chemin trouvé');
      state.planner.routePoints = coordsOut.map(c => ({ lon: Number(c[0]), lat: Number(c[1]), ele: null }));
      drawPlannerLine(state.planner.routePoints, false);
      const km = routeDistance(state.planner.routePoints);
      ui.plannerStatus.textContent = `${km.toFixed(1)} km · ${state.planner.mode === 'bike' ? 'vélo' : 'à pied'} · ajoutez des étapes si besoin.`;
    } catch (err) {
      if (serial !== state.planner.requestSerial) return;
      state.planner.routePoints = state.planner.waypoints.map(p => ({...p, ele:null}));
      drawPlannerLine(state.planner.routePoints, true);
      ui.plannerStatus.textContent = 'Routeur indisponible : liaison directe affichée. Vous pouvez quand même enregistrer.';
    } finally {
      if (serial === state.planner.requestSerial) {
        state.planner.routing = false;
        updatePlannerButtons();
      }
    }
  }

  function drawPlannerLine(points, direct) {
    if (state.planner.line) state.map.removeLayer(state.planner.line);
    if (!points.length) return;
    state.planner.line = L.polyline(points.map(p => [p.lat, p.lon]), {
      color: '#f59e0b', weight: 5, opacity: .95, dashArray: direct ? '8 8' : null
    }).addTo(state.map);
  }

  async function savePlannerRoute() {
    if (state.planner.routePoints.length < 2) return;
    ui.plannerSaveBtn.disabled = true;
    ui.plannerStatus.textContent = 'Récupération du relief…';
    try {
      let pts = downsamplePreserve(state.planner.routePoints, 600).map(p => ({...p}));
      pts = await addElevations(pts);
      const defaultName = `${state.planner.mode === 'bike' ? 'Vélo' : 'Randonnée'} ${new Date().toLocaleDateString('fr-FR')}`;
      const entered = window.prompt('Nom du parcours', defaultName);
      const name = (entered || defaultName).trim().slice(0, 80) || defaultName;
      const route = buildRouteObject(name, pts);
      saveRouteLocal(route);
      state.route = route;
      drawRoute(false);
      renderRouteStats();
      stopPlanner(true);
      renderSavedRoutes();
      toast(`Parcours « ${name} » enregistré.`);
    } catch (err) {
      toast('Le parcours est créé, mais le relief n’a pas pu être récupéré.');
      const route = buildRouteObject(`Parcours ${new Date().toLocaleDateString('fr-FR')}`, downsamplePreserve(state.planner.routePoints, 600));
      saveRouteLocal(route);
      state.route = route;
      drawRoute(false);
      renderRouteStats();
      stopPlanner(true);
      renderSavedRoutes();
    } finally {
      ui.plannerSaveBtn.disabled = false;
    }
  }

  async function addElevations(points) {
    const out = points.map(p => ({...p}));
    for (let start = 0; start < out.length; start += 100) {
      const chunk = out.slice(start, start + 100);
      const params = new URLSearchParams({
        latitude: chunk.map(p => p.lat.toFixed(6)).join(','),
        longitude: chunk.map(p => p.lon.toFixed(6)).join(',')
      });
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`);
      if (!res.ok) throw new Error('Altitude indisponible');
      const data = await res.json();
      (data.elevation || []).forEach((ele, i) => {
        if (Number.isFinite(Number(ele))) out[start + i].ele = Number(ele);
      });
    }
    return out;
  }

  function saveRouteLocal(route) {
    const list = getSavedRoutes();
    const item = { ...route, id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}` };
    list.unshift(item);
    try {
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (err) {
      toast('Stockage local plein : exporte le GPX pour conserver le parcours.');
    }
  }

  function getSavedRoutes() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }

  function renderSavedRoutes() {
    const list = getSavedRoutes();
    ui.savedRoutesCard.classList.toggle('hidden', !list.length);
    ui.savedRoutesList.innerHTML = list.map(r => `
      <div class="saved-route-item" data-route-id="${escapeHtml(r.id)}">
        <div><strong>${escapeHtml(r.name || 'Parcours')}</strong><div class="saved-meta">${Number(r.distanceKm || 0).toFixed(1)} km${Number.isFinite(r.gain) ? ` · D+ ${Math.round(r.gain)} m` : ''}</div></div>
        <div class="saved-route-actions">
          <button type="button" data-action="load" title="Afficher">🗺️</button>
          <button type="button" data-action="gpx" title="Exporter GPX">GPX</button>
          <button type="button" data-action="delete" class="delete" title="Supprimer">✕</button>
        </div>
      </div>`).join('');
  }

  function handleSavedRouteAction(e) {
    const btn = e.target.closest('button[data-action]');
    const row = e.target.closest('[data-route-id]');
    if (!btn || !row) return;
    const list = getSavedRoutes();
    const route = list.find(r => r.id === row.dataset.routeId);
    if (!route) return;
    if (btn.dataset.action === 'load') {
      state.route = route;
      drawRoute(true);
      renderRouteStats();
      toast(`Parcours chargé : ${route.name}`);
    } else if (btn.dataset.action === 'gpx') {
      downloadGpx(route.name, route.points, 'route');
    } else if (btn.dataset.action === 'delete') {
      if (!window.confirm(`Supprimer « ${route.name} » ?`)) return;
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(list.filter(r => r.id !== route.id)));
      renderSavedRoutes();
    }
  }

  // ---------- Activité GPS en direct ----------

  function openActivityCard() {
    ui.activityCard.classList.remove('hidden');
    updateActivityUI();
    ui.activityCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function startActivity() {
    if (state.planner.active) stopPlanner(true);
    clearActivityTrack();
    clearActivityTarget();
    state.activity.status = 'recording';
    state.activity.startedAt = Date.now();
    state.activity.pausedAt = null;
    state.activity.pausedMs = 0;
    state.activity.finishedAt = null;
    state.activity.points = [];
    state.activity.distanceKm = 0;
    state.activity.currentSpeed = 0;
    state.activity.name = `${state.activity.mode === 'bike' ? 'Sortie vélo' : 'Randonnée'} ${new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}`;
    state.activity.line = L.polyline([], { color:'#fb7185', weight:5, opacity:.96 }).addTo(state.map);
    startLocation(false);
    if (state.location) recordActivityPoint(state.location, true);
    clearInterval(state.activity.timer);
    state.activity.timer = setInterval(updateActivityUI, 1000);
    enterMapFullscreen();
    updateActivityUI();
    setAlert('safe', '▶️', 'Activité en cours', 'La trace GPS est enregistrée. La carte reste libre : ◎ te recentre sur ta position.');
    toast('Enregistrement GPS démarré.');
  }

  function recordActivityPoint(loc, force = false) {
    if (state.activity.status !== 'recording') return;
    const accuracy = Number(loc.accuracy);
    if (!force && Number.isFinite(accuracy) && accuracy > 60) return;

    const p = {
      lat: loc.lat,
      lon: loc.lon,
      ele: Number.isFinite(loc.altitude) ? loc.altitude : null,
      time: new Date(loc.timestamp || Date.now()).toISOString(),
      timestamp: loc.timestamp || Date.now(),
      accuracy: Number.isFinite(accuracy) ? accuracy : null
    };
    const prev = state.activity.points[state.activity.points.length - 1];
    if (prev) {
      const d = haversine(prev, p);
      const dt = Math.max(0.5, (p.timestamp - prev.timestamp) / 1000);
      const computedSpeed = (d / dt) * 3600;
      const maxPlausible = state.activity.mode === 'bike' ? 120 : 35;
      if (computedSpeed > maxPlausible) return;
      if (!force && d < 0.002 && dt < 8) {
        state.activity.currentSpeed = Number.isFinite(loc.speed) ? loc.speed : computedSpeed;
        updateActivityUI();
        return;
      }
      state.activity.distanceKm += d;
      state.activity.currentSpeed = Number.isFinite(loc.speed) ? Math.max(0, loc.speed) : computedSpeed;
    } else {
      state.activity.currentSpeed = Number.isFinite(loc.speed) ? Math.max(0, loc.speed) : 0;
    }

    state.activity.points.push(p);
    state.activity.line.setLatLngs(state.activity.points.map(x => [x.lat, x.lon]));
    updateActivityUI();
  }

  function toggleActivityPause() {
    if (state.activity.status === 'recording') {
      state.activity.status = 'paused';
      state.activity.pausedAt = Date.now();
      state.activity.currentSpeed = 0;
      toast('Activité en pause.');
    } else if (state.activity.status === 'paused') {
      state.activity.pausedMs += Date.now() - state.activity.pausedAt;
      state.activity.pausedAt = null;
      state.activity.status = 'recording';
      if (state.location) recordActivityPoint(state.location, true);
      toast('Enregistrement repris.');
    }
    updateActivityUI();
  }

  function finishActivity() {
    if (!['recording','paused'].includes(state.activity.status)) return;
    if (!window.confirm('Terminer et enregistrer cette activité ?')) return;
    if (state.activity.status === 'paused' && state.activity.pausedAt) {
      state.activity.pausedMs += Date.now() - state.activity.pausedAt;
      state.activity.pausedAt = null;
    }
    state.activity.finishedAt = Date.now();
    state.activity.status = 'finished';
    state.activity.currentSpeed = 0;
    clearInterval(state.activity.timer);
    state.activity.timer = null;
    state.activity.targetSelect = false;
    updateActivityUI();
    syncActivityMapPanel();
    openActivityCard();
    setAlert('safe', '🏁', 'Activité terminée', `${state.activity.distanceKm.toFixed(2)} km enregistrés. Tu peux exporter la trace en GPX.`);
    toast('Activité terminée. Trace prête à exporter.');
  }

  function clearActivityTrack() {
    if (state.activity.line) state.map.removeLayer(state.activity.line);
    state.activity.line = null;
  }

  function activityElapsedMs() {
    if (!state.activity.startedAt) return 0;
    const end = state.activity.status === 'finished' ? (state.activity.finishedAt || Date.now()) : Date.now();
    const currentPause = state.activity.status === 'paused' && state.activity.pausedAt ? end - state.activity.pausedAt : 0;
    return Math.max(0, end - state.activity.startedAt - state.activity.pausedMs - currentPause);
  }

  function updateActivityUI() {
    const a = state.activity;
    if (a.status === 'idle') {
      ui.activityTitle.textContent = 'Nouvelle activité';
      ui.activityStartBtn.textContent = '▶ Démarrer';
      ui.activityExportBtn.classList.add('hidden');
      ui.activityStats.classList.add('hidden');
      ui.activityHelp.textContent = 'Choisis randonnée ou vélo, puis démarre. La trace sera dessinée en direct sur la carte.';
      syncActivityMapPanel();
      return;
    }

    const elapsed = activityElapsedMs();
    const hours = elapsed / 3600000;
    const avg = hours > 0 ? a.distanceKm / hours : 0;
    const distance = `${a.distanceKm.toFixed(2).replace('.', ',')} km`;
    const time = formatDuration(elapsed);
    const speed = `${Math.max(0, a.currentSpeed || 0).toFixed(1).replace('.', ',')} km/h`;
    const avgSpeed = `${Math.max(0, avg).toFixed(1).replace('.', ',')} km/h`;

    ui.activityTitle.textContent = a.status === 'finished' ? a.name : (a.mode === 'bike' ? 'Sortie vélo en cours' : 'Randonnée en cours');
    ui.activityDistance.textContent = distance;
    ui.activityTime.textContent = time;
    ui.activitySpeed.textContent = speed;
    ui.activityAvgSpeed.textContent = avgSpeed;
    ui.activityStats.classList.remove('hidden');

    if (a.status === 'finished') {
      ui.activityStartBtn.textContent = '▶ Nouvelle activité';
      ui.activityExportBtn.classList.toggle('hidden', a.points.length < 2);
      ui.activityHelp.textContent = 'Activité terminée. Exporte le GPX pour la conserver ou l’envoyer vers Garmin Connect.';
    } else {
      ui.activityStartBtn.textContent = '🗺️ Ouvrir la carte';
      ui.activityExportBtn.classList.add('hidden');
      ui.activityHelp.textContent = a.status === 'paused' ? 'Activité en pause.' : 'Enregistrement GPS en cours. Le déplacement de la carte ne coupe pas le suivi.';
    }

    ui.activityMapTitle.textContent = a.mode === 'bike' ? '🚴 Vélo' : '🥾 Randonnée';
    ui.activityMapStatus.textContent = a.status === 'paused' ? 'EN PAUSE' : 'GPS · enregistrement';
    ui.activityMapDistance.textContent = distance;
    ui.activityMapTime.textContent = time;
    ui.activityMapSpeed.textContent = speed;
    ui.activityPauseBtn.textContent = a.status === 'paused' ? '▶' : '⏸';
    ui.activityPauseBtn.setAttribute('aria-label', a.status === 'paused' ? 'Reprendre' : 'Mettre en pause');
    syncActivityMapPanel();
    if (a.target) updateTargetGuide();
  }

  function activityMainButton() {
    if (state.activity.status === 'idle' || state.activity.status === 'finished') startActivity();
    else enterMapFullscreen();
  }

  function exportActivity() {
    if (state.activity.points.length < 2) return;
    downloadGpx(state.activity.name || 'Activité', state.activity.points, 'activity');
  }

  function syncActivityMapPanel() {
    const active = ['recording','paused'].includes(state.activity.status);
    ui.activityMapPanel.classList.toggle('hidden', !(active && state.mapFullscreen));
    ui.mapWrap.classList.toggle('activity-active', active && state.mapFullscreen);
  }

  // ---------- Navigation vers un point ----------

  function beginTargetSelection() {
    if (!['recording','paused'].includes(state.activity.status)) {
      toast('Démarre d’abord une activité.');
      return;
    }
    state.activity.targetSelect = true;
    ui.targetSelectBtn.classList.add('selecting');
    ui.targetSelectBtn.textContent = '👆 Touchez la carte';
    toast('Touchez maintenant le point à rejoindre sur la carte.');
  }

  function setActivityTarget(point) {
    state.activity.targetSelect = false;
    ui.targetSelectBtn.classList.remove('selecting');
    ui.targetSelectBtn.textContent = '🎯 Destination';
    clearActivityTarget(false);
    state.activity.target = point;
    const icon = L.divIcon({ className:'', html:'<div class="target-marker">🎯</div>', iconSize:[34,34], iconAnchor:[17,17] });
    state.activity.targetMarker = L.marker([point.lat, point.lon], { icon, zIndexOffset: 900 }).addTo(state.map);
    state.activity.targetLine = L.polyline([], { color:'#fbbf24', weight:3, opacity:.9, dashArray:'7 8' }).addTo(state.map);
    ui.targetGuide.classList.remove('hidden');
    updateTargetGuide();
    toast('Destination définie. Guidage activé.');
  }

  function clearActivityTarget(clearPoint = true) {
    if (state.activity.targetMarker) state.map.removeLayer(state.activity.targetMarker);
    if (state.activity.targetLine) state.map.removeLayer(state.activity.targetLine);
    state.activity.targetMarker = null;
    state.activity.targetLine = null;
    if (clearPoint) state.activity.target = null;
    ui.targetGuide.classList.add('hidden');
    state.activity.targetSelect = false;
    ui.targetSelectBtn.classList.remove('selecting');
    ui.targetSelectBtn.textContent = '🎯 Destination';
  }

  function updateTargetGuide() {
    const a = state.activity;
    if (!a.target || !state.location) return;
    const from = state.location;
    const distanceKm = haversine(from, a.target);
    const bearing = initialBearing(from, a.target);
    const heading = Number.isFinite(from.heading) ? from.heading : null;
    const relative = heading == null ? null : normalizeSignedAngle(bearing - heading);
    const navSpeed = a.currentSpeed >= 1 ? a.currentSpeed : (a.mode === 'bike' ? 20 : 4);
    const etaMs = (distanceKm / Math.max(navSpeed, 0.5)) * 3600000;

    ui.targetDistance.textContent = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(2).replace('.', ',')} km`;
    const turn = relative == null ? '' : ` · ${relativeDirection(relative)}`;
    ui.targetBearing.textContent = `Cap ${Math.round(bearing)}° ${cardinal(bearing)}${turn}`;
    ui.targetEta.textContent = formatEta(etaMs);
    ui.targetArrow.style.transform = `rotate(${relative == null ? bearing : relative}deg)`;
    ui.targetGuide.classList.remove('hidden');
    if (a.targetLine) a.targetLine.setLatLngs([[from.lat, from.lon], [a.target.lat, a.target.lon]]);

    if (distanceKm < 0.03) {
      ui.targetDistance.textContent = 'ARRIVÉ';
      ui.targetEta.textContent = '✓';
    }
  }

  // ---------- Outils ----------

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

  function routeDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += haversine(points[i-1], points[i]);
    return total;
  }

  function haversine(a, b) {
    const R = 6371;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function initialBearing(a, b) {
    const lat1 = rad(a.lat), lat2 = rad(b.lat), dLon = rad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function normalizeSignedAngle(deg) {
    return ((deg + 540) % 360) - 180;
  }

  function relativeDirection(angle) {
    const a = Math.abs(angle);
    if (a < 15) return 'tout droit';
    if (a > 165) return 'demi-tour';
    return `${angle > 0 ? 'droite' : 'gauche'} ${Math.round(a)}°`;
  }

  function cardinal(deg) {
    const dirs = ['N','NE','E','SE','S','SO','O','NO'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function downsamplePreserve(points, maxPoints) {
    if (points.length <= maxPoints) return points.map(p => ({...p}));
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
      const idx = Math.round((i * (points.length - 1)) / (maxPoints - 1));
      out.push({...points[idx]});
    }
    return out;
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function formatEta(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '--';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${Math.max(1, mins)} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h${String(m).padStart(2,'0')}`;
  }

  function downloadGpx(name, points, type = 'route') {
    const safeName = (name || 'Rando Radar').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Rando-Radar';
    const trkpts = points.map(p => {
      const ele = Number.isFinite(Number(p.ele)) ? `<ele>${Number(p.ele).toFixed(1)}</ele>` : '';
      const time = p.time ? `<time>${new Date(p.time).toISOString()}</time>` : '';
      return `      <trkpt lat="${Number(p.lat).toFixed(7)}" lon="${Number(p.lon).toFixed(7)}">${ele}${time}</trkpt>`;
    }).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rando Radar" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${xmlEscape(name || safeName)}</name></metadata>\n  <trk><name>${xmlEscape(name || safeName)}</name><type>${type === 'activity' ? 'activity' : 'route'}</type><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;
    const blob = new Blob([gpx], { type:'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const rad = d => d * Math.PI / 180;
  const number = (v, digits = 0, fallback = '--') => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : fallback;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

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
    ui.mapLocateBtn.addEventListener('click', e => { e.stopPropagation(); startLocation(true); });
    ui.mapCloseBtn.addEventListener('click', e => { e.stopPropagation(); exitMapFullscreen(); });
    ui.mapZoomInBtn.addEventListener('click', e => { e.stopPropagation(); state.map.zoomIn(); });
    ui.mapZoomOutBtn.addEventListener('click', e => { e.stopPropagation(); state.map.zoomOut(); });

    // V1.4.1 : garde Leaflet parfaitement ajusté à la largeur réelle du smartphone.
    const refreshMapSize = () => {
      if (!state.map) return;
      requestAnimationFrame(() => state.map.invalidateSize({ pan: false }));
    };
    window.addEventListener('resize', refreshMapSize, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(refreshMapSize, 180), { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refreshMapSize, { passive: true });
    }
    setTimeout(refreshMapSize, 120);

    ui.gpxInput.addEventListener('change', e => e.target.files?.[0] && importGpx(e.target.files[0]));
    ui.clearRouteBtn.addEventListener('click', clearRoute);
    ui.exportRouteBtn.addEventListener('click', exportCurrentRoute);
    ui.analyzeBtn.addEventListener('click', analyzeRoute);
    ui.refreshWeatherBtn.addEventListener('click', refreshWeatherNow);

    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      if (state.route && !ui.routeForecast.classList.contains('hidden')) analyzeRoute();
    }));

    ui.createRouteBtn.addEventListener('click', startPlanner);
    ui.plannerGpsBtn.addEventListener('click', useGpsAsPlannerStart);
    ui.plannerUndoBtn.addEventListener('click', undoPlannerWaypoint);
    ui.plannerClearBtn.addEventListener('click', clearPlanner);
    ui.plannerSaveBtn.addEventListener('click', savePlannerRoute);
    document.querySelectorAll('[data-planner-mode]').forEach(btn => btn.addEventListener('click', () => {
      state.planner.mode = btn.dataset.plannerMode;
      document.querySelectorAll('[data-planner-mode]').forEach(b => b.classList.toggle('active', b === btn));
      if (state.planner.waypoints.length > 1) schedulePlannerRoute();
    }));
    ui.savedRoutesList.addEventListener('click', handleSavedRouteAction);

    ui.activityOpenBtn.addEventListener('click', openActivityCard);
    ui.activityCloseCardBtn.addEventListener('click', () => ui.activityCard.classList.add('hidden'));
    ui.activityStartBtn.addEventListener('click', activityMainButton);
    ui.activityExportBtn.addEventListener('click', exportActivity);
    document.querySelectorAll('[data-activity-mode]').forEach(btn => btn.addEventListener('click', () => {
      if (['recording','paused'].includes(state.activity.status)) {
        toast('Termine l’activité avant de changer de mode.');
        return;
      }
      state.activity.mode = btn.dataset.activityMode;
      document.querySelectorAll('[data-activity-mode]').forEach(b => b.classList.toggle('active', b === btn));
    }));
    ui.activityPauseBtn.addEventListener('click', toggleActivityPause);
    ui.activityStopBtn.addEventListener('click', finishActivity);
    ui.targetSelectBtn.addEventListener('click', beginTargetSelection);
    ui.targetClearBtn.addEventListener('click', () => clearActivityTarget(true));

    // Navigation mobile v1.4
    const navButtons = [...document.querySelectorAll('[data-nav]')];
    const setActiveNav = name => navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.nav === name));
    const scrollToElement = element => element?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    navButtons.forEach(btn => btn.addEventListener('click', () => {
      const dest = btn.dataset.nav;
      setActiveNav(dest);
      if (dest === 'map') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (dest === 'activity') {
        openActivityCard();
        setTimeout(() => scrollToElement(ui.activityCard), 40);
        return;
      }
      if (dest === 'routes') {
        const target = !ui.savedRoutesCard.classList.contains('hidden') ? ui.savedRoutesCard : (!ui.routeCard.classList.contains('hidden') ? ui.routeCard : document.querySelector('.quick-actions'));
        scrollToElement(target);
        return;
      }
      if (dest === 'weather') {
        scrollToElement(document.getElementById('forecastSection'));
        return;
      }
      if (dest === 'info') {
        scrollToElement(document.getElementById('infoSection'));
      }
    }));

    document.querySelectorAll('[data-nav-action]').forEach(btn => btn.addEventListener('click', () => {
      const action = btn.dataset.navAction;
      if (action === 'activity') {
        openActivityCard();
        setActiveNav('activity');
        setTimeout(() => scrollToElement(ui.activityCard), 40);
      } else if (action === 'routes') {
        setActiveNav('routes');
        const target = !ui.savedRoutesCard.classList.contains('hidden') ? ui.savedRoutesCard : (!ui.routeCard.classList.contains('hidden') ? ui.routeCard : document.querySelector('.quick-actions'));
        scrollToElement(target);
      }
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
  renderSavedRoutes();
  updateActivityUI();
  registerSW();
  loadRadar();
  setTimeout(() => startLocation(true), 400);
})();
