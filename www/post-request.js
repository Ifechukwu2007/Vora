import { supabase } from "./supabase.js";
import { LoadingSpinner } from "./loading-utils.js";

document.addEventListener("DOMContentLoaded", async () => {

    // =========================
    // FORM
    // =========================
    const form = document.getElementById("post-request-form");

    const serviceTypeInput = document.getElementById("service-type");
    const descriptionInput = document.getElementById("request-description");
    const budgetInput = document.getElementById("budget");
    const locationInput = document.getElementById("location");
    const dateNeededInput = document.getElementById("date-needed");
    const timeNeededInput = document.getElementById("time-needed");
    const fullNameInput = document.getElementById("full-name");
    const phoneInput = document.getElementById("phone");

    if (!form) {
        console.error("Post request form not found");
        return;
    }

    const submitBtn = document.getElementById("submitBtn") || form.querySelector("button[type='submit']");
    const cancelBtn = document.getElementById("cancelBtn");
    const backBtn = document.getElementById("backBtn");

    if (!serviceTypeInput || !descriptionInput || !budgetInput || !locationInput || !dateNeededInput || !timeNeededInput || !fullNameInput || !phoneInput || !submitBtn || !cancelBtn || !backBtn) {
        console.error("Missing one or more form elements in post-request.js", {
            serviceTypeInput,
            descriptionInput,
            budgetInput,
            locationInput,
            dateNeededInput,
            timeNeededInput,
            fullNameInput,
            phoneInput,
            submitBtn,
            cancelBtn,
            backBtn
        });
        return;
    }

    // =========================
    // CHECK USER
    // =========================
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        LoadingSpinner.navigateTo("login.html");
        return;
    }

    const currentUser = session.user;

    // =========================
    // BUTTON HANDLERS
    // =========================
    backBtn.addEventListener("click", () => {
        window.history.back();
    });

    cancelBtn.addEventListener("click", () => {
        window.history.back();
    });

    // =========================
    // AUTO GET LOCATION
    // =========================
    if (navigator.geolocation) {

        navigator.geolocation.getCurrentPosition(
            async (position) => {

                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                console.log("Lat:", latitude);
                console.log("Lng:", longitude);

                // Save coordinates temporarily
                locationInput.dataset.latitude = latitude;
                locationInput.dataset.longitude = longitude;

            },
            (error) => {
                console.log("Location permission denied");
            }
        );

    }

    // =========================
    // SUBMIT REQUEST
    // =========================
    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        try {

            submitBtn.disabled = true;
            submitBtn.innerHTML = "Posting Request...";

            // =========================
            // GET VALUES
            // =========================
            const serviceType = serviceTypeInput.value.trim();
            const description = descriptionInput.value.trim();
            const budget = budgetInput.value.trim();
            const location = locationInput.value.trim();
            const dateNeeded = dateNeededInput.value.trim();
            const timeNeeded = timeNeededInput.value.trim();
            const fullName = fullNameInput.value.trim();
            const phone = phoneInput.value.trim();

            // =========================
            // VALIDATION
            // =========================
            if (!serviceType) {
                alert("Please select a service type");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            if (!description) {
                alert("Please enter a description");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            if (!location) {
                alert("Please enter your location");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            if (!dateNeeded) {
                alert("Please select a date needed");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            if (!fullName) {
                alert("Please enter your full name");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            if (!phone) {
                alert("Please enter your phone number");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Post Request";
                return;
            }

            // =========================
            // INSERT REQUEST
            // =========================
            const payload = {

                // USER
                user_id: currentUser.id,
                user_email: currentUser.email,

                // REQUEST
                title: serviceType,
                description: description,
                category: serviceType,
                budget: budget ? Number(budget) : null,

                // LOCATION
                location: location,
                latitude: locationInput.dataset.latitude || null,
                longitude: locationInput.dataset.longitude || null,

                // STATUS
                status: "open",

                // TIME
                created_at: new Date().toISOString()

            };

            console.log("Saving payload:", payload);

            const { data, error } = await supabase
                .from("requests")
                .insert([payload])
                .select();

            if (error) {
                console.error(error);
                alert(error.message);
                return;
            }

            console.log("Request created:", data);

            // =========================
            // SUCCESS
            // =========================
            alert("Request posted successfully!");

            form.reset();

            LoadingSpinner.navigateTo("my-requests.html");

        } catch (error) {

            console.error(error);
            alert(error?.message || "Something went wrong");

        } finally {

            submitBtn.disabled = false;
            submitBtn.innerHTML = "Post Request";

        } 

    });

});