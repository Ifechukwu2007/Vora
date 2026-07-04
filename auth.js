// ===============================
// SUPABASE AUTH FOR VORA
// ===============================

import { supabase } from "./supabase.js";

// ===============================
// GLOBAL ELEMENTS
// ===============================

const errorAlert = document.getElementById("errorAlert");
const errorMessage = document.getElementById("errorMessage");

const successAlert = document.getElementById("successAlert");
const successMessage = document.getElementById("successMessage");

// ===============================
// ALERT FUNCTIONS
// ===============================

function showError(message) {
  if (!errorAlert || !errorMessage) return;

  errorAlert.classList.remove("hidden");
  errorMessage.textContent = message;

  if (successAlert) {
    successAlert.classList.add("hidden");
  }
}

function showSuccess(message) {
  if (!successAlert || !successMessage) return;

  successAlert.classList.remove("hidden");
  successMessage.textContent = message;

  if (errorAlert) {
    errorAlert.classList.add("hidden");
  }
}

function hideAlerts() {
  if (errorAlert) errorAlert.classList.add("hidden");
  if (successAlert) successAlert.classList.add("hidden");
}

// ===============================
// VALIDATION HELPERS
// ===============================

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

// ===============================
// PASSWORD STRENGTH
// ===============================

function checkPasswordStrength(password) {
  let strength = 0;

  if (password.length >= 6) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  return strength;
}

function updateStrengthUI(strength) {
  const bars = [
    document.getElementById("strength0"),
    document.getElementById("strength1"),
    document.getElementById("strength2"),
    document.getElementById("strength3"),
  ];

  const text = document.getElementById("strengthText");

  if (!bars[0]) return;

  bars.forEach((bar) => {
    bar.className = "flex-1 bg-gray-200 rounded";
  });

  if (strength >= 1) bars[0].classList.add("bg-red-500");
  if (strength >= 2) bars[1].classList.add("bg-yellow-500");
  if (strength >= 3) bars[2].classList.add("bg-blue-500");
  if (strength >= 4) bars[3].classList.add("bg-green-500");

  const labels = ["Very Weak", "Weak", "Good", "Strong"];

  text.textContent =
    strength === 0 ? "Password strength" : labels[strength - 1];
}

// ===============================
// LOGIN
// ===============================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const buttonText = document.getElementById("buttonText");
  const spinner = document.getElementById("spinner");

  function checkLoginInputs() {
    if (loginBtn) {
      loginBtn.disabled = !emailInput?.value.trim() || !passwordInput?.value.trim();
    }
  }

  if (emailInput) emailInput.addEventListener("input", checkLoginInputs);
  if (passwordInput) passwordInput.addEventListener("input", checkLoginInputs);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    hideAlerts();

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    if (!validateEmail(email)) {
      showError("Please enter a valid email.");
      return;
    }

    if (!validatePassword(password)) {
      showError("Password must be at least 6 characters.");
      return;
    }

    if (loginBtn) loginBtn.disabled = true;
    if (buttonText) buttonText.textContent = "Signing In...";
    if (spinner) spinner.classList.remove("hidden");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      // Update profile picture in header before redirecting
      await updateProfilePictureInHeader();

      window.location.href = "home.html";
    } catch (error) {
      console.error("Login error:", error);

      switch (error.message) {
        case "Invalid login credentials":
          showError("Invalid email or password.");
          break;
        case "Email not confirmed":
          showError("Please check your email and click the confirmation link.");
          break;
        default:
          showError(error.message || "Login failed. Please try again.");
      }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
      if (buttonText) buttonText.textContent = "Sign In";
      if (spinner) spinner.classList.add("hidden");
    }
  });
}

// ===============================
// REGISTER
// ===============================

const registerForm = document.getElementById("registerForm");

if (registerForm) {
  const fullnameInput = document.getElementById("fullname");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const termsInput = document.getElementById("terms");
  const signupBtn = document.getElementById("signupBtn");
  const buttonText = document.getElementById("buttonText");
  const spinner = document.getElementById("spinner");

  // ===============================
  // PASSWORD TOGGLE
  // ===============================

  const togglePassword = document.getElementById("togglePassword");

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      togglePassword.textContent = type === "password" ? "👁️" : "🙈";
    });
  }

  // ===============================
  // PASSWORD STRENGTH
  // ===============================

  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      const strength = checkPasswordStrength(passwordInput.value);
      updateStrengthUI(strength);
      checkRegisterInputs();
    });
  }

  // ===============================
  // ENABLE BUTTON
  // ===============================

  function checkRegisterInputs() {
    if (signupBtn) {
      signupBtn.disabled =
        !fullnameInput?.value.trim() ||
        !emailInput?.value.trim() ||
        !passwordInput?.value.trim() ||
        !confirmPasswordInput?.value.trim() ||
        !termsInput?.checked;
    }
  }

  if (fullnameInput) fullnameInput.addEventListener("input", checkRegisterInputs);
  if (emailInput) emailInput.addEventListener("input", checkRegisterInputs);
  if (confirmPasswordInput)
    confirmPasswordInput.addEventListener("input", checkRegisterInputs);
  if (termsInput) termsInput.addEventListener("change", checkRegisterInputs);

  // ===============================
  // REGISTER SUBMIT
  // ===============================

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    hideAlerts();

    const fullname = fullnameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";
    const confirmPassword = confirmPasswordInput?.value.trim() || "";

    if (fullname.length < 2) {
      showError("Full name is too short.");
      return;
    }

    if (!validateEmail(email)) {
      showError("Please enter a valid email.");
      return;
    }

    if (!validatePassword(password)) {
      showError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }

    if (!termsInput?.checked) {
      showError("You must agree to the terms and conditions.");
      return;
    }

    if (signupBtn) signupBtn.disabled = true;
    if (buttonText) buttonText.textContent = "Creating Account...";
    if (spinner) spinner.classList.remove("hidden");

    try {
      // Create user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullname,
          },
        },
      });

      if (authError) throw authError;

      // authData.user can be null in some edge cases
      if (!authData?.user?.id) {
        throw new Error("Account created but user id was not returned by Supabase.");
      }

      const { error: profileError } = await supabase
        .from("users")
        .insert([
          {
            id: authData.user.id, // ✅ correct column
            full_name: fullname,
            email: email,
            role: "user",
            verified: false,
          },
        ]);

      if (profileError) throw profileError;

      showSuccess("Account created successfully! Please check your email to confirm your account.");

      if (registerForm) registerForm.reset();
      updateStrengthUI(0);

      setTimeout(() => {
        window.location.href = "login";
      }, 2000);
    } catch (error) {
      console.error("Registration error:", error);

      switch (error.message) {
        case "User already registered":
          showError("This email is already registered.");
          break;
        case "Password should be at least 6 characters":
          showError("Password must be at least 6 characters.");
          break;
        default:
          showError(error.message || "Registration failed. Please try again.");
      }
    } finally {
      if (signupBtn) signupBtn.disabled = false;
      if (buttonText) buttonText.textContent = "Create Account";
      if (spinner) spinner.classList.add("hidden");
    }
  });
}

// ===============================
// LOGOUT FUNCTIONALITY
// ===============================

const PUBLIC_PAGES = ['login', 'register', 'home', 'browse', 'service', 'contact-us', 'how-it-works', 'privacy-policy', 'terms-of-service'];

function isFilePreview() {
  return window.location.protocol === 'file:';
}

async function updateLogoutVisibility() {
  const logoutElements = document.querySelectorAll('[data-logout], [id^="logoutBtn"]');

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const isLoggedIn = !!sessionData?.session;

    logoutElements.forEach((el) => {
      el.style.display = isLoggedIn ? "" : "none";
    });

    updateAuthLinks(isLoggedIn);
  } catch (error) {
    console.error("Failed to update logout visibility:", error);
  }
}

function isLogoutTarget(element) {
  return element.closest('[data-logout], [id^="logoutBtn"]');
}

document.addEventListener('click', async (event) => {
  const logoutElement = isLogoutTarget(event.target);
  if (!logoutElement) return;

  event.preventDefault();
  await handleLogout();
});

function updateAuthLinks(isLoggedIn) {
  const protectedLinks = document.querySelectorAll(
    'a[href="my-bookings.html"], a[href="my-messages.html"]'
  );
  protectedLinks.forEach((link) => {
    link.style.display = isLoggedIn ? "" : "none";
  });

  const profileIcons = document.querySelectorAll('[data-profile-icon="true"]');
  profileIcons.forEach((icon) => {
    const link = icon.closest('a');
    if (link) {
      if (isLoggedIn) {
        link.href = 'profile.html';
      } else {
        link.href = 'login.html?redirect=profile.html';
      }
    }
  });

  const addServiceLinks = document.querySelectorAll('a[href="add-service.html"]');
  addServiceLinks.forEach((link) => {
    if (isLoggedIn) {
      link.href = 'add-service.html';
    } else {
      link.href = 'login.html?redirect=add-service.html';
    }
  });
}

function ensureCustomerMenuLinks() {
  const commonLinks = [
    { href: 'home.html', label: 'Home' },
    { href: 'my-bookings.html', label: 'My Bookings' },
    { href: 'my-messages.html', label: 'My Messages' },
    { href: 'browse.html#wishlistPanel', label: 'Wishlist' }
  ];

  const nav = document.querySelector('header nav');
  if (nav) {
    commonLinks.forEach((linkInfo) => {
      if (!nav.querySelector(`a[href="${linkInfo.href}"]`)) {
        const link = document.createElement('a');
        link.href = linkInfo.href;
        link.className = 'font-semibold text-black-600';
        link.textContent = linkInfo.label;
        nav.appendChild(link);
      }
    });
  }

  const sideMenuList = document.querySelector('#sideMenu .p-4');
  if (sideMenuList) {
    commonLinks.forEach((linkInfo) => {
      if (!sideMenuList.querySelector(`a[href="${linkInfo.href}"]`)) {
        const link = document.createElement('a');
        link.href = linkInfo.href;
        link.className = 'block font-semibold text-black-800';
        link.textContent = linkInfo.label;
        const logoutBtnSideMenu = sideMenuList.querySelector('#logoutBtnSideMenu');
        if (logoutBtnSideMenu) {
          logoutBtnSideMenu.insertAdjacentElement('beforebegin', link);
        } else {
          sideMenuList.appendChild(link);
        }
      }
    });
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    window.location.href = "home.html";
  } catch (error) {
    console.error("Logout error:", error);
    showError("Logout failed. Please try again.");
  }
}
 
// Logout buttons are handled globally via click delegation.

document.addEventListener("DOMContentLoaded", async () => {
  await updateLogoutVisibility();
  await redirectIfNotOnPublicPage();
});

// ===============================
// GLOBAL AUTH STATE LISTENER
// ===============================
// Redirect to login if session is lost or user logs out

async function redirectIfNotOnPublicPage() {
  if (isFilePreview()) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session;
  const currentPage = window.location.pathname;
  const isPublicPage = PUBLIC_PAGES.some(page => currentPage.includes(page));

  if (!hasSession && !isPublicPage) {
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPage.replace(/^\//, ''))}`;
  }
}

supabase.auth.onAuthStateChange(async (event, session) => {
  await updateLogoutVisibility();

  if (isFilePreview()) return;

  // If session is null and we're not already on public pages, redirect to login
  if (!session) {
    const currentPage = window.location.pathname;
    const isFullyPublicPage = PUBLIC_PAGES.some(page => currentPage.includes(page));

    if (!isFullyPublicPage) {
      window.location.href = `login.html?redirect=${encodeURIComponent(currentPage.replace(/^\//, ''))}`;
    }
  }
});

// ===============================
// GLOBAL CLICK PROTECTION
// ===============================
// After logout, any clicks redirect to login (except on fully public pages and info pages)

document.addEventListener('click', async (e) => {
  if (isFilePreview()) return;

  // Get current session
  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session;

  // Check if user is on a public page
  const currentPage = window.location.pathname;
  const isPublicPage = PUBLIC_PAGES.some(page => currentPage.includes(page));

  // Check if clicked element is a link to an info page
  const clickedElement = e.target.closest('a'); 
  if (clickedElement && clickedElement.href) {
    const href = clickedElement.href.toLowerCase();
    const infoPages = ['how-it-works.html', 'privacy-policy.html', 'terms-of-service.html'];
    const isInfoPageLink = infoPages.some(page => href.includes(page));
    
    if (isInfoPageLink) {
      // Allow navigation to info pages
      return;
    }
  }

  // If no session and not on public page, redirect to login on any click
  if (!hasSession && !isPublicPage) {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = 'login.html';
  }
}, true);

// ===============================
// EXPORT
// ===============================

// Update profile picture in header
export async function updateProfilePictureInHeader() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user?.id) return;

    let userProfile = null;
    let profileError = null;

    const { data: profileData, error: profileFetchError } = await supabase
      .from("profiles")
      .select("profile_picture, full_name")
      .eq("id", sessionData.session.user.id)
      .single();

    if (!profileFetchError && profileData) {
      userProfile = profileData;
    } else {
      const { data: userData, error: userFetchError } = await supabase
        .from("users")
        .select("profile_picture, full_name")
        .eq("id", sessionData.session.user.id)
        .single();

      if (!userFetchError && userData) {
        userProfile = userData;
      } else {
        profileError = profileFetchError || userFetchError;
      }
    }

    if (profileError) {
      console.error("Failed to fetch header profile:", profileError);
    }

    const displayName =
      userProfile?.full_name ||
      sessionData.session.user.user_metadata?.full_name ||
      sessionData.session.user.email ||
      'User';

    const avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&rounded=true`;
    const profileSrc = userProfile?.profile_picture || avatarSrc;

    const profileIcons = document.querySelectorAll('[data-profile-icon="true"]');
    profileIcons.forEach(icon => {
      icon.innerHTML = `<img src="${profileSrc}" class="w-full h-full rounded-full object-cover" alt="Profile" />`;
      icon.classList.remove('bg-gray-300');
    });
  } catch (error) {
    console.error("Failed to update profile picture:", error);
  }
}

// Export for use in other files
export { supabase };

// Ensure header icons are updated across pages when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await updateProfilePictureInHeader();
  } catch (err) {
    console.error("auto updateProfilePictureInHeader failed:", err);
  }
});