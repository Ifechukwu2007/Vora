import { supabase } from './supabase.js';

const banner = document.getElementById('payoutReminderBanner');

async function shouldShowPayoutBanner(userId) {
  const { data, error } = await supabase
    .from('payout_settings')
    .select('bank_code, account_number')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error checking payout setup:', error);
    return false;
  }

  return !(data?.bank_code && data?.account_number);
}

async function initPayoutBanner() {
  if (!banner) return;

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    const user = authData?.session?.user;
    if (!user) return;

    const show = await shouldShowPayoutBanner(user.id);
    banner.classList.toggle('hidden', !show);
  } catch (err) {
    console.error('Payout banner init failed:', err);
  }
}

initPayoutBanner();

window.addEventListener('storage', (event) => {
  if (event.key !== 'payoutSettingsUpdated') return;
  initPayoutBanner();
});
