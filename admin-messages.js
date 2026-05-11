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
      LoadingSpinner.navigateTo('404.html?attempted=admin-messages');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-messages');
  }
});

// SAMPLE DATA FOR TESTING
window.addSampleMessage = async () => {
  try {
    await addDoc(collection(db, "messages"), {
      senderName: "John Doe",
      recipientName: "Jane Smith",
      text: "Hello! Is the service still available?",
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    alert("Sample message added!");
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

// ================= LOAD MESSAGES =================
onSnapshot(collection(db, "messages"), (snapshot) => {
  docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  filtered = [...docs];
  render();
  console.log('Messages loaded:', docs.length, docs);
}, (error) => {
  console.error('Error loading messages:', error);
  tableBody.innerHTML = `<div class="p-4 text-red-500 text-sm">Error loading messages: ${error.message}</div>`;
});

// ================= RENDER =================
function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `<div class="p-4 text-gray-400">No messages</div>`;
    return;
  }

  tableBody.innerHTML = filtered.map(m => `
    <div class="grid grid-cols-5 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
         onclick="openDoc('${m.id}')">

      <div>${m.senderName || m.from || "-"}</div>
      <div>${m.recipientName || m.to || "-"}</div>
      <div class="truncate">${m.text || m.message || "-"}</div>
      <div>${formatDate(m.timestamp)}</div>

      <div>
        <button onclick="event.stopPropagation(); openDoc('${m.id}')"
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

  filtered = docs.filter(m =>
    JSON.stringify(m).toLowerCase().includes(q)
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

    await updateDoc(doc(db, "messages", currentDocId), data);
    alert("Message updated");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
};

// ================= DELETE =================
deleteBtn.onclick = async () => {
  if (!confirm("Delete message?")) return;

  try {
    await deleteDoc(doc(db, "messages", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("Message deleted");
  } catch (err) {
    alert("Error deleting message: " + err.message);
  }
};
