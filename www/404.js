// ================================
// 404.js
// ================================

document.addEventListener("DOMContentLoaded", () => {

    // =========================
    // ELEMENTS
    // =========================
    const sideMenu = document.getElementById("sideMenu");
    const closeMenu = document.getElementById("closeMenu");
    const menuOverlay = document.getElementById("menuOverlay");

    // =========================
    // CLOSE MENU
    // =========================
    function closeSideMenu() {

        if (!sideMenu) return;

        sideMenu.classList.add("-translate-x-full");

        if (menuOverlay) {
            menuOverlay.classList.add("hidden");
        }
    }

    // =========================
    // OPEN MENU
    // =========================
    function openSideMenu() {

        if (!sideMenu) return;

        sideMenu.classList.remove("-translate-x-full");

        if (menuOverlay) {
            menuOverlay.classList.remove("hidden");
        }
    }

    // =========================
    // EVENT LISTENERS
    // =========================
    closeMenu?.addEventListener(
        "click",
        closeSideMenu
    );

    menuOverlay?.addEventListener(
        "click",
        closeSideMenu
    );

    // =========================
    // TRACK PAGE VISIT
    // =========================
    console.log("404 Page Viewed");

    console.log(
        "Missing URL:",
        window.location.href
    );

    // =========================
    // COUNTDOWN MESSAGE
    // =========================
    const countdownEl =
        document.createElement("p");

    countdownEl.className =
        "text-gray-500 mt-6 text-sm";

    const container =
        document.querySelector("main .text-center");

    container?.appendChild(countdownEl);

    let seconds = 15;

    countdownEl.textContent =
        `Redirecting to Home in ${seconds} seconds...`;

    const countdown = setInterval(() => {

        seconds--;

        countdownEl.textContent =
            `Redirecting to Home in ${seconds} seconds...`;

        if (seconds <= 0) {

            clearInterval(countdown);

            window.location.href =
                "index.html";
        }

    }, 1000);

    // =========================
    // ESC KEY CLOSES MENU
    // =========================
    document.addEventListener(
        "keydown",
        (e) => {

            if (e.key === "Escape") {
                closeSideMenu();
            }
        }
    );

    // =========================
    // PREVENT BROKEN LINKS LOOP
    // =========================
    if (
        window.location.pathname.includes(
            "404"
        )
    ) {
        console.log(
            "User landed on 404 page."
        );
    }

});