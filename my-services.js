import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, where, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Logout functionality
const initLogout = () => {
  const logoutBtns = document.querySelectorAll('[data-logout]');
  const logout = () => {
    signOut(auth).then(() => {
      LoadingSpinner.navigateTo('index.html');
    }).catch((error) => {
      console.error('Logout Error:', error);
    });
  };
  logoutBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', logout);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogout);
} else {
  initLogout();
}

const myServicesContainer = document.getElementById('myServicesContainer');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Query for services using both potential field names for the owner
        const qUserId = query(collection(db, "services"), where("userId", "==", user.uid));
        const qProviderId = query(collection(db, "services"), where("providerId", "==", user.uid));

        const [snapshotUserId, snapshotProviderId] = await Promise.all([
            getDocs(qUserId),
            getDocs(qProviderId)
        ]);

        myServicesContainer.innerHTML = ''; // Clear existing services

        // Map to store unique services by their document ID
        const servicesMap = new Map();

        snapshotUserId.forEach((doc) => {
            servicesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        snapshotProviderId.forEach((doc) => {
            if (!servicesMap.has(doc.id)) {
                servicesMap.set(doc.id, { id: doc.id, ...doc.data() });
            }
        });

        if (servicesMap.size === 0) {
            myServicesContainer.innerHTML = `<p class="text-center col-span-full">You haven't added any services yet. <a href="add-service.html" class="text-indigo-600">Add one now!</a></p>`;
            return;
        }

        servicesMap.forEach((service) => {
            const serviceElement = document.createElement('div');
            serviceElement.classList.add('bg-white', 'p-6', 'rounded-lg', 'shadow-md', 'flex', 'flex-col');
            serviceElement.innerHTML = `
                <h3 class="text-xl font-bold mb-2">${service.title}</h3>
                <p class="text-gray-600 mb-2"><span class="font-semibold">Location:</span> ${service.location || 'Not specified'}</p>
                <p class="text-gray-700 flex-grow">${service.description}</p>
                <div class="mt-4 flex justify-between items-center">
                    <span class="text-lg font-semibold">₦${service.price}</span>
                    <div>
                        <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${service.id}">Edit</button>
                        <button class="delete-btn text-red-500 hover:text-red-700" data-id="${service.id}">Delete</button>
                    </div>
                </div>
            `;
            myServicesContainer.appendChild(serviceElement);
        });

        // Add event listeners for edit and delete buttons
        myServicesContainer.addEventListener('click', async (e) => {
            const target = e.target;
            const serviceId = target.dataset.id;

            if (target.classList.contains('edit-btn')) {
                LoadingSpinner.navigateTo(`edit-service.html?id=${serviceId}`);
            }

            if (target.classList.contains('delete-btn')) {
                if (confirm("Are you sure you want to delete this service?")) {
                    try {
                        await deleteDoc(doc(db, "services", serviceId));
                        target.closest('.bg-white').remove(); // Remove the service element from the DOM
                        alert("Service deleted successfully!");
                    } catch (error) {
                        console.error("Error deleting service: ", error);
                        alert("Error deleting service. Please try again.");
                    }
                }
            }
        });

    } else {
        alert("You must be logged in to view your services.");
        LoadingSpinner.navigateTo('login.html');
    }
});