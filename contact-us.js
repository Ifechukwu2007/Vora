// contact-us.js
import { supabase } from "./supabase.js";

// If your auth.js already loads supabase auth, you can still rely on this.
// This script:
/// 1) validates inputs
/// 2) reads logged-in user (optional)
/// 3) inserts the message into a Supabase table `contact_messages`
/// 4) shows success/error UI feedback

const form = document.getElementById("contactForm");

if (!form) {
  console.warn("contactForm not found");
} else {
  form.addEventListener("submit", onSubmit);
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return (el?.value ?? "").trim();
}

function setStatus(message, kind = "info") {
  let host = document.getElementById("contactFormStatus");
  if (!host) {
    host = document.createElement("div");
    host.id = "contactFormStatus";
    host.className = "mt-4 text-sm text-center";
    form.appendChild(host);
  }

  const base = "mt-4 text-sm text-center";
  if (kind === "success") {
    host.className = base + " text-green-700";
  } else if (kind === "error") {
    host.className = base + " text-red-700";
  } else {
    host.className = base + " text-gray-700";
  }

  host.textContent = message;
}

async function onSubmit(e) {
  e.preventDefault();

  const name = getInputValue("name");
  const email = getInputValue("email");
  const subject = getInputValue("subject");
  const category = getInputValue("category");
  const message = getInputValue("message");

  if (!name || name.length < 2) return setStatus("Please enter your name.", "error");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return setStatus("Please enter a valid email.", "error");
  if (!subject) return setStatus("Please enter a subject.", "error");
  if (!category) return setStatus("Please select a category.", "error");
  if (!message || message.length < 10) return setStatus("Message must be at least 10 characters.", "error");

  // Disable button while submitting
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent ?? "Send Message";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
  }
  setStatus("Sending your message…", "info");

  try {
    // Optional: grab user id if logged in
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    const user = sessionData?.session?.user ?? null;
    const userId = user?.id ?? null;

    // Insert into Supabase table: contact_messages
    // ✅ You MUST have a table called `contact_messages` with compatible columns.
    // Recommended columns:
    // - id uuid / bigserial (any PK)
    // - name text
    // - email text
    // - subject text
    // - category text
    // - message text
    // - user_id uuid nullable
    // - created_at timestamptz default now()
    const payload = {
      name,
      email,
      subject,
      category,
      message,
      user_id: userId,
    };

    const { error: insertError } = await supabase.from("contact_messages").insert(payload);

    if (insertError) throw insertError;

    setStatus("Thanks! Your message was sent successfully. We’ll get back to you soon.", "success");
    form.reset();
  } catch (err) {
    console.error(err);
    setStatus(err?.message || "Failed to send message. Please try again.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

// Make details elements behave like an accordion (your existing inline script)
// (kept here so you can remove the inline script if you want)
document.querySelectorAll("details").forEach((detail) => {
  detail.addEventListener("click", function () {
    document.querySelectorAll("details").forEach((d) => {
      if (d !== detail) d.open = false;
    });
  });
});