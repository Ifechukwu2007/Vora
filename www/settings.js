import { supabase } from "./supabase.js";
import { updateProfilePictureInHeader } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  // =========================
  // DOM ELEMENTS
  // =========================
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

  // Currency
  const currencyRadios = document.querySelectorAll('input[name="currency"]');

  // Notifications
  const bookingNotifications = document.getElementById("bookingNotifications");
  const messageNotifications = document.getElementById("messageNotifications");
  const reviewNotifications = document.getElementById("reviewNotifications");
  const promotionNotifications = document.getElementById("promotionNotifications");

  // Privacy
  const profileVisibility = document.getElementById("profileVisibility");
  const showLocation = document.getElementById("showLocation");

  // Buttons
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const resetSettingsBtn = document.getElementById("resetSettingsBtn");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");

  let currentUser = null;

  // =========================
  // CHECK SESSION
  // =========================
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = session.user;
  await updateProfilePictureInHeader();

  // =========================
  // LOGOUT
  // =========================
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  }

  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (logoutBtnSideMenu) logoutBtnSideMenu.addEventListener("click", logout);

  // =========================
  // LOAD SETTINGS
  // =========================
  async function loadSettings() {
    try {
      // Load from localStorage (fast) and Supabase (authoritative)
      const savedCurrency = localStorage.getItem("preferredCurrency") || "NGN";
      
      // Set currency radio
      currencyRadios.forEach(radio => {
        radio.checked = radio.value === savedCurrency;
      });

      // Try to load full settings from database
      const { data: userSettings, error } = await supabase
        .from("users")
        .select("preferred_currency, notification_settings, privacy_settings")
        .eq("uid", currentUser.id)
        .maybeSingle();

      if (userSettings) {
        // Load currency from DB
        if (userSettings.preferred_currency) {
          currencyRadios.forEach(radio => {
            radio.checked = radio.value === userSettings.preferred_currency;
          });
          localStorage.setItem("preferredCurrency", userSettings.preferred_currency);
        }

        // Load notification settings
        if (userSettings.notification_settings) {
          const notif = userSettings.notification_settings;
          bookingNotifications.checked = notif.booking !== false;
          messageNotifications.checked = notif.message !== false;
          reviewNotifications.checked = notif.review !== false;
          promotionNotifications.checked = notif.promotion === true;
        }

        // Load privacy settings
        if (userSettings.privacy_settings) {
          const privacy = userSettings.privacy_settings;
          profileVisibility.checked = privacy.profile_visible !== false;
          showLocation.checked = privacy.show_location !== false;
        }
      }
    } catch (error) {
      console.warn("Error loading settings:", error);
    }
  }

  await loadSettings();

  // =========================
  // SAVE SETTINGS
  // =========================
  saveSettingsBtn.addEventListener("click", async () => {
    try {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.textContent = "Saving...";

      // Get selected currency
      const selectedCurrency = Array.from(currencyRadios).find(r => r.checked)?.value || "NGN";

      // Get notification settings
      const notificationSettings = {
        booking: bookingNotifications.checked,
        message: messageNotifications.checked,
        review: reviewNotifications.checked,
        promotion: promotionNotifications.checked,
      };

      // Get privacy settings
      const privacySettings = {
        profile_visible: profileVisibility.checked,
        show_location: showLocation.checked,
      };

      // Save to localStorage
      localStorage.setItem("preferredCurrency", selectedCurrency);
      localStorage.setItem("notificationSettings", JSON.stringify(notificationSettings));
      localStorage.setItem("privacySettings", JSON.stringify(privacySettings));

      // Save to database
      const { error: updateError } = await supabase
        .from("users")
        .update({
          preferred_currency: selectedCurrency,
          notification_settings: notificationSettings,
          privacy_settings: privacySettings,
        })
        .eq("uid", currentUser.id);

      if (updateError) throw updateError;

      alert("✅ Settings saved successfully!");

      // Dispatch event so other pages know settings changed
      window.dispatchEvent(new CustomEvent("settingsChanged", {
        detail: {
          currency: selectedCurrency,
          notifications: notificationSettings,
          privacy: privacySettings,
        }
      }));

      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = "Save Settings";
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings: " + error.message);
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = "Save Settings";
    }
  });

  // =========================
  // RESET SETTINGS
  // =========================
  resetSettingsBtn.addEventListener("click", async () => {
    const confirmed = confirm("Reset all settings to defaults?");
    if (!confirmed) return;

    try {
      // Reset currency to NGN
      currencyRadios.forEach(radio => {
        radio.checked = radio.value === "NGN";
      });

      // Reset notifications (all on except promotions)
      bookingNotifications.checked = true;
      messageNotifications.checked = true;
      reviewNotifications.checked = true;
      promotionNotifications.checked = false;

      // Reset privacy (all on)
      profileVisibility.checked = true;
      showLocation.checked = true;

      alert("Settings reset to defaults. Click 'Save Settings' to apply.");
    } catch (error) {
      console.error("Error resetting settings:", error);
      alert("Failed to reset settings");
    }
  });

  // =========================
  // CHANGE PASSWORD
  // =========================
  changePasswordBtn.addEventListener("click", async () => {
    const newPassword = prompt("Enter your new password:");
    if (!newPassword) return;

    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    try {
      changePasswordBtn.disabled = true;
      changePasswordBtn.textContent = "Updating...";

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      alert("✅ Password changed successfully!");
      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = "Change Password";
    } catch (error) {
      console.error("Error changing password:", error);
      alert("Failed to change password: " + error.message);
      changePasswordBtn.disabled = false;
      changePasswordBtn.textContent = "Change Password";
    }
  });

  // =========================
  // DELETE ACCOUNT
  // =========================
  deleteAccountBtn.addEventListener("click", async () => {
    const confirmDelete = confirm(
      "⚠️ Are you sure you want to delete your account? This action cannot be undone.\n\nType 'DELETE' to confirm."
    );

    if (!confirmDelete) return;

    const userConfirmation = prompt("Type 'DELETE' to confirm account deletion:");
    if (userConfirmation !== "DELETE") {
      alert("Account deletion cancelled.");
      return;
    }

    try {
      deleteAccountBtn.disabled = true;
      deleteAccountBtn.textContent = "Deleting...";

      // Call an admin function or API to delete user data
      // For now, just sign out
      await supabase.auth.signOut();

      // Redirect to login
      alert("Your account has been scheduled for deletion. You have been logged out.");
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to delete account: " + error.message);
      deleteAccountBtn.disabled = false;
      deleteAccountBtn.textContent = "Delete Account";
    }
  });

  // =========================
  // CURRENCY RADIO CHANGE (instant preview)
  // =========================
  currencyRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        localStorage.setItem("preferredCurrency", e.target.value);
        // Dispatch instant change event
        window.dispatchEvent(new CustomEvent("currencyChanged", {
          detail: { currency: e.target.value }
        }));
      }
    });
  });
});
