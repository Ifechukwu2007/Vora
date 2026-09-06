/**
 * Currency Utilities
 * Handles currency preferences and conversions by country
 */

// Base currency is NGN - all prices stored in NGN in database
// Exchange rates relative to NGN (as of 2026)
const EXCHANGE_RATES = {
  NGN: 1,                      // Nigerian Naira (base)
  USD: 1 / 1550,              // US Dollar (1 USD = ~1550 NGN)
  ZAR: 1 / 90,                // South African Rand (1 ZAR = ~90 NGN)
  GHS: 1 / 12,
  GBP: 1 / 2000,
  CAD: 1 / 1150,
  AUD: 1 / 1050,
  INR: 1 / 18,
};

// Currency metadata
const CURRENCY_CONFIG = {
  NGN: { symbol: "₦", decimals: 0, name: "Nigerian Naira" },
  USD: { symbol: "$", decimals: 2, name: "US Dollar" },
  ZAR: { symbol: "R", decimals: 2, name: "South African Rand" },
  GHS: { symbol: "GH₵", decimals: 2, name: "Ghanaian Cedi" },
  GBP: { symbol: "£", decimals: 2, name: "British Pound" },
  CAD: { symbol: "CA$", decimals: 2, name: "Canadian Dollar" },
  AUD: { symbol: "A$", decimals: 2, name: "Australian Dollar" },
  INR: { symbol: "₹", decimals: 2, name: "Indian Rupee" },
};

// Map countries to their currencies
const COUNTRY_CURRENCY_MAP = {
  "Nigeria": "NGN",
  "United States": "USD",
  "United Kingdom": "GBP",  // Will use USD for display
  "Canada": "CAD",           // Will use USD for display
  "Australia": "AUD",        // Will use USD for display
  "India": "INR",            // Will use USD for display
  "South Africa": "ZAR",
  "Ghana": "GHS",
};

/**
 * Get the user's preferred currency
 * @returns {string} Currency code like "NGN", "USD", "ZAR"
 */
export function getPreferredCurrency() {
  return localStorage.getItem("preferredCurrency") || "NGN";
}

/**
 * Set the user's preferred currency
 * @param {string} currency - Currency code like "NGN", "USD", "ZAR"
 */
export function setPreferredCurrency(currency) {
  if (Object.keys(CURRENCY_CONFIG).includes(currency)) {
    localStorage.setItem("preferredCurrency", currency);
    window.dispatchEvent(new CustomEvent("currencyChanged", { detail: { currency } }));
  }
}

/**
 * Get currency based on country
 * @param {string} country - Country name
 * @returns {string} Currency code
 */
export function getCurrencyForCountry(country) {
  return COUNTRY_CURRENCY_MAP[country] || "NGN";
}

export function getCurrencyCodeForCountry(country) {
  return getCurrencyForCountry(country);
}

/**
 * Set currency based on user's country
 * @param {string} country - Country name
 */
export function setCurrencyByCountry(country) {
  const currency = getCurrencyForCountry(country);
  setPreferredCurrency(currency);
}

/**
 * Convert price from one currency to another
 * All prices in DB are stored in NGN, so conversion is always through NGN
 * @param {number} amount - The amount to convert
 * @param {string} fromCurrency - Source currency ("NGN", "USD", "ZAR", etc.)
 * @param {string} toCurrency - Target currency ("NGN", "USD", "ZAR", etc.)
 * @returns {number} Converted amount
 */
export function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  
  if (!EXCHANGE_RATES[fromCurrency] || !EXCHANGE_RATES[toCurrency]) {
    console.warn(`Unknown currency: ${fromCurrency} or ${toCurrency}, defaulting to NGN`);
    return amount;
  }
  
  // Convert to base (NGN) first, then to target
  const amountInNGN = amount / EXCHANGE_RATES[fromCurrency];
  const amountInTarget = amountInNGN * EXCHANGE_RATES[toCurrency];
  
  return amountInTarget;
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
  const config = CURRENCY_CONFIG[preferredCurrency] || CURRENCY_CONFIG.NGN;
  
  let displayPrice = convertCurrency(priceInNGN, "NGN", preferredCurrency);
  
  const formatted = displayPrice.toLocaleString("en-US", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });

  return includeSymbol ? `${config.symbol}${formatted}` : formatted;
}

export function formatPriceInCurrency(amount, currencyCode = "NGN", includeSymbol = true) {
  const config = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.NGN;
  const formatted = Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });
  return includeSymbol ? `${config.symbol}${formatted}` : formatted;
}

export function formatServicePrice(service, amount) {
  return service?.currency_code
    ? formatPriceInCurrency(amount, service.currency_code)
    : formatPrice(amount);
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
 * Get currency symbol for preferred currency
 * @returns {string} Currency symbol like "₦", "$", "R"
 */
export function getCurrencySymbol() {
  const currency = getPreferredCurrency();
  return CURRENCY_CONFIG[currency]?.symbol || "₦";
}

/**
 * Get currency name
 * @returns {string} Currency name like "Nigerian Naira"
 */
export function getCurrencyName() {
  const currency = getPreferredCurrency();
  return CURRENCY_CONFIG[currency]?.name || "Nigerian Naira";
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
  formatPriceInCurrency,
  formatServicePrice,
  getCurrencySymbol,
  getCurrencyCode,
  updateExchangeRates,
};
