// edit-service.js
import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

let selectedImageFiles = [];
let currentStep = 1;
const MAX_PORTFOLIO_IMAGES = 3;

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
  travelPrice: document.getElementById("travel-price"),
  groupDiscountThreshold: document.getElementById("group-discount-threshold"),
  groupDiscountPercent: document.getElementById("group-discount-percent"),
  businessName: document.getElementById("business-name"),
  instantBooking: document.getElementById("instant-booking"),
  serviceImage: document.getElementById("service-image"),
  imagePreview: document.getElementById("image-preview"),
  previewImg: document.getElementById("preview-img"),
  removeImageBtn: document.getElementById("remove-image-btn"),
  photoFileList: document.getElementById("photo-file-list"),
};

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
  const travelPriceInput = els.travelPrice;
  const dealMessageInput = els.dealMessage;
  const thresholdInput = els.groupDiscountThreshold;
  const percentInput = els.groupDiscountPercent;
  const businessInput = els.businessName;
  const priceValue = priceInput.value.trim();
  const priceNumber = Number.parseFloat(priceValue);
  const travelPrice = travelPriceInput.value.trim();
  const travelPriceNumber = Number.parseFloat(travelPrice);
  const dealMessage = dealMessageInput.value.trim();
  const threshold = thresholdInput.value.trim();
  const percent = percentInput.value.trim();
  let hasError = false;

  if (!priceValue || Number.isNaN(priceNumber) || priceNumber < 1000) {
    showFieldError("error-service-price", "Please enter a realistic price of at least NGN 1,000.");
    setFieldState(priceInput, false);
    hasError = true;
  } else {
    setFieldState(priceInput, true);
  }

  if (!travelPrice || Number.isNaN(travelPriceNumber) || travelPriceNumber < 0) {
    showFieldError("error-travel-price", "Please enter a valid travel price of 0 or more.");
    setFieldState(travelPriceInput, false);
    hasError = true;
  } else {
    setFieldState(travelPriceInput, true);
  }

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

function fillForm(service) {
  currentService = service;
  const { mainDescription, category, delivery, location, serviceArea, capacity, interaction, includes, businessName } = parseSummaryDetails(service.description || "");

  els.serviceTitle.value = service.title ?? "";
  els.serviceDescription.value = mainDescription ?? "";
  els.serviceCategory.value = category || service.category || "";
  els.serviceDelivery.value = delivery || "";
  els.serviceLocation.value = location || service.location || "";
  els.serviceArea.value = serviceArea || "";
  els.serviceCapacity.value = capacity || "";
  els.serviceInteraction.value = interaction || "";
  els.serviceIncludes.value = includes || "";
  els.servicePrice.value = service.price ?? service.base_price ?? "";
  els.dealMessage.value = service.deal_message ?? service.deal_headline ?? "";
  els.travelPrice.value = service.travel_price ?? service.travel_price_amount ?? "";
  els.groupDiscountThreshold.value = service.group_discount_threshold ?? "";
  els.groupDiscountPercent.value = service.group_discount_percent ?? "";
  els.businessName.value = businessName || "";

  if (service.image_url) {
    showPreview(service.image_url);
  } else {
    hidePreview();
  }
}

function bindImageHandlers() {
  if (els.serviceImage) {
    els.serviceImage.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) {
        selectedImageFiles = [];
        hidePreview();
        els.photoFileList.innerHTML = "";
        return;
      }

      if (files.length > MAX_PORTFOLIO_IMAGES) {
        alert(`Please select up to ${MAX_PORTFOLIO_IMAGES} photos.`);
        els.serviceImage.value = "";
        selectedImageFiles = [];
        hidePreview();
        els.photoFileList.innerHTML = "";
        return;
      }

      selectedImageFiles = files;
      const primaryFile = selectedImageFiles[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        showPreview(event.target.result);
      };
      reader.readAsDataURL(primaryFile);

      els.photoFileList.innerHTML = selectedImageFiles.map((file) => `<div class="rounded-md border border-slate-200 bg-white px-3 py-2">${file.name}</div>`).join("");
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

  els.serviceCategory.addEventListener("change", () => {
    renderCategoryDetails();
    clearErrors();
  });

  document.querySelectorAll("#service-location, #service-area, #service-capacity, #service-interaction, #service-title, #service-description, #service-includes, #service-price, #travel-price, #deal-message, #group-discount-threshold, #group-discount-percent, #business-name, #service-category, #service-delivery").forEach((input) => {
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
    fillForm(service);

    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!validateCurrentStep()) {
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
        const travelPrice = els.travelPrice.value.trim();

        const summaryDetails = [
          `Category: ${category}`,
          `Delivery: ${delivery}`,
          `Location: ${location}`,
          `Service area: ${serviceArea || "Not specified"}`,
          `Capacity: ${capacity || "Flexible"}`,
          `Who interacts: ${interaction}`,
          `Includes: ${includes || "Not specified"}`,
          `Booking mode: ${instantBooking ? "Instant booking enabled" : "Manual approval for first bookings"}`,
          `Business: ${businessName || "Not provided"}`
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
          travel_price: travelPrice && !Number.isNaN(parseFloat(travelPrice)) ? parseFloat(travelPrice) : null,
          deal_message: dealMessage || null,
          deal_headline: dealMessage || null,
          group_discount_threshold: groupDiscountThreshold ? parseInt(groupDiscountThreshold, 10) : null,
          group_discount_percent: groupDiscountPercent ? parseFloat(groupDiscountPercent) : null,
          image_url: imageUrl,
          image_urls: imageUrls.length > 0 ? imageUrls : null,
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
