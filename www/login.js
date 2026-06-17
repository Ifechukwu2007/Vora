import { supabase } from './supabase.js';

// ===============================
// CHECK SESSION - REDIRECT IF LOGGED IN
// ===============================

const { data: { session } } = await supabase.auth.getSession();

if (session) {
  // User is already logged in, redirect to home
  window.location.href = 'home.html';
}

// ===============================
// DOM ELEMENTS
// ===============================
 
const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const loginBtn = document.getElementById("loginBtn");

const buttonText = document.getElementById("buttonText");
const spinner = document.getElementById("spinner");

const errorAlert = document.getElementById("errorAlert");
const errorMessage = document.getElementById("errorMessage"); 

const successAlert = document.getElementById("successAlert");
const successMessage = document.getElementById("successMessage");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

const togglePassword = document.getElementById("togglePassword");

// ===============================
// PASSWORD TOGGLE
// ===============================

togglePassword.addEventListener("click", () => {
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    togglePassword.innerHTML = "🙈";
  } else {
    passwordInput.type = "password";
    togglePassword.innerHTML = "👁️";
  }
});

// ===============================
// VALIDATION
// ===============================

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm() {
  let valid = true;

  // Reset
  emailError.classList.add("hidden");
  passwordError.classList.add("hidden");

  // Email Validation
  if (!emailInput.value.trim()) {
    emailError.textContent = "Email is required";
    emailError.classList.remove("hidden");
    valid = false;
  } else if (!validateEmail(emailInput.value.trim())) {
    emailError.textContent = "Please enter a valid email";
    emailError.classList.remove("hidden");
    valid = false;
  }

  // Password Validation
  if (!passwordInput.value.trim()) {
    passwordError.textContent = "Password is required";
    passwordError.classList.remove("hidden");
    valid = false;
  } else if (passwordInput.value.length < 6) {
    passwordError.textContent =
      "Password must be at least 6 characters";
    passwordError.classList.remove("hidden");
    valid = false;
  }

  return valid;
}

// ===============================
// ALERT HELPERS
// ===============================

function showError(message) {
  successAlert.classList.add("hidden");

  errorMessage.textContent = message;
  errorAlert.classList.remove("hidden");
}

function showSuccess(message) {
  errorAlert.classList.add("hidden");

  successMessage.textContent = message;
  successAlert.classList.remove("hidden");
}

function setLoading(isLoading) {
  if (isLoading) {
    loginBtn.disabled = true;

    spinner.classList.remove("hidden");

    buttonText.textContent = "Signing in...";
  } else {
    loginBtn.disabled = false;

    spinner.classList.add("hidden");

    buttonText.textContent = "Sign In";
  }
}

// ===============================
// ENABLE BUTTON WHEN INPUT FILLED
// ===============================

function checkInputs() {
  if (
    emailInput.value.trim() !== "" &&
    passwordInput.value.trim() !== ""
  ) {
    loginBtn.disabled = false;
  } else {
    loginBtn.disabled = true;
  }
}

emailInput.addEventListener("input", checkInputs);
passwordInput.addEventListener("input", checkInputs);

// ===============================
// LOGIN
// ===============================

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  errorAlert.classList.add("hidden");
  successAlert.classList.add("hidden");

  // Validate
  if (!validateForm()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    setLoading(true);

    // LOGIN USER
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    // SUCCESS
    showSuccess("Login successful! Redirecting...");

    console.log("Logged in user:", data.user);

    // REDIRECT TO HOME PAGE IMMEDIATELY
    window.location.href = "home.html";

  } catch (error) {
    console.error(error);

    // Handle Errors 
    if (error.message.includes("Invalid login credentials")) {
      showError("Incorrect email or password");
    } else if (
      error.message.includes("Email not confirmed")
    ) {
      showError(
        "Please verify your email before logging in"
      );
    } else {
      showError(error.message);
    }
  } finally {
    setLoading(false);
  }
});