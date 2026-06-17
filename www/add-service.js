import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';

let selectedImageFile = null;

function stripDealFields(serviceData) {
    const cleaned = { ...serviceData };
    delete cleaned.deal_message;
    delete cleaned.group_discount_threshold;
    delete cleaned.group_discount_percent;
    return cleaned;
}

document.addEventListener('DOMContentLoaded', () => {
    const addServiceForm = document.getElementById('add-service-form');
    const backBtn = document.getElementById('backBtn');
    const imageInput = document.getElementById('service-image');
    const imagePreview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // Handle image preview
    if (imageInput) { 
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    alert('Please select a valid image file.');
                    imageInput.value = '';
                    selectedImageFile = null;
                    imagePreview.classList.add('hidden');
                    return;
                }
                
                // Validate file size (10MB)
                if (file.size > 10 * 1024 * 1024) {
                    alert('Image must be less than 10MB.');
                    imageInput.value = '';
                    selectedImageFile = null;
                    imagePreview.classList.add('hidden');
                    return;
                }

                selectedImageFile = file;
                const reader = new FileReader();
                reader.onload = (event) => {
                    previewImg.src = event.target.result;
                    imagePreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                selectedImageFile = null;
                imageInput.value = '';
                imagePreview.classList.add('hidden');
            });
        }
    }

    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-btn');
            const originalBtnText = submitBtn.innerText;
            submitBtn.innerText = 'Adding...';
            submitBtn.disabled = true;

            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                alert("You must be logged in to add a service.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                LoadingSpinner.navigateTo('login.html');
                return;
            }

            // Validate title
            const title = document.getElementById('service-title').value.trim();
            if (!title) {
                alert("Please enter a service title.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // Validate description
            const description = document.getElementById('service-description').value.trim();
            if (!description) {
                alert("Please enter a service description.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // Validate category
            const category = document.getElementById('service-category').value;
            if (!category) {
                alert("Please select a category.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // Validate price
            const priceValue = document.getElementById('service-price').value.trim();
            if (!priceValue || isNaN(parseFloat(priceValue)) || parseFloat(priceValue) <= 0) {
                alert("Please enter a valid price greater than 0.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // Validate location
            const location = document.getElementById('service-location').value.trim();
            if (!location) {
                alert("Please enter your service location.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            // Validate image is selected
            if (!selectedImageFile) {
                alert("Please upload a service image. Image is required.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let providerName = 'Anonymous';
            let providerEmail = user.email || 'provider@vora.com';
            try {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('full_name, email')
                    .eq('uid', user.id)
                    .single();

                if (!userError && userData) {
                    providerName = userData.full_name || 'Anonymous';
                    providerEmail = userData.email || user.email || 'provider@vora.com';
                }
            } catch (error) {
                console.warn('Could not fetch user data:', error);
                // Fall back to auth user email
                providerEmail = user.email || 'provider@vora.com';
            }

            let imageUrl = null;

            // Upload image if selected
            if (selectedImageFile) {
                try {
                    const fileName = `${user.id}_${Date.now()}_${selectedImageFile.name}`;
                    const { data, error: uploadError } = await supabase.storage
                        .from('services')
                        .upload(fileName, selectedImageFile);

                    if (uploadError) {
                        throw new Error(`Image upload failed: ${uploadError.message}`);
                    }

                    // Get the public URL
                    const { data: urlData } = supabase.storage
                        .from('services')
                        .getPublicUrl(fileName);
                    
                    imageUrl = urlData?.publicUrl;
                } catch (error) {
                    console.error("Error uploading image:", error);
                    alert(`Error uploading image: ${error.message}`);
                    submitBtn.innerText = originalBtnText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            const dealMessage = document.getElementById('deal-message').value.trim();
            const groupDiscountThresholdValue = document.getElementById('group-discount-threshold').value.trim();
            const groupDiscountPercentValue = document.getElementById('group-discount-percent').value.trim();

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

            const serviceData = {
                provider_id: user.id,
                provider_email: providerEmail,
                title: title,
                description: description,
                category: category,
                price: parseFloat(priceValue),
                location: location,
                image_url: imageUrl
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

            // Add travel price if provided
            const travelPrice = document.getElementById('travel-price').value.trim();
            if (travelPrice && !isNaN(parseFloat(travelPrice))) {
                serviceData.travel_price = parseFloat(travelPrice);
            }

            // Add image URL if uploaded
            if (imageUrl) {
                serviceData.image_url = imageUrl;
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
                alert("Service added successfully!");
                LoadingSpinner.navigateTo('my-services.html');
            } catch (error) {
                console.error("Error adding service: ", error);
                alert(`Error adding service: ${error.message}`);
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }
});