import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from "./firebase-config.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Helper function to create notifications
async function createNotification(recipientId, type, title, message, metadata = {}) {
  try {
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
      recipientId,
      type,
      title,
      message,
      metadata,
      isRead: false,
      isDeleted: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// ---------------- STATE ----------------
let currentUser = null;
let requestsCache = [];
let offersCache = [];
let currentTab = "open";

// ---------------- DOM ----------------
const requestsList = document.getElementById("requestsList");
const emptyState = document.getElementById("emptyState");

// counts
const openCount = document.getElementById("openCount");
const acceptedCount = document.getElementById("acceptedCount");
const offerCount = document.getElementById("offerCount");

// tabs
const tabs = {
  open: document.getElementById("openTab"),
  accepted: document.getElementById("acceptedTab"),
  offer: document.getElementById("offerTab")
};

// modals
const detailsModal = document.getElementById("detailsModal");
const detailsContent = document.getElementById("detailsContent");

const offersModal = document.getElementById("offersModal");
const offersContent = document.getElementById("offersContent");

// ---------------- AUTH ----------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    LoadingSpinner.navigateTo("login.html");
    return;
  }

  currentUser = user;
  await loadRequests();
});

// ---------------- LOAD ----------------
async function loadRequests() {
  const q = query(
    collection(db, "requests"),
    where("userId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  requestsCache = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  await loadOffers();
  updateCounts();
  switchTab("open");
}

// Load all offers for user's requests
async function loadOffers() {
  if (requestsCache.length === 0) {
    offersCache = [];
    return;
  }

  const requestIds = requestsCache.map(r => r.id);
  const q = query(
    collection(db, "offers"),
    where("requestId", "in", requestIds)
  );

  const snap = await getDocs(q);
  offersCache = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

// ---------------- COUNTS ----------------
function updateCounts() {
  openCount.textContent = count("open");
  acceptedCount.textContent = count("accepted");
  offerCount.textContent = offersCache.length;
}

function count(status) {
  return requestsCache.filter(r => r.status === status).length;
}

// ---------------- TAB SWITCH ----------------
function switchTab(tab) {
  currentTab = tab;

  Object.keys(tabs).forEach(key => {
    tabs[key].classList.remove("border-b-2", "border-blue-600", "text-blue-600");
    tabs[key].classList.add("text-gray-600");
  });

  tabs[tab].classList.add("border-b-2", "border-blue-600", "text-blue-600");
  tabs[tab].classList.remove("text-gray-600");

  render();
}

// attach tab clicks - ensure DOM is ready
function initTabs() {
  if (tabs.open) tabs.open.onclick = () => switchTab("open");
  if (tabs.accepted) tabs.accepted.onclick = () => switchTab("accepted");
  if (tabs.offer) tabs.offer.onclick = () => switchTab("offer");
}

// Initialize tabs when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTabs);
} else {
  initTabs();
}

// ---------------- STATUS UI ----------------
function statusStyle(status) {
  switch (status) {
    case "open":
      return "bg-gray-200 text-gray-700";
    case "accepted":
      return "bg-green-100 text-green-700";
    case "offer":
      return "bg-purple-100 text-purple-700";
    case "pending":
      return "bg-yellow-100 text-yellow-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "cancelled":
      return "bg-orange-100 text-orange-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100";
  }
}

// ---------------- RENDER ----------------
function render() {
  let data = [];

  if (currentTab === "offer") {
    // For offer tab, show all offers
    data = offersCache;
    renderOffers(data);
  } else {
    // For other tabs, show requests
    data = requestsCache.filter(r => r.status === currentTab);
    renderRequests(data);
  }
}

function renderRequests(data) {
  if (data.length === 0) {
    requestsList.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  requestsList.innerHTML = data.map(r => `
    <div class="bg-white p-5 rounded-lg shadow">

      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-lg">${r.serviceType || "Service"}</h3>
          <p class="text-sm text-gray-500">${r.location || ""}</p>
        </div>

        <span class="text-xs px-2 py-1 rounded ${statusStyle(r.status)}">
          ${r.status}
        </span>
      </div>

      <p class="text-sm text-gray-600 mt-3">
        ${r.description || ""}
      </p>

      <div class="mt-4 flex justify-between">
        <p class="font-semibold">₦${r.budget || 0}</p>

        <div class="flex gap-2">
          <button onclick="viewDetails('${r.id}')" class="text-blue-600 text-sm">
            Details
          </button>

          <button onclick="viewOffers('${r.id}')" class="text-green-600 text-sm">
            Offers
          </button>
        </div>
      </div>

    </div>
  `).join("");
}

function renderOffers(data) {
  if (data.length === 0) {
    requestsList.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  // Group offers by status
  const groupedOffers = {
    pending: data.filter(o => o.status === "pending"),
    accepted: data.filter(o => o.status === "accepted"),
    rejected: data.filter(o => o.status === "rejected"),
    cancelled: data.filter(o => o.status === "cancelled"),
    completed: data.filter(o => o.status === "completed")
  };

  let html = "";

  if (groupedOffers.pending.length > 0) {
    html += `<div class="mb-6">
      <h3 class="font-bold text-lg mb-3 text-yellow-700">📋 Pending (${groupedOffers.pending.length})</h3>
      ${renderOfferCards(groupedOffers.pending)}
    </div>`;
  }

  if (groupedOffers.accepted.length > 0) {
    html += `<div class="mb-6">
      <h3 class="font-bold text-lg mb-3 text-green-700">✅ Accepted (${groupedOffers.accepted.length})</h3>
      ${renderOfferCards(groupedOffers.accepted)}
    </div>`;
  }

  if (groupedOffers.completed.length > 0) {
    html += `<div class="mb-6">
      <h3 class="font-bold text-lg mb-3 text-blue-700">🎉 Completed (${groupedOffers.completed.length})</h3>
      ${renderOfferCards(groupedOffers.completed)}
    </div>`;
  }

  if (groupedOffers.rejected.length > 0) {
    html += `<div class="mb-6">
      <h3 class="font-bold text-lg mb-3 text-red-700">❌ Rejected (${groupedOffers.rejected.length})</h3>
      ${renderOfferCards(groupedOffers.rejected)}
    </div>`;
  }

  if (groupedOffers.cancelled.length > 0) {
    html += `<div class="mb-6">
      <h3 class="font-bold text-lg mb-3 text-orange-700">⛔ Cancelled (${groupedOffers.cancelled.length})</h3>
      ${renderOfferCards(groupedOffers.cancelled)}
    </div>`;
  }

  requestsList.innerHTML = html;
}

function renderOfferCards(offers) {
  return offers.map(o => `
    <div class="bg-white p-4 rounded-lg shadow mb-3">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="font-semibold text-lg">₦${o.price}</p>
          <p class="text-sm text-gray-500">Request ID: ${o.requestId?.slice(0, 8)}...</p>
        </div>
        <span class="text-xs px-2 py-1 rounded ${statusStyle(o.status)}">
          ${o.status}
        </span>
      </div>
      <p class="text-sm text-gray-600 mt-2">${o.message || ""}</p>
      <div class="mt-3 flex gap-2 justify-end">
        ${o.status === "pending" ? `
          <button onclick="rejectOffer('${o.id}')" class="text-red-600 text-sm">Reject</button>
          <button onclick="acceptOffer('${o.id}', '${o.requestId}')" class="text-green-600 text-sm">Accept</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

// ---------------- DETAILS ----------------
window.viewDetails = function(id) {
  const r = requestsCache.find(x => x.id === id);
  if (!r) return;

  detailsContent.innerHTML = `
    <h2 class="text-xl font-bold mb-2">${r.serviceType}</h2>
    <p><strong>Location:</strong> ${r.location}</p>
    <p><strong>Budget:</strong> ₦${r.budget}</p>
    <p class="mt-3">${r.description}</p>
  `;

  detailsModal.classList.remove("hidden");
};

// close modal
document.getElementById("closeDetailsModal").onclick = () => {
  detailsModal.classList.add("hidden");
};

// ---------------- OFFERS ----------------
window.viewOffers = async function(requestId) {
  offersModal.classList.remove("hidden");
  offersContent.innerHTML = "Loading...";

  const q = query(
    collection(db, "offers"),
    where("requestId", "==", requestId)
  );

  const snap = await getDocs(q);

  const offers = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  if (offers.length === 0) {
    offersContent.innerHTML = "<p class='text-gray-500'>No offers yet</p>";
    return;
  }

  offersContent.innerHTML = offers.map(o => `
    <div class="border p-3 rounded mb-2">

      <p class="font-semibold">₦${o.price}</p>
      <p class="text-sm text-gray-600">${o.message || ""}</p>

      <div class="flex justify-between mt-2">
        <span class="text-xs px-2 py-1 rounded ${statusStyle(o.status)}">
          ${o.status}
        </span>

        ${o.status === "pending" ? `
          <button onclick="acceptOffer('${o.id}', '${requestId}')"
            class="text-green-600 text-sm">
            Accept
          </button>
        ` : ""}
      </div>

    </div>
  `).join("");
};

// close offers
document.getElementById("closeOffersModal").onclick = () => {
  offersModal.classList.add("hidden");
};

// ---------------- REJECT OFFER ----------------
window.rejectOffer = async function(offerId) {
  try {
    // Get offer details for notification
    const offerSnap = await getDocs(query(
      collection(db, "offers"),
      where("__name__", "==", offerId)
    ));
    
    let offer = null;
    offerSnap.forEach(doc => {
      offer = doc.data();
    });

    await updateDoc(doc(db, "offers", offerId), {
      status: "rejected"
    });

    // Create notification for provider
    if (offer && offer.providerId) {
      await createNotification(
        offer.providerId,
        'offer',
        '❌ Offer Rejected',
        `Your offer of ₦${offer.price?.toLocaleString()} has been rejected by the customer.`,
        {
          offerId: offerId,
          requestId: offer.requestId,
          amount: offer.price
        }
      );
    }

    // Create notification for customer
    await createNotification(
      currentUser.uid,
      'offer',
      '✓ Offer Rejected',
      `You have rejected the offer of ₦${offer?.price?.toLocaleString() || 0}.`,
      {
        offerId: offerId,
        requestId: offer?.requestId,
        amount: offer?.price
      }
    );

    await loadOffers();
    render();
  } catch (err) {
    console.error("Error rejecting offer:", err);
    alert("Error rejecting offer");
  }
};

// ---------------- ACCEPT OFFER ----------------
window.acceptOffer = async function(offerId, requestId) {
  try {
    // Get offer details for notification
    const offerSnap = await getDocs(query(
      collection(db, "offers"),
      where("__name__", "==", offerId)
    ));
    
    let offer = null;
    offerSnap.forEach(doc => {
      offer = doc.data();
    });

    await updateDoc(doc(db, "offers", offerId), {
      status: "accepted"
    });

    await updateDoc(doc(db, "requests", requestId), {
      status: "accepted"
    });

    // Create notification for provider
    if (offer && offer.providerId) {
      await createNotification(
        offer.providerId,
        'offer',
        '✅ Offer Accepted',
        `Your offer of ₦${offer.price?.toLocaleString()} has been accepted! Awaiting payment...`,
        {
          offerId: offerId,
          requestId: requestId,
          amount: offer.price
        }
      );
    }

    // Create notification for customer
    await createNotification(
      currentUser.uid,
      'offer',
      '✅ Offer Accepted',
      `You have accepted the offer of ₦${offer?.price?.toLocaleString() || 0}. Proceeding to payment...`,
      {
        offerId: offerId,
        requestId: requestId,
        amount: offer?.price
      }
    );

    // Refresh offers
    await loadOffers();
    render();

    // Redirect to payment with offer details
    LoadingSpinner.navigateTo(`payment.html?offerId=${offerId}&requestId=${requestId}`);
  } catch (err) {
    console.error("Error accepting offer:", err);
    alert("Error accepting offer");
  }
};

// ================= LOGOUT =================
document.querySelectorAll("#logoutBtn, #logoutBtnSideMenu")
  .forEach(btn => {
    btn.addEventListener("click", async () => {
      await signOut(auth);
      LoadingSpinner.navigateTo("login.html");
    });
  });