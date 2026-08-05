import { supabase } from "./supabase.js";

const form = document.getElementById("payout-settings-form");
const bankSelect = document.getElementById("bank-code");
const accountNumberInput = document.getElementById("account-number");
const accountNameInput = document.getElementById("account-name");
const errorBankCode = document.getElementById("error-bank-code");
const errorAccountNumber = document.getElementById("error-account-number");
const payoutStatusText = document.getElementById("payout-status-text");

function setStatus(text) {
  if (!payoutStatusText) return;
  payoutStatusText.textContent = text;
}

function showError(element, message) {
  if (!element) return;
  if (!message) {
    element.textContent = "";
    element.classList.add("hidden");
    return;
  }
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearErrors() {
  showError(errorBankCode, "");
  showError(errorAccountNumber, "");
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function validate() {
  const bank_code = bankSelect?.value ?? "";
  const account_number = digitsOnly(accountNumberInput?.value);

  if (!bank_code) {
    showError(errorBankCode, "Please select your bank.");
    setStatus("Please select your bank.");
    return null;
  }

  showError(errorBankCode, "");

  if (!account_number || account_number.length !== 10) {
    showError(errorAccountNumber, "Account number must be a 10-digit number.");
    setStatus("Fix your account number and try again.");
    return null;
  }

  showError(errorAccountNumber, "");

  return {
    bank_code,
    bank_name: bankSelect?.selectedOptions?.[0]?.text ?? "",
    account_number,
  };
}

async function loadPayoutSettings() {
  setStatus("Loading payout settings...");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    console.error("Failed to load user", userError);
    setStatus("Unable to load payout settings. Please sign in again.");
    return;
  }

  const { data: payout, error: payoutError } = await supabase
    .from("payout_settings")
    .select("bank_name, bank_code, account_number, account_name, account_verified, recipient_code, last_verified_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (payoutError) {
    console.error("Failed to load payout settings", payoutError);
    setStatus("Unable to load payout settings.");
    return;
  }

  if (!payout) {
    setStatus("Enter your bank details and save to enable payouts.");
    return;
  }

  if (bankSelect) bankSelect.value = payout.bank_code ?? "";
  if (accountNumberInput) accountNumberInput.value = payout.account_number ?? "";
  if (accountNameInput) accountNameInput.value = payout.account_name ?? "";

  if (payout.account_verified && payout.recipient_code) {
    setStatus("✅ Your bank account is verified and ready for payouts.");
  } else if (payout.recipient_code) {
    setStatus("Payout recipient created. Waiting for account verification.");
  } else {
    setStatus("Enter your bank details and save to enable payouts.");
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const valid = validate();
  if (!valid) return;

  setStatus("Saving your payout details. Verify them manually in Supabase to enable payouts.");

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw new Error(userError.message);
    if (!user?.id) throw new Error("User not found.");

    const payload = {
      user_id: user.id,
      bank_name: valid.bank_name,
      bank_code: valid.bank_code,
      account_number: valid.account_number,
      account_name: accountNameInput?.value?.trim() || null,
      recipient_code: null,
      account_verified: false,
      last_verified_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabase.from("payout_settings").upsert(payload, { onConflict: "user_id" });
    if (dbError) throw dbError;

    localStorage.setItem('payoutSettingsUpdated', new Date().toISOString());
    setStatus("✅ Your bank details are saved. Verify them manually in Supabase to enable payouts.");
  } catch (error) {
    console.error(error);
    setStatus(`❌ ${error?.message ?? "Failed to save payout settings."}`);
  }
});

accountNumberInput?.addEventListener("input", () => {
  if (!accountNumberInput) return;
  accountNumberInput.value = digitsOnly(accountNumberInput.value).slice(0, 10);
});

setStatus("Enter your bank details and save to enable payouts.");

loadPayoutSettings().catch((error) => {
  console.error("Could not load initial payout settings", error);
});