import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let badgeEl = document.getElementById("notificationBadge");
let currentUser = null;

// fallback safety
function safeShowBadge(count) {
  if (!badgeEl) return;

  if (count > 0) {
    badgeEl.textContent = count;
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }
}

// AUTH LISTENER
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  currentUser = user;
  listenNotifications();
});

// REAL-TIME FIRESTORE LISTENER
function listenNotifications() {
  if (!currentUser) return;

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", currentUser.uid),
    where("status", "==", "unread")
  );

  onSnapshot(q, (snapshot) => {
    safeShowBadge(snapshot.size);
  });
}