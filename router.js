import { LoadingSpinner } from './loading-utils.js';

export function initializeRouter() {
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      const routes = {
        browse: "browse.html",
        message: "my-messages.html",
        provider: "add-service.html"
      };

      if (routes[action]) {
        LoadingSpinner.navigateTo(routes[action]);
      } else {
        console.log("Unknown action:", action);
      }
    });
  });
}