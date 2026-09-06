import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';
import { setupLocationPicker } from './location-picker.js';
import { getCountryConfig, getUserCountry } from './country-config.js';
import { getGeocodeCountryCode } from './location-data.js';
import { COUNTRY_STATE_MAP, DEFAULT_COUNTRY, STATE_CITY_MAP } from './location-data.js';
import { getCurrencyCodeForCountry } from './currency-utils.js';


let selectedImageFiles = [];
let currentStep = 1;
const MAX_PORTFOLIO_IMAGES = 10;

function clearErrors() {
    document.querySelectorAll('[id^="error-"]').forEach((el) => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function setFieldState(inputEl, isValid) {
    if (!inputEl) return;
    inputEl.classList.toggle('border-red-500', !isValid);
    inputEl.classList.toggle('focus:border-red-500', !isValid);
    inputEl.classList.toggle('border-gray-300', isValid);
}

function stripDealFields(serviceData) {
    const cleaned = { ...serviceData };
    delete cleaned.deal_message;
    delete cleaned.group_discount_threshold;
    delete cleaned.group_discount_percent;
    delete cleaned.image_urls;
    delete cleaned.availability_days;
    delete cleaned.availability_note;
    return cleaned;
}

function getSelectedAvailabilityDays() {
    return Array.from(document.querySelectorAll('input[name="availability-day"]:checked')).map((input) => input.value);
}

async function prepareImageForUpload(file) {
    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable.');
        context.drawImage(bitmap, 0, 0);

        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
        if (!pngBlob) throw new Error('Unable to convert this image to PNG.');
        if (pngBlob.size > 10 * 1024 * 1024) {
            throw new Error('This image is larger than 10MB after conversion.');
        }

        const baseName = (file.name || 'portfolio-image').replace(/\.[^/.]+$/i, '') || 'portfolio-image';
        return new File([pngBlob], `${baseName}.png`, { type: 'image/png' });
    } finally {
        bitmap.close();
    }
}

function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function isLikelyNonsense(value, { minLength = 8, minWords = 2 } = {}) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return true;

    const bannedTerms = [
        'lorem ipsum',
        'asdf',
        'qwerty',
        'test service',
        'testing',
        'demo',
        'placeholder',
        'tbd',
        'coming soon',
        'n/a',
        'none',
        'nothing',
        'service provider',
        'provider service',
        'good service',
        'best service',
        'any service',
        'hello',
        'hi there',
        'sample'
    ];

    if (bannedTerms.some((term) => normalized.includes(term))) return true;

    const lettersOnly = normalized.replace(/[^a-z]/g, '');
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

function getTravelPricing() {
    const values = ['travel-fee-5', 'travel-fee-10', 'travel-fee-20', 'travel-fee-above']
        .map((id) => document.getElementById(id)?.value.trim() || '');
    const limits = [5, 10, 20, null];
    const distanceBands = limits.map((maxKm, index) => ({
        maxKm,
        fee: values[index] === '' ? null : Number.parseFloat(values[index]),
    }));
    const locationRates = Array.from(document.querySelectorAll('[data-travel-selected-cities] [data-location-rate-row]')).map((row) => ({
        state: row.querySelector('[data-location-rate-state]')?.value.trim() || '',
        city: row.querySelector('[data-location-rate-city]')?.value.trim() || '',
        fee: Number.parseFloat(row.querySelector('[data-location-rate-fee]')?.value || ''),
    })).filter((rate) => rate.state || rate.city || Number.isFinite(rate.fee))
        .map((rate) => ({ ...rate, location: [rate.city, rate.state].filter(Boolean).join(', ') }));
    return {
        mode: document.getElementById('travel-pricing-mode')?.value || 'both',
        distanceBands,
        locationRates,
        baseLocation: {
            country: document.getElementById('travel-base-country')?.value.trim() || '',
            state: document.getElementById('travel-base-state')?.value.trim() || '',
            city: document.getElementById('travel-base-city')?.value.trim() || '',
            area: document.getElementById('travel-base-area')?.value.trim() || '',
        },
    };
}

function validateTravelPricing() {
    if (!document.getElementById('travels-to-customer')?.checked) return true;
    const pricing = getTravelPricing();
    const baseLocation = pricing.baseLocation;
    const invalidBaseLocation = !baseLocation.country || !baseLocation.state || !baseLocation.city || !baseLocation.area;
    const invalidBands = pricing.mode !== 'location' && (pricing.distanceBands.slice(0, 3).some((band) => !Number.isFinite(band.fee) || band.fee < 0)
        || (pricing.distanceBands[3].fee !== null && (!Number.isFinite(pricing.distanceBands[3].fee) || pricing.distanceBands[3].fee < 0)));
    const invalidLocations = pricing.mode === 'location'
        ? (!pricing.locationRates.length || pricing.locationRates.some((rate) => !rate.location || !Number.isFinite(rate.fee) || rate.fee < 0))
        : pricing.locationRates.some((rate) => !rate.location || !Number.isFinite(rate.fee) || rate.fee < 0);
    const invalid = invalidBaseLocation || invalidBands || invalidLocations;
    if (invalid) {
        if (invalidBaseLocation) showFieldError('error-travel-base-location', 'Enter the country, state, city, and area where you are based.');
        if (invalidBands || invalidLocations) showFieldError('error-travel-pricing', 'Complete the selected travel fee rules. Add a destination and fee for location-based pricing.');
    }
    return !invalid;
}

function validateCurrentStep() {
    clearErrors();

    if (currentStep === 1) {
        const categoryInput = document.getElementById('service-category');
        const locationInput = document.getElementById('service-location');
        const areaInput = document.getElementById('service-area');
        const deliveryInput = document.getElementById('service-delivery');
        const capacityInput = document.getElementById('service-capacity');
        const interactionInput = document.getElementById('service-interaction');
        const category = categoryInput.value;
        const location = locationInput.value.trim();
        const serviceArea = areaInput.value.trim();
        const delivery = deliveryInput.value;
        const capacity = capacityInput.value.trim();
        const interaction = interactionInput.value;
        let hasError = false;

        if (!category) {
            showFieldError('error-service-category', 'Please select a category.');
            setFieldState(categoryInput, false);
            hasError = true;
        } else {
            setFieldState(categoryInput, true);
        }

        const locationError = validateLocation(location, 'Location');
        if (locationError) {
            showFieldError('error-service-location', locationError);
            setFieldState(locationInput, false);
            hasError = true;
        } else {
            setFieldState(locationInput, true);
        }

        const areaError = validateLocation(serviceArea, 'Service area');
        if (areaError) {
            showFieldError('error-service-area', areaError);
            setFieldState(areaInput, false);
            hasError = true;
        } else {
            setFieldState(areaInput, true);
        }

        if (!delivery) {
            showFieldError('error-service-delivery', 'Please choose how you deliver your service.');
            setFieldState(deliveryInput, false);
            hasError = true;
        } else {
            setFieldState(deliveryInput, true);
        }

        if (!capacity || !/^\d+$/.test(capacity) || parseInt(capacity, 10) < 1 || parseInt(capacity, 10) > 100) {
            showFieldError('error-service-capacity', 'Please enter a realistic capacity between 1 and 100.');
            setFieldState(capacityInput, false);
            hasError = true;
        } else {
            setFieldState(capacityInput, true);
        }

        if (!interaction) {
            showFieldError('error-service-interaction', 'Please tell us who the customer will interact with.');
            setFieldState(interactionInput, false);
            hasError = true;
        } else {
            setFieldState(interactionInput, true);
        }

        return !hasError;
    }

    if (currentStep === 2) {
        const titleInput = document.getElementById('service-title');
        const descriptionInput = document.getElementById('service-description');
        const includesInput = document.getElementById('service-includes');
        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();
        const includes = includesInput.value.trim();
        let hasError = false;

        const titleError = validateMeaningfulText(title, 'Service title', { minLength: 8, minWords: 2 });
        if (titleError) {
            showFieldError('error-service-title', titleError);
            setFieldState(titleInput, false);
            hasError = true;
        } else {
            setFieldState(titleInput, true);
        }

        const descriptionError = validateMeaningfulText(description, 'Service description', { minLength: 40, minWords: 8 });
        if (descriptionError) {
            showFieldError('error-service-description', descriptionError);
            setFieldState(descriptionInput, false);
            hasError = true;
        } else {
            setFieldState(descriptionInput, true);
        }

        const includesError = validateMeaningfulText(includes, 'Service details', { minLength: 15, minWords: 3, required: true });
        if (includesError) {
            showFieldError('error-service-includes', includesError);
            setFieldState(includesInput, false);
            hasError = true;
        } else {
            setFieldState(includesInput, true);
        }

        if (selectedImageFiles.length === 0) {
            showFieldError('error-service-image', 'Please upload at least one portfolio photo.');
            hasError = true;
        }

        if (selectedImageFiles.length > MAX_PORTFOLIO_IMAGES) {
            showFieldError('error-service-image', `Please select no more than ${MAX_PORTFOLIO_IMAGES} portfolio photos.`);
            hasError = true;
        }

        const oversizedFiles = selectedImageFiles.filter((file) => file.size > 10 * 1024 * 1024);
        if (oversizedFiles.length > 0) {
            showFieldError('error-service-image', 'Each photo must be 10MB or smaller.');
            hasError = true;
        }

        return !hasError;
    }

    const priceInput = document.getElementById('service-price');
    const dealMessageInput = document.getElementById('deal-message');
    const thresholdInput = document.getElementById('group-discount-threshold');
    const percentInput = document.getElementById('group-discount-percent');
    const businessInput = document.getElementById('business-name');
    const priceValue = priceInput.value.trim();
    const priceNumber = Number.parseFloat(priceValue);
    const dealMessage = dealMessageInput.value.trim();
    const threshold = thresholdInput.value.trim();
    const percent = percentInput.value.trim();
    let hasError = false;

    if (!priceValue || Number.isNaN(priceNumber) || priceNumber < 1000) {
        showFieldError('error-service-price', 'Please enter a realistic price of at least 1,000 in your currency.');
        setFieldState(priceInput, false);
        hasError = true;
    } else {
        setFieldState(priceInput, true);
    }

    if (!validateTravelPricing()) hasError = true;

    const dealMessageError = validateMeaningfulText(dealMessage, 'Promotional headline', { minLength: 4, minWords: 1 });
    if (dealMessageError) {
        showFieldError('error-deal-message', dealMessageError);
        setFieldState(dealMessageInput, false);
        hasError = true;
    } else {
        setFieldState(dealMessageInput, true);
    }

    if (threshold || percent) {
        if (!threshold) {
            showFieldError('error-group-discount-threshold', 'Please add a threshold if you want to offer a group discount.');
            setFieldState(thresholdInput, false);
            hasError = true;
        } else if (!/^\d+$/.test(threshold) || Number(threshold) < 2) {
            showFieldError('error-group-discount-threshold', 'Enter a whole number of at least 2.');
            setFieldState(thresholdInput, false);
            hasError = true;
        } else {
            setFieldState(thresholdInput, true);
        }

        if (!percent) {
            showFieldError('error-group-discount-percent', 'Please add a discount percentage if you want to offer a group discount.');
            setFieldState(percentInput, false);
            hasError = true;
        } else if (!/^\d+(\.\d+)?$/.test(percent) || Number(percent) < 1 || Number(percent) > 100) {
            showFieldError('error-group-discount-percent', 'Enter a discount from 1 to 100 percent.');
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
    const businessNameError = validateName(businessName, 'Business name');
    if (businessNameError) {
        showFieldError('error-business-name', businessNameError);
        setFieldState(businessInput, false);
        hasError = true;
    } else {
        setFieldState(businessInput, true);
    }

    return !hasError;
}

function updateWizardUI() {
    const stepPanels = Array.from(document.querySelectorAll('[data-step-panel]'));
    const progressBars = Array.from(document.querySelectorAll('[data-step-progress]'));
    const title = document.getElementById('wizard-title');
    const subtitle = document.getElementById('wizard-subtitle');
    const stepIndicator = document.getElementById('step-indicator');
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-btn');

    stepPanels.forEach((panel) => {
        const isActive = Number(panel.dataset.stepPanel) === currentStep;
        panel.classList.toggle('hidden', !isActive);
    });

    progressBars.forEach((bar, index) => {
        const isCompleted = index + 1 <= currentStep;
        bar.className = `h-2 flex-1 rounded-full ${isCompleted ? 'bg-indigo-600' : 'bg-slate-200'}`;
    });

    const titles = [
        'Tell us about your service',
        'Make your profile stand out',
        'Finish up and go live'
    ];
    const subtitles = [
        'Start with the basics so customers can immediately understand what you offer.',
        'Add the details and visuals that make your service feel trustworthy and premium.',
        'Set the right rate, booking preferences, and verification details before publishing.'
    ];

    title.textContent = titles[currentStep - 1];
    subtitle.textContent = subtitles[currentStep - 1];
    stepIndicator.textContent = String(currentStep);

    prevBtn.classList.toggle('hidden', currentStep === 1);
    nextBtn.classList.toggle('hidden', currentStep === 3);
    submitBtn.classList.toggle('hidden', currentStep !== 3);
}

function renderCategoryDetails() {
    const category = document.getElementById('service-category').value;
    const categoryDetails = document.getElementById('category-details');
    const includesLabel = document.getElementById('service-includes-label');

    const detailsMap = {
        Beauty: {
            label: 'What does your service include?',
            placeholder: 'e.g. House calls, products included, sanitized tools, and aftercare tips.',
            content: 'Beauty providers should highlight availability, products included, prep instructions, and any extras that make the experience smoother.'
        },
        Events: {
            label: 'What is included in your event package?',
            placeholder: 'e.g. Setup, teardown, sound system, and decor support.',
            content: 'Events providers should mention guest capacity, setup responsibilities, equipment provided, and turnaround expectations.'
        },
        Tailoring: {
            label: 'What should customers know about the tailoring process?',
            placeholder: 'e.g. Fabric sourcing, fitting sessions, and replacement policy.',
            content: 'Tailoring profiles work best when you mention turnaround time, fitting sessions, and material options.'
        },
        'Art & Illustration': {
            label: 'What can clients expect from your creative process?',
            placeholder: 'e.g. Concept sketches, revisions, and delivery format.',
            content: 'Show your process, revision policy, and typical turnaround so clients know what to expect.'
        },
        'Wellness & Therapy': {
            label: 'What is included in the session?',
            placeholder: 'e.g. Certifications, session length, and wellness products used.',
            content: 'Wellness providers should highlight credentials, session format, and support offered before the booking.'
        },
        'Cleaning & Home Care': {
            label: 'What does your cleaning package include?',
            placeholder: 'e.g. Supplies included, area size covered, and extras like laundry or ironing.',
            content: 'Cleaning listings should explain what is included, what the customer should prepare, and any special tools used.'
        },
        'Education & Tutoring': {
            label: 'What will students receive?',
            placeholder: 'e.g. Lesson materials, homework support, and online or in-person sessions.',
            content: 'Education profiles should mention lesson format, age group, and whether materials are included.'
        },
        'Photography & Videography': {
            label: 'What is included in your package?',
            placeholder: 'e.g. Editing, travel, image delivery, and reel options.',
            content: 'Photographers and videographers should mention style, editing turnaround, and package inclusions.'
        },
        'Mobile & Tech Support': {
            label: 'What support do you provide?',
            placeholder: 'e.g. Device setup, repair, remote troubleshooting, and on-site support.',
            content: 'Tech support listings should mention device types, response time, and whether remote help is available.'
        },
        'Fitness & Training': {
            label: 'What does your training include?',
            placeholder: 'e.g. Session duration, equipment, and fitness level suitability.',
            content: 'Fitness providers should mention style, equipment, and whether the session is one-on-one or group based.'
        },
        'Home Repairs & Maintenance': {
            label: 'What is covered in your service?',
            placeholder: 'e.g. Materials, diagnosis, and whether emergency visits are available.',
            content: 'Repair providers should mention tools, common problem areas, and whether parts are included.'
        },
        'WiFi Installation': {
            label: 'What does your installation package include?',
            placeholder: 'e.g. Router setup, cabling, signal testing, and aftercare support.',
            content: 'Installation providers should mention coverage area, equipment used, testing performed, and whether follow-up support is included.'
        },
        'Solar Installation': {
            label: 'What does your solar installation service include?',
            placeholder: 'e.g. Site assessment, panel mounting, wiring, and system testing.',
            content: 'Solar installation profiles should explain the scope of work, equipment used, site requirements, and warranty or maintenance support.'
        },
        'CCTV Installation': {
            label: 'What is included in your CCTV setup?',
            placeholder: 'e.g. Camera placement, wiring, remote access setup, and testing.',
            content: 'Security installation listings should highlight camera coverage, installation area, remote access features, and support after setup.'
        },
        'Smart Home Installation': {
            label: 'What is included in your smart home setup?',
            placeholder: 'e.g. Device installation, app configuration, and network setup.',
            content: 'Smart home providers should mention compatible devices, setup complexity, and whether troubleshooting support is included.'
        }
    };

    const current = detailsMap[category] || {
        label: 'What does your service include?',
        placeholder: 'Add details that help customers make a decision.',
        content: 'Give customers a clear sense of what is included and what makes your service dependable.'
    };

    includesLabel.textContent = current.label;
    document.getElementById('service-includes').placeholder = current.placeholder;
    categoryDetails.innerHTML = `<p class="font-semibold text-slate-900">Suggested detail for ${category}</p><p class="mt-1">${current.content}</p>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const addServiceForm = document.getElementById('add-service-form');
    const imageInput = document.getElementById('service-image');
    const imagePreview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const photoFileList = document.getElementById('photo-file-list');
    const nextBtn = document.getElementById('next-step-btn');
    const prevBtn = document.getElementById('prev-step-btn');
    const categorySelect = document.getElementById('service-category');

    // Get user's country and pass it to location picker
    const userCountry = getUserCountry();
    const countryCode = getGeocodeCountryCode(userCountry);

    setupLocationPicker({
        mapId: 'service-location-map',
        locationId: 'service-location',
        latitudeId: 'service-latitude',
        longitudeId: 'service-longitude',
        coordinatesId: 'service-location-coordinates',
        countryCode: countryCode
    });

    updateWizardUI();
    renderCategoryDetails();

    categorySelect.addEventListener('change', () => {
        renderCategoryDetails();
        clearErrors();
    });

    const locationRates = document.getElementById('travel-location-rates');
    const pricingMode = document.getElementById('travel-pricing-mode');
    const baseCountry = document.getElementById('travel-base-country');
    const baseState = document.getElementById('travel-base-state');
    const baseCity = document.getElementById('travel-base-city');
    const populateStates = () => {
        const states = COUNTRY_STATE_MAP[baseCountry?.value] || [];
        if (baseState) baseState.innerHTML = `<option value="">Select a state</option>${states.map((state) => `<option value="${state}">${state}</option>`).join('')}`;
        if (baseCity) baseCity.innerHTML = '<option value="">Select a city</option>';
    };
    const populateBaseCities = () => {
        const cities = STATE_CITY_MAP[baseState?.value] || [];
        if (baseCity) baseCity.innerHTML = `<option value="">Select a city</option>${cities.map((city) => `<option value="${city}">${city}</option>`).join('')}`;
    };
    if (baseCountry) {
        baseCountry.innerHTML = Object.keys(COUNTRY_STATE_MAP).sort().map((country) => `<option value="${country}">${country}</option>`).join('');
        baseCountry.value = COUNTRY_STATE_MAP[userCountry] ? userCountry : DEFAULT_COUNTRY;
        populateStates();
    }
    baseState?.addEventListener('change', populateBaseCities);
    const travelToggle = document.getElementById('travels-to-customer');
    const travelOptions = document.getElementById('travel-options');
    const updateLocationRateVisibility = () => {
        locationRates?.classList.toggle('hidden', pricingMode?.value === 'distance');
    };
    pricingMode?.addEventListener('change', updateLocationRateVisibility);
    travelToggle?.addEventListener('change', () => {
        travelOptions?.classList.toggle('hidden', !travelToggle.checked);
        clearErrors();
    });
    const renderCityOptions = (section) => {
        const destinationState = section.querySelector('[data-travel-destination-state]');
        const cityOptions = section.querySelector('[data-travel-city-options]');
        const state = destinationState?.value || '';
        const cities = STATE_CITY_MAP[state] || [];
        cityOptions.innerHTML = state
            ? `${cities.map((city) => `<label class="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" data-city-option="${city}" class="h-4 w-4">${city}</label>`).join('')}<div class="flex gap-2 sm:col-span-2"><input data-manual-city-input type="text" placeholder="Add another city or area" class="flex-1 rounded-md border border-gray-300 px-3 py-2"><button type="button" data-add-manual-city class="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Add city</button></div>`
            : '';
    };
    const addCityRow = (section, state, city) => {
        const selectedCities = section.querySelector('[data-travel-selected-cities]');
        if (selectedCities.querySelector(`[data-location-rate-row][data-city="${CSS.escape(city)}"][data-state="${CSS.escape(state)}"]`)) return;
        selectedCities.insertAdjacentHTML('beforeend', `<div data-location-rate-row data-state="${state}" data-city="${city}" class="grid gap-3 sm:grid-cols-[1fr_180px_auto]"><span class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">${city}, ${state}</span><input type="hidden" data-location-rate-state value="${state}"><input type="hidden" data-location-rate-city value="${city}"><input type="number" data-location-rate-fee min="0" step="0.01" placeholder="Travel fee" class="rounded-md border border-gray-300 px-3 py-2"><button type="button" data-remove-location-rate class="px-3 text-sm font-semibold text-red-600">Remove</button></div>`);
    };
    const setupStateSection = (section) => {
      const destinationState = section.querySelector('[data-travel-destination-state]');
      destinationState.innerHTML = '<option value="">Select a state</option>' + (COUNTRY_STATE_MAP[baseCountry?.value] || []).map((state) => `<option value="${state}">${state}</option>`).join('');
      destinationState.addEventListener('change', () => renderCityOptions(section));
      section.querySelector('[data-travel-city-options]').addEventListener('click', (event) => {
        if (event.target.matches('[data-city-option]')) {
            if (event.target.checked) addCityRow(section, destinationState.value, event.target.dataset.cityOption);
            else section.querySelector(`[data-location-rate-row][data-city="${CSS.escape(event.target.dataset.cityOption)}"]`)?.remove();
        }
        if (event.target.matches('[data-add-manual-city]')) {
            const input = section.querySelector('[data-manual-city-input]');
            if (input?.value.trim()) addCityRow(section, destinationState.value, input.value.trim());
            if (input) input.value = '';
        }
      });
      section.querySelector('[data-travel-selected-cities]').addEventListener('click', (event) => {
        if (event.target.matches('[data-remove-location-rate]')) event.target.closest('[data-location-rate-row]')?.remove();
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
    locationRates.addEventListener('click', (event) => {
      if (event.target.matches('[data-remove-travel-state]')) event.target.closest('[data-travel-state-section]')?.remove();
    });
    updateLocationRateVisibility();
    travelOptions?.classList.toggle('hidden', !travelToggle?.checked);

    document.querySelectorAll('#service-location, #service-area, #service-capacity, #service-interaction, #service-title, #service-description, #service-includes, #service-price, #travels-to-customer, #travel-fee-5, #travel-fee-10, #travel-fee-20, #travel-fee-above, #deal-message, #group-discount-threshold, #group-discount-percent, #business-name, #service-category').forEach((input) => {
        input.addEventListener('input', () => {
            clearErrors();
            validateCurrentStep();
        });
    });

    nextBtn.addEventListener('click', () => {
        if (validateCurrentStep()) {
            currentStep = Math.min(currentStep + 1, 3);
            updateWizardUI();
        }
    });

    prevBtn.addEventListener('click', () => {
        currentStep = Math.max(currentStep - 1, 1);
        updateWizardUI();
    });

    const renderSelectedImages = () => {
        const uploadBox = imagePreview.querySelector('.service-photo-upload-box');
        imagePreview.querySelectorAll('.service-photo-item').forEach((item) => item.remove());
        selectedImageFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const photo = document.createElement('div');
                photo.className = 'service-photo-item';
                photo.innerHTML = `<img src="${event.target.result}" alt="Selected service photo ${index + 1}"><button type="button" class="service-photo-remove" data-photo-index="${index}" aria-label="Remove photo ${index + 1}">×</button>`;
                imagePreview.insertBefore(photo, uploadBox);
            };
            reader.readAsDataURL(file);
        });
        document.getElementById('service-image-count').textContent = `${selectedImageFiles.length} / ${MAX_PORTFOLIO_IMAGES} photos`;
        removeImageBtn.classList.toggle('hidden', selectedImageFiles.length === 0);
        uploadBox.classList.toggle('hidden', selectedImageFiles.length >= MAX_PORTFOLIO_IMAGES);
        photoFileList.innerHTML = selectedImageFiles.map((file) => `<div class="rounded-md border border-slate-200 bg-white px-3 py-2">${file.name}</div>`).join('');
    };

    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
            if (selectedImageFiles.length + files.length > MAX_PORTFOLIO_IMAGES) {
                alert(`Please select up to ${MAX_PORTFOLIO_IMAGES} photos.`);
                imageInput.value = '';
                return;
            }

            selectedImageFiles = [...selectedImageFiles, ...files];
            renderSelectedImages();
            imageInput.value = '';
        });

        imagePreview.addEventListener('click', (e) => {
            const removeButton = e.target.closest('.service-photo-remove');
            if (!removeButton) return;
            selectedImageFiles.splice(Number(removeButton.dataset.photoIndex), 1);
            renderSelectedImages();
        });

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                selectedImageFiles = [];
                imageInput.value = '';
                renderSelectedImages();
            });
        }
    }

    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateCurrentStep()) {
                return;
            }

            const selectedLatitude = Number.parseFloat(document.getElementById('service-latitude').value);
            const selectedLongitude = Number.parseFloat(document.getElementById('service-longitude').value);
            if (!Number.isFinite(selectedLatitude) || !Number.isFinite(selectedLongitude)) {
                alert('Please select the exact service location on the map before publishing.');
                return;
            }

            const submitBtn = document.getElementById('submit-btn');
            const originalBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Publishing...';
            submitBtn.disabled = true;

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                alert('You must be logged in to add a service.');
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                LoadingSpinner.navigateTo('login.html');
                return;
            }

            const title = document.getElementById('service-title').value.trim();
            const description = document.getElementById('service-description').value.trim();
            const includes = document.getElementById('service-includes').value.trim();
            const category = document.getElementById('service-category').value;
            const priceValue = document.getElementById('service-price').value.trim();
            const location = document.getElementById('service-location').value.trim();
            const serviceArea = document.getElementById('service-area').value.trim();
            const delivery = document.getElementById('service-delivery').value;
            const capacity = document.getElementById('service-capacity').value.trim();
            const interaction = document.getElementById('service-interaction').value;
            const businessName = document.getElementById('business-name').value.trim();
            const instantBooking = document.getElementById('instant-booking').checked;
            const dealMessage = document.getElementById('deal-message').value.trim();
            const groupDiscountThresholdValue = document.getElementById('group-discount-threshold').value.trim();
            const groupDiscountPercentValue = document.getElementById('group-discount-percent').value.trim();
            const availabilityDays = getSelectedAvailabilityDays();

            if (!validateCurrentStep()) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let providerEmail = user.email || 'provider@vorabukeen.com';
            try {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('full_name, email')
                    .eq('uid', user.id)
                    .single();

                if (!userError && userData) {
                    providerEmail = userData.email || user.email || 'provider@vorabukeen.com';
                }
            } catch (error) {
                console.warn('Could not fetch user data:', error);
                providerEmail = user.email || 'provider@vorabukeen.com';
            }

            if (selectedImageFiles.length === 0) {
                alert('Please upload at least one portfolio photo.');
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let imageUrls = [];
            try {
                for (const [index, selectedFile] of selectedImageFiles.entries()) {
                    const uploadFile = await prepareImageForUpload(selectedFile);
                    const fileName = `${user.id}/${Date.now()}_${index}_${uploadFile.name}`;
                    console.log('Uploading:', {
                        originalName: selectedFile.name,
                        originalType: selectedFile.type,
                        convertedName: uploadFile.name,
                        convertedType: uploadFile.type,
                        fileName
                    });

                    const { error: uploadError } = await supabase.storage
                        .from('services')
                        .upload(fileName, uploadFile, { contentType: 'image/png', upsert: true });

                    if (uploadError) {
                        throw new Error(`Image upload failed: ${uploadError.message}`);
                    }

                    const { data: urlData } = supabase.storage
                        .from('services')
                        .getPublicUrl(fileName);
                    if (!urlData?.publicUrl) throw new Error('Could not create a public URL for this image.');
                    imageUrls.push(urlData.publicUrl);
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                alert(`Error uploading image: ${error.message}`);
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let groupDiscountThreshold = null;
            let groupDiscountPercent = null;

            if (groupDiscountThresholdValue !== '') {
                groupDiscountThreshold = parseInt(groupDiscountThresholdValue, 10);
                if (Number.isNaN(groupDiscountThreshold) || groupDiscountThreshold < 2) {
                    alert('Group deal threshold must be 2 or more.');
                    submitBtn.innerText = originalBtnText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            if (groupDiscountPercentValue !== '') {
                groupDiscountPercent = parseFloat(groupDiscountPercentValue);
                if (Number.isNaN(groupDiscountPercent) || groupDiscountPercent <= 0 || groupDiscountPercent > 100) {
                    alert('Group discount percent must be between 1 and 100.');
                    submitBtn.innerText = originalBtnText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            if ((groupDiscountThreshold && !groupDiscountPercent) || (!groupDiscountThreshold && groupDiscountPercent)) {
                alert('To create a group deal, please provide both a threshold and a discount percent.');
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            const availabilityText = availabilityDays.length
                ? `Availability: ${availabilityDays.join(', ')}`
                : '';
            const summaryDetails = [
                `Category: ${category}`,
                `Delivery: ${delivery}`,
                `Location: ${location}`,
                `Service area: ${serviceArea || 'Not specified'}`,
                `Capacity: ${capacity || 'Flexible'}`,
                `Who interacts: ${interaction}`,
                `Includes: ${includes || 'Not specified'}`,
                `Booking mode: ${instantBooking ? 'Instant booking enabled' : 'Manual approval for first bookings'}`,
                `Business: ${businessName || 'Not provided'}`,
                availabilityText || 'Availability: Not specified'
            ].filter(Boolean).join('\n');

            const serviceData = {
                provider_id: user.id,
                provider_email: providerEmail,
                title,
                description: [description, summaryDetails].filter(Boolean).join('\n\n'),
                category,
                price: parseFloat(priceValue),
                location,
                latitude: selectedLatitude,
                longitude: selectedLongitude,
                image_url: imageUrls[0] || null,
                image_urls: imageUrls
            };
            serviceData.country_code = getCountryConfig(userCountry).code;
            serviceData.currency_code = getCurrencyCodeForCountry(userCountry);

            if (dealMessage) {
                serviceData.deal_message = dealMessage;
            }
            if (groupDiscountThreshold) {
                serviceData.group_discount_threshold = groupDiscountThreshold;
            }
            if (groupDiscountPercent) {
                serviceData.group_discount_percent = groupDiscountPercent;
            }
            if (availabilityDays.length > 0) {
                serviceData.availability_days = availabilityDays;
                serviceData.availability_note = `Available on ${availabilityDays.join(', ')}`;
            }

            serviceData.travels_to_customer = document.getElementById('travels-to-customer')?.checked || false;
            serviceData.travel_pricing = serviceData.travels_to_customer ? getTravelPricing() : null;

            try {
                console.log('Adding service with data:', serviceData);
                const { data: insertedService, error: insertError } = await supabase
                    .from('services')
                    .insert([serviceData])
                    .select();

                if (insertError) {
                    const message = String(insertError.message || insertError.details || '').toLowerCase();
                    const missingColumnError = message.includes('column') && message.includes('does not exist');

                    if (missingColumnError) {
                        const fallbackData = stripDealFields(serviceData);
                        const { data: fallbackInsertData, error: fallbackInsertError } = await supabase
                            .from('services')
                            .insert([fallbackData])
                            .select();

                        if (fallbackInsertError) {
                            throw fallbackInsertError;
                        }

                        console.warn('Service created without group deal fields because the database schema does not support them yet.');
                        alert('Service added successfully! Group deal details were not saved because the database schema does not yet support group deals.');
                        LoadingSpinner.navigateTo('my-services.html');
                        return;
                    }

                    throw insertError;
                }

                console.log('Service added with ID:', insertedService[0].id);
                const successPageParams = new URLSearchParams({
                  serviceId: insertedService[0].id,
                  message: 'published'
                }).toString();
                LoadingSpinner.navigateTo(`service-publish-success.html?${successPageParams}`);
            } catch (error) {
                console.error('Error adding service: ', error);
                alert(`Error adding service: ${error.message}`);
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
}); 
