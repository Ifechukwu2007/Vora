import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { app, auth } from './firebase-config.js';

// Logout functionality
const initLogout = () => {
  const logoutBtns = document.querySelectorAll('#logoutBtn');
  const logout = () => {
    signOut(auth).then(() => {
      window.location.href = 'index.html';
    }).catch((error) => {
      console.error('Logout Error:', error);
    });
  };
  logoutBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', logout);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogout);
} else {
  initLogout();
}

const db = getFirestore(app);

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

    if (providerId) {
        try {
            const userRef = doc(db, 'users', providerId);
            const userSnap = await getDoc(userRef);


            if (!userSnap.exists()) {
                // Try to get provider info from their services
                const servicesRef = collection(db, 'services');
                const q = query(servicesRef, where("userId", "==", providerId));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    serviceProviderContainer.innerHTML = '<p>Provider not found.</p>';
                    return;
                }

                // Use data from the first service
                const firstService = querySnapshot.docs[0].data();
                const user = {
                    name: firstService.providerName || 'Service Provider',
                    email: 'Contact via service',
                    location: firstService.location || 'Not specified'
                };
                await renderProvider(user, providerId, serviceProviderContainer);
                return;
            }

            const user = userSnap.data();
            await renderProvider(user, providerId, serviceProviderContainer);
// Shared provider rendering function
async function renderProvider(user, providerId, serviceProviderContainer) {
    let providerHtml = `
        <div class="border-b pb-6">
            <h2 class="text-3xl font-bold mb-4">${user.name}</h2>
            <p class="text-lg text-gray-700 mb-2"><strong>Email:</strong> ${user.email}</p>
            <p class="text-lg text-gray-700 mb-2"><strong>Location:</strong> ${user.location || 'Not specified'}</p>
            <div id="average-rating" class="text-lg text-gray-700 mb-2">
                <!-- Average rating will be loaded here -->
            </div>
            <button id="messageProviderBtn" class="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">Message</button>
        </div>
        <div id="provider-services-container" class="mt-6">
            <h3 class="text-2xl font-bold mb-4">Services Offered</h3>
            <div id="services-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Services will be loaded here -->
            </div>
        </div>
        <div id="provider-reviews-container" class="mt-6">
            <h3 class="text-2xl font-bold mb-4">Reviews</h3>
            <div id="reviews-list" class="space-y-4">
                <!-- Reviews will be loaded here -->
            </div>
        </div>
    `;
    serviceProviderContainer.innerHTML = providerHtml;

    // Add message button functionality
    setTimeout(() => { // Ensure DOM is updated
        const messageBtn = document.getElementById('messageProviderBtn');
        if (messageBtn) {
            messageBtn.addEventListener('click', async () => {
                // Lazy import auth to avoid circular import
                const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
                const auth = getAuth();
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
                        // Check for existing chat between user and provider
                        const chatsRef = collection(db, 'chats');
                        const q = query(chatsRef,
                            where('participants', 'array-contains', user.uid)
                        );
                        const querySnapshot = await getDocs(q);
                        let existingChatId = null;
                        querySnapshot.forEach(doc => {
                            const data = doc.data();
                            if (data.participants.includes(providerId)) {
                                existingChatId = doc.id;
                            }
                        });

                        if (existingChatId) {
                            window.location.href = `chat.html?id=${existingChatId}`;
                        } else {
                            const newChatRef = await addDoc(chatsRef, {
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
    }, 0);

    const servicesRef = collection(db, 'services');
    const q1 = query(servicesRef, where("userId", "==", providerId));
    const q2 = query(servicesRef, where("providerId", "==", providerId));

    const [querySnapshot1, querySnapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
    ]);

    const servicesMap = new Map();
    querySnapshot1.forEach(doc => servicesMap.set(doc.id, doc.data()));
    querySnapshot2.forEach(doc => servicesMap.set(doc.id, doc.data()));

    const servicesGrid = document.getElementById('services-grid');
    if (servicesMap.size === 0) {
        servicesGrid.innerHTML = '<p>This provider has not listed any services yet.</p>';
    } else {
        let servicesHtml = '';
        servicesMap.forEach((service, id) => {
            servicesHtml += `
                <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
                    <h4 class="text-xl font-bold mb-2">${service.title}</h4>
                    <p class="text-lg text-blue-600 font-semibold mb-2">NGN ${service.price}</p>
                    <p class="text-gray-600 mb-4">${service.description.substring(0, 100)}...</p>
                    <a href="service.html?id=${id}" class="text-blue-600 hover:underline">View Details</a>
                </div>
            `;
        });
        servicesGrid.innerHTML = servicesHtml;
    }

    // Load reviews
    await loadReviews(providerId);
}

        } catch (error) {
            console.error("Error loading service provider details:", error);
            serviceProviderContainer.innerHTML = '<p>Error loading details. Please check your connection and try again.</p>';
        }
    } else {
        serviceProviderContainer.innerHTML = '<p>No provider specified.</p>';
    } 
});

// =========================
// LOAD REVIEWS
// =========================
async function loadReviews(providerId) {
    try {
        const reviewsRef = collection(db, 'reviews');
        const q = query(reviewsRef, where('providerId', '==', providerId));
        const querySnapshot = await getDocs(q);

        const reviewsList = document.getElementById('reviews-list');
        const averageRatingDiv = document.getElementById('average-rating');

        if (querySnapshot.empty) {
            reviewsList.innerHTML = '<p>No reviews yet.</p>';
            averageRatingDiv.innerHTML = '<strong>Average Rating:</strong> No reviews yet';
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
                <div class="bg-gray-50 p-4 rounded-lg">
                    <div class="flex items-center mb-2">
                        <span class="text-yellow-400 text-lg">${stars}</span>
                        <span class="ml-2 text-sm text-gray-600">${date}</span>
                    </div>
                    <p class="text-gray-700">${review.comment || 'No comment'}</p>
                </div>
            `;
        });

        reviewsList.innerHTML = reviewsHtml;

        const averageRating = (totalRating / reviewCount).toFixed(1);
        const averageStars = '★'.repeat(Math.round(averageRating)) + '☆'.repeat(5 - Math.round(averageRating));
        averageRatingDiv.innerHTML = `<strong>Average Rating:</strong> <span class="text-yellow-400">${averageStars}</span> (${averageRating}/5 from ${reviewCount} review${reviewCount > 1 ? 's' : ''})`;

    } catch (error) {
        console.error('Error loading reviews:', error);
        document.getElementById('reviews-list').innerHTML = '<p>Error loading reviews.</p>';
    }
}