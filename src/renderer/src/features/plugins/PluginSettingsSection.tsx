import { useState } from "react";
import type {
  AppSettings,
  InstalledPlugin,
  LocaleId,
  PluginContribution,
  PluginInstallPreview,
  PluginPermission
} from "../../../../shared/contracts";
import { t, type TranslationKey } from "../../lib/i18n";

interface PluginSettingsSectionProps {
  settings: AppSettings;
  plugins: InstalledPlugin[];
  onPreviewPlugin(sourceUrl: string): Promise<PluginInstallPreview>;
  onInstallPlugin(token: string): Promise<void>;
  onSetPluginEnabled(pluginId: string, enabled: boolean): Promise<void>;
  onUninstallPlugin(pluginId: string): Promise<void>;
  onOpenPluginContribution(plugin: InstalledPlugin, contribution: PluginContribution): Promise<void>;
}

export function PluginSettingsSection({
  settings,
  plugins,
  onPreviewPlugin,
  onInstallPlugin,
  onSetPluginEnabled,
  onUninstallPlugin,
  onOpenPluginContribution
}: PluginSettingsSectionProps): React.JSX.Element {
  const locale = settings.locale;
  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  const inspect = async (): Promise<void> => {
    if (busy || sourceUrl.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await onPreviewPlugin(sourceUrl.trim()));
    } catch (reason) {
      setError(errorMessage(reason, t(locale, "pluginInstallFailed")));
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onInstallPlugin(preview.token);
      setPreview(null);
      setSourceUrl("");
    } catch (reason) {
      setError(errorMessage(reason, t(locale, "pluginInstallFailed")));
    } finally {
      setBusy(false);
    }
  };

  const runPluginAction = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason, t(locale, "pluginActionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plugin-settings">
      <section className="setting-group">
        <h3>{t(locale, "installPlugin")}</h3>
        <div className="plugin-install-row">
          <input
            value={sourceUrl}
            type="url"
            spellCheck={false}
            placeholder="https://github.com/owner/repository"
            aria-label={t(locale, "githubUrl")}
            onChange={(event) => {
              setSourceUrl(event.target.value);
              setPreview(null);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void inspect();
            }}
          />
          <button type="button" disabled={busy || sourceUrl.trim().length === 0} onClick={() => void inspect()}>
            {t(locale, "inspectPlugin")}
          </button>
        </div>
        {preview && (
          <article className="plugin-preview">
            <header><strong>{preview.manifest.name}</strong><span>v{preview.manifest.version}</span></header>
            <p>{preview.manifest.description}</p>
            <PermissionList permissions={preview.manifest.permissions} locale={locale} />
            <div className="plugin-preview__actions">
              <button type="button" onClick={() => setPreview(null)}>{t(locale, "cancel")}</button>
              <button className="plugin-primary-action" type="button" disabled={busy} onClick={() => void install()}>{t(locale, "install")}</button>
            </div>
          </article>
        )}
        {error && <p className="plugin-settings__error" role="alert">{error}</p>}
      </section>

      <section className="setting-group">
        <h3>{t(locale, "installedPlugins")}</h3>
        {plugins.length === 0 ? <p className="plugin-settings__empty">{t(locale, "noPlugins")}</p> : (
          <div className="installed-plugin-list">
            {plugins.map((plugin) => (
              <article className={`installed-plugin ${plugin.enabled ? "" : "installed-plugin--disabled"}`} key={plugin.manifest.id}>
                <header className="installed-plugin__header">
                  <span><strong>{plugin.manifest.name}</strong><small>v{plugin.manifest.version}</small></span>
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runPluginAction(() => onSetPluginEnabled(plugin.manifest.id, !plugin.enabled))}
                    >{plugin.enabled ? t(locale, "disable") : t(locale, "enable")}</button>
                    <button
                      className="installed-plugin__remove"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirmUninstall !== plugin.manifest.id) {
                          setConfirmUninstall(plugin.manifest.id);
                          return;
                        }
                        setConfirmUninstall(null);
                        void runPluginAction(() => onUninstallPlugin(plugin.manifest.id));
                      }}
                    >{confirmUninstall === plugin.manifest.id ? t(locale, "uninstallConfirm") : t(locale, "uninstall")}</button>
                  </div>
                </header>
                <p>{plugin.manifest.description}</p>
                <PermissionList permissions={plugin.manifest.permissions} locale={locale} />
                <div className="plugin-contribution-list">
                  {plugin.manifest.contributions.map((contribution) => {
                    const widgetId = `plugin:${plugin.manifest.id}:${contribution.id}`;
                    const onHome = contribution.kind === "home-widget"
                      && settings.homeLayout.some((placement) => placement.widgetId === widgetId);
                    return (
                      <div className="plugin-contribution" key={contribution.id}>
                        <span>
                          <strong>{contribution.title}</strong>
                          <small>{t(locale, contributionKindKey(contribution.kind))}</small>
                        </span>
                        <button
                          type="button"
                          disabled={busy || !plugin.enabled}
                          onClick={() => void runPluginAction(() => onOpenPluginContribution(plugin, contribution))}
                        >{contribution.kind === "home-widget"
                            ? onHome ? t(locale, "removeFromHome") : t(locale, "addToHome")
                            : t(locale, "open")}</button>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PermissionList({ permissions, locale }: { permissions: PluginPermission[]; locale: LocaleId }): React.JSX.Element {
  return (
    <div className="plugin-permissions">
      <strong>{t(locale, "pluginPermissions")}</strong>
      {permissions.length === 0
        ? <span>{t(locale, "pluginNoPermissions")}</span>
        : <ul>{permissions.map((permission) => <li key={permission}>{t(locale, permissionKey(permission))}</li>)}</ul>}
    </div>
  );
}

function permissionKey(permission: PluginPermission): TranslationKey {
  return ({
    storage: "permissionStorage",
    "sessions:read": "permissionSessionsRead",
    "limits:read": "permissionLimitsRead",
    "launcher:open": "permissionLauncherOpen",
    "external:open": "permissionExternalOpen",
    "media:library": "permissionMediaLibrary",
    "playlists:read": "permissionPlaylistsRead",
    "playlists:write": "permissionPlaylistsWrite",
    network: "permissionNetwork"
  } as const)[permission];
}

function contributionKindKey(kind: PluginContribution["kind"]): TranslationKey {
  return kind === "home-widget"
    ? "contributionHomeWidget"
    : kind === "canvas-app"
      ? "contributionCanvasApp"
      : "contributionWindow";
}

function errorMessage(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 320);
}
