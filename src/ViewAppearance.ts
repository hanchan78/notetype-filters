import { App, SuggestModal, getIconIds, setIcon } from "obsidian";

export function viewLabel(parent: HTMLElement, name: string, icon?: string): void {
  parent.empty();
  parent.addClass("ntf-icon-label");
  if (icon) {
    const holder = parent.createSpan({ cls: "ntf-view-icon", attr: { "aria-hidden": "true" } });
    setIcon(holder, icon);
  }
  parent.createSpan({ text: name, cls: "ntf-view-name" });
}

export function contrastText(color: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

export class ViewIconModal extends SuggestModal<string> {
  private icons = [...new Set(getIconIds())].sort();
  constructor(app: App, private choose: (icon: string) => void) {
    super(app);
    this.setPlaceholder("Search icons…");
    this.setInstructions([{ command: "↑ ↓", purpose: "Navigate" }, { command: "↵", purpose: "Choose icon" }, { command: "esc", purpose: "Cancel" }]);
  }
  getSuggestions(query: string): string[] {
    const words = query.toLowerCase().trim().split(/\s+/);
    return this.icons.filter((icon) => words.every((word) => icon.toLowerCase().includes(word)));
  }
  renderSuggestion(icon: string, el: HTMLElement): void {
    viewLabel(el, icon.replace(/^lucide-/, "").replace(/-/g, " "), icon);
  }
  onChooseSuggestion(icon: string): void {
    this.choose(icon);
  }
}
