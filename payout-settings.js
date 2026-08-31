import { supabase } from "./supabase.js";
import { getUserCountry } from "./country-config.js";
import { formatPrice, getCurrencyCode, getCurrencySymbol } from "./currency-utils.js";

const form = document.getElementById("payout-settings-form");
const bankSelect = document.getElementById("bank-code");
const accountNumberInput = document.getElementById("account-number");
const accountNameInput = document.getElementById("account-name");
const errorBankCode = document.getElementById("error-bank-code");
const errorAccountNumber = document.getElementById("error-account-number");
const payoutStatusText = document.getElementById("payout-status-text");
const userCountryBadge = document.getElementById("user-country-badge");
const currencyBadge = document.getElementById("currency-badge");
const earningsTotal = document.getElementById("earnings-total");
const availableTotal = document.getElementById("available-total");
const upcomingTotal = document.getElementById("upcoming-total");
const totalEarned = document.getElementById("total-earned");
const upcomingReleaseAmount = document.getElementById("upcoming-release-amount");
const releaseDate = document.getElementById("release-date");
const upcomingList = document.getElementById("upcoming-list");
const payoutMethodCard = document.getElementById("payout-method-card");
const payoutHistory = document.getElementById("payout-history");
const addMethodBtn = document.getElementById("add-method-btn");
const cancelMethodBtn = document.getElementById("cancel-method-btn");
const bankCountryLabel = document.getElementById("bank-country-label");

const DEFAULT_COUNTRY = getUserCountry();

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

function applyCountryBankOptions() {
  const country = getUserCountry();

  if (bankSelect) {
    bankSelect.value = bankSelect.value || "";
    bankSelect.placeholder = country === "South Africa" ? "e.g. Capitec Bank" : "e.g. Access Bank";
  }

  if (bankCountryLabel) {
    bankCountryLabel.textContent = `${country} bank details`;
    bankCountryLabel.classList.remove("hidden");
  }

  if (userCountryBadge) userCountryBadge.textContent = country;
  if (currencyBadge) currencyBadge.textContent = `${getCurrencyCode()} • ${getCurrencySymbol()}`;
}

function dataLabel(value) {
  return value ? value : "--";
}

function getBookingRevenueAmount(booking) {
  return Number(booking?.total_price ?? booking?.total_amount ?? booking?.amount ?? 0);
}

function renderSummaryTotals(summary = { earnings: 0, available: 0, upcoming: 0, thisMonth: 0, nextReleaseDate: null }) {
  const earningsValue = Number(summary.earnings || 0);
  const availableValue = Number(summary.available || 0);
  const upcomingValue = Number(summary.upcoming || 0);
  const thisMonthValue = Number(summary.thisMonth || 0);

  if (earningsTotal) earningsTotal.textContent = formatPrice(earningsValue);
  if (availableTotal) availableTotal.textContent = formatPrice(availableValue);
  if (upcomingTotal) upcomingTotal.textContent = formatPrice(upcomingValue);
  if (totalEarned) totalEarned.textContent = formatPrice(thisMonthValue);
  if (upcomingReleaseAmount) upcomingReleaseAmount.textContent = formatPrice(upcomingValue);

  const release = summary.nextReleaseDate ? new Date(summary.nextReleaseDate) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  if (releaseDate) releaseDate.textContent = Number.isNaN(release.getTime()) ? "--" : release.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (upcomingList) {
    if (upcomingValue > 0) {
      upcomingList.innerHTML = `
        <div class="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
          <span>Pending payout release</span>
          <span class="font-semibold text-slate-900">${formatPrice(upcomingValue)}</span>
        </div>
      `;
    } else {
      upcomingList.innerHTML = `
        <div class="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
          <span>No upcoming payouts yet.</span>
          <span class="font-semibold text-slate-400">--</span>
        </div>
      `;
    }
  }
}

function renderHistory(payout, summary = null) {
  if (!payoutHistory) return;

  const payoutRows = summary?.history || [];
  const rows = payoutRows.length > 0 ? payoutRows.map((row) => ({
    label: row.label || "Payout",
    amount: formatPrice(Number(row.amount || 0)),
    status: row.status || "Processing",
  })) : [
    {
      label: payout?.bank_name ? `${payout.bank_name} • ${payout.account_number || "Account details saved"}` : "No payouts yet",
      amount: payout?.bank_name ? formatPrice(summary?.available || 0) : "--",
      status: payout?.bank_name ? (payout.account_verified ? "Ready" : "Processing") : "Waiting",
    },
  ];

  payoutHistory.innerHTML = rows.map((row) => `
    <div class="rounded-2xl border border-slate-200 px-4 py-3">
      <div class="flex items-center justify-between gap-4">
        <span>${row.label}</span>
        <span class="font-semibold text-slate-900">${row.amount}</span>
      </div>
      <p class="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">${row.status}</p>
    </div>
  `).join("");
}

function renderMethodCard(payout) {
  if (!payoutMethodCard) return;

  if (!payout || !payout.bank_name || !payout.account_number) {
    payoutMethodCard.innerHTML = `
      <p class="text-sm text-slate-500">No payout method saved yet.</p>
      <p class="mt-3 text-sm text-slate-600">Add a bank account to receive provider earnings automatically.</p>
    `;
    return;
  }

  payoutMethodCard.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Default method</p>
        <h3 class="mt-2 text-xl font-semibold text-slate-900">${payout.bank_name}</h3>
        <p class="mt-2 text-sm text-slate-600">${dataLabel(payout.account_name)} • ${payout.account_number}</p>
      </div>
      <span class="rounded-full ${payout.account_verified ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-800"} px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
        ${payout.account_verified ? "Verified" : "Pending"}
      </span>
    </div>
  `;
}

function showMethodForm(isVisible) {
  if (!form) return;
  form.classList.toggle("hidden", !isVisible);
}

function validate() {
  const bankCode = (bankSelect?.value ?? "").trim();
  const accountNumber = digitsOnly(accountNumberInput?.value);

  if (!bankCode) {
    showError(errorBankCode, "Please enter your bank name.");
    setStatus("Please enter your bank name.");
    return null;
  }

  showError(errorBankCode, "");

  if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 20) {
    showError(errorAccountNumber, "Please enter a valid account number.");
    setStatus("Fix your account number and try again.");
    return null;
  }

  showError(errorAccountNumber, "");

  return {
    bank_code: bankCode,
    bank_name: bankCode,
    account_number: accountNumber,
    account_name: accountNameInput?.value?.trim() || null,
  };
}

async function loadPayoutSettings() {
  setStatus("Loading payout methods...");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    console.error("Failed to load user", userError);
    setStatus("Unable to load payout settings. Please sign in again.");
    return null;
  }

  const [{ data: payout, error: payoutError }, { data: payoutsData, error: payoutsError }, { data: bookingsData, error: bookingsError }] = await Promise.all([
    supabase
      .from("payout_settings")
      .select("bank_name, bank_code, account_number, account_name, account_verified, recipient_code, last_verified_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("payouts")
      .select("id, provider_id, provider_amount, payout_status, status, created_at, updated_at")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, provider_id, total_price, total_amount, amount, provider_amount, payout_status, payment_status, status, created_at, paid_at")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false })
  ]);

  if (payoutError) {
    console.error("Failed to load payout settings", payoutError);
  }
  if (payoutsError) {
    console.error("Failed to load payouts summary", payoutsError);
  }
  if (bookingsError) {
    console.error("Failed to load bookings summary", bookingsError);
  }

  const allPayouts = Array.isArray(payoutsData) ? payoutsData : [];
  const allBookings = Array.isArray(bookingsData) ? bookingsData : [];

  const earnings = allBookings.reduce((total, booking) => {
    const amount = getBookingRevenueAmount(booking);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);

  const available = allPayouts.filter((record) => String(record.payout_status || record.status || "").toLowerCase() === "paid").reduce((total, record) => total + Number(record.provider_amount || 0), 0)
    + allBookings.filter((booking) => String(booking.payout_status || "").toLowerCase() === "paid").reduce((total, booking) => total + Number(booking.provider_amount || getBookingRevenueAmount(booking)), 0);

  const upcoming = allPayouts.filter((record) => String(record.payout_status || record.status || "").toLowerCase() === "pending").reduce((total, record) => total + Number(record.provider_amount || 0), 0)
    + allBookings.filter((booking) => String(booking.payout_status || "").toLowerCase() === "pending").reduce((total, booking) => total + Number(booking.provider_amount || getBookingRevenueAmount(booking)), 0);

  const currentMonth = new Date();
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getTime();
  const thisMonth = allBookings.reduce((total, booking) => {
    const createdAt = booking.created_at || booking.updated_at || booking.paid_at;
    if (!createdAt) return total;
    const date = new Date(createdAt).getTime();
    if (Number.isFinite(date) && date >= monthStart) {
      const amount = getBookingRevenueAmount(booking);
      return Number.isFinite(amount) ? total + amount : total;
    }
    return total;
  }, 0);

  const pendingRelease = [...allPayouts, ...allBookings]
    .filter((entry) => String(entry.payout_status || entry.status || "").toLowerCase() === "pending")
    .sort((a, b) => new Date(a.created_at || a.paid_at || a.updated_at || Date.now()) - new Date(b.created_at || b.paid_at || b.updated_at || Date.now()));

  const nextRelease = pendingRelease[0]?.created_at || pendingRelease[0]?.paid_at || null;

  const summary = {
    earnings: Math.max(0, earnings),
    available: Math.max(0, available),
    upcoming: Math.max(0, upcoming),
    thisMonth: Math.max(0, thisMonth),
    nextReleaseDate: nextRelease || null,
    history: allPayouts.slice(0, 5).map((record) => ({
      label: `Payout ${record.id?.slice(0, 8) || "record"}`,
      amount: Number(record.provider_amount || 0),
      status: String(record.payout_status || record.status || "pending").replace(/_/g, " "),
    })),
  };

  renderSummaryTotals(summary);

  if (payout) {
    if (bankSelect) bankSelect.value = payout.bank_code ?? "";
    if (accountNumberInput) accountNumberInput.value = payout.account_number ?? "";
    if (accountNameInput) accountNameInput.value = payout.account_name ?? "";
    renderMethodCard(payout);
    renderHistory(payout, summary);

    if (payout.account_verified && payout.recipient_code) {
      setStatus("✅ Your payout method is verified and ready for automatic releases.");
    } else {
      setStatus("Add or update your payout method so provider earnings can be released after settlement.");
    }
  } else {
    renderMethodCard(null);
    renderHistory(null, summary);
    setStatus("Choose your payout method and save it.");
  }

  return payout || null;
}

async function savePayoutMethod() {
  const valid = validate();
  if (!valid) return;

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
      account_name: valid.account_name,
      recipient_code: null,
      account_verified: false,
      last_verified_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabase.from("payout_settings").upsert(payload, { onConflict: "user_id" });
    if (dbError) throw dbError;

    localStorage.setItem("payoutSettingsUpdated", new Date().toISOString());
    window.dispatchEvent(new Event("payoutSettingsUpdated"));
    setStatus("✅ Your payout method has been saved and will be used for automatic payout releases.");
    showMethodForm(false);
    await loadPayoutSettings();
  } catch (error) {
    console.error(error);
    setStatus(`❌ ${error?.message ?? "Failed to save payout settings."}`);
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  await savePayoutMethod();
});

accountNumberInput?.addEventListener("input", () => {
  if (!accountNumberInput) return;
  accountNumberInput.value = digitsOnly(accountNumberInput.value).slice(0, 20);
});

addMethodBtn?.addEventListener("click", () => {
  showMethodForm(true);
});

cancelMethodBtn?.addEventListener("click", () => {
  showMethodForm(false);
});

applyCountryBankOptions();
renderSummaryTotals({ earnings: 0, available: 0, upcoming: 0, thisMonth: 0, nextReleaseDate: null });
showMethodForm(false);

loadPayoutSettings().catch((error) => {
  console.error("Could not load initial payout settings", error);
});

window.addEventListener("countryChanged", () => {
  applyCountryBankOptions();
});

window.addEventListener("storage", (event) => {
  if (event.key === "payoutSettingsUpdated") {
    loadPayoutSettings().catch(console.error);
  }
});

window.addEventListener("payoutSettingsUpdated", () => {
  loadPayoutSettings().catch(console.error);
});

if (DEFAULT_COUNTRY) {
  setStatus(`Payout settings for ${DEFAULT_COUNTRY}.`);
}