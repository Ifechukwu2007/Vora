import { auth, db } from './firebase-config.js';
import { 
  collection,
  getDocs,
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
      LoadingSpinner.navigateTo('404.html?attempted=admin-bookings');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-bookings');
  }
});

// SAMPLE DATA FOR TESTING
window.addSampleBooking = async () => {
  try {
    await addDoc(collection(db, "bookings"), {
      customerName: "John Doe",
      serviceName: "Plumbing Service",
      price: 50000,
      scheduledDate: new Date().toISOString().split('T')[0],
      status: "pending",
      createdAt: serverTimestamp(),
    });
    alert("Sample booking added!");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

let docs = [];
let filtered = [];
let currentDocId = null;

const tableBody = document.getElementById("tableBody");
const panel = document.getElementById("panel");
const editor = document.getElementById("editor");

const search = document.getElementById("search");
const addBtn = document.getElementById("addBookingBtn");
const saveBtn = document.getElementById("save");
const deleteBtn = document.getElementById("delete");

// ================= LOAD BOOKINGS =================
onSnapshot(collection(db, "bookings"), (snapshot) => {
  docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  filtered = [...docs];
  render();
  console.log('Bookings loaded:', docs.length, docs);
}, (error) => {
  console.error('Error loading bookings:', error);
  tableBody.innerHTML = `<div class="p-4 text-red-500 text-sm">Error loading bookings: ${error.message}</div>`;
});

// ================= RENDER =================
function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `<div class="p-4 text-gray-400">No bookings</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(b => `
    <div class="grid grid-cols-6 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
         onclick="openDoc('${b.id}')">

      <div>${b.customerName || b.userName || "-"}</div>
      <div>${b.serviceName || b.service || "-"}</div>
      <div>₦${(b.price || b.amount || 0).toLocaleString()}</div>
      <div>${b.scheduledDate || b.date || "-"}</div>

      <div>
        <span class="text-xs px-2 py-1 rounded ${
          b.status === "completed" ? "bg-green-100 text-green-700" :
          b.status === "pending" ? "bg-yellow-100 text-yellow-700" :
          b.status === "cancelled" ? "bg-red-100 text-red-700" :
          "bg-gray-100 text-gray-600"
        }">
          ${b.status || "pending"}
        </span>
      </div>

      <div>
        <button onclick="event.stopPropagation(); openDoc('${b.id}')"
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

  filtered = docs.filter(b =>
    JSON.stringify(b).toLowerCase().includes(q)
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

    await updateDoc(doc(db, "bookings", currentDocId), data);
    alert("Booking updated");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
};

// ================= DELETE =================
deleteBtn.onclick = async () => {
  if (!confirm("Delete booking?")) return;

  try {
    await deleteDoc(doc(db, "bookings", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("Booking deleted");
  } catch (err) {
    alert("Error deleting booking: " + err.message);
  }
};

// ================= ADD =================
addBtn.onclick = async () => {
  try {
    const ref = await addDoc(collection(db, "bookings"), {
      customerName: "New Customer",
      serviceName: "",
      price: 0,
      scheduledDate: "",
      status: "pending",
      createdAt: serverTimestamp(),
    });

    openDoc(ref.id);
  } catch (err) {
    alert("Error creating booking: " + err.message);
  }
};