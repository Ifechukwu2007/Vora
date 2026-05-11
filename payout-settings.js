import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    const payoutForm = document.getElementById('payout-settings-form');
    const bankNameInput = document.getElementById('bank-name');
    const accountNumberInput = document.getElementById('account-number');

    // Check for user's authentication state
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            alert("You must be logged in to manage payout settings.");
            LoadingSpinner.navigateTo('login.html?redirect=payout-settings.html');
            return;
        }

        // Fetch existing payout settings and populate the form
        const userPayoutRef = doc(db, 'payout_settings', user.uid);
        try {
            const docSnap = await getDoc(userPayoutRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                bankNameInput.value = data.bankName || '';
                accountNumberInput.value = data.accountNumber || '';
            }
        } catch (error) {
            console.error("Error fetching payout settings:", error);
            alert("There was an error fetching your settings. Please try again.");
        }
    });

    // Handle form submission
    payoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("Your session has expired. Please log in again.");
            LoadingSpinner.navigateTo('login.html');
            return;
        }

        const bankName = bankNameInput.value.trim();
        const accountNumber = accountNumberInput.value.trim();

        // Basic validation
        if (!bankName || !accountNumber) {
            alert("Please fill in both the bank name and account number.");
            return;
        }

        if (!/^\d{10}$/.test(accountNumber)) {
            alert("Please enter a valid 10-digit account number.");
            return;
        }

        const userPayoutRef = doc(db, 'payout_settings', user.uid);

        try {
            await setDoc(userPayoutRef, {
                bankName: bankName,
                accountNumber: accountNumber,
                userId: user.uid,
                updatedAt: new Date()
            }, { merge: true });

            alert("Your payout settings have been saved successfully!");
        } catch (error) {
            console.error("Error saving payout settings:", error);
            alert("There was an error saving your settings. Please try again.");
        }
    });
});