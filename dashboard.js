import { db, auth } from "./firebase-config.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ================= STATE =================
let user = null;
let bookings = [];

// ================= DOM =================
const addBookingBtn = document.getElementById("addBookingBtn");

const customerName = document.getElementById("customerName");
const amount = document.getElementById("amount");
const date = document.getElementById("date");

const todayBookings = document.getElementById("todayBookings");
const upcomingBookings = document.getElementById("upcomingBookings");
const activityFeed = document.getElementById("activityFeed");

const nextBooking = document.getElementById("nextBooking");

// ================= AUTH =================
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    window.location.href = "login.html";
    return;
  }

  user = u;
  await loadBookings();
  render();
});

// ================= LOAD BOOKINGS =================
async function loadBookings() {
  const q = query(
    collection(db, "bookings"),
    where("providerId", "==", user.uid)
  );

  const snap = await getDocs(q);

  bookings = snap.docs.map(doc => {
    const d = doc.data();

    return {
      id: doc.id,
      customerName: d.customerName || "Unknown",
      amount: d.amount || 0,
      date: d.date || "",
      createdAt: d.createdAt || null
    };
  });
}

// ================= RENDER =================
function render() {
  renderStats();
  renderToday();
  renderUpcoming();
  renderActivity();
  renderNextBooking();
}

// ================= STATS =================
function renderStats() {
  const total = bookings.length;
  const revenue = bookings.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  document.querySelectorAll(".grid h2")[0].textContent = total;
  document.querySelectorAll(".grid h2")[1].textContent = "NGN" + revenue;
}

// ================= NEXT BOOKING =================
function renderNextBooking() {
  if (!bookings.length) {
    nextBooking.textContent = "--";
    return;
  }

  const sorted = [...bookings].sort((a, b) =>
    new Date(a.date) - new Date(b.date)
  );

  nextBooking.textContent =
    `${sorted[0].customerName} - ${sorted[0].date}`;
}

// ================= TODAY BOOKINGS =================
function renderToday() {
  const today = new Date().toISOString().split("T")[0];

  const todayList = bookings.filter(b => b.date === today);

  if (!todayList.length) {
    todayBookings.innerHTML = "No bookings today";
    return;
  }

  todayBookings.innerHTML = todayList.map(b => `
    <div class="border-b py-2">
      <strong>${b.customerName}</strong> - ₦${b.amount}
    </div>
  `).join("");
}

// ================= UPCOMING =================
function renderUpcoming() {
  const today = new Date().toISOString().split("T")[0];

  const upcoming = bookings.filter(b => b.date > today);

  if (!upcoming.length) {
    upcomingBookings.innerHTML = "No upcoming bookings";
    return;
  }

  upcomingBookings.innerHTML = upcoming.map(b => `
    <div class="border-b py-2">
      ${b.customerName} • ${b.date} • ₦${b.amount}
    </div>
  `).join("");
}

// ================= ACTIVITY =================
function renderActivity() {
  const recent = [...bookings]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (!recent.length) {
    activityFeed.innerHTML = "No activity yet";
    return;
  }

  activityFeed.innerHTML = recent.map(b => `
    <div class="py-1 border-b text-sm">
      ${b.customerName} booked for ₦${b.amount}
    </div>
  `).join("");
}

// ================= ADD BOOKING =================
addBookingBtn.addEventListener("click", async () => {
  if (!customerName.value || !amount.value || !date.value) {
    alert("Fill all fields");
    return;
  }

  await addDoc(collection(db, "bookings"), {
    customerName: customerName.value,
    amount: Number(amount.value),
    date: date.value,
    providerId: user.uid,
    createdAt: serverTimestamp()
  });

  customerName.value = "";
  amount.value = "";
  date.value = "";

  await loadBookings();
  render();
});

// ================= QUICK ACTIONS =================
document.querySelectorAll("[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;

    if (action === "browse") {
      window.location.href = "browse.html";
    }

    if (action === "message") {
      window.location.href = "my-messages.html";
    }

    if (action === "provider") {
      window.location.href = "add-service.html";
    }
  });
});

// ================= LOGOUT =================
document.querySelectorAll("#logoutBtn, [data-logout]").forEach(btn => {
  btn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
});