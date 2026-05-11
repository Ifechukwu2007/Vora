import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/**
 * Detects if the current user is a provider (has services) or customer
 * Returns: 'provider' | 'customer' | null
 */
export async function detectUserRole() {
    try {
        if (!auth.currentUser) return null;

        // Check if user has any services
        const servicesQuery = query(
            collection(db, 'services'),
            where('userId', '==', auth.currentUser.uid)
        );
        const servicesSnap = await getDocs(servicesQuery);
        
        return servicesSnap.docs.length > 0 ? 'provider' : 'customer';
    } catch (error) {
        console.error('Error detecting user role:', error);
        return null;
    }
}

/**
 * Shows/hides navigation elements based on user role
 */
export async function setupRoleBasedNavigation() {
    try {
        const role = await detectUserRole();
        if (!role) return;

        // Provider-only elements
        const providerElements = document.querySelectorAll('[data-role="provider-only"]');
        providerElements.forEach(el => {
            if (role === 'provider') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        // Customer-only elements
        const customerElements = document.querySelectorAll('[data-role="customer-only"]');
        customerElements.forEach(el => {
            if (role === 'customer') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    } catch (error) {
        console.error('Error setting up role-based navigation:', error);
    }
}

/**
 * Redirects user if they try to access a page meant for a different role
 */
export async function enforcePageAccess(requiredRole) {
    try {
        const role = await detectUserRole();
        if (!role) return; // Not logged in, auth.js handles redirect

        if (role !== requiredRole) {
            alert(`This page is for ${requiredRole}s only.`);
            LoadingSpinner.navigateTo('home.html');
        }
    } catch (error) {
        console.error('Error enforcing page access:', error);
    }
}

/**
 * Caches role in session storage to avoid repeated queries
 */
export async function getRoleWithCache() {
    try {
        const cached = sessionStorage.getItem('userRole');
        if (cached) return cached;

        const role = await detectUserRole();
        if (role) {
            sessionStorage.setItem('userRole', role);
        }
        return role;
    } catch (error) {
        console.error('Error getting cached role:', error);
        return null;
    }
}

/**
 * Clears cached role (call on logout)
 */
export function clearRoleCache() {
    sessionStorage.removeItem('userRole');
}
