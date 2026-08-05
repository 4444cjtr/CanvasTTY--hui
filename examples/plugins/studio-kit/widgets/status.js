const host = window.CanvasTTYPlugin;
const heading = document.querySelector("#heading");
const value = document.querySelector("#value");
const detail = document.querySelector("#detail");
const surface = document.querySelector(".status-widget");
let locale = "en";

host.onContext((context) => {
  locale = context.appearance.locale;
  document.documentElement.dataset.palette = context.appearance.palette;
  heading.textContent = locale === "ru" ? "Сессии" : "Sessions";
  void refresh();
});

async function refresh() {
  try {
    const sessions = await host.request("sessions.list");
    const attention = sessions.filter((session) => session.status === "needs_approval" || session.status === "failed").length;
    value.textContent = String(sessions.length);
    detail.textContent = attention > 0
      ? locale === "ru" ? `Требуют внимания: ${attention}` : `Need attention: ${attention}`
      : locale === "ru" ? "Нет сессий, требующих внимания" : "No sessions need attention";
    surface.dataset.attention = attention > 0 ? "true" : "false";
  } catch (error) {
    value.textContent = "—";
    detail.textContent = error instanceof Error ? error.message : "Session state unavailable";
  }
}
