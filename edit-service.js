// edit-service.js
import { supabase } from "./supabase.js";

const els = {
  form: document.getElementById("add-service-form"),
  submitBtn: document.getElementById("submit-btn"),

  serviceTitle: document.getElementById("service-title"),
  serviceDescription: document.getElementById("service-description"),
  serviceCategory: document.getElementById("service-category"),
  servicePrice: document.getElementById("service-price"),
  dealMessage: document.getElementById("deal-message"),

  groupDiscountThreshold: document.getElementById("group-discount-threshold"),
  groupDiscountPercent: document.getElementById("group-discount-percent"),

  serviceLocation: document.getElementById("service-location"),
  travelPrice: document.getElementById("travel-price"),

  serviceImage: document.getElementById("service-image"),
  imagePreview: document.getElementById("image-preview"),
  previewImg: document.getElementById("preview-img"),
  removeImageBtn: document.getElementById("remove-image-btn"),
};

const STORAGE_BUCKET = "services"; // Use the same storage bucket as add-service.js

let currentService = null;
let selectedFile = null;
let deleteExistingImage = false;

function getBookingOrNull() {
  const params = new URLSearchParams(window.location.search);
  return params.get("service_id");
}

function toNum(v) {
  const n = v === "" || v === null || v === undefined ? null : Number(v);
  return Number.isFinite(n) ? n : null;
}

function setLoading(isLoading) {
  if (!els.submitBtn) return;
  els.submitBtn.disabled = !!isLoading;
  els.submitBtn.textContent = isLoading ? "Updating..." : "Update Service";
}

function showPreview(url) {
  if (!els.imagePreview || !els.previewImg) return;
  els.previewImg.src = url;
  els.imagePreview.classList.remove("hidden");
}

function hidePreview() {
  if (!els.imagePreview || !els.previewImg) return;
  els.previewImg.src = "";
  els.imagePreview.classList.add("hidden");
}

function getExtFromFileName(name = "") {
  const parts = String(name).split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return ext ? `.${ext}` : "";
}

async function uploadServiceImage(serviceId, file) {
  const ext = getExtFromFileName(file.name);
  const path = `${serviceId}/${crypto.randomUUID()}${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  // Use data.publicUrl (public bucket), or change if bucket is private.
  return data.publicUrl;
}

async function deleteServiceImageIfRequested(existingImageUrl) {
  if (!deleteExistingImage) return existingImageUrl;

  // If you store public URLs, deleting needs the object path.
  // We attempt to parse path after bucket base URL.
  if (!existingImageUrl) return null;

  try {
    const publicUrl = existingImageUrl;
    const base = `https://` + supabase.storageUrl?.replace("https://", "") || null;

    // If parsing fails, we can’t safely delete without knowing the object path.
    // So we keep this as a no-op unless you tell me how your storage paths are stored.
    // (Most people store the object key in DB instead.)
    console.warn(
      "Image deletion requested, but existing image URL parsing may be unreliable. Ensure you store object_key for safe deletion."
    );

    return existingImageUrl; // keep by default
  } catch (e) {
    console.warn("Failed to delete existing image:", e);
    return existingImageUrl;
  }
}

function fillForm(service) {
  currentService = service;

  els.serviceTitle.value = service.title ?? "";
  els.serviceDescription.value = service.description ?? "";
  els.serviceCategory.value = service.category ?? "Barber Shop";
  els.servicePrice.value = service.price ?? service.base_price ?? "";

  els.dealMessage.value = service.deal_headline ?? service.deal_message ?? "";

  els.groupDiscountThreshold.value = service.group_discount_threshold ?? "";
  els.groupDiscountPercent.value = service.group_discount_percent ?? "";

  els.serviceLocation.value = service.location ?? service.service_location ?? "";
  els.travelPrice.value = service.travel_price ?? service.travel_price_amount ?? "";
  
  // image preview
  if (service.image_url || service.image_url === "") {
    showPreview(service.image_url);
  } else if (service.image_url) {
    showPreview(service.image_url);
  } else if (service.image_url) {
    showPreview(service.image_url);
  } else {
    hidePreview();
  }
}

function bindImageHandlers() {
  if (els.serviceImage) {
    els.serviceImage.addEventListener("change", () => {
      deleteExistingImage = false;
      selectedFile = els.serviceImage.files?.[0] ?? null;

      if (!selectedFile) {
        hidePreview();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        showPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    });
  }

  if (els.removeImageBtn) {
    els.removeImageBtn.addEventListener("click", () => {
      selectedFile = null;
      deleteExistingImage = true;
      if (els.serviceImage) els.serviceImage.value = "";
      hidePreview();
    });
  }
}

async function loadService(serviceId, userId) {
  // Adjust the column names here to match your schema.
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("provider_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Service not found or you do not have permission to edit it.");

  return data;
}

async function ensureAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Please login again.");

  return data.user;
}

async function main() {
  bindImageHandlers();

  const serviceId = getBookingOrNull();
  if (!serviceId) {
    alert("Missing service_id in URL. Example: edit-service.html?service_id=UUID");
    return;
  }

  setLoading(true);

  try {
    const user = await ensureAuth();

    const service = await loadService(serviceId, user.id);
    fillForm(service);

    // submit
    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        setLoading(true);

        // Basic validation
        const title = els.serviceTitle.value.trim();
        const description = els.serviceDescription.value.trim();
        const category = els.serviceCategory.value;
        const price = toNum(els.servicePrice.value);

        const location = els.serviceLocation.value.trim();
        const travelPrice = toNum(els.travelPrice.value);

        if (!title) throw new Error("Service title is required.");
        if (!description) throw new Error("Description is required.");
        if (!category) throw new Error("Category is required.");
        if (price === null) throw new Error("Price is required.");
        if (!location) throw new Error("Location is required.");

        const groupDiscountThreshold = toNum(els.groupDiscountThreshold.value);
        const groupDiscountPercent = toNum(els.groupDiscountPercent.value);

        let imageUrl = service.image_url ?? null;

        // Upload new file if selected
        if (selectedFile) {
          imageUrl = await uploadServiceImage(serviceId, selectedFile);
        } else if (deleteExistingImage) {
          // If you truly delete objects, we need the storage object key.
          // For now, set image_url to null (or adjust to your preferred behavior).
          imageUrl = null;
        }

        const updatePayload = {
          title,
          description,
          category,
          price,
          deal_headline: els.dealMessage.value.trim() || null,
          group_discount_threshold: groupDiscountThreshold,
          group_discount_percent: groupDiscountPercent,
          location,
          travel_price: travelPrice,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        };

        const { error: updateErr } = await supabase
          .from("services")
          .update(updatePayload)
          .eq("id", serviceId)
          .eq("provider_id", currentService?.provider_id || user.id);

        if (updateErr) throw updateErr;

        alert("Service updated successfully ✅");
        window.location.href = "my-services.html";
      } catch (err) {
        console.error(err);
        alert(err?.message || "Failed to update service.");
      } finally {
        setLoading(false);
      }
    });
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to load service.");
  } finally {
    setLoading(false);
  }
}

main();