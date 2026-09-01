// settings.js
//
// SCHEMA ASSUMPTIONS — read this first
// -------------------------------------------------------------------
// Columns this file expects to ALREADY exist on `profiles` (same ones
// profile.js already reads/writes):
//   id, full_name, email, phone, location, profile_picture, verified, country
//
// Columns this file will TRY to use if present, and will quietly fall
// back to a sensible default for if they're missing (no crash, no
// broken page):
//   profiles.date_of_birth            (date)
//   profiles.notification_preferences (jsonb)
//   profiles.privacy_settings         (jsonb)
//   profiles.business_verified        (boolean)
//
// If you want these to actually persist, run in Supabase:
//   ALTER TABLE profiles ADD COLUMN date_of_birth date;
//   ALTER TABLE profiles ADD COLUMN notification_preferences jsonb DEFAULT '{}'::jsonb;
//   ALTER TABLE profiles ADD COLUMN privacy_settings jsonb DEFAULT '{}'::jsonb;
//   ALTER TABLE profiles ADD COLUMN business_verified boolean DEFAULT false;
//
// Optional tables — features degrade to "not available yet" if these
// don't exist:
//   payment_methods (id, user_id, brand, last4, is_default, created_at)
//   account_deletion_requests (id, user_id, requested_at, status)
//
// Region/city: your schema (per profile.js) only has a single free-text
// `location` field, not separate city/region columns. This file
// best-effort splits "City, Region" out of that string (on the comma)
// rather than assuming columns that don't exist. If you later add real
// `city`/`region` columns, swap the split logic out for direct reads.
// -------------------------------------------------------------------

import { supabase } from "./supabase.js";
import { sendEmailToUserId } from "./email-service.js";
import { getCountryConfig } from "./country-config.js";

const BUCKET_NAME = "profile-pictures";

// Small local display map for flag + currency, since we don't know the
// exact shape getCountryConfig() returns beyond phoneCode (confirmed in
// profile.js). Extend this as you support more countries — ideally move
// it into country-config.js later so there's one source of truth.
const COUNTRY_DISPLAY = {
  Nigeria: { flag: "🇳🇬", currency: "NGN ₦" },
  "South Africa": { flag: "🇿🇦", currency: "ZAR R" },
};

const DEFAULT_NOTIFICATION_PREFS = {
  notificationSounds: true,
  bookingNotifications: true,
  bookingReminders: true,
  bookingChanges: true,
  messageNotifications: true,
  messagePreviews: true,
  paymentReceived: true,
  payoutProcessed: true,
  paymentFailed: true,
  marketingPromotions: false,
  marketingUpdates: false,
};

const DEFAULT_PRIVACY_SETTINGS = {
  profileVisibility: "Public", // "Public" | "Private"
  showProfileInSearch: true,
  showApproximateLocation: true,
  personalizedRecommendations: true,
  showLocation: true,
};

const els = {
  userModeBadge: document.getElementById("userModeBadge"),

  profileAvatar: document.getElementById("profileAvatar"),
  accountName: document.getElementById("accountName"),
  displayName: document.getElementById("displayName"),
  displayEmail: document.getElementById("displayEmail"),
  displayPhone: document.getElementById("displayPhone"),
  displayDob: document.getElementById("displayDob"),

  resetSettingsBtn: document.getElementById("resetSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),

  countryDisplay: document.getElementById("countryDisplay"),
  regionLabel: document.getElementById("regionLabel"),
  regionDisplay: document.getElementById("regionDisplay"),
  cityDisplay: document.getElementById("cityDisplay"),
  currencyDisplay: document.getElementById("currencyDisplay"),
  preferencesCurrency: document.getElementById("preferencesCurrency"),
  preferencesLocation: document.getElementById("preferencesLocation"),

  changePasswordBtn: document.getElementById("changePasswordBtn"),
  logoutAllDevicesBtnSecondary: document.getElementById("logoutAllDevicesBtnSecondary"),

  notificationSounds: document.getElementById("notificationSounds"),
  bookingNotifications: document.getElementById("bookingNotifications"),
  bookingReminders: document.getElementById("bookingReminders"),
  bookingChanges: document.getElementById("bookingChanges"),
  messageNotifications: document.getElementById("messageNotifications"),
  messagePreviews: document.getElementById("messagePreviews"),
  paymentReceived: document.getElementById("paymentReceived"),
  payoutProcessed: document.getElementById("payoutProcessed"),
  paymentFailed: document.getElementById("paymentFailed"),
  marketingPromotions: document.getElementById("marketingPromotions"),
  marketingUpdates: document.getElementById("marketingUpdates"),

  paymentMethodsList: document.getElementById("paymentMethodsList"),
  addPaymentMethodBtn: document.getElementById("addPaymentMethodBtn"),

  profileVisibility: document.getElementById("profileVisibility"),
  profileVisibilityLabel: document.getElementById("profileVisibilityLabel"),
  showProfileInSearch: document.getElementById("showProfileInSearch"),
  showApproximateLocation: document.getElementById("showApproximateLocation"),
  personalizedRecommendations: document.getElementById("personalizedRecommendations"),
  showLocation: document.getElementById("showLocation"),

  requestDeletionBtn: document.getElementById("requestDeletionBtn"),

  identityVerified: null, // resolved via DOM query in loadProviderVerification()
  phoneVerified: null,
  emailVerified: null,
  businessVerified: null,
};

let currentUser = null;
let currentProfile = {};
let savedNotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
let savedPrivacySettings = { ...DEFAULT_PRIVACY_SETTINGS };

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function getInitials(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDob(value) {
  if (!value) return "Not set";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not set";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "Not set";
  }
}

// Splits a single free-text `location` field like "Onitsha, Anambra"
// into { city, region }. Falls back gracefully for anything that
// doesn't match that shape.
function splitLocation(location) {
  if (!location) return { city: "", region: "" };
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], region: parts.slice(1).join(", ") };
  return { city: parts[0] || "", region: "" };
}

async function getProfilePictureUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  try {
    const { data } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(pathOrUrl, 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
  } catch {
    // fall through to public URL attempt
  }

  const publicUrlRes = supabase.storage.from(BUCKET_NAME).getPublicUrl(pathOrUrl);
  return publicUrlRes?.data?.publicUrl || "";
}

// Runs a Supabase update and swallows "column doesn't exist"-type
// errors so an unfinished part of the schema doesn't break the rest of
// the page. Returns true on success, false on failure.
async function tryUpdateProfile(userId, updates, featureLabel) {
  try {
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn(`Could not save ${featureLabel}:`, err?.message || err);
    return false;
  }
}

// ---------------------------------------------------------------------
// Load: profile, country/region, provider mode, verification
// ---------------------------------------------------------------------

async function loadUserAndProfile() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    window.location.replace("home.html");
    return false;
  }
  currentUser = authData.user;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, location, profile_picture, verified, country")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) throw error;
  currentProfile = data || {};

  // Optional extended columns — separate query so a missing column here
  // can't break the query above.
  try {
    const { data: extended } = await supabase
      .from("profiles")
      .select("date_of_birth, business_verified")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (extended) currentProfile = { ...currentProfile, ...extended };
  } catch (err) {
    console.warn("Extended profile columns not available yet:", err?.message || err);
  }

  renderPersonalInfo();
  await renderProfilePicture();
  renderCountryAndRegion();
  await renderUserMode();
  renderProviderVerification();

  return true;
}

function renderPersonalInfo() {
  const name = currentProfile.full_name || "Unnamed user";
  if (els.accountName) els.accountName.textContent = name;
  if (els.displayName) els.displayName.textContent = name || "Not set";
  if (els.displayEmail) els.displayEmail.textContent = currentProfile.email || currentUser?.email || "Not set";
  if (els.displayPhone) els.displayPhone.textContent = currentProfile.phone || "Not set";
  if (els.displayDob) els.displayDob.textContent = formatDob(currentProfile.date_of_birth);
  if (els.profileAvatar) els.profileAvatar.textContent = getInitials(name);
}

async function renderProfilePicture() {
  if (!els.profileAvatar || !currentProfile.profile_picture) return;
  const url = await getProfilePictureUrl(currentProfile.profile_picture);
  if (!url) return;
  els.profileAvatar.textContent = "";
  els.profileAvatar.style.backgroundImage = `url("${url}")`;
  els.profileAvatar.style.backgroundSize = "cover";
  els.profileAvatar.style.backgroundPosition = "center";
}

function renderCountryAndRegion() {
  const country = currentProfile.country || "";
  const display = COUNTRY_DISPLAY[country];
  const { city, region } = splitLocation(currentProfile.location);

  if (els.countryDisplay) {
    els.countryDisplay.textContent = country ? `${display?.flag ? display.flag + " " : ""}${country}` : "Not set";
  }
  if (els.regionDisplay) els.regionDisplay.textContent = region || "Not set";
  if (els.cityDisplay) els.cityDisplay.textContent = city || "Not set";

  const currencyText = display?.currency || "—";
  if (els.currencyDisplay) els.currencyDisplay.textContent = currencyText;
  if (els.preferencesCurrency) els.preferencesCurrency.textContent = currencyText;
  if (els.preferencesLocation) {
    els.preferencesLocation.textContent = currentProfile.location
      ? `${currentProfile.location}${country ? ", " + country : ""}`
      : country || "Not set";
  }
}

async function renderUserMode() {
  if (!els.userModeBadge || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from("services")
      .select("id")
      .eq("provider_id", currentUser.id)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    els.userModeBadge.textContent = data ? "Provider mode" : "Customer mode";
    els.userModeBadge.classList.remove("hidden");
  } catch (err) {
    console.warn("Could not determine provider status:", err?.message || err);
  }
}

function renderProviderVerification() {
  // Email verification: Supabase auth tracks this directly on the user.
  const emailVerifiedEl = document.querySelector('#provider-settings [class*="rounded-2xl"]:nth-child(3) p:last-child');
  const emailIsVerified = Boolean(currentUser?.email_confirmed_at);
  if (emailVerifiedEl) {
    emailVerifiedEl.textContent = emailIsVerified ? "✓ Verified" : "Not verified";
    emailVerifiedEl.className = `mt-2 text-base font-medium ${emailIsVerified ? "text-emerald-700" : "text-amber-700"}`;
  }

  // Identity: mirrors profile.js's use of profiles.verified.
  const identityVerifiedEl = document.querySelector('#provider-settings [class*="rounded-2xl"]:nth-child(1) p:last-child');
  const identityIsVerified = Boolean(currentProfile.verified);
  if (identityVerifiedEl) {
    identityVerifiedEl.textContent = identityIsVerified ? "✓ Verified" : "Not verified";
    identityVerifiedEl.className = `mt-2 text-base font-medium ${identityIsVerified ? "text-emerald-700" : "text-amber-700"}`;
  }

  // Phone: no phone-verification column exists in your schema yet, so
  // rather than hardcode "✓ Verified" (as the static HTML did), we show
  // an honest "Not verified" unless you add a real column for this.
  const phoneVerifiedEl = document.querySelector('#provider-settings [class*="rounded-2xl"]:nth-child(2) p:last-child');
  if (phoneVerifiedEl) {
    phoneVerifiedEl.textContent = "Not verified";
    phoneVerifiedEl.className = "mt-2 text-base font-medium text-amber-700";
  }

  // Business: reads profiles.business_verified if you've added it.
  const businessVerifiedEl = document.querySelector('#provider-settings [class*="rounded-2xl"]:nth-child(4) p:last-child');
  const businessIsVerified = Boolean(currentProfile.business_verified);
  if (businessVerifiedEl) {
    businessVerifiedEl.textContent = businessIsVerified ? "✓ Verified" : "Pending";
    businessVerifiedEl.className = `mt-2 text-base font-medium ${businessIsVerified ? "text-emerald-700" : "text-amber-700"}`;
  }
}

// ---------------------------------------------------------------------
// Load/save: notification preferences & privacy settings
// ---------------------------------------------------------------------

function applyNotificationPrefsToUI(prefs) {
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
    if (els[key]) els[key].checked = Boolean(prefs[key]);
  }
}

function readNotificationPrefsFromUI() {
  const prefs = {};
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
    prefs[key] = Boolean(els[key]?.checked);
  }
  return prefs;
}

async function loadNotificationPreferences() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    savedNotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(data?.notification_preferences || {}),
    };
  } catch (err) {
    console.warn("notification_preferences column not available yet, using defaults:", err?.message || err);
    savedNotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  }

  applyNotificationPrefsToUI(savedNotificationPrefs);
}

function applyPrivacySettingsToUI(settings) {
  if (els.profileVisibility) els.profileVisibility.textContent = settings.profileVisibility;
  if (els.profileVisibilityLabel) els.profileVisibilityLabel.textContent = settings.profileVisibility;
  if (els.showProfileInSearch) els.showProfileInSearch.checked = Boolean(settings.showProfileInSearch);
  if (els.showApproximateLocation) els.showApproximateLocation.checked = Boolean(settings.showApproximateLocation);
  if (els.personalizedRecommendations) els.personalizedRecommendations.checked = Boolean(settings.personalizedRecommendations);
  if (els.showLocation) els.showLocation.checked = Boolean(settings.showLocation);
}

function readPrivacySettingsFromUI() {
  return {
    profileVisibility: els.profileVisibility?.textContent?.trim() || DEFAULT_PRIVACY_SETTINGS.profileVisibility,
    showProfileInSearch: Boolean(els.showProfileInSearch?.checked),
    showApproximateLocation: Boolean(els.showApproximateLocation?.checked),
    personalizedRecommendations: Boolean(els.personalizedRecommendations?.checked),
    showLocation: Boolean(els.showLocation?.checked),
  };
}

async function loadPrivacySettings() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("privacy_settings")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    savedPrivacySettings = {
      ...DEFAULT_PRIVACY_SETTINGS,
      ...(data?.privacy_settings || {}),
    };
  } catch (err) {
    console.warn("privacy_settings column not available yet, using defaults:", err?.message || err);
    savedPrivacySettings = { ...DEFAULT_PRIVACY_SETTINGS };
  }

  applyPrivacySettingsToUI(savedPrivacySettings);
}

// ---------------------------------------------------------------------
// Load: payment methods (optional table)
// ---------------------------------------------------------------------

async function loadPaymentMethods() {
  if (!els.paymentMethodsList) return;

  try {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("id, brand, last4, is_default")
      .eq("user_id", currentUser.id)
      .order("is_default", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      els.paymentMethodsList.innerHTML =
        '<p class="text-sm text-slate-500">No payment methods on file yet.</p>';
      return;
    }

    els.paymentMethodsList.innerHTML = data
      .map(
        (pm) => `
        <div class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
          <div>
            <p class="text-sm font-medium text-slate-900">${pm.brand || "Card"} •••• ${pm.last4 || "----"}</p>
            ${pm.is_default ? '<p class="mt-1 text-sm text-emerald-600">Default</p>' : ""}
          </div>
        </div>`
      )
      .join("");
  } catch (err) {
    console.warn("payment_methods table not available yet:", err?.message || err);
    els.paymentMethodsList.innerHTML =
      '<p class="text-sm text-slate-500">Payment methods aren\'t set up yet — you can add one once this feature launches.</p>';
  }
}

// ---------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------

function wireProfileEditButtons() {
  // Both "Edit" buttons in the Personal information card should take
  // the user to the page that actually has editable fields.
  document
    .querySelectorAll("#personal-information button")
    .forEach((btn) => {
      if (btn.textContent.trim() === "Edit") {
        btn.addEventListener("click", () => {
          window.location.href = "profile.html";
        });
      }
    });
}

function wireSaveReset() {
  // The only real, editable state on THIS page is the notification and
  // privacy toggles below — the personal-info fields are read-only
  // summaries (edited on profile.html). Save/Reset act on those toggles.
  els.saveSettingsBtn?.addEventListener("click", async () => {
    const notificationPrefs = readNotificationPrefsFromUI();
    const privacySettings = readPrivacySettingsFromUI();

    const notifOk = await tryUpdateProfile(
      currentUser.id,
      { notification_preferences: notificationPrefs },
      "notification preferences"
    );
    const privacyOk = await tryUpdateProfile(
      currentUser.id,
      { privacy_settings: privacySettings },
      "privacy settings"
    );

    if (notifOk) savedNotificationPrefs = notificationPrefs;
    if (privacyOk) savedPrivacySettings = privacySettings;

    if (notifOk && privacyOk) {
      alert("Settings saved.");
    } else {
      alert(
        "Some settings couldn't be saved yet — the notification_preferences / privacy_settings columns may not exist on your profiles table. Check the console for details."
      );
    }
  });

  els.resetSettingsBtn?.addEventListener("click", () => {
    applyNotificationPrefsToUI(savedNotificationPrefs);
    applyPrivacySettingsToUI(savedPrivacySettings);
  });
}

function wireSecurityButtons() {
  els.changePasswordBtn?.addEventListener("click", async () => {
    const currentPassword = prompt("Enter your current password to continue:");
    if (!currentPassword) return;

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        alert("Your current password is incorrect.");
        return;
      }
    } catch (err) {
      alert("We could not verify your current password: " + (err?.message || err));
      return;
    }

    const newPassword = prompt("Enter your new password (minimum 8 characters):");
    if (!newPassword) return;

    if (newPassword.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }

    if (newPassword === currentPassword) {
      alert("Your new password must be different from your current password.");
      return;
    }

    const confirmPassword = prompt("Confirm your new password:");
    if (newPassword !== confirmPassword) {
      alert("Passwords didn't match. Please try again.");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      alert("Password updated successfully.");
    } catch (err) {
      alert("Failed to update password: " + (err?.message || err));
    }
  });

  els.logoutAllDevicesBtnSecondary?.addEventListener("click", async () => {
    if (!confirm("This will log you out of all devices, including this one. Continue?")) return;

    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    } catch (err) {
      console.error("Failed to sign out of all devices:", err);
    } finally {
      window.location.replace("home.html");
    }
  });
}

function wirePrivacyControls() {
  els.profileVisibility?.addEventListener("click", () => {
    const current = els.profileVisibility.textContent.trim();
    const next = current === "Public" ? "Private" : "Public";
    els.profileVisibility.textContent = next;
    if (els.profileVisibilityLabel) els.profileVisibilityLabel.textContent = next;
    // Persisted when the user hits "Save changes", along with the
    // other privacy toggles — keeps all privacy state in one save.
  });

  document.querySelectorAll('[data-profile-action="manage-data"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      alert(
        "To request a copy of your data, please contact support — a self-serve data export isn't built yet."
      );
    });
  });
}

function wireDeletionRequest() {
  els.requestDeletionBtn?.addEventListener("click", async () => {
    if (
      !confirm(
        "This will submit a request to permanently delete your Vorabukeen account. This can't be undone once processed. Continue?"
      )
    ) {
      return;
    }

    // Try to record the request in a dedicated table first...
    let recorded = false;
    try {
      const { error } = await supabase.from("account_deletion_requests").insert({
        user_id: currentUser.id,
        requested_at: new Date().toISOString(),
        status: "pending",
      });
      if (error) throw error;
      recorded = true;
    } catch (err) {
      console.warn("account_deletion_requests table not available yet:", err?.message || err);
    }

    // ...and always send a confirmation email either way, so the
    // request isn't silently lost if that table doesn't exist yet.
    try {
      await sendEmailToUserId(
        currentUser.id,
        "Vorabukeen account deletion request received",
        `<p>We've received a request to delete your Vorabukeen account. Our team will process this and follow up if we need anything else from you.</p>`,
        "We've received a request to delete your Vorabukeen account."
      );
    } catch (err) {
      console.warn("Deletion confirmation email failed:", err?.message || err);
    }

    alert(
      recorded
        ? "Your account deletion request has been submitted. We'll follow up by email."
        : "Your account deletion request has been sent to our team by email. (Note: the account_deletion_requests table isn't set up yet, so this wasn't logged in the database.)"
    );
  });
}

function wirePaymentMethods() {
  els.addPaymentMethodBtn?.addEventListener("click", () => {
    alert(
      "Adding a payment method isn't available yet — this needs a Paystack card-tokenization flow, which hasn't been built into this page."
    );
  });
}

function wireSupportButtons() {
  const helpCenterBtn = document.getElementById("helpCenterBtn");
  const contactSupportBtn = document.getElementById("contactSupportBtn");
  const reportProblemBtn = document.getElementById("reportProblemBtn");

  helpCenterBtn?.addEventListener("click", () => {
    window.location.href = "how-it-works.html";
  });

  contactSupportBtn?.addEventListener("click", () => {
    window.location.href = "contact-us.html";
  });

  reportProblemBtn?.addEventListener("click", () => {
    const subject = encodeURIComponent("Vorabukeen app problem report");
    const body = encodeURIComponent(
      `Hi Vorabukeen support,\n\nI need help with an issue on the app.\n\nUser email: ${currentUser?.email || "Not available"}\nIssue summary: \nSteps to reproduce: \nExpected result: \nActual result: \n\nPlease help.`
    );

    window.location.href = `mailto:vorabukeen.support.group@gmail.com?subject=${subject}&body=${body}`;
  });
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

async function init() {
  const authed = await loadUserAndProfile();
  if (!authed) return;

  await loadNotificationPreferences();
  await loadPrivacySettings();
  await loadPaymentMethods();

  wireProfileEditButtons();
  wireSaveReset();
  wireSecurityButtons();
  wirePrivacyControls();
  wireDeletionRequest();
  wirePaymentMethods();
  wireSupportButtons();
}

init().catch((err) => {
  console.error(err);
  alert("You must be logged in to view settings. Redirecting...");
  window.location.replace("home.html");
});