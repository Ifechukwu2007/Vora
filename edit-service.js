import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-service-form');
  const serviceId = getServiceIdFromUrl();

  const titleInput = document.getElementById('service-title');
  const descInput = document.getElementById('service-description');
  const categoryInput = document.getElementById('service-category');
  const priceInput = document.getElementById('service-price');
  const locationInput = document.getElementById('service-location');
  const imageInput = document.getElementById('service-image');

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
      locationInput.value = svc.location ?? '';
      // image_url not placed into UI inputs automatically (file input can’t be pre-filled)
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
      updated_at: new Date().toISOString(),
    };

    try {
      let imageUrl = null;

      if (imageInput?.files?.length) {
        const file = imageInput.files[0];
        // Basic validation
        if (!file.type.startsWith('image/')) {
          alert('Please upload a valid image.');
          return;
        }

        // Upload to Supabase Storage bucket "services"
        // Store with a predictable unique key:
        const fileExt = getFileExt(file.name);
        const fileName = `${authData.user.id}/${serviceId}/${crypto.randomUUID()}${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('services')
          .upload(fileName, file, { upsert: true });

        if (uploadErr) {
          console.error(uploadErr);
          throw new Error('Image upload failed.');
        }

        // Get public URL (only works if your bucket is public or you handle auth-based URLs)
        const { data: publicUrlData } = supabase.storage
          .from('services')
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;

        payloadBase.image_url = imageUrl;
      }

      // Update service
      const { error: updateErr } = await supabase
        .from('services')
        .update(payloadBase)
        .eq('id', serviceId)
        .eq('provider_id', authData.user.id);

      if (updateErr) {
        console.error(updateErr);
        throw updateErr;
      }

      alert('Service updated successfully!');
      // Redirect back to a page (adjust if you have a specific route)
      window.location.href = 'home.html';
    } catch (err) {
      console.error(err);
      alert('Failed to update service. Please try again.');
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
    .select('id, provider_id, title, description, category, price, location, image_url')
    .eq('id', serviceId)
    .single();

  if (error) throw error;
  return data;
}