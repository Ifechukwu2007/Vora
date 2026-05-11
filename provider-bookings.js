import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Logout functionality
const initLogout = () => {
  const logoutBtns = document.querySelectorAll('#logoutBtn');
  const logout = () => {
    signOut(auth).then(() => {
      LoadingSpinner.navigateTo('index.html');
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
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentProvider = null;

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('bookingsContainer');

    // 🔐 AUTH CHECK
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            LoadingSpinner.navigateTo('login.html');
            return;
        }

        currentProvider = user;
        container.innerHTML = '<p>Loading bookings...</p>';

        await loadBookings(container);
    });
});

// =========================
// LOAD BOOKINGS
// =========================
async function loadBookings(container) {
    try {
        const q = query(
            collection(db, 'bookings'),
            where('providerId', '==', currentProvider.uid)
        );

        const snapshot = await getDocs(q);
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<p>No bookings yet.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const booking = { id: docSnap.id, ...docSnap.data() };
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded shadow mb-4 border-l-4 border-blue-500";

            // ✅ DATA MAPPING (Matches your Firestore Screenshot)
            const userEmail = booking.customerEmail || 'Unknown User';
            
            const bookingDate = (booking.createdAt && typeof booking.createdAt.toDate === 'function')
                ? booking.createdAt.toDate().toLocaleString()
                : 'No date';

            const serviceTitle = booking.serviceTitle || 'Untitled Service';
            const message = booking.message || 'None';
            const status = booking.status || 'pending';

            // ✅ NEW: PAYMENT & PRICE DATA
            const rawPrice = booking.price || 0;
            const formattedPrice = new Intl.NumberFormat('en-NG', {
                style: 'currency',
                currency: 'NGN', // Assuming Naira based on the number scale in your photo
            }).format(rawPrice);

            const paymentMethod = booking.paymentMethod === 'cash' ? 'Cash' : 'Paid Online';

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <h3 class="text-lg font-bold text-gray-800">${serviceTitle}</h3>
                    <span class="text-blue-600 font-bold">${formattedPrice}</span>
                </div>

                <div class="mt-2 text-sm text-gray-600 space-y-1">
                    <p><strong>User:</strong> ${userEmail}</p>
                    <p><strong>Date:</strong> ${bookingDate}</p>
                    <p><strong>Payment:</strong> <span class="capitalize">${paymentMethod}</span></p>
                    <p><strong>Message:</strong> ${message}</p>
                    <p><strong>Status:</strong> <span class="font-semibold uppercase text-xs">${status}</span></p>
                </div>

                <div class="mt-4 flex gap-2">
                    <button class="accept bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded transition">
                        Accept
                    </button>
                    <button class="reject bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded transition">
                        Reject
                    </button>
                </div>
            `;

            // ✅ ACTIONS
            card.querySelector('.accept').onclick = async () => {
                await updateStatus(booking.id, 'accepted');
                reloadBookings(container);
            };

            card.querySelector('.reject').onclick = async () => {
                await updateStatus(booking.id, 'rejected');
                reloadBookings(container);
            };

            container.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading bookings:", error);
        container.innerHTML = '<p class="text-red-500">Error loading bookings</p>';
    }
}

// =========================
// UPDATE STATUS
// =========================
async function updateStatus(bookingId, status) {
    try {
        await updateDoc(doc(db, 'bookings', bookingId), {
            status: status
        });
    } catch (error) {
        console.error("Update failed:", error);
    }
}

// =========================
// RELOAD
// =========================
async function reloadBookings(container) {
    container.innerHTML = '<p>Updating...</p>';
    await loadBookings(container);
}