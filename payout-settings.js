// payout-settings.js
import { supabase } from "./supabase.js";

/**
 * CHANGE THESE to match your schema
 */
const TABLE_NAME = "payout_settings";     // e.g. "payout_settings", "provider_profiles", "profiles", etc.
const COL_OWNER_ID = "user_id";          // column that stores the auth user id (or provider id)
const COL_BANK_NAME = "bank_name";
const COL_ACCOUNT_NUMBER = "account_number";

/**
 * UI refs
 */
const form = document.getElementById("payout-settings-form");
const bankInput = document.getElementById("bank-name");
const accountInput = document.getElementById("account-number");

// optional logout handling if you already use data-logout elsewhere
document.getElementById("logoutBtn-payout-settings")?.addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
    window.location.href = "auth.html";
  } catch (e) {
    console.error(e);
  }
});

function setMessage(html, type = "info") {
  // type: info|error|success
  let el = document.getElementById("payout-status");
  if (!el) {
    el = document.createElement("div");
    el.id = "payout-status";
    el.className = "mt-4 text-sm font-semibold";
    form?.appendChild(el);
  }
  const color =
    type === "error" ? "text-red-700" :
    type === "success" ? "text-green-700" :
    "text-gray-700";

  el.className = `mt-4 text-sm font-semibold ${color}`;
  el.innerHTML = html;
}

function setLoading(isLoading) {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = !!isLoading;
  btn.textContent = isLoading ? "Saving..." : "Save Settings";
}

function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function requireSessionUser() {
  // Your earlier issue was a timeout on getUser(), so use getSession().
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    8000,
    "supabase.auth.getSession()"
  );

  if (error) throw error;
  const user = data?.session?.user;
  if (!user) throw new Error("Not logged in (no active session). Please login again.");
  return user;
}

async function loadPayout(userId) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(`${COL_BANK_NAME}, ${COL_ACCOUNT_NUMBER}`)
    .eq(COL_OWNER_ID, userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function updatePayout(userId, bankName, accountNumber) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      [COL_BANK_NAME]: bankName,
      [COL_ACCOUNT_NUMBER]: accountNumber,
    })
    .eq(COL_OWNER_ID, userId);

  if (error) throw error;
}

async function insertPayout(userId, bankName, accountNumber) {
  const payload = {
    [COL_OWNER_ID]: userId,
    [COL_BANK_NAME]: bankName,
    [COL_ACCOUNT_NUMBER]: accountNumber,
  };

  const { error } = await supabase.from(TABLE_NAME).insert(payload);
  if (error) throw error;
}

async function refreshForm(userId) {
  const existing = await loadPayout(userId);
  if (!existing) {
    bankInput.value = "";
    accountInput.value = "";
    setMessage("No payout settings found yet.", "info");
    return;
  }

  bankInput.value = existing[COL_BANK_NAME] ?? "";
  accountInput.value = existing[COL_ACCOUNT_NUMBER] ?? "";
  setMessage("Loaded your payout settings.", "success");
}

async function init() {
  if (!form) return;

  setMessage("Loading your payout settings…", "info");
  setLoading(true);

  try {
    const user = await requireSessionUser();
    await refreshForm(user.id);
  } catch (e) {
    console.error(e);
    setMessage(`Error: ${e?.message ?? "Unknown error"}`, "error");

    // If auth session missing, send them to login.
    if (String(e?.message ?? "").toLowerCase().includes("not logged in")) {
      window.location.href = "auth.html";
    }
  } finally {
    setLoading(false);
  }
}

form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!form) return;

  const bankName = bankInput?.value?.trim() ?? "";
  const accountNumber = onlyDigits(accountInput?.value);

  // Client validation (matches your HTML pattern too)
  if (!bankName) {
    setMessage("Bank name is required.", "error");
    return;
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    setMessage("Account number must be exactly 10 digits.", "error");
    return;
  }

  setLoading(true);
  setMessage("Saving payout settings…", "info");

  try {
    const user = await requireSessionUser();

    // Decide insert vs update
    const existing = await loadPayout(user.id);
    if (existing) {
      await updatePayout(user.id, bankName, accountNumber);
    } else {
      await insertPayout(user.id, bankName, accountNumber);
    }

    setMessage("Saved ✅", "success");
  } catch (e) {
    console.error(e);
    setMessage(`Save failed: ${e?.message ?? "Unknown error"}`, "error");
  } finally {
    setLoading(false);
  }
});

// start
init();