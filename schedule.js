import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  getDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Logout functionality
const initLogout = () => {
  const logoutBtns = document.querySelectorAll('#logoutBtn, #logoutBtn2');
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

let currentUser = null;
let currentDate = new Date();
let bookings = [];
let availability = [];

// Check auth and load user
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    LoadingSpinner.navigateTo('login.html');
    return;
  }

  currentUser = user;

  // Check if user is a provider
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'provider') {
      LoadingSpinner.navigateTo('browse.html');
      return;
    }
  } catch (error) {
    console.error('Error checking provider role:', error);
    LoadingSpinner.navigateTo('browse.html');
    return;
  }

  // Show schedule link in nav
  const scheduleLinks = document.querySelectorAll('#scheduleLink, #scheduleLink2');
  scheduleLinks.forEach(link => link.classList.remove('hidden'));

  // Load initial data
  loadBookings();
  loadAvailability();
  generateCalendar();
  updateStats();
});

// ================= CALENDAR FUNCTIONS =================
function generateCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Update month/year display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('monthYear').textContent = `${monthNames[month]} ${year}`;

  // Clear previous calendar
  const calendarDays = document.getElementById('calendarDays');
  calendarDays.innerHTML = '';

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Add empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    calendarDays.innerHTML += '<div></div>';
  }

  // Add days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const dayElement = document.createElement('button');
    dayElement.className = 'p-3 border rounded hover:bg-gray-100 transition text-sm';
    dayElement.textContent = day;
    dayElement.onclick = () => selectDate(dateStr);

    // Check for bookings or availability
    const hasBooking = bookings.some(b => b.date === dateStr);
    const hasAvailability = availability.some(a => a.date === dateStr);

    if (hasBooking) {
      dayElement.className += ' bg-blue-500 text-white';
    } else if (hasAvailability) {
      dayElement.className += ' bg-green-500 text-white';
    }

    calendarDays.appendChild(dayElement);
  }
}

function selectDate(dateStr) {
  document.getElementById('availabilityDate').value = dateStr;
}

// ================= LOAD BOOKINGS =================
function loadBookings() {
  const bookingsRef = collection(db, 'bookings');
  const q = query(
    bookingsRef,
    where('providerId', '==', currentUser.uid)
  );

  onSnapshot(q, (snapshot) => {
    bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    updateStats();
    displayUpcomingBookings();
    generateCalendar();
  });
}

// ================= LOAD AVAILABILITY =================
function loadAvailability() {
  const availRef = collection(db, 'availability');
  const q = query(
    availRef,
    where('providerId', '==', currentUser.uid)
  );

  onSnapshot(q, (snapshot) => {
    availability = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    generateCalendar();
  });
}

// ================= SET AVAILABILITY =================
document.getElementById('availabilityForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const date = document.getElementById('availabilityDate').value;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;

  if (!date || !startTime || !endTime) {
    alert('Please fill all fields');
    return;
  }

  try {
    await addDoc(collection(db, 'availability'), {
      providerId: currentUser.uid,
      date: date,
      startTime: startTime,
      endTime: endTime,
      createdAt: serverTimestamp()
    });

    // Clear form
    document.getElementById('availabilityForm').reset();
    alert('Availability set successfully!');
  } catch (error) {
    console.error('Error setting availability:', error);
    alert('Error setting availability');
  }
});

// ================= UPDATE STATS =================
function updateStats() {
  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const completed = bookings.filter(b => b.status === 'completed').length;

  document.getElementById('totalBookings').textContent = total;
  document.getElementById('pendingBookings').textContent = pending;
  document.getElementById('confirmedBookings').textContent = confirmed;
  document.getElementById('completedBookings').textContent = completed;
}

// ================= DISPLAY UPCOMING BOOKINGS =================
function displayUpcomingBookings() {
  const upcomingContainer = document.getElementById('upcomingBookings');
  
  // Sort bookings by date
  const sorted = bookings.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (sorted.length === 0) {
    upcomingContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No upcoming bookings</p>';
    return;
  }

  upcomingContainer.innerHTML = sorted.slice(0, 5).map(booking => `
    <div class="border rounded-lg p-4 flex justify-between items-center">
      <div>
        <p class="font-semibold text-gray-800">${booking.serviceName || 'Service'}</p>
        <p class="text-sm text-gray-600">${booking.date} at ${booking.time || 'TBA'}</p>
        <p class="text-sm text-gray-600">Client: ${booking.clientName || 'TBA'}</p>
      </div>
      <div class="flex gap-2 items-center">
        <span class="px-3 py-1 rounded text-sm font-semibold ${getStatusColor(booking.status)}">
          ${booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1) || 'Pending'}
        </span>
        ${booking.status === 'pending' ? `
          <button onclick="confirmBooking('${booking.id}')" class="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
            Accept
          </button>
          <button onclick="rejectBooking('${booking.id}')" class="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
            Decline
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function getStatusColor(status) {
  const colors = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'confirmed': 'bg-green-100 text-green-800',
    'completed': 'bg-blue-100 text-blue-800',
    'cancelled': 'bg-red-100 text-red-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

// ================= MANAGE BOOKINGS =================
window.confirmBooking = async function(bookingId) {
  try {
    await updateDoc(doc(db, 'bookings', bookingId), {
      status: 'confirmed'
    });
    alert('Booking confirmed!');
  } catch (error) {
    console.error('Error confirming booking:', error);
  }
};

window.rejectBooking = async function(bookingId) {
  try {
    await updateDoc(doc(db, 'bookings', bookingId), {
      status: 'cancelled'
    });
    alert('Booking declined!');
  } catch (error) {
    console.error('Error declining booking:', error);
  }
};

// ================= CALENDAR NAVIGATION =================
document.getElementById('prevMonth').addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  generateCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  generateCalendar();
});

// ================= LOGOUT =================
const logoutButtons = document.querySelectorAll('#logoutBtn, #logoutBtn2');
logoutButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    auth.signOut().then(() => {
      window.location.href = 'login.html';
    });
  });
});

// ================= MOBILE MENU =================
const hamburger = document.getElementById('hamburger');
const sideMenu = document.getElementById('sideMenu');
const closeMenu = document.getElementById('closeMenu');

if (hamburger) {
  hamburger.addEventListener('click', () => {
    sideMenu.classList.toggle('-translate-x-full');
  });
}

if (closeMenu) {
  closeMenu.addEventListener('click', () => {
    sideMenu.classList.add('-translate-x-full');
  });
}

// Close menu when clicking on a link
const menuLinks = sideMenu.querySelectorAll('a');
menuLinks.forEach((link) => {
  link.addEventListener('click', () => {
    sideMenu.classList.add('-translate-x-full');
  });
});
