const EARTH_RADIUS_KM = 6371;

export const DEFAULT_TRAVEL_BANDS = [
  { maxKm: 5, fee: 1000 },
  { maxKm: 10, fee: 2000 },
  { maxKm: 20, fee: 3500 },
  { maxKm: null, fee: null },
];

export function normalizeTravelBands(value) {
  const bands = Array.isArray(value) ? value : value?.distanceBands;
  if (!Array.isArray(bands)) return DEFAULT_TRAVEL_BANDS.map((band) => ({ ...band }));
  return bands.map((band, index) => ({
    maxKm: index === value.length - 1 || band?.maxKm === null || band?.maxKm === ''
      ? null
      : Number(band?.maxKm),
    fee: band?.fee === null || band?.fee === '' || band?.fee === undefined
      ? null
      : Number(band.fee),
  })).filter((band) => band.maxKm === null || Number.isFinite(band.maxKm));
}

export function normalizeTravelPricing(value) {
  if (Array.isArray(value)) {
    return { mode: 'distance', distanceBands: normalizeTravelBands(value), locationRates: [] };
  }

  const mode = ['distance', 'location', 'both'].includes(value?.mode) ? value.mode : 'distance';
  const locationRates = Array.isArray(value?.locationRates)
    ? value.locationRates.map((rate) => ({
      location: String(rate?.location || '').trim(),
      state: String(rate?.state || '').trim(),
      city: String(rate?.city || '').trim(),
      fee: rate?.fee === '' || rate?.fee === null || rate?.fee === undefined ? null : Number(rate.fee),
    })).filter((rate) => rate.location && rate.fee !== null && Number.isFinite(rate.fee) && rate.fee >= 0)
    : [];

  return { mode, distanceBands: normalizeTravelBands(value), locationRates };
}

export function hasConfiguredTravelPricing(value) {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.some((band) => Number.isFinite(Number(band?.fee)) && Number(band.fee) >= 0);
  }

  const pricing = normalizeTravelPricing(value);
  const hasDistanceFee = Array.isArray(value.distanceBands)
    && pricing.distanceBands.some((band) => Number.isFinite(band.fee) && band.fee >= 0);
  const hasLocationFee = pricing.locationRates.length > 0;
  return pricing.mode === 'location' ? hasLocationFee : pricing.mode === 'both'
    ? hasDistanceFee || hasLocationFee
    : hasDistanceFee;
}

export function distanceInKm(first, second) {
  if (!first || !second) return null;
  const latitudeDelta = (second.latitude - first.latitude) * Math.PI / 180;
  const longitudeDelta = (second.longitude - first.longitude) * Math.PI / 180;
  const latitudeOne = first.latitude * Math.PI / 180;
  const latitudeTwo = second.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitudeOne) * Math.cos(latitudeTwo);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function calculateTravelFee(service, customerCoordinates, customerLocation = '') {
  if (!service?.travels_to_customer && !service?.travel_pricing) return { fee: 0, distanceKm: null, unavailable: false };

  const providerCoordinates = {
    latitude: Number(service.latitude),
    longitude: Number(service.longitude),
  };
  if (!Number.isFinite(providerCoordinates.latitude) || !Number.isFinite(providerCoordinates.longitude)) {
    return { fee: 0, distanceKm: null, unavailable: true, reason: 'Provider location is unavailable.' };
  }

  const distanceKm = distanceInKm(providerCoordinates, customerCoordinates);
  if (!Number.isFinite(distanceKm)) {
    return { fee: 0, distanceKm: null, unavailable: true, reason: 'Customer location is unavailable.' };
  }

  const pricing = normalizeTravelPricing(service.travel_pricing);
  const searchableLocation = `${customerLocation} ${customerCoordinates?.label || ''}`.toLowerCase();
  const locationRate = pricing.mode !== 'distance'
    ? pricing.locationRates.find((rate) => searchableLocation.includes(rate.location.toLowerCase()))
    : null;
  const band = pricing.mode === 'location' && !locationRate
    ? null
    : pricing.distanceBands.find((entry) => entry.maxKm === null || distanceKm <= entry.maxKm);
  const fee = Number(locationRate?.fee ?? band?.fee);
  return {
    fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    distanceKm,
    matchedLocation: locationRate?.location || null,
    unavailable: !Number.isFinite(fee) || fee < 0,
  };
}