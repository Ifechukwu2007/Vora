import { auth, db } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  orderBy, 
  limit,
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { LoadingSpinner } from './loading-utils.js';

// Check admin access
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    LoadingSpinner.navigateTo('login.html');
    return;
  }

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists() || userSnap.data().role !== 'admin') {
      // Redirect without showing page content
      LoadingSpinner.navigateTo('404.html?attempted=admin');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin');
  }
});

// UI Elements
const totalUsersEl = document.getElementById("totalUsers");
const totalServicesEl = document.getElementById("totalServices");
const totalBookingsEl = document.getElementById("totalBookings");
const totalRevenueEl = document.getElementById("totalRevenue");
const recentBookingsEl = document.getElementById("recentBookings");
const activityFeedEl = document.getElementById("activityFeed");

// Format currency
function formatCurrency(amount) {
  return "NGN" + amount.toLocaleString();
}

// ===============================
// LOAD COUNTS
// ===============================
async function loadCounts() {
  try {
    // USERS
    const usersSnap = await getDocs(collection(db, "users"));
    totalUsersEl.textContent = usersSnap.size;

    // SERVICES
    const servicesSnap = await getDocs(collection(db, "services"));
    totalServicesEl.textContent = servicesSnap.size;

    // BOOKINGS + REVENUE
    const bookingsSnap = await getDocs(collection(db, "bookings"));
    totalBookingsEl.textContent = bookingsSnap.size;

    let revenue = 0;
    bookingsSnap.forEach(document => {
      const data = document.data();
      // Use marginAmount if available (new bookings), otherwise assume 0 margin for old bookings
      if (data.marginAmount) {
        revenue += Number(data.marginAmount);
      }
    });

    totalRevenueEl.textContent = formatCurrency(revenue);
  } catch (error) {
    console.error("Error loading counts:", error);
  }
}

// ===============================
// RECENT BOOKINGS
// ===============================
async function loadRecentBookings() {
  try {
    const q = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      recentBookingsEl.innerHTML = "No bookings yet";
      return;
    }

    recentBookingsEl.innerHTML = "";

    for (const docSnap of snap.docs) {
      const booking = docSnap.data();

      const userDoc = await getDoc(doc(db, "users", booking.userId));
      const serviceDoc = await getDoc(doc(db, "services", booking.serviceId));

      const user = userDoc.exists() ? userDoc.data().name : "Unknown User";
      const service = serviceDoc.exists() ? serviceDoc.data().title : "Unknown Service";

      const div = document.createElement("div");
      div.className = "border-b pb-2";

      div.innerHTML = `
        <p><strong>${user}</strong> booked <strong>${service}</strong></p>
        <p class="text-xs text-gray-400">${formatCurrency(booking.customerPrice || booking.price || 0)}</p>
      `;

      recentBookingsEl.appendChild(div);
    }
  } catch (error) {
    console.error("Error loading recent bookings:", error);
  }
}

// ===============================
// ACTIVITY FEED
// ===============================
async function loadActivity() {
  try {
    const activities = [];

    // New Users
    const usersQ = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      limit(3)
    );
    const usersSnap = await getDocs(usersQ);

    usersSnap.forEach(docSnap => {
      const user = docSnap.data();
      activities.push(`👤 New user: ${user.name}`);
    });

    // New Services
    const servicesQ = query(
      collection(db, "services"),
      orderBy("createdAt", "desc"),
      limit(3)
    );
    const servicesSnap = await getDocs(servicesQ);

    servicesSnap.forEach(docSnap => {
      const service = docSnap.data();
      activities.push(`🛠 Service added: ${service.title}`);
    });

    // New Bookings
    const bookingsQ = query(
      collection(db, "bookings"),
      orderBy("createdAt", "desc"),
      limit(3)
    );
    const bookingsSnap = await getDocs(bookingsQ);

    bookingsSnap.forEach(docSnap => {
      activities.push(`📦 New booking created`);
    });

    if (activities.length === 0) {
      activityFeedEl.innerHTML = "No activity yet";
      return;
    }

    activityFeedEl.innerHTML = "";

    activities.slice(0, 6).forEach(act => {
      const div = document.createElement("div");
      div.textContent = act;
      activityFeedEl.appendChild(div);
    });
  } catch (error) {
    console.error("Error loading activity:", error);
  }
}

// ===============================
// REAL-TIME LISTENERS (🔥 IMPORTANT)
// ===============================
function enableRealtime() {
  onSnapshot(collection(db, "users"), () => loadCounts());
  onSnapshot(collection(db, "services"), () => loadCounts());
  onSnapshot(collection(db, "bookings"), () => {
    loadCounts();
    loadRecentBookings();
    loadActivity();
  });
}

// ===============================
// INIT
// ===============================
async function init() {
  await loadCounts();
  await loadRecentBookings();
  await loadActivity();
  enableRealtime();
}

init();