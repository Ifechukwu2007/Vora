import { supabasePublic } from './supabase.js';
import { resolveLocationInput } from './location-resolver.js';

const form = document.getElementById('locatorForm');
const coordinatesInput = document.getElementById('coordinates');
const results = document.getElementById('providerResults');
const summary = document.getElementById('resultSummary');
const errorMessage = document.getElementById('formError');
const currentLocationButton = document.getElementById('currentLocationBtn');

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
    results.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">No providers have saved coordinates yet. Providers can enter their service location as latitude, longitude to appear in this search.</div>';
    return;
  }

  summary.textContent = `${nearby.length} closest provider service${nearby.length === 1 ? '' : 's'}, ordered by distance.`;
  results.innerHTML = nearby.map((service) => {
    const destination = `${service.latitude},${service.longitude}`;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${customerLocation.latitude},${customerLocation.longitude}&destination=${destination}&travelmode=driving`;
    return `<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
