import type { ProviderId } from "../../../shared/contracts";
import terminalIcon from "../assets/icons/lucide/square-terminal.svg";
import claudeIcon from "../assets/providers/claude.svg";
import codexIcon from "../assets/providers/codex.png";
import kimiIcon from "../assets/providers/kimi.ico";

interface ProviderIconProps {
  provider: ProviderId;
  size?: "small" | "medium" | "large";
}

const PROVIDER_ASSETS = {
  codex: codexIcon,
  claude: claudeIcon,
  kimi: kimiIcon
} as const;

export function ProviderIcon({ provider, size = "medium" }: ProviderIconProps): React.JSX.Element {
  return (
    <span className={`provider-icon provider-icon--${provider} provider-icon--${size}`} aria-hidden="true">
      {provider === "terminal"
        ? <span
            className="provider-icon__system"
            style={{ "--provider-icon-source": `url("${terminalIcon}")` } as React.CSSProperties}
          />
        : <img src={PROVIDER_ASSETS[provider]} alt="" draggable={false} />}
    </span>
  );
}
