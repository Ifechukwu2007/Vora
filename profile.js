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
        data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = "login";
        return;
    }

    currentUser = session.user;

    // =========================
    // LOGOUT
    // =========================
    async function logout() {

        await supabase.auth.signOut();

        window.location.href = "login";
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }

    if (logoutBtnSideMenu) {
        logoutBtnSideMenu.addEventListener("click", logout);
    }

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

            // =========================
            // UPLOAD TO SUPABASE STORAGE
            // =========================
            const fileExt = file.name.split(".").pop();

            const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase
                .storage
                .from("profile-pictures")
                .upload(fileName, file);

            if (uploadError) {
                throw uploadError;
            }

            // =========================
            // GET PUBLIC URL
            // =========================
            const {
                data: publicUrlData
            } = supabase
                .storage
                .from("profile-pictures")
                .getPublicUrl(fileName);

            const imageUrl = publicUrlData.publicUrl;

            currentProfilePicture = imageUrl;

            // =========================
            // SAVE TO PROFILES TABLE
            // =========================
            const { error: updateError } = await supabase
                .from("profiles")
                .upsert({
                    id: currentUser.id,
                    email: currentUser.email,
                    profile_picture: imageUrl
                });

            if (updateError) {
                throw updateError;
            }

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

        const confirmDelete = confirm(
            "Remove your profile picture?"
        );

        if (!confirmDelete) return;

        try {

            // UPDATE DATABASE
            const { error } = await supabase
                .from("profiles")
                .update({
                    profile_picture: null
                })
                .eq("id", currentUser.id);

            if (error) {
                throw error;
            }

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

            const updates = {
                id: currentUser.id,
                email: currentUser.email,
                full_name: nameInput.value.trim(),
                phone: phoneInput.value.trim(),
                location: locationInput.value.trim(),
                profile_picture: currentProfilePicture
            };

            const { error } = await supabase
                .from("profiles")
                .upsert(updates);

            if (error) {
                throw error;
            }

            // Also update users table for consistency
            await supabase
                .from("users")
                .update({
                    full_name: nameInput.value.trim(),
                    phone: phoneInput.value.trim(),
                    location: locationInput.value.trim(),
                    profile_picture: currentProfilePicture
                })
                .eq("id", currentUser.id);

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

            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", currentUser.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            // EMAIL
            emailInput.value = currentUser.email || "";

            if (!data) return;

            // FILL FORM
            nameInput.value = data.full_name || "";

            phoneInput.value = data.phone || "";

            locationInput.value = data.location || "";

            // PROFILE IMAGE
            if (data.profile_picture) {

                currentProfilePicture = data.profile_picture;

                profilePictureDisplay.src = data.profile_picture;

                profilePictureDisplay.classList.remove("hidden");

                profilePicturePlaceholder.classList.add("hidden");

                removeProfilePictureBtn.classList.remove("hidden");
            }

        } catch (error) {

            console.error(error);
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

            // =========================
            // CHECK SERVICES TABLE
            // =========================
            const {
                data: services,
                error
            } = await supabase
                .from("services")
                .select("id")
                .eq("provider_id", currentUser.id);

            if (error) {
                console.error("Service check error:", error);
                throw error;
            }

            console.log("Services found:", services);

            // =========================
            // SHOW BUTTON IF USER HAS SERVICES
            // =========================
            if (services && services.length > 0) {

                console.log("✅ User has services");

                backToDashboardBtn.classList.remove("hidden");

                backToDashboardBtn.style.display = "flex";

            } else {

                console.log("❌ User has no services");

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

            window.location.href =
                providerBtn.getAttribute("data-action");
        });
    }

});