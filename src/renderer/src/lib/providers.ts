import type { AgentProviderId, ProviderId } from "../../../shared/contracts";
import type { TranslationKey } from "./i18n";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  dangerKey?: TranslationKey;
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  terminal: { id: "terminal", label: "Terminal" },
  codex: { id: "codex", label: "Codex", dangerKey: "dangerCodex" },
  claude: { id: "claude", label: "Claude", dangerKey: "dangerClaude" },
  kimi: { id: "kimi", label: "Kimi", dangerKey: "dangerKimi" }
};

export const AGENT_PROVIDERS: AgentProviderId[] = ["codex", "claude", "kimi"];
