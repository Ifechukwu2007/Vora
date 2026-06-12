import { supabase } from "./supabase.js";
import { updateProfilePictureInHeader } from "./auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  // =========================
  // ELEMENTS
  // =========================
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

  const profileForm = document.getElementById("profileForm");

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const locationInput = document.getElementById("location");

  const profilePictureArea = document.getElementById("profilePictureArea");
  const profilePictureInput = document.getElementById("profilePictureInput");
  const profilePictureDisplay = document.getElementById("profilePictureDisplay");
  const profilePicturePlaceholder = document.getElementById("profilePicturePlaceholder");
  const removeProfilePictureBtn = document.getElementById("removeProfilePictureBtn");

  const backToDashboardBtn = document.getElementById("backToDashboardBtn");

  let currentUser = null;
  let currentProfilePicture = null;

  // =========================
  // CHECK SESSION
  // =========================
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = session.user;

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
  // LOAD PROFILE
  // =========================
  await loadProfile();

  // =========================
  // CHECK SERVICES
  // =========================
  await checkUserServices();

  // =========================
  // PROFILE IMAGE CLICK
  // =========================
  profilePictureArea.addEventListener("click", () => {
    profilePictureInput.click();
  });

  // =========================
  // PROFILE IMAGE CHANGE
  // =========================
  profilePictureInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // VALIDATE IMAGE
    if (!file.type.startsWith("image/")) {
      alert("Please select an image");
      return;
    }

    // VALIDATE SIZE
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    try {
      // PREVIEW IMAGE
      const reader = new FileReader();
      reader.onload = (event) => {
        profilePictureDisplay.src = event.target.result;
        profilePictureDisplay.classList.remove("hidden");
        profilePicturePlaceholder.classList.add("hidden");
      };
      reader.readAsDataURL(file);

      // UPLOAD TO SUPABASE STORAGE
      const fileExt = file.name.split(".").pop();
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // GET PUBLIC URL
      const { data: publicUrlData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;
      currentProfilePicture = imageUrl;

      // SAVE TO PROFILES TABLE (RPC, not direct upsert)
      const { error: updateError } = await supabase.rpc("upsert_profile", {
        p_id: currentUser.id,
        p_email: currentUser.email,
        p_full_name: null,
        p_role: "user",
        p_location: null,
        p_phone: null,
        p_profile_picture: imageUrl,
      });

      if (updateError) throw updateError;

      removeProfilePictureBtn.classList.remove("hidden");
      alert("Profile picture uploaded successfully");

      // Update header profile picture
      await updateProfilePictureInHeader();
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to upload image");
    }
  });

  // =========================
  // REMOVE PROFILE PICTURE
  // =========================
  removeProfilePictureBtn.addEventListener("click", async () => {
    const confirmDelete = confirm("Remove your profile picture?");
    if (!confirmDelete) return;

    try {
      // UPDATE DATABASE via RPC
      const { error } = await supabase.rpc("upsert_profile", {
        p_id: currentUser.id,
        p_email: currentUser.email,
        p_full_name: nameInput.value.trim() || null,
        p_role: "user",
        p_location: locationInput.value.trim() || null,
        p_phone: phoneInput.value.trim() || null,
        p_profile_picture: null,
      });

      if (error) throw error;

      // RESET UI
      profilePictureDisplay.src = "";
      profilePictureDisplay.classList.add("hidden");
      profilePicturePlaceholder.classList.remove("hidden");
      removeProfilePictureBtn.classList.add("hidden");
      currentProfilePicture = null;

      alert("Profile picture removed");

      // Update header profile picture
      await updateProfilePictureInHeader();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  });

  // =========================
  // UPDATE PROFILE
  // =========================
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const { error } = await supabase.rpc("upsert_profile", {
        p_id: currentUser.id,
        p_email: currentUser.email, // keep consistent
        p_full_name: nameInput.value.trim(),
        p_role: "user",
        p_location: locationInput.value.trim(),
        p_phone: phoneInput.value.trim(),
        p_profile_picture: currentProfilePicture,
      });

      if (error) throw error;

      // Also update users table for consistency
      await supabase
        .from("users")
        .update({
          full_name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          location: locationInput.value.trim(),
          profile_picture: currentProfilePicture,
        })
        .eq("uid", currentUser.id);

      alert("Profile updated successfully");

      // Update header profile picture
      await updateProfilePictureInHeader();
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to update profile");
    }
  });

  // =========================
  // LOAD PROFILE FUNCTION
  // =========================
  async function loadProfile() {
    try {
      // Always set email from auth
      emailInput.value = currentUser.email || "";

      // 1) Try profiles first
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) console.warn("profiles table error:", profileError);

      // 2) If no profile row exists, fetch from users table (signup data),
      //    then create profile row via RPC.
      let dataToUse = profileData;

      if (!profileData) {
        console.log("No profile found, checking users table...");

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("full_name, phone, location, profile_picture")
          .eq("uid", currentUser.id)
          .maybeSingle();

        if (userError) console.warn("users table error:", userError);

        const { data: upserted, error: upsertError } = await supabase.rpc(
          "upsert_profile",
          {
            p_id: currentUser.id,
            p_email: currentUser.email || null,
            p_full_name: userData?.full_name || "",
            p_role: "user",
            p_location: userData?.location || "",
            p_phone: userData?.phone || "",
            p_profile_picture: userData?.profile_picture || null,
          }
        );

        if (upsertError) {
          console.error("Error upserting profile:", upsertError);
          throw upsertError;
        }

        dataToUse = upserted;
      }

      if (!dataToUse) {
        console.warn("No data available to fill form");
        return;
      }

      // 3) Fill the form from profiles
      nameInput.value = dataToUse.full_name || "";
      phoneInput.value = dataToUse.phone || "";
      locationInput.value = dataToUse.location || "";

      // Profile image UI
      if (dataToUse.profile_picture) {
        currentProfilePicture = dataToUse.profile_picture;
        profilePictureDisplay.src = dataToUse.profile_picture;
        profilePictureDisplay.classList.remove("hidden");
        profilePicturePlaceholder.classList.add("hidden");
        removeProfilePictureBtn.classList.remove("hidden");
      } else {
        currentProfilePicture = null;
        profilePictureDisplay.src = "";
        profilePictureDisplay.classList.add("hidden");
        profilePicturePlaceholder.classList.remove("hidden");
        removeProfilePictureBtn.classList.add("hidden");
      }
    } catch (error) {
      console.error("Load profile error:", error);
    }
  }

  // =========================
  // CHECK USER SERVICES
  // =========================
  async function checkUserServices() {
    try {
      console.log("🔍 Checking user services...");

      if (!backToDashboardBtn) {
        console.warn("Back To Dashboard button not found");
        return;
      }

      const { data: services, error } = await supabase
        .from("services")
        .select("id")
        .eq("provider_id", currentUser.id);

      if (error) {
        console.error("Service check error:", error);
        throw error;
      }

      console.log("Services found:", services);

      if (services && services.length > 0) {
        backToDashboardBtn.classList.remove("hidden");
        backToDashboardBtn.style.display = "flex";
      } else {
        backToDashboardBtn.classList.add("hidden");
        backToDashboardBtn.style.display = "none";
      }
    } catch (error) {
      console.error("❌ checkUserServices failed:", error);
      backToDashboardBtn.classList.add("hidden");
      backToDashboardBtn.style.display = "none";
    }
  }

  // =========================
  // PROVIDER BUTTON
  // =========================
  const providerBtn = document.querySelector(
    '[data-action="add-service.html"]'
  );

  if (providerBtn) {
    providerBtn.addEventListener("click", () => {
      window.location.href = providerBtn.getAttribute("data-action");
    });
  }
});