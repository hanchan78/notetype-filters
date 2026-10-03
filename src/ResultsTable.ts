import { App, Modal, Notice, Platform, setIcon, TFile } from "obsidian";
import {
  NoteRecord,
  ViewConfiguration,
  ViewRuntimeState,
  columnKey,
  owns,
} from "./types";
import { display, elements, results, valueOf } from "./core";
import { button } from "./ui";
export class ResultsTable {
  constructor(
    private app: App,
    private root: HTMLElement,
    private changed: () => void,
    private addNew?: { run: () => Promise<void>; busy: boolean },
    private editing?: { records: NoteRecord[]; saved: () => void },
  ) {}
  render(
    notes: NoteRecord[],
    view: ViewConfiguration,
    state: ViewRuntimeState,
  ): void {
    this.root.empty();
    const { rows, more } = results(notes, view, state);
    const toolbar = this.root.createDiv({ cls: "ntf-results-toolbar" });
    toolbar.createEl("p", {
      text: more
        ? "More than 200 matches — showing first 200"
        : `${rows.length} results`,
      attr: { "aria-live": "polite" },
    });
    if (view.addNew?.enabled && this.addNew) {
      const action = this.addNew;
      button(
        toolbar,
        action.busy ? "Creating…" : "Add new",
        () => action.run(),
        "mod-cta",
      ).disabled = action.busy;
    }
    const scroll = this.root.createDiv({ cls: "ntf-table-scroll" });
    const table = scroll.createEl("table", { cls: "ntf-table" });
    const mobile = Platform.isMobile;
    const showOpenColumn =
      mobile &&
      !view.columns.some((c) => c.kind === "special" && c.name === "File Name");
    if (mobile) {
      table.addClass("ntf-table-mobile");
      table.style.minWidth = `${view.columns.length * 180 + (showOpenColumn ? 48 : 0)}px`;
    }
    const head = table.createEl("thead").createEl("tr");
    if (showOpenColumn)
      head.createEl("th", {
        cls: "ntf-open-column",
        attr: { scope: "col", "aria-label": "Open note" },
      });
    for (const c of view.columns) {
      const th = head.createEl("th", { attr: { scope: "col" } });
      const active =
        state.temporarySort &&
        columnKey(state.temporarySort.column) === columnKey(c);
      th.setAttr(
        "aria-sort",
        active
          ? state.temporarySort!.direction === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
      button(
        th,
        `${c.name}${active ? (state.temporarySort!.direction === "asc" ? " ↑" : " ↓") : ""}`,
        () => {
          state.temporarySort = !active
            ? { column: c, direction: "asc" }
            : state.temporarySort!.direction === "asc"
              ? { column: c, direction: "desc" }
              : undefined;
          this.changed();
        },
        "ntf-sort",
      );
    }
    const body = table.createEl("tbody");
    for (const n of rows) {
      const tr = body.createEl("tr");
      if (!mobile) {
        tr.addClass("ntf-openable-row");
        tr.tabIndex = 0;
        tr.setAttr("aria-label", `Open ${n.name}`);
        tr.setAttr("title", `Open ${n.name}`);
      }
      const open = async () => {
        const file = this.app.vault.getAbstractFileByPath(n.path);
        if (!(file instanceof TFile)) {
          new Notice("This note no longer exists.");
          return;
        }
        try {
          await this.app.workspace.getLeaf(false).openFile(file);
        } catch (error) {
          new Notice(`Could not open ${n.name}: ${String(error)}`);
        }
      };
      if (!mobile) {
        tr.addEventListener("click", (event) => {
          const target = event.target as HTMLElement;
          if (target.closest("a, button, input, select, textarea, summary"))
            return;
          // Allow copying cell text without navigating away after a selection.
          if (tr.ownerDocument.getSelection()?.toString()) return;
          void open();
        });
        tr.addEventListener("keydown", (event) => {
          if (
            event.target !== tr ||
            (event.key !== "Enter" && event.key !== " ")
          )
            return;
          event.preventDefault();
          void open();
        });
      }
      if (showOpenColumn) {
        const cell = tr.createEl("td", { cls: "ntf-open-column" });
        const link = button(cell, "", open, "ntf-file-link ntf-open-note");
        link.setAttr("aria-label", `Open ${n.name}`);
        setIcon(link, "file-text");
      }
      for (const c of view.columns) {
        const td = tr.createEl("td");
        const content = mobile ? td.createDiv({ cls: "ntf-cell-content" }) : td;
        const renderContent = (el: HTMLElement) => {
          if (this.editing && c.kind === "property") {
            this.renderEditor(el, n, c.name);
            return;
          }
          if (c.kind === "property" && !owns(n.properties, c.name)) {
            el.createSpan({ text: "Missing", cls: "ntf-missing" });
            return;
          }
          if (c.kind === "special" && c.name === "File Name") {
            button(el, n.name, open, "ntf-file-link").setAttribute(
              "aria-label",
              `Open ${n.name}`,
            );
          } else if (
            c.kind === "special" &&
            (c.name === "Created" || c.name === "Modified")
          )
            el.setText(new Date(valueOf(n, c) as number).toLocaleString());
          else this.renderValue(el, valueOf(n, c), n.path);
        };
        renderContent(content);
        if (
          mobile &&
          !(this.editing && c.kind === "property") &&
          !(c.kind === "special" && c.name === "File Name")
        ) {
          td.tabIndex = 0;
          const expand = (event: Event) => {
            if (content.scrollWidth <= content.clientWidth) return;
            event.preventDefault();
            event.stopPropagation();
            new CellValueModal(this.app, c.name, renderContent).open();
          };
          // Capture before internal links so a truncated link opens the full value first.
          td.addEventListener("click", expand, true);
          td.addEventListener("keydown", (event) => {
            if (
              event.target === td &&
              (event.key === "Enter" || event.key === " ")
            )
              expand(event);
          });
        }
      }
    }
  }
  private renderEditor(
    el: HTMLElement,
    note: NoteRecord,
    property: string,
  ): void {
    const original = note.properties[property];
    const values = this.editing!.records.flatMap((n) => {
      const value = n.properties[property];
      return Array.isArray(value) ? value : [value];
    }).filter((v) => v !== null && v !== undefined);
    // Obsidian's property registry is not yet exposed in its public typings.
    const registry = (
      this.app as App & {
        metadataTypeManager?: {
          getAssignedType?: (name: string) => string;
          properties?: Record<string, { type: string }>;
        };
      }
    ).metadataTypeManager;
    const assigned =
      registry?.getAssignedType?.(property) ??
      registry?.properties?.[property.toLowerCase()]?.type;
    const sample = original ?? values[0];
    const date =
      assigned === "date" ||
      assigned === "datetime" ||
      (!assigned &&
        values.length > 0 &&
        values.every(
          (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v),
        ));
    const type =
      assigned ??
      (Array.isArray(original) ||
      (original == null &&
        this.editing!.records.some((n) =>
          Array.isArray(n.properties[property]),
        ))
        ? "multitext"
        : typeof sample);
    if (
      original !== null &&
      typeof original === "object" &&
      !Array.isArray(original)
    ) {
      this.renderValue(el, original, note.path);
      return;
    }
    const editor = el.createEl("input", {
      type: "text",
      cls: "ntf-cell-editor",
      attr: { "aria-label": `${property} of ${note.name}` },
    });
    editor.dataset.cellEditor = "true";
    editor.value = Array.isArray(original)
      ? JSON.stringify(original)
      : original == null
        ? ""
        : String(original);
    const initial = editor.value;
    if (
      !date &&
      (type === "string" ||
        type === "text" ||
        type === "undefined" ||
        type === "multitext" ||
        type === "tags")
    ) {
      const menu = el.createDiv({
        cls: "ntf-cell-suggestions",
        attr: { role: "listbox" },
      });
      menu.hidden = true;
      const suggestions = [
        ...new Set(values.filter((v): v is string => typeof v === "string")),
      ].sort();
      const update = () => {
        menu.empty();
        const matches = suggestions.filter((v) =>
          v.toLowerCase().includes(editor.value.toLowerCase()),
        );
        for (const value of matches.slice(0, 50)) {
          const option = button(menu, value, () => {
            editor.value =
              type === "multitext" || type === "tags"
                ? JSON.stringify([value])
                : value;
            menu.hidden = true;
            editor.focus();
          });
          option.setAttr("role", "option");
          option.addEventListener("mousedown", (event) =>
            event.preventDefault(),
          );
        }
        menu.hidden = !matches.length;
      };
      editor.addEventListener("focus", update);
      editor.addEventListener("input", update);
      editor.addEventListener("blur", () => {
        menu.hidden = true;
      });
    }
    if (type === "multitext" || type === "tags")
      editor.title = "List: enter a JSON array, or one text value";
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        editor.blur();
      }
      if (event.key === "Escape") {
        editor.value = initial;
        editor.blur();
      }
    });
    editor.addEventListener("blur", () => {
      if (editor.value === initial) {
        setTimeout(() => this.editing!.saved(), 0);
        return;
      }
      let value: unknown = editor.value;
      try {
        if (type === "number") {
          value = editor.value.trim() === "" ? null : Number(editor.value);
          if (value !== null && !Number.isFinite(value))
            throw new Error("Enter a valid number.");
        } else if (type === "boolean" || type === "checkbox") {
          if (!/^(true|false)$/i.test(editor.value.trim()))
            throw new Error("Enter true or false.");
          value = editor.value.trim().toLowerCase() === "true";
        } else if (type === "multitext" || type === "tags") {
          value =
            editor.value.trim() === ""
              ? []
              : editor.value.trim().startsWith("[")
                ? JSON.parse(editor.value)
                : [editor.value];
          if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
            throw new Error("Enter a JSON array of text values.");
        }
        const file = this.app.vault.getAbstractFileByPath(note.path);
        if (!(file instanceof TFile))
          throw new Error("This note no longer exists.");
        editor.disabled = true;
        void this.app.fileManager
          .processFrontMatter(file, (frontmatter) => {
            Object.defineProperty(frontmatter, property, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          })
          .then(() => {
            note.properties[property] = value;
            this.editing!.saved();
          })
          .catch((error) => {
            editor.disabled = false;
            new Notice(`Could not save ${property}: ${String(error)}`);
          });
      } catch (error) {
        new Notice(String(error));
      }
    });
  }
  private renderValue(el: HTMLElement, value: unknown, path: string): void {
    if (typeof value === "boolean") {
      el.createSpan({
        text: value ? "✓" : "✗",
        cls: value ? "ntf-boolean-true" : "ntf-boolean-false",
        attr: {
          role: "img",
          "aria-label": value ? "True" : "False",
          title: value ? "True" : "False",
        },
      });
      return;
    }
    if (Array.isArray(value)) {
      elements(value).forEach((v, i) => {
        if (i) el.appendText(", ");
        this.renderValue(el, v, path);
      });
      return;
    }
    const text = display(value),
      pattern = /!?\[\[([^\]]+)\]\]/g;
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      el.appendText(text.slice(end, match.index));
      const parts = match[1]!.split("|"),
        target = parts[0]!;
      const link = el.createEl("a", {
        text: parts[1] ?? target,
        cls: "internal-link",
        href: target,
      });
      link.onclick = (event) => {
        event.preventDefault();
        void this.app.workspace
          .openLinkText(target, path)
          .catch((error) => new Notice(String(error)));
      };
      end = match.index! + match[0].length;
    }
    el.appendText(text.slice(end));
  }
}

class CellValueModal extends Modal {
  constructor(
    app: App,
    private label: string,
    private renderValue: (el: HTMLElement) => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: this.label });
    this.renderValue(this.contentEl.createDiv({ cls: "ntf-cell-popup" }));
    button(this.contentEl, "Close", () => this.close());
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
