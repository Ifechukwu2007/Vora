import { LoadingSpinner } from './loading-utils.js';

// ========================================
// CLIENT-SIDE ROUTER FOR SPA
// ========================================
class SPA_Router {
  constructor() {
    this.routes = {
      'home': 'home.html',
      'browse': 'browse.html',
      'login': 'login.html',
      'register': 'register.html',
      'dashboard': 'dashboard.html',
      'profile': 'profile.html',
      'my-bookings': 'my-bookings.html',
      'my-requests': 'my-requests.html',
      'my-services': 'my-services.html',
      'add-service': 'add-service.html',
      'edit-service': 'edit-service.html', 
      'service': 'service.html',
      'admin': 'admin.html',
      'admin-bookings': 'admin-bookings.html',
      'admin-offers': 'admin-offers.html',
      'admin-payments': 'admin-payments.html',
      'admin-payouts': 'admin-payouts.html',
      'admin-requests': 'admin-requests.html',
      'admin-reviews': 'admin-reviews.html',
      'admin-services': 'admin-services.html',
      'admin-settings': 'admin-settings.html',
      'admin-users': 'admin-users.html',
      'customer-reviews': 'customer-reviews.html',
      'provider-bookings': 'provider-bookings.html',
      'provider-hub': 'provider-hub.html',
      'provider-reviews': 'provider-reviews.html',
      'payment': 'payment.html',
      'schedule': 'schedule.html',
      'notifications': 'notifications.html',
      'payout-settings': 'payout-settings.html',
      'post-request': 'post-request.html',
      'privacy-policy': 'privacy-policy.html',
      'terms-of-service': 'terms-of-service.html',
      'how-it-works': 'how-it-works.html',
      '404': '404.html'
    };
    this.currentPageFile = null;
  }

  navigate(page, params = {}) {
    // Remove .html extension if present
    page = page.replace(/\.html$/, '');
    
    // Get the actual file to load
    const file = this.routes[page] || this.routes['404'];
    
    if (file) {
      this.currentPageFile = file;
      LoadingSpinner.navigateTo(file, params);
    }
  }

  getRouteForFile(file) {
    file = file.replace(/\.html$/, '');
    return Object.keys(this.routes).find(key => 
      this.routes[key].replace(/\.html$/, '') === file
    ) || '404';
  }
}

export const spaRouter = new SPA_Router();

export function initializeRouter() {
  // Handle data-action buttons
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      spaRouter.navigate(action);
    });
  });
  
  // Handle all links that should use SPA routing
  document.querySelectorAll('a[href*=".html"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      
      // Skip external links and anchors
      if (href.startsWith('http') || href.startsWith('#')) {
        return;
      }
      
      e.preventDefault();
      
      // Extract page and query params
      const [page, query] = href.split('?');
      const params = new URLSearchParams(query);
      const paramObj = {};
      
      for (let [key, value] of params) {
        paramObj[key] = value;
      }
      
      spaRouter.navigate(page, paramObj);
    });
  });
} 