const host = window.CanvasTTYPlugin;
const heading = document.querySelector("#heading");
const detail = document.querySelector("#detail");
const codex = document.querySelector("#codex");

host.onContext(async (context) => {
  const locale = context.appearance.locale;
  document.documentElement.dataset.palette = context.appearance.palette;
  heading.textContent = locale === "ru" ? "Отдельное sandboxed окно" : "Separate sandboxed window";
  codex.textContent = locale === "ru" ? "Открыть launcher Codex" : "Open Codex launcher";
  try {
    const sessions = await host.request("sessions.list");
    detail.textContent = locale === "ru"
      ? `Реальных сессий CanvasTTY: ${sessions.length}`
      : `Real CanvasTTY sessions: ${sessions.length}`;
  } catch (error) {
    detail.textContent = error instanceof Error ? error.message : "Session state unavailable";
  }
});

codex.addEventListener("click", () => host.request("launcher.open", { provider: "codex" }));
