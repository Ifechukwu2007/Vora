import { supabase } from './supabase.js';
import { LoadingSpinner } from './loading-utils.js';

let selectedImageFile = null;

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

            const category = document.getElementById('service-category').value;
            if (!category) {
                alert("Please select a category.");
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            const priceValue = document.getElementById('service-price').value.trim();
            if (!priceValue || isNaN(parseFloat(priceValue))) {
                alert("Please enter a valid price.");
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

            const serviceData = {
                provider_id: user.id,
                provider_email: providerEmail,
                title: document.getElementById('service-title').value.trim(),
                description: document.getElementById('service-description').value.trim(),
                category: category,
                price: parseFloat(priceValue),
                location: document.getElementById('service-location').value.trim()
            };

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
                const { data, error } = await supabase
                    .from('services')
                    .insert([serviceData])
                    .select();

                if (error) {
                    throw error;
                }

                console.log('Service added with ID:', data[0].id);
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