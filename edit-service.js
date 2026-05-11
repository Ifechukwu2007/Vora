import { LoadingSpinner } from './loading-utils.js';
import { app, auth, db } from './firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
	const urlParams = new URLSearchParams(window.location.search);
	const serviceId = urlParams.get('id');
	const form = document.getElementById('add-service-form');
	const backBtn = document.getElementById('backBtn');

	if (backBtn) {
		backBtn.addEventListener('click', () => {
			LoadingSpinner.navigateTo('my-services.html');
		});
	}
	const titleInput = document.getElementById('service-title');
	const descInput = document.getElementById('service-description');
	const categoryInput = document.getElementById('service-category');
	const priceInput = document.getElementById('service-price');
	const locationInput = document.getElementById('service-location');

	if (!serviceId) {
		alert('No service ID provided.');
		LoadingSpinner.navigateTo('my-services.html');
		return;
	}

	onAuthStateChanged(auth, async (user) => {
		if (!user) {
			alert('You must be logged in to edit a service.');
			LoadingSpinner.navigateTo('login.html');
			return;
		}

		// Fetch service data
		const serviceRef = doc(db, 'services', serviceId);
		const serviceSnap = await getDoc(serviceRef);
		if (!serviceSnap.exists()) {
			alert('Service not found.');
			LoadingSpinner.navigateTo('my-services.html');
			return;
		}
		const service = serviceSnap.data();

		// Only allow owner/provider to edit
		if (service.userId !== user.uid && service.providerId !== user.uid) {
			alert('You are not authorized to edit this service.');
			LoadingSpinner.navigateTo('my-services.html');
			return;
		}

		// Populate form
		titleInput.value = service.title || '';
		descInput.value = service.description || '';
		categoryInput.value = service.category || '';
		priceInput.value = service.price || '';
		locationInput.value = service.location || '';

		// Change button text to "Update Service"
		const submitBtn = form.querySelector('button[type="submit"]');
		if (submitBtn) submitBtn.textContent = 'Update Service';

		// Handle form submit
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			submitBtn.disabled = true;
			submitBtn.textContent = 'Updating...';
			try {
				await updateDoc(serviceRef, {
					title: titleInput.value.trim(),
					description: descInput.value.trim(),
					category: categoryInput.value,
					price: Number(priceInput.value),
					location: locationInput.value.trim(),
				});
				alert('Service updated successfully!');
			LoadingSpinner.navigateTo('my-services.html');
			} catch (err) {
				alert('Error updating service. Please try again.');
				submitBtn.disabled = false;
				submitBtn.textContent = 'Update Service';
			}
		});
	});
});
