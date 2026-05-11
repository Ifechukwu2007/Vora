// ===============================
// FIREBASE AUTH FOR VORA
// ===============================

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { app } from "./firebase-config.js";

// ===============================
// FIREBASE SETUP
// ===============================

const auth = getAuth(app);
const db = getFirestore(app);

// Ensure users stay logged in across browser sessions
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    // Persistence is set to local, users will stay logged in
  })
  .catch((error) => {
    // Handle errors here
    console.error("Persistence error:", error);
  });

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
    loginBtn.disabled =
      !emailInput.value.trim() ||
      !passwordInput.value.trim();
  }

  emailInput.addEventListener("input", checkLoginInputs);
  passwordInput.addEventListener("input", checkLoginInputs);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    hideAlerts();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!validateEmail(email)) {
      showError("Please enter a valid email.");
      return;
    }

    if (!validatePassword(password)) {
      showError("Password must be at least 6 characters.");
      return;
    }

    loginBtn.disabled = true;
    buttonText.textContent = "Signing In...";
    spinner.classList.remove("hidden");

    try {
      await signInWithEmailAndPassword(auth, email, password);

      showSuccess("Login successful!");

      setTimeout(() => {
        window.location.href = "home.html";
      }, 1500);

    } catch (error) {
      console.error(error);

      switch (error.code) {
        case "auth/user-not-found":
          showError("User not found.");
          break;

        case "auth/wrong-password":
          showError("Incorrect password.");
          break;

        case "auth/invalid-credential":
          showError("Invalid email or password.");
          break;

        default:
          showError(error.message);
      }

    } finally {
      loginBtn.disabled = false;
      buttonText.textContent = "Sign In";
      spinner.classList.add("hidden");
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
  const confirmPasswordInput =
    document.getElementById("confirmPassword");

  const termsInput = document.getElementById("terms");

  const signupBtn = document.getElementById("signupBtn");

  const buttonText = document.getElementById("buttonText");
  const spinner = document.getElementById("spinner");

  // ===============================
  // PASSWORD TOGGLE
  // ===============================

  const togglePassword =
    document.getElementById("togglePassword");

  if (togglePassword) {
    togglePassword.addEventListener("click", () => {
      const type =
        passwordInput.type === "password"
          ? "text"
          : "password";

      passwordInput.type = type;

      togglePassword.textContent =
        type === "password" ? "👁️" : "🙈";
    });
  }

  // ===============================
  // PASSWORD STRENGTH
  // ===============================

  passwordInput.addEventListener("input", () => {
    const strength = checkPasswordStrength(
      passwordInput.value
    );

    updateStrengthUI(strength);

    checkRegisterInputs();
  });

  // ===============================
  // ENABLE BUTTON
  // ===============================

  function checkRegisterInputs() {
    signupBtn.disabled =
      !fullnameInput.value.trim() ||
      !emailInput.value.trim() ||
      !passwordInput.value.trim() ||
      !confirmPasswordInput.value.trim() ||
      !termsInput.checked;
  }

  fullnameInput.addEventListener(
    "input",
    checkRegisterInputs
  );

  emailInput.addEventListener(
    "input",
    checkRegisterInputs
  );

  confirmPasswordInput.addEventListener(
    "input",
    checkRegisterInputs
  );

  termsInput.addEventListener(
    "change",
    checkRegisterInputs
  );

  // ===============================
  // REGISTER SUBMIT
  // ===============================

  registerForm.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      hideAlerts();

      const fullname = fullnameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const confirmPassword =
        confirmPasswordInput.value.trim();

      if (fullname.length < 2) {
        showError("Full name is too short.");
        return;
      }

      if (!validateEmail(email)) {
        showError("Please enter a valid email.");
        return;
      }

      if (!validatePassword(password)) {
        showError(
          "Password must be at least 6 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        showError("Passwords do not match.");
        return;
      }

      if (!termsInput.checked) {
        showError(
          "You must agree to the terms and conditions."
        );
        return;
      }

      signupBtn.disabled = true;
      buttonText.textContent =
        "Creating Account...";
      spinner.classList.remove("hidden");

      try {
        // CREATE USER
        const userCredential =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );

        const user = userCredential.user;

        // UPDATE PROFILE
        await updateProfile(user, {
          displayName: fullname
        });

        // SAVE USER TO FIRESTORE
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          fullname,
          email,
          createdAt: serverTimestamp(),
          role: "user",
          verified: false
        });

        showSuccess(
          "Account created successfully!"
        );

        registerForm.reset();

        updateStrengthUI(0);

        setTimeout(() => {
          window.location.href =
            "home.html";
        }, 2000);

      } catch (error) {
        console.error(error);

        switch (error.code) {
          case "auth/email-already-in-use":
            showError(
              "This email is already registered."
            );
            break;

          case "auth/weak-password":
            showError(
              "Password is too weak."
            );
            break;

          default:
            showError(error.message);
        }

      } finally {
        signupBtn.disabled = false;
        buttonText.textContent =
          "Create Account";

        spinner.classList.add("hidden");
      }
    }
  );
}

// ===============================
// LOGIN PASSWORD TOGGLE
// ===============================

const loginToggle =
  document.getElementById("togglePassword");

const loginPassword =
  document.getElementById("password");

if (
  loginToggle &&
  loginPassword &&
  document.getElementById("loginForm")
) {
  loginToggle.addEventListener("click", () => {
    const type =
      loginPassword.type === "password"
        ? "text"
        : "password";

    loginPassword.type = type;

    loginToggle.textContent =
      type === "password" ? "👁️" : "🙈";
  });
}