import { app } from './firebase-config.js';
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const db = getFirestore(app);
const auth = getAuth(app);

// Get platform settings
async function getPlatformSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'platform'));
    return settingsDoc.exists() ? settingsDoc.data() : { marginPercentage: 0, builtInMargin: 0 };
  } catch (error) {
    console.error('Error fetching platform settings:', error);
    return { marginPercentage: 0, builtInMargin: 0 };
  }
}

function roundUpToIncrement(value, increment = 500) {
  return Math.ceil(value / increment) * increment;
}

document.addEventListener('DOMContentLoaded', async () => {
    const serviceContainer = document.getElementById('service-container');
    const backBtn = document.getElementById('backBtn');
    const urlParams = new URLSearchParams(window.location.search);
    const serviceId = urlParams.get('id');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'browse.html';
            }
        });
    }

    if (!serviceId) {
        serviceContainer.innerHTML = '<p class="text-red-500 text-center">Service ID is missing.</p>';
        return;
    }

    try {
        const serviceDocRef = doc(db, 'services', serviceId);
        const serviceSnap = await getDoc(serviceDocRef);

        if (!serviceSnap.exists()) {
            serviceContainer.innerHTML = '<p class="text-red-500 text-center">Service not found.</p>';
            return;
        }

        const service = serviceSnap.data();
        const providerId = service.userId || service.providerId;
        let providerName = service.providerName || 'N/A';
        let providerProfileLink = '#';
        let providerFound = false;

        // Get platform settings for built-in margin
        const platformSettings = await getPlatformSettings();
        const builtInMargin = platformSettings.builtInMargin || 0;
        const servicePrice = Number(service.price) || 0;
        const marginAmount = servicePrice * (builtInMargin / 100);
        const rawBuyerPrice = servicePrice + marginAmount;
        const buyerPrice = builtInMargin > 0 ? roundUpToIncrement(rawBuyerPrice, 500) : rawBuyerPrice;

        if (providerId) {
            if (providerName === 'N/A') {
                try {
                    const userDocRef = doc(db, 'users', providerId);
                    const userSnap = await getDoc(userDocRef);
                    if (userSnap.exists()) {
                        providerName = userSnap.data().name || 'N/A';
                    }
                } catch (userError) {
                    console.warn("Could not fetch provider details:", userError);
                }
            }
            providerProfileLink = `service-provider.html?id=${providerId}`;
            providerFound = true;
        }

        serviceContainer.innerHTML = `
            <h1 class="text-3xl font-bold mb-2">${service.title || 'Service Title'}</h1>
            <p class="text-lg text-gray-600 mb-4">By <a href="${providerProfileLink}" class="text-blue-600 hover:underline">${providerName}</a></p>
            <div class="mb-4">
                <p class="text-2xl font-bold text-blue-600">NGN ${buyerPrice.toLocaleString()}</p>
                ${builtInMargin > 0 ? `<p class="text-xs text-gray-500 italic">Service fee included</p>` : ''}
            </div>
            <p class="text-gray-700 mb-6">${service.description || 'No description available.'}</p>
            <p class="text-gray-600 mb-2"><span class="font-semibold">Category:</span> ${service.category || 'N/A'}</p>
            <p class="text-gray-600 mb-6"><span class="font-semibold">Location:</span> ${service.location || 'Not specified'}</p>
            <button id="bookNowBtn" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">Book Now</button>
            <button id="messageBtn" class="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors mt-4">Message</button>
        `;

        const bookNowBtn = document.getElementById('bookNowBtn');
        const messageBtn = document.getElementById('messageBtn');

        if (!providerFound) {
            bookNowBtn.disabled = true;
            bookNowBtn.style.backgroundColor = '#ccc';
            bookNowBtn.style.cursor = 'not-allowed';
            bookNowBtn.textContent = 'Booking not available (Provider not found)';
            messageBtn.disabled = true;
            messageBtn.style.backgroundColor = '#ccc';
            messageBtn.style.cursor = 'not-allowed';
            messageBtn.textContent = 'Messaging not available (Provider not found)';
        } else {
            bookNowBtn.addEventListener('click', () => {
                window.location.href = `payment.html?serviceId=${serviceId}`;
            });

            messageBtn.addEventListener('click', () => {
                onAuthStateChanged(auth, async (user) => {
                    if (!user) {
                        alert("You must be logged in to send a message.");
                        window.location.href = 'login.html';
                        return;
                    }

                    if (user.uid === providerId) {
                        alert("You cannot message your own service.");
                        return;
                    }

                    try {
                        const chatsRef = collection(db, 'chats');
                        const q = query(chatsRef,
                            where('participants', 'array-contains', user.uid)
                        );

                        const querySnapshot = await getDocs(q);
                        let existingChatId = null;

                        querySnapshot.forEach(doc => {
                            if (doc.data().participants.includes(providerId)) {
                                existingChatId = doc.id;
                            }
                        });

                        if (existingChatId) {
                            window.location.href = `chat.html?id=${existingChatId}`;
                        } else {
                            const newChatRef = await addDoc(chatsRef, {
                                serviceId: serviceId,
                                participants: [user.uid, providerId],
                                createdAt: serverTimestamp(),
                                lastMessage: 'Chat initiated.',
                                lastTimestamp: serverTimestamp()
                            });
                            window.location.href = `chat.html?id=${newChatRef.id}`;
                        }
                    } catch (error) {
                        console.error("Error handling messaging:", error);
                        alert("There was an error trying to start a chat. Please try again.");
                    }
                });
            });
        }

        // Load reviews for this service
        await loadServiceReviews(serviceId);

    } catch (error) {
        console.error("Detailed error fetching service details:", error);
        serviceContainer.innerHTML = '<p class="text-red-500 text-center">Error loading service details. The service may be misconfigured or removed. Please check the console for more information.</p>';
    }
});

// =========================
// LOAD SERVICE REVIEWS
// =========================
async function loadServiceReviews(serviceId) {
    try {
        const reviewsRef = collection(db, 'reviews');
        const q = query(reviewsRef, where('serviceId', '==', serviceId));
        const querySnapshot = await getDocs(q);

        const reviewsContainer = document.getElementById('reviews-container');

        if (querySnapshot.empty) {
            reviewsContainer.innerHTML = '<p>No reviews yet for this service.</p>';
            return;
        }

        let totalRating = 0;
        let reviewCount = 0;
        let reviewsHtml = '';

        querySnapshot.forEach(doc => {
            const review = doc.data();
            totalRating += review.rating;
            reviewCount++;

            const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
            const date = review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'Unknown date';

            reviewsHtml += `
                <div class="border-b pb-4 mb-4 last:border-b-0">
                    <div class="flex items-center mb-2">
                        <span class="text-yellow-400 text-lg">${stars}</span>
                        <span class="ml-2 text-sm text-gray-600">${date}</span>
                    </div>
                    <p class="text-gray-700">${review.comment || 'No comment'}</p>
                </div>
            `;
        });

        if (reviewCount > 0) {
            const averageRating = (totalRating / reviewCount).toFixed(1);
            const averageStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));
            reviewsHtml = `
                <div class="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h3 class="text-lg font-semibold mb-2">Average Rating</h3>
                    <div class="flex items-center">
                        <span class="text-yellow-400 text-2xl mr-2">${averageStars}</span>
                        <span class="text-lg font-bold">${averageRating}/5</span>
                        <span class="text-gray-600 ml-2">(${reviewCount} review${reviewCount > 1 ? 's' : ''})</span>
                    </div>
                </div>
            ` + reviewsHtml;
        }

        reviewsContainer.innerHTML = reviewsHtml;

    } catch (error) {
        console.error('Error loading service reviews:', error);
        document.getElementById('reviews-container').innerHTML = '<p>Error loading reviews.</p>';
    }
}