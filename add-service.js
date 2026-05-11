import { auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LoadingSpinner } from './loading-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const addServiceForm = document.getElementById('add-service-form');
    const backBtn = document.getElementById('backBtn');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            LoadingSpinner.navigateTo('browse.html');
        });
    }

    if (addServiceForm) {
        addServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const user = auth.currentUser;
            if (!user) {
                alert("You must be logged in to add a service.");
                LoadingSpinner.navigateTo('login.html');
                return;
            }

            const category = document.getElementById('service-category').value;
            if (!category) {
                alert("Please select a category.");
                return;
            }

            const priceValue = document.getElementById('service-price').value.trim();
            if (!priceValue || isNaN(parseFloat(priceValue))) {
                alert("Please enter a valid price.");
                return;
            }

            let providerName = 'Anonymous';
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                providerName = userData.name || userData.fullName || 'Anonymous';
            }

            const serviceData = {
                userId: user.uid,
                providerId: user.uid,
                providerName: providerName,
                title: document.getElementById('service-title').value.trim(),
                description: document.getElementById('service-description').value.trim(),
                category: category,
                price: parseFloat(priceValue),
                location: document.getElementById('service-location').value.trim(),
                createdAt: new Date()
            };

            try {
                console.log('Adding service with data:', serviceData);
                const docRef = await addDoc(collection(db, "services"), serviceData);
                console.log('Service added with ID:', docRef.id);
                alert("Service added successfully!");
                LoadingSpinner.navigateTo('my-services.html');
            } catch (error) {
                console.error("Error adding service: ", error);
                alert(`Error adding service: ${error.message}`);
            }
        });
    }
});