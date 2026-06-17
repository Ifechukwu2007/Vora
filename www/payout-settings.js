import { LoadingSpinner } from './loading-utils.js';
import { supabase } from './supabase.js';
import { updateProfilePictureInHeader } from './auth.js';
document.addEventListener('DOMContentLoaded', async () => {
    await updateProfilePictureInHeader();
    const payoutForm = document.getElementById('payout-settings-form');
    const bankNameInput = document.getElementById('bank-name');
    const accountNumberInput = document.getElementById('account-number');

    initPayoutSettings(payoutForm, bankNameInput, accountNumberInput);
});

async function initPayoutSettings(form, bankInput, accountInput) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        alert("You must be logged in to manage payout settings.");
        LoadingSpinner.navigateTo('login.html?redirect=payout-settings.html');
        return;
    }

    try {
        const { data, error: fetchErr } = await supabase
            .from('payout_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (data) {
            bankInput.value = data.bank_name || '';
            accountInput.value = data.account_number || '';
        }
    } catch (error) {
        console.error("Error fetching payout settings:", error);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const { data: { user: currentUser }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !currentUser) {
            alert("Your session has expired. Please log in again.");
            LoadingSpinner.navigateTo('login.html');
            return;
        }

        const bankName = bankInput.value.trim();
        const accountNumber = accountInput.value.trim();

        if (!bankName || !accountNumber) {
            alert("Please fill in both the bank name and account number.");
            return;
        }

        if (!/^\d{10}$/.test(accountNumber)) {
            alert("Please enter a valid 10-digit account number.");
            return;
        }

        try {
            const { error } = await supabase
                .from('payout_settings')
                .upsert({
                    user_id: currentUser.id,
                    bank_name: bankName,
                    account_number: accountNumber,
                    updated_at: new Date().toISOString() 
                }, { onConflict: 'user_id' }); 

            if (error) throw error;
            alert("Your payout settings have been saved successfully!");
        } catch (error) {
            console.error("Error saving payout settings:", error);
            alert("There was an error saving your settings. Please try again.");
        } 
    });
}