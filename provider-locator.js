import { supabasePublic } from './supabase.js';
import { resolveLocationInput } from './location-resolver.js';

const form = document.getElementById('locatorForm');
const coordinatesInput = document.getElementById('coordinates');
const results = document.getElementById('providerResults');
const summary = document.getElementById('resultSummary');
const errorMessage = document.getElementById('formError');
const currentLocationButton = document.getElementById('currentLocationBtn');
const mapElement = document.getElementById('locatorMap');
const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
  : '';
let locatorMap = null;

function distanceInKm(start, end) {
  const earthRadiusKm = 6371;
  const radians = (value) => value * Math.PI / 180;
  const latitudeDifference = radians(end.latitude - start.latitude);
  const longitudeDifference = radians(end.longitude - start.longitude);
  const calculation = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(start.latitude)) * Math.cos(radians(end.latitude)) * Math.sin(longitudeDifference / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(calculation), Math.sqrt(1 - calculation));
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getServiceCoordinates(service) {
  const latitude = Number(service.latitude);
  const longitude = Number(service.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude };
  }

  const match = String(service.location || '').match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const parsedLatitude = Number(match[1]);
  const parsedLongitude = Number(match[2]);
  return Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
    ? { latitude: parsedLatitude, longitude: parsedLongitude }
    : null;
}

function selectServiceCard(serviceId) {
  const card = document.querySelector(`[data-service-id="${CSS.escape(String(serviceId))}"]`);
  if (!card) return;
  document.querySelectorAll('[data-service-id]').forEach((item) => {
    item.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
  });
  card.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderLocatorMap(customerLocation, nearby) {
  if (!mapElement) return;
  if (!window.maplibregl || !MAPTILER_KEY) {
    mapElement.innerHTML = '<div class="flex h-full items-center justify-center p-6 text-sm text-slate-500">Map unavailable.</div>';
    return;
  }

  if (locatorMap) locatorMap.remove();
  locatorMap = new maplibregl.Map({
    container: mapElement,
    style: MAPTILER_STYLE_URL,
    center: [customerLocation.longitude, customerLocation.latitude],
    zoom: 12,
    attributionControl: true,
  });

  const bounds = new maplibregl.LngLatBounds(
    [customerLocation.longitude, customerLocation.latitude],
    [customerLocation.longitude, customerLocation.latitude]
  );

  new maplibregl.Marker({ color: '#10b981' })
    .setLngLat([customerLocation.longitude, customerLocation.latitude])
    .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Your search location'))
    .addTo(locatorMap);

  nearby.forEach((service) => {
    const coordinates = [service.longitude, service.latitude];
    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
      <div class="min-w-[190px] p-1">
        <p class="text-xs font-semibold uppercase tracking-wide text-blue-600">${escapeHtml(service.category || 'Service')}</p>
        <p class="mt-1 font-bold text-slate-900">${escapeHtml(service.title || 'Provider service')}</p>
        <p class="mt-1 text-sm text-slate-600">${service.distance.toFixed(1)} km away</p>
        <button type="button" class="map-select-service mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" data-service-id="${escapeHtml(service.id)}">Select service</button>
      </div>
    `);

    new maplibregl.Marker({ color: '#2563eb' })
      .setLngLat(coordinates)
      .setPopup(popup)
      .addTo(locatorMap);
    bounds.extend(coordinates);
  });

  locatorMap.on('load', () => {
    locatorMap.fitBounds(bounds, { padding: 70, maxZoom: 14 });
  });
}

mapElement?.addEventListener('click', (event) => {
  const selectButton = event.target.closest('.map-select-service');
  if (selectButton) selectServiceCard(selectButton.dataset.serviceId);
});

async function findProviders(customerLocation) {
  errorMessage.classList.add('hidden');
  results.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Finding nearby providers…</div>';
  summary.textContent = `Searching around ${customerLocation.label || `${customerLocation.latitude.toFixed(6)}, ${customerLocation.longitude.toFixed(6)}`}.`;

  const { data, error } = await supabasePublic
    .from('services')
    .select('*')
    .limit(100);

  if (error) {
    console.error('Failed to find nearby providers:', error);
    results.innerHTML = '<div class="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">We could not load services. Please try again.</div>';
    return;
  }

  const nearby = (data || [])
    .map((service) => {
      const coordinates = getServiceCoordinates(service);
      return coordinates ? { ...service, ...coordinates, distance: distanceInKm(customerLocation, coordinates) } : null;
    })
    .filter(Boolean)
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 12);

  if (!nearby.length) {
    summary.textContent = 'No provider service coordinates are available yet.';
    renderLocatorMap(customerLocation, []);
    results.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">No providers have saved coordinates yet. Providers can enter their service location as latitude, longitude to appear in this search.</div>';
    return;
  }

  summary.textContent = `${nearby.length} closest provider service${nearby.length === 1 ? '' : 's'}, ordered by distance.`;
  renderLocatorMap(customerLocation, nearby);
  results.innerHTML = nearby.map((service) => {
    const destination = `${service.latitude},${service.longitude}`;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${customerLocation.latitude},${customerLocation.longitude}&destination=${destination}&travelmode=driving`;
    return `<article data-service-id="${escapeHtml(service.id)}" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition">
      <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wide text-blue-600">${escapeHtml(service.category || 'Service')}</p><h3 class="mt-1 text-lg font-bold">${escapeHtml(service.title || 'Provider service')}</h3></div><span class="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">${service.distance.toFixed(1)} km</span></div>
      <p class="mt-3 text-sm text-slate-600">${escapeHtml(service.location || 'Location not named')}</p>
      <div class="mt-5 flex gap-3"><a href="service.html?id=${encodeURIComponent(service.id)}" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">View service</a><a href="${directionsUrl}" target="_blank" rel="noopener" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Directions</a></div>
    </article>`;
  }).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await findProviders(await resolveLocationInput(coordinatesInput.value));
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.classList.remove('hidden');
  }
});

currentLocationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    errorMessage.textContent = 'Location services are not supported by this browser.';
    errorMessage.classList.remove('hidden');
    return;
  }
  currentLocationButton.disabled = true;
  currentLocationButton.textContent = 'Getting location…';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      coordinatesInput.value = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      currentLocationButton.disabled = false;
      currentLocationButton.textContent = 'Use my current location';
      form.requestSubmit();
    },
    () => {
      errorMessage.textContent = 'We could not access your location. Enter the coordinates manually.';
      errorMessage.classList.remove('hidden');
      currentLocationButton.disabled = false;
      currentLocationButton.textContent = 'Use my current location';
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

form.requestSubmit();
