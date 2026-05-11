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
      LoadingSpinner.navigateTo('404.html?attempted=admin-payments');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-payments');
  }
});

// SAMPLE DATA FOR TESTING
window.addSamplePayment = async () => {
  try {
    await addDoc(collection(db, "payments"), {
      userName: "John Doe",
      amount: 50000,
      reference: "TXN-" + Date.now(),
      status: "completed",
      createdAt: new Date().toISOString(),
    });
    alert("Sample payment added!");
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
const saveBtn = document.getElementById("save");
const deleteBtn = document.getElementById("delete");

// ================= LOAD PAYMENTS =================
onSnapshot(collection(db, "payments"), (snapshot) => {
  docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  filtered = [...docs];
  render();
  console.log('Payments loaded:', docs.length, docs);
}, (error) => {
  console.error('Error loading payments:', error);
  tableBody.innerHTML = `<div class="p-4 text-red-500 text-sm">Error loading payments: ${error.message}</div>`;
});

// ================= RENDER =================
function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `<div class="p-4 text-gray-400">No payments</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(p => `
    <div class="grid grid-cols-6 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
         onclick="openDoc('${p.id}')">

      <div>${p.userName || p.user || "-"}</div>
      <div>₦${(p.amount || 0).toLocaleString()}</div>
      <div class="text-xs text-gray-500">${p.reference || p.transactionId || "-"}</div>
      <div>
        <span class="text-xs px-2 py-1 rounded ${
          p.status === "completed" ? "bg-green-100 text-green-700" :
          p.status === "pending" ? "bg-yellow-100 text-yellow-700" :
          p.status === "failed" ? "bg-red-100 text-red-700" :
          "bg-gray-100 text-gray-600"
        }">
          ${p.status || "pending"}
        </span>
      </div>
      <div>${formatDate(p.createdAt)}</div>

      <div>
        <button onclick="event.stopPropagation(); openDoc('${p.id}')"
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

  filtered = docs.filter(p =>
    JSON.stringify(p).toLowerCase().includes(q)
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

    await updateDoc(doc(db, "payments", currentDocId), data);
    alert("Payment updated");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
};

// ================= DELETE =================
deleteBtn.onclick = async () => {
  if (!confirm("Delete payment?")) return;

  try {
    await deleteDoc(doc(db, "payments", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("Payment deleted");
  } catch (err) {
    alert("Error deleting payment: " + err.message);
  }
};
