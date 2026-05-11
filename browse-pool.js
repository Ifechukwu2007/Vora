import { db, auth } from "./firebase-config.js";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------------- STATE ----------------
let currentUser = null;
let allRequests = [];

// ---------------- DOM ----------------
const requestsList = document.getElementById("requestsList");
const noResults = document.getElementById("noResults");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const locationFilter = document.getElementById("locationFilter");
const sortFilter = document.getElementById("sortFilter");

const requestModal = document.getElementById("requestModal");
const modalContent = document.getElementById("modalContent");
const closeModal = document.getElementById("closeModal");

const offerModal = document.getElementById("offerModal");
const closeOfferModal = document.getElementById("closeOfferModal");
const closeOfferBtn = document.getElementById("closeOfferBtn");

const offerForm = document.getElementById("offerForm");

// ---------------- AUTH ----------------
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  await loadRequests();
});

// ---------------- LOAD REQUESTS ----------------
async function loadRequests() {
  try {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    allRequests = [];

    snap.forEach(doc => {
      allRequests.push({
        id: doc.id,
        ...doc.data()
      });
    });

    renderRequests(allRequests);

  } catch (err) {
    console.error(err);
    requestsList.innerHTML = `<p class="text-red-500">Failed to load requests</p>`;
  }
}

// ---------------- FILTER + SORT ----------------
function applyFilters() {
  let filtered = [...allRequests];

  const search = searchInput.value.toLowerCase();
  const category = categoryFilter.value;
  const location = locationFilter.value.toLowerCase();
  const sort = sortFilter.value;

  if (search) {
    filtered = filtered.filter(r =>
      (r.title || "").toLowerCase().includes(search) ||
      (r.description || "").toLowerCase().includes(search)
    );
  }

  if (category) {
    filtered = filtered.filter(r => r.category === category);
  }

  if (location) {
    filtered = filtered.filter(r =>
      (r.location || "").toLowerCase().includes(location)
    );
  }

  // SORT
  if (sort === "budget-high") {
    filtered.sort((a, b) => (b.budget || 0) - (a.budget || 0));
  }

  if (sort === "budget-low") {
    filtered.sort((a, b) => (a.budget || 0) - (b.budget || 0));
  }

  if (sort === "urgent") {
    filtered.sort((a, b) => (b.urgent === true) - (a.urgent === true));
  }

  renderRequests(filtered);
}

// ---------------- RENDER ----------------
function renderRequests(list) {
  if (list.length === 0) {
    requestsList.innerHTML = "";
    noResults.classList.remove("hidden");
    return;
  }

  noResults.classList.add("hidden");

  requestsList.innerHTML = list.map(r => `
    <div class="bg-white p-4 rounded-lg shadow">
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-lg font-bold">${r.serviceType || "Service Request"}</h3>
          <p class="text-sm text-gray-600">${r.location || "No location"}</p>
        </div>
        <p class="font-bold text-blue-600">₦${r.budget || 0}</p>
      </div>

      <p class="text-gray-700 mt-2 text-sm">
        ${(r.description || "").slice(0, 100)}...
      </p>

      <div class="flex justify-between items-center mt-4">
        <span class="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded font-semibold">
          📋 ${r.serviceType || "Service Request"}
        </span>

        <button onclick="viewRequest('${r.id}')"
          class="text-blue-600 text-sm font-semibold">
          View →
        </button>
      </div>
    </div>
  `).join("");
}

// ---------------- VIEW MODAL ----------------
window.viewRequest = function(id) {
  const r = allRequests.find(x => x.id === id);
  if (!r) return;

  modalContent.innerHTML = `
    <h2 class="text-xl font-bold mb-2">${r.serviceType || "Service Request"}</h2>
    <p class="text-gray-600 mb-2">${r.location}</p>
    <p class="mb-4">${r.description}</p>

    <p><strong>Budget:</strong> ₦${r.budget}</p>
    <p><strong>Service:</strong> ${r.serviceType}</p>

    <button onclick="openOffer('${r.id}')"
      class="mt-4 bg-blue-600 text-white px-4 py-2 rounded">
      Submit Offer
    </button>
  `;

  requestModal.classList.remove("hidden");
};

// ---------------- OPEN OFFER ----------------
window.openOffer = function(requestId) {
  if (!currentUser) {
    alert("Login required to send offer");
    return;
  }

  document.getElementById("requestId").value = requestId;

  requestModal.classList.add("hidden");
  offerModal.classList.remove("hidden");
};

// ---------------- SUBMIT OFFER ----------------
offerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const requestId = document.getElementById("requestId").value;
  const price = Number(document.getElementById("offerPrice").value);
  const message = document.getElementById("offerMessage").value;
  const availability = document.getElementById("offerAvailability").value;

  try {
    await addDoc(collection(db, "offers"), {
      requestId,
      providerId: currentUser.uid,
      price,
      message,
      availability,
      status: "pending",
      createdAt: serverTimestamp()
    });

    alert("Offer sent successfully");

    offerModal.classList.add("hidden");
    offerForm.reset();

  } catch (err) {
    console.error(err);
    alert("Failed to send offer");
  }
});

// ---------------- CLOSE MODALS ----------------
closeModal.onclick = () => requestModal.classList.add("hidden");

closeOfferModal.onclick = () => offerModal.classList.add("hidden");
closeOfferBtn.onclick = () => offerModal.classList.add("hidden");

// ---------------- EVENTS ----------------
searchInput.addEventListener("input", applyFilters);
categoryFilter.addEventListener("change", applyFilters);
locationFilter.addEventListener("input", applyFilters);
sortFilter.addEventListener("change", applyFilters);