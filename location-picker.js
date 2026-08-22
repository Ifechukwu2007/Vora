const MAPTILER_KEY = window.MAPTILER_API_KEY || '';
const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
  : '';

async function geocodeLocation(location) {
  if (!location) return null;
  try {
    const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(location)}.json?key=${MAPTILER_KEY}&limit=1`);
    const data = await response.json();
    const coordinates = data?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      return { latitude: Number(coordinates[1]), longitude: Number(coordinates[0]) };
    }
  } catch (error) {
    console.warn('MapTiler geocoding failed:', error);
  }
  return null;
}

export function setupLocationPicker({ mapId, locationId, latitudeId, longitudeId, coordinatesId, initialCoordinates = null }) {
  const mapElement = document.getElementById(mapId);
  const locationInput = document.getElementById(locationId);
  const latitudeInput = document.getElementById(latitudeId);
  const longitudeInput = document.getElementById(longitudeId);
  const coordinatesText = document.getElementById(coordinatesId);
  if (!mapElement || !locationInput || !latitudeInput || !longitudeInput || !window.maplibregl || !MAPTILER_KEY) return;

  const startingCoordinates = initialCoordinates || { latitude: 6.151173, longitude: 6.780686 };
  let marker = null;
  const map = new maplibregl.Map({
    container: mapElement,
    style: MAPTILER_STYLE_URL,
    center: [startingCoordinates.longitude, startingCoordinates.latitude],
    zoom: initialCoordinates ? 15 : 11,
    attributionControl: true,
  });

  const setCoordinates = (latitude, longitude) => {
    latitudeInput.value = latitude.toFixed(7);
    longitudeInput.value = longitude.toFixed(7);
    coordinatesText.textContent = `Exact pin: ${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;
    if (marker) marker.remove();
    marker = new maplibregl.Marker({ color: '#2563eb', draggable: true })
      .setLngLat([longitude, latitude])
      .addTo(map);
    marker.on('dragend', () => {
      const position = marker.getLngLat();
      setCoordinates(position.lat, position.lng);
    });
  };

  map.on('click', (event) => setCoordinates(event.lngLat.lat, event.lngLat.lng));
  if (initialCoordinates) setCoordinates(initialCoordinates.latitude, initialCoordinates.longitude);

  locationInput.addEventListener('change', async () => {
    const coordinates = await geocodeLocation(locationInput.value.trim());
    if (!coordinates) return;
    map.flyTo({ center: [coordinates.longitude, coordinates.latitude], zoom: 15 });
    setCoordinates(coordinates.latitude, coordinates.longitude);
  });

  return { map, setCoordinates };
}