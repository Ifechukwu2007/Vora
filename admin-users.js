import { db } from './firebase-config.js';
import { auth } from './firebase-config.js';
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
      LoadingSpinner.navigateTo('404.html?attempted=admin-users');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-users');
  }
});

let docs = [];
let filtered = [];
let currentDocId = null;

const tableBody = document.getElementById("tableBody");
const panel = document.getElementById("panel");
const editor = document.getElementById("editor");
const search = document.getElementById("search");
const addUserBtn = document.getElementById("addUserBtn");
const saveBtn = document.getElementById("save");
const deleteBtn = document.getElementById("delete");

// Real-time listener
onSnapshot(collection(db, "users"), (snapshot) => {
  docs = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  filtered = [...docs];
  render();
});

function render() {
  if (!filtered.length) {
    tableBody.innerHTML = `
      <div class="p-4 text-gray-400 text-sm">No users found</div>
    `;
    return;
  }

  tableBody.innerHTML = filtered
    .map(
      (u) => `
        <div class="grid grid-cols-4 border-b py-3 text-sm hover:bg-gray-50 cursor-pointer"
             onclick="openDoc('${u.id}')">
          <div class="px-1">${u.email || "-"}</div>
          <div class="px-1">${u.role || "user"}</div>
          <div class="px-1 break-all text-gray-500">${u.uid || u.id}</div>
          <div class="px-1">
            <button class="text-xs text-blue-600" onclick="event.stopPropagation(); openDoc('${u.id}')">
              View
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

search.addEventListener("input", () => {
  const q = search.value.toLowerCase().trim();
  filtered = docs.filter((u) =>
    JSON.stringify(u).toLowerCase().includes(q)
  );
  render();
});

window.openDoc = (id) => {
  currentDocId = id;
  const docData = docs.find((d) => d.id === id);

  panel.classList.remove("hidden");
  editor.value = JSON.stringify(docData, null, 2);
};

saveBtn.addEventListener("click", async () => {
  if (!currentDocId) return;

  try {
    const data = JSON.parse(editor.value);
    delete data.id;

    await updateDoc(doc(db, "users", currentDocId), data);
    alert("User saved");
  } catch (err) {
    alert("Invalid JSON: " + err.message);
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!currentDocId) return;

  if (!confirm("Delete this user?")) return;

  try {
    await deleteDoc(doc(db, "users", currentDocId));
    panel.classList.add("hidden");
    currentDocId = null;
    alert("User deleted");
  } catch (err) {
    alert("Error deleting user: " + err.message);
  }
});

addUserBtn.addEventListener("click", async () => {
  try {
    const ref = await addDoc(collection(db, "users"), {
      email: "newemail@example.com",
      role: "user",
      uid: "",
      name: "New User",
      createdAt: serverTimestamp(),
    });

    openDoc(ref.id);
  } catch (err) {
    alert("Error creating user: " + err.message);
  }
});