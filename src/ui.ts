import { App, Modal, Notice } from "obsidian";
export function button(
  parent: HTMLElement,
  label: string,
  action: () => void | Promise<void>,
  cls?: string,
): HTMLButtonElement {
  const el = parent.createEl("button", { text: label, cls });
  el.type = "button";
  el.addEventListener("click", () => {
    void Promise.resolve()
      .then(action)
      .catch((e) => {
        console.error("NoteType Filters", e);
        new Notice(String(e));
      });
  });
  return el;
}
export function input(
  parent: HTMLElement,
  label: string,
  value: string,
  onChange: (value: string) => void,
): HTMLInputElement {
  const wrap = parent.createEl("label", { cls: "ntf-field" });
  wrap.createSpan({ text: label });
  const el = wrap.createEl("input", { type: "text", value });
  el.addEventListener("input", () => onChange(el.value));
  return el;
}
export function select(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const wrap = parent.createEl("label", { cls: "ntf-field" });
  wrap.createSpan({ text: label });
  const el = wrap.createEl("select");
  for (const [v, text] of options) el.createEl("option", { value: v, text });
  el.value = value;
  el.addEventListener("change", () => onChange(el.value));
  return el;
}
export function move<T>(items: T[], i: number, delta: number): void {
  const j = i + delta;
  if (j < 0 || j >= items.length) return;
  const item = items.splice(i, 1)[0];
  if (item !== undefined) items.splice(j, 0, item);
}
export function orderButtons<T>(
  parent: HTMLElement,
  items: T[],
  i: number,
  refresh: () => void,
): void {
  button(parent, "↑", () => {
    move(items, i, -1);
    refresh();
  }).disabled = i === 0;
  button(parent, "↓", () => {
    move(items, i, 1);
    refresh();
  }).disabled = i === items.length - 1;
}
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private action: () => void | Promise<void>,
  ) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: "Confirm action" });
    this.contentEl.createEl("p", { text: this.message });
    button(this.contentEl, "Cancel", () => this.close());
    button(
      this.contentEl,
      "Confirm",
      () => {
        this.close();
        return this.action();
      },
      "mod-warning",
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class NameModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private value: string,
    private action: (value: string) => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.title });
    const el = input(
      this.contentEl,
      "Name",
      this.value,
      (v) => (this.value = v),
    );
    button(this.contentEl, "Save", () => {
      if (!this.value.trim()) {
        new Notice("Enter a name.");
        return;
      }
      this.action(this.value.trim());
      this.close();
    });
    el.focus();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
