import { useEffect, useState } from "react";
import type { LocaleId } from "../../../shared/contracts";
import { ProviderIcon } from "./ProviderIcon";
import { UiIcon } from "./UiIcon";
import { t } from "../lib/i18n";

interface TitleBarProps {
  locale: LocaleId;
}

export function TitleBar({ locale }: TitleBarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.canvasTTY.window.getState().then((state) => setMaximized(state.maximized));
  }, []);

  const toggleMaximize = async (): Promise<void> => {
    const state = await window.canvasTTY.window.toggleMaximize();
    setMaximized(state.maximized);
  };

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__logo"><ProviderIcon provider="terminal" size="small" /></span>
        <strong>CanvasTTY</strong>
        <span>{t(locale, "appSubtitle")}</span>
      </div>
      <div className="titlebar__drag" />
      <div className="titlebar__controls">
        <button type="button" onClick={() => window.canvasTTY.window.minimize()} aria-label="Minimize"><UiIcon name="minimize" size={17} /></button>
        <button type="button" onClick={() => void toggleMaximize()} aria-label="Maximize">
          <UiIcon name={maximized ? "restore" : "maximize"} size={16} />
        </button>
        <button className="titlebar__close" type="button" onClick={() => window.canvasTTY.window.close()} aria-label="Close"><UiIcon name="close" size={18} /></button>
      </div>
    </header>
  );
}
