import { Modal, Notice } from "obsidian";
import type NoteTypePlugin from "./main";
import { Column, SPECIALS, ViewConfiguration, columnKey, uid } from "./types";
import { coverage, reconcile } from "./core";
import { categoryPath } from "./Persistence";
import { button, input, select, orderButtons } from "./ui";
import { validateCreation } from "./NoteCreation";
import { contrastText, viewLabel, ViewIconModal } from "./ViewAppearance";
export class ViewEditorModal extends Modal {
  private draft: ViewConfiguration;
  constructor(
    private plugin: NoteTypePlugin,
    view?: ViewConfiguration,
  ) {
    super(plugin.app);
    this.draft = view
      ? (JSON.parse(JSON.stringify(view)) as ViewConfiguration)
      : {
          id: uid(),
          name: "",
          categoryId: null,
          noteTypeValue: "",
          columns: [
            { kind: "special", name: "File Name" },
          ],
          filters: [],
          defaultSort: [],
          order: plugin.store.data.views.length,
        };
  }
  onOpen(): void {
    this.modalEl.addClass("ntf-modal");
    this.render();
  }
  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.createEl("h2", { text: "View configuration" });
    const nameInput = input(root, "View name", this.draft.name, (v) => (this.draft.name = v));
    const appearance = root.createDiv({ cls: "ntf-appearance" });
    const colorGroup = appearance.createDiv();
    const colorLabel = colorGroup.createEl("label", { cls: "ntf-field" });
    colorLabel.createSpan({ text: "Color" });
    const color = colorLabel.createEl("input", { type: "color" });
    color.value = this.draft.color ?? "#808080";
    color.setAttribute("aria-label", "View button color");
    const resetColor = button(colorGroup, "Reset color", () => {
      delete this.draft.color;
      this.render();
    });
    resetColor.disabled = !this.draft.color;
    const iconGroup = appearance.createDiv();
    iconGroup.createDiv({ text: "Icon", cls: "ntf-field" });
    const iconButton = button(iconGroup, "Choose icon", () => {
      new ViewIconModal(this.app, (icon) => {
        this.draft.icon = icon;
        this.render();
      }).open();
    });
    viewLabel(iconButton, this.draft.icon ?? "Choose icon", this.draft.icon);
    button(iconGroup, "Remove icon", () => {
      delete this.draft.icon;
      this.render();
    }).disabled = !this.draft.icon;
    const preview = root.createDiv({ cls: "ntf-appearance-preview" });
    preview.createSpan({ text: "Button preview", cls: "ntf-muted" });
    const sample = preview.createEl("button", { type: "button", cls: "ntf-view-link", attr: { "aria-label": "View appearance preview", tabindex: "-1" } });
    viewLabel(sample, this.draft.name || "View name", this.draft.icon);
    nameInput.addEventListener("input", () => viewLabel(sample, this.draft.name || "View name", this.draft.icon));
    const updateColor = () => {
      if (this.draft.color) {
        sample.style.backgroundColor = this.draft.color;
        sample.style.color = contrastText(this.draft.color);
      }
    };
    updateColor();
    color.addEventListener("input", () => {
      this.draft.color = color.value;
      resetColor.disabled = false;
      updateColor();
    });
    const creationToggle = root.createEl("label", { cls: "ntf-option" });
    const enabled = creationToggle.createEl("input", { type: "checkbox" });
    enabled.checked = this.draft.addNew?.enabled ?? false;
    creationToggle.appendText("Enable add new");
    enabled.onchange = () => {
      this.draft.addNew = {
        templatePath: "",
        folderPath: "",
        ...this.draft.addNew,
        enabled: enabled.checked,
      };
      this.render();
    };
    if (this.draft.addNew?.enabled) {
      const settings = this.draft.addNew;
      input(root, "Filename", settings.filename ?? "", (value) => (settings.filename = value)).placeholder = "NewNote";
      input(
        root,
        "Template path",
        settings.templatePath,
        (value) => (settings.templatePath = value),
      ).placeholder = "Templates/Letter.md";
      input(
        root,
        "Default folder",
        settings.folderPath,
        (value) => (settings.folderPath = value),
      ).placeholder = "Letters (blank for vault root)";
      root.createEl("p", {
        text: "Use an existing template and folder. Add new copies the template as-is using the filename above (NewNote if blank), adds a number if needed, and opens it.",
      });
    }
    select(
      root,
      "Category",
      [
        ["", "Root"],
        ...this.plugin.store.data.categories.map(
          (c) =>
            [c.id, categoryPath(this.plugin.store.data.categories, c.id)] as [
              string,
              string,
            ],
        ),
      ],
      this.draft.categoryId ?? "",
      (v) => (this.draft.categoryId = v || null),
    );
    const types = this.plugin.index.types();
    if (this.draft.noteTypeValue && !types.includes(this.draft.noteTypeValue))
      types.push(this.draft.noteTypeValue);
    const typeSearch = input(root, "Search NoteType", "", () => {});
    const typeSelect = select(
      root,
      "Choose exactly one NoteType",
      [
        ["", "Select NoteType"],
        ...types.map((v) => [v, v] as [string, string]),
      ],
      this.draft.noteTypeValue,
      (v) => {
        this.draft.noteTypeValue = v;
        const props = coverage(this.plugin.index.notes(v));
        this.draft.columns = this.draft.columns.filter(
          (c) => c.kind === "special" || props.has(c.name),
        );
        this.draft.filters = this.draft.filters.filter(
          (f) => f.source === "fileName" || props.has(f.property),
        );
        this.draft.defaultSort = this.draft.defaultSort.filter(
          (s) => s.column.kind === "special" || props.has(s.column.name),
        );
        new Notice(
          "Properties rediscovered. Definitions absent from this NoteType were removed.",
        );
        this.render();
      },
    );
    typeSearch.addEventListener("input", () => {
      // Rebuild options rather than hiding them: native mobile pickers may ignore hidden.
      typeSelect.empty();
      typeSelect.createEl("option", { value: "", text: "Select NoteType" });
      for (const value of types)
        if (
          value === this.draft.noteTypeValue ||
          value
            .toLocaleLowerCase()
            .includes(typeSearch.value.toLocaleLowerCase())
        )
          typeSelect.createEl("option", { value, text: value });
      typeSelect.value = this.draft.noteTypeValue;
    });
    const notes = this.plugin.index.notes(this.draft.noteTypeValue),
      counts = coverage(notes);
    root.createEl("h3", {
      text: `Available properties (${notes.length} notes)`,
    });
    root.createEl("p", {
      text: "Choose columns and filters here. Filter values are selected later in the table.",
    });
    const available: Column[] = [
      ...SPECIALS.map((name) => ({ kind: "special" as const, name })),
      ...[...counts.keys()]
        .sort()
        .map((name) => ({ kind: "property" as const, name })),
    ];
    const search = input(root, "Search properties", "", () => {});
    const list = root.createDiv({ cls: "ntf-property-list" });
    const drawAvailable = () => {
      list.empty();
      for (const c of available.filter((c) =>
        c.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
      )) {
        const row = list.createDiv({ cls: "ntf-row" });
        const label = row.createEl("label");
        const check = label.createEl("input", { type: "checkbox" });
        check.checked = this.draft.columns.some(
          (x) => columnKey(x) === columnKey(c),
        );
        label.appendText(
          `${c.name}${c.kind === "property" ? ` — ${counts.get(c.name)} / ${notes.length}` : " (special)"}`,
        );
        check.onchange = () => {
          if (check.checked) this.draft.columns.push(c);
          else
            this.draft.columns = this.draft.columns.filter(
              (x) => columnKey(x) !== columnKey(c),
            );
          this.render();
        };
        if (c.kind === "property")
          button(row, "Add filter", () => {
            this.draft.filters.push({ property: c.name, mode: "smart" });
            this.render();
          }).disabled = this.draft.filters.some(
            (f) => !f.source && f.property === c.name,
          );
        else if (c.name === "File Name")
          button(row, "Add filter", () => {
            this.draft.filters.push({
              property: "File Name",
              mode: "text",
              source: "fileName",
            });
            this.render();
          }).disabled = this.draft.filters.some((f) => f.source === "fileName");
      }
    };
    search.addEventListener("input", drawAvailable);
    drawAvailable();
    root.createEl("h3", { text: "Columns" });
    this.draft.columns.forEach((c, i) => {
      const row = root.createDiv({ cls: "ntf-row" });
      row.createSpan({
        text: `${i + 1}. ${c.name}${c.kind === "property" && !counts.has(c.name) ? " (not currently found)" : ""}`,
      });
      orderButtons(row, this.draft.columns, i, () => this.render());
      button(row, "Remove", () => {
        this.draft.columns.splice(i, 1);
        this.render();
      });
    });
    root.createEl("h3", { text: "Filters" });
    this.draft.filters.forEach((f, i) => {
      const row = root.createDiv({ cls: "ntf-row ntf-filter-definition" });
      if (f.source === "fileName")
        row.createSpan({ text: "File Name (special) — Text (contains)" });
      else
        select(
          row,
          f.property,
          [
            ["smart", "Smart (searchable multi-select)"],
            ["text", "Text (contains)"],
            ["checkbox", "Checkbox (true / false)"],
          ],
          f.mode,
          (v) => (f.mode = v as "text" | "smart" | "checkbox"),
        );
      orderButtons(row, this.draft.filters, i, () => this.render());
      button(row, "Remove", () => {
        this.draft.filters.splice(i, 1);
        this.render();
      });
    });
    root.createEl("h3", { text: "Default sort" });
    this.draft.defaultSort.forEach((s, i) => {
      const row = root.createDiv({ cls: "ntf-row" });
      const opts = [...available];
      if (!opts.some((c) => columnKey(c) === columnKey(s.column)))
        opts.push(s.column);
      select(
        row,
        "Column",
        opts.map((c) => [columnKey(c), `${c.name} (${c.kind})`]),
        columnKey(s.column),
        (v) => {
          const selected = opts.find((c) => columnKey(c) === v);
          if (selected) s.column = { ...selected };
        },
      );
      select(
        row,
        "Direction",
        [
          ["asc", "Ascending"],
          ["desc", "Descending"],
        ],
        s.direction,
        (v) => (s.direction = v as "asc" | "desc"),
      );
      orderButtons(row, this.draft.defaultSort, i, () => this.render());
      button(row, "Remove", () => {
        this.draft.defaultSort.splice(i, 1);
        this.render();
      });
    });
    button(root, "Add sort level", () => {
      this.draft.defaultSort.push({
        column: { kind: "special", name: "File Name" },
        direction: "asc",
      });
      this.render();
    });
    const footer = root.createDiv({ cls: "ntf-actions" });
    button(footer, "Cancel", () => this.close());
    button(
      footer,
      "Save view",
      async () => {
        if (
          !this.draft.name.trim() ||
          !this.draft.noteTypeValue ||
          !this.draft.columns.length
        ) {
          new Notice(
            "Enter a name, choose a NoteType and select at least one column.",
          );
          return;
        }
        this.draft.name = this.draft.name.trim();
        if (this.draft.addNew?.enabled) {
          const { templatePath, folderPath } = validateCreation(
            this.app,
            this.draft.addNew,
          );
          this.draft.addNew.templatePath = templatePath;
          this.draft.addNew.folderPath = folderPath;
        }
        const data = this.plugin.store.data;
        const idx = data.views.findIndex((v) => v.id === this.draft.id);
        if (idx < 0) data.views.push(this.draft);
        else data.views[idx] = this.draft;
        data.viewStates[this.draft.id] = reconcile(
          this.draft,
          data.viewStates[this.draft.id] ?? { filterValues: {} },
        );
        data.activeViewId = this.draft.id;
        await this.plugin.store.flush();
        this.plugin.refresh();
        this.close();
      },
      "mod-cta",
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
