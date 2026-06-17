/**
 * Currency Utilities
 * Handles currency preferences and conversions
 */

// Exchange rate (NGN to USD) - Update this periodically or fetch from API
// As of 2026: 1 USD = ~1550 NGN (This is approximate and should be updated)
const EXCHANGE_RATES = {
  NGN_TO_USD: 1 / 1550,  // Divide NGN by this to get USD
  USD_TO_NGN: 1550,      // Multiply USD by this to get NGN
};

/**
 * Get the user's preferred currency
 * @returns {string} "NGN" or "USD" (defaults to "NGN")
 */
export function getPreferredCurrency() {
  return localStorage.getItem("preferredCurrency") || "NGN";
}

/**
 * Set the user's preferred currency
 * @param {string} currency - "NGN" or "USD"
 */
export function setPreferredCurrency(currency) {
  if (["NGN", "USD"].includes(currency)) {
    localStorage.setItem("preferredCurrency", currency);
    window.dispatchEvent(new CustomEvent("currencyChanged", { detail: { currency } }));
  }
}

/**
 * Convert price from one currency to another
 * @param {number} amount - The amount to convert
 * @param {string} fromCurrency - Source currency ("NGN" or "USD")
 * @param {string} toCurrency - Target currency ("NGN" or "USD")
 * @returns {number} Converted amount
 */
export function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  
  if (fromCurrency === "NGN" && toCurrency === "USD") {
    return amount * EXCHANGE_RATES.NGN_TO_USD;
  }
  
  if (fromCurrency === "USD" && toCurrency === "NGN") {
    return amount * EXCHANGE_RATES.USD_TO_NGN;
  }
  
  return amount;
}

/**
 * Format price in user's preferred currency
 * Assumes prices in DB are stored in NGN
 * @param {number} priceInNGN - Price in Nigerian Naira
 * @param {boolean} includeSymbol - Include currency symbol (default: true)
 * @returns {string} Formatted price with currency
 */
export function formatPrice(priceInNGN, includeSymbol = true) {
  const preferredCurrency = getPreferredCurrency();
  let displayPrice;
  let symbol;
  let decimals;

  if (preferredCurrency === "USD") {
    displayPrice = convertCurrency(priceInNGN, "NGN", "USD");
    symbol = "$";
    decimals = 2;
  } else {
    displayPrice = priceInNGN;
    symbol = "₦";
    decimals = 0;
  }

  const formatted = displayPrice.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return includeSymbol ? `${symbol}${formatted}` : formatted;
}

/**
 * Format price without the currency display (just the number)
 * @param {number} priceInNGN - Price in Nigerian Naira
 * @returns {string} Formatted price number
 */
export function formatPriceNumber(priceInNGN) {
  return formatPrice(priceInNGN, false);
}

/**
 * Get currency symbol
 * @returns {string} "₦" or "$"
 */
export function getCurrencySymbol() {
  const currency = getPreferredCurrency();
  return currency === "USD" ? "$" : "₦";
}

/**
 * Get currency code
 * @returns {string} "NGN" or "USD"
 */
export function getCurrencyCode() {
  return getPreferredCurrency();
}

/**
 * Update exchange rates (call this periodically or when fetching live rates)
 * @param {number} ngnToUsd - Exchange rate (NGN to USD divisor)
 */
export function updateExchangeRates(ngnToUsd) {
  EXCHANGE_RATES.NGN_TO_USD = 1 / ngnToUsd;
  EXCHANGE_RATES.USD_TO_NGN = ngnToUsd;
}

export default {
  getPreferredCurrency,
  setPreferredCurrency,
  convertCurrency,
  formatPrice,
  formatPriceNumber,
  getCurrencySymbol,
  getCurrencyCode,
  updateExchangeRates,
};
