const MAX_SERVICE_IMAGES = 3;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function asImageList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
}

export function getServiceImages(service) {
  const candidates = [
    ...asImageList(service?.image_urls),
    ...asImageList(service?.images),
    service?.image_url,
    service?.cover_image,
    service?.image
  ];

  return [...new Set(candidates.filter((url) => typeof url === 'string' && url.trim()))]
    .slice(0, MAX_SERVICE_IMAGES);
}

export function renderServiceImageGallery(images, title = 'Service image', {
  wrapperClass = 'grid grid-cols-1 gap-2',
  imageClass = 'h-48 w-full object-cover'
} = {}) {
  const urls = (Array.isArray(images) ? images : getServiceImages(images)).slice(0, MAX_SERVICE_IMAGES);
  if (!urls.length) return '';

  return `
    <div class="${wrapperClass}" aria-label="Service photos">
      ${urls.map((url, index) => `
        <img
          src="${escapeHtml(url)}"
          alt="${escapeHtml(title)} — photo ${index + 1}"
          class="${imageClass}"
          loading="${index === 0 ? 'eager' : 'lazy'}"
          onerror="this.closest('div').style.display='none'"
        >
      `).join('')}
    </div>
  `;
}
