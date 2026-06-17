// Shared menu utilities for the site.
export function toggleMenu() {
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
