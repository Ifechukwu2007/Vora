import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  addDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribe = null;

// =========================
// INIT
// =========================
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('bookingsContainer');

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      LoadingSpinner.navigateTo('login.html');
      return;
    }

    container.innerHTML = '<p>Loading bookings...</p>';
    startRealtimeBookings(user.uid, container);
  });
});

// =========================
// 🔴 REAL-TIME BOOKINGS
// =========================
function startRealtimeBookings(userId, container) {
  const q = query(
    collection(db, 'bookings'),
    where('customerId', '==', userId) 
  );

  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }

  unsubscribe = onSnapshot(q, async (snapshot) => {
    console.log("BOOKINGS COUNT:", snapshot.size);
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = '<p class="text-center">No bookings yet.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const docSnap of snapshot.docs) {
      const booking = { id: docSnap.id, ...docSnap.data() };
      const card = await createBookingCard(booking);
      fragment.appendChild(card);
    }
    container.appendChild(fragment);
  });
}

// =========================
// 🧱 CREATE BOOKING CARD
// =========================
async function createBookingCard(booking) {
  const card = document.createElement('div');
  card.className = "bg-white p-4 rounded shadow mb-4"; // Added margin bottom for spacing

  const serviceTitle = booking.serviceTitle || 'Untitled Service';
  
  // Resolution for Provider
  const providerName = await resolveProviderName(booking);

  // Date resolution
  const bookingDate = booking.createdAt?.toDate
    ? booking.createdAt.toDate().toLocaleString()
    : booking.createdAt
      ? new Date(booking.createdAt).toLocaleString()
      : 'No date';

  // Extract payment method from database
  const paymentMethod = booking.paymentMethod || 'Not specified';
  const status = booking.status || 'pending';

  // Status styling
  let statusColor = 'text-yellow-600';
  if (status === 'accepted') statusColor = 'text-green-600';
  if (status === 'rejected') statusColor = 'text-red-600';

  // Add review button for accepted bookings
  let reviewButton = '';
  if (status === 'accepted') {
    reviewButton = `<button class="leave-review bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded mt-2" data-booking-id="${booking.id}">Leave Review</button>`;
  }

  card.innerHTML = `
    <h3 class="text-lg font-bold">${serviceTitle}</h3>
    <p><strong>Provider:</strong> ${providerName}</p>
    <p><strong>Date:</strong> ${bookingDate}</p>
    <p><strong>Payment Method:</strong> <span class="capitalize">${paymentMethod}</span></p>
    <p><strong>Status:</strong>
      <span class="${statusColor} font-semibold uppercase">${status}</span>
    </p>
    ${reviewButton}
  `;

  // Add event listener for review button
  if (status === 'accepted') {
    card.querySelector('.leave-review').addEventListener('click', () => {
      openReviewModal(booking);
    });
  }

  return card;
}

// =========================
// 🔍 GET PROVIDER NAME
// =========================
async function resolveProviderName(booking) {
  if (booking.providerName) {
    return booking.providerName;
  }

  if (booking.providerId && booking.providerId !== 'Unknown') {
    const providerName = await getProviderName(booking.providerId);
    if (providerName) return providerName;
  }

  if (booking.serviceId) {
    try {
      const serviceSnap = await getDoc(doc(db, 'services', booking.serviceId));
      if (serviceSnap.exists()) {
        const service = serviceSnap.data();
        if (service.providerName) return service.providerName;
        const providerId = service.providerId || service.userId;
        if (providerId && providerId !== 'Unknown') {
          const providerName = await getProviderName(providerId);
          if (providerName) return providerName;
        }
      }
    } catch (error) {
      console.error('Service fetch error:', error);
    }
  }

  return 'Unknown Provider';
}

async function getProviderName(providerId) {
  try {
    const ref = doc(db, 'users', providerId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const user = snap.data();
      return user.name || user.fullName || user.displayName || null;
    }
    return null;
  } catch (error) {
    console.error("Provider fetch error:", error);
    return null;
  }
}

// =========================
// REVIEW MODAL FUNCTIONS
// =========================
let currentBookingForReview = null;
let selectedRating = 0;

function openReviewModal(booking) {
  currentBookingForReview = booking;
  selectedRating = 0;
  document.getElementById('reviewModal').classList.remove('hidden');
  document.getElementById('reviewComment').value = '';
  resetStars();
}

function resetStars() {
  const stars = document.querySelectorAll('#reviewModal .star');
  stars.forEach(star => {
    star.classList.remove('text-yellow-400');
    star.classList.add('text-gray-300');
  });
}

function setRating(rating) {
  selectedRating = rating;
  const stars = document.querySelectorAll('#reviewModal .star');
  stars.forEach((star, index) => {
    if (index < rating) {
      star.classList.remove('text-gray-300');
      star.classList.add('text-yellow-400');
    } else {
      star.classList.remove('text-yellow-400');
      star.classList.add('text-gray-300');
    }
  });
}

// Event listeners for modal
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing review modal...');

  // Star rating buttons
  document.querySelectorAll('#reviewModal .star').forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating);
      console.log('Star clicked:', rating);
      setRating(rating);
    });
  });

  // Cancel button
  document.getElementById('cancelReview').addEventListener('click', () => {
    document.getElementById('reviewModal').classList.add('hidden');
  });

  // Close button
  document.getElementById('closeReviewModal').addEventListener('click', () => {
    document.getElementById('reviewModal').classList.add('hidden');
  });

  // Submit review
  document.getElementById('submitReview').addEventListener('click', async () => {
    console.log('Submit review clicked');
    console.log('Current booking:', currentBookingForReview);
    console.log('Selected rating:', selectedRating);
    console.log('Current user:', auth.currentUser);

    if (!auth.currentUser) {
      alert('You must be logged in to submit a review.');
      return;
    }

    if (!currentBookingForReview || selectedRating === 0) {
      alert('Please select a rating.');
      return;
    }

    const comment = document.getElementById('reviewComment').value.trim();

    try {
      console.log('Submitting review for booking:', currentBookingForReview);

      // Check if review already exists for this booking
      const existingReviewQuery = query(
        collection(db, 'reviews'),
        where('bookingId', '==', currentBookingForReview.id)
      );
      const existingReviewSnap = await getDocs(existingReviewQuery);

      if (!existingReviewSnap.empty) {
        alert('You have already submitted a review for this booking.');
        document.getElementById('reviewModal').classList.add('hidden');
        return;
      }

      const reviewData = {
        bookingId: currentBookingForReview.id,
        customerId: currentBookingForReview.customerId,
        providerId: currentBookingForReview.providerId,
        serviceId: currentBookingForReview.serviceId || null,
        rating: selectedRating,
        comment: comment,
        createdAt: new Date()
      };

      console.log('Review data:', reviewData);

      await addDoc(collection(db, 'reviews'), reviewData);

      alert('Review submitted successfully!');
      document.getElementById('reviewModal').classList.add('hidden');
      selectedRating = 0; // Reset rating for next use
    } catch (error) {
      console.error('Error submitting review:', error);
      alert(`Error submitting review: ${error.message}`);
    }
  });
});