import { auth, db } from './firebase-config.js';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  orderBy,
  where,
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
    await loadRequests();
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin');
  }
});

let allRequests = [];
let currentRequest = null;
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');

// Load all requests
async function loadRequests() {
  try {
    const q = query(
      collection(db, 'requests'),
      orderBy('createdAt', 'desc')
    );
    
    const snap = await getDocs(q);
    
    allRequests = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    updateStats();
    renderRequests(allRequests);
  } catch (error) {
    console.error('Error loading requests:', error);
    document.getElementById('requestsTable').innerHTML = 
      '<tr><td class="px-6 py-4 text-red-500">Error loading requests</td></tr>';
  }
}

// Update statistics
function updateStats() {
  const total = allRequests.length;
  const open = allRequests.filter(r => r.status === 'open').length;
  const accepted = allRequests.filter(r => r.status === 'accepted').length;
  const completed = allRequests.filter(r => r.status === 'completed').length;

  document.getElementById('totalRequests').textContent = total;
  document.getElementById('openRequests').textContent = open;
  document.getElementById('acceptedRequests').textContent = accepted;
  document.getElementById('completedRequests').textContent = completed;
}

// Render requests table
function renderRequests(requests) {
  if (requests.length === 0) {
    document.getElementById('requestsTable').innerHTML = 
      '<tr><td class="px-6 py-4 text-gray-500">No requests found</td></tr>';
    return;
  }

  document.getElementById('requestsTable').innerHTML = requests.map(req => `
    <tr>
      <td class="px-6 py-4">${req.serviceType || 'N/A'}</td>
      <td class="px-6 py-4">${req.location || 'N/A'}</td>
      <td class="px-6 py-4">₦${req.budget?.toLocaleString() || 0}</td>
      <td class="px-6 py-4 text-sm">${req.userId?.slice(0, 8) || 'N/A'}</td>
      <td class="px-6 py-4">
        <span class="px-2 py-1 rounded text-sm ${getStatusColor(req.status)}">
          ${req.status || 'N/A'}
        </span>
      </td>
      <td class="px-6 py-4 text-sm">${formatDate(req.createdAt)}</td>
      <td class="px-6 py-4">
        <button onclick="viewDetails('${req.id}')" class="text-blue-600 hover:text-blue-800 text-sm">
          View
        </button>
      </td>
    </tr>
  `).join('');
}

// Get status color
function getStatusColor(status) {
  switch (status) {
    case 'open':
      return 'bg-yellow-100 text-yellow-800';
    case 'accepted':
      return 'bg-green-100 text-green-800';
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
window.viewDetails = async function(requestId) {
  const req = allRequests.find(r => r.id === requestId);
  if (!req) return;

  currentRequest = req;

  try {
    // Get user details
    const userSnap = await getDoc(doc(db, 'users', req.userId));
    const user = userSnap.exists() ? userSnap.data() : {};

    // Get offers for this request
    const offersQ = query(
      collection(db, 'offers'),
      where('requestId', '==', requestId)
    );
    const offersSnap = await getDocs(offersQ);
    const offers = offersSnap.docs.map(d => d.data());

    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');

    content.innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="font-semibold text-gray-600">Service Type</h3>
          <p class="text-lg">${req.serviceType}</p>
        </div>
        
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-semibold text-gray-600">Location</h3>
            <p>${req.location}</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-600">Budget</h3>
            <p>₦${req.budget?.toLocaleString()}</p>
          </div>
        </div>

        <div>
          <h3 class="font-semibold text-gray-600">Description</h3>
          <p>${req.description}</p>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-semibold text-gray-600">Posted By</h3>
            <p>${user.name || 'Unknown'}</p>
            <p class="text-sm text-gray-500">${user.email}</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-600">Status</h3>
            <span class="px-2 py-1 rounded text-sm ${getStatusColor(req.status)}">
              ${req.status}
            </span>
          </div>
        </div>

        <div>
          <h3 class="font-semibold text-gray-600">Created</h3>
          <p>${formatDate(req.createdAt)}</p>
        </div>

        <div>
          <h3 class="font-semibold text-gray-600">Offers (${offers.length})</h3>
          <div class="space-y-2 mt-2">
            ${offers.length > 0 ? offers.map(o => `
              <div class="border p-2 rounded">
                <p class="font-semibold">₦${o.price?.toLocaleString()}</p>
                <p class="text-sm">${o.message}</p>
                <span class="text-xs px-1 py-0.5 rounded ${getStatusColor(o.status)}">
                  ${o.status}
                </span>
              </div>
            `).join('') : '<p class="text-gray-500">No offers yet</p>'}
          </div>
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

// Edit request
window.editRequest = function() {
  if (!currentRequest) return;

  const editModal = document.getElementById('editModal');
  const editContent = document.getElementById('editContent');

  editContent.innerHTML = `
    <div>
      <label class="block text-sm font-semibold mb-1">Service Type</label>
      <input type="text" id="editServiceType" value="${currentRequest.serviceType || ''}" class="w-full px-3 py-2 border rounded">
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Location</label>
      <input type="text" id="editLocation" value="${currentRequest.location || ''}" class="w-full px-3 py-2 border rounded">
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Budget</label>
      <input type="number" id="editBudget" value="${currentRequest.budget || 0}" class="w-full px-3 py-2 border rounded">
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Description</label>
      <textarea id="editDescription" class="w-full px-3 py-2 border rounded">${currentRequest.description || ''}</textarea>
    </div>
    <div>
      <label class="block text-sm font-semibold mb-1">Status</label>
      <select id="editStatus" class="w-full px-3 py-2 border rounded">
        <option value="open" ${currentRequest.status === 'open' ? 'selected' : ''}>Open</option>
        <option value="accepted" ${currentRequest.status === 'accepted' ? 'selected' : ''}>Accepted</option>
        <option value="completed" ${currentRequest.status === 'completed' ? 'selected' : ''}>Completed</option>
      </select>
    </div>
  `;

  document.getElementById('detailModal').classList.add('hidden');
  editModal.classList.remove('hidden');
};

// Save request
window.saveRequest = async function() {
  if (!currentRequest) return;

  try {
    const updatedData = {
      serviceType: document.getElementById('editServiceType').value,
      location: document.getElementById('editLocation').value,
      budget: Number(document.getElementById('editBudget').value),
      description: document.getElementById('editDescription').value,
      status: document.getElementById('editStatus').value
    };

    await updateDoc(doc(db, 'requests', currentRequest.id), updatedData);
    
    alert('Request updated successfully!');
    document.getElementById('editModal').classList.add('hidden');
    await loadRequests();
  } catch (error) {
    console.error('Error saving request:', error);
    alert('Error saving request: ' + error.message);
  }
};

// Delete request
window.deleteRequest = async function() {
  if (!currentRequest) return;

  if (!confirm('Are you sure you want to delete this request? This action cannot be undone.')) {
    return;
  }

  try {
    await deleteDoc(doc(db, 'requests', currentRequest.id));
    alert('Request deleted successfully!');
    document.getElementById('detailModal').classList.add('hidden');
    await loadRequests();
  } catch (error) {
    console.error('Error deleting request:', error);
    alert('Error deleting request: ' + error.message);
  }
};

// Close edit modal
window.closeEditModal = function() {
  document.getElementById('editModal').classList.add('hidden');
};

// Search and filter
searchInput.addEventListener('input', filterRequests);
statusFilter.addEventListener('change', filterRequests);

function filterRequests() {
  const searchTerm = searchInput.value.toLowerCase();
  const status = statusFilter.value;

  const filtered = allRequests.filter(req => {
    const matchesSearch = 
      (req.serviceType || '').toLowerCase().includes(searchTerm) ||
      (req.location || '').toLowerCase().includes(searchTerm) ||
      (req.description || '').toLowerCase().includes(searchTerm);
    
    const matchesStatus = !status || req.status === status;

    return matchesSearch && matchesStatus;
  });

  renderRequests(filtered);
}
