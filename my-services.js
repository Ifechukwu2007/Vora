// my-services.js
import { supabase } from "./supabase.js";

const container = document.getElementById("myServicesContainer");
if (!container) {
  console.warn("Missing #myServicesContainer in my-services.html");
}

const els = {
  logoutButtons: document.querySelectorAll("[data-logout], #logoutBtn-payout-settings"),
};

function moneyNGN(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `₦${Math.round(num).toLocaleString("en-NG")}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "V";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function avatarUrl(fullName) {
  const initials = getInitials(fullName);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=0f172a&color=ffffff&rounded=true`;
}

function skeletonCards(count = 6) {
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-lg shadow-md p-4 animate-pulse";
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="h-12 w-12 rounded-full bg-gray-200"></div>
        <div class="flex-1">
          <div class="h-4 w-2/3 bg-gray-200 rounded"></div>
          <div class="h-3 w-1/2 bg-gray-200 rounded mt-2"></div>
        </div>
      </div>
      <div class="mt-4 h-28 bg-gray-100 rounded"></div>
      <div class="mt-4 flex gap-3">
        <div class="h-10 flex-1 bg-gray-200 rounded"></div>
        <div class="h-10 flex-1 bg-gray-200 rounded"></div>
      </div>
    `;
    frag.appendChild(card);
  }
  container.appendChild(frag);
}

let currentProfileId = null;

function renderServiceCard(service) {
  // Expected fields (some may not exist in your DB)
  const id = service.id;
  const title = service.title ?? "Untitled Service";
  const category = service.category ?? "";
  const price = service.price ?? service.base_price ?? null;
  const image = service.image_url ?? service.image ?? "";

  const card = document.createElement("div");
  card.className = "bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition";
  card.style.cursor = 'default';

  const imgEl = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="h-24 w-full object-cover rounded-md border border-gray-200 mb-3" onerror="this.style.display='none'">`
    : `<div class="h-24 w-full bg-gray-100 rounded-md mb-3 flex items-center justify-center border border-gray-200">
         <span class="text-gray-400 font-semibold">No image</span>
       </div>`;

  card.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">
        ${escapeHtml(getInitials(title))}
      </div>
      <div class="flex-1">
        <h3 class="text-lg font-bold text-gray-900 leading-tight">${escapeHtml(title)}</h3>
        ${category ? `<p class="text-sm text-gray-500 mt-1">${escapeHtml(category)}</p>` : ""}
        <p class="text-sm text-indigo-700 font-semibold mt-2">${price !== null ? moneyNGN(price) : "Price on request"}</p>
      </div>
    </div>

    ${imgEl}
  `;

  card.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  return card;
}

async function loadMyServices(profileId) {
  // Prefer provider_id = profileId
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("provider_id", profileId)
    .order("created_at", { ascending: false });

  // If provider_id doesn't exist or doesn't match, this will error out.
  if (error) throw error;
  return data || [];
}

async function main() {
  if (!container) return;

  skeletonCards();

  // Load auth user
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    window.location.href = "auth.html";
    return;
  }

  // Load profile (we need the profile id for provider_id)
  // Here we assume public.profiles.id matches provider_id.
  const user = authData.user;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error(profileErr);
    // Fallback attempt: sometimes profiles.id = auth user id
    const { data: profileAlt, error: profileAltErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileAltErr || !profileAlt) {
      container.innerHTML = `<div class="bg-white rounded-lg shadow-md p-4 text-red-600 font-semibold">Failed to load profile.</div>`;
      return;
    }

    // Use alt
    const services = await loadMyServices(profileAlt.id);
    container.innerHTML = "";
    if (services.length === 0) {
      container.innerHTML = `<div class="bg-white rounded-lg shadow-md p-6 text-gray-600">No services found yet.</div>`;
      return;
    }

    // Set current profile for delete permission checks
    currentProfileId = profileAlt.id;

    services.forEach((s) => container.appendChild(renderServiceCard(s)));

    // Attach delete handler (event delegation)
    container.addEventListener('click', async (ev) => {
      const btn = ev.target.closest && ev.target.closest('.delete-service-btn');
      if (!btn) return;
      const serviceId = btn.dataset.serviceId;
      if (!serviceId) return;

      const confirmed = confirm('Delete this service? This action cannot be undone.');
      if (!confirmed) return;

      btn.disabled = true;
      btn.textContent = 'Deleting...';

      try {
        const { error } = await supabase
          .from('services')
          .delete()
          .eq('id', serviceId)
          .eq('provider_id', currentProfileId);

        if (error) throw error;

        const card = btn.closest('.bg-white') || btn.closest('div');
        if (card && card.parentNode) card.parentNode.removeChild(card);
        alert('Service deleted');
      } catch (err) {
        console.error('Delete failed', err);
        alert('Failed to delete service');
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });

    return;
  }

  if (!profile) {
    container.innerHTML = `<div class="bg-white rounded-lg shadow-md p-6 text-gray-600">No profile found. Please complete your profile.</div>`;
    return;
  }

  const services = await loadMyServices(profile.id);

  container.innerHTML = "";
  if (services.length === 0) {
    container.innerHTML = `<div class="bg-white rounded-lg shadow-md p-6 text-gray-600">No services found yet.</div>`;
    return;
  }

  currentProfileId = profile.id;

  services.forEach((s) => container.appendChild(renderServiceCard(s)));
}

function bindLogout() {
  els.logoutButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "home.html";
    });
  });
}

bindLogout();
main().catch((e) => {
  console.error(e);
  if (container) {
    container.innerHTML = `<div class="bg-white rounded-lg shadow-md p-4 text-red-600 font-semibold">Failed to load services. Check console.</div>`;
  }
});