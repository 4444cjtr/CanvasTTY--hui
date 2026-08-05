const host = window.CanvasTTYPlugin;
const note = document.querySelector("#note");
const heading = document.querySelector("#heading");
const status = document.querySelector("#status");
const terminal = document.querySelector("#terminal");
const focus = document.querySelector("#focus");
let saveTimer = null;
let locale = "en";

host.onContext((context) => {
  locale = context.appearance.locale;
  document.documentElement.dataset.palette = context.appearance.palette;
  heading.textContent = locale === "ru" ? "Локальная заметка" : "Local note";
  terminal.textContent = locale === "ru" ? "Открыть терминал" : "Open terminal";
  focus.textContent = locale === "ru" ? "Открыть Focus" : "Open focus window";
});

void host.storage.get("note").then((saved) => {
  note.value = saved && typeof saved.text === "string" ? saved.text : "";
  status.textContent = locale === "ru" ? "Загружено" : "Loaded";
}).catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Storage unavailable";
});

note.addEventListener("input", () => {
  status.textContent = locale === "ru" ? "Сохраняем…" : "Saving…";
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await host.storage.set("note", { text: note.value });
      status.textContent = locale === "ru" ? "Сохранено" : "Saved";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Save failed";
    }
  }, 300);
});

terminal.addEventListener("click", () => host.request("launcher.open", { provider: "terminal" }));
focus.addEventListener("click", () => host.request("window.open", { contributionId: "focus" }));
