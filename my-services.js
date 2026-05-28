import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";
import { updateProfilePictureInHeader } from './auth.js';

// =========================
// AUTH + INIT
// =========================

let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("myServicesContainer");
  await updateProfilePictureInHeader();

  // =========================
  // GET USER
  // =========================
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login";
    return;
  }

  currentUser = session.user;

  // =========================
  // LOAD SERVICES
  // =========================
  await loadMyServices(container);

  // =========================
  // LOGOUT
  // =========================
  const logoutBtn = document.getElementById("logoutBtn-my-services");
  const logoutBtnMobile = document.getElementById("logoutBtn");

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  }

  if (logoutBtn) logoutBtn.onclick = logout;
  if (logoutBtnMobile) logoutBtnMobile.onclick = logout;
});

// =========================
// FETCH SERVICES
// =========================

async function loadMyServices(container) {
  try {
    container.innerHTML = `
      <div class="text-center col-span-full text-gray-500">
        Loading your services...
      </div>
    `;

    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("provider_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center col-span-full text-gray-500">
          You have not added any services yet.
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    data.forEach(service => {
      const card = document.createElement("div");

      const image =
        service.image_url ||
        "https://placehold.co/600x400?text=No+Image";

      card.className = `
        bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition
      `;

      card.innerHTML = `
        <img src="${image}" class="h-40 w-full object-cover" />

        <div class="p-4 space-y-2">

          <h3 class="text-lg font-bold text-gray-900">
            ${service.title}
          </h3>

          <p class="text-sm text-gray-500 line-clamp-2">
            ${service.description || ""}
          </p>

          <p class="text-green-600 font-bold">
            ₦${Number(service.price || 0).toLocaleString()}
          </p>

          <p class="text-xs text-gray-400">
            📍 ${service.location || "No location"}
          </p>

          <div class="flex gap-2 pt-2">

            <button 
              class="edit-btn flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm"
              data-id="${service.id}"
            >
              Edit 
            </button>

            <button
              class="delete-btn flex-1 bg-red-600 text-white py-2 rounded-lg text-sm"
              data-id="${service.id}"
            >
              Delete
            </button>

          </div>

        </div>
      `;

      container.appendChild(card);
    });

    // =========================
    // EDIT SERVICE
    // =========================
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        window.location.href = `edit-service.html?id=${id}`;
      });
    });

    // =========================
    // DELETE SERVICE
    // =========================
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;

        const confirmDelete = confirm("Are you sure you want to delete this service?");
        if (!confirmDelete) return;

        const { error } = await supabase
          .from("services")
          .delete()
          .eq("id", id)
          .eq("provider_id", currentUser.id); // security

        if (error) {
          alert("Failed to delete service");
          console.error(error);
          return;
        }

        alert("Service deleted successfully");
        location.reload();
      });
    });

  } catch (err) {
    console.error(err);

    container.innerHTML = `
      <div class="text-center col-span-full text-red-500">
        Failed to load services
      </div>
    `;
  }
}
