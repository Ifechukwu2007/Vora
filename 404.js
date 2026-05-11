// 404 Page Script
import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// Check if user is logged in and show/hide dashboard link and logout button
auth.onAuthStateChanged(async (user) => {
    const dashboardLink = document.getElementById('dashboardLink');
    const dashboardLink2 = document.getElementById('dashboardLink2');
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutBtn2 = document.getElementById('logoutBtn2');

    if (user) {
        // User is logged in
        if (dashboardLink) dashboardLink.classList.remove('hidden');
        if (dashboardLink2) dashboardLink2.classList.remove('hidden');
        if (logoutBtn) logoutBtn.style.display = 'inline';
        if (logoutBtn2) logoutBtn2.style.display = 'block';

        // Check if user is trying to access unauthorized pages
        await checkPageAuthorization(user);
    } else {
        // User is not logged in
        if (dashboardLink) dashboardLink.classList.add('hidden');
        if (dashboardLink2) dashboardLink2.classList.add('hidden');
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (logoutBtn2) logoutBtn2.style.display = 'none';
    }
});

// Function to check if user has access to restricted pages
async function checkPageAuthorization(user) {
    // Get the page the user was trying to access (from URL parameter or referrer)
    const urlParams = new URLSearchParams(window.location.search);
    const attemptedPage = urlParams.get('attempted') || document.referrer;

    // Define restricted pages and their required roles
    const restrictedPages = {
        'admin': ['admin'],
        'admin-users': ['admin'],
        'admin-services': ['admin'],
        'admin-bookings': ['admin'],
        'admin-messages': ['admin'],
        'admin-chats': ['admin'],
        'admin-chat': ['admin'],
        'admin-payments': ['admin'],
        'admin-payouts': ['admin'],
        'admin-reviews': ['admin'],
        'admin-settings': ['admin'],
        'payout-settings': ['provider']
    };

    // Get user's role from Firestore
    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userRole = userDoc.exists() ? userDoc.data().role : 'user';

        // Check if attempted page requires authorization
        for (const [page, requiredRoles] of Object.entries(restrictedPages)) {
            if (attemptedPage.includes(page) && !requiredRoles.includes(userRole)) {
                // User doesn't have permission for this page
                // This page will act as access denied page
                return true;
            }
        }
    } catch (error) {
        console.error('Error checking authorization:', error);
    }

    return false;
}

// Logout functionality
const logoutButtons = document.querySelectorAll('#logoutBtn, #logoutBtn2');
logoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        auth.signOut().then(() => {
            LoadingSpinner.navigateTo('login.html');
        });
    });
});

// Mobile menu toggle
const hamburger = document.getElementById('hamburger');
const sideMenu = document.getElementById('sideMenu');
const closeMenu = document.getElementById('closeMenu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        sideMenu.classList.toggle('-translate-x-full');
    });
}

if (closeMenu) {
    closeMenu.addEventListener('click', () => {
        sideMenu.classList.add('-translate-x-full');
    });
}

// Close menu when clicking on a link
const menuLinks = sideMenu.querySelectorAll('a');
menuLinks.forEach((link) => {
    link.addEventListener('click', () => {
        sideMenu.classList.add('-translate-x-full');
    });
});
