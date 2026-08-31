// Shared menu utilities for the site.
const COMMON_LINKS = [
  { href: 'home.html', label: 'Home' },
  { href: 'my-requests.html', label: 'My Requests' },
  { href: 'provider-locator.html', label: 'Find Nearby' },
  { href: 'my-bookings.html', label: 'My Bookings' },
  { href: 'my-messages.html', label: 'My Messages' },
  { href: 'wishlist.html', label: 'Wishlist' },
  { href: 'contact-us.html', label: 'Contact Us' },
];

const SCREEN_CAPTURE_WARNING = 'Screen capture and screenshots are not allowed on this platform.';

function ensureCaptureProtectionStyles() {
  if (document.getElementById('vora-capture-protection-styles')) return;

  const style = document.createElement('style');
  style.id = 'vora-capture-protection-styles';
  style.textContent = `
    body.vora-capture-blocked {
      user-select: none !important;
      -webkit-user-select: none !important;
      -webkit-touch-callout: none !important;
      pointer-events: none !important;
      filter: blur(2px) saturate(0.8) !important;
      overflow: hidden !important;
    }

    .vora-capture-warning {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.88);
      color: #fff;
      text-align: center;
      padding: 2rem;
      backdrop-filter: blur(10px);
      font-family: Arial, sans-serif;
      font-size: 1.1rem;
      line-height: 1.6;
      letter-spacing: 0.02em;
    }

    .vora-capture-warning.visible {
      display: flex;
    }

    .vora-capture-warning__box {
      max-width: 680px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 2rem 2.4rem;
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
    }

    .vora-capture-warning__title {
      margin: 0 0 0.6rem;
      font-size: 1.6rem;
      font-weight: 700;
    }

    .vora-capture-warning__text {
      margin: 0;
      color: rgba(255, 255, 255, 0.9);
    }
  `;
  document.head.appendChild(style);
}

function showCaptureWarning() {
  ensureCaptureProtectionStyles();

  let warning = document.getElementById('vora-capture-warning');
  if (!warning) {
    warning = document.createElement('div');
    warning.id = 'vora-capture-warning';
    warning.className = 'vora-capture-warning';
    warning.innerHTML = `
      <div class="vora-capture-warning__box">
        <h2 class="vora-capture-warning__title">Capture blocked</h2>
        <p class="vora-capture-warning__text">${SCREEN_CAPTURE_WARNING}</p>
      </div>
    `;
    document.body.appendChild(warning);
  }

  warning.classList.add('visible');
  document.body.classList.add('vora-capture-blocked');
}

function hideCaptureWarning() {
  const warning = document.getElementById('vora-capture-warning');
  if (warning) warning.classList.remove('visible');
  document.body.classList.remove('vora-capture-blocked');
}

function installCaptureProtection() {
  if (window.__voraCaptureProtectionInstalled) return;
  window.__voraCaptureProtectionInstalled = true;

  ensureCaptureProtectionStyles();

  const blockCapture = () => {
    showCaptureWarning();
    setTimeout(() => {
      hideCaptureWarning();
    }, 1800);
  };

  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    blockCapture();
  }, { passive: false });

  document.addEventListener('copy', (event) => {
    event.preventDefault();
    blockCapture();
  }, { passive: false });

  document.addEventListener('cut', (event) => {
    event.preventDefault();
    blockCapture();
  }, { passive: false });

  document.addEventListener('dragstart', (event) => {
    event.preventDefault();
    blockCapture();
  }, { passive: false });

  document.addEventListener('selectstart', (event) => {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    const key = event.key;
    const modifiers = [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey];
    const isRequestedCaptureKey = key === 'PrintScreen' ||
      (event.key === 's' && (event.ctrlKey || event.metaKey) && event.shiftKey) ||
      (event.key === 'c' && (event.ctrlKey || event.metaKey) && event.shiftKey) ||
      (event.key === 'i' && (event.ctrlKey || event.metaKey) && event.shiftKey) ||
      (event.key === 'g' && (event.ctrlKey || event.metaKey) && event.altKey) ||
      (event.key === 'F12');

    if (isRequestedCaptureKey || (modifiers.filter(Boolean).length >= 2 && key === 'PrintScreen')) {
      event.preventDefault();
      blockCapture();
      return;
    }

    if (event.key === 'Escape' && document.getElementById('vora-capture-warning')?.classList.contains('visible')) {
      hideCaptureWarning();
    }
  }, { passive: false });

  window.addEventListener('beforeprint', (event) => {
    event.preventDefault();
    blockCapture();
  });

  window.addEventListener('blur', () => {
    const warning = document.getElementById('vora-capture-warning');
    if (warning) {
      warning.classList.add('visible');
      document.body.classList.add('vora-capture-blocked');
    }
  });

  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (...args) => {
      blockCapture();
      throw new Error('Screen sharing is disabled on this platform.');
    };

    navigator.mediaDevices.getDisplayMedia = function (...args) {
      const original = originalGetDisplayMedia;
      return new Promise((_, reject) => {
        reject(new Error('Screen sharing is disabled on this platform.'));
        blockCapture();
      });
    };
  }
}

function createNavLink(linkInfo) {
  const link = document.createElement('a');
  link.href = linkInfo.href;
  link.className = 'transition hover:text-slate-900';
  link.textContent = linkInfo.label;
  return link;
}

function createMobileLink(linkInfo) {
  const link = document.createElement('a');
  link.href = linkInfo.href;
  link.className = 'block font-semibold text-slate-900';
  link.textContent = linkInfo.label;
  return link;
}

function patchDesktopNav(header) {
  let nav = header.querySelector('nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'hidden lg:flex items-center gap-5 text-sm font-medium text-slate-700';
    const leftGroup = header.querySelector('.flex.items-center.gap-8, .flex.items-center');
    if (leftGroup) {
      leftGroup.appendChild(nav);
    } else {
      header.appendChild(nav);
    }
  }

  nav.className = 'hidden lg:flex items-center gap-5 text-sm font-medium text-slate-700';
  if (COMMON_LINKS.length > 0) {
    nav.innerHTML = '';
    COMMON_LINKS.forEach((linkInfo) => nav.appendChild(createNavLink(linkInfo)));
  }
}

function patchNotificationIcon() {
  const header = document.querySelector('header');
  if (!header) return;

  let actions = header.querySelector('.flex.items-center.gap-4, [data-header-actions="true"]');
  if (!actions) {
    actions = header.querySelector('.flex.items-center.justify-between')?.querySelector('div:last-child');
  }
  if (!actions) return;

  const existingNotificationLink = header.querySelector('#notificationIconLink');
  if (existingNotificationLink) return;

  const notificationLink = document.createElement('a');
  notificationLink.id = 'notificationIconLink';
  notificationLink.href = 'notifications.html';
  notificationLink.className = 'relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700 transition hover:bg-slate-200 hover:text-slate-900';
  notificationLink.setAttribute('aria-label', 'Notifications');
  notificationLink.title = 'Notifications';
  notificationLink.innerHTML = `
    <span aria-hidden="true">🔔</span>
    <span id="notificationBadge" class="hidden absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white"></span>
  `;

  actions.insertBefore(notificationLink, actions.firstChild);
}

function patchProfileIcons() {
  const profileIcons = document.querySelectorAll('[data-profile-icon="true"]');
  profileIcons.forEach((icon) => {
    icon.classList.add(
      'w-10',
      'h-10',
      'rounded-full',
      'bg-gray-300',
      'flex',
      'items-center',
      'justify-center',
      'hover:bg-gray-400',
      'transition'
    );
  });
}

function patchLogoutButtons() {
  const logoutBtns = document.querySelectorAll('#logoutBtn, [data-logout]');
  logoutBtns.forEach((btn) => {
    if (btn.id === 'logoutBtn') {
      btn.className = 'hidden lg:block text-red-600 font-semibold hover:text-red-800 transition';
    }
  });
}

function patchMobileMenu() {
  let sideMenu = document.getElementById('sideMenu');
  if (!sideMenu) {
    sideMenu = document.createElement('div');
    sideMenu.id = 'sideMenu';
    sideMenu.className = 'fixed top-0 left-0 z-50 h-full w-72 transform -translate-x-full overflow-y-auto bg-white shadow-xl transition-transform duration-300 lg:hidden';
    document.body.appendChild(sideMenu);
  }
  // If a page provided a custom paystack-like side menu, don't overwrite it
  if (sideMenu.dataset.paystack === 'true') return;

  sideMenu.className = 'fixed top-0 left-0 z-50 h-full w-72 transform -translate-x-full overflow-y-auto bg-white shadow-xl transition-transform duration-300 lg:hidden';
  sideMenu.innerHTML = `
    <div class="flex items-center justify-between border-b p-4">
      <h2 class="text-xl font-bold">Menu</h2>
      <button id="closeMenu" class="text-2xl">✕</button>
    </div>
    <div class="space-y-4 p-4" id="mobileMenuLinks"></div>
  `;

  const mobileMenuLinks = sideMenu.querySelector('#mobileMenuLinks');
  if (mobileMenuLinks) {
    COMMON_LINKS.forEach((linkInfo) => mobileMenuLinks.appendChild(createMobileLink(linkInfo)));
    const logoutButton = document.createElement('button');
    logoutButton.id = 'logoutBtnSideMenu';
    logoutButton.setAttribute('data-logout', 'true');
    logoutButton.className = 'w-full rounded-full border border-red-600 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50';
    logoutButton.textContent = 'Logout';
    mobileMenuLinks.appendChild(logoutButton);
  }
}

function patchOverlay() {
  let overlay = document.getElementById('menuOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'menuOverlay';
    document.body.appendChild(overlay);
  }
  overlay.className = 'hidden fixed inset-0 z-40 bg-black bg-opacity-40 lg:hidden';
}

export function toggleMenu() {
  const header = document.querySelector('header');
  if (header) {
    header.classList.add('fixed', 'top-0', 'left-0', 'w-full', 'bg-white', 'border-b', 'border-slate-200', 'z-50', 'shadow-sm');
    patchDesktopNav(header);
  }

  patchNotificationIcon();
  patchProfileIcons();
  patchLogoutButtons();
  patchMobileMenu();
  patchOverlay();

  const hamburger = document.querySelector('#hamburger, .hamburger-menu');
  const closeMenu = document.querySelector('#closeMenu, .close-menu');
  const sideMenu = document.getElementById('sideMenu');
  const overlay = document.getElementById('menuOverlay');

  if (!hamburger || !closeMenu || !sideMenu) return;

  const openMenu = () => {
    sideMenu.classList.remove('-translate-x-full');
    overlay?.classList.remove('hidden');
  };

  const closeMenuFn = () => {
    sideMenu.classList.add('-translate-x-full');
    overlay?.classList.add('hidden');
  };

  hamburger.addEventListener('click', openMenu);
  closeMenu.addEventListener('click', closeMenuFn);
  overlay?.addEventListener('click', closeMenuFn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installCaptureProtection();
    toggleMenu();
  });
} else {
  installCaptureProtection();
  toggleMenu();
}
