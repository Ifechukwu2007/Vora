import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const form = document.getElementById("post-request-form");
const cancelBtn = document.getElementById("cancelBtn");
const backBtn = document.getElementById("backBtn");

let currentUser = null;

// 🔐 Check if user is logged in
onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("You must be logged in to post a request.");
    LoadingSpinner.navigateTo('login.html');
  } else {
    currentUser = user;
  }
});

// 🚀 Handle form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const serviceType = document.getElementById("service-type").value;
  const description = document.getElementById("request-description").value;
  const location = document.getElementById("location").value;
  const dateNeeded = document.getElementById("date-needed").value;
  const timeNeeded = document.getElementById("time-needed").value;
  const budget = document.getElementById("budget").value;
  const fullName = document.getElementById("full-name").value;
  const phone = document.getElementById("phone").value;

  // 🧠 Basic validation
  if (!serviceType || !description || !location || !dateNeeded || !fullName || !phone) {
    alert("Please fill in all required fields.");
    return;
  }

  try {
    // 📝 Create request object
    const requestData = {
      userId: currentUser.uid,
      serviceType,
      description,
      location,
      dateNeeded,
      timeNeeded: timeNeeded || null,
      budget: budget ? Number(budget) : null,
      fullName,
      phone,
      status: "open",
      createdAt: serverTimestamp()
    };

    // 📦 Save to Firestore
    await addDoc(collection(db, "requests"), requestData);

    alert("Request posted successfully!");

    // 🔁 Reset form
    form.reset();

    // 🔄 Redirect (optional)
    LoadingSpinner.navigateTo('my-requests.html');

  } catch (error) {
    console.error("Error posting request:", error);
    alert("Something went wrong. Try again.");
  }
});

// ❌ Cancel button
cancelBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to cancel?")) {
    LoadingSpinner.navigateTo('home.html');
  }
});

// 🔙 Back button
backBtn.addEventListener("click", () => {
  window.history.back();
});