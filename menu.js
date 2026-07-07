// Shared menu utilities for the site.
const COMMON_LINKS = [
  { href: 'home.html', label: 'Home' },
  { href: 'my-bookings.html', label: 'My Bookings' },
  { href: 'my-messages.html', label: 'My Messages' },
  { href: 'wishlist.html', label: 'Wishlist' },
  { href: 'contact-us.html', label: 'Contact Us' },
];

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
  document.addEventListener('DOMContentLoaded', toggleMenu);
} else {
  toggleMenu();
}
