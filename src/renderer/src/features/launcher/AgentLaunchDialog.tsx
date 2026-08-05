import { useEffect, useState } from "react";
import type {
  AgentProviderId,
  AppSettings,
  LaunchProfileId
} from "../../../../shared/contracts";
import { ProviderIcon } from "../../components/ProviderIcon";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import { PROVIDERS } from "../../lib/providers";

interface AgentLaunchDialogProps {
  provider: AgentProviderId | null;
  settings: AppSettings;
  onClose(): void;
  onAcknowledge(provider: AgentProviderId): Promise<void>;
  onLaunch(provider: AgentProviderId, profile: LaunchProfileId, cwd: string): Promise<void>;
}

export function AgentLaunchDialog({
  provider,
  settings,
  onClose,
  onAcknowledge,
  onLaunch
}: AgentLaunchDialogProps): React.JSX.Element | null {
  const [profile, setProfile] = useState<LaunchProfileId>("normal");
  const [cwd, setCwd] = useState(settings.lastDirectory);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = settings.locale;

  useEffect(() => {
    if (!provider) return;
    setProfile("normal");
    setCwd(settings.lastDirectory);
    setConfirmDanger(false);
    setError(null);
  }, [provider, settings.lastDirectory]);

  useEffect(() => {
    if (!provider) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [provider, onClose]);

  if (!provider) return null;

  const acknowledged = settings.acknowledgedDangerousProfiles.includes(provider);
  const dangerKey = PROVIDERS[provider].dangerKey!;

  const chooseDirectory = async (): Promise<void> => {
    const selected = await window.canvasTTY.dialog.pickDirectory(cwd);
    if (selected) setCwd(selected);
  };

  const submit = async (): Promise<void> => {
    if (profile === "yolo" && !acknowledged && !confirmDanger) {
      setConfirmDanger(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (profile === "yolo" && !acknowledged) await onAcknowledge(provider);
      await onLaunch(provider, profile, cwd);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t(locale, "launchFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="launch-dialog" role="dialog" aria-modal="true" aria-label={`${t(locale, "launchAgent")}: ${PROVIDERS[provider].label}`}>
        <div className="launch-dialog__toolbar">
          <button className="launch-dialog__close" type="button" onClick={onClose} aria-label={t(locale, "close")}><UiIcon name="close" size={18} /></button>
        </div>

        <div className="launch-dialog__top">
          <div className="launch-dialog__provider"><ProviderIcon provider={provider} size="large" /></div>
          <button className="folder-field" type="button" onClick={() => void chooseDirectory()}>
            <UiIcon name="folder" size={28} />
            <span className="folder-field__copy">
              <small>{t(locale, "projectFolder")}</small>
              <strong title={cwd}>{cwd}</strong>
            </span>
            <UiIcon name="chevron" size={20} />
          </button>
        </div>

        <div className="profile-row">
          <button className={profile === "normal" ? "profile-button profile-button--active" : "profile-button"} type="button" onClick={() => {
            setProfile("normal");
            setConfirmDanger(false);
          }}>{t(locale, "normal")}</button>
          <button className={profile === "yolo" ? "profile-button profile-button--active" : "profile-button"} type="button" onClick={() => {
            setProfile("yolo");
            setConfirmDanger(false);
          }}>{t(locale, "yolo")}</button>
          <button className="launch-submit" type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <span className="launch-submit__busy" /> : <UiIcon name="arrow" size={38} />}
          </button>
        </div>

        {profile === "yolo" && (
          <div className={`danger-note ${confirmDanger ? "danger-note--confirm" : ""}`}>
            <strong>{t(locale, dangerKey)}</strong>
            {!acknowledged && <span>{confirmDanger ? t(locale, "dangerousFirstUse") : t(locale, "confirmLaunch")}</span>}
          </div>
        )}
        {error && <div className="dialog-error">{error}</div>}
      </section>
    </div>
  );
}
