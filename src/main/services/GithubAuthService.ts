import { safeStorage } from "electron";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join, dirname } from "path";

/**
 * GitHub OAuth Device Flow for the plugin showcase.
 *
 * The user authorizes once through github.com/login/device (a short code, no
 * sensitive token ever touches the clipboard or settings UI). We store the
 * resulting refresh token in an OS-encrypted blob (Electron safeStorage) and
 * transparently refresh the short-lived access token (8h) whenever a request
 * needs it — so the user only re-authorizes when the refresh token itself
 * expires (6 months) or they revoke access on GitHub.
 *
 * The OAuth client_id is public by design (like every desktop OAuth app); the
 * client_secret is NOT needed for the device flow, so nothing secret ships in
 * the app. client_id comes from GITHUB_OAUTH_CLIENT_ID / CANVASTTY_GITHUB_CLIENT_ID
 * or an app setting.
 */

export interface GithubAuthStatus {
  authorized: boolean;
  login: string | null;
  tokenExpiresAt: number | null;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  login: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const AUTH_STORE_FILE = "github-oauth.json";
// GitHub device flow allows up to 15 minutes before the code expires; the
// token poll must stay alive for the whole window, not just the first 30s.
const DEVICE_POLL_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * The OAuth client id of this CanvasTTY build. It is PUBLIC by design
 * (like every desktop OAuth app) — it identifies the app to GitHub and
 * requires no secret with the device flow. Override via env for forks:
 * GITHUB_OAUTH_CLIENT_ID / CANVASTTY_GITHUB_CLIENT_ID.
 */
// Replace with your own OAuth App client_id (GitHub → Settings → Developer settings → OAuth Apps).
const DEFAULT_OAUTH_CLIENT_ID = "";

export class GithubAuthService {
  private readonly storePath: string;
  private tokens: StoredTokens | null = null;
  private readonly clientId: string;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(userDataPath: string, clientId?: string) {
    this.storePath = join(userDataPath, AUTH_STORE_FILE);
    this.clientId = clientId
      ?? process.env.GITHUB_OAUTH_CLIENT_ID
      ?? process.env.CANVASTTY_GITHUB_CLIENT_ID
      ?? DEFAULT_OAUTH_CLIENT_ID;
  }

  get clientConfigured(): boolean {
    return this.clientId.length > 0;
  }

  /** Effective client id for the current build (env override wins). */
  private effectiveClientId(): string {
    return this.clientId;
  }

  /** Loads stored (encrypted) tokens from disk. Call once at startup. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || typeof parsed.data !== "string") return;
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn("CanvasTTY GitHub OAuth: OS keychain unavailable; stored session skipped.");
        return;
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.data, "base64"));
      const tokens: unknown = JSON.parse(decrypted);
      if (!isRecord(tokens)) return;
      const accessToken = typeof tokens.accessToken === "string" ? tokens.accessToken : null;
      const refreshToken = typeof tokens.refreshToken === "string" ? tokens.refreshToken : null;
      const expiresAt = typeof tokens.expiresAt === "number" ? tokens.expiresAt : 0;
      const login = typeof tokens.login === "string" ? tokens.login : null;
      if (!accessToken || !refreshToken || !login) return;
      this.tokens = { accessToken, refreshToken, expiresAt, login };
    } catch (error) {
      // Corrupt or missing store — start signed out.
      if (!isMissingFile(error)) {
        console.warn("CanvasTTY GitHub OAuth session could not be restored.", error);
      }
    }
  }

  /**
   * Returns a valid access token, refreshing it transparently if expired.
   * Returns null when signed out or refresh fails (expired/revoked).
   */
  async getToken(): Promise<string | null> {
    if (!this.tokens) return null;
    if (Date.now() < this.tokens.expiresAt - 60_000) {
      return this.tokens.accessToken;
    }
    // Refresh is idempotent across concurrent callers.
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  async status(): Promise<GithubAuthStatus> {
    if (!this.tokens) return { authorized: false, login: null, tokenExpiresAt: null };
    return { authorized: true, login: this.tokens.login, tokenExpiresAt: this.tokens.expiresAt };
  }

  /**
   * Starts the device flow. Returns the user-facing code + verification URL.
   * Throws if the client is not configured.
   */
  async startDeviceFlow(): Promise<{ userCode: string; verificationUri: string; interval: number }> {
    if (!this.clientConfigured) {
      throw new Error("GitHub OAuth is not configured (missing client id).");
    }
    const body = new URLSearchParams({
      client_id: this.effectiveClientId(),
      scope: "read:user"
    });
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "CanvasTTY plugin showcase"
      },
      body: body.toString()
    });
    if (!response.ok) {
      throw new Error(`GitHub device flow failed with HTTP ${response.status}.`);
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.device_code !== "string" || typeof payload.user_code !== "string") {
      throw new Error("GitHub device flow returned an invalid response.");
    }
    const deviceCode = payload.device_code as string;
    const userCode = payload.user_code as string;
    const verificationUri = typeof payload.verification_uri === "string" ? payload.verification_uri : "https://github.com/login/device";
    const interval = typeof payload.interval === "number" && payload.interval > 0 ? payload.interval : 5;

    // Poll in the background; resolves when the user authorizes in the browser.
    void this.pollDeviceCode(deviceCode, interval).catch((error) => {
      console.warn("CanvasTTY GitHub OAuth device poll failed.", error);
    });

    return { userCode, verificationUri, interval };
  }

  /** Removes the stored session. */
  async signOut(): Promise<void> {
    this.tokens = null;
    this.refreshPromise = null;
    try {
      await rm(this.storePath);
    } catch {
      // Already gone.
    }
  }

  private async pollDeviceCode(deviceCode: string, interval: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < DEVICE_POLL_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      const body = new URLSearchParams({
        client_id: this.effectiveClientId(),
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      });
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "CanvasTTY plugin showcase"
        },
        body: body.toString()
      });
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      if (!isRecord(payload)) continue;
      if (payload.error === "authorization_pending" || payload.error === "slow_down") {
        // RFC 8628 §3.5: on slow_down the client MUST increase the polling
        // interval by 5 seconds. GitHub does not return an interval in the
        // error payload, so the increase is client-side and sticks for all
        // subsequent polls in this loop.
        if (payload.error === "slow_down") interval += 5;
        continue;
      }
      if (payload.error === "access_denied" || payload.error === "expired_token") {
        return;
      }
      if (typeof payload.access_token === "string" && typeof payload.refresh_token === "string") {
        const login = await this.fetchLogin(payload.access_token);
        if (!login) return;
        const expiresIn = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 8 * 3600;
        this.tokens = {
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresAt: Date.now() + expiresIn * 1000,
          login
        };
        await this.persist();
        return;
      }
      // Unknown error — stop polling.
      return;
    }
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.tokens) return null;
    const body = new URLSearchParams({
      client_id: this.effectiveClientId(),
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken
    });
    try {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "CanvasTTY plugin showcase"
        },
        body: body.toString()
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!isRecord(payload) || typeof payload.access_token !== "string") return null;
      const accessToken = payload.access_token as string;
      const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : this.tokens.refreshToken;
      const expiresIn = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 8 * 3600;
      this.tokens = {
        ...this.tokens,
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000
      };
      await this.persist();
      return accessToken;
    } catch {
      return null;
    }
  }

  private async fetchLogin(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/vnd.github+json",
          "user-agent": "CanvasTTY plugin showcase"
        }
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!isRecord(payload) || typeof payload.login !== "string") return null;
      return payload.login;
    } catch {
      return null;
    }
  }

  private async persist(): Promise<void> {
    if (!this.tokens) return;
    try {
      await mkdir(dirname(this.storePath), { recursive: true });
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn("CanvasTTY GitHub OAuth: OS keychain unavailable; session not persisted.");
        return;
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(this.tokens));
      await writeFile(this.storePath, JSON.stringify({ data: encrypted.toString("base64") }), { mode: 0o600 });
    } catch (error) {
      console.warn("CanvasTTY GitHub OAuth session could not be persisted.", error);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT";
}
