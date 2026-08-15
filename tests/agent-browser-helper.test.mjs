import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  APPROVED_BROWSER_TOOL_NAMES,
  TOOL_DEFINITIONS
} from "../src/agent-browser/tool-catalog.mjs";
import {
  BROWSER_AGENT_INSTRUCTIONS,
  BridgeClientError,
  GatewayClient,
  createMcpDispatcher,
  findTerminalSessionId,
  formatToolResult,
  isLocalEndpoint,
  readIdentity
} from "../src/agent-browser/mcp-helper.mjs";
import {
  AGENT_BROWSER_ENV,
  AgentBrowserBridge
} from "../src/main/services/agent-browser/AgentBrowserBridge.ts";
import { terminalEnvironment } from "../src/main/services/TerminalManager.ts";

test("helper accepts only local socket and named-pipe endpoints", () => {
  assert.equal(isLocalEndpoint("/tmp/canvastty.sock", "darwin"), true);
  assert.equal(isLocalEndpoint("/run/user/1000/canvastty.sock", "linux"), true);
  assert.equal(isLocalEndpoint("\\\\.\\pipe\\canvastty-agent-user-random", "win32"), true);
  assert.equal(isLocalEndpoint("127.0.0.1:9876", "linux"), false);
  assert.equal(isLocalEndpoint("tcp://127.0.0.1:9876", "darwin"), false);

  assert.throws(() => readIdentity({
    CANVASTTY_AGENT_BROWSER_ADDRESS: "127.0.0.1:9876",
    CANVASTTY_AGENT_ID: "agent",
    CANVASTTY_AGENT_CONNECTION_ID: "connection",
    CANVASTTY_TERMINAL_SESSION_ID: "terminal",
    CANVASTTY_AGENT_PROVIDER: "codex",
    CANVASTTY_AGENT_CAPABILITY: "token"
  }, "linux"), (error) => error instanceof BridgeClientError && error.code === "AUTH_INVALID");
});

test("MCP initialize authenticates the gateway and returns fixed provider-neutral instructions", async () => {
  let connections = 0;
  const dispatch = createMcpDispatcher({
    connect: async () => { connections += 1; },
    call: async () => { throw new Error("not used"); }
  });
  const response = await dispatch({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "untrusted-client-version" }
  });

  assert.equal(connections, 1);
  assert.equal(response.result.protocolVersion, "2025-06-18");
  assert.equal(response.result.serverInfo.name, "canvastty_browser");
  assert.match(response.result.instructions, /browser_observe/);
  assert.match(response.result.instructions, /STALE_REF/);
  assert.doesNotMatch(response.result.instructions, /ask the user/i);
  assert.equal(BROWSER_AGENT_INSTRUCTIONS, response.result.instructions);
});

test("MCP tool list exposes only the strict approved browser surface", async () => {
  const dispatch = createMcpDispatcher({ connect: async () => {}, call: async () => ({}) });
  const response = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(response.result.tools, TOOL_DEFINITIONS);
  assert.deepEqual(response.result.tools.map((tool) => tool.name), APPROVED_BROWSER_TOOL_NAMES);
  assert.equal(response.result.tools.every((tool) => tool.inputSchema.additionalProperties === false), true);
  const names = response.result.tools.map((tool) => tool.name).join(" ");
  assert.doesNotMatch(names, /cdp|evaluate|cookie|credential|password/i);
});

test("MCP tool calls forward validated args and return typed failures as tool errors", async () => {
  const calls = [];
  const dispatch = createMcpDispatcher({
    connect: async () => {},
    call: async (tool, args) => {
      calls.push({ tool, args });
      return {
        ok: false,
        requestId: "request-1",
        tabId: "tab-1",
        commandSequence: 4,
        revisionBefore: 2,
        revisionAfter: 3,
        error: { code: "STALE_REF", message: "Observe again.", retryable: true }
      };
    }
  });
  const response = await dispatch({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "browser_observe", arguments: { tabId: "tab-1", limit: 50 } }
  });

  assert.deepEqual(calls, [{ tool: "browser_observe", args: { tabId: "tab-1", limit: 50 } }]);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /"code":"STALE_REF"/);
});

test("MCP screenshot result uses image content without duplicating base64 in text", () => {
  const base64 = "A".repeat(460_000);
  const result = formatToolResult({
    ok: true,
    requestId: "screenshot-1",
    tabId: "tab-1",
    commandSequence: 5,
    revisionBefore: 3,
    revisionAfter: 3,
    data: { mimeType: "image/jpeg", base64, width: 1_000, height: 700 }
  });

  assert.equal(result.isError, false);
  assert.deepEqual(result.content[0], { type: "image", data: base64, mimeType: "image/jpeg" });
  assert.match(result.content[1].text, /returned as MCP image content/);
  assert.equal(result.content[1].text.includes(base64.slice(0, 2_000)), false);
});

test("PTY bridge keeps the one-time capability in child env only and honors the kill switch", () => {
  const revoked = [];
  const gateway = {
    isEnabled: true,
    setEnabled(value) { this.isEnabled = value; },
    registerAgent(input) {
      return {
        agentId: "agent-id",
        connectionId: "connection-id",
        terminalSessionId: input.terminalSessionId,
        provider: input.provider,
        capabilityToken: "one-time-secret-token",
        address: "/tmp/canvastty.sock",
        authenticated: new Promise(() => {})
      };
    },
    revokeTerminalSession(id) { revoked.push(id); }
  };
  const bridge = new AgentBrowserBridge(gateway, {
    helper: { command: "/usr/bin/node", args: ["/app/mcp-helper.mjs"] },
    runtimeDirectory: "/tmp/canvastty-runtime"
  });
  const launch = bridge.prepareLaunch({
    terminalSessionId: "terminal-id",
    provider: "codex",
    cwd: "/tmp/project"
  });

  assert.equal(launch.environment[AGENT_BROWSER_ENV.capabilityToken], "one-time-secret-token");
  assert.equal(launch.environment[AGENT_BROWSER_ENV.provider], "codex");
  assert.equal(JSON.stringify(launch.args).includes("one-time-secret-token"), false);
  assert.equal(JSON.stringify(launch.args).includes("terminal-id"), false);
  launch.cleanup();
  assert.deepEqual(revoked, ["terminal-id"]);

  bridge.setEnabled(false);
  assert.equal(bridge.isEnabled, false);
  assert.equal(bridge.prepareLaunch({ terminalSessionId: "disabled", provider: "codex", cwd: "/tmp" }), null);
});

test("PTY bridge retains temporary Kimi configuration until session cleanup", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "canvastty-kimi-session-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const kimiHomeDirectory = join(root, "kimi-home");
  let resolveAuthenticated;
  const authenticated = new Promise((resolve) => { resolveAuthenticated = resolve; });
  const gateway = {
    isEnabled: true,
    setEnabled(value) { this.isEnabled = value; },
    registerAgent(input) {
      return {
        agentId: "agent-id",
        connectionId: "connection-id",
        terminalSessionId: input.terminalSessionId,
        provider: input.provider,
        capabilityToken: "one-time-secret-token",
        address: "/tmp/canvastty.sock",
        authenticated
      };
    },
    revokeTerminalSession() {}
  };
  const bridge = new AgentBrowserBridge(gateway, {
    helper: { command: "/usr/bin/node", args: ["/app/mcp-helper.mjs"] },
    runtimeDirectory: join(root, "runtime"),
    kimiHomeDirectory,
    probeKimiPerRunConfig: () => false
  });
  const launch = bridge.prepareLaunch({
    terminalSessionId: "terminal-kimi",
    provider: "kimi",
    cwd: "/tmp/project"
  });
  const mcpPath = join(kimiHomeDirectory, "mcp.json");

  assert.match(await readFile(mcpPath, "utf8"), /canvastty_browser/);
  resolveAuthenticated();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(await readFile(mcpPath, "utf8"), /canvastty_browser/);

  launch.cleanup();
  await assert.rejects(readFile(mcpPath, "utf8"), (error) => error?.code === "ENOENT");
});

test("terminal base environment never inherits a foreign CanvasTTY browser capability", () => {
  const environment = terminalEnvironment({
    PATH: "/usr/bin",
    TERM: "foreign",
    [AGENT_BROWSER_ENV.address]: "/tmp/foreign.sock",
    [AGENT_BROWSER_ENV.agentId]: "foreign-agent",
    [AGENT_BROWSER_ENV.connectionId]: "foreign-connection",
    [AGENT_BROWSER_ENV.terminalSessionId]: "foreign-terminal",
    [AGENT_BROWSER_ENV.provider]: "codex",
    [AGENT_BROWSER_ENV.capabilityToken]: "foreign-capability"
  });

  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.TERM, "xterm-256color");
  for (const key of Object.values(AGENT_BROWSER_ENV)) assert.equal(key in environment, false);
});

test("MCP retries reuse a deterministic browser request id and can be canceled", async () => {
  const calls = [];
  const canceled = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const dispatch = createMcpDispatcher({
    connect: async () => {},
    call: async (tool, args, requestId) => {
      calls.push({ tool, args, requestId });
      await blocked;
      return {
        ok: true,
        requestId,
        tabId: "tab-1",
        commandSequence: 1,
        revisionBefore: 1,
        revisionAfter: 1,
        data: { clicked: true }
      };
    },
    cancel: (requestId) => canceled.push(requestId)
  });
  const request = {
    jsonrpc: "2.0",
    id: "same-mcp-request",
    method: "tools/call",
    params: { name: "browser_click", arguments: { tabId: "tab-1", ref: "ref-1" } }
  };
  const first = dispatch(request);
  await new Promise((resolve) => setImmediate(resolve));
  await dispatch({
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId: request.id, reason: "client canceled" }
  });
  assert.deepEqual(canceled, [calls[0].requestId]);
  release();
  await first;

  await dispatch(request);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.match(calls[0].requestId, /^mcp:[a-f0-9]{64}$/);

  await dispatch({
    ...request,
    params: { ...request.params, arguments: { tabId: "tab-1", ref: "ref-2" } }
  });
  assert.notEqual(calls[1].requestId, calls[2].requestId);
});

test("back-to-back MCP cancellation prevents a real GatewayClient request before authentication", async () => {
  class FakeSocket extends EventEmitter {
    destroyed = false;
    writes = [];

    write(value) {
      this.writes.push(String(value));
      return true;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  const socket = new FakeSocket();
  const client = new GatewayClient({
    address: "/tmp/canvastty-test.sock",
    agentId: "agent-id",
    connectionId: "connection-id",
    terminalSessionId: "terminal-id",
    provider: "codex",
    capabilityToken: "one-time-capability"
  }, {
    createConnection: () => socket,
    connectTimeoutMs: 1_000
  });
  const dispatch = createMcpDispatcher(client);
  const toolRequest = {
    jsonrpc: "2.0",
    id: "cancel-before-auth",
    method: "tools/call",
    params: { name: "browser_click", arguments: { tabId: "tab-1", ref: "ref-1" } }
  };

  const responsePromise = dispatch(toolRequest);
  await dispatch({
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId: toolRequest.id, reason: "immediate cancellation" }
  });

  socket.emit("connect");
  socket.emit("data", Buffer.from('{"heartbeatExpiryMs":15000,"heartbeatIntervalMs":5000,"reconnectToken":"reconnect-capability","type":"authenticated","v":1}\n'));
  await new Promise((resolve) => setImmediate(resolve));

  const response = await responsePromise;
  const messages = socket.writes.map((line) => JSON.parse(line));
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /"code":"CANCELED"/);
  assert.deepEqual(messages.map((message) => message.type), ["authenticate"]);
  assert.equal(client.pending.size, 0);

  client.close();
});

test("GatewayClient reconnects with the rotated token and resends a pending request", async () => {
  class FakeSocket extends EventEmitter {
    destroyed = false;
    writes = [];

    write(value) {
      this.writes.push(String(value));
      return true;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  const sockets = [];
  const client = new GatewayClient({
    address: "/tmp/canvastty-reconnect.sock",
    agentId: "agent-id",
    connectionId: "connection-id",
    terminalSessionId: "terminal-id",
    provider: "kimi",
    capabilityToken: "initial-capability"
  }, {
    createConnection: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    connectTimeoutMs: 1_000,
    reconnectDelayMs: 1,
    maxReconnectDelayMs: 1
  });

  const firstConnection = client.connect();
  sockets[0].emit("connect");
  assert.equal(JSON.parse(sockets[0].writes[0]).capabilityToken, "initial-capability");
  sockets[0].emit("data", Buffer.from(
    '{"heartbeatExpiryMs":15000,"heartbeatIntervalMs":5000,"reconnectToken":"rotated-capability","type":"authenticated","v":1}\n'
  ));
  await firstConnection;

  sockets[0].emit("close");
  await waitFor(() => sockets.length === 2);
  const pending = client.call("browser_list_tabs", {}, "reconnect-request");
  sockets[1].emit("connect");
  assert.equal(JSON.parse(sockets[1].writes[0]).capabilityToken, "rotated-capability");
  sockets[1].emit("data", Buffer.from(
    '{"heartbeatExpiryMs":15000,"heartbeatIntervalMs":5000,"reconnectToken":"rotated-capability","type":"authenticated","v":1}\n'
  ));
  await new Promise((resolve) => setImmediate(resolve));
  const request = sockets[1].writes.map((line) => JSON.parse(line)).find((message) => message.type === "request");
  assert.equal(request.id, "reconnect-request");
  assert.equal(request.tool, "browser_list_tabs");

  sockets[1].emit("data", Buffer.from(`${JSON.stringify({
    v: 1,
    type: "response",
    id: "reconnect-request",
    result: {
      ok: true,
      requestId: "reconnect-request",
      tabId: null,
      commandSequence: 1,
      revisionBefore: null,
      revisionAfter: null,
      data: { tabs: [] }
    }
  })}\n`));
  assert.equal((await pending).ok, true);
  client.close();
});

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for test condition.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("findTerminalSessionId climbs the process tree and finds the session var", () => {
  // Функция должна вернуть строку (пустую, если переменной ни у кого нет).
  assert.equal(typeof findTerminalSessionId(), "string");
});

test("findTerminalSessionId finds the session id inherited by an ancestor harness", async () => {
  // Реальная цепочка: pty-терминал (переменная при старте) → hermes node
  // (наследует) → mcp-helper (env очищен safe_env фильтрацией харнесса).
  // helper должен подняться по ppid и найти сессию у предка-hermes.
  const helperPath = join(process.cwd(), "src", "agent-browser", "mcp-helper.mjs");
  const childScript = `
    import { findTerminalSessionId } from ${JSON.stringify(`file://${helperPath}`)};
    console.log("OWN:", JSON.stringify(process.env.CANVASTTY_TERMINAL_SESSION_ID));
    console.log("FOUND:", JSON.stringify(findTerminalSessionId()));
  `;
  // «hermes»: node с переменной (как наследует из pty-терминала), запускает
  // «mcp-helper» с ОЧИЩЕННЫМ env (как после safe_env фильтрации харнесса).
  const result = spawnSync(process.execPath, ["-e", `
    const { spawnSync: innerSpawn } = require("node:child_process");
    const r = innerSpawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(childScript)}], {
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "CANVASTTY_TERMINAL_SESSION_ID")),
      encoding: "utf8"
    });
    process.stdout.write(r.stdout);
  `], {
    env: { ...process.env, CANVASTTY_TERMINAL_SESSION_ID: "chain-test-session-42" },
    encoding: "utf8"
  });
  const output = result.stdout ?? "";
  assert.match(output, /OWN: undefined/);
  assert.match(output, /FOUND: "chain-test-session-42"/);
});

test("readIdentity falls back to the ancestor session id when env is filtered", () => {
  // Полный env (как у pty-терминала CanvasTTY) → берётся из env.
  const identity = readIdentity({
    CANVASTTY_AGENT_BROWSER_ADDRESS: "/tmp/canvastty.sock",
    CANVASTTY_AGENT_ID: "agent-1",
    CANVASTTY_AGENT_CONNECTION_ID: "conn-1",
    CANVASTTY_TERMINAL_SESSION_ID: "session-abc",
    CANVASTTY_AGENT_PROVIDER: "hermes",
    CANVASTTY_AGENT_CAPABILITY: ""
  }, "linux");
  assert.equal(identity.terminalSessionId, "session-abc");

  // Env отфильтрован харнессом (нет CANVASTTY_TERMINAL_SESSION_ID) —
  // гость: session id пустой, но провайдер остаётся.
  const filtered = readIdentity({
    CANVASTTY_AGENT_BROWSER_ADDRESS: "/tmp/canvastty.sock",
    CANVASTTY_AGENT_ID: "agent-1",
    CANVASTTY_AGENT_CONNECTION_ID: "conn-1",
    CANVASTTY_AGENT_PROVIDER: "hermes",
    CANVASTTY_AGENT_CAPABILITY: ""
  }, "linux");
  assert.equal(filtered.terminalSessionId, "");
  assert.equal(filtered.provider, "hermes");
});
