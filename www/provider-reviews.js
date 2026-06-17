import { supabase } from './supabase.js';
import { updateProfilePictureInHeader } from './auth.js';

const container = document.getElementById('providerReviewsContainer');

document.addEventListener('DOMContentLoaded', async () => {
  await updateProfilePictureInHeader();
  await loadProviderReviews();
  setupLogout();
});

async function loadProviderReviews() {
  if (!container) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user?.id) {
    window.location.href = 'login.html';
    return;
  }

  const userId = sessionData.session.user.id;

  container.innerHTML = `
    <div class="bg-white rounded-2xl p-8 shadow text-center text-gray-500">
      Loading provider reviews...
    </div>
  `;

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('provider_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Provider reviews load failed', error);
    container.innerHTML = `<div class="bg-white rounded-2xl p-8 shadow text-center text-red-500">Unable to load reviews.</div>`;
    return;
  }

  if (!reviews || reviews.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-10 shadow text-center">
        <div class="text-5xl mb-4">📭</div>
        <h2 class="text-2xl font-bold text-gray-900 mb-2">No reviews yet</h2>
        <p class="text-gray-600">Customers have not reviewed your services yet.</p>
      </div>
    `;
    return;
  }

  const reviewerIds = [...new Set(reviews.map(review => review.user_id).filter(Boolean))];
  const serviceIds = [...new Set(reviews.map(review => review.service_id).filter(Boolean))];

  const [reviewersRes, servicesRes] = await Promise.all([
    reviewerIds.length
      ? supabase.from('users').select('id, full_name, profile_picture').in('id', reviewerIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabase.from('services').select('id, title').in('id', serviceIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (reviewersRes.error) console.error('Failed to load reviewer profiles', reviewersRes.error);
  if (servicesRes.error) console.error('Failed to load service titles', servicesRes.error);

  const reviewersById = Object.fromEntries((reviewersRes.data || []).map(profile => [String(profile.id), profile]));
  const servicesById = Object.fromEntries((servicesRes.data || []).map(service => [service.id, service]));

  container.innerHTML = '';

  reviews.forEach(review => {
    const reviewer = reviewersById[String(review.user_id)] || {};
    const service = servicesById[review.service_id] || {};
    const picture = reviewer.profile_picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(reviewer.full_name || 'Customer')}`;
    const stars = '★'.repeat(Number(review.rating) || 0) + '☆'.repeat(5 - (Number(review.rating) || 0));

    const card = document.createElement('div');
    card.className = 'bg-white rounded-3xl shadow p-6';
    card.innerHTML = `
      <div class="flex gap-4 items-start">
        <img src="${picture}" alt="${reviewer.full_name || 'Customer'}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(reviewer.full_name || 'Customer')}'" class="w-16 h-16 rounded-full object-cover border border-gray-200" />
        <div class="flex-1">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p class="font-semibold text-gray-900">${reviewer.full_name || 'Anonymous Customer'}</p>
              <p class="text-sm text-gray-500">Reviewed on ${new Date(review.created_at).toLocaleDateString()}</p>
            </div>
            <div class="text-yellow-400 font-semibold">${stars}</div>
          </div>
          <p class="text-sm text-gray-500 mt-3">Service: <span class="text-gray-900 font-medium">${service.title || 'Unknown Service'}</span></p>
          <p class="mt-4 text-gray-700">${review.comment || 'No comment provided.'}</p>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutBtnSide = document.getElementById('logoutBtnSideMenu');

  async function doLogout() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  }

  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  if (logoutBtnSide) logoutBtnSide.addEventListener('click', doLogout);
} 