// =============== LOADING SPINNER UTILITY ===============
// Improved version: avoids interfering with back/forward navigation (BFCache-safe)

export const LoadingSpinner = {
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

    spinner.style.opacity = '0';
    spinner.style.visibility = 'hidden';
    spinner.style.transition = 'opacity 0.2s ease';

    document.body.appendChild(spinner);
  },

  show() {
    this.init();
    const spinner = document.getElementById('globalLoadingSpinner');
    if (!spinner) return;

    spinner.style.visibility = 'visible';
    spinner.style.opacity = '1';
  },

  hide() {
    const spinner = document.getElementById('globalLoadingSpinner');
    if (!spinner) return;

    spinner.style.opacity = '0';
    spinner.style.visibility = 'hidden';
  },

  navigateTo(url, delay = 120) {
    // Only show spinner if navigation is actually delayed
    let spinnerShown = false;

    const timer = setTimeout(() => {
      this.show();
      spinnerShown = true;
    }, delay);

    requestAnimationFrame(() => {
      clearTimeout(timer);

      if (spinnerShown) this.show();
      window.location.href = url;
    });
  }
};

/**
 * Setup navigation interceptors
 */
export function setupNavigationInterceptors() {
  LoadingSpinner.init();

  // Hide spinner when returning via back/forward cache (important fix)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      LoadingSpinner.hide();
    }
  });

  document.addEventListener('click', (e) => {
    let target = e.target;

    while (target && target !== document) {
      const href = target.getAttribute?.('href');
      const dataHref = target.getAttribute?.('data-href');

      // Skip anything explicitly excluded
      if (target.hasAttribute?.('data-no-spinner')) {
        return;
      }

      // Ignore download links
      if (target.hasAttribute?.('download')) {
        return;
      }

      // INTERNAL href navigation only
      if (
        href &&
        !href.startsWith('#') &&
        !href.startsWith('javascript:') &&
        !href.startsWith('http')
      ) {
        e.preventDefault();
        LoadingSpinner.navigateTo(href);
        return;
      }

      // custom data-href navigation
      if (dataHref) {
        e.preventDefault();
        LoadingSpinner.navigateTo(dataHref);
        return;
      }

      target = target.parentElement;
    }
  }, true);
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupNavigationInterceptors);
} else {
  setupNavigationInterceptors();
}