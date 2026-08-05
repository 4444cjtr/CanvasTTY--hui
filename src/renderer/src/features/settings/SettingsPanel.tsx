import type {
  AppSettings,
  CanvasPatternId,
  EdgePanSpeed,
  LocaleId,
  PaletteId,
  ZoomSensitivity
} from "../../../../shared/contracts";
import { t } from "../../lib/i18n";
import { UiIcon } from "../../components/UiIcon";

type AppearanceSettings = Pick<AppSettings,
  "locale" | "palette" | "pattern" | "snapToGrid" | "edgePan" | "edgePanSpeed" | "zoomSensitivity"
>;

interface SettingsPanelProps {
  open: boolean;
  settings: AppearanceSettings;
  onClose(): void;
  onChange(patch: Partial<AppearanceSettings>): Promise<void>;
}

export function SettingsPanel({
  open,
  settings,
  onClose,
  onChange
}: SettingsPanelProps): React.JSX.Element {
  const locale = settings.locale;

  return (
    <div className={`settings-backdrop ${open ? "settings-backdrop--open" : ""}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className={`settings-panel ${open ? "settings-panel--open" : ""}`} aria-hidden={!open}>
        <header className="dialog-header">
          <h2>{t(locale, "settings")}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t(locale, "close")}><UiIcon name="close" size={20} /></button>
        </header>

        <SettingGroup label={t(locale, "language")}>
          <Segmented
            value={settings.locale}
            options={[["ru", "Русский"], ["en", "English"]]}
            onChange={(value) => void onChange({ locale: value as LocaleId })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "palette")}>
          <Segmented
            value={settings.palette}
            options={(["sage", "lilac", "night"] as PaletteId[]).map((value) => [value, t(locale, value)])}
            onChange={(value) => void onChange({ palette: value as PaletteId })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "canvasPattern")}>
          <Segmented
            value={settings.pattern}
            options={(["dots", "grid", "waves", "none"] as CanvasPatternId[]).map((value) => [value, t(locale, value)])}
            onChange={(value) => void onChange({ pattern: value as CanvasPatternId })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "snapToGrid")}>
          <Segmented
            value={settings.snapToGrid ? "on" : "off"}
            options={[["on", t(locale, "on")], ["off", t(locale, "off")]]}
            onChange={(value) => void onChange({ snapToGrid: value === "on" })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "edgePan")}>
          <Segmented
            value={settings.edgePan ? "on" : "off"}
            options={[["on", t(locale, "on")], ["off", t(locale, "off")]]}
            onChange={(value) => void onChange({ edgePan: value === "on" })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "edgePanSpeed")}>
          <Segmented
            value={settings.edgePanSpeed}
            options={(["slow", "normal", "fast"] as EdgePanSpeed[]).map((value) => [value, t(locale, value)])}
            onChange={(value) => void onChange({ edgePanSpeed: value as EdgePanSpeed })}
          />
        </SettingGroup>

        <SettingGroup label={t(locale, "zoomSensitivity")}>
          <Segmented
            value={settings.zoomSensitivity}
            options={(["slow", "normal", "fast"] as ZoomSensitivity[]).map((value) => [value, t(locale, value)])}
            onChange={(value) => void onChange({ zoomSensitivity: value as ZoomSensitivity })}
          />
        </SettingGroup>

      </aside>
    </div>
  );
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return <section className="setting-group"><h3>{label}</h3>{children}</section>;
}

function Segmented({
  value,
  options,
  onChange
}: {
  value: string;
  options: [string, string][];
  onChange(value: string): void;
}): React.JSX.Element {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button
          className={value === optionValue ? "segmented__button segmented__button--active" : "segmented__button"}
          type="button"
          key={optionValue}
          onClick={() => onChange(optionValue)}
        >{label}</button>
      ))}
    </div>
  );
}
