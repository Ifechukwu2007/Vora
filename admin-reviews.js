import { auth, db } from './firebase-config.js';
import { 
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  getDoc
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
      // Redirect without showing page content
      LoadingSpinner.navigateTo('404.html?attempted=admin-reviews');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-reviews');
  }
});

// SAMPLE DATA FOR TESTING
window.addSampleReview = async () => {
  try {
    await addDoc(collection(db, "reviews"), {
      reviewerName: "John Doe",
      reviewerId: "user123",
      serviceName: "Plumbing Service",
      serviceId: "service123",
      rating: 5,
      comment: "Excellent service, very professional!",
      createdAt: serverTimestamp(),
    });
    alert("Sample review added!");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// Helper function to safely convert timestamps
function formatDate(timestamp) {
  if (!timestamp) return "-";
  try {
    // Handle Firestore Timestamp objects
    if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
    // Handle ISO strings
    if (typeof timestamp === 'string') return new Date(timestamp).toLocaleDateString();
    // Handle millisecond numbers
    if (typeof timestamp === 'number') return new Date(timestamp).toLocaleDateString();
    // Handle Date objects
    if (timestamp instanceof Date) return timestamp.toLocaleDateString();
    return "-";
  } catch (e) {
    return "-";
  }
}

let docs = [];
let filtered = [];
let currentDocId = null;

const tableBody = document.getElementById("tableBody");
const panel = document.getElementById("panel");
const editor = document.getElementById("editor");
const search = document.getElementById("search");
const saveBtn = document.getElementById("save");
const deleteBtn = document.getElementById("delete");

// ================= LOAD REVIEWS =================
onSnapshot(collection(db, "reviews"), (snapshot) => {
  docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  filtered = [...docs];
  render();
  console.log('Reviews loaded:', docs.length, docs);
}, (error) => {
  console.error('Error loading reviews:', error);
  tableBody.innerHTML = `<div class="p-4 text-red-500 text-sm">Error loading reviews: ${error.message}</div>`;
});

// ================= RENDER =================
function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `<div class="p-4 text-gray-400">No reviews</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(r => `
    <div class="grid grid-cols-6 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
         onclick="openDoc('${r.id}')">

      <div>${r.reviewerName || "-"}</div>
      <div>${r.serviceName || "-"}</div>
      <div>
        <span class="text-yellow-500">★</span> ${r.rating || 0}/5
      </div>
      <div class="truncate">${r.comment || "-"}</div>
      <div>${formatDate(r.createdAt)}</div>

      <div>
        <button onclick="event.stopPropagation(); openDoc('${r.id}')"
          class="text-blue-600 text-xs">
          View
        </button>
      </div>

    </div>
  `).join("");
}

// ================= SEARCH =================
search.addEventListener("input", () => {
  const q = search.value.toLowerCase();

  filtered = docs.filter(r =>
    JSON.stringify(r).toLowerCase().includes(q)
  );

  render();
});

// ================= OPEN DOC =================
window.openDoc = (id) => {
  currentDocId = id;
  const docData = docs.find(d => d.id === id);

  panel.classList.remove("hidden");
  editor.value = JSON.stringify(docData, null, 2);
};

// ================= SAVE =================
saveBtn.onclick = async () => {
  try {
    const data = JSON.parse(editor.value);
    delete data.id;

    await updateDoc(doc(db, "reviews", currentDocId), data);
    alert("Review updated");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
};

// ================= DELETE =================
deleteBtn.onclick = async () => {
  if (!confirm("Delete review?")) return;

  try {
    await deleteDoc(doc(db, "reviews", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("Review deleted");
  } catch (err) {
    alert("Error deleting review: " + err.message);
  }
};
