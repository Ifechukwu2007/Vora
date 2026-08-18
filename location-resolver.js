export function parseCoordinates(value) {
  const parts = String(value || '').trim().split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) {
    return null;
  }
  return { latitude: parts[0], longitude: parts[1] };
}

export async function resolveLocationInput(value) {
  const location = String(value || '').trim();
  if (!location) throw new Error('Enter a location or coordinates.');

  const coordinates = parseCoordinates(location);
  if (coordinates) return { ...coordinates, label: location };

  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error('We could not find that address. Try adding the city or enter coordinates instead.');
  const matches = await response.json();
  const match = matches?.[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('We could not find that address. Try adding the city or enter coordinates instead.');
  }
  return { latitude, longitude, label: match.display_name || location };
}
