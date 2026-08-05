import { ipcRenderer } from "electron";

const PLUGIN_HOST_INVOKE = "plugins:host-invoke";

const pluginId = argument("--canvastty-plugin-id=");
const contributionId = argument("--canvastty-contribution-id=");

window.addEventListener("message", (event) => {
  if (event.source !== window || !isRecord(event.data) || event.data.source !== "canvastty-plugin") return;
  const message = event.data;
  if (message.type === "ready") {
    void invokeHost("host.getContext", {}).then((value) => {
      window.postMessage({ source: "canvastty-host", type: "context", value }, "*");
    });
    return;
  }
  if (
    message.type !== "request"
    || typeof message.requestId !== "string"
    || typeof message.method !== "string"
  ) return;

  void invokeHost(message.method, isRecord(message.params) ? message.params : {})
    .then((value) => {
      window.postMessage({
        source: "canvastty-host",
        type: "response",
        requestId: message.requestId,
        ok: true,
        value
      }, "*");
    })
    .catch((error: unknown) => {
      window.postMessage({
        source: "canvastty-host",
        type: "response",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 240) : "Plugin request failed."
      }, "*");
    });
});

function invokeHost(method: string, params: Record<string, unknown>): Promise<unknown> {
  return ipcRenderer.invoke(PLUGIN_HOST_INVOKE, pluginId, contributionId, method, params);
}

function argument(prefix: string): string {
  const value = process.argv.find((candidate) => candidate.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error("CanvasTTY plugin window identity is missing.");
  return decodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
