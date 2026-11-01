/**
 * Country Configuration
 * Stores all country-specific settings for the Vorabukeen platform
 */

import { setCurrencyByCountry } from './currency-utils.js';

// Country-specific settings
export const COUNTRY_CONFIG = {
  Nigeria: { code: "NG", currency: "NGN", currencyCode: "NGN", defaultLocation: { latitude: 6.151173, longitude: 6.780686 }, geocodeCountryCode: "ng", phoneCode: "+234", phonePattern: /^[789]\d{9}$/, phoneLabel: "10-digit Nigerian number", distanceUnit: "km", paymentMethods: ["flutterwave"], addressFormat: "landmark, street, state, country", featureFlags: { showPayPal: true, showLocalPayment: true, showInstallments: false } },
};

/**
 * Get configuration for a country
 * @param {string} country - Country name
 * @returns {Object} Country configuration
 */
export function getCountryConfig(country) {
  return COUNTRY_CONFIG[country] || COUNTRY_CONFIG["Nigeria"];
}

/**
 * Get user's country from local storage
 * @returns {string} Country name
 */
export function getUserCountry() {
  const country = localStorage.getItem("userCountry");
  if (!COUNTRY_CONFIG[country]) {
    localStorage.setItem("userCountry", "Nigeria");
    return "Nigeria";
  }
  return country;
}

/**
 * Set user's country and apply all settings
 * @param {string} country - Country name
 */
export function setUserCountry(country) {
  const supportedCountry = COUNTRY_CONFIG[country] ? country : "Nigeria";
  localStorage.setItem("userCountry", supportedCountry);
  const config = getCountryConfig(supportedCountry);

  setCurrencyByCountry(supportedCountry);
  window.dispatchEvent(new CustomEvent("countryChanged", {
    detail: { country: supportedCountry, config }
  }));
}

/**
 * Apply all country-specific settings on page load
 * Call this in your page initialization
 */
export function applyCountrySettings() {
  const country = getUserCountry();
  const config = getCountryConfig(country);
  
  // Apply currency
  setCurrencyByCountry(country);
  
  // Apply other country-specific customizations
  updatePageForCountry(country, config);
}

/**
 * Update page elements based on country settings
 * @param {string} country - Country name
 * @param {Object} config - Country configuration
 */
function updatePageForCountry(country, config) {
  // Update all price labels to show correct currency
  const priceElements = document.querySelectorAll('[data-price-label]');
  priceElements.forEach(el => {
    el.textContent = `Price (${config.currency})`;
  });
  
  // Update phone labels
  const phoneLabels = document.querySelectorAll('[data-phone-label]');
  phoneLabels.forEach(el => {
    el.textContent = config.phoneLabel;
  });
  
  // Dispatch event for further customization by pages
  window.dispatchEvent(new CustomEvent("pageCountryApplied", { 
    detail: { country, config } 
  }));
}

/**
 * Initialize country detection (for new users without stored country)
 * Can be expanded to use IP geolocation
 */
export function initializeCountryDetection() {
  // Check if user already has a country set
  if (localStorage.getItem("userCountry")) {
    return;
  }
  
  // Default to Nigeria for now
  // In future, can implement IP-based detection
  setUserCountry("Nigeria");
}

// Export currency functions for convenience
export { setCurrencyByCountry } from './currency-utils.js';
