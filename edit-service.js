import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-service-form');
  const serviceId = getServiceIdFromUrl();

  const titleInput = document.getElementById('service-title');
  const descInput = document.getElementById('service-description');
  const categoryInput = document.getElementById('service-category');
  const priceInput = document.getElementById('service-price');
  const locationInput = document.getElementById('service-location');
  const travelPriceInput = document.getElementById('travel-price');
  const imageInput = document.getElementById('service-image');
  const submitBtn = document.getElementById('submit-btn');

  if (!form || !serviceId) {
    console.error('Missing form or service id');
    alert('Invalid page request.');
    return;
  }

  loadService(serviceId)
    .then((svc) => {
      titleInput.value = svc.title ?? '';
      descInput.value = svc.description ?? '';
      categoryInput.value = svc.category ?? '';
      priceInput.value = svc.price ?? '';
      locationInput.value = svc.location ?? '';      travelPriceInput.value = svc.travel_price ?? '';      // image_url not placed into UI inputs automatically (file input can’t be pre-filled)
    })
    .catch((err) => {
      console.error(err);
      alert('Unable to load service.');
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      alert('You must be logged in to edit a service.');
      return;
    }

    const bankName = (titleInput.value || '').trim();
    const title = bankName; // rename for clarity below
    const description = (descInput.value || '').trim();
    const category = (categoryInput.value || '').trim();
    const location = (locationInput.value || '').trim();

    const priceValue = priceInput.value;
    const price = priceValue === '' ? null : Number(priceValue);

    if (!title || !description || !category || !location) {
      alert('Please fill in all required fields.');
      return;
    }
    if (price === null || Number.isNaN(price) || price < 0) {
      alert('Please enter a valid price.');
      return;
    }

    // Always prevent updating another provider’s service
    // (RLS should already do this, but we keep UI-safe behavior)
    const payloadBase = {
      title,
      description,
      category,
      price,
      location,

    };
    // Add travel price if provided
    const travelPriceValue = travelPriceInput.value.trim();
    if (travelPriceValue && !isNaN(parseFloat(travelPriceValue))) {
      payloadBase.travel_price = parseFloat(travelPriceValue);
    }
    try {
      let imageUrl = null;

      if (imageInput?.files?.length) {
        const file = imageInput.files[0];
        // Basic validation
        if (!file.type.startsWith('image/')) {
          alert('Please upload a valid image.');
          return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('Image must be less than 10MB.');
          return;
        }

        // Upload to Supabase Storage bucket "services"
        const fileName = `${authData.user.id}_${Date.now()}_${file.name}`;

        const { data, error: uploadErr } = await supabase.storage
          .from('services')
          .upload(fileName, file);

        if (uploadErr) {
          console.error('Image upload error:', uploadErr);
          console.error('File name:', fileName);
          console.error('File size:', file.size);
          console.error('File type:', file.type);
          throw new Error(`Image upload failed: ${uploadErr.message || uploadErr}`);
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('services')
          .getPublicUrl(fileName);

        imageUrl = publicUrlData?.publicUrl;

        if (imageUrl) {
          payloadBase.image_url = imageUrl;
        }
      }

      // Show updating status
      const originalBtnText = submitBtn?.textContent || 'Update Service';
      if (submitBtn) {
        submitBtn.textContent = 'Updating...';
        submitBtn.disabled = true;
      }

      // Update service
      // Let RLS policy handle provider ownership check
      const { error: updateErr } = await supabase
        .from('services')
        .update(payloadBase)
        .eq('id', serviceId);

      if (updateErr) {
        console.error('Update error:', updateErr);
        console.error('Error code:', updateErr.code);
        console.error('Error message:', updateErr.message);
        console.error('Payload sent:', payloadBase);
        console.error('Service ID:', serviceId);
        
        // Restore button
        if (submitBtn) {
          submitBtn.textContent = originalBtnText;
          submitBtn.disabled = false;
        }
        
        throw updateErr;
      }

      alert('Service updated successfully!');
      // Redirect back to a page (adjust if you have a specific route)
      window.location.href = 'my-services.html';
    } catch (err) {
      console.error('Full error:', err);
      alert(`Failed to update service: ${err.message || 'Please try again.'}`);
    }
  });
});

function getServiceIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('id');
}

function getFileExt(filename) {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx);
}

async function loadService(serviceId) {
  // Select only columns we care about
  const { data, error } = await supabase
    .from('services')
    .select('id, provider_id, title, description, category, price, location, travel_price, image_url')
    .eq('id', serviceId)
    .single();

  if (error) throw error;
  return data; 
}