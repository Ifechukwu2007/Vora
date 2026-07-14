import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';

let selectedImageFiles = [];
let currentStep = 1;
const MAX_PORTFOLIO_IMAGES = 3;

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
    return cleaned;
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

function validateCurrentStep() {
    clearErrors();

    if (currentStep === 1) {
        const categoryInput = document.getElementById('service-category');
        const locationInput = document.getElementById('service-location');
        const deliveryInput = document.getElementById('service-delivery');
        const capacityInput = document.getElementById('service-capacity');
        const interactionInput = document.getElementById('service-interaction');
        const category = categoryInput.value;
        const location = locationInput.value.trim();
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

        if (!location || isLikelyNonsense(location, { minLength: 4, minWords: 1 })) {
            showFieldError('error-service-location', 'Please enter a specific location.');
            setFieldState(locationInput, false);
            hasError = true;
        } else {
            setFieldState(locationInput, true);
        }

        if (!delivery) {
            showFieldError('error-service-delivery', 'Please choose how you deliver your service.');
            setFieldState(deliveryInput, false);
            hasError = true;
        } else {
            setFieldState(deliveryInput, true);
        }

        if (capacity && (Number.isNaN(parseInt(capacity, 10)) || parseInt(capacity, 10) < 1 || parseInt(capacity, 10) > 100)) {
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
    const businessInput = document.getElementById('business-name');
    const priceValue = priceInput.value.trim();
    const priceNumber = Number.parseFloat(priceValue);
    let hasError = false;

    if (!priceValue || Number.isNaN(priceNumber) || priceNumber < 1000) {
        showFieldError('error-service-price', 'Please enter a realistic price of at least NGN 1,000.');
        setFieldState(priceInput, false);
        hasError = true;
    } else {
        setFieldState(priceInput, true);
    }

    const businessName = businessInput.value.trim();
    if (businessName && isLikelyNonsense(businessName, { minLength: 4, minWords: 1 })) {
        showFieldError('error-business-name', 'Please enter a real business name or leave this field blank.');
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

    updateWizardUI();
    renderCategoryDetails();

    categorySelect.addEventListener('change', () => {
        renderCategoryDetails();
        clearErrors();
    });

    document.querySelectorAll('#service-location, #service-capacity, #service-interaction, #service-title, #service-description, #service-includes, #service-price, #business-name, #service-category').forEach((input) => {
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

    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
            if (files.length === 0) {
                selectedImageFiles = [];
                imagePreview.classList.add('hidden');
                photoFileList.innerHTML = '';
                return;
            }

            if (files.length > MAX_PORTFOLIO_IMAGES) {
                alert(`Please select up to ${MAX_PORTFOLIO_IMAGES} photos.`);
                imageInput.value = '';
                selectedImageFiles = [];
                imagePreview.classList.add('hidden');
                photoFileList.innerHTML = '';
                return;
            }

            selectedImageFiles = files;
            const primaryFile = selectedImageFiles[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                previewImg.src = event.target.result;
                imagePreview.classList.remove('hidden');
            };
            reader.readAsDataURL(primaryFile);

            photoFileList.innerHTML = selectedImageFiles.map((file) => `<div class="rounded-md border border-slate-200 bg-white px-3 py-2">${file.name}</div>`).join('');
        });

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                selectedImageFiles = [];
                imageInput.value = '';
                imagePreview.classList.add('hidden');
                photoFileList.innerHTML = '';
            });
        }
    }

    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateCurrentStep()) {
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

            if (!validateCurrentStep()) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let providerEmail = user.email || 'provider@vora.com';
            try {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('full_name, email')
                    .eq('uid', user.id)
                    .single();

                if (!userError && userData) {
                    providerEmail = userData.email || user.email || 'provider@vora.com';
                }
            } catch (error) {
                console.warn('Could not fetch user data:', error);
                providerEmail = user.email || 'provider@vora.com';
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
                    const fileName = `${user.id}_${Date.now()}_${index}_${uploadFile.name}`;
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

            const summaryDetails = [
                `Category: ${category}`,
                `Delivery: ${delivery}`,
                `Location: ${location}`,
                `Service area: ${serviceArea || 'Not specified'}`,
                `Capacity: ${capacity || 'Flexible'}`,
                `Who interacts: ${interaction}`,
                `Includes: ${includes || 'Not specified'}`,
                `Booking mode: ${instantBooking ? 'Instant booking enabled' : 'Manual approval for first bookings'}`,
                `Business: ${businessName || 'Not provided'}`
            ].join('\n');

            const serviceData = {
                provider_id: user.id,
                provider_email: providerEmail,
                title,
                description: [description, summaryDetails].filter(Boolean).join('\n\n'),
                category,
                price: parseFloat(priceValue),
                location,
                image_url: imageUrls[0] || null,
                image_urls: imageUrls
            };

            if (dealMessage) {
                serviceData.deal_message = dealMessage;
            }
            if (groupDiscountThreshold) {
                serviceData.group_discount_threshold = groupDiscountThreshold;
            }
            if (groupDiscountPercent) {
                serviceData.group_discount_percent = groupDiscountPercent;
            }

            const travelPrice = document.getElementById('travel-price').value.trim();
            if (travelPrice && !Number.isNaN(parseFloat(travelPrice))) {
                serviceData.travel_price = parseFloat(travelPrice);
            }

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
                alert('Service added successfully!');
                LoadingSpinner.navigateTo('my-services.html');
            } catch (error) {
                console.error('Error adding service: ', error);
                alert(`Error adding service: ${error.message}`);
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
}); 
