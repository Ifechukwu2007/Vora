import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';

function getNameFromUser(user) {
  return user?.full_name || user?.name || user?.display_name || user?.email || 'Service Provider';
}

async function getProvider(providerId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, location')
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
    .or(`provider_id.eq.${providerId},user_id.eq.${providerId},providerId.eq.${providerId},userId.eq.${providerId}`);

  if (error) {
    console.error('Error loading provider services:', error);
    return [];
  }

  return data || [];
}

async function renderProvider(user, providerId, container) {
  const providerName = getNameFromUser(user);
  const providerLocation = user?.location || 'Not specified';

  container.innerHTML = `
    <div class="border-b pb-6">
      <h2 class="text-3xl font-bold mb-4">${providerName}</h2>
      <p class="text-lg text-gray-700 mb-2"><strong>Email:</strong> ${user?.email || 'Not provided'}</p>
      <p class="text-lg text-gray-700 mb-2"><strong>Location:</strong> ${providerLocation}</p>
      <div id="average-rating" class="text-lg text-gray-700 mb-2"></div>
      <button id="messageProviderBtn" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">Message</button>
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

  const messageBtn = document.getElementById('messageProviderBtn');
  if (messageBtn) {
    messageBtn.addEventListener('click', async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        alert('You must be logged in to send a message.');
        window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
        return;
      }

      if (user.id === providerId) {
        alert('You cannot message your own service.');
        return;
      }

      try {
        const { data: chats, error: chatsError } = await supabase
          .from('chats')
          .select('*')
          .contains('participants', [user.id]);

        if (chatsError) {
          throw chatsError;
        }

        const existingChat = (chats || []).find((chat) =>
          Array.isArray(chat.participants) && chat.participants.includes(providerId)
        );

        if (existingChat) {
          window.location.href = `chat.html?id=${existingChat.id}`;
          return;
        }

        const { data: newChat, error: createError } = await supabase
          .from('chats')
          .insert([
            {
              participants: [user.id, providerId],
              service_id: null,
              last_message: 'Chat initiated.',
              lastMessage: 'Chat initiated.',
              last_timestamp: new Date().toISOString(),
            }
          ])
          .select('id')
          .single();

        if (createError || !newChat) {
          throw createError || new Error('Unable to create chat.');
        }

        window.location.href = `chat.html?id=${newChat.id}`;
      } catch (error) {
        console.error('Error starting chat:', error);
        alert('There was an error trying to start a chat. Please try again.');
      }
    });
  }

  const services = await getProviderServices(providerId);
  const servicesGrid = document.getElementById('services-grid');

  if (!servicesGrid) return;

  if (!services.length) {
    servicesGrid.innerHTML = '<p>This provider has not listed any services yet.</p>';
  } else {
    servicesGrid.innerHTML = services
      .map((service) => `
        <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
          <h4 class="text-xl font-bold mb-2">${service.title || 'Untitled Service'}</h4>
          <p class="text-lg text-blue-600 font-semibold mb-2">NGN ${service.price ?? '0'}</p>
          <p class="text-gray-600 mb-4">${(service.description || '').substring(0, 100)}...</p>
          <a href="service.html?id=${service.id}" class="text-blue-600 hover:underline">View Details</a>
        </div>
      `)
      .join('');
  }

  await loadReviews(providerId);
}

async function loadReviews(providerId) {
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .or(`provider_id.eq.${providerId},providerId.eq.${providerId}`);

  const reviewsList = document.getElementById('reviews-list');
  const averageRatingDiv = document.getElementById('average-rating');

  if (!reviewsList || !averageRatingDiv) return;

  if (error || !reviews || reviews.length === 0) {
    reviewsList.innerHTML = '<p>No reviews yet.</p>';
    averageRatingDiv.innerHTML = '<strong>Average Rating:</strong> No reviews yet';
    return;
  }

  let totalRating = 0;
  let reviewCount = 0;
  let reviewsHtml = '';

  for (const review of reviews) {
    const rating = Number(review.rating) || 0;
    totalRating += rating;
    reviewCount += 1;

    const stars = '?'.repeat(rating) + '?'.repeat(5 - rating);
    const createdAt = review.created_at ? new Date(review.created_at) : review.createdAt?.toDate ? review.createdAt.toDate() : new Date();
    const date = createdAt.toLocaleDateString();

    reviewsHtml += `
      <div class="bg-gray-50 p-4 rounded-lg">
        <div class="flex items-center mb-2">
          <span class="text-yellow-400 text-lg">${stars}</span>
          <span class="ml-2 text-sm text-gray-600">${date}</span>
        </div>
        <p class="text-gray-700">${review.comment || 'No comment'}</p>
      </div>
    `;
  }

  const averageRating = (totalRating / reviewCount).toFixed(1);
  const averageStars = '?'.repeat(Math.round(averageRating)) + '?'.repeat(5 - Math.round(averageRating));

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
