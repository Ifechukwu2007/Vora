import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutBtnSideMenu = document.getElementById('logoutBtnSideMenu');
    const profileForm = document.getElementById('profileForm');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const locationInput = document.getElementById('location');
    const backBtn = document.querySelector('.back-btn');

    // Logout
    const logout = () => {
        signOut(auth).then(() => {
            LoadingSpinner.navigateTo('index.html');
        }).catch((error) => {
            console.error('Logout Error:', error);
        });
    };

    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (logoutBtnSideMenu) logoutBtnSideMenu.addEventListener('click', logout);

    // Set page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = 'My Profile';
    }


    // Check auth state and load profile data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            emailInput.value = user.email;

            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                nameInput.value = userData.name || '';
                phoneInput.value = userData.phone || '';
                locationInput.value = userData.location || '';
            } else {
                console.log('No such document!');
            }

    const providerBtn = document.querySelector('[data-action="add-service.html"]');

    if (providerBtn) {
        providerBtn.addEventListener("click", () => {
            window.location.href = providerBtn.getAttribute("data-action");
        });
    }
            // Check if user has any services
            const servicesQuery = query(collection(db, 'services'), where('userId', '==', user.uid));
            const servicesSnapshot = await getDocs(servicesQuery);
            
            const backToDashboardBtn = document.getElementById('backToDashboardBtn');
            if (!servicesSnapshot.empty && backToDashboardBtn) {
                backToDashboardBtn.classList.remove('hidden');
            }
        } else {
            LoadingSpinner.navigateTo('login.html');
        }
    });

    // Handle profile update
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (user) {
            try {
                await setDoc(doc(db, 'users', user.uid), {
                    name: nameInput.value,
                    phone: phoneInput.value,
                    location: locationInput.value,
                    email: user.email
                }, { merge: true });
                alert('Profile updated successfully!');
            } catch (error) {
                console.error('Error updating profile: ', error);
                alert('Error updating profile.');
            }
        }
    });
});
