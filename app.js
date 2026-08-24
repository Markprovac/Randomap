/* Rando Radar v1.10.0 — carte, GPX, radar, planificateur, suivi d'activité et navigation point */
(() => {
  'use strict';

  const ROUTER_MIN_INTERVAL = 1100;
  const SAVED_ROUTES_KEY = 'randoRadar.savedRoutes.v1';
  const VALHALLA_ROUTE_URL = 'https://valhalla1.openstreetmap.de/route';
  const OVERPASS_ENDPOINTS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter'
  ];
  const WAYMARKED_HIKING_API = 'https://hiking.waymarkedtrails.org/api/v1';
  const FINDER_PROFILES = {
    hike:   { label: 'Randonnée', icon: '🥾', relationRoutes: ['hiking','foot'], transportMode: 'hike' },
    road:   { label: 'Vélo route', icon: '🚴', relationRoutes: ['bicycle'], transportMode: 'bike' },
    gravel: { label: 'Gravel', icon: '🚲', relationRoutes: ['bicycle'], transportMode: 'bike' },
    mtb:    { label: 'VTT', icon: '🚵', relationRoutes: ['mtb','bicycle'], transportMode: 'bike' }
  };
  const ACTIVITY_PROFILES = {
    hike:   { label: 'Randonnée', icon: '🥾', cycling: false, navSpeed: 4,  maxPlausible: 35,  offRouteM: 80 },
    road:   { label: 'Vélo route', icon: '🚴', cycling: true,  navSpeed: 20, maxPlausible: 120, offRouteM: 120 },
    gravel: { label: 'Gravel',     icon: '🚲', cycling: true,  navSpeed: 17, maxPlausible: 120, offRouteM: 110 },
    mtb:    { label: 'VTT',        icon: '🚵', cycling: true,  navSpeed: 12, maxPlausible: 120, offRouteM: 100 }
  };
  const PLANNER_PROFILES = {
    hike: {
      label: 'Randonnée', short: 'Rando', icon: '🥾', activityMode: 'hike',
      costing: 'pedestrian', costingOptions: {},
      description: 'sentiers et chemins pédestres privilégiés'
    },
    road: {
      label: 'Vélo route', short: 'Route', icon: '🚴', activityMode: 'road',
      costing: 'bicycle',
      costingOptions: { bicycle: { bicycle_type: 'Road', use_roads: 1.0, use_hills: 0.5 } },
      description: 'routes et surfaces adaptées au vélo de route privilégiées'
    },
    gravel: {
      label: 'Gravel', short: 'Gravel', icon: '🚲', activityMode: 'gravel',
      costing: 'bicycle',
      costingOptions: { bicycle: { bicycle_type: 'Cross', use_roads: 0.5, use_hills: 0.5 } },
      description: 'routes, voies cyclables et pistes roulantes acceptées'
    },
    mtb: {
      label: 'VTT', short: 'VTT', icon: '🚵', activityMode: 'mtb',
      costing: 'bicycle',
      costingOptions: { bicycle: { bicycle_type: 'Mountain', use_roads: 0.15, use_hills: 0.65 } },
      description: 'chemins et pistes tout-terrain davantage favorisés'
    }
  };

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
    hikeFinder: {
      active: false,
      profile: 'hike',
      radiusKm: 5,
      center: null,
      centerMarker: null,
      resultLayer: null,
      previewLayer: null,
      results: [],
      loading: false,
      requestSerial: 0,
      selectedIndex: -1,
      mapLines: [],
      detailSerial: 0,
      detailSource: null,
    },
    elevationCharts: new Map(),
    elevationHoverMarker: null,
    routeDetailSerial: 0,
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
      followRoute: null,
      followRouteCumKm: null,
      followRouteLastIndex: null,
      offRouteAlerted: false,
    }
  };

  const $ = id => document.getElementById(id);
  const ui = {
    locateBtn: $('locateBtn'), installBtn: $('installBtn'), gpsBadge: $('gpsBadge'),
    radarToggle: $('radarToggle'), radarPanel: $('radarPanel'), radarSlider: $('radarSlider'), radarPlay: $('radarPlay'), radarTime: $('radarTime'),
    mapWrap: $('mapWrap'), mapCloseBtn: $('mapCloseBtn'), mapLocateBtn: $('mapLocateBtn'), mapZoomControls: $('mapZoomControls'), mapZoomInBtn: $('mapZoomInBtn'), mapZoomOutBtn: $('mapZoomOutBtn'), mapExpandHint: $('mapExpandHint'),
    tempNow: $('tempNow'), rainNow: $('rainNow'), gustNow: $('gustNow'), feelNow: $('feelNow'), elevationNow: $('elevationNow'), weatherIcon: $('weatherIcon'),
    alertCard: $('alertCard'), alertIcon: $('alertIcon'), alertTitle: $('alertTitle'), alertText: $('alertText'),
    gpxInput: $('gpxInput'), analyzeBtn: $('analyzeBtn'), routeCard: $('routeCard'), routeName: $('routeName'), routeDistance: $('routeDistance'), routeGain: $('routeGain'), routeLoss: $('routeLoss'), routeHigh: $('routeHigh'), routeForecast: $('routeForecast'), clearRouteBtn: $('clearRouteBtn'), exportRouteBtn: $('exportRouteBtn'), routeStartBtn: $('routeStartBtn'), routeShowBtn: $('routeShowBtn'),
    hourlyForecast: $('hourlyForecast'), refreshWeatherBtn: $('refreshWeatherBtn'), refreshWeatherIcon: $('refreshWeatherIcon'), refreshWeatherLabel: $('refreshWeatherLabel'), weatherUpdatedAt: $('weatherUpdatedAt'), toast: $('toast'),
    createRouteBtn: $('createRouteBtn'), plannerPanel: $('plannerPanel'), plannerStatus: $('plannerStatus'), plannerGpsBtn: $('plannerGpsBtn'), plannerUndoBtn: $('plannerUndoBtn'), plannerClearBtn: $('plannerClearBtn'), plannerSaveBtn: $('plannerSaveBtn'),
    hikeFinderPanel: $('hikeFinderPanel'), hikeFinderStatus: $('hikeFinderStatus'), hikeFinderCloseBtn: $('hikeFinderCloseBtn'), hikeFinderGpsBtn: $('hikeFinderGpsBtn'), hikeFinderListBtn: $('hikeFinderListBtn'), hikeFinderMapResults: $('hikeFinderMapResults'), hikeFinderResultsCard: $('hikeFinderResultsCard'), hikeFinderResultsSummary: $('hikeFinderResultsSummary'), hikeFinderResultsList: $('hikeFinderResultsList'), hikeFinderNewSearchBtn: $('hikeFinderNewSearchBtn'), routesFindHikesBtn: $('routesFindHikesBtn'),
    finderMapDetail: $('finderMapDetail'), finderMapDetailType: $('finderMapDetailType'), finderMapDetailName: $('finderMapDetailName'), finderMapDetailBody: $('finderMapDetailBody'), finderMapDetailClose: $('finderMapDetailClose'),
    finderDetailCard: $('finderDetailCard'), finderDetailType: $('finderDetailType'), finderDetailName: $('finderDetailName'), finderDetailBody: $('finderDetailBody'), finderDetailClose: $('finderDetailClose'),
    routeDuration: $('routeDuration'), routeDifficulty: $('routeDifficulty'), routeLow: $('routeLow'), routeSurface: $('routeSurface'), routeElevationSection: $('routeElevationSection'), routeElevationChart: $('routeElevationChart'), routeElevationHint: $('routeElevationHint'),
    savedRoutesCard: $('savedRoutesCard'), savedRoutesList: $('savedRoutesList'),
    activityOpenBtn: $('activityOpenBtn'), activityCard: $('activityCard'), activityTitle: $('activityTitle'), activityCloseCardBtn: $('activityCloseCardBtn'), activityStartBtn: $('activityStartBtn'), activityExportBtn: $('activityExportBtn'), activityStats: $('activityStats'), activityDistance: $('activityDistance'), activityTime: $('activityTime'), activitySpeed: $('activitySpeed'), activityAvgSpeed: $('activityAvgSpeed'), activityHelp: $('activityHelp'),
    activityMapPanel: $('activityMapPanel'), activityMapTitle: $('activityMapTitle'), activityMapStatus: $('activityMapStatus'), activityMapDistance: $('activityMapDistance'), activityMapTime: $('activityMapTime'), activityMapSpeed: $('activityMapSpeed'), activityPauseBtn: $('activityPauseBtn'), activityStopBtn: $('activityStopBtn'),
    targetSelectBtn: $('targetSelectBtn'), targetGuide: $('targetGuide'), targetArrow: $('targetArrow'), targetDistance: $('targetDistance'), targetBearing: $('targetBearing'), targetEta: $('targetEta'), targetClearBtn: $('targetClearBtn'),
    routeFollowGuide: $('routeFollowGuide'), routeFollowName: $('routeFollowName'), routeFollowRemaining: $('routeFollowRemaining'), routeFollowProgress: $('routeFollowProgress'), routeFollowDeviation: $('routeFollowDeviation'),
    finishActivityModal: $('finishActivityModal'), finishSaveBtn: $('finishSaveBtn'), finishDiscardBtn: $('finishDiscardBtn'), finishCancelBtn: $('finishCancelBtn')
  };

  state.offline = {
    db: null,
    activePackage: null,
    layerGroup: null,
    forced: false,
    attributionAdded: false,
    preparing: false,
    lastAutoCheck: 0,
    pendingActivityPrepare: false
  };

  const offlineUI = {
    card: $('offlineCard'), networkBadge: $('offlineNetworkBadge'), sourceSelect: $('offlineSourceSelect'), bufferSelect: $('offlineBufferSelect'),
    prepareBtn: $('offlinePrepareBtn'), backOnlineBtn: $('offlineBackOnlineBtn'), progress: $('offlineProgress'), progressTitle: $('offlineProgressTitle'), progressText: $('offlineProgressText'),
    current: $('offlineCurrent'), currentName: $('offlineCurrentName'), list: $('offlineList')
  };

  function getActivityProfile(mode = state.activity.mode) {
    return ACTIVITY_PROFILES[mode] || ACTIVITY_PROFILES.hike;
  }

  function activityModeForRoute(route) {
    if (route?.plannerProfile && ACTIVITY_PROFILES[route.plannerProfile]) return route.plannerProfile;
    if (route?.transportMode === 'bike') return 'road';
    if (route?.transportMode === 'hike') return 'hike';
    return state.mode === 'bike' ? 'road' : 'hike';
  }

  function getPlannerProfile(mode = state.planner.mode) {
    return PLANNER_PROFILES[mode] || PLANNER_PROFILES.hike;
  }

  function applyRouteTransportMode(route) {
    if (!route) return;
    const nextMode = route.transportMode === 'bike' ? 'bike' : (route.transportMode === 'hike' ? 'hike' : null);
    if (!nextMode) return;
    state.mode = nextMode;
    document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === nextMode));
  }

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
    if (state.hikeFinder.active) {
      searchHikesAround({ lat: e.latlng.lat, lon: e.latlng.lng });
      return;
    }
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
    if (state.offline?.activePackage) { toast('Carte en ligne indisponible en mode hors ligne.'); return; }
    if (!state.baseLayers[name] || name === state.activeBase) return;
    state.map.removeLayer(state.baseLayers[state.activeBase]);
    state.baseLayers[name].addTo(state.map);
    state.activeBase = name;
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.classList.toggle('active', btn.dataset.basemap === name));
  }

  async function loadRadar() {
    if (!navigator.onLine || state.offline?.activePackage) { ui.radarTime.textContent = 'Radar hors ligne'; return; }
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
    if (state.offline?.activePackage || !navigator.onLine) { toast('Le radar nécessite une connexion Internet.'); return; }
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
    if (state.activity.followRoute) updateRouteFollowGuide(state.location);
    if (state.activity.target) updateTargetGuide();
    scheduleWeather(latitude, longitude);

    // Si une activité libre vient de démarrer avant d'obtenir le premier point GPS,
    // prépare automatiquement la zone hors ligne dès que la position devient disponible.
    if (state.offline.pendingActivityPrepare && navigator.onLine && !state.offline.preparing) {
      state.offline.pendingActivityPrepare = false;
      autoPrepareOfflineForActivity(null).catch(() => {});
    }

    // Hors ligne : si l'utilisateur sort de la zone active, cherche silencieusement
    // une autre carte locale couvrant la nouvelle position (au maximum toutes les 20 s).
    if (!navigator.onLine && !state.offline.forced && Date.now() - (state.offline.lastAutoCheck || 0) > 20000) {
      state.offline.lastAutoCheck = Date.now();
      if (!state.offline.activePackage || !bboxContains(state.offline.activePackage.bbox, state.location)) {
        chooseOfflinePackageForCurrentPosition().then(pkg => {
          if (pkg && pkg.id !== state.offline.activePackage?.id) activateOfflinePackage(pkg, { fit:false, forced:false });
        }).catch(() => {});
      }
    }
  }

  let weatherDebounce = null;
  let lastWeatherKey = '';
  function scheduleWeather(lat, lon) {
    if (!navigator.onLine) return;
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (key === lastWeatherKey) return;
    clearTimeout(weatherDebounce);
    weatherDebounce = setTimeout(() => {
      lastWeatherKey = key;
      loadWeather(lat, lon, { silent: true });
    }, 600);
  }

  async function loadWeather(lat, lon, { silent = false } = {}) {
    if (!navigator.onLine) {
      const saved = state.offline?.activePackage?.weather || state.lastWeather;
      if (saved) {
        state.lastWeather = saved;
        renderCurrentWeather(saved);
        renderHourly(saved);
        if (ui.weatherUpdatedAt) ui.weatherUpdatedAt.textContent = `Météo enregistrée : ${formatOfflineDate(state.offline?.activePackage?.weatherSavedAt)}`;
        if (!silent) toast('Hors ligne : dernière météo enregistrée affichée.');
        return true;
      }
      if (!silent) toast('Aucune météo enregistrée hors ligne.');
      return false;
    }
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
      const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (ui.weatherUpdatedAt) ui.weatherUpdatedAt.textContent = `Dernière mise à jour : ${t}`;
      if (!silent) toast(`Météo actualisée à ${t}.`);
      return true;
    } catch (err) {
      if (!silent) toast('Impossible de récupérer la météo locale.');
      return false;
    }
  }

  async function refreshWeatherNow() {
    if (!navigator.onLine) { toast('Pas de réseau : affichage de la dernière météo enregistrée.'); return; }
    if (ui.refreshWeatherBtn.disabled) return;

    // Retour visuel immédiat : la flèche tourne pendant TOUTE l'opération,
    // y compris pendant l'obtention éventuelle d'une position GPS fraîche.
    ui.refreshWeatherBtn.disabled = true;
    ui.refreshWeatherBtn.classList.add('refreshing');
    ui.refreshWeatherBtn.setAttribute('aria-busy', 'true');
    if (ui.refreshWeatherLabel) ui.refreshWeatherLabel.textContent = 'Actualisation…';

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
      ui.refreshWeatherBtn.classList.remove('refreshing');
      ui.refreshWeatherBtn.removeAttribute('aria-busy');
      if (ui.refreshWeatherLabel) ui.refreshWeatherLabel.textContent = 'Actualiser';
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
      state.route = buildRouteObject(name, pts, { source: 'gpx' });
      drawRoute(true);
      renderRouteStats();
      toast(`Parcours chargé : ${state.route.distanceKm.toFixed(1)} km · tu peux maintenant le démarrer.`);
    } catch (err) {
      toast(err.message || 'Impossible de lire ce GPX.');
    }
  }

  function buildRouteObject(name, points, meta = {}) {
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
      createdAt: Date.now(),
      ...meta
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
    applyRouteTransportMode(r);
    ui.analyzeBtn.disabled = false;
    ui.routeForecast.classList.add('hidden');
    ui.routeForecast.innerHTML = '';
    renderLoadedRouteDetails(r);
  }

  function clearRoute() {
    if (['recording','paused'].includes(state.activity.status) && state.activity.followRoute === state.route) {
      toast('Ce GPX est actuellement suivi. Termine l’activité avant de le retirer.');
      return;
    }
    if (state.routeLine) state.map.removeLayer(state.routeLine);
    state.routeMarkers.forEach(m => state.map.removeLayer(m));
    state.routeMarkers = [];
    state.routeLine = null;
    state.route = null;
    state.routeDetailSerial++;
    state.elevationCharts.delete('current-route');
    if (state.elevationHoverMarker) { state.map.removeLayer(state.elevationHoverMarker); state.elevationHoverMarker = null; }
    ui.routeCard.classList.add('hidden');
    ui.analyzeBtn.disabled = true;
    ui.gpxInput.value = '';
  }

  function exportCurrentRoute() {
    if (!state.route) return;
    downloadGpx(state.route.name, state.route.points, 'route');
  }

  function showCurrentRouteOnMap() {
    if (!state.route || !state.routeLine) return;
    showAppScreen('map', { scroll: false });
    setTimeout(() => {
      enterMapFullscreen();
      if (state.routeLine) state.map.fitBounds(state.routeLine.getBounds(), { padding: [34, 34] });
    }, 70);
  }

  function buildCumulativeRouteKm(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative[i] = cumulative[i - 1] + haversine(points[i - 1], points[i]);
    }
    return cumulative;
  }

  function startSelectedRouteActivity() {
    if (!state.route) {
      toast('Charge d’abord un parcours GPX.');
      return;
    }
    if (['recording','paused'].includes(state.activity.status)) {
      toast('Une activité est déjà en cours. Termine-la avant de démarrer ce parcours.');
      return;
    }
    state.activity.mode = activityModeForRoute(state.route);
    document.querySelectorAll('[data-activity-mode]').forEach(b => b.classList.toggle('active', b.dataset.activityMode === state.activity.mode));
    startActivity(state.route);
    showAppScreen('map', { scroll: false });
    setTimeout(() => enterMapFullscreen(), 60);
  }

  async function analyzeRoute() {
    if (!state.route) return;
    ui.analyzeBtn.disabled = true;
    const analyzeLabel = ui.analyzeBtn.querySelector('span:last-child');
    if (analyzeLabel) analyzeLabel.textContent = 'Analyse en cours…';
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
      if (analyzeLabel) analyzeLabel.textContent = 'Analyser météo';
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


  // ---------- Parcours autour d’un point (OpenStreetMap / Overpass) ----------

  function getFinderProfile(key = state.hikeFinder.profile) {
    return FINDER_PROFILES[key] || FINDER_PROFILES.hike;
  }

  function startHikeFinder() {
    if (state.planner.active) stopPlanner(true);
    state.activity.targetSelect = false;
    state.hikeFinder.active = true;
    ui.finderMapDetail?.classList.add('hidden');
    ui.hikeFinderPanel.classList.remove('hidden');
    ui.hikeFinderListBtn.classList.toggle('hidden', !state.hikeFinder.results.length);
    const profile = getFinderProfile();
    ui.hikeFinderStatus.textContent = state.hikeFinder.results.length
      ? `${state.hikeFinder.results.length} parcours ${profile.label.toLowerCase()} trouvé(s). Touchez la carte pour rechercher ailleurs.`
      : `Mode ${profile.icon} ${profile.label} · touchez la carte pour choisir le centre de recherche.`;
    showAppScreen('map', { scroll: false });
    setTimeout(() => enterMapFullscreen(), 60);
  }

  function stopHikeFinder(clearMap = true) {
    state.hikeFinder.active = false;
    state.hikeFinder.detailSerial++;
    ui.hikeFinderPanel.classList.add('hidden');
    ui.finderMapDetail?.classList.add('hidden');
    if (clearMap) clearHikeFinderMapLayers();
  }

  function clearHikeFinderMapLayers() {
    if (state.hikeFinder.centerMarker) state.map.removeLayer(state.hikeFinder.centerMarker);
    if (state.hikeFinder.resultLayer) state.map.removeLayer(state.hikeFinder.resultLayer);
    if (state.hikeFinder.previewLayer) state.map.removeLayer(state.hikeFinder.previewLayer);
    state.hikeFinder.centerMarker = null;
    state.hikeFinder.resultLayer = null;
    state.hikeFinder.previewLayer = null;
    state.hikeFinder.mapLines = [];
    state.hikeFinder.selectedIndex = -1;
    if (state.elevationHoverMarker) {
      state.map.removeLayer(state.elevationHoverMarker);
      state.elevationHoverMarker = null;
    }
  }

  function setHikeFinderCenter(point) {
    state.hikeFinder.center = { lat: Number(point.lat), lon: Number(point.lon) };
    if (state.hikeFinder.centerMarker) state.map.removeLayer(state.hikeFinder.centerMarker);
    const profile = getFinderProfile();
    const icon = L.divIcon({
      className: '',
      html: `<div class="hike-search-center">${profile.icon}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    state.hikeFinder.centerMarker = L.marker([point.lat, point.lon], { icon, zIndexOffset: 1200 }).addTo(state.map);
  }

  async function useGpsForHikeFinder() {
    let point = state.location ? { lat: state.location.lat, lon: state.location.lon } : null;
    if (!point && 'geolocation' in navigator) {
      ui.hikeFinderStatus.textContent = 'Recherche de ta position GPS…';
      try {
        const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, maximumAge: 5000, timeout: 12000
        }));
        point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      } catch (_) {
        toast('Position GPS indisponible. Touchez directement un point sur la carte.');
        ui.hikeFinderStatus.textContent = 'Touchez la carte pour choisir le centre de recherche.';
        return;
      }
    }
    if (point) {
      state.map.setView([point.lat, point.lon], Math.max(state.map.getZoom(), 13));
      await searchHikesAround(point);
    }
  }

  async function fetchOverpass(query, timeoutMs = 42000) {
    let lastError = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = new URLSearchParams({ data: query });
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body,
          cache: 'no-store',
          signal: controller.signal
        });
        if (res.status === 429) throw new Error('Serveur OpenStreetMap occupé (429)');
        if (!res.ok) throw new Error(`Serveur OpenStreetMap ${res.status}`);
        const data = await res.json();
        if (!data || !Array.isArray(data.elements)) throw new Error('Réponse OpenStreetMap invalide');
        return data;
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError?.name === 'AbortError') throw new Error('Le serveur de tracés met trop de temps à répondre. Réessaie dans quelques secondes.');
    if (/Failed to fetch/i.test(lastError?.message || '')) throw new Error('Impossible de joindre le serveur de tracés. Vérifie la connexion puis réessaie.');
    throw lastError || new Error('Service de recherche indisponible');
  }

  function networkLabel(network) {
    return ({ iwn: 'International', nwn: 'National', rwn: 'Régional', lwn: 'Local', icn: 'International', ncn: 'National', rcn: 'Régional', lcn: 'Local' })[network] || '';
  }

  function distanceTagText(tags = {}) {
    const raw = String(tags.distance || '').trim();
    if (!raw) return '';
    return raw.match(/[a-zA-Z]/) ? raw : `${raw} km`;
  }

  const PAVED_SURFACES = new Set(['asphalt','paved','concrete','concrete:plates','concrete:lanes','paving_stones','sett']);
  const GRAVEL_SURFACES = new Set(['gravel','fine_gravel','compacted','unpaved','ground','dirt','earth','pebblestone','woodchips','sand','rock']);
  const ROAD_HIGHWAYS = new Set(['primary','secondary','tertiary','unclassified','residential','service','living_street','cycleway','road']);
  const TRAIL_HIGHWAYS = new Set(['track','path','bridleway','footway','steps']);

  function relationSegmentsFromElement(rel, wayMap = null) {
    return (rel.members || [])
      .filter(m => m.type === 'way')
      .map(m => {
        const way = wayMap?.get(Number(m.ref));
        const geometry = (way && Array.isArray(way.geometry)) ? way.geometry : m.geometry;
        return Array.isArray(geometry) ? geometry
          .map(g => ({ lat: Number(g.lat), lon: Number(g.lon), ele: null }))
          .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [];
      })
      .filter(seg => seg.length > 1);
  }

  function routeWayMetrics(rel, wayMap) {
    let totalKm = 0, pavedKm = 0, roughKm = 0, technicalKm = 0, roadBadKm = 0, taggedKm = 0;
    let surfaceRoadKm = 0, surfaceGravelKm = 0, surfaceTrailKm = 0, surfaceUnknownKm = 0;
    for (const m of rel.members || []) {
      if (m.type !== 'way') continue;
      const way = wayMap.get(Number(m.ref));
      if (!way?.geometry?.length) continue;
      const seg = way.geometry.map(g => ({ lat: Number(g.lat), lon: Number(g.lon) }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (seg.length < 2) continue;
      const km = routeDistance(seg);
      totalKm += km;
      const tags = way.tags || {};
      const surface = String(tags.surface || '').toLowerCase();
      const highway = String(tags.highway || '').toLowerCase();
      const mtbScale = tags['mtb:scale'];
      const paved = PAVED_SURFACES.has(surface);
      const gravel = GRAVEL_SURFACES.has(surface);
      const trail = TRAIL_HIGHWAYS.has(highway);
      const road = ROAD_HIGHWAYS.has(highway);
      const technical = mtbScale != null || highway === 'bridleway' || (highway === 'path' && !paved) || highway === 'steps';
      if (surface || highway) taggedKm += km;
      if (paved || (road && !gravel)) pavedKm += km;
      if (gravel || highway === 'track') roughKm += km;
      if (technical) technicalKm += km;
      if (highway === 'steps' || (trail && !paved)) roadBadKm += km;
      else if (gravel && !paved) roadBadKm += km;

      // Répartition exclusive utilisée dans la fiche parcours.
      if (paved || (road && !gravel && !trail)) surfaceRoadKm += km;
      else if (technical || (trail && !gravel)) surfaceTrailKm += km;
      else if (gravel || highway === 'track') surfaceGravelKm += km;
      else surfaceUnknownKm += km;
    }
    const den = Math.max(totalKm, 0.001);
    return {
      totalKm,
      pavedRatio: pavedKm / den,
      roughRatio: roughKm / den,
      technicalRatio: technicalKm / den,
      roadBadRatio: roadBadKm / den,
      taggedRatio: taggedKm / den,
      surfaceBreakdown: {
        road: surfaceRoadKm / den,
        gravel: surfaceGravelKm / den,
        trail: surfaceTrailKm / den,
        unknown: surfaceUnknownKm / den
      }
    };
  }

  function profileAcceptsRelation(profileKey, rel, metrics) {
    const routeType = String(rel.tags?.route || '').toLowerCase();
    if (profileKey === 'hike') return routeType === 'hiking' || routeType === 'foot';
    if (profileKey === 'road') {
      if (routeType !== 'bicycle') return false;
      // Vélo route : on élimine les relations comportant une part significative
      // de chemins/surfaces non revêtues. Les voies cyclables revêtues restent acceptées.
      return metrics.roadBadRatio <= 0.08 && metrics.technicalRatio <= 0.05;
    }
    if (profileKey === 'gravel') {
      if (routeType !== 'bicycle') return false;
      // Gravel : routes + pistes roulantes, mais on évite les parcours franchement techniques.
      return metrics.technicalRatio <= 0.30;
    }
    if (profileKey === 'mtb') {
      if (routeType === 'mtb') return true;
      if (routeType !== 'bicycle') return false;
      return metrics.technicalRatio >= 0.08 || metrics.roughRatio >= 0.18;
    }
    return true;
  }

  function profileQualityText(profileKey, metrics) {
    const pct = v => `${Math.round(Math.max(0, Math.min(1, v)) * 100)} %`;
    if (profileKey === 'road') return `revêtu/route ${pct(1 - metrics.roadBadRatio)}`;
    if (profileKey === 'gravel') return metrics.roughRatio > .08 ? `chemins/pistes ${pct(metrics.roughRatio)}` : 'parcours cyclable mixte';
    if (profileKey === 'mtb') return `tout-terrain ${pct(Math.max(metrics.roughRatio, metrics.technicalRatio))}`;
    return '';
  }

  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

  function formatDurationHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return '—';
    const totalMin = Math.max(1, Math.round(hours * 60));
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${String(m).padStart(2,'0')}` : `${h} h`;
  }

  function profileKeyForRoute(route, fallback = 'hike') {
    if (route?.plannerProfile && ACTIVITY_PROFILES[route.plannerProfile]) return route.plannerProfile;
    if (route?.transportMode === 'bike') return 'road';
    if (route?.transportMode === 'hike') return 'hike';
    return ACTIVITY_PROFILES[fallback] ? fallback : 'hike';
  }

  function estimateRouteDuration(route, profileKey, metrics = null) {
    const distance = Math.max(0, Number(route?.distanceKm) || 0);
    const gain = Math.max(0, Number(route?.gain) || 0);
    const rough = clamp01(metrics?.roughRatio);
    const technical = clamp01(metrics?.technicalRatio);
    let speed = 4, climbDivisor = 600, terrainFactor = 1;
    if (profileKey === 'road') { speed = 22; climbDivisor = 1000; terrainFactor = 1 + rough * .18 + technical * .25; }
    else if (profileKey === 'gravel') { speed = 17; climbDivisor = 850; terrainFactor = 1 + rough * .20 + technical * .35; }
    else if (profileKey === 'mtb') { speed = 12; climbDivisor = 700; terrainFactor = 1 + rough * .12 + technical * .45; }
    else { speed = 4; climbDivisor = 600; terrainFactor = 1 + technical * .12; }
    return (distance / speed) * terrainFactor + gain / climbDivisor;
  }

  function routeDifficulty(route, profileKey, metrics = null) {
    const d = Math.max(0, Number(route?.distanceKm) || 0);
    const g = Math.max(0, Number(route?.gain) || 0);
    const rough = clamp01(metrics?.roughRatio);
    const tech = clamp01(metrics?.technicalRatio);
    let score;
    if (profileKey === 'road') score = d / 40 + g / 800 + rough * .8 + tech * 1.4;
    else if (profileKey === 'gravel') score = d / 30 + g / 700 + rough * .8 + tech * 1.5;
    else if (profileKey === 'mtb') score = d / 22 + g / 600 + rough * .6 + tech * 2.0;
    else score = d / 8 + g / 400 + tech * .6;
    if (score < 1.45) return { label: 'Facile', icon: '🟢', cls: 'easy', score };
    if (score < 3.0) return { label: 'Modérée', icon: '🟡', cls: 'moderate', score };
    if (score < 4.8) return { label: 'Difficile', icon: '🟠', cls: 'hard', score };
    return { label: 'Très difficile', icon: '🔴', cls: 'very-hard', score };
  }

  function surfaceBreakdown(metrics) {
    const b = metrics?.surfaceBreakdown;
    if (!b) return null;
    const raw = {
      road: clamp01(b.road), gravel: clamp01(b.gravel), trail: clamp01(b.trail), unknown: clamp01(b.unknown)
    };
    const sum = raw.road + raw.gravel + raw.trail + raw.unknown;
    if (sum <= 0.001) return null;
    return Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, v / sum]));
  }

  function terrainSummary(profileKey, metrics) {
    const b = surfaceBreakdown(metrics);
    if (!b) return profileKey === 'road' ? 'Route' : profileKey === 'gravel' ? 'Mixte' : profileKey === 'mtb' ? 'Tout-terrain' : 'Sentiers';
    const labels = { road: 'Route', gravel: 'Piste/gravel', trail: 'Sentier', unknown: 'Inconnu' };
    const best = Object.entries(b).sort((a,b2) => b2[1] - a[1])[0];
    return `${labels[best[0]]} ${Math.round(best[1] * 100)} %`;
  }

  function surfaceBreakdownHtml(metrics) {
    const b = surfaceBreakdown(metrics);
    if (!b) return '<div class="surface-unavailable">Surface détaillée non renseignée dans OpenStreetMap.</div>';
    const items = [
      ['road','Route / revêtu','surface-road'],
      ['gravel','Piste / gravel','surface-gravel'],
      ['trail','Sentier','surface-trail'],
      ['unknown','Inconnu','surface-unknown']
    ].filter(([key]) => b[key] >= .015);
    return `<div class="surface-breakdown">${items.map(([key,label,cls]) => `
      <div class="surface-row"><span>${label}</span><div class="surface-bar"><i class="${cls}" style="width:${Math.round(b[key]*100)}%"></i></div><strong>${Math.round(b[key]*100)} %</strong></div>`).join('')}</div>`;
  }

  async function elevatedRouteCopy(route, maxPoints = 190) {
    let points = downsamplePreserve(route.points || [], maxPoints).map(p => ({...p}));
    if (points.length < 2) throw new Error('Tracé insuffisant pour calculer le profil.');
    const known = points.filter(p => Number.isFinite(Number(p.ele))).length;
    if (known / points.length < .9) {
      if (!navigator.onLine) return buildRouteObject(route.name, points, { ...route });
      points = await addElevations(points);
    }
    const { points: _points, distanceKm: _distanceKm, gain: _gain, loss: _loss, high: _high, low: _low, ...meta } = route;
    return buildRouteObject(route.name, points, meta);
  }

  function buildElevationChartHtml(route, chartKey, progressRatio = null) {
    const allPoints = route?.points || [];
    const pts = allPoints.filter(p => Number.isFinite(Number(p.ele)));
    if (pts.length < 2 || pts.length / Math.max(1, allPoints.length) < .7) return '<div class="elevation-unavailable">Profil altimétrique indisponible pour ce tracé.</div>';
    const cumulative = buildCumulativeRouteKm(pts);
    const total = cumulative[cumulative.length - 1] || route.distanceKm || 1;
    const elevations = pts.map(p => Number(p.ele));
    let min = Math.min(...elevations), max = Math.max(...elevations);
    if (max - min < 20) { max += 10; min -= 10; }
    const W = 600, H = 178, left = 18, right = 18, top = 12, bottom = 32;
    const innerW = W - left - right, innerH = H - top - bottom;
    const xy = pts.map((p,i) => ({
      x: left + (cumulative[i] / Math.max(total,.001)) * innerW,
      y: top + (1 - (Number(p.ele) - min) / Math.max(1,max-min)) * innerH
    }));
    const linePath = xy.map((q,i) => `${i?'L':'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${xy[xy.length-1].x.toFixed(1)},${(top+innerH).toFixed(1)} L${xy[0].x.toFixed(1)},${(top+innerH).toFixed(1)} Z`;
    state.elevationCharts.set(chartKey, { route, points: pts, cumulative, total, xy, W, left, innerW });
    const pr = Number.isFinite(progressRatio) ? clamp01(progressRatio) : null;
    const px = pr == null ? left : left + pr * innerW;
    return `<div class="elevation-chart" data-elevation-chart="${escapeHtml(chartKey)}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Profil altimétrique interactif">
        <line class="elev-grid" x1="${left}" y1="${top}" x2="${W-right}" y2="${top}" />
        <line class="elev-grid" x1="${left}" y1="${top+innerH}" x2="${W-right}" y2="${top+innerH}" />
        <path class="elev-area" d="${areaPath}" />
        <path class="elev-line" d="${linePath}" />
        <line class="elev-progress ${pr==null?'hidden':''}" data-elev-progress x1="${px}" y1="${top}" x2="${px}" y2="${top+innerH}" />
        <line class="elev-cursor" data-elev-cursor x1="${left}" y1="${top}" x2="${left}" y2="${top+innerH}" />
        <circle class="elev-dot" data-elev-dot cx="${xy[0].x}" cy="${xy[0].y}" r="6" />
        <text class="elev-axis-label" x="${left}" y="${H-7}">0 km</text>
        <text class="elev-axis-label" text-anchor="end" x="${W-right}" y="${H-7}">${total.toFixed(1).replace('.',',')} km</text>
        <text class="elev-alt-label" x="${left+4}" y="${top+12}">${Math.round(max)} m</text>
        <text class="elev-alt-label" x="${left+4}" y="${top+innerH-5}">${Math.round(min)} m</text>
      </svg>
      <div class="elevation-readout"><span>Distance <strong data-elev-distance>0,0 km</strong></span><span>Altitude <strong data-elev-altitude>${Math.round(elevations[0])} m</strong></span><span class="elevation-readout-hint">↔ Glisser</span></div>
    </div>`;
  }

  function bindElevationCharts(root = document) {
    root.querySelectorAll?.('.elevation-chart:not([data-elev-bound])').forEach(chart => {
      chart.dataset.elevBound = '1';
      const svg = chart.querySelector('svg');
      if (!svg) return;
      const update = ev => {
        const data = state.elevationCharts.get(chart.dataset.elevationChart);
        if (!data) return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = clamp01((ev.clientX - rect.left) / rect.width);
        const targetKm = ratio * data.total;
        let best = 0, diff = Infinity;
        for (let i=0;i<data.cumulative.length;i++) {
          const d = Math.abs(data.cumulative[i] - targetKm);
          if (d < diff) { diff = d; best = i; }
        }
        const q = data.xy[best], point = data.points[best];
        const cursor = chart.querySelector('[data-elev-cursor]');
        const dot = chart.querySelector('[data-elev-dot]');
        cursor?.setAttribute('x1', q.x); cursor?.setAttribute('x2', q.x);
        dot?.setAttribute('cx', q.x); dot?.setAttribute('cy', q.y);
        const dist = chart.querySelector('[data-elev-distance]');
        const alt = chart.querySelector('[data-elev-altitude]');
        if (dist) dist.textContent = `${data.cumulative[best].toFixed(1).replace('.',',')} km`;
        if (alt) alt.textContent = `${Math.round(Number(point.ele))} m`;
        showElevationPointOnMap(point);
      };
      svg.addEventListener('pointerdown', ev => { try { svg.setPointerCapture(ev.pointerId); } catch (_) {} update(ev); });
      svg.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse' || svg.hasPointerCapture?.(ev.pointerId)) update(ev); });
    });
  }

  function showElevationPointOnMap(point) {
    if (!state.map || !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
    if (!state.elevationHoverMarker) {
      state.elevationHoverMarker = L.circleMarker([point.lat, point.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#e11d48', fillOpacity: 1, pane: 'markerPane' }).addTo(state.map);
    } else state.elevationHoverMarker.setLatLng([point.lat, point.lon]);
    state.elevationHoverMarker.bindTooltip(`${Math.round(Number(point.ele) || 0)} m`, { direction:'top', offset:[0,-8] }).openTooltip();
  }

  function updateElevationChartProgress(chartKey, ratio) {
    const chart = document.querySelector(`.elevation-chart[data-elevation-chart="${chartKey}"]`);
    const data = state.elevationCharts.get(chartKey);
    if (!chart || !data) return;
    const line = chart.querySelector('[data-elev-progress]');
    if (!line) return;
    const x = data.left + clamp01(ratio) * data.innerW;
    line.classList.remove('hidden');
    line.setAttribute('x1', x); line.setAttribute('x2', x);
  }

  function routeDetails(route, profileKey, metrics = null) {
    const durationHours = estimateRouteDuration(route, profileKey, metrics);
    const difficulty = routeDifficulty(route, profileKey, metrics);
    return { route, profileKey, metrics, durationHours, difficulty, terrain: terrainSummary(profileKey, metrics) };
  }

  function detailStatsHtml(detail) {
    const r = detail.route, p = ACTIVITY_PROFILES[detail.profileKey] || ACTIVITY_PROFILES.hike;
    return `<div class="finder-detail-profile"><span>${p.icon}</span><strong>${escapeHtml(p.label)}</strong></div>
      <div class="finder-detail-stats">
        <div><span>Distance</span><strong>${Number(r.distanceKm||0).toFixed(1).replace('.',',')} km</strong></div>
        <div><span>Temps estimé</span><strong>${formatDurationHours(detail.durationHours)}</strong></div>
        <div><span>D+</span><strong>${r.high==null?'—':`+${Math.round(r.gain)} m`}</strong></div>
        <div><span>D−</span><strong>${r.high==null?'—':`−${Math.round(r.loss)} m`}</strong></div>
        <div><span>Altitude min.</span><strong>${r.low==null?'—':`${Math.round(r.low)} m`}</strong></div>
        <div><span>Altitude max.</span><strong>${r.high==null?'—':`${Math.round(r.high)} m`}</strong></div>
      </div>
      <div class="difficulty-pill ${detail.difficulty.cls}">${detail.difficulty.icon} Difficulté : <strong>${detail.difficulty.label}</strong></div>`;
  }

  function finderDetailHtml(detail, chartKey) {
    return `${detailStatsHtml(detail)}
      <div class="finder-surface-block"><div class="finder-subtitle">Terrain estimé</div>${surfaceBreakdownHtml(detail.metrics)}</div>
      <div class="finder-elevation-block"><div class="finder-subtitle">Profil altimétrique interactif</div>${buildElevationChartHtml(detail.route, chartKey)}</div>
      <p class="finder-detail-note">Temps et difficulté sont des estimations calculées à partir de la distance, ${detail.reliefAvailable === false ? 'du terrain disponible (relief indisponible pour le moment)' : 'du dénivelé'} et du type de terrain disponible dans OpenStreetMap.</p>`;
  }

  async function ensureFinderDetails(result) {
    if (result.detailData?.route) return result.detailData;
    if (result.detailPromise) return result.detailPromise;
    result.detailPromise = (async () => {
      await ensureHikeGeometry(result);
      const profileKey = result.profile || state.hikeFinder.profile || 'hike';
      const base = buildRouteObject(result.name, downsamplePreserve(result.points, 190).map(p => ({...p})), {
        source:`osm-${profileKey}`, transportMode:getFinderProfile(profileKey).transportMode, plannerProfile:profileKey,
        osmRelationId:result.id, osmRef:result.ref||'', osmNetwork:result.network||'', metrics:result.metrics
      });
      let elevated = base;
      try { elevated = await elevatedRouteCopy(base, 190); } catch (_) { /* fiche utilisable même sans service d'altitude */ }
      const detail = routeDetails(elevated, profileKey, result.metrics);
      detail.reliefAvailable = elevated.high != null;
      result.detailRoute = elevated;
      result.detailData = detail;
      result.distanceKm = elevated.distanceKm;
      return detail;
    })();
    try { return await result.detailPromise; }
    finally { result.detailPromise = null; }
  }

  function setFinderDetailLoading(result, source) {
    const p = getFinderProfile(result.profile || state.hikeFinder.profile);
    const loading = '<div class="finder-detail-loading"><span class="finder-detail-spinner">↻</span><strong>Calcul du relief…</strong><small>Distance, dénivelé, difficulté et profil altimétrique.</small></div>';
    if (source === 'map') {
      ui.finderMapDetailType.textContent = `${p.icon} ${p.label}`;
      ui.finderMapDetailName.textContent = result.name;
      ui.finderMapDetailBody.innerHTML = loading;
      ui.finderMapDetail.classList.remove('hidden');
      ui.hikeFinderPanel.classList.add('hidden');
    } else {
      ui.finderDetailType.textContent = `${p.icon} ${p.label}`;
      ui.finderDetailName.textContent = result.name;
      ui.finderDetailBody.innerHTML = loading;
      ui.finderDetailCard.classList.remove('hidden');
    }
  }

  async function openFinderDetails(index, source = 'routes') {
    const result = state.hikeFinder.results[index];
    if (!result) return;
    state.hikeFinder.detailSource = source;
    const serial = ++state.hikeFinder.detailSerial;
    setFinderDetailLoading(result, source);
    try {
      const detail = await ensureFinderDetails(result);
      if (serial !== state.hikeFinder.detailSerial || state.hikeFinder.selectedIndex !== index) return;
      const p = getFinderProfile(detail.profileKey);
      ui.finderMapDetailType.textContent = `${p.icon} ${p.label}`;
      ui.finderMapDetailName.textContent = result.name;
      ui.finderDetailType.textContent = `${p.icon} ${p.label}`;
      ui.finderDetailName.textContent = result.name;
      ui.finderMapDetailBody.innerHTML = finderDetailHtml(detail, `finder-map-${result.id}`);
      ui.finderDetailBody.innerHTML = finderDetailHtml(detail, `finder-card-${result.id}`);
      if (source === 'routes') ui.finderDetailCard.classList.remove('hidden');
      bindElevationCharts(ui.finderMapDetail);
      bindElevationCharts(ui.finderDetailCard);
    } catch (err) {
      const msg = `<div class="finder-detail-error">⚠️ ${escapeHtml(err?.message || 'Impossible de calculer les détails de ce parcours.')}</div>`;
      ui.finderMapDetailBody.innerHTML = msg;
      ui.finderDetailBody.innerHTML = msg;
    }
  }

  function closeFinderMapDetail() {
    ui.finderMapDetail?.classList.add('hidden');
    if (state.hikeFinder.active) ui.hikeFinderPanel?.classList.remove('hidden');
  }

  function closeFinderDetailCard() { ui.finderDetailCard?.classList.add('hidden'); }

  async function renderLoadedRouteDetails(route) {
    const serial = ++state.routeDetailSerial;
    const profileKey = profileKeyForRoute(route, route?.plannerProfile || 'hike');
    const baseDifficulty = routeDifficulty(route, profileKey, route?.metrics || null);
    ui.routeDuration.textContent = formatDurationHours(estimateRouteDuration(route, profileKey, route?.metrics || null));
    ui.routeDifficulty.textContent = `${baseDifficulty.icon} ${baseDifficulty.label}`;
    ui.routeLow.textContent = route.low == null ? '—' : `${Math.round(route.low)} m`;
    ui.routeSurface.textContent = terrainSummary(profileKey, route?.metrics || null);
    ui.routeElevationSection.classList.add('hidden');
    ui.routeElevationChart.innerHTML = '<div class="finder-detail-loading compact"><span class="finder-detail-spinner">↻</span><small>Calcul du profil altimétrique…</small></div>';
    try {
      const elevated = await elevatedRouteCopy(route, 210);
      if (serial !== state.routeDetailSerial || state.route !== route) return;
      // On enrichit aussi le parcours courant afin que les stats D+/D− deviennent disponibles pour un GPX sans altitude.
      if (elevated.high != null) {
        route.gain = elevated.gain; route.loss = elevated.loss; route.high = elevated.high; route.low = elevated.low;
        ui.routeGain.textContent = `${Math.round(route.gain)} m`;
        ui.routeLoss.textContent = `${Math.round(route.loss)} m`;
        ui.routeHigh.textContent = `${Math.round(route.high)} m`;
      }
      const detail = routeDetails(elevated, profileKey, route?.metrics || null);
      ui.routeDuration.textContent = formatDurationHours(detail.durationHours);
      ui.routeDifficulty.textContent = `${detail.difficulty.icon} ${detail.difficulty.label}`;
      ui.routeLow.textContent = elevated.low == null ? '—' : `${Math.round(elevated.low)} m`;
      ui.routeSurface.textContent = detail.terrain;
      ui.routeElevationChart.innerHTML = buildElevationChartHtml(elevated, 'current-route');
      ui.routeElevationSection.classList.remove('hidden');
      bindElevationCharts(ui.routeElevationSection);
      if (state.activity.followRoute === route && state.activity.followRouteCumKm && state.activity.followRouteLastIndex != null) {
        const total = route.distanceKm || state.activity.followRouteCumKm.at(-1) || 1;
        const done = state.activity.followRouteCumKm[state.activity.followRouteLastIndex] || 0;
        updateElevationChartProgress('current-route', done / total);
      }
    } catch (_) {
      if (serial !== state.routeDetailSerial || state.route !== route) return;
      ui.routeElevationSection.classList.remove('hidden');
      ui.routeElevationChart.innerHTML = '<div class="elevation-unavailable">Profil altimétrique indisponible hors connexion ou pour ce tracé.</div>';
    }
  }

  function hikeResultMeta(result) {
    const parts = [];
    if (result.ref) parts.push(result.ref);
    const net = networkLabel(result.network);
    if (net) parts.push(net);
    if (result.distanceKm != null) parts.push(`${result.distanceKm.toFixed(1).replace('.', ',')} km`);
    else if (result.distanceTag) parts.push(result.distanceTag);
    if (result.profileHint) parts.push(result.profileHint);
    if (result.from && result.to) parts.push(`${result.from} → ${result.to}`);
    return parts.join(' · ') || 'Itinéraire OpenStreetMap';
  }

  function buildFinderQuery(profileKey, point, radiusM) {
    const lat = Number(point.lat).toFixed(6), lon = Number(point.lon).toFixed(6);
    let relationSelector = '';
    if (profileKey === 'hike') {
      relationSelector = `relation(around:${radiusM},${lat},${lon})["type"="route"]["route"~"^(hiking|foot)$"];`;
    } else if (profileKey === 'mtb') {
      relationSelector = `relation(around:${radiusM},${lat},${lon})["type"="route"]["route"="mtb"];relation(around:${radiusM},${lat},${lon})["type"="route"]["route"="bicycle"];`;
    } else {
      relationSelector = `relation(around:${radiusM},${lat},${lon})["type"="route"]["route"="bicycle"];`;
    }
    return `[out:json][timeout:38];(${relationSelector})->.routes;(.routes;way(r.routes););out body geom qt;`;
  }

  function parseFinderResults(data, profileKey) {
    const elements = data.elements || [];
    const ways = new Map(elements.filter(el => el.type === 'way').map(w => [Number(w.id), w]));
    const seen = new Set();
    const results = [];
    for (const rel of elements.filter(el => el.type === 'relation')) {
      if (seen.has(rel.id)) continue;
      seen.add(rel.id);
      const tags = rel.tags || {};
      const segments = relationSegmentsFromElement(rel, ways);
      if (!segments.length) continue;
      const points = stitchHikeSegments(segments);
      if (points.length < 2) continue;
      const metrics = routeWayMetrics(rel, ways);
      if (!profileAcceptsRelation(profileKey, rel, metrics)) continue;
      const distanceKm = routeDistance(points);
      results.push({
        id: Number(rel.id),
        name: tags.name || tags['name:fr'] || tags.ref || `${getFinderProfile(profileKey).label} OSM ${rel.id}`,
        ref: tags.ref || '', network: tags.network || '', operator: tags.operator || '',
        from: tags.from || '', to: tags.to || '', distanceTag: distanceTagText(tags), tags,
        center: rel.center || null, points, segments, distanceKm,
        profile: profileKey, metrics, profileHint: profileQualityText(profileKey, metrics), geometryPromise: null
      });
    }
    // Les parcours les plus proches du point choisi remontent en premier si un centre est connu,
    // puis tri par nom pour rester stable.
    const center = state.hikeFinder.center;
    return results.sort((a,b) => {
      const ac = a.center && center ? haversine({lat:center.lat,lon:center.lon},{lat:a.center.lat,lon:a.center.lon}) : 9999;
      const bc = b.center && center ? haversine({lat:center.lat,lon:center.lon},{lat:b.center.lat,lon:b.center.lon}) : 9999;
      return ac - bc || (a.name || '').localeCompare(b.name || '', 'fr');
    }).slice(0, 30);
  }

  async function searchHikesAround(point) {
    if (state.hikeFinder.loading) return;
    const lat = Number(point.lat), lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const serial = ++state.hikeFinder.requestSerial;
    state.hikeFinder.loading = true;
    state.hikeFinder.selectedIndex = -1;
    state.hikeFinder.detailSerial++;
    ui.finderMapDetail?.classList.add('hidden');
    ui.finderDetailCard?.classList.add('hidden');
    setHikeFinderCenter({ lat, lon });
    const profile = getFinderProfile();
    ui.hikeFinderStatus.textContent = `${profile.icon} Recherche ${profile.label.toLowerCase()} dans un rayon de ${state.hikeFinder.radiusKm} km…`;
    ui.hikeFinderListBtn.classList.add('hidden');
    if (ui.hikeFinderMapResults) ui.hikeFinderMapResults.innerHTML = '<div class="hike-map-loading">Recherche des tracés…</div>';

    try {
      const radiusM = Math.round(state.hikeFinder.radiusKm * 1000);
      const query = buildFinderQuery(state.hikeFinder.profile, { lat, lon }, radiusM);
      const data = await fetchOverpass(query, 46000);
      if (serial !== state.hikeFinder.requestSerial) return;

      const results = parseFinderResults(data, state.hikeFinder.profile);
      state.hikeFinder.results = results;
      renderHikeFinderResults();
      renderHikeFinderMapResults();
      drawFinderResultsOnMap(true);
      ui.hikeFinderResultsCard.classList.toggle('hidden', !results.length);
      ui.hikeFinderListBtn.classList.toggle('hidden', !results.length);
      ui.hikeFinderStatus.textContent = results.length
        ? `${results.length} parcours ${profile.label.toLowerCase()} trouvé(s) dans ${state.hikeFinder.radiusKm} km.`
        : `Aucun parcours ${profile.label.toLowerCase()} compatible trouvé dans ${state.hikeFinder.radiusKm} km.`;
    } catch (err) {
      if (serial !== state.hikeFinder.requestSerial) return;
      state.hikeFinder.results = [];
      renderHikeFinderResults();
      renderHikeFinderMapResults();
      if (state.hikeFinder.resultLayer) state.map.removeLayer(state.hikeFinder.resultLayer);
      state.hikeFinder.resultLayer = null;
      ui.hikeFinderStatus.textContent = 'Recherche indisponible pour le moment.';
      toast(err.message || 'Impossible de rechercher les parcours OpenStreetMap pour le moment.');
    } finally {
      if (serial === state.hikeFinder.requestSerial) state.hikeFinder.loading = false;
    }
  }

  function renderHikeFinderResults() {
    const list = state.hikeFinder.results;
    const profile = getFinderProfile();
    if (ui.hikeFinderResultsSummary) {
      ui.hikeFinderResultsSummary.textContent = state.hikeFinder.center
        ? `${profile.icon} ${profile.label} · ${list.length} résultat(s) · rayon ${state.hikeFinder.radiusKm} km.`
        : `${list.length} résultat(s).`;
    }
    ui.hikeFinderResultsList.innerHTML = list.map((r, i) => `
      <div class="hike-result-item ${i === state.hikeFinder.selectedIndex ? 'selected' : ''}" data-hike-index="${i}">
        <button type="button" class="hike-result-select" data-hike-select="${i}" aria-label="Sélectionner ${escapeHtml(r.name)}">
          <div class="hike-result-name">${escapeHtml(r.name)}</div>
          <div class="hike-result-meta">${escapeHtml(hikeResultMeta(r))}</div>
        </button>
        <div class="hike-result-actions">
          <button type="button" data-hike-action="show" title="Afficher sur la carte">🗺️</button>
          <button type="button" data-hike-action="save" title="Enregistrer dans Mes parcours">💾</button>
          <button type="button" class="hike-load" data-hike-action="load">Charger</button>
        </div>
      </div>`).join('');
  }

  function renderHikeFinderMapResults() {
    if (!ui.hikeFinderMapResults) return;
    const list = state.hikeFinder.results;
    if (!list.length) {
      ui.hikeFinderMapResults.innerHTML = '<div class="hike-map-empty">Aucun tracé à afficher.</div>';
      return;
    }
    ui.hikeFinderMapResults.innerHTML = list.map((r,i) => `
      <button type="button" class="hike-map-result ${i === state.hikeFinder.selectedIndex ? 'selected' : ''}" data-hike-map-index="${i}">
        <span>${getFinderProfile(r.profile).icon}</span>
        <span><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(hikeResultMeta(r))}</small></span>
      </button>`).join('');
  }

  function drawFinderResultsOnMap(fit = false) {
    if (state.hikeFinder.resultLayer) state.map.removeLayer(state.hikeFinder.resultLayer);
    state.hikeFinder.mapLines = [];
    const layers = [];
    state.hikeFinder.results.forEach((result, index) => {
      const lines = (result.segments || []).map(seg => seg.map(p => [p.lat, p.lon]));
      if (!lines.length) return;
      const selected = index === state.hikeFinder.selectedIndex;
      const line = L.polyline(lines, {
        color: selected ? '#0f8a67' : '#52677a',
        weight: selected ? 6 : 4,
        opacity: selected ? .96 : .58,
        lineCap: 'round', lineJoin: 'round'
      });
      line.bindTooltip(result.name, { sticky: true, direction: 'top' });
      line.on('click', ev => {
        if (ev?.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
        selectFinderResult(index, true);
      });
      state.hikeFinder.mapLines[index] = line;
      layers.push(line);
    });
    state.hikeFinder.resultLayer = L.featureGroup(layers).addTo(state.map);
    if (fit && layers.length) {
      const bounds = state.hikeFinder.resultLayer.getBounds();
      if (bounds.isValid()) state.map.fitBounds(bounds, { paddingTopLeft: [24, 80], paddingBottomRight: [24, 220], maxZoom: 14 });
    }
  }

  function refreshFinderLineStyles() {
    state.hikeFinder.mapLines.forEach((line, index) => {
      if (!line) return;
      const selected = index === state.hikeFinder.selectedIndex;
      line.setStyle({ color: selected ? '#0f8a67' : '#52677a', weight: selected ? 6 : 4, opacity: selected ? .96 : .48 });
      if (selected) line.bringToFront();
    });
  }

  function selectFinderResult(index, focusMap = false, openDetails = true) {
    const result = state.hikeFinder.results[index];
    if (!result) return;
    state.hikeFinder.selectedIndex = index;
    refreshFinderLineStyles();
    renderHikeFinderResults();
    renderHikeFinderMapResults();
    requestAnimationFrame(() => {
      ui.hikeFinderMapResults?.querySelector('.hike-map-result.selected')?.scrollIntoView({ block: 'nearest' });
      ui.hikeFinderResultsList?.querySelector('.hike-result-item.selected')?.scrollIntoView({ block: 'nearest' });
    });
    if (focusMap) {
      const line = state.hikeFinder.mapLines[index];
      if (line) {
        const bounds = line.getBounds();
        if (bounds.isValid()) state.map.fitBounds(bounds, { paddingTopLeft: [24, 80], paddingBottomRight: [24, 330], maxZoom: 15 });
      }
    }
    if (openDetails) openFinderDetails(index, focusMap ? 'map' : 'routes');
  }

  function stitchHikeSegments(segments) {
    const chains = [];
    const JOIN_KM = 0.25;
    for (const original of segments) {
      const seg = original.map(p => ({ ...p }));
      if (seg.length < 2) continue;
      let best = null;
      for (let ci = 0; ci < chains.length; ci++) {
        const chain = chains[ci];
        const cs = chain[0], ce = chain[chain.length - 1], ss = seg[0], se = seg[seg.length - 1];
        const candidates = [
          { d: haversine(ce, ss), where: 'append', reverse: false },
          { d: haversine(ce, se), where: 'append', reverse: true },
          { d: haversine(cs, se), where: 'prepend', reverse: false },
          { d: haversine(cs, ss), where: 'prepend', reverse: true }
        ];
        const local = candidates.sort((a,b) => a.d - b.d)[0];
        if (!best || local.d < best.d) best = { ...local, ci };
      }
      if (!best || best.d > JOIN_KM) {
        chains.push(seg);
        continue;
      }
      const chain = chains[best.ci];
      const part = best.reverse ? seg.slice().reverse() : seg;
      if (best.where === 'append') chain.push(...part.slice(1));
      else chain.unshift(...part.slice(0, -1));
    }
    if (!chains.length) return [];
    chains.sort((a,b) => routeDistance(b) - routeDistance(a));
    return chains[0];
  }

  function parseHikeGpxGeometry(text) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('GPX du parcours illisible');
    let segments = [...xml.querySelectorAll('trkseg')].map(seg => [...seg.querySelectorAll('trkpt')].map(n => ({
      lat: Number(n.getAttribute('lat')),
      lon: Number(n.getAttribute('lon')),
      ele: n.querySelector('ele') ? Number(n.querySelector('ele').textContent) : null
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))).filter(seg => seg.length > 1);
    if (!segments.length) {
      const routePts = [...xml.querySelectorAll('rtept')].map(n => ({
        lat: Number(n.getAttribute('lat')),
        lon: Number(n.getAttribute('lon')),
        ele: n.querySelector('ele') ? Number(n.querySelector('ele').textContent) : null
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (routePts.length > 1) segments = [routePts];
    }
    if (!segments.length) throw new Error('Aucun tracé exploitable dans le GPX');
    const points = stitchHikeSegments(segments);
    if (points.length < 2) throw new Error('Impossible de reconstruire le tracé');
    return { segments, points };
  }

  async function fetchWaymarkedHikeGeometry(result) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const url = `${WAYMARKED_HIKING_API}/details/relation/${encodeURIComponent(result.id)}/geometry/gpx`;
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error(`Waymarked Trails ${res.status}`);
      const text = await res.text();
      return parseHikeGpxGeometry(text);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchOverpassHikeGeometry(result) {
    const query = `[out:json][timeout:30];relation(${result.id})->.r;(.r;way(r.r););out body geom qt;`;
    const data = await fetchOverpass(query, 35000);
    const wayMap = new Map((data.elements || []).filter(el => el.type === 'way').map(w => [Number(w.id), w]));
    const rel = (data.elements || []).find(el => el.type === 'relation' && Number(el.id) === Number(result.id));
    const segments = rel ? relationSegmentsFromElement(rel, wayMap) : [];
    if (!segments.length) throw new Error('Ce parcours ne fournit pas de tracé exploitable');
    const points = stitchHikeSegments(segments);
    if (points.length < 2) throw new Error('Impossible de reconstruire le tracé');
    return { segments, points };
  }

  async function ensureHikeGeometry(result) {
    if (result.points?.length > 1 && result.segments?.length) return result;
    if (result.geometryPromise) return result.geometryPromise;
    result.geometryPromise = (async () => {
      let geometry = null;
      if ((result.profile || 'hike') === 'hike') {
        try { geometry = await fetchWaymarkedHikeGeometry(result); } catch (_) { geometry = await fetchOverpassHikeGeometry(result); }
      } else {
        geometry = await fetchOverpassHikeGeometry(result);
      }
      result.segments = geometry.segments;
      result.points = geometry.points;
      result.distanceKm = routeDistance(result.points);
      renderHikeFinderResults();
      renderHikeFinderMapResults();
      return result;
    })();
    try { return await result.geometryPromise; }
    finally { result.geometryPromise = null; }
  }

  function drawHikePreview(result) {
    // La recherche affiche déjà tous les tracés. On réouvre la vue carte + liste,
    // puis on sélectionne celui-ci et on zoome dessus.
    const index = state.hikeFinder.results.indexOf(result);
    if (index >= 0) {
      state.hikeFinder.active = true;
      ui.hikeFinderPanel.classList.remove('hidden');
      renderHikeFinderMapResults();
      showAppScreen('map', { scroll: false });
      setTimeout(() => {
        enterMapFullscreen();
        if (!state.hikeFinder.resultLayer || !state.hikeFinder.mapLines.length) drawFinderResultsOnMap(false);
        selectFinderResult(index, true);
      }, 70);
      return;
    }
    if (state.hikeFinder.previewLayer) state.map.removeLayer(state.hikeFinder.previewLayer);
    const lines = (result.segments || []).map(seg => seg.map(p => [p.lat, p.lon]));
    state.hikeFinder.previewLayer = L.polyline(lines, { color: '#0f8a67', weight: 6, opacity: .92 }).addTo(state.map);
    showAppScreen('map', { scroll: false });
    setTimeout(() => {
      enterMapFullscreen();
      if (state.hikeFinder.previewLayer) state.map.fitBounds(state.hikeFinder.previewLayer.getBounds(), { padding: [28,28] });
    }, 70);
  }

  async function makeRouteFromHike(result, addRelief = true) {
    await ensureHikeGeometry(result);
    const profileKey = result.profile || state.hikeFinder.profile || 'hike';
    const finderProfile = getFinderProfile(profileKey);
    let points;
    if (addRelief && result.detailRoute?.points?.length) {
      points = result.detailRoute.points.map(p => ({...p}));
    } else {
      points = downsamplePreserve(result.points, 450).map(p => ({ ...p }));
      if (addRelief) {
        try { points = await addElevations(points); } catch (_) { /* le tracé reste utilisable sans relief */ }
      }
    }
    return buildRouteObject(result.name, points, {
      source: `osm-${profileKey}`,
      transportMode: finderProfile.transportMode,
      plannerProfile: profileKey,
      osmRelationId: result.id,
      osmRef: result.ref || '',
      osmNetwork: result.network || '',
      metrics: result.metrics || null
    });
  }

  async function handleHikeResultAction(e) {
    const selectBtn = e.target.closest('[data-hike-select]');
    if (selectBtn) {
      const index = Number(selectBtn.dataset.hikeSelect);
      selectFinderResult(index, false);
      return;
    }
    const btn = e.target.closest('button[data-hike-action]');
    const row = e.target.closest('[data-hike-index]');
    if (!btn || !row) return;
    const index = Number(row.dataset.hikeIndex);
    const result = state.hikeFinder.results[index];
    if (!result) return;
    selectFinderResult(index, false);
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.dataset.hikeAction === 'show' ? '…' : 'Chargement…';
    try {
      if (btn.dataset.hikeAction === 'show') {
        await ensureHikeGeometry(result);
        drawHikePreview(result);
      } else {
        await ensureFinderDetails(result);
        const route = await makeRouteFromHike(result, true);
        if (btn.dataset.hikeAction === 'save') {
          saveRouteLocal(route);
          renderSavedRoutes();
          toast(`« ${route.name} » ajouté à Mes parcours.`);
        } else if (btn.dataset.hikeAction === 'load') {
          state.route = route;
          stopHikeFinder(true);
          applyRouteTransportMode(route);
          drawRoute(false);
          renderRouteStats();
          showAppScreen('routes');
          toast(`Parcours chargé : ${route.distanceKm.toFixed(1).replace('.', ',')} km.`);
        }
      }
    } catch (err) {
      toast(err?.message || 'Impossible de charger ce parcours.');
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  async function handleFinderDetailAction(e) {
    const btn = e.target.closest('[data-finder-detail-action]');
    if (!btn) return;
    const result = state.hikeFinder.results[state.hikeFinder.selectedIndex];
    if (!result) { toast('Sélectionne d’abord un parcours.'); return; }
    const action = btn.dataset.finderDetailAction;
    const previous = btn.innerHTML;
    btn.disabled = true;
    if (action !== 'show') btn.textContent = 'Chargement…';
    try {
      if (action === 'show') {
        await ensureHikeGeometry(result);
        drawHikePreview(result);
        return;
      }
      await ensureFinderDetails(result);
      const route = await makeRouteFromHike(result, true);
      if (action === 'save') {
        saveRouteLocal(route);
        renderSavedRoutes();
        toast(`« ${route.name} » ajouté à Mes parcours.`);
      } else if (action === 'load') {
        state.route = route;
        stopHikeFinder(true);
        applyRouteTransportMode(route);
        drawRoute(false);
        renderRouteStats();
        showAppScreen('routes');
        toast(`Parcours chargé : ${route.distanceKm.toFixed(1).replace('.', ',')} km.`);
      } else if (action === 'start') {
        state.route = route;
        stopHikeFinder(true);
        applyRouteTransportMode(route);
        drawRoute(false);
        renderRouteStats();
        startSelectedRouteActivity();
      }
    } catch (err) {
      toast(err?.message || 'Impossible de préparer ce parcours.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = previous;
    }
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
    const profile = getPlannerProfile();
    ui.plannerStatus.textContent = `${profile.icon} ${profile.label} · Touchez la carte pour placer le départ.`;
    updatePlannerButtons();
    showAppScreen('map', { scroll: false });
    setTimeout(() => enterMapFullscreen(), 60);
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
      ui.plannerStatus.textContent = `${getPlannerProfile().icon} ${getPlannerProfile().label} · Départ placé. Ajoute l’arrivée ou une étape.`;
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
      ui.plannerStatus.textContent = `${getPlannerProfile().icon} ${getPlannerProfile().label} · Touchez la carte pour placer le départ.`;
    } else if (state.planner.waypoints.length === 1) {
      state.planner.routePoints = [{...state.planner.waypoints[0]}];
      drawPlannerLine(state.planner.routePoints, true);
      ui.plannerStatus.textContent = `${getPlannerProfile().icon} ${getPlannerProfile().label} · Ajoutez une arrivée ou une étape.`;
    } else {
      schedulePlannerRoute();
    }
  }

  function clearPlanner() {
    state.planner.waypoints = [];
    state.planner.routePoints = [];
    clearPlannerLayers();
    ui.plannerStatus.textContent = `${getPlannerProfile().icon} ${getPlannerProfile().label} · Touchez la carte pour placer le départ.`;
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
    const profile = getPlannerProfile();
    updatePlannerButtons();
    ui.plannerStatus.textContent = `${profile.icon} Calcul ${profile.label}…`;

    try {
      const payload = {
        locations: state.planner.waypoints.map(p => ({
          lat: Number(p.lat.toFixed(6)),
          lon: Number(p.lon.toFixed(6))
        })),
        costing: profile.costing,
        costing_options: profile.costingOptions,
        format: 'osrm',
        shape_format: 'geojson',
        directions_type: 'none',
        units: 'kilometers'
      };

      const res = await fetch(VALHALLA_ROUTE_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': 'markprovac.github.io-rando-radar'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Valhalla ${res.status}`);
      const data = await res.json();
      if (serial !== state.planner.requestSerial) return;
      const coordsOut = data.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordsOut) || coordsOut.length < 2) throw new Error('Aucun chemin trouvé');

      state.planner.routePoints = coordsOut.map(c => ({ lon: Number(c[0]), lat: Number(c[1]), ele: null }));
      drawPlannerLine(state.planner.routePoints, false);
      const km = routeDistance(state.planner.routePoints);
      ui.plannerStatus.textContent = `${profile.icon} ${km.toFixed(1)} km · ${profile.label} · ${profile.description}.`;
    } catch (advancedErr) {
      // Secours : ancien routeur OSM. Pour les vélos, ce repli est générique
      // et ne peut pas distinguer Route / Gravel / VTT.
      try {
        const prefix = profile.activityMode === 'hike' ? 'routed-foot' : 'routed-bike';
        const coords = state.planner.waypoints.map(p => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
        const url = `https://routing.openstreetmap.de/${prefix}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Routeur de secours indisponible');
        const data = await res.json();
        if (serial !== state.planner.requestSerial) return;
        const coordsOut = data.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(coordsOut) || coordsOut.length < 2) throw new Error('Aucun chemin trouvé');
        state.planner.routePoints = coordsOut.map(c => ({ lon: Number(c[0]), lat: Number(c[1]), ele: null }));
        drawPlannerLine(state.planner.routePoints, false);
        const km = routeDistance(state.planner.routePoints);
        ui.plannerStatus.textContent = `${profile.icon} ${km.toFixed(1)} km · ${profile.label} · profil de secours générique utilisé.`;
      } catch (fallbackErr) {
        if (serial !== state.planner.requestSerial) return;
        state.planner.routePoints = state.planner.waypoints.map(p => ({...p, ele:null}));
        drawPlannerLine(state.planner.routePoints, true);
        ui.plannerStatus.textContent = 'Routeurs indisponibles : liaison directe affichée. Vous pouvez quand même enregistrer.';
      }
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
      const profile = getPlannerProfile();
      const defaultName = `${profile.label} ${new Date().toLocaleDateString('fr-FR')}`;
      const entered = window.prompt('Nom du parcours', defaultName);
      const name = (entered || defaultName).trim().slice(0, 80) || defaultName;
      const route = buildRouteObject(name, pts, { source: 'planner', plannerProfile: state.planner.mode, transportMode: profile.activityMode === 'hike' ? 'hike' : 'bike' });
      saveRouteLocal(route);
      state.route = route;
      drawRoute(false);
      renderRouteStats();
      stopPlanner(true);
      renderSavedRoutes();
      toast(`Parcours « ${name} » enregistré.`);
    } catch (err) {
      toast('Le parcours est créé, mais le relief n’a pas pu être récupéré.');
      const profile = getPlannerProfile();
      const route = buildRouteObject(`${profile.label} ${new Date().toLocaleDateString('fr-FR')}`, downsamplePreserve(state.planner.routePoints, 600), { source: 'planner', plannerProfile: state.planner.mode, transportMode: profile.activityMode === 'hike' ? 'hike' : 'bike' });
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
        <div><strong>${escapeHtml(r.name || 'Parcours')}</strong><div class="saved-meta">${r.plannerProfile && PLANNER_PROFILES[r.plannerProfile] ? `${PLANNER_PROFILES[r.plannerProfile].icon} ${escapeHtml(PLANNER_PROFILES[r.plannerProfile].label)} · ` : ''}${Number(r.distanceKm || 0).toFixed(1)} km${Number.isFinite(r.gain) ? ` · D+ ${Math.round(r.gain)} m` : ''}</div></div>
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
  }

  function startActivity(routeToFollow = null) {
    if (state.planner.active) stopPlanner(true);
    if (routeToFollow) state.activity.mode = activityModeForRoute(routeToFollow);
    clearActivityTrack();
    clearActivityTarget();
    state.activity.followRoute = routeToFollow || null;
    state.activity.followRouteCumKm = routeToFollow ? buildCumulativeRouteKm(routeToFollow.points) : null;
    state.activity.followRouteLastIndex = null;
    state.activity.offRouteAlerted = false;
    state.activity.status = 'recording';
    state.activity.startedAt = Date.now();
    state.activity.pausedAt = null;
    state.activity.pausedMs = 0;
    state.activity.finishedAt = null;
    state.activity.points = [];
    state.activity.distanceKm = 0;
    state.activity.currentSpeed = 0;
    const activityProfile = getActivityProfile();
    state.activity.name = routeToFollow
      ? `${routeToFollow.name} · ${activityProfile.label} · ${new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}`
      : `${activityProfile.label} ${new Date().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}`;
    state.activity.line = L.polyline([], { color:'#fb7185', weight:5, opacity:.96 }).addTo(state.map);
    startLocation(false);
    if (state.location) recordActivityPoint(state.location, true);
    clearInterval(state.activity.timer);
    state.activity.timer = setInterval(updateActivityUI, 1000);
    updateActivityUI();
    if (routeToFollow) {
      drawRoute(false);
      setAlert('safe', '🧭', 'Suivi du GPX en cours', `${routeToFollow.name} · le tracé bleu reste affiché et ta trace réelle est enregistrée en rose.`);
      toast(`Parcours démarré : ${routeToFollow.name}`);
      setTimeout(() => { if (state.routeLine) state.map.fitBounds(state.routeLine.getBounds(), { padding: [34, 34] }); }, 100);
    } else {
      setAlert('safe', '▶️', 'Activité en cours', 'La trace GPS est enregistrée. La carte reste libre : ◎ te recentre sur ta position.');
      toast('Enregistrement GPS démarré.');
    }

    // Prépare automatiquement une carte de secours sans retarder le démarrage.
    // Le GPX entier est couvert lorsqu'un parcours est suivi ; sinon on utilise
    // une zone de 5 km autour du point de départ dès que le GPS est disponible.
    if (navigator.onLine) {
      if (routeToFollow) autoPrepareOfflineForActivity(routeToFollow).catch(() => {});
      else if (state.location) autoPrepareOfflineForActivity(null).catch(() => {});
      else state.offline.pendingActivityPrepare = true;
    }
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
      const maxPlausible = getActivityProfile().maxPlausible;
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
    openFinishActivityModal();
  }

  function openFinishActivityModal() {
    if (!ui.finishActivityModal) return;
    ui.finishActivityModal.classList.remove('hidden');
    document.body.classList.add('activity-choice-open');
    setTimeout(() => ui.finishSaveBtn?.focus(), 30);
  }

  function closeFinishActivityModal() {
    if (!ui.finishActivityModal) return;
    ui.finishActivityModal.classList.add('hidden');
    document.body.classList.remove('activity-choice-open');
  }

  function finalizeActivity(keepTrack) {
    if (!['recording','paused'].includes(state.activity.status)) {
      closeFinishActivityModal();
      return;
    }

    if (state.activity.status === 'paused' && state.activity.pausedAt) {
      state.activity.pausedMs += Date.now() - state.activity.pausedAt;
      state.activity.pausedAt = null;
    }

    clearInterval(state.activity.timer);
    state.activity.timer = null;
    state.activity.targetSelect = false;
    state.activity.currentSpeed = 0;
    closeFinishActivityModal();

    if (keepTrack) {
      state.activity.finishedAt = Date.now();
      state.activity.status = 'finished';
      updateActivityUI();
      syncActivityMapPanel();
      setAlert('safe', '🏁', 'Activité terminée', `${state.activity.distanceKm.toFixed(2)} km conservés. Tu peux exporter la trace en GPX.`);
      toast('Activité enregistrée. Trace prête à exporter.');
      return;
    }

    clearActivityTarget();
    clearActivityTrack();
    const previousMode = state.activity.mode;
    state.activity.status = 'idle';
    state.activity.startedAt = null;
    state.activity.pausedAt = null;
    state.activity.pausedMs = 0;
    state.activity.finishedAt = null;
    state.activity.points = [];
    state.activity.distanceKm = 0;
    state.activity.currentSpeed = 0;
    state.activity.name = '';
    state.activity.followRoute = null;
    state.activity.followRouteCumKm = null;
    state.activity.followRouteLastIndex = null;
    state.activity.offRouteAlerted = false;
    state.activity.mode = previousMode;
    updateActivityUI();
    syncActivityMapPanel();
    hideRouteFollowGuide();
    setAlert('neutral', '🧭', 'Activité terminée', 'La trace n’a pas été enregistrée.');
    toast('Activité terminée sans enregistrer la trace.');
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
      ui.activityHelp.textContent = 'Choisis randonnée, vélo route, gravel ou VTT, puis démarre. La trace sera dessinée en direct sur la carte.';
      hideRouteFollowGuide();
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

    const activityProfile = getActivityProfile(a.mode);
    ui.activityTitle.textContent = a.status === 'finished' ? a.name : `${activityProfile.label} en cours`;
    ui.activityDistance.textContent = distance;
    ui.activityTime.textContent = time;
    ui.activitySpeed.textContent = speed;
    ui.activityAvgSpeed.textContent = avgSpeed;
    ui.activityStats.classList.remove('hidden');

    if (a.status === 'finished') {
      ui.activityStartBtn.textContent = '▶ Nouvelle activité';
      ui.activityExportBtn.classList.toggle('hidden', a.points.length < 2);
      ui.activityHelp.textContent = a.followRoute
        ? `Parcours suivi : ${a.followRoute.name}. Activité terminée, tu peux exporter ta trace réelle en GPX.`
        : 'Activité terminée. Exporte le GPX pour la conserver ou l’envoyer vers Garmin Connect.';
    } else {
      ui.activityStartBtn.textContent = '🗺️ Ouvrir la carte';
      ui.activityExportBtn.classList.add('hidden');
      ui.activityHelp.textContent = a.status === 'paused'
        ? 'Activité en pause.'
        : (a.followRoute ? `Suivi du GPX « ${a.followRoute.name} » en cours.` : 'Enregistrement GPS en cours. Le déplacement de la carte ne coupe pas le suivi.');
    }

    ui.activityMapTitle.textContent = `${activityProfile.icon} ${activityProfile.label}`;
    ui.activityMapStatus.textContent = a.status === 'paused' ? 'EN PAUSE' : 'GPS · enregistrement';
    ui.activityMapDistance.textContent = distance;
    ui.activityMapTime.textContent = time;
    ui.activityMapSpeed.textContent = speed;
    ui.activityPauseBtn.textContent = a.status === 'paused' ? '▶' : '⏸';
    ui.activityPauseBtn.setAttribute('aria-label', a.status === 'paused' ? 'Reprendre' : 'Mettre en pause');
    syncActivityMapPanel();
    if (a.followRoute && state.location) updateRouteFollowGuide(state.location);
    else if (!a.followRoute) hideRouteFollowGuide();
    if (a.target) updateTargetGuide();
  }

  function activityMainButton() {
    if (state.activity.status === 'idle' || state.activity.status === 'finished') {
      startActivity();
      return;
    }
    showAppScreen('map', { scroll: false });
    setTimeout(() => enterMapFullscreen(), 60);
  }

  function exportActivity() {
    if (state.activity.points.length < 2) return;
    downloadGpx(state.activity.name || 'Activité', state.activity.points, 'activity', getActivityProfile().label);
  }

  function syncActivityMapPanel() {
    const active = ['recording','paused'].includes(state.activity.status);
    ui.activityMapPanel.classList.toggle('hidden', !(active && state.mapFullscreen));
    ui.mapWrap.classList.toggle('activity-active', active && state.mapFullscreen);
    if (!(active && state.mapFullscreen)) hideRouteFollowGuide();
  }

  function updateRouteFollowGuide(loc) {
    const route = state.activity.followRoute;
    const cum = state.activity.followRouteCumKm;
    if (!route || !cum || !loc || !route.points?.length) {
      ui.routeFollowGuide?.classList.add('hidden');
      return;
    }

    let bestIndex = 0;
    let bestKm = Infinity;
    for (let i = 0; i < route.points.length; i++) {
      const d = haversine(loc, route.points[i]);
      if (d < bestKm) {
        bestKm = d;
        bestIndex = i;
      }
    }

    state.activity.followRouteLastIndex = bestIndex;
    const travelledOnRoute = cum[bestIndex] || 0;
    const total = route.distanceKm || cum[cum.length - 1] || 0;
    const remaining = Math.max(0, total - travelledOnRoute);
    const progress = total > 0 ? Math.min(100, Math.max(0, travelledOnRoute / total * 100)) : 0;
    const deviationM = Math.round(bestKm * 1000);
    const threshold = getActivityProfile(state.activity.mode).offRouteM;

    ui.routeFollowGuide.classList.remove('hidden');
    ui.routeFollowName.textContent = route.name || 'Parcours';
    ui.routeFollowRemaining.textContent = `${remaining.toFixed(1).replace('.', ',')} km`;
    ui.routeFollowProgress.textContent = `${Math.round(progress)} %`;
    ui.routeFollowDeviation.textContent = `${deviationM} m`;
    updateElevationChartProgress('current-route', progress / 100);
    ui.routeFollowGuide.classList.toggle('off-route', deviationM > threshold);

    if (deviationM > threshold && !state.activity.offRouteAlerted) {
      state.activity.offRouteAlerted = true;
      toast(`⚠️ Tu es à environ ${deviationM} m du tracé GPX.`);
    } else if (deviationM <= Math.round(threshold * 0.65)) {
      state.activity.offRouteAlerted = false;
    }

    if (remaining < 0.05 && deviationM < threshold) {
      ui.routeFollowRemaining.textContent = 'Arrivée';
    }
  }

  function hideRouteFollowGuide() {
    ui.routeFollowGuide?.classList.add('hidden');
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
    const navSpeed = a.currentSpeed >= 1 ? a.currentSpeed : getActivityProfile(a.mode).navSpeed;
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

  function downloadGpx(name, points, type = 'route', activityType = '') {
    const safeName = (name || 'Rando Radar').replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Rando-Radar';
    const trkpts = points.map(p => {
      const ele = Number.isFinite(Number(p.ele)) ? `<ele>${Number(p.ele).toFixed(1)}</ele>` : '';
      const time = p.time ? `<time>${new Date(p.time).toISOString()}</time>` : '';
      return `      <trkpt lat="${Number(p.lat).toFixed(7)}" lon="${Number(p.lon).toFixed(7)}">${ele}${time}</trkpt>`;
    }).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Rando Radar" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${xmlEscape(name || safeName)}</name></metadata>\n  <trk><name>${xmlEscape(name || safeName)}</name><type>${xmlEscape(type === 'activity' ? (activityType || 'activity') : 'route')}</type><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;
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

  const APP_SCREEN_NAMES = new Set(['map','activity','routes','weather','info']);
  let currentAppScreen = 'map';

  function showAppScreen(name, options = {}) {
    if (!APP_SCREEN_NAMES.has(name)) name = 'map';
    const { scroll = true } = options;
    currentAppScreen = name;

    document.querySelectorAll('.app-screen[data-screen]').forEach(screen => {
      const active = screen.dataset.screen === name;
      screen.classList.toggle('active', active);
      screen.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    document.querySelectorAll('[data-nav]').forEach(btn => {
      const active = btn.dataset.nav === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (name === 'activity') openActivityCard();
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });

    // Leaflet a besoin de recalculer sa taille après avoir été masqué.
    if (name === 'map') {
      setTimeout(() => {
        state.map?.invalidateSize();
        if (state.location && !state.mapFullscreen) {
          // On ne recentre pas : on conserve la position de carte choisie par l'utilisateur.
        }
      }, 60);
    }
  }


  // ---------- Cartes hors ligne v1.9.1 ----------
  const OFFLINE_DB_NAME = 'randoRadar.offline.v1';
  const OFFLINE_STORE = 'areas';

  function formatOfflineDate(ts) {
    if (!ts) return '--';
    try { return new Date(ts).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch (_) { return '--'; }
  }

  function openOfflineDB() {
    if (state.offline.db) return Promise.resolve(state.offline.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(OFFLINE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => { state.offline.db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error || new Error('Stockage hors ligne indisponible'));
    });
  }

  async function offlineDbGetAll() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a,b) => (b.createdAt||0)-(a.createdAt||0)));
      req.onerror = () => reject(req.error);
    });
  }

  async function offlineDbPut(item) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error || new Error('Enregistrement impossible'));
    });
  }

  async function offlineDbDelete(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function setOfflineProgress(show, title = 'Préparation…', text = '') {
    if (!offlineUI.progress) return;
    offlineUI.progress.classList.toggle('hidden', !show);
    if (offlineUI.progressTitle) offlineUI.progressTitle.textContent = title;
    if (offlineUI.progressText) offlineUI.progressText.textContent = text;
  }

  function updateOfflineNetworkBadge() {
    if (!offlineUI.networkBadge) return;
    const off = !navigator.onLine || !!state.offline.activePackage;
    offlineUI.networkBadge.textContent = off ? '📴 Hors ligne' : '🌐 En ligne';
    offlineUI.networkBadge.classList.toggle('offline', off);
    offlineUI.backOnlineBtn?.classList.toggle('hidden', !state.offline.activePackage || !navigator.onLine);
  }

  function routeSamplesForOffline(points, bufferKm) {
    const valid = (points || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)));
    if (valid.length <= 2) return valid;
    const total = routeDistance(valid);
    const spacing = Math.max(.8, Math.max(bufferKm * 1.35, total / 16));
    const out = [valid[0]];
    let acc = 0, target = spacing;
    for (let i=1; i<valid.length; i++) {
      acc += haversine(valid[i-1], valid[i]);
      if (acc >= target) { out.push(valid[i]); target += spacing; }
    }
    const last = valid[valid.length-1];
    if (out[out.length-1] !== last) out.push(last);
    if (out.length > 18) {
      const step = (out.length - 1) / 17;
      return Array.from({length:18}, (_,i) => out[Math.round(i*step)]);
    }
    return out;
  }

  function buildOfflineOverpassQuery(points, radiusM) {
    const safePoints = points.slice(0,18);
    const selectors = [];
    for (const p of safePoints) {
      const at = `${radiusM},${Number(p.lat).toFixed(6)},${Number(p.lon).toFixed(6)}`;
      selectors.push(`way(around:${at})["highway"];`);
      selectors.push(`way(around:${at})["waterway"];`);
      selectors.push(`way(around:${at})["natural"="water"];`);
      selectors.push(`way(around:${at})["landuse"~"^(forest|meadow|grass|farmland|orchard)$"];`);
      selectors.push(`way(around:${at})["leisure"="nature_reserve"];`);
      selectors.push(`node(around:${at})["place"~"^(village|hamlet|locality)$"];`);
      selectors.push(`node(around:${at})["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|information)$"];`);
      selectors.push(`node(around:${at})["amenity"~"^(drinking_water|parking|shelter)$"];`);
    }
    return `[out:json][timeout:65];(${selectors.join('')});out body geom qt;`;
  }


  async function fetchOfflineElementsSegmented(samples, radiusM) {
    const merged = new Map();
    const chunks = [];
    for (let i=0; i<samples.length; i+=4) chunks.push(samples.slice(i,i+4));
    for (let i=0; i<chunks.length; i++) {
      setOfflineProgress(true, 'Téléchargement de la carte…', `Zone ${i+1} sur ${chunks.length} le long du parcours.`);
      const data = await fetchOverpass(buildOfflineOverpassQuery(chunks[i], radiusM), 62000);
      for (const el of data.elements || []) merged.set(`${el.type}:${el.id}`, el);
    }
    return { elements:[...merged.values()] };
  }

  function thinOfflineGeometry(geom) {
    const pts = (geom || []).map(g => [Number(g.lat), Number(g.lon)]).filter(a => Number.isFinite(a[0]) && Number.isFinite(a[1]));
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let last = { lat: pts[0][0], lon: pts[0][1] };
    for (let i=1; i<pts.length-1; i++) {
      const p = { lat: pts[i][0], lon: pts[i][1] };
      if (haversine(last, p) >= .012) { out.push(pts[i]); last = p; }
    }
    out.push(pts[pts.length-1]);
    return out;
  }

  function compactOfflineElements(data) {
    const out = [];
    const seen = new Set();
    for (const el of data.elements || []) {
      const key = `${el.type}:${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tags = el.tags || {};
      if (el.type === 'way' && Array.isArray(el.geometry)) {
        const geometry = thinOfflineGeometry(el.geometry);
        if (geometry.length < 2) continue;
        const keepTags = {};
        for (const k of ['name','ref','highway','surface','tracktype','waterway','natural','landuse','leisure','bicycle','foot','access']) if (tags[k] != null) keepTags[k] = tags[k];
        out.push({ type:'way', id:Number(el.id), geometry, tags:keepTags });
      } else if (el.type === 'node' && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon))) {
        const keepTags = {};
        for (const k of ['name','place','tourism','amenity','ref']) if (tags[k] != null) keepTags[k] = tags[k];
        out.push({ type:'node', id:Number(el.id), lat:Number(el.lat), lon:Number(el.lon), tags:keepTags });
      }
    }
    return out;
  }

  function offlineBoundsFromData(features, route) {
    let south=90, west=180, north=-90, east=-180;
    const add=(lat,lon)=>{ if(!Number.isFinite(lat)||!Number.isFinite(lon)) return; south=Math.min(south,lat); north=Math.max(north,lat); west=Math.min(west,lon); east=Math.max(east,lon); };
    for (const f of features || []) {
      if (f.type === 'node') add(f.lat,f.lon);
      else for (const pt of f.geometry || []) add(pt[0],pt[1]);
    }
    for (const p of route?.points || []) add(Number(p.lat),Number(p.lon));
    return south <= north ? [south,west,north,east] : null;
  }

  function offlineFeatureClass(tags={}) {
    if (tags.natural === 'water') return 'water';
    if (tags.landuse || tags.leisure === 'nature_reserve') return 'land';
    if (tags.waterway) return 'waterway';
    const hw = String(tags.highway || '');
    if (['motorway','trunk','primary','secondary','tertiary'].includes(hw)) return 'major-road';
    if (['residential','unclassified','service','living_street','road'].includes(hw)) return 'road';
    if (['cycleway'].includes(hw)) return 'cycleway';
    if (['track'].includes(hw)) return 'track';
    if (['path','footway','bridleway','steps','pedestrian'].includes(hw)) return 'trail';
    return 'other';
  }

  function offlineStyleFor(feature) {
    const cls = offlineFeatureClass(feature.tags);
    if (cls === 'water') return { color:'#8abbd9', weight:1, fillColor:'#b9ddec', fillOpacity:.72 };
    if (cls === 'land') return { color:'#b7cbb3', weight:.6, fillColor:'#dfead8', fillOpacity:.55 };
    if (cls === 'waterway') return { color:'#65a9d2', weight:1.8, opacity:.85 };
    if (cls === 'major-road') return { color:'#7c8791', weight:3.2, opacity:.9 };
    if (cls === 'road') return { color:'#9aa3aa', weight:2.2, opacity:.85 };
    if (cls === 'cycleway') return { color:'#4b8f79', weight:2.4, opacity:.9, dashArray:'7 4' };
    if (cls === 'track') return { color:'#92724f', weight:2, opacity:.86, dashArray:'6 5' };
    if (cls === 'trail') return { color:'#7a6e61', weight:1.7, opacity:.82, dashArray:'3 5' };
    return { color:'#b0b5b8', weight:1.2, opacity:.65 };
  }

  function drawOfflinePackage(pkg, fit = true) {
    if (!pkg) return;
    if (state.offline.layerGroup) state.map.removeLayer(state.offline.layerGroup);
    const group = L.layerGroup().addTo(state.map);
    state.offline.layerGroup = group;

    const features = pkg.features || [];
    // Les surfaces d'abord pour que routes et sentiers restent lisibles.
    const sorted = features.slice().sort((a,b) => {
      const rank = f => f.type === 'node' ? 3 : (['water','land'].includes(offlineFeatureClass(f.tags)) ? 0 : 1);
      return rank(a)-rank(b);
    });
    for (const f of sorted) {
      if (f.type === 'way') {
        const cls = offlineFeatureClass(f.tags);
        const latlngs = f.geometry;
        let layer;
        const closed = latlngs.length > 2 && Math.abs(latlngs[0][0]-latlngs[latlngs.length-1][0]) < 1e-7 && Math.abs(latlngs[0][1]-latlngs[latlngs.length-1][1]) < 1e-7;
        if (closed && ['water','land'].includes(cls)) layer = L.polygon(latlngs, offlineStyleFor(f));
        else layer = L.polyline(latlngs, offlineStyleFor(f));
        const name = f.tags?.name || f.tags?.ref;
        if (name) layer.bindTooltip(escapeHtml(name), { sticky:true, className:'offline-map-label', direction:'top' });
        layer.addTo(group);
      } else if (f.type === 'node') {
        const t = f.tags || {};
        const name = t.name || ({drinking_water:'Eau potable',parking:'Parking',shelter:'Abri'})[t.amenity] || ({alpine_hut:'Refuge',wilderness_hut:'Abri',viewpoint:'Point de vue'})[t.tourism] || t.place;
        if (t.place && name) {
          const icon = L.divIcon({ className:'', html:`<div class="offline-place-label">${escapeHtml(name)}</div>`, iconSize:[100,20], iconAnchor:[50,10] });
          L.marker([f.lat,f.lon], { icon, interactive:false, zIndexOffset:250 }).addTo(group);
        } else {
          const symbol = t.amenity === 'drinking_water' ? '💧' : t.amenity === 'parking' ? '🅿️' : (t.tourism?.includes('hut') ? '🏠' : t.tourism === 'viewpoint' ? '👁️' : '•');
          const marker = L.circleMarker([f.lat,f.lon], { radius:4.5, color:'#526474', weight:1, fillColor:'#fff', fillOpacity:.95 });
          if (name) marker.bindTooltip(`${symbol} ${escapeHtml(name)}`, { direction:'top', className:'offline-map-label' });
          marker.addTo(group);
        }
      }
    }
    state.routeLine?.bringToFront?.();
    state.activity.line?.bringToFront?.();
    if (fit && pkg.bbox) state.map.fitBounds([[pkg.bbox[0],pkg.bbox[1]],[pkg.bbox[2],pkg.bbox[3]]], { padding:[22,22] });
  }

  function setOnlineBaseVisible(visible) {
    for (const layer of Object.values(state.baseLayers)) if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
    if (visible && state.baseLayers[state.activeBase]) state.baseLayers[state.activeBase].addTo(state.map);
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.disabled = !visible);
  }

  function setOfflineMapStatusVisible(visible) {
    let badge = document.getElementById('offlineMapStatus');
    if (visible && !badge) {
      badge = document.createElement('div'); badge.id='offlineMapStatus'; badge.className='offline-status-map'; badge.textContent='📴 Carte hors ligne';
      ui.mapWrap.appendChild(badge);
    } else if (!visible && badge) badge.remove();
  }

  function activateOfflinePackage(pkg, { fit = true, forced = true } = {}) {
    if (!pkg) return;
    state.offline.activePackage = pkg;
    state.offline.forced = forced;
    setOnlineBaseVisible(false);
    if (state.radarLayer && state.map.hasLayer(state.radarLayer)) state.map.removeLayer(state.radarLayer);
    ui.radarPanel.classList.add('hidden');
    ui.radarToggle.classList.remove('active');
    ui.radarTime.textContent = 'Radar hors ligne';
    document.getElementById('map')?.classList.add('offline-vector-map');
    drawOfflinePackage(pkg, fit);
    setOfflineMapStatusVisible(true);
    if (!state.offline.attributionAdded && state.map.attributionControl) {
      state.map.attributionControl.addAttribution('Carte hors ligne © OpenStreetMap contributors');
      state.offline.attributionAdded = true;
    }
    if (offlineUI.current && offlineUI.currentName) {
      offlineUI.current.classList.remove('hidden'); offlineUI.currentName.textContent = pkg.name || 'Carte locale';
    }
    if (pkg.route?.points?.length && (!state.route || state.route.name !== pkg.route.name)) {
      state.route = JSON.parse(JSON.stringify(pkg.route));
      drawRoute(false);
      renderRouteStats();
    }
    state.routeLine?.bringToFront?.();
    state.activity.line?.bringToFront?.();
    if (pkg.weather) {
      state.lastWeather = pkg.weather;
      renderCurrentWeather(pkg.weather); renderHourly(pkg.weather);
      if (ui.weatherUpdatedAt) ui.weatherUpdatedAt.textContent = `Météo enregistrée : ${formatOfflineDate(pkg.weatherSavedAt)}`;
    }
    updateOfflineNetworkBadge();
  }

  function deactivateOfflineMap({ restoreOnline = true } = {}) {
    if (state.offline.layerGroup) state.map.removeLayer(state.offline.layerGroup);
    state.offline.layerGroup = null;
    state.offline.activePackage = null;
    state.offline.forced = false;
    document.getElementById('map')?.classList.remove('offline-vector-map');
    setOfflineMapStatusVisible(false);
    if (state.offline.attributionAdded && state.map.attributionControl) {
      state.map.attributionControl.removeAttribution('Carte hors ligne © OpenStreetMap contributors');
      state.offline.attributionAdded = false;
    }
    if (offlineUI.current) offlineUI.current.classList.add('hidden');
    if (restoreOnline && navigator.onLine) {
      setOnlineBaseVisible(true);
      ui.radarPanel.classList.toggle('hidden', !state.radarEnabled);
      ui.radarToggle.classList.toggle('active', state.radarEnabled);
      loadRadar();
    }
    updateOfflineNetworkBadge();
  }

  function bboxContains(bbox, p) {
    return !!bbox && !!p && p.lat >= bbox[0] && p.lat <= bbox[2] && p.lon >= bbox[1] && p.lon <= bbox[3];
  }

  async function chooseOfflinePackageForCurrentPosition() {
    try {
      const list = await offlineDbGetAll();
      if (!list.length) return null;
      const p = state.location;
      return (p && list.find(x => bboxContains(x.bbox,p))) || (state.route && list.find(x => x.route?.name === state.route.name)) || list[0];
    } catch (_) { return null; }
  }

  async function handleOfflineNetworkLoss() {
    updateOfflineNetworkBadge();
    if (state.offline.activePackage) return;
    const pkg = await chooseOfflinePackageForCurrentPosition();
    if (pkg) {
      activateOfflinePackage(pkg, { fit:false, forced:false });
      toast(`Mode hors ligne : ${pkg.name}`);
    } else {
      setOnlineBaseVisible(false);
      setOfflineMapStatusVisible(true);
      ui.radarPanel.classList.add('hidden');
      toast('Hors ligne : aucune carte locale disponible ici.');
    }
  }

  async function handleOnlineReturn() {
    updateOfflineNetworkBadge();
    if (state.offline.activePackage && state.offline.forced) return;
    deactivateOfflineMap({ restoreOnline:true });
    toast('Connexion retrouvée : carte en ligne réactivée.');
  }

  function offlineFeatureSummary(features) {
    let roads=0,trails=0,water=0,pois=0;
    for (const f of features || []) {
      if (f.type === 'node') { pois++; continue; }
      const c=offlineFeatureClass(f.tags); if (['major-road','road','cycleway'].includes(c)) roads++; else if (['track','trail'].includes(c)) trails++; else if (['water','waterway'].includes(c)) water++;
    }
    return `${roads} routes · ${trails} sentiers/pistes · ${water} éléments d’eau · ${pois} points utiles`;
  }

  async function existingOfflinePackageFor(route, loc) {
    try {
      const list = await offlineDbGetAll();
      if (route?.points?.length) {
        // Une carte est considérée comme suffisante si elle couvre tout le tracé.
        return list.find(pkg => pkg.bbox && route.points.every(p => bboxContains(pkg.bbox, p))) || null;
      }
      if (loc) return list.find(pkg => bboxContains(pkg.bbox, loc)) || null;
    } catch (_) {}
    return null;
  }

  async function createOfflinePackage({ route = null, loc = null, bufferKm = 3, automatic = false } = {}) {
    if (state.offline.preparing) return null;
    if (!navigator.onLine) return null;

    bufferKm = Math.max(1, Math.min(5, Number(bufferKm || 3)));
    let samples = [], name = '', source = route ? 'route' : 'position';

    if (route?.points?.length) {
      route = JSON.parse(JSON.stringify(route));
      samples = routeSamplesForOffline(route.points, bufferKm);
      name = `🗺️ ${route.name}`;
    } else {
      loc = loc || state.location;
      if (!loc) return null;
      samples = [{ lat:Number(loc.lat), lon:Number(loc.lon) }];
      name = `📍 Zone ${Number(loc.lat).toFixed(3)}, ${Number(loc.lon).toFixed(3)}`;
    }

    const existing = await existingOfflinePackageFor(route, loc);
    if (existing) {
      if (automatic) toast('✓ Carte hors ligne déjà disponible pour cette sortie.');
      return existing;
    }

    state.offline.preparing = true;
    if (offlineUI.prepareBtn) offlineUI.prepareBtn.disabled = true;
    setOfflineProgress(true,
      automatic ? 'Sécurisation hors ligne…' : 'Préparation de la carte…',
      automatic ? 'L’activité continue pendant le téléchargement de la carte de secours.' : 'Téléchargement des routes, pistes, sentiers et points utiles OpenStreetMap.'
    );
    if (automatic) toast('⬇️ Préparation de la carte hors ligne en arrière-plan…');

    try {
      if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch (_) {} }
      const data = await fetchOfflineElementsSegmented(samples, Math.round(bufferKm * 1000));
      setOfflineProgress(true, 'Optimisation…', 'Réduction des données pour économiser l’espace du téléphone.');
      const features = compactOfflineElements(data);
      if (!features.length) throw new Error('Aucune donnée cartographique trouvée dans cette zone.');
      const bbox = offlineBoundsFromData(features, route);
      const now = Date.now();
      const center = samples[Math.floor(samples.length / 2)];
      if (center && navigator.onLine) await loadWeather(center.lat, center.lon, { silent:true });
      const pkg = {
        id:`offline-${now}-${Math.random().toString(36).slice(2,7)}`,
        name, createdAt:now, bufferKm, source, bbox, center,
        features, route,
        automatic: !!automatic,
        weather: state.lastWeather ? JSON.parse(JSON.stringify(state.lastWeather)) : null,
        weatherSavedAt: state.lastWeather ? Date.now() : null,
        summary: offlineFeatureSummary(features)
      };
      pkg.approxBytes = new Blob([JSON.stringify(pkg)]).size;
      await offlineDbPut(pkg);
      await renderOfflineAreas();
      setOfflineProgress(false);
      toast(automatic
        ? `✓ Carte hors ligne prête pour la sortie · ${(pkg.approxBytes/1024/1024).toFixed(1).replace('.',',')} Mo`
        : `Carte hors ligne prête · ${(pkg.approxBytes/1024/1024).toFixed(1).replace('.',',')} Mo`);
      return pkg;
    } catch (err) {
      setOfflineProgress(false);
      if (automatic) toast('⚠️ Carte hors ligne non préparée. L’activité continue normalement.');
      else toast(err?.message || 'Impossible de préparer la carte hors ligne.');
      return null;
    } finally {
      state.offline.preparing = false;
      if (offlineUI.prepareBtn) offlineUI.prepareBtn.disabled = false;
    }
  }

  async function autoPrepareOfflineForActivity(routeToFollow = null) {
    if (!navigator.onLine) return null;
    if (routeToFollow?.points?.length) {
      return createOfflinePackage({ route:routeToFollow, bufferKm:3, automatic:true });
    }
    const loc = state.location;
    if (!loc) {
      state.offline.pendingActivityPrepare = true;
      return null;
    }
    return createOfflinePackage({ loc, bufferKm:5, automatic:true });
  }

  async function prepareOfflineArea() {
    if (state.offline.preparing) return;
    if (!navigator.onLine) { toast('Connecte-toi pour préparer une nouvelle carte hors ligne.'); return; }
    const source = offlineUI.sourceSelect?.value || 'route';
    const bufferKm = Math.max(1, Math.min(5, Number(offlineUI.bufferSelect?.value || 3)));

    if (source === 'route') {
      if (!state.route?.points?.length) { toast('Charge d’abord un GPX ou un parcours.'); return; }
      await createOfflinePackage({ route:state.route, bufferKm, automatic:false });
      return;
    }

    let loc = state.location;
    if (!loc && 'geolocation' in navigator) {
      try {
        const pos = await new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:3000,timeout:12000}));
        loc = { lat:pos.coords.latitude, lon:pos.coords.longitude };
      } catch (_) {}
    }
    if (!loc) { toast('Position GPS indisponible.'); return; }
    await createOfflinePackage({ loc, bufferKm, automatic:false });
  }

  async function renderOfflineAreas() {
    if (!offlineUI.list) return;
    try {
      const list = await offlineDbGetAll();
      if (!list.length) { offlineUI.list.innerHTML = '<div class="skeleton">Aucune carte hors ligne enregistrée.</div>'; return; }
      offlineUI.list.innerHTML = list.map(x => `
        <div class="offline-item" data-offline-id="${escapeHtml(x.id)}">
          <div class="offline-item-main"><strong>${escapeHtml(x.name || 'Carte locale')}</strong><small>${escapeHtml(x.summary || '')}<br>${formatOfflineDate(x.createdAt)} · ${x.bufferKm || 0} km de marge · ${((x.approxBytes||0)/1024/1024).toFixed(1).replace('.',',')} Mo</small></div>
          <div class="offline-item-actions">
            <button type="button" class="offline-use" data-offline-action="use" title="Utiliser la carte">🗺️</button>
            ${x.route ? '<button type="button" data-offline-action="route" title="Charger le parcours">GPX</button>' : ''}
            <button type="button" class="offline-delete" data-offline-action="delete" title="Supprimer">✕</button>
          </div>
        </div>`).join('');
    } catch (_) {
      offlineUI.list.innerHTML = '<div class="skeleton">Stockage hors ligne indisponible.</div>';
    }
  }

  async function handleOfflineListAction(e) {
    const btn=e.target.closest('[data-offline-action]'); const row=e.target.closest('[data-offline-id]');
    if(!btn||!row)return;
    const list=await offlineDbGetAll(); const pkg=list.find(x=>x.id===row.dataset.offlineId); if(!pkg)return;
    if(btn.dataset.offlineAction==='use') {
      activateOfflinePackage(pkg,{fit:true,forced:true}); showAppScreen('map',{scroll:false}); setTimeout(()=>state.map.invalidateSize(),50);
    } else if(btn.dataset.offlineAction==='route' && pkg.route) {
      state.route=JSON.parse(JSON.stringify(pkg.route)); drawRoute(true); renderRouteStats(); showAppScreen('routes'); toast(`Parcours chargé : ${pkg.route.name}`);
    } else if(btn.dataset.offlineAction==='delete') {
      if(!window.confirm(`Supprimer la carte hors ligne « ${pkg.name} » ?`))return;
      if(state.offline.activePackage?.id===pkg.id) deactivateOfflineMap({restoreOnline:navigator.onLine});
      await offlineDbDelete(pkg.id); await renderOfflineAreas();
    }
  }

  function bindOfflineEvents() {
    offlineUI.prepareBtn?.addEventListener('click', prepareOfflineArea);
    offlineUI.backOnlineBtn?.addEventListener('click', () => deactivateOfflineMap({restoreOnline:true}));
    offlineUI.list?.addEventListener('click', handleOfflineListAction);
    window.addEventListener('offline', handleOfflineNetworkLoss);
    window.addEventListener('online', handleOnlineReturn);
    updateOfflineNetworkBadge();
    renderOfflineAreas();
  }

  function bindEvents() {
    document.querySelectorAll('[data-basemap]').forEach(btn => btn.addEventListener('click', () => switchBase(btn.dataset.basemap)));
    ui.radarToggle.addEventListener('click', toggleRadar);
    ui.radarSlider.addEventListener('input', e => showRadarFrame(Number(e.target.value)));
    ui.radarPlay.addEventListener('click', toggleRadarAnimation);
    ui.locateBtn.addEventListener('click', () => startLocation(true));
    ui.mapLocateBtn.addEventListener('click', e => { e.stopPropagation(); startLocation(true); });
    ui.mapCloseBtn.addEventListener('click', e => { e.stopPropagation(); if (state.hikeFinder.active) stopHikeFinder(true); exitMapFullscreen(); });
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
    ui.routeStartBtn.addEventListener('click', startSelectedRouteActivity);
    ui.routeShowBtn.addEventListener('click', showCurrentRouteOnMap);
    ui.analyzeBtn.addEventListener('click', analyzeRoute);
    ui.refreshWeatherBtn.addEventListener('click', refreshWeatherNow);

    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      if (state.route && !ui.routeForecast.classList.contains('hidden')) analyzeRoute();
    }));

    ui.createRouteBtn.addEventListener('click', startPlanner);
    document.getElementById('routesCreateBtn')?.addEventListener('click', startPlanner);
    ui.routesFindHikesBtn?.addEventListener('click', startHikeFinder);
    ui.hikeFinderNewSearchBtn?.addEventListener('click', startHikeFinder);
    ui.hikeFinderCloseBtn?.addEventListener('click', () => { stopHikeFinder(true); exitMapFullscreen(); });
    ui.finderMapDetailClose?.addEventListener('click', closeFinderMapDetail);
    ui.finderDetailClose?.addEventListener('click', closeFinderDetailCard);
    ui.finderMapDetail?.querySelector('.finder-detail-actions')?.addEventListener('click', handleFinderDetailAction);
    ui.finderDetailCard?.querySelector('.finder-detail-card-actions')?.addEventListener('click', handleFinderDetailAction);
    ui.hikeFinderGpsBtn?.addEventListener('click', useGpsForHikeFinder);
    ui.hikeFinderListBtn?.addEventListener('click', () => {
      stopHikeFinder(true);
      exitMapFullscreen();
      showAppScreen('routes');
    });
    document.querySelectorAll('[data-hike-profile]').forEach(btn => btn.addEventListener('click', () => {
      const profile = btn.dataset.hikeProfile;
      if (!FINDER_PROFILES[profile]) return;
      if (state.hikeFinder.loading) {
        state.hikeFinder.requestSerial++;
        state.hikeFinder.loading = false;
      }
      state.hikeFinder.profile = profile;
      state.hikeFinder.results = [];
      state.hikeFinder.selectedIndex = -1;
      document.querySelectorAll('[data-hike-profile]').forEach(b => b.classList.toggle('active', b === btn));
      if (state.hikeFinder.resultLayer) state.map.removeLayer(state.hikeFinder.resultLayer);
      state.hikeFinder.resultLayer = null;
      state.hikeFinder.mapLines = [];
      renderHikeFinderResults();
      renderHikeFinderMapResults();
      const fp = getFinderProfile(profile);
      ui.hikeFinderStatus.textContent = `${fp.icon} ${fp.label} · touchez la carte ou utilisez Ma position.`;
      if (state.hikeFinder.center) searchHikesAround(state.hikeFinder.center);
    }));
    document.querySelectorAll('[data-hike-radius]').forEach(btn => btn.addEventListener('click', () => {
      const radius = Number(btn.dataset.hikeRadius);
      if (![2,5,10,20].includes(radius)) return;
      if (state.hikeFinder.loading) {
        state.hikeFinder.requestSerial++;
        state.hikeFinder.loading = false;
      }
      state.hikeFinder.radiusKm = radius;
      document.querySelectorAll('[data-hike-radius]').forEach(b => b.classList.toggle('active', b === btn));
      if (state.hikeFinder.center) searchHikesAround(state.hikeFinder.center);
    }));
    ui.hikeFinderMapResults?.addEventListener('click', e => {
      const btn = e.target.closest('[data-hike-map-index]');
      if (!btn) return;
      selectFinderResult(Number(btn.dataset.hikeMapIndex), true);
    });
    ui.hikeFinderResultsList?.addEventListener('click', handleHikeResultAction);
    ui.plannerGpsBtn.addEventListener('click', useGpsAsPlannerStart);
    ui.plannerUndoBtn.addEventListener('click', undoPlannerWaypoint);
    ui.plannerClearBtn.addEventListener('click', clearPlanner);
    ui.plannerSaveBtn.addEventListener('click', savePlannerRoute);
    document.querySelectorAll('[data-planner-mode]').forEach(btn => btn.addEventListener('click', () => {
      const nextMode = btn.dataset.plannerMode;
      if (!PLANNER_PROFILES[nextMode]) return;
      state.planner.mode = nextMode;
      const profile = getPlannerProfile();
      document.querySelectorAll('[data-planner-mode]').forEach(b => b.classList.toggle('active', b === btn));
      ui.plannerStatus.textContent = `${profile.icon} ${profile.label} · ${profile.description}.`;
      if (state.planner.waypoints.length > 1) schedulePlannerRoute();
    }));
    ui.savedRoutesList.addEventListener('click', handleSavedRouteAction);

    ui.activityOpenBtn.addEventListener('click', () => { openActivityCard(); showAppScreen('activity'); });
    ui.activityCloseCardBtn.addEventListener('click', () => ui.activityCard.classList.add('hidden'));
    ui.activityStartBtn.addEventListener('click', activityMainButton);
    ui.activityExportBtn.addEventListener('click', exportActivity);
    document.querySelectorAll('[data-activity-mode]').forEach(btn => btn.addEventListener('click', () => {
      if (['recording','paused'].includes(state.activity.status)) {
        toast('Termine l’activité avant de changer de mode.');
        return;
      }
      const nextMode = btn.dataset.activityMode;
      if (!ACTIVITY_PROFILES[nextMode]) return;
      state.activity.mode = nextMode;
      document.querySelectorAll('[data-activity-mode]').forEach(b => b.classList.toggle('active', b === btn));
      updateActivityUI();
    }));
    ui.activityPauseBtn.addEventListener('click', toggleActivityPause);
    ui.activityStopBtn.addEventListener('click', finishActivity);
    ui.finishSaveBtn?.addEventListener('click', () => finalizeActivity(true));
    ui.finishDiscardBtn?.addEventListener('click', () => finalizeActivity(false));
    ui.finishCancelBtn?.addEventListener('click', closeFinishActivityModal);
    ui.finishActivityModal?.querySelector('[data-finish-action="cancel"]')?.addEventListener('click', closeFinishActivityModal);
    ui.targetSelectBtn.addEventListener('click', beginTargetSelection);
    ui.targetClearBtn.addEventListener('click', () => clearActivityTarget(true));

    // Navigation par écrans v1.6.1 : un seul écran visible à la fois.
    document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
      showAppScreen(btn.dataset.nav);
    }));

    document.querySelectorAll('[data-nav-action]').forEach(btn => btn.addEventListener('click', () => {
      const action = btn.dataset.navAction;
      if (action === 'activity') {
        openActivityCard();
        showAppScreen('activity');
      } else if (action === 'routes') {
        showAppScreen('routes');
      } else if (action === 'weather') {
        showAppScreen('weather');
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
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=1.10.0', { updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
  }

  initMap();
  bindEvents();
  bindOfflineEvents();
  showAppScreen('map', { scroll: false });
  renderSavedRoutes();
  updateActivityUI();
  registerSW();
  if (navigator.onLine) loadRadar(); else setTimeout(handleOfflineNetworkLoss, 250);
  setTimeout(() => startLocation(true), 400);
})();
