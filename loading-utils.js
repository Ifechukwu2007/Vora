// =============== LOADING SPINNER UTILITY ===============
// Provides global loading spinner functionality for navigation

export const LoadingSpinner = {
  /**
   * Create and inject the spinner HTML into the page
   */
  init() {
    if (document.getElementById('globalLoadingSpinner')) return;
    
    const spinner = document.createElement('div'); 
    spinner.id = 'globalLoadingSpinner';
    spinner.innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-40 z-[9999] flex items-center justify-center">
        <div class="bg-white rounded-lg p-8 shadow-2xl flex flex-col items-center gap-4">
          <div class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p class="text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    `; 
    spinner.style.display = 'none';
    document.body.appendChild(spinner);
  },

  /**
   * Show the loading spinner
   */
  show() {
    this.init();
    const spinner = document.getElementById('globalLoadingSpinner');
    if (spinner) spinner.style.display = 'flex';
  },

  /**
   * Hide the loading spinner
   */
  hide() {
    const spinner = document.getElementById('globalLoadingSpinner');
    if (spinner) spinner.style.display = 'none';
  },

  /**
   * Show spinner and navigate after an optional delay
   * @param {string} url - The URL to navigate to (with or without .html)
   * @param {number} delay - Delay in ms before navigation (default: 0)
   */
  navigateTo(url, delay = 0) {
    this.show();

    const navigate = () => {
      // Ensure .html extension is added for actual navigation
      const actualUrl = url.endsWith('.html') ? url : url + '.html';
      window.location.href = actualUrl;
    };

    if (delay > 0) {
      setTimeout(navigate, delay);
    } else {
      requestAnimationFrame(navigate);
    }
  }
};

/**
 * Setup navigation interceptors for all links and buttons
 * Must be called after DOM is loaded
 */
export function setupNavigationInterceptors() {
  LoadingSpinner.init();

  // Intercept all navigation links
  document.addEventListener('click', (e) => {
    let target = e.target;
    
    // Handle nested elements inside links/buttons
    while (target && target !== document) {
      const href = target.getAttribute('href');
      const dataHref = target.getAttribute('data-href');
      
      // Skip if it's a non-navigation link or has data-no-spinner attribute
      if (target.hasAttribute('data-no-spinner')) {
        break;
      }

      // Check if it's a navigation link
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        e.preventDefault();
        LoadingSpinner.navigateTo(href);
        return;
      }

      // Check for custom navigation attribute
      if (dataHref) {
        e.preventDefault();
        LoadingSpinner.navigateTo(dataHref);
        return;
      }

      target = target.parentElement;
    }
  }, true);
}

// Auto-init when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupNavigationInterceptors);
} else {
  setupNavigationInterceptors();
}
