// ===============================
// SUPABASE AUTH FOR VORA
// ===============================

import { supabase } from "./supabase.js";

// ===============================
// CHECK SESSION - REDIRECT IF LOGGED IN
// ===============================

const { data: { session } } = await supabase.auth.getSession();

if (session) {
  // User is already logged in, redirect to home
  window.location.href = 'home.html';
}

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
    document.getElementById("strength3")
  ];

  const text = document.getElementById("strengthText");

  if (!bars[0]) return;

  bars.forEach((bar) => {
    bar.className = "flex-1 bg-gray-200 rounded";
  });

  if (strength >= 1) {
    bars[0].classList.add("bg-red-500");
  }

  if (strength >= 2) {
    bars[1].classList.add("bg-yellow-500");
  }

  if (strength >= 3) {
    bars[2].classList.add("bg-blue-500");
  }

  if (strength >= 4) {
    bars[3].classList.add("bg-green-500");
  }

  const labels = [
    "Very Weak",
    "Weak",
    "Good",
    "Strong"
  ];

  text.textContent =
    strength === 0
      ? "Password strength"
      : labels[strength - 1];
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
      loginBtn.disabled =
        !emailInput?.value.trim() ||
        !passwordInput?.value.trim();
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

      showSuccess("Login successful!");

      setTimeout(() => {
        window.location.href = "home.html";
      }, 1500);

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
  const phoneInput = document.getElementById("phone");
  const locationInput = document.getElementById("location");
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
        !phoneInput?.value.trim() ||
        !locationInput?.value.trim() ||
        !passwordInput?.value.trim() ||
        !confirmPasswordInput?.value.trim() ||
        !termsInput?.checked;
    }
  }

  if (fullnameInput) fullnameInput.addEventListener("input", checkRegisterInputs);
  if (emailInput) emailInput.addEventListener("input", checkRegisterInputs);
  if (phoneInput) phoneInput.addEventListener("input", checkRegisterInputs);
  if (locationInput) locationInput.addEventListener("input", checkRegisterInputs);
  if (confirmPasswordInput) confirmPasswordInput.addEventListener("input", checkRegisterInputs);
  if (termsInput) termsInput.addEventListener("change", checkRegisterInputs);

  // ===============================
  // REGISTER SUBMIT
  // ===============================

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    hideAlerts();

    const fullname = fullnameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    const location = locationInput?.value.trim() || "";
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

    if (!phone || phone.length < 5) {
      showError("Please enter a valid phone number.");
      return;
    }

    if (!location || location.length < 2) {
      showError("Please enter your location.");
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
          }
        }
      });

      if (authError) throw authError;

      // Create user profile in users table
      const { error: userError } = await supabase
        .from('users')
        .insert([{
          uid: authData.user.id,
          full_name: fullname,
          email: email,
          phone: phone,
          location: location,
          role: 'user',
          verified: false
        }]);

      if (userError) throw userError;

      // Create user profile in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email: email,
          full_name: fullname,
          phone: phone,
          location: location,
          profile_picture: null
        }]);

      if (profileError) throw profileError;

      showSuccess("Account created successfully! Redirecting...");

      if (registerForm) registerForm.reset();
      updateStrengthUI(0);

      setTimeout(() => {
        window.location.href = "profile.html";
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

const logoutBtn = document.getElementById("logoutBtn");
const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    window.location.href = "index.html";
  } catch (error) {
    console.error("Logout error:", error);
    showError("Logout failed. Please try again.");
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", handleLogout);
}

if (logoutBtnSideMenu) {
  logoutBtnSideMenu.addEventListener("click", handleLogout);
}

// ===============================
// EXPORT
// ===============================

// Export for use in other files
export { supabase };