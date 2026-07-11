// profile.js
import { supabase } from "./supabase.js";
import { updateProfilePictureInHeader } from "./auth.js";

const BUCKET_NAME = "profile-pictures"; // <-- change if your bucket name differs

const els = {
  name: document.getElementById("name"),
  email: document.getElementById("email"),
  phoneLocal: document.getElementById("phoneLocal"),
  location: document.getElementById("location"),
  profileVerified: document.getElementById("profileVerified"),
  bookingCount: document.getElementById("bookingCount"),
  messageCount: document.getElementById("messageCount"),

  profilePictureInput: document.getElementById("profilePictureInput"),
  profilePictureDisplay: document.getElementById("profilePictureDisplay"),
  profilePicturePlaceholder: document.getElementById("profilePicturePlaceholder"),
  profilePictureArea: document.getElementById("profilePictureArea"),
  removeProfilePictureBtn: document.getElementById("removeProfilePictureBtn"),
  becomeProviderBtn: document.querySelector('[data-action="add-service.html"]'),
  backToDashboardBtn: document.getElementById("backToDashboardBtn"),
};

function normalizePhone(raw) {
  // Keep it simple; you can improve this later.
  return (raw || "").trim();
}

function showLoading(isLoading) {
  // Optional: add a spinner here if you want.
  // For now we just disable submit button by toggling form controls if needed.
  // (We’ll keep it minimal.)
}

function getSafeFilename(name) {
  const clean = (name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  return clean.length > 180 ? clean.slice(-180) : clean;
}

async function ensureBucketExists() {
  // Storage bucket create requires service role; we won't do it automatically.
  // Instead we test existence and provide a helpful error.
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", { limit: 1 });
  if (error && (error.statusCode === 404 || /Bucket/.test(error.message))) {
    throw new Error(
      `Storage bucket "${BUCKET_NAME}" not found. Create it in Supabase Storage settings or update BUCKET_NAME in profile.js.`
    );
  }
  return data;
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, location, profile_picture, verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  let profileData = data;

  if (!profileData) {
    const { data: userFallback, error: userError } = await supabase
      .from("users")
      .select("id, full_name, email, location, phone, profile_picture, verified")
      .eq("id", userId)
      .maybeSingle();

    if (userError) throw userError;
    profileData = userFallback || {};
  }

  els.name.value = profileData.full_name || "";
  els.email.value = profileData.email || "";
  els.phoneLocal.value = profileData.phone || "";
  els.location.value = profileData.location || "";
  if (els.profileVerified) {
    els.profileVerified.textContent = profileData.verified ? 'Verified' : 'Not verified';
  }
  const picturePath = profileData.profile_picture;
  const pictureUrl = picturePath ? await getProfilePicturePublicUrl(picturePath) : "";

  if (pictureUrl) {
    if (els.profilePictureDisplay) {
      els.profilePictureDisplay.src = pictureUrl;
      els.profilePictureDisplay.classList.remove("hidden");
    }
    els.profilePicturePlaceholder?.classList.add("hidden");
    els.removeProfilePictureBtn?.classList.remove("hidden");
  } else {
    if (els.profilePictureDisplay) {
      els.profilePictureDisplay.src = "";
      els.profilePictureDisplay.classList.add("hidden");
    }
    els.profilePicturePlaceholder?.classList.remove("hidden");
    els.removeProfilePictureBtn?.classList.add("hidden");
  }
}

async function getProfilePicturePublicUrl(pathOrUrl) {
  // If your DB stores full public URL, just return it.
  // If your DB stores an object path, generate a public URL (if bucket is public)
  // If bucket is private, we should fetch a signed URL instead.
  if (!pathOrUrl) return "";

  // Heuristic: if it already looks like a URL
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  // Try signed URL (works for private buckets).
  const { data: urlData } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(pathOrUrl, 60 * 60); // 1 hour

  // If signed URL failed, try public URL (bucket may be public)
  if (urlData?.signedUrl) return urlData.signedUrl;

  const publicUrlRes = supabase.storage.from(BUCKET_NAME).getPublicUrl(pathOrUrl);
  return publicUrlRes?.data?.publicUrl || "";
}

async function uploadProfilePicture(userId, file) {
  await ensureBucketExists();

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const filename = getSafeFilename(file.name);
  const objectPath = `users/${userId}/${Date.now()}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(objectPath, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  // Store path (recommended) OR store public URL.
  // Your current schema says profile_picture is `text` (no constraint).
  // We'll store the object path (string) so you can use signed/public URLs later.
  return objectPath;
}

async function syncProfileData(userId, updates) {
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...updates }, { onConflict: "id" });

  if (profileError) throw profileError;
}

async function deleteProfilePicture(userId, currentProfilePicture) {
  if (!currentProfilePicture) return;

  await ensureBucketExists();

  // If it’s a full URL, we may not be able to map back to object path.
  // We’ll support both:
  // - if DB stores object path => delete that
  // - if DB stores public URL => try to extract object path by searching for "/object/v1/"
  //   but this is brittle; best is: store objectPath in DB (what we do on upload).
  let objectPath = currentProfilePicture;

  // If it looks like a URL, attempt extraction (best-effort).
  if (/^https?:\/\//i.test(currentProfilePicture)) {
    // Best-effort: try to parse objectPath from the public url format.
    // This depends on how Supabase generates URLs; if it fails, we will still clear DB field.
    objectPath = currentProfilePicture.split(BUCKET_NAME + "/").pop();
  }

  const { error: removeError } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([objectPath]);

  // Even if remove fails, we still clear DB field so UI is consistent.
  if (removeError) {
    console.warn("Could not delete storage object:", removeError.message);
  }

  // Clear DB field
  const { error: dbError } = await supabase
    .from("profiles")
    .update({ profile_picture: null })
    .eq("id", userId);

  if (dbError) throw dbError;
}

async function toggleDashboardButton(userId) {
  const { data, error } = await supabase
    .from("services")
    .select("id")
    .eq("provider_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Could not verify provider services:", error.message);
    els.backToDashboardBtn?.classList.add("hidden");
    return;
  }

  els.backToDashboardBtn?.classList.toggle("hidden", !data);
}

async function loadSummaryCounts(userId) {
  try {
    const { count: bookingCount, error: bookingError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${userId},userId.eq.${userId},provider_id.eq.${userId},providerId.eq.${userId}`);

    if (bookingError) {
      console.warn("Could not load booking count:", bookingError.message);
      els.bookingCount && (els.bookingCount.textContent = "0");
    } else if (els.bookingCount) {
      els.bookingCount.textContent = String(bookingCount || 0);
    }
  } catch (error) {
    console.error("Error loading booking count:", error);
    els.bookingCount && (els.bookingCount.textContent = "0");
  }

  try {
    const { count: messageCount, error: messageError } = await supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .or(`participants.eq.${userId},sender_id.eq.${userId}`);

    if (messageError) {
      console.warn("Could not load message count:", messageError.message);
      els.messageCount && (els.messageCount.textContent = "0");
    } else if (els.messageCount) {
      els.messageCount.textContent = String(messageCount || 0);
    }
  } catch (error) {
    console.error("Error loading message count:", error);
    els.messageCount && (els.messageCount.textContent = "0");
  }
}

async function initAuthAndProfile() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    window.location.replace("home.html");
    return;
  }

  const user = authData.user;

  // user.id should match profiles.id per your schema
  await loadProfile(user.id);
  await loadSummaryCounts(user.id);
  await toggleDashboardButton(user.id);

  // Save submit handler
  const profileForm = document.getElementById("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showLoading(true);

      const full_name = (els.name.value || "").trim();
      const phone = normalizePhone(els.phoneLocal.value);
      const location = (els.location.value || "").trim();

      // Email field is disabled; we do not update it here.
      // Your table includes `email` - but usually it should come from auth.
      const payload = {
        full_name,
        phone,
        location,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...payload }, { onConflict: "id" });

      showLoading(false);

      if (updateError) {
        alert("Failed to update profile. " + updateError.message);
        return;
      }

      alert("Profile updated successfully.");
    });
  }

  // Picture upload
  els.profilePictureArea?.addEventListener("click", () => {
    els.profilePictureInput?.click();
  });

  els.profilePictureInput?.addEventListener("change", async () => {
    const file = els.profilePictureInput.files?.[0];
    if (!file) return;

    try {
      showLoading(true);

      // Upload
      const objectPath = await uploadProfilePicture(user.id, file);

      // Update DB in both profile stores so the image is visible everywhere
      await syncProfileData(user.id, { profile_picture: objectPath });

      // Refresh UI
      const { data: refreshed, error: refErr } = await supabase
        .from("profiles")
        .select("profile_picture")
        .eq("id", user.id)
        .single();

      if (refErr) throw refErr;

      const signedOrPublic = await getProfilePicturePublicUrl(refreshed.profile_picture);
      if (els.profilePictureDisplay) {
        els.profilePictureDisplay.src = signedOrPublic || "";
        els.profilePictureDisplay.classList.remove("hidden");
      }
      els.profilePicturePlaceholder?.classList.add("hidden");
      els.removeProfilePictureBtn?.classList.remove("hidden");

      await updateProfilePictureInHeader();
      alert("Profile picture updated.");
    } catch (err) {
      console.error(err);
      alert("Failed to upload picture. " + err.message);
    } finally {
      showLoading(false);
      if (els.profilePictureInput) {
        els.profilePictureInput.value = "";
      }
    }
  });

  // Picture remove
  els.removeProfilePictureBtn?.addEventListener("click", async () => {
    try {
      showLoading(true);

      const { data: current, error: curErr } = await supabase
        .from("profiles")
        .select("profile_picture")
        .eq("id", user.id)
        .maybeSingle();

      if (curErr) throw curErr;

      await deleteProfilePicture(user.id, current?.profile_picture);
      await syncProfileData(user.id, { profile_picture: null });
      await updateProfilePictureInHeader();

      // Reset UI
      if (els.profilePictureDisplay) {
        els.profilePictureDisplay.src = "";
        els.profilePictureDisplay.classList.add("hidden");
      }
      els.profilePicturePlaceholder?.classList.remove("hidden");
      els.removeProfilePictureBtn?.classList.add("hidden");

      alert("Profile picture removed.");
    } catch (err) {
      console.error(err);
      alert("Failed to remove picture. " + err.message);
    } finally {
      showLoading(false);
    }
  });

  els.becomeProviderBtn?.addEventListener("click", () => {
    window.location.href = "add-service.html";
  });
}

// Patch: if your bucket is public, signed URL isn’t required.
// But this script will try signed first and fallback to public URL.
initAuthAndProfile().catch((err) => {
  console.error(err);
  alert("Profile page error: " + err.message);
});