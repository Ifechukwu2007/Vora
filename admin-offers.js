import { auth, db } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  orderBy,
  updateDoc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import LoadingSpinner from './loading-utils.js';

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
      LoadingSpinner.navigateTo('404.html?attempted=admin');
      return;
    }

    document.body.classList.add('authorized');
    await loadOffers();
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin');
  }
});

let allOffers = [];
let currentOffer = null;
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');

// Load all offers
async function loadOffers() {
  try {
    const q = query(
      collection(db, 'offers'),
      orderBy('createdAt', 'desc')
    );
    
    const snap = await getDocs(q);
    
    allOffers = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    updateStats();
    renderOffers(allOffers);
  } catch (error) {
    console.error('Error loading offers:', error);
    document.getElementById('offersTable').innerHTML = 
      '<tr><td class="px-6 py-4 text-red-500">Error loading offers</td></tr>';
  }
}

// Update statistics
function updateStats() {
  const total = allOffers.length;
  const pending = allOffers.filter(o => o.status === 'pending').length;
  const accepted = allOffers.filter(o => o.status === 'accepted').length;
  const rejected = allOffers.filter(o => o.status === 'rejected').length;
  const completed = allOffers.filter(o => o.status === 'completed').length;

  document.getElementById('totalOffers').textContent = total;
  document.getElementById('pendingOffers').textContent = pending;
  document.getElementById('acceptedOffers').textContent = accepted;
  document.getElementById('rejectedOffers').textContent = rejected;
  document.getElementById('completedOffers').textContent = completed;
}

// Render offers table
function renderOffers(offers) {
  if (offers.length === 0) {
    document.getElementById('offersTable').innerHTML = 
      '<tr><td class="px-6 py-4 text-gray-500">No offers found</td></tr>';
    return;
  }

  document.getElementById('offersTable').innerHTML = offers.map(offer => `
    <tr>
      <td class="px-6 py-4 font-semibold">₦${offer.price?.toLocaleString() || 0}</td>
      <td class="px-6 py-4 text-sm">${offer.providerId?.slice(0, 8) || 'N/A'}</td>
      <td class="px-6 py-4 text-sm">${offer.requestId?.slice(0, 8) || 'N/A'}</td>
      <td class="px-6 py-4 text-sm truncate max-w-xs">${offer.message || 'N/A'}</td>
      <td class="px-6 py-4">
        <span class="px-2 py-1 rounded text-sm ${getStatusColor(offer.status)}">
          ${offer.status || 'N/A'}
        </span>
      </td>
      <td class="px-6 py-4 text-sm">${formatDate(offer.createdAt)}</td>
      <td class="px-6 py-4">
        <button onclick="viewDetails('${offer.id}')" class="text-blue-600 hover:text-blue-800 text-sm">
          View
        </button>
      </td>
    </tr>
  `).join('');
}

// Get status color
function getStatusColor(status) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'accepted':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-orange-100 text-orange-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Format date
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
}

// View details
window.viewDetails = async function(offerId) {
  const offer = allOffers.find(o => o.id === offerId);
  if (!offer) return;

  currentOffer = offer;

  try {
    // Get provider details
    const providerSnap = await getDoc(doc(db, 'users', offer.providerId));
    const provider = providerSnap.exists() ? providerSnap.data() : {};

    // Get request details
    const requestSnap = await getDoc(doc(db, 'requests', offer.requestId));
    const request = requestSnap.exists() ? requestSnap.data() : {};

    // Get request user details
    let requestUser = {};
    if (request.userId) {
      const userSnap = await getDoc(doc(db, 'users', request.userId));
      requestUser = userSnap.exists() ? userSnap.data() : {};
    }

    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');

    content.innerHTML = `
      <div class="space-y-6">
        <div class="border-b pb-4">
          <h3 class="font-bold text-lg mb-2">Offer Information</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <p class="text-gray-600 text-sm">Price</p>
              <p class="text-2xl font-bold">₦${offer.price?.toLocaleString()}</p>
            </div>
            <div>
              <p class="text-gray-600 text-sm">Status</p>
              <span class="px-2 py-1 rounded text-sm ${getStatusColor(offer.status)}">
                ${offer.status}
              </span>
            </div>
          </div>
          <div class="mt-3">
            <p class="text-gray-600 text-sm">Message</p>
            <p>${offer.message || 'No message'}</p>
          </div>
        </div>

        <div class="border-b pb-4">
          <h3 class="font-bold text-lg mb-3">Provider</h3>
          <div>
            <p class="text-gray-600 text-sm">Name</p>
            <p>${provider.name || 'Unknown'}</p>
          </div>
          <div class="mt-2">
            <p class="text-gray-600 text-sm">Email</p>
            <p>${provider.email || 'N/A'}</p>
          </div>
        </div>

        <div class="border-b pb-4">
          <h3 class="font-bold text-lg mb-3">Request Details</h3>
          <div class="space-y-2">
            <div>
              <p class="text-gray-600 text-sm">Service Type</p>
              <p>${request.serviceType || 'N/A'}</p>
            </div>
            <div>
              <p class="text-gray-600 text-sm">Location</p>
              <p>${request.location || 'N/A'}</p>
            </div>
            <div>
              <p class="text-gray-600 text-sm">Budget</p>
              <p>₦${request.budget?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p class="text-gray-600 text-sm">Description</p>
              <p>${request.description || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div>
          <h3 class="font-bold text-lg mb-3">Request Poster</h3>
          <div>
            <p class="text-gray-600 text-sm">Name</p>
            <p>${requestUser.name || 'Unknown'}</p>
          </div>
          <div class="mt-2">
            <p class="text-gray-600 text-sm">Email</p>
            <p>${requestUser.email || 'N/A'}</p>
          </div>
        </div>

        <div>
          <p class="text-gray-600 text-sm">Created</p>
          <p>${formatDate(offer.createdAt)}</p>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading details:', error);
  }
};

// Close modal
window.closeDetailModal = function() {
  document.getElementById('detailModal').classList.add('hidden');
};

// Edit offer
window.editOffer = function() {
  if (!currentOffer) return;

  const editModal = document.getElementById('editModal');
  const editContent = document.getElementById('editContent');

  editContent.innerHTML = `
    <div>
      <label class="block text-sm font-semibold mb-1">Price</label>
      <input type="number" id="editPrice" value="${currentOffer.price || 0}" class="w-full px-3 py-2 border rounded">
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Message</label>
      <textarea id="editMessage" class="w-full px-3 py-2 border rounded">${currentOffer.message || ''}</textarea>
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Status</label>
      <select id="editStatus" class="w-full px-3 py-2 border rounded">
        <option value="pending" ${currentOffer.status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="accepted" ${currentOffer.status === 'accepted' ? 'selected' : ''}>Accepted</option>
        <option value="rejected" ${currentOffer.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        <option value="cancelled" ${currentOffer.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        <option value="completed" ${currentOffer.status === 'completed' ? 'selected' : ''}>Completed</option>
      </select>
    </div>
  `;

  document.getElementById('detailModal').classList.add('hidden');
  editModal.classList.remove('hidden');
};

// Save offer
window.saveOffer = async function() {
  if (!currentOffer) return;

  try {
    const updatedData = {
      price: Number(document.getElementById('editPrice').value),
      message: document.getElementById('editMessage').value,
      status: document.getElementById('editStatus').value
    };

    await updateDoc(doc(db, 'offers', currentOffer.id), updatedData);
    
    alert('Offer updated successfully!');
    document.getElementById('editModal').classList.add('hidden');
    await loadOffers();
  } catch (error) {
    console.error('Error saving offer:', error);
    alert('Error saving offer: ' + error.message);
  }
};

// Delete offer
window.deleteOffer = async function() {
  if (!currentOffer) return;

  if (!confirm('Are you sure you want to delete this offer? This action cannot be undone.')) {
    return;
  }

  try {
    await deleteDoc(doc(db, 'offers', currentOffer.id));
    alert('Offer deleted successfully!');
    document.getElementById('detailModal').classList.add('hidden');
    await loadOffers();
  } catch (error) {
    console.error('Error deleting offer:', error);
    alert('Error deleting offer: ' + error.message);
  }
};

// Close edit modal
window.closeEditModal = function() {
  document.getElementById('editModal').classList.add('hidden');
};

// Search and filter
searchInput.addEventListener('input', filterOffers);
statusFilter.addEventListener('change', filterOffers);

function filterOffers() {
  const searchTerm = searchInput.value.toLowerCase();
  const status = statusFilter.value;

  const filtered = allOffers.filter(offer => {
    const matchesSearch = 
      (offer.message || '').toLowerCase().includes(searchTerm) ||
      offer.price?.toString().includes(searchTerm);
    
    const matchesStatus = !status || offer.status === status;

    return matchesSearch && matchesStatus;
  });

  renderOffers(filtered);
}
