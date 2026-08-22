import { supabase, supabasePublic } from './supabase.js';
import { resolveLocationInput } from './location-resolver.js';

const form = document.getElementById('requestForm');
const photoInput = document.getElementById('photos');
const preview = document.getElementById('photoPreview');
const dateInput = document.getElementById('date');
const locationInput = document.getElementById('location');
const locationButton = document.getElementById('locationBtn');
const submitButton = document.getElementById('submitBtn');
const categoryInput = document.getElementById('category');
const guestRequestNotice = document.getElementById('guestRequestNotice');

dateInput.min = new Date().toISOString().split('T')[0];

const { data: { session } } = await supabase.auth.getSession();
if (!session?.user) {
  guestRequestNotice.classList.remove('hidden');
}

async function loadAvailableCategories() {
  const { data, error } = await supabasePublic
    .from('services')
    .select('category')
    .limit(1000);

  if (error) {
    console.error('Could not load service categories:', error);
    categoryInput.innerHTML = '<option value="">Categories are unavailable</option>';
    return;
  }

  const categories = [...new Set((data || [])
    .map((service) => (service.category || '').trim())
    .filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));

  categoryInput.innerHTML = '<option value="">Choose a category</option>';
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categoryInput.appendChild(option);
  });
  categoryInput.disabled = categories.length === 0;
  if (!categories.length) {
    categoryInput.innerHTML = '<option value="">No service categories are available</option>';
  }
}

loadAvailableCategories();

photoInput.addEventListener('change', () => {
  preview.innerHTML = '';
  [...photoInput.files].slice(0, 5).forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const image = document.createElement('img');
    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.className = 'h-20 w-20 rounded-xl border border-slate-200 object-cover';
    preview.appendChild(image);
  });
});

locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Location services are not supported by your browser.');
    return;
  }
  locationButton.disabled = true;
  locationButton.textContent = 'Finding…';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locationInput.value = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      locationButton.textContent = 'Added';
      locationButton.disabled = false;
    },
    () => {
      alert('We could not access your location. Please enter it manually.');
      locationButton.textContent = 'Use mine';
      locationButton.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = 'login.html?redirect=request.html';
    return;
  }

  let resolvedLocation;
  try {
    resolvedLocation = await resolveLocationInput(locationInput.value);
  } catch (error) {
    alert(error.message || 'We could not resolve that location.');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Sending request…';
  const urgency = document.querySelector('input[name="urgency"]:checked')?.value || 'Flexible';
  const contact = document.querySelector('input[name="contact"]:checked')?.value || 'Vora chat';
  const preferredTime = document.getElementById('time').value;
  const details = document.getElementById('description').value.trim();
  const requestDetails = [
    details,
    `Preferred date: ${dateInput.value}${preferredTime ? ` at ${preferredTime}` : ''}`,
    `Urgency: ${urgency}`,
    `Contact preference: ${contact}`
  ].filter(Boolean).join('\n\n');

  const { error } = await supabase.from('requests').insert({
    user_id: session.user.id,
    user_email: session.user.email,
    title: document.getElementById('title').value.trim(),
    category: document.getElementById('category').value,
    description: requestDetails,
    budget: document.getElementById('budget').value ? Number(document.getElementById('budget').value) : null,
    location: locationInput.value.trim(),
    latitude: resolvedLocation.latitude,
    longitude: resolvedLocation.longitude,
    status: 'open'
  });

  if (error) {
    console.error('Could not submit request:', error);
    alert(error.message || 'We could not submit your request. Please try again.');
    submitButton.disabled = false;
    submitButton.textContent = 'Find Providers';
    return;
  }

  document.getElementById('requestPanel').classList.add('hidden');
  document.getElementById('successPanel').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
