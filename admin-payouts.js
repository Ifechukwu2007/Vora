import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import LoadingSpinner from './loading-utils.js';
import { 
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let docs = [];
let filtered = [];
let currentDocId = null;

const tableBody = document.getElementById("tableBody");
const panel = document.getElementById("panel");
const editor = document.getElementById("editor");
const search = document.getElementById("search");
const saveBtn = document.getElementById("save");
const deleteBtn = document.getElementById("delete");

// ================= AUTH CHECK =================
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
      LoadingSpinner.navigateTo('404.html?attempted=admin-payouts'); return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
    loadData();
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-payouts');
  }
});

function loadData() {
// ================= LOAD PAYOUT SETTINGS =================
onSnapshot(collection(db, "payout_settings"), (snapshot) => {
  docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  filtered = [...docs];
  render();
  console.log('Payout settings loaded:', docs.length, docs);
}, (error) => {
  console.error('Error loading payout settings:', error);
  tableBody.innerHTML = `<div class="p-4 text-red-500 text-sm">Error loading payout settings: ${error.message}</div>`;
});

// ================= RENDER =================
function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `<div class="p-4 text-gray-400">No payout settings</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(p => `
    <div class="grid grid-cols-5 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
         onclick="openDoc('${p.id}')">

      <div class="text-xs text-gray-500">${p.id.substring(0, 8)}...</div>
      <div>${p.bankName || "-"}</div>
      <div class="text-xs text-gray-500">***${(p.accountNumber || "").slice(-4)}</div>
      <div>${formatDate(p.updatedAt)}</div>

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

    await updateDoc(doc(db, "payout_settings", currentDocId), data);
    alert("Payout settings updated");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
};

// ================= DELETE =================
deleteBtn.onclick = async () => {
  if (!confirm("Delete payout settings?")) return;

  try {
    await deleteDoc(doc(db, "payout_settings", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("Payout settings deleted");
  } catch (err) {
    alert("Error deleting payout settings: " + err.message);
  }
};
}
