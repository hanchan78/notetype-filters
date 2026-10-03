import { Modal, Notice, TFile } from "obsidian";
import type NoteTypePlugin from "./main";
import { ViewConfiguration, owns } from "./types";
import { display, matches } from "./core";
import { button, input, select, ConfirmModal } from "./ui";
import { addMissing } from "./repair";
export class MissingPropertyModal extends Modal {
  private property: string;
  private type = "empty";
  private value = "";
  constructor(
    private plugin: NoteTypePlugin,
    private view: ViewConfiguration,
    private properties: string[],
  ) {
    super(plugin.app);
    this.property = properties[0] ?? "";
  }
  onOpen(): void {
    this.render();
  }
  private candidates(): string[] {
    const state = this.plugin.state(this.view.id);
    return this.plugin.index
      .notes(this.view.noteTypeValue)
      .filter(
        (n) =>
          matches(n, this.view.filters, state) &&
          !owns(n.properties, this.property),
      )
      .map((n) => n.path);
  }
  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.createEl("h2", { text: "Fix missing properties" });
    el.createEl("p", {
      text: "Scope: all notes matching this view and its current filters, including rows beyond the 200-row display limit. Existing properties, including empty ones, are preserved.",
    });
    select(
      el,
      "Property",
      this.properties.map((p) => [p, p]),
      this.property,
      (v) => {
        this.property = v;
        this.render();
      },
    );
    el.createEl("p", {
      text: `${this.candidates().length} matching notes lack ${this.property}.`,
    });
    select(
      el,
      "Default value type",
      [
        ["empty", "Empty value"],
        ["text", "Text"],
        ["number", "Number"],
        ["boolean", "Boolean / checkbox"],
        ["date", "Date"],
        ["list", "List (one text item per line)"],
      ],
      this.type,
      (v) => {
        this.type = v;
        this.value = "";
        this.render();
      },
    );
    if (this.type === "boolean")
      select(
        el,
        "Value",
        [
          ["false", "False"],
          ["true", "True"],
        ],
        this.value || "false",
        (v) => (this.value = v),
      );
    else if (this.type === "list") {
      const label = el.createEl("label", {
        cls: "ntf-field",
        text: "List items (one per line)",
      });
      const area = label.createEl("textarea");
      area.value = this.value;
      area.oninput = () => (this.value = area.value);
    } else if (this.type !== "empty") {
      const field = input(
        el,
        "Default value",
        this.value,
        (v) => (this.value = v),
      );
      if (this.type === "number") field.type = "number";
      if (this.type === "date") field.type = "date";
    }
    button(el, "Cancel", () => this.close());
    button(
      el,
      "Review changes",
      () => {
        let value: unknown = null;
        switch (this.type) {
          case "text":
            value = this.value;
            break;
          case "number":
            if (!this.value.trim() || !Number.isFinite(Number(this.value)))
              throw new Error("Enter a valid number.");
            value = Number(this.value);
            break;
          case "boolean":
            value = this.value === "true";
            break;
          case "date":
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(this.value) ||
              Number.isNaN(Date.parse(this.value)) ||
              new Date(this.value).toISOString().slice(0, 10) !== this.value
            )
              throw new Error("Enter a valid date.");
            value = this.value;
            break;
          case "list":
            value = this.value
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean);
            break;
        }
        const paths = this.candidates(),
          property = this.property;
        if (!paths.length) {
          new Notice("No matching notes need this property.");
          return;
        }
        new ConfirmModal(
          this.app,
          `This will add ${property} to up to ${paths.length} notes with default value ${value === null ? "(empty)" : display(value)}. Continue?`,
          async () => {
            this.close();
            let changed = 0,
              skipped = 0,
              failed = 0;
            for (const path of paths) {
              const file = this.app.vault.getAbstractFileByPath(path);
              if (!(file instanceof TFile)) {
                skipped++;
                continue;
              }
              try {
                let added = false;
                await this.app.fileManager.processFrontMatter(
                  file,
                  (fm: Record<string, unknown>) => {
                    // Recheck inside the native write callback: never overwrite a concurrently added property.
                    const current = this.plugin.index.records.get(file.path);
                    if (current)
                      added = addMissing(
                        fm,
                        current,
                        this.view,
                        this.plugin.state(this.view.id),
                        property,
                        value,
                      );
                  },
                );
                if (added) changed++;
                else skipped++;
              } catch (error) {
                failed++;
                console.error(
                  `NoteType Filters: could not update ${path}`,
                  error,
                );
              }
            }
            // Metadata-cache changed events refresh entries after Obsidian parses the write.
            this.plugin.refresh();
            new Notice(
              `Added ${property} to ${changed} notes. ${skipped} skipped; ${failed} failed.`,
              8000,
            );
          },
        ).open();
      },
      "mod-cta",
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
