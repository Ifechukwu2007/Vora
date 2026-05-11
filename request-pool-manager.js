import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from "./firebase-config.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------------- STATE ----------------
let currentUser = null;

// ---------------- INIT ----------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in → still allow viewing (marketing page)
    console.log("Guest mode");
  } else {
    currentUser = user;
    console.log("Logged in:", user.uid);
  }

  await loadStats();
  setupQuickActions();
});

// ---------------- LOAD GLOBAL STATS ----------------
async function loadStats() {
  try {
    const requestsSnap = await getDocs(collection(db, "requests"));
    const offersSnap = await getDocs(collection(db, "offers"));

    const totalRequests = requestsSnap.size;
    const totalOffers = offersSnap.size;

    // Inject stats into hero section (since you didn’t give IDs, we improvise)
    const hero = document.querySelector("section.bg-gradient-to-r");

    if (hero) {
      const statsDiv = document.createElement("div");
      statsDiv.className = "mt-6 text-sm text-blue-100";

      statsDiv.innerHTML = `
        <p>${totalRequests} requests posted • ${totalOffers} offers submitted</p>
      `;

      hero.appendChild(statsDiv);
    }

  } catch (err) {
    console.error("Stats error:", err);
  }
}

// ---------------- QUICK ACTIONS ----------------
function setupQuickActions() {
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;

      if (action === "browse") {
        LoadingSpinner.navigateTo('browse-pool.html');
      }

      if (action === "message") {
        LoadingSpinner.navigateTo('my-messages.html');
      }

      if (action === "provider") {
        LoadingSpinner.navigateTo('add-service.html');
      }
    });
  });
}

// ---------------- CTA BUTTON ENHANCEMENT ----------------
document.querySelectorAll("a[href]").forEach(link => {
  link.addEventListener("click", () => {
    // tiny UX: show loading cursor
    document.body.style.cursor = "progress";
  });
});

// ---------------- FAQ AUTO CLOSE (nice touch) ----------------
document.querySelectorAll("details").forEach(detail => {
  detail.addEventListener("toggle", () => {
    if (detail.open) {
      document.querySelectorAll("details").forEach(d => {
        if (d !== detail) d.removeAttribute("open");
      });
    }
  });
});