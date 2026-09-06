/**
 * Country Configuration
 * Stores all country-specific settings for the Vorabukeen platform
 */

import { setCurrencyByCountry } from './currency-utils.js';

// Country-specific settings
export const COUNTRY_CONFIG = {
  Nigeria: { code: "NG", currency: "NGN", currencyCode: "NGN", defaultLocation: { latitude: 6.151173, longitude: 6.780686 }, geocodeCountryCode: "ng", phoneCode: "+234", phonePattern: /^[789]\d{9}$/, phoneLabel: "10-digit Nigerian number", distanceUnit: "km", paymentMethods: ["paystack"], addressFormat: "landmark, street, state, country", featureFlags: { showPayPal: true, showLocalPayment: true, showInstallments: false } },
  "South Africa": { code: "ZA", currency: "ZAR", currencyCode: "ZAR", defaultLocation: { latitude: -33.918861, longitude: 18.423300 }, geocodeCountryCode: "za", phoneCode: "+27", phonePattern: /^[1-9]\d{8,9}$/, phoneLabel: "9-10 digit South African number", distanceUnit: "km", paymentMethods: ["paystack", "card"], addressFormat: "street, suburb, province, country", featureFlags: { showPayPal: true, showLocalPayment: true, showInstallments: true } },
  "United States": { code: "US", currency: "USD", currencyCode: "USD", defaultLocation: { latitude: 37.7749, longitude: -122.4194 }, geocodeCountryCode: "us", phoneCode: "+1", phonePattern: /^\d{10}$/, phoneLabel: "10-digit US number", distanceUnit: "mi", paymentMethods: ["card", "paypal"], addressFormat: "street, city, state, postal code, country", featureFlags: { showPayPal: true, showLocalPayment: false, showInstallments: true } },
  "United Kingdom": { code: "GB", currency: "GBP", currencyCode: "GBP", defaultLocation: { latitude: 51.5074, longitude: -0.1278 }, geocodeCountryCode: "gb", phoneCode: "+44", phonePattern: /^\d{10,11}$/, phoneLabel: "10-11 digit UK number", distanceUnit: "mi", paymentMethods: ["card", "paypal"], addressFormat: "street, town, postcode, country", featureFlags: { showPayPal: true, showLocalPayment: false, showInstallments: true } },
  Canada: { code: "CA", currency: "CAD", currencyCode: "CAD", defaultLocation: { latitude: 43.6532, longitude: -79.3832 }, geocodeCountryCode: "ca", phoneCode: "+1", phonePattern: /^\d{10}$/, phoneLabel: "10-digit Canadian number", distanceUnit: "km", paymentMethods: ["card", "paypal"], addressFormat: "street, city, province, postal code, country", featureFlags: { showPayPal: true, showLocalPayment: false, showInstallments: true } },
  Australia: { code: "AU", currency: "AUD", currencyCode: "AUD", defaultLocation: { latitude: -33.8688, longitude: 151.2093 }, geocodeCountryCode: "au", phoneCode: "+61", phonePattern: /^\d{9,10}$/, phoneLabel: "9-10 digit Australian number", distanceUnit: "km", paymentMethods: ["card", "paypal"], addressFormat: "street, suburb, state, postcode, country", featureFlags: { showPayPal: true, showLocalPayment: false, showInstallments: true } },
  India: { code: "IN", currency: "INR", currencyCode: "INR", defaultLocation: { latitude: 19.0760, longitude: 72.8777 }, geocodeCountryCode: "in", phoneCode: "+91", phonePattern: /^[789]\d{9}$/, phoneLabel: "10-digit Indian number", distanceUnit: "km", paymentMethods: ["card", "upi"], addressFormat: "address, city, state, country", featureFlags: { showPayPal: true, showLocalPayment: true, showInstallments: true } },
  Ghana: { code: "GH", currency: "GHS", currencyCode: "GHS", defaultLocation: { latitude: 5.6037, longitude: -0.1870 }, geocodeCountryCode: "gh", phoneCode: "+233", phonePattern: /^[235]\d{8,9}$/, phoneLabel: "9-digit Ghanaian number", distanceUnit: "km", paymentMethods: ["paystack", "card"], addressFormat: "landmark, street, region, country", featureFlags: { showPayPal: true, showLocalPayment: true, showInstallments: false } }
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
  return localStorage.getItem("userCountry") || "Nigeria";
}

/**
 * Set user's country and apply all settings
 * @param {string} country - Country name
 */
export function setUserCountry(country) {
  if (COUNTRY_CONFIG[country]) {
    localStorage.setItem("userCountry", country);
    const config = getCountryConfig(country);
    
    // Apply currency
    setCurrencyByCountry(country);
    
    // Dispatch event so pages can react to country change
    window.dispatchEvent(new CustomEvent("countryChanged", { 
      detail: { country, config } 
    }));
  }
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
    if (config.currency === "NGN") {
      el.textContent = "Price (NGN)";
    } else if (config.currency === "ZAR") {
      el.textContent = "Price (ZAR)";
    } else {
      el.textContent = `Price (${config.currency})`;
    }
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
