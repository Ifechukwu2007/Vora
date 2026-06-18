import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';
import { formatPrice } from './currency-utils.js';

function getNameFromUser(user) {
  return user?.full_name || user?.name || user?.display_name || user?.email || 'Service Provider';
}

async function getProvider(providerId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, location, profile_picture')
    .eq('id', providerId)
    .maybeSingle();

  if (error) {
    console.warn('Error fetching provider details:', error);
    return null;
  }

  return data;
}

async function getProviderServices(providerId) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('provider_id', providerId);

  if (error) {
    console.error('Error loading provider services:', error);
    return [];
  }

  return data || [];
}

async function renderProvider(user, providerId, container) {
  const providerName = getNameFromUser(user);
  const providerLocation = user?.location || 'Not specified';
  const profilePicture = user?.profile_picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(providerName);

  container.innerHTML = `
    <div class="border-b pb-6">
      <div class="flex items-center gap-4 mb-4">
        <img src="${profilePicture}" alt="${providerName}" class="w-20 h-20 rounded-full object-cover border-2 border-gray-300" />
        <div>
          <h2 class="text-3xl font-bold mb-2">${providerName}</h2>
          <p class="text-lg text-gray-700 mb-1"><strong>Email:</strong> ${user?.email || 'Not provided'}</p>
          <p class="text-lg text-gray-700"><strong>Location:</strong> ${providerLocation}</p>
        </div>
      </div>
      <div id="average-rating" class="text-lg text-gray-700 mb-2"></div>
    </div>
    <div id="provider-services-container" class="mt-6">
      <h3 class="text-2xl font-bold mb-4">Services Offered</h3>
      <div id="services-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
    </div>
    <div id="provider-reviews-container" class="mt-6">
      <h3 class="text-2xl font-bold mb-4">Reviews</h3>
      <div id="reviews-list" class="space-y-4"></div>
    </div>
  `;

  const services = await getProviderServices(providerId);
  const servicesGrid = document.getElementById('services-grid');

  if (!servicesGrid) return;

  if (!services.length) {
    servicesGrid.innerHTML = '<p>This provider has not listed any services yet.</p>';
  } else {
    servicesGrid.innerHTML = services
      .map((service) => {
        const hasDeal = Number(service.group_discount_threshold) > 0 && Number(service.group_discount_percent) > 0;
        const discountedPrice = hasDeal
          ? Math.round((Number(service.price) || 0) * (1 - Number(service.group_discount_percent) / 100))
          : Number(service.price) || 0;
        return `
          <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
            <h4 class="text-xl font-bold mb-2">${service.title || 'Untitled Service'}</h4>
            <p class="text-lg text-blue-600 font-semibold mb-2">
              ${hasDeal ? `<span class="text-sm text-gray-500 line-through mr-2">${formatPrice(service.price ?? 0)}</span>${formatPrice(discountedPrice)}` : formatPrice(service.price ?? 0)}
            </p>
            ${hasDeal ? `
              <p class="text-sm text-indigo-600 font-semibold mb-2">${service.deal_message || `Book ${service.group_discount_threshold}+ and save ${service.group_discount_percent}%`}</p>
            ` : ''}
            <p class="text-gray-600 mb-4">${(service.description || '').substring(0, 100)}...</p>
            <a href="service.html?id=${service.id}" class="text-blue-600 hover:underline">View Details</a>
          </div>
        `;
      })
      .join('');
  }

  await loadReviews(providerId);
}

async function loadReviews(providerId) {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('provider_id', providerId);

  // Fetch reviewer profiles
  let usersById = {};
  if (reviews && reviews.length > 0) {
    const userIds = [...new Set(reviews.map(r => r.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, profile_picture')
        .in('id', userIds);
      usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
    }
  }

  const reviewsList = document.getElementById('reviews-list');
  const averageRatingDiv = document.getElementById('average-rating');

  if (!reviewsList || !averageRatingDiv) return;

  if (error || !reviews || reviews.length === 0) {
    reviewsList.innerHTML = '';
    averageRatingDiv.innerHTML = '';
    return;
  }

  let totalRating = 0;
  let reviewCount = 0;
  let reviewsHtml = '';

  for (const review of reviews) {
    const rating = Number(review.rating) || 0;
    totalRating += rating;
    reviewCount += 1;

    const reviewer = usersById[review.user_id];
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const profilePic = reviewer?.profile_picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(reviewer?.full_name || 'Reviewer');

    reviewsHtml += `
      <div class="border-b py-4 flex gap-3">
        <img src="${profilePic}" alt="${reviewer?.full_name || 'Reviewer'}" class="w-10 h-10 rounded-full object-cover" />
        <div class="flex-1">
          <p class="font-semibold text-black-900">${reviewer?.full_name || 'Anonymous'}</p>
          <div class="flex items-center gap-2 text-sm text-yellow-600">
            <span>${stars}</span>
            <span>${new Date(review.created_at).toLocaleDateString()}</span>
          </div>
          <p class="text-gray-700 mt-2">${review.comment || ''}</p>
        </div>
      </div>
    `;
  }

  const averageRating = (totalRating / reviewCount).toFixed(1);
  const averageStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));

  reviewsList.innerHTML = reviewsHtml;
  averageRatingDiv.innerHTML = `<strong>Average Rating:</strong> <span class="text-yellow-400">${averageStars}</span> (${averageRating}/5 from ${reviewCount} review${reviewCount > 1 ? 's' : ''})`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const serviceProviderContainer = document.getElementById('serviceProviderContainer');
  if (!serviceProviderContainer) return;

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (document.referrer && document.referrer.includes('service.html')) {
        window.history.back();
      } else {
        window.location.href = 'browse.html';
      }
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const providerId = urlParams.get('id');

  if (!providerId) {
    serviceProviderContainer.innerHTML = '<p>No provider specified.</p>';
    return;
  }

  try {
    const provider = await getProvider(providerId);

    if (!provider) {
      const services = await getProviderServices(providerId);
      if (!services.length) {
        serviceProviderContainer.innerHTML = '<p>Provider not found.</p>';
        return;
      }

      const firstService = services[0];
      await renderProvider({
        full_name: firstService.provider_name || firstService.providerName || 'Service Provider',
        email: 'Contact via service',
        location: firstService.location || 'Not specified'
      }, providerId, serviceProviderContainer);
      return;
    }

    await renderProvider(provider, providerId, serviceProviderContainer);
  } catch (error) {
    console.error('Error loading service provider details:', error);
    serviceProviderContainer.innerHTML = '<p>Error loading details. Please check your connection and try again.</p>';
  }
}); 