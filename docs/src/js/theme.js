// @ts-check
const KEY = "dwkitDocsTheme";

function preferred() {
  return localStorage.getItem(KEY) ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** @param {string} theme */
function apply(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme !== "dark");
}

apply(preferred());

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(KEY, next);
  apply(next);
});

const sidebarToggle = document.getElementById("sidebar-toggle");
sidebarToggle?.addEventListener("click", () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const open = sidebar.classList.toggle("open");
  sidebarToggle.setAttribute("aria-expanded", String(open));
});
