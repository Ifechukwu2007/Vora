import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const list = document.getElementById("list");
const markAllBtn = document.getElementById("markAll");

let user = null;

// ================= AUTH =================
onAuthStateChanged(auth, (u) => {
  if (!u) return LoadingSpinner.navigateTo("login.html");
  user = u;
  listenNotifications();
});

// ================= REAL-TIME NOTIFICATIONS =================
function listenNotifications() {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      list.innerHTML = `
        <div class="bg-white p-4 rounded-lg shadow text-gray-500">
          No notifications yet
        </div>
      `;
      return;
    }

    list.innerHTML = "";

    snap.forEach((docSnap) => {
      const n = docSnap.data();

      const el = document.createElement("div");
      el.className =
        "bg-white p-4 rounded-lg shadow flex justify-between items-start";

      el.innerHTML = `
        <div>
          <p class="font-bold ${n.read ? "text-gray-500" : "text-black"}">
            ${n.title || "Notification"}
          </p>
          <p class="text-sm text-gray-600">
            ${n.message || ""}
          </p>
          <p class="text-xs text-gray-400 mt-1">
            ${n.type || "update"}
          </p>
        </div>

        <span class="text-xs px-2 py-1 rounded 
          ${n.read ? "bg-gray-200 text-gray-600" : "bg-blue-100 text-blue-600"}">
          ${n.read ? "Read" : "New"}
        </span>
      `;

      // click = mark as read
      el.addEventListener("click", async () => {
        await updateDoc(doc(db, "notifications", docSnap.id), {
          read: true
        });
      });

      list.appendChild(el);
    });
  });
}

// ================= MARK ALL AS READ =================
markAllBtn.addEventListener("click", async () => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid)
  );

  const snap = await (await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"))
    .getDocs(q);

  snap.forEach(async (d) => {
    await updateDoc(doc(db, "notifications", d.id), {
      read: true
    });
  });
});