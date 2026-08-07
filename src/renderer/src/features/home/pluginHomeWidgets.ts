import type { InstalledPlugin, PluginGridSize } from "../../../../shared/contracts";
import { pluginWidgetId } from "./homeLayout.ts";

export interface PluginHomeWidgetOption {
  widgetId: string;
  label: string;
  description: string;
  size: PluginGridSize;
  pluginEnabled: boolean;
  required?: false;
}

export function pluginHomeWidgetOptions(plugins: readonly InstalledPlugin[]): PluginHomeWidgetOption[] {
  return plugins.flatMap((plugin) => plugin.manifest.contributions
    .filter((contribution) => contribution.kind === "home-widget")
    .map((contribution) => ({
      widgetId: pluginWidgetId(plugin.manifest.id, contribution.id),
      label: contribution.title,
      description: contribution.description
        ? `${plugin.manifest.name} · ${contribution.description}`
        : plugin.manifest.name,
      size: contribution.defaultSize,
      pluginEnabled: plugin.enabled
    })));
}
