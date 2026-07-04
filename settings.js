// settings.js
import { supabase } from "./supabase.js";

const STORAGE_KEYS = {
  currency: "vora_currency",
  bookingNotifications: "vora_booking_notifications",
  messageNotifications: "vora_message_notifications",
  reviewNotifications: "vora_review_notifications",
  promotionNotifications: "vora_promotion_notifications",
  profileVisibility: "vora_profile_visibility",
  showLocation: "vora_show_location",
};

function byId(id) {
  return document.getElementById(id);
}

function getDefaultSettings() {
  return {
    currency: "NGN",
    bookingNotifications: true,
    messageNotifications: true,
    reviewNotifications: true,
    promotionNotifications: false,
    profileVisibility: true,
    showLocation: true,
  };
}

function readSettingsFromStorage() {
  const defaults = getDefaultSettings();
  const getBool = (key) => {
    const v = localStorage.getItem(key);
    if (v === null) return defaults[key];
    return v === "true";
  };

  return {
    currency: localStorage.getItem(STORAGE_KEYS.currency) || defaults.currency,
    bookingNotifications: getBool(STORAGE_KEYS.bookingNotifications),
    messageNotifications: getBool(STORAGE_KEYS.messageNotifications),
    reviewNotifications: getBool(STORAGE_KEYS.reviewNotifications),
    promotionNotifications: getBool(STORAGE_KEYS.promotionNotifications),
    profileVisibility: getBool(STORAGE_KEYS.profileVisibility),
    showLocation: getBool(STORAGE_KEYS.showLocation),
  };
}

function writeSettingsToStorage(settings) {
  localStorage.setItem(STORAGE_KEYS.currency, settings.currency);

  localStorage.setItem(
    STORAGE_KEYS.bookingNotifications,
    String(!!settings.bookingNotifications)
  );
  localStorage.setItem(
    STORAGE_KEYS.messageNotifications,
    String(!!settings.messageNotifications)
  );
  localStorage.setItem(
    STORAGE_KEYS.reviewNotifications,
    String(!!settings.reviewNotifications)
  );
  localStorage.setItem(
    STORAGE_KEYS.promotionNotifications,
    String(!!settings.promotionNotifications)
  );
  localStorage.setItem(
    STORAGE_KEYS.profileVisibility,
    String(!!settings.profileVisibility)
  );
  localStorage.setItem(
    STORAGE_KEYS.showLocation,
    String(!!settings.showLocation)
  );
}

function resetStorage() {
  const keys = Object.values(STORAGE_KEYS);
  keys.forEach((k) => localStorage.removeItem(k));
}

function applySettingsToUI(settings) {
  // Currency UI: you only have one option (NGN) right now, but this still supports future options.
  // Future: add other radio buttons and set checked based on settings.currency.
  // Notifications:
  byId("bookingNotifications").checked = !!settings.bookingNotifications;
  byId("messageNotifications").checked = !!settings.messageNotifications;
  byId("reviewNotifications").checked = !!settings.reviewNotifications;
  byId("promotionNotifications").checked = !!settings.promotionNotifications;

  // Privacy:
  byId("profileVisibility").checked = !!settings.profileVisibility;
  byId("showLocation").checked = !!settings.showLocation;
}

function readSettingsFromUI() {
  return {
    currency: "NGN", // currently only NGN exists in your HTML (radio is checked by default)
    bookingNotifications: byId("bookingNotifications").checked,
    messageNotifications: byId("messageNotifications").checked,
    reviewNotifications: byId("reviewNotifications").checked,
    promotionNotifications: byId("promotionNotifications").checked,
    profileVisibility: byId("profileVisibility").checked,
    showLocation: byId("showLocation").checked,
  };
}

async function requireAuthOrRedirect() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    window.location.href = "auth.html";
    return null;
  }
  return data.user;
}

function setupLogout() {
  const logoutBtn1 = byId("logoutBtn");
  const logoutBtnSide = byId("logoutBtnSideMenu");

  const handler = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out error:", e?.message || e);
    } finally {
      window.location.href = "auth.html";
    }
  };

  logoutBtn1?.addEventListener("click", handler);
  logoutBtnSide?.addEventListener("click", handler);
}

async function changePasswordFlow() {
  const newPass = window.prompt("Enter your new password:");
  if (!newPass) return;

  const confirm = window.prompt("Confirm new password:");
  if (confirm !== newPass) {
    alert("Passwords do not match.");
    return;
  }

  // Supabase client can update password for the current signed-in user.
  // Requires the user to be signed in (and usually the session must still be valid).
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) {
    alert("Failed to change password: " + error.message);
    return;
  }
  alert("Password changed successfully.");
}

async function deleteAccountFlow() {
  const user = await requireAuthOrRedirect();
  if (!user) return;

  const ok = window.confirm(
    "This will permanently delete your account and associated data (if your DB is configured to cascade). Continue?"
  );
  if (!ok) return;

  // Client-side deletion support depends on your Supabase auth configuration/version.
  // We'll try the common method first.
  // If this fails, tell me the error message and we’ll switch to the correct approach (often Edge Function + service_role).
  try {
    const { error } = await supabase.auth.deleteUser();
    if (error) throw error;
  } catch (e) {
    alert(
      "Account deletion could not be completed via the client. " +
        (e?.message || e) +
        "\n\nNext step: I’ll help you implement an Edge Function using service_role to delete the user safely."
    );
    return;
  }

  window.location.href = "auth.html";
}

function setupButtons() {
  byId("saveSettingsBtn")?.addEventListener("click", async () => {
    const settings = readSettingsFromUI();
    writeSettingsToStorage(settings);
    alert("Settings saved ✅");
  });

  byId("resetSettingsBtn")?.addEventListener("click", () => {
    resetStorage();
    applySettingsToUI(readSettingsFromStorage());
    alert("Settings reset.");
  });

  byId("changePasswordBtn")?.addEventListener("click", () => {
    changePasswordFlow().catch((e) => {
      console.error(e);
      alert("Unexpected error: " + (e?.message || e));
    });
  });

  byId("deleteAccountBtn")?.addEventListener("click", () => {
    deleteAccountFlow().catch((e) => {
      console.error(e);
      alert("Unexpected error: " + (e?.message || e));
    });
  });
}

async function init() {
  // Auth gate (prevents using settings page unauthenticated)
  await requireAuthOrRedirect();

  setupLogout();
  setupButtons();

  const settings = readSettingsFromStorage();
  applySettingsToUI(settings);
}

init().catch((err) => {
  console.error("settings.js init error:", err);
  alert("Failed to load settings page.");
});