// edit-service.js
import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";
import { setupLocationPicker } from "./location-picker.js";
import { getCountryConfig, getUserCountry } from "./country-config.js";
import { COUNTRY_STATE_MAP, DEFAULT_COUNTRY, STATE_CITY_MAP, getGeocodeCountryCode } from "./location-data.js";
import { getCurrencyCodeForCountry } from "./currency-utils.js";


let selectedImageFiles = [];
let currentStep = 1;
const MAX_PORTFOLIO_IMAGES = 10;

const els = {
  form: document.getElementById("add-service-form"),
  submitBtn: document.getElementById("submit-btn"),
  nextBtn: document.getElementById("next-step-btn"),
  prevBtn: document.getElementById("prev-step-btn"),

  serviceTitle: document.getElementById("service-title"),
  serviceDescription: document.getElementById("service-description"),
  serviceCategory: document.getElementById("service-category"),
  serviceDelivery: document.getElementById("service-delivery"),
  serviceLocation: document.getElementById("service-location"),
  serviceArea: document.getElementById("service-area"),
  serviceCapacity: document.getElementById("service-capacity"),
  serviceInteraction: document.getElementById("service-interaction"),
  serviceIncludes: document.getElementById("service-includes"),
  servicePrice: document.getElementById("service-price"),
  dealMessage: document.getElementById("deal-message"),
  groupDiscountThreshold: document.getElementById("group-discount-threshold"),
  groupDiscountPercent: document.getElementById("group-discount-percent"),
  businessName: document.getElementById("business-name"),
  instantBooking: document.getElementById("instant-booking"),
  serviceImage: document.getElementById("service-image"),
  imagePreview: document.getElementById("image-preview"),
  previewImg: document.getElementById("preview-img"),
  removeImageBtn: document.getElementById("remove-image-btn"),
  photoFileList: document.getElementById("photo-file-list"),
  serviceLatitude: document.getElementById("service-latitude"),
  serviceLongitude: document.getElementById("service-longitude"),
  locationCoordinates: document.getElementById("service-location-coordinates"),
};

function getTravelPricing() {
  const values = ["travel-fee-5", "travel-fee-10", "travel-fee-20", "travel-fee-above"]
    .map((id) => document.getElementById(id)?.value.trim() || "");
  const distanceBands = [5, 10, 20, null].map((maxKm, index) => ({
    maxKm,
    fee: values[index] === "" ? null : Number.parseFloat(values[index]),
  }));
  const locationRates = Array.from(document.querySelectorAll('[data-travel-selected-cities] [data-location-rate-row]')).map((row) => ({
    state: row.querySelector('[data-location-rate-state]')?.value.trim() || '',
    city: row.querySelector('[data-location-rate-city]')?.value.trim() || '',
    fee: Number.parseFloat(row.querySelector('[data-location-rate-fee]')?.value || ''),
  })).filter((rate) => rate.state || rate.city || Number.isFinite(rate.fee))
    .map((rate) => ({ ...rate, location: [rate.city, rate.state].filter(Boolean).join(', ') }));
  return {
    mode: document.getElementById("travel-pricing-mode")?.value || "both",
    distanceBands,
    locationRates,
    baseLocation: {
      country: document.getElementById("travel-base-country")?.value.trim() || "",
      state: document.getElementById("travel-base-state")?.value.trim() || "",
      city: document.getElementById("travel-base-city")?.value.trim() || "",
      area: document.getElementById("travel-base-area")?.value.trim() || "",
    },
  };
}

function validateTravelPricing() {
  if (!document.getElementById("travels-to-customer")?.checked) return true;
  const pricing = getTravelPricing();
  const invalidBaseLocation = !pricing.baseLocation.country || !pricing.baseLocation.state || !pricing.baseLocation.city || !pricing.baseLocation.area;
  const invalidBands = pricing.mode !== "location" && (pricing.distanceBands.slice(0, 3).some((band) => !Number.isFinite(band.fee) || band.fee < 0)
    || (pricing.distanceBands[3].fee !== null && (!Number.isFinite(pricing.distanceBands[3].fee) || pricing.distanceBands[3].fee < 0)));
  const invalidLocations = pricing.mode === "location"
    ? (!pricing.locationRates.length || pricing.locationRates.some((rate) => !rate.location || !Number.isFinite(rate.fee) || rate.fee < 0))
    : pricing.locationRates.some((rate) => !rate.location || !Number.isFinite(rate.fee) || rate.fee < 0);
  const invalid = invalidBaseLocation || invalidBands || invalidLocations;
  if (invalid) {
    if (invalidBaseLocation) showFieldError("error-travel-base-location", "Enter the country, state, city, and area where you are based.");
    if (invalidBands || invalidLocations) showFieldError("error-travel-pricing", "Complete the selected travel fee rules. Add a destination and fee for location-based pricing.");
  }
  return !invalid;
}

const STORAGE_BUCKET = "services";
let currentService = null;
let currentUser = null;

function getBookingOrNull() {
  const params = new URLSearchParams(window.location.search);
  return params.get("service_id");
}

function clearErrors() {
  document.querySelectorAll('[id^="error-"]').forEach((el) => {
    el.textContent = "";
    el.classList.add("hidden");
  });
}

function showFieldError(fieldId, message) {
  const errorEl = document.getElementById(fieldId);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function setFieldState(inputEl, isValid) {
  if (!inputEl) return;
  inputEl.classList.toggle("border-red-500", !isValid);
  inputEl.classList.toggle("focus:border-red-500", !isValid);
  inputEl.classList.toggle("border-gray-300", isValid);
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getSelectedAvailabilityDays() {
  return Array.from(document.querySelectorAll('input[name="availability-day"]:checked')).map((input) => input.value);
}

function setAvailabilityDays(days = []) {
  const values = Array.isArray(days) ? days : [];
  document.querySelectorAll('input[name="availability-day"]').forEach((checkbox) => {
    checkbox.checked = values.includes(checkbox.value);
  });
}

function isLikelyNonsense(value, { minLength = 8, minWords = 2 } = {}) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return true;

  const bannedTerms = [
    "lorem ipsum",
    "asdf",
    "qwerty",
    "test service",
    "testing",
    "demo",
    "placeholder",
    "tbd",
    "coming soon",
    "n/a",
    "none",
    "nothing",
    "service provider",
    "provider service",
    "good service",
    "best service",
    "any service",
    "hello",
    "hi there",
    "sample"
  ];

  if (bannedTerms.some((term) => normalized.includes(term))) return true;

  const lettersOnly = normalized.replace(/[^a-z]/g, "");
  if (lettersOnly.length < minLength) return true;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) return true;

  return false;
}

function validateMeaningfulText(value, label, { minLength = 12, minWords = 3, required = true } = {}) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return required ? `${label} is required.` : null;
  }

  if (normalized.length < minLength) {
    return `${label} must be at least ${minLength} characters long.`;
  }

  if (normalized.split(/\s+/).filter(Boolean).length < minWords) {
    return `${label} must include at least ${minWords} words.`;
  }

  if (isLikelyNonsense(normalized, { minLength: Math.max(8, minLength - 4), minWords })) {
    return `${label} looks too generic. Please describe your service more clearly.`;
  }

  return null;
}

function validateLocation(value, label) {
  const normalized = normalizeText(value);
  if (!normalized) return `${label} is required.`;
  if (normalized.length < 2 || !/[a-zA-Z]/.test(normalized)) {
    return `${label} must contain a real place name.`;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 .,'()\-/]{1,119}$/.test(normalized)) {
    return `${label} contains invalid characters.`;
  }
  if (isLikelyNonsense(normalized, { minLength: 3, minWords: 1 })) {
    return `${label} must be a real location.`;
  }
  return null;
}

function validateName(value, label) {
  const normalized = normalizeText(value);
  if (!normalized) return `${label} is required.`;
  if (normalized.length < 2) return `${label} must be at least 2 characters.`;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(normalized)) {
    return `${label} can contain letters, spaces, apostrophes, periods, and hyphens only.`;
  }
  return null;
}

function validateCurrentStep() {
  clearErrors();

  if (currentStep === 1) {
    const categoryInput = els.serviceCategory;
    const locationInput = els.serviceLocation;
    const areaInput = els.serviceArea;
    const deliveryInput = els.serviceDelivery;
    const capacityInput = els.serviceCapacity;
    const interactionInput = els.serviceInteraction;
    const category = categoryInput.value;
    const location = locationInput.value.trim();
    const serviceArea = areaInput.value.trim();
    const delivery = deliveryInput.value;
    const capacity = capacityInput.value.trim();
    const interaction = interactionInput.value;
    let hasError = false;

    if (!category) {
      showFieldError("error-service-category", "Please select a category.");
      setFieldState(categoryInput, false);
      hasError = true;
    } else {
      setFieldState(categoryInput, true);
    }

    const locationError = validateLocation(location, "Location");
    if (locationError) {
      showFieldError("error-service-location", locationError);
      setFieldState(locationInput, false);
      hasError = true;
    } else {
      setFieldState(locationInput, true);
    }

    const areaError = validateLocation(serviceArea, "Service area");
    if (areaError) {
      showFieldError("error-service-area", areaError);
      setFieldState(areaInput, false);
      hasError = true;
    } else {
      setFieldState(areaInput, true);
    }

    if (!delivery) {
      showFieldError("error-service-delivery", "Please choose how you deliver your service.");
      setFieldState(deliveryInput, false);
      hasError = true;
    } else {
      setFieldState(deliveryInput, true);
    }

    if (!capacity || !/^\d+$/.test(capacity) || parseInt(capacity, 10) < 1 || parseInt(capacity, 10) > 100) {
      showFieldError("error-service-capacity", "Please enter a realistic capacity between 1 and 100.");
      setFieldState(capacityInput, false);
      hasError = true;
    } else {
      setFieldState(capacityInput, true);
    }

    if (!interaction) {
      showFieldError("error-service-interaction", "Please tell us who the customer will interact with.");
      setFieldState(interactionInput, false);
      hasError = true;
    } else {
      setFieldState(interactionInput, true);
    }

    return !hasError;
  }

  if (currentStep === 2) {
    const titleInput = els.serviceTitle;
    const descriptionInput = els.serviceDescription;
    const includesInput = els.serviceIncludes;
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const includes = includesInput.value.trim();
    let hasError = false;

    const titleError = validateMeaningfulText(title, "Service title", { minLength: 8, minWords: 2 });
    if (titleError) {
      showFieldError("error-service-title", titleError);
      setFieldState(titleInput, false);
      hasError = true;
    } else {
      setFieldState(titleInput, true);
    }

    const descriptionError = validateMeaningfulText(description, "Service description", { minLength: 40, minWords: 8 });
    if (descriptionError) {
      showFieldError("error-service-description", descriptionError);
      setFieldState(descriptionInput, false);
      hasError = true;
    } else {
      setFieldState(descriptionInput, true);
    }

    const includesError = validateMeaningfulText(includes, "Service details", { minLength: 15, minWords: 3, required: true });
    if (includesError) {
      showFieldError("error-service-includes", includesError);
      setFieldState(includesInput, false);
      hasError = true;
    } else {
      setFieldState(includesInput, true);
    }

    const hasExistingImage = Boolean(currentService?.image_url || currentService?.image_urls?.length);
    if (selectedImageFiles.length === 0 && !hasExistingImage) {
      showFieldError("error-service-image", "Please upload at least one portfolio photo.");
      hasError = true;
    }

    if (selectedImageFiles.length > MAX_PORTFOLIO_IMAGES) {
      showFieldError("error-service-image", `Please select no more than ${MAX_PORTFOLIO_IMAGES} portfolio photos.`);
      hasError = true;
    }

    const oversizedFiles = selectedImageFiles.filter((file) => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      showFieldError("error-service-image", "Each photo must be 10MB or smaller.");
      hasError = true;
    }

    return !hasError;
  }

  const priceInput = els.servicePrice;
  const dealMessageInput = els.dealMessage;
  const thresholdInput = els.groupDiscountThreshold;
  const percentInput = els.groupDiscountPercent;
  const businessInput = els.businessName;
  const priceValue = priceInput.value.trim();
  const priceNumber = Number.parseFloat(priceValue);
  const dealMessage = dealMessageInput.value.trim();
  const threshold = thresholdInput.value.trim();
  const percent = percentInput.value.trim();
  let hasError = false;

  if (!priceValue || Number.isNaN(priceNumber) || priceNumber < 1000) {
    showFieldError("error-service-price", "Please enter a realistic price of at least 1,000 in your currency.");
    setFieldState(priceInput, false);
    hasError = true;
  } else {
    setFieldState(priceInput, true);
  }

  if (!validateTravelPricing()) hasError = true;

  const dealMessageError = validateMeaningfulText(dealMessage, "Promotional headline", { minLength: 4, minWords: 1 });
  if (dealMessageError) {
    showFieldError("error-deal-message", dealMessageError);
    setFieldState(dealMessageInput, false);
    hasError = true;
  } else {
    setFieldState(dealMessageInput, true);
  }

  if (threshold || percent) {
    if (!threshold) {
      showFieldError("error-group-discount-threshold", "Please add a threshold if you want to offer a group discount.");
      setFieldState(thresholdInput, false);
      hasError = true;
    } else if (!/^\d+$/.test(threshold) || Number(threshold) < 2) {
      showFieldError("error-group-discount-threshold", "Enter a whole number of at least 2.");
      setFieldState(thresholdInput, false);
      hasError = true;
    } else {
      setFieldState(thresholdInput, true);
    }

    if (!percent) {
      showFieldError("error-group-discount-percent", "Please add a discount percentage if you want to offer a group discount.");
      setFieldState(percentInput, false);
      hasError = true;
    } else if (!/^\d+(\.\d+)?$/.test(percent) || Number(percent) < 1 || Number(percent) > 100) {
      showFieldError("error-group-discount-percent", "Enter a discount from 1 to 100 percent.");
      setFieldState(percentInput, false);
      hasError = true;
    } else {
      setFieldState(percentInput, true);
    }
  } else {
    setFieldState(thresholdInput, true);
    setFieldState(percentInput, true);
  }

  const businessName = businessInput.value.trim();
  const businessNameError = validateName(businessName, "Business name");
  if (businessNameError) {
    showFieldError("error-business-name", businessNameError);
    setFieldState(businessInput, false);
    hasError = true;
  } else {
    setFieldState(businessInput, true);
  }

  return !hasError;
}

function updateWizardUI() {
  const stepPanels = Array.from(document.querySelectorAll("[data-step-panel]"));
  const progressBars = Array.from(document.querySelectorAll("[data-step-progress]"));
  const title = document.getElementById("wizard-title");
  const subtitle = document.getElementById("wizard-subtitle");
  const stepIndicator = document.getElementById("step-indicator");
  const prevBtn = els.prevBtn;
  const nextBtn = els.nextBtn;
  const submitBtn = els.submitBtn;

  stepPanels.forEach((panel) => {
    const isActive = Number(panel.dataset.stepPanel) === currentStep;
    panel.classList.toggle("hidden", !isActive);
  });

  progressBars.forEach((bar, index) => {
    const isCompleted = index + 1 <= currentStep;
    bar.className = `h-2 flex-1 rounded-full ${isCompleted ? "bg-indigo-600" : "bg-slate-200"}`;
  });

  const titles = [
    "Tell us about your service",
    "Make your profile stand out",
    "Finish up and go live"
  ];
  const subtitles = [
    "Update the basics so customers can immediately understand what you offer.",
    "Add the details and visuals that make your service feel trustworthy and premium.",
    "Set the right rate, booking preferences, and verification details before publishing."
  ];

  title.textContent = titles[currentStep - 1];
  subtitle.textContent = subtitles[currentStep - 1];
  stepIndicator.textContent = String(currentStep);

  prevBtn.classList.toggle("hidden", currentStep === 1);
  nextBtn.classList.toggle("hidden", currentStep === 3);
  submitBtn.classList.toggle("hidden", currentStep !== 3);
}

function renderCategoryDetails() {
  const category = els.serviceCategory.value;
  const categoryDetails = document.getElementById("category-details");
  const includesLabel = document.getElementById("service-includes-label");

  const detailsMap = {
    Beauty: {
      label: "What does your service include?",
      placeholder: "e.g. House calls, products included, sanitized tools, and aftercare tips.",
      content: "Beauty providers should highlight availability, products included, prep instructions, and any extras that make the experience smoother."
    },
    Events: {
      label: "What is included in your event package?",
      placeholder: "e.g. Setup, teardown, sound system, and decor support.",
      content: "Events providers should mention guest capacity, setup responsibilities, equipment provided, and turnaround expectations."
    },
    Tailoring: {
      label: "What should customers know about the tailoring process?",
      placeholder: "e.g. Fabric sourcing, fitting sessions, and replacement policy.",
      content: "Tailoring profiles work best when you mention turnaround time, fitting sessions, and material options."
    },
    "Art & Illustration": {
      label: "What can clients expect from your creative process?",
      placeholder: "e.g. Concept sketches, revisions, and delivery format.",
      content: "Show your process, revision policy, and typical turnaround so clients know what to expect."
    },
    "Wellness & Therapy": {
      label: "What is included in the session?",
      placeholder: "e.g. Certifications, session length, and wellness products used.",
      content: "Wellness providers should highlight credentials, session format, and support offered before the booking."
    },
    "Cleaning & Home Care": {
      label: "What does your cleaning package include?",
      placeholder: "e.g. Supplies included, area size covered, and extras like laundry or ironing.",
      content: "Cleaning listings should explain what is included, what the customer should prepare, and any special tools used."
    },
    "Education & Tutoring": {
      label: "What will students receive?",
      placeholder: "e.g. Lesson materials, homework support, and online or in-person sessions.",
      content: "Education profiles should mention lesson format, age group, and whether materials are included."
    },
    "Photography & Videography": {
      label: "What is included in your package?",
      placeholder: "e.g. Editing, travel, image delivery, and reel options.",
      content: "Photographers and videographers should mention style, editing turnaround, and package inclusions."
    },
    "Mobile & Tech Support": {
      label: "What support do you provide?",
      placeholder: "e.g. Device setup, repair, remote troubleshooting, and on-site support.",
      content: "Tech support listings should mention device types, response time, and whether remote help is available."
    },
    "Fitness & Training": {
      label: "What does your training include?",
      placeholder: "e.g. Session duration, equipment, and fitness level suitability.",
      content: "Fitness providers should mention style, equipment, and whether the session is one-on-one or group based."
    },
    "Home Repairs & Maintenance": {
      label: "What is covered in your service?",
      placeholder: "e.g. Materials, diagnosis, and whether emergency visits are available.",
      content: "Repair providers should mention tools, common problem areas, and whether parts are included."
    },
    "WiFi Installation": {
      label: "What does your installation package include?",
      placeholder: "e.g. Router setup, cabling, signal testing, and aftercare support.",
      content: "Installation providers should mention coverage area, equipment used, testing performed, and whether follow-up support is included."
    },
    "Solar Installation": {
      label: "What does your solar installation service include?",
      placeholder: "e.g. Site assessment, panel mounting, wiring, and system testing.",
      content: "Solar installation profiles should explain the scope of work, equipment used, site requirements, and warranty or maintenance support."
    },
    "CCTV Installation": {
      label: "What is included in your CCTV setup?",
      placeholder: "e.g. Camera placement, wiring, remote access setup, and testing.",
      content: "Security installation listings should highlight camera coverage, installation area, remote access features, and support after setup."
    },
    "Smart Home Installation": {
      label: "What is included in your smart home setup?",
      placeholder: "e.g. Device installation, app configuration, and network setup.",
      content: "Smart home providers should mention compatible devices, setup complexity, and whether troubleshooting support is included."
    }
  };

  const current = detailsMap[category] || {
    label: "What does your service include?",
    placeholder: "Add details that help customers make a decision.",
    content: "Give customers a clear sense of what is included and what makes your service dependable."
  };

  includesLabel.textContent = current.label;
  els.serviceIncludes.placeholder = current.placeholder;
  categoryDetails.innerHTML = `<p class="font-semibold text-slate-900">Suggested detail for ${category}</p><p class="mt-1">${current.content}</p>`;
}

function parseSummaryDetails(description = "") {
  const summaryStart = description.indexOf("\n\nCategory:");
  const mainDescription = summaryStart >= 0 ? description.slice(0, summaryStart).trim() : description.trim();

  const summary = {};
  if (summaryStart >= 0) {
    const summaryBlock = description.slice(summaryStart + 2).trim();
    const lines = summaryBlock.split(/\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => {
      if (line.startsWith("Category:")) summary.category = line.replace("Category:", "").trim();
      if (line.startsWith("Delivery:")) summary.delivery = line.replace("Delivery:", "").trim();
      if (line.startsWith("Location:")) summary.location = line.replace("Location:", "").trim();
      if (line.startsWith("Service area:")) summary.serviceArea = line.replace("Service area:", "").trim();
      if (line.startsWith("Capacity:")) summary.capacity = line.replace("Capacity:", "").trim();
      if (line.startsWith("Who interacts:")) summary.interaction = line.replace("Who interacts:", "").trim();
      if (line.startsWith("Includes:")) summary.includes = line.replace("Includes:", "").trim();
      if (line.startsWith("Business:")) summary.businessName = line.replace("Business:", "").trim();
      if (line.startsWith("Booking mode:")) summary.bookingMode = line.replace("Booking mode:", "").trim();
      if (line.startsWith("Availability:")) summary.availability = line.replace("Availability:", "").trim();
    });
  }

  return { mainDescription, ...summary };
}

function getExtFromFileName(name = "") {
  const parts = String(name).split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  return ext ? `.${ext}` : "";
}

async function prepareImageForUpload(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable.");
    context.drawImage(bitmap, 0, 0);

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!pngBlob) throw new Error("Unable to convert this image to PNG.");
    if (pngBlob.size > 10 * 1024 * 1024) {
      throw new Error("This image is larger than 10MB after conversion.");
    }

    const baseName = (file.name || "portfolio-image").replace(/\.[^/.]+$/i, "") || "portfolio-image";
    return new File([pngBlob], `${baseName}.png`, { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

async function uploadSelectedImages(serviceId) {
  const uploadedUrls = [];

  for (const [index, selectedFile] of selectedImageFiles.entries()) {
    const uploadFile = await prepareImageForUpload(selectedFile);
    const fileName = `${currentUser.id}_${Date.now()}_${index}_${uploadFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, uploadFile, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    if (!urlData?.publicUrl) throw new Error("Could not create a public URL for this image.");
    uploadedUrls.push(urlData.publicUrl);
  }

  return uploadedUrls;
}

function showPreview(urls) {
  if (!els.imagePreview) return;
  const uploadBox = els.imagePreview.querySelector('.service-photo-upload-box');
  els.imagePreview.querySelectorAll('.service-photo-item').forEach((item) => item.remove());
  const imageList = Array.isArray(urls) ? urls : [urls];
  imageList.filter(Boolean).forEach((url, index) => {
    const photo = document.createElement('div');
    photo.className = 'service-photo-item';
    photo.innerHTML = `<img src="${url}" alt="Service photo ${index + 1}">`;
    els.imagePreview.insertBefore(photo, uploadBox);
  });
  document.getElementById('service-image-count').textContent = `${imageList.filter(Boolean).length} / ${MAX_PORTFOLIO_IMAGES} photos`;
  els.removeImageBtn?.classList.toggle('hidden', imageList.filter(Boolean).length === 0);
  uploadBox?.classList.toggle('hidden', imageList.filter(Boolean).length >= MAX_PORTFOLIO_IMAGES);
}

function hidePreview() {
  if (!els.imagePreview) return;
  els.imagePreview.querySelectorAll('.service-photo-item').forEach((item) => item.remove());
  document.getElementById('service-image-count').textContent = `0 / ${MAX_PORTFOLIO_IMAGES} photos`;
  els.removeImageBtn?.classList.add('hidden');
  els.imagePreview.querySelector('.service-photo-upload-box')?.classList.remove('hidden');
}

function renderSelectedFilePreviews() {
  if (!els.imagePreview) return;
  const uploadBox = els.imagePreview.querySelector('.service-photo-upload-box');
  els.imagePreview.querySelectorAll('.service-photo-item').forEach((item) => item.remove());
  selectedImageFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const photo = document.createElement('div');
      photo.className = 'service-photo-item';
      photo.innerHTML = `<img src="${event.target.result}" alt="Selected service photo ${index + 1}"><button type="button" class="service-photo-remove" data-photo-index="${index}" aria-label="Remove photo ${index + 1}">×</button>`;
      els.imagePreview.insertBefore(photo, uploadBox);
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('service-image-count').textContent = `${selectedImageFiles.length} / ${MAX_PORTFOLIO_IMAGES} photos`;
  els.removeImageBtn?.classList.toggle('hidden', selectedImageFiles.length === 0);
  uploadBox?.classList.toggle('hidden', selectedImageFiles.length >= MAX_PORTFOLIO_IMAGES);
  els.photoFileList.innerHTML = selectedImageFiles.map((file) => `<div class="rounded-md border border-slate-200 bg-white px-3 py-2">${file.name}</div>`).join('');
}

function fillForm(service, registeredCountry) {
  currentService = service;
  const { mainDescription, category, delivery, location, serviceArea, capacity, interaction, includes, businessName } = parseSummaryDetails(service.description || "");

  els.serviceTitle.value = service.title ?? "";
  els.serviceDescription.value = mainDescription ?? "";
  els.serviceCategory.value = category || service.category || "";
  els.serviceDelivery.value = delivery || "";
  els.serviceLocation.value = location || service.location || "";
  if (els.serviceLatitude) els.serviceLatitude.value = service.latitude ?? "";
  if (els.serviceLongitude) els.serviceLongitude.value = service.longitude ?? "";
  els.serviceArea.value = serviceArea || "";
  els.serviceCapacity.value = capacity || "";
  els.serviceInteraction.value = interaction || "";
  els.serviceIncludes.value = includes || "";
  els.servicePrice.value = service.price ?? service.base_price ?? "";
  els.dealMessage.value = service.deal_message ?? service.deal_headline ?? "";
  const legacyTravelFee = service.travel_price ?? service.travel_price_amount;
  const travelPricing = Array.isArray(service.travel_pricing)
    ? { mode: "distance", distanceBands: service.travel_pricing, locationRates: [], baseLocation: {} }
    : (service.travel_pricing || {});
  const travelBands = Array.isArray(travelPricing.distanceBands) ? travelPricing.distanceBands : [];
  document.getElementById("travels-to-customer").checked = service.travels_to_customer ?? Number(legacyTravelFee) > 0;
  const pricingMode = document.getElementById("travel-pricing-mode");
  if (pricingMode) pricingMode.value = ["distance", "location", "both"].includes(travelPricing.mode) ? travelPricing.mode : "distance";
  const baseLocation = travelPricing.baseLocation || {};
  const baseCountry = document.getElementById("travel-base-country");
  const baseState = document.getElementById("travel-base-state");
  const baseCity = document.getElementById("travel-base-city");
  if (baseCountry) baseCountry.value = registeredCountry || DEFAULT_COUNTRY;
  if (baseState) {
    const states = COUNTRY_STATE_MAP[baseCountry?.value] || [];
    baseState.innerHTML = `<option value="">Select a state</option>${states.map((state) => `<option value="${state}">${state}</option>`).join('')}`;
    baseState.value = baseLocation.state || '';
    if (baseCity) baseCity.innerHTML = `<option value="">Select a city</option>${(STATE_CITY_MAP[baseState.value] || []).map((city) => `<option value="${city}">${city}</option>`).join('')}`;
  }
  const baseCountryInput = document.getElementById("travel-base-country");
  baseCountryInput?.setAttribute('aria-readonly', 'true');
  document.getElementById("travel-base-city").value = baseLocation.city || '';
  document.getElementById("travel-base-area").value = baseLocation.area || '';
  ["travel-fee-5", "travel-fee-10", "travel-fee-20", "travel-fee-above"].forEach((id, index) => {
    const input = document.getElementById(id);
    const value = travelBands[index]?.fee;
    if (input && value !== undefined && value !== null) input.value = value;
  });
  const selectedCities = document.querySelector("[data-travel-selected-cities]");
  if (selectedCities) selectedCities.innerHTML = '';
  (Array.isArray(travelPricing.locationRates) ? travelPricing.locationRates : []).forEach((rate) => {
    const row = document.createElement("div");
    row.dataset.locationRateRow = "";
    row.dataset.state = rate.state || String(rate.location || '').split(',').slice(1).join(',').trim();
    row.dataset.city = rate.city || String(rate.location || '').split(',')[0].trim();
    row.className = "grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto]";
    const city = rate.city || String(rate.location || '').split(',')[0].trim();
    const state = rate.state || String(rate.location || '').split(',').slice(1).join(',').trim();
    row.innerHTML = `<span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">${city}, ${state}</span><input type="hidden" data-location-rate-state value="${String(state).replace(/"/g, "&quot;")}"><input type="hidden" data-location-rate-city value="${String(city).replace(/"/g, "&quot;")}"><input type="number" data-location-rate-fee min="0" step="0.01" placeholder="Travel fee" class="rounded-md border border-gray-300 px-3 py-2" value="${rate.fee ?? ""}"><button type="button" data-remove-location-rate class="px-3 text-sm font-semibold text-red-600">Remove</button>`;
    selectedCities?.appendChild(row);
  });
  els.groupDiscountThreshold.value = service.group_discount_threshold ?? "";
  els.groupDiscountPercent.value = service.group_discount_percent ?? "";
  els.businessName.value = businessName || "";
  setAvailabilityDays(service.availability_days || (parseSummaryDetails(service.description || "").availability ? parseSummaryDetails(service.description || "").availability.split(",").map((day) => day.trim()).filter(Boolean) : []));

  if (service.image_urls?.length || service.image_url) {
    showPreview(service.image_urls?.length ? service.image_urls : service.image_url);
  } else {
    hidePreview();
  }
}

function bindImageHandlers() {
  if (els.serviceImage) {
    els.serviceImage.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) {
        e.target.value = "";
        return;
      }

      if (selectedImageFiles.length + files.length > MAX_PORTFOLIO_IMAGES) {
        alert(`Please select up to ${MAX_PORTFOLIO_IMAGES} photos.`);
        els.serviceImage.value = "";
        return;
      }

      selectedImageFiles = [...selectedImageFiles, ...files];
      renderSelectedFilePreviews();
      e.target.value = "";
    });

    els.imagePreview.addEventListener('click', (e) => {
      const removeButton = e.target.closest('.service-photo-remove');
      if (!removeButton) return;
      selectedImageFiles.splice(Number(removeButton.dataset.photoIndex), 1);
      if (selectedImageFiles.length) {
        renderSelectedFilePreviews();
      } else {
        hidePreview();
      }
    });
  }

  if (els.removeImageBtn) {
    els.removeImageBtn.addEventListener("click", (e) => {
      e.preventDefault();
      selectedImageFiles = [];
      els.serviceImage.value = "";
      hidePreview();
      els.photoFileList.innerHTML = "";
    });
  }
}

async function loadService(serviceId, userId) {
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
  updateWizardUI();
  renderCategoryDetails();

  const locationRates = document.getElementById("travel-location-rates");
  const pricingMode = document.getElementById("travel-pricing-mode");
  const travelToggle = document.getElementById("travels-to-customer");
  const travelOptions = document.getElementById("travel-options");
  const baseCountry = document.getElementById("travel-base-country");
  const baseState = document.getElementById("travel-base-state");
  const baseCity = document.getElementById("travel-base-city");
  if (baseCountry) {
    baseCountry.innerHTML = Object.keys(COUNTRY_STATE_MAP).sort().map((country) => `<option value="${country}">${country}</option>`).join('');
    baseCountry.value = DEFAULT_COUNTRY;
    baseState.innerHTML = `<option value="">Select a state</option>${(COUNTRY_STATE_MAP[DEFAULT_COUNTRY] || []).map((state) => `<option value="${state}">${state}</option>`).join('')}`;
    baseCity.innerHTML = '<option value="">Select a city</option>';
  }
  baseState?.addEventListener('change', () => {
    baseCity.innerHTML = `<option value="">Select a city</option>${(STATE_CITY_MAP[baseState.value] || []).map((city) => `<option value="${city}">${city}</option>`).join('')}`;
  });
  const updateLocationRateVisibility = () => {
    locationRates?.classList.toggle("hidden", pricingMode?.value === "distance");
  };
  pricingMode?.addEventListener("change", updateLocationRateVisibility);
  travelToggle?.addEventListener("change", () => {
    travelOptions?.classList.toggle("hidden", !travelToggle.checked);
    clearErrors();
  });
  const renderCityOptions = (section) => {
    const destinationState = section.querySelector('[data-travel-destination-state]');
    const cityOptions = section.querySelector('[data-travel-city-options]');
    const state = destinationState.value;
    const cities = STATE_CITY_MAP[state] || [];
    cityOptions.innerHTML = state
      ? `${cities.map((city) => `<label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" data-city-option="${city}" class="h-4 w-4">${city}</label>`).join('')}<div class="flex gap-2 sm:col-span-2"><input data-manual-city-input type="text" placeholder="Add another city or area" class="flex-1 rounded-md border border-gray-300 px-3 py-2"><button type="button" data-add-manual-city class="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Add city</button></div>`
      : '';
  };
  const setupStateSection = (section) => {
    const destinationState = section.querySelector('[data-travel-destination-state]');
    destinationState.innerHTML = '<option value="">Select a state</option>' + (COUNTRY_STATE_MAP[baseCountry?.value] || []).map((state) => `<option value="${state}">${state}</option>`).join('');
    destinationState.addEventListener('change', () => renderCityOptions(section));
    section.querySelector('[data-travel-city-options]').addEventListener('click', (event) => {
      if (event.target.matches('[data-city-option]') && event.target.checked) {
        const selected = section.querySelector('[data-travel-selected-cities]');
        const city = event.target.dataset.cityOption;
        selected.insertAdjacentHTML('beforeend', `<div data-location-rate-row data-state="${destinationState.value}" data-city="${city}" class="grid gap-3 sm:grid-cols-[1fr_180px_auto]"><span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">${city}, ${destinationState.value}</span><input type="hidden" data-location-rate-state value="${destinationState.value}"><input type="hidden" data-location-rate-city value="${city}"><input type="number" data-location-rate-fee min="0" step="0.01" placeholder="Travel fee" class="rounded-md border border-gray-300 px-3 py-2"><button type="button" data-remove-location-rate class="px-3 text-sm font-semibold text-red-600">Remove</button></div>`);
      }
      if (event.target.matches('[data-add-manual-city]')) {
        const input = section.querySelector('[data-manual-city-input]');
        const city = input?.value.trim();
        if (city) {
          const selected = section.querySelector('[data-travel-selected-cities]');
          selected.insertAdjacentHTML('beforeend', `<div data-location-rate-row data-state="${destinationState.value}" data-city="${city}" class="grid gap-3 sm:grid-cols-[1fr_180px_auto]"><span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">${city}, ${destinationState.value}</span><input type="hidden" data-location-rate-state value="${destinationState.value}"><input type="hidden" data-location-rate-city value="${city}"><input type="number" data-location-rate-fee min="0" step="0.01" placeholder="Travel fee" class="rounded-md border border-gray-300 px-3 py-2"><button type="button" data-remove-location-rate class="px-3 text-sm font-semibold text-red-600">Remove</button></div>`);
          input.value = '';
        }
      }
    });
  };
  const refreshDestinationStates = () => {
    locationRates.querySelectorAll('[data-travel-state-section]').forEach((section) => {
      const stateSelect = section.querySelector('[data-travel-destination-state]');
      const currentState = stateSelect.value;
      stateSelect.innerHTML = '<option value="">Select a state</option>' + (COUNTRY_STATE_MAP[baseCountry?.value] || []).map((state) => `<option value="${state}">${state}</option>`).join('');
      if ([...stateSelect.options].some((option) => option.value === currentState)) stateSelect.value = currentState;
      renderCityOptions(section);
    });
  };
  locationRates.querySelectorAll('[data-travel-state-section]').forEach(setupStateSection);
  baseCountry?.addEventListener('change', refreshDestinationStates);
  document.getElementById('add-location-rate')?.addEventListener('click', () => {
    const section = locationRates.querySelector('[data-travel-state-section]').cloneNode(true);
    section.querySelector('[data-travel-destination-state]').value = '';
    section.querySelector('[data-travel-city-options]').innerHTML = '';
    section.querySelector('[data-travel-selected-cities]').innerHTML = '';
    section.querySelector('[data-remove-travel-state]').classList.remove('hidden');
    locationRates.insertBefore(section, document.getElementById('add-location-rate'));
    setupStateSection(section);
  });
  locationRates.addEventListener('click', (event) => event.target.matches('[data-remove-travel-state]') && event.target.closest('[data-travel-state-section]')?.remove());
  updateLocationRateVisibility();
  travelOptions?.classList.toggle("hidden", !travelToggle?.checked);

  els.serviceCategory.addEventListener("change", () => {
    renderCategoryDetails();
    clearErrors();
  });

  document.querySelectorAll("#service-location, #service-area, #service-capacity, #service-interaction, #service-title, #service-description, #service-includes, #service-price, #travels-to-customer, #travel-fee-5, #travel-fee-10, #travel-fee-20, #travel-fee-above, #deal-message, #group-discount-threshold, #group-discount-percent, #business-name, #service-category, #service-delivery").forEach((input) => {
    input.addEventListener("input", () => {
      clearErrors();
      validateCurrentStep();
    });
  });

  els.nextBtn.addEventListener("click", () => {
    if (validateCurrentStep()) {
      currentStep = Math.min(currentStep + 1, 3);
      updateWizardUI();
    }
  });

  els.prevBtn.addEventListener("click", () => {
    currentStep = Math.max(currentStep - 1, 1);
    updateWizardUI();
  });

  const serviceId = getBookingOrNull();
  if (!serviceId) {
    alert("Missing service_id in URL. Example: edit-service.html?service_id=UUID");
    return;
  }

  setLoading(true);

  try {
    const user = await ensureAuth();
    currentUser = user;
    const service = await loadService(serviceId, user.id);
    // Get user's country and pass it to location picker
    const userCountry = getUserCountry();
    fillForm(service, userCountry);
    const countryCode = getGeocodeCountryCode(userCountry);
    
    setupLocationPicker({
      mapId: "service-location-map",
      locationId: "service-location",
      latitudeId: "service-latitude",
      longitudeId: "service-longitude",
      coordinatesId: "service-location-coordinates",
      countryCode: countryCode,
      initialCoordinates: Number.isFinite(Number(service.latitude)) && Number.isFinite(Number(service.longitude))
        ? { latitude: Number(service.latitude), longitude: Number(service.longitude) }
        : null
    });

    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!validateCurrentStep()) {
        return;
      }

      const selectedLatitude = Number.parseFloat(els.serviceLatitude?.value);
      const selectedLongitude = Number.parseFloat(els.serviceLongitude?.value);
      if (!Number.isFinite(selectedLatitude) || !Number.isFinite(selectedLongitude)) {
        alert("Please select the exact service location on the map before updating.");
        return;
      }

      const submitBtn = els.submitBtn;
      const originalBtnText = submitBtn.innerText;
      submitBtn.innerText = "Updating...";
      submitBtn.disabled = true;

      try {
        const title = els.serviceTitle.value.trim();
        const description = els.serviceDescription.value.trim();
        const category = els.serviceCategory.value;
        const priceValue = els.servicePrice.value.trim();
        const price = Number.parseFloat(priceValue);
        const location = els.serviceLocation.value.trim();
        const serviceArea = els.serviceArea.value.trim();
        const delivery = els.serviceDelivery.value;
        const capacity = els.serviceCapacity.value.trim();
        const interaction = els.serviceInteraction.value;
        const includes = els.serviceIncludes.value.trim();
        const businessName = els.businessName.value.trim();
        const instantBooking = els.instantBooking?.checked || false;
        const dealMessage = els.dealMessage.value.trim();
        const groupDiscountThreshold = els.groupDiscountThreshold.value.trim();
        const groupDiscountPercent = els.groupDiscountPercent.value.trim();
        const availabilityDays = getSelectedAvailabilityDays();

        const summaryDetails = [
          `Category: ${category}`,
          `Delivery: ${delivery}`,
          `Location: ${location}`,
          `Service area: ${serviceArea || "Not specified"}`,
          `Capacity: ${capacity || "Flexible"}`,
          `Who interacts: ${interaction}`,
          `Includes: ${includes || "Not specified"}`,
          `Booking mode: ${instantBooking ? "Instant booking enabled" : "Manual approval for first bookings"}`,
          `Business: ${businessName || "Not provided"}`,
          availabilityDays.length ? `Availability: ${availabilityDays.join(", ")}` : "Availability: Not specified"
        ].join("\n");

        let imageUrl = service.image_url ?? null;
        let imageUrls = Array.isArray(service.image_urls) ? service.image_urls : [];

        if (selectedImageFiles.length > 0) {
          const uploadedUrls = await uploadSelectedImages(serviceId);
          imageUrl = uploadedUrls[0] || imageUrl;
          imageUrls = uploadedUrls;
        }

        const descriptionText = [description, summaryDetails].filter(Boolean).join("\n\n");
        const updatePayload = {
          title,
          description: descriptionText,
          category,
          price,
          location,
          latitude: selectedLatitude,
          longitude: selectedLongitude,
          country_code: getCountryConfig(getUserCountry()).code,
          currency_code: getCurrencyCodeForCountry(getUserCountry()),
          travels_to_customer: document.getElementById("travels-to-customer")?.checked || false,
          travel_pricing: document.getElementById("travels-to-customer")?.checked ? getTravelPricing() : null,
          deal_message: dealMessage || null,
          deal_headline: dealMessage || null,
          group_discount_threshold: groupDiscountThreshold ? parseInt(groupDiscountThreshold, 10) : null,
          group_discount_percent: groupDiscountPercent ? parseFloat(groupDiscountPercent) : null,
          image_url: imageUrl,
          image_urls: imageUrls.length > 0 ? imageUrls : null,
          availability_days: availabilityDays.length > 0 ? availabilityDays : null,
          availability_note: availabilityDays.length > 0 ? `Available on ${availabilityDays.join(", ")}` : null,
          updated_at: new Date().toISOString(),
        };

        const { error: updateErr } = await supabase
          .from("services")
          .update(updatePayload)
          .eq("id", serviceId)
          .eq("provider_id", currentService?.provider_id || user.id);

        if (updateErr) throw updateErr;

        alert("Service updated successfully ✅");
        LoadingSpinner.navigateTo("my-services.html");
      } catch (err) {
        console.error(err);
        alert(err?.message || "Failed to update service.");
        submitBtn.innerText = originalBtnText;
        submitBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error(err);
    alert(err?.message || "Failed to load service.");
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  if (!els.submitBtn) return;
  els.submitBtn.disabled = !!isLoading;
  els.submitBtn.textContent = isLoading ? "Updating..." : "Update Service";
}

document.addEventListener("DOMContentLoaded", main);
