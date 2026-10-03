import { PluginSettingTab } from "obsidian";
import type NoteTypePlugin from "./main";

export class NoteTypeSettingsTab extends PluginSettingTab {
  constructor(private plugin: NoteTypePlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const root = this.containerEl;
    root.empty();
    root.createEl("h2", { text: "NoteType Filters" });
    const label = root.createEl("label", { text: "Excluded paths" });
    const input = label.createEl("textarea", {
      attr: { rows: "8", placeholder: "/Templates\nArchive", "aria-label": "Excluded paths" },
    });
    input.style.display = "block";
    input.style.width = "100%";
    input.value = this.plugin.store.data.excludedPaths.join("\n");
    root.createEl("p", {
      text: "Enter one vault-relative file or folder path per line. Folders include all subdirectories. A leading slash is optional. Changes apply to all views immediately; excluded templates can still be used by Add new.",
    });
    input.addEventListener("input", () => {
      this.plugin.store.data.excludedPaths = [...new Set(input.value.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))];
      this.plugin.index.rebuild();
      this.plugin.refresh();
      this.plugin.store.save();
    });
  }
}
