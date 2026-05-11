export function safeQuery(selector) {
  return document.querySelector(selector);
}

export function safeQueryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}