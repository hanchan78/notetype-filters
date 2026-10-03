import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type NoteTypePlugin from "./main";
import { ViewSidebar } from "./ViewSidebar";
import { FilterBar } from "./FilterBar";
import { ResultsTable } from "./ResultsTable";
import { ViewEditorModal } from "./ViewEditorModal";
import { MissingPropertyModal } from "./MissingPropertyModal";
import { button } from "./ui";
import { matches } from "./core";
import { owns, ViewConfiguration } from "./types";
import { createNote } from "./NoteCreation";
import { viewLabel } from "./ViewAppearance";
import { markdownViewLink } from "./ViewTransfer";
export const VIEW_TYPE = "notetype-filters-workspace";
export class TableWorkspaceView extends ItemView {
  private sidebar: ViewSidebar;
  private sidebarEl!: HTMLElement;
  private mainEl!: HTMLElement;
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  private creating = false;
  private editMode = false;
  private closeOutsideFilters = (event: Event): void => {
    const path = event.composedPath();
    for (const dropdown of this.contentEl.querySelectorAll<HTMLDetailsElement>(
      ".ntf-filters details[open]",
    )) {
      if (!path.includes(dropdown)) dropdown.open = false;
    }
  };
  private navigationEl!: HTMLDetailsElement;
  collapseNavigation(): void {
    this.navigationEl.open = false;
  }
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: NoteTypePlugin,
  ) {
    super(leaf);
    this.sidebar = new ViewSidebar(plugin, () => this.render());
  }
  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return "NoteType Filters";
  }
  getIcon(): string {
    return "table-properties";
  }
  async onOpen(): Promise<void> {
    this.contentEl.ownerDocument.addEventListener("pointerdown", this.closeOutsideFilters, true);
    this.contentEl.empty();
    this.contentEl.addClass("ntf-workspace");
    const navigation = this.contentEl.createEl("details", {
      cls: "ntf-navigation",
    });
    navigation.open = true;
    this.navigationEl = navigation;
    navigation.createEl("summary", { text: "Saved views & organization" });
    this.sidebarEl = navigation.createDiv();
    this.mainEl = this.contentEl.createDiv({ cls: "ntf-main" });
    this.render();
  }
  render(): void {
    if (!this.mainEl) return;
    // Metadata changes must not discard an in-progress cell edit.
    if (
      (this.contentEl.ownerDocument.activeElement as HTMLElement | null)
        ?.dataset.cellEditor
    )
      return;
    // Preserve text cursor and open dropdowns through live updates and dependent filtering.
    const focused = this.contentEl.ownerDocument
      .activeElement as HTMLInputElement | null;
    const focusKey = focused?.dataset.focusKey,
      selection = focused?.selectionStart;
    const searchValue = focusKey?.startsWith("search:")
      ? focused?.value
      : undefined;
    const open = [
      ...this.mainEl.querySelectorAll<HTMLDetailsElement>("details[open]"),
    ].map((e) => e.dataset.filterProperty);
    const scroll =
      this.mainEl.querySelector(".ntf-table-scroll")?.scrollLeft ?? 0;
    this.sidebar.render(this.sidebarEl);
    this.mainEl.empty();
    const data = this.plugin.store.data,
      view = data.views.find((v) => v.id === data.activeViewId);
    if (!view) {
      this.mainEl.createEl("h2", { text: "NoteType Filters" });
      this.mainEl.createEl("p", {
        text: "Create a saved view or choose one from the sidebar. Each view browses one exact NoteType value.",
      });
      button(
        this.mainEl,
        "New View",
        () => new ViewEditorModal(this.plugin).open(),
        "mod-cta",
      );
      return;
    }
    const state = this.plugin.state(view.id),
      notes = this.plugin.index.notes(view.noteTypeValue);
    const heading = this.mainEl.createDiv({ cls: "ntf-view-heading" });
    viewLabel(heading.createEl("h2"), view.name, view.icon);
    button(heading, "Copy link to view", async () => {
      await navigator.clipboard.writeText(
        markdownViewLink(this.app.vault.getName(), view, state),
      );
      new Notice("View link copied.");
    });
    const actions = this.mainEl.createDiv({ cls: "ntf-actions" });
    button(actions, "Edit View", () =>
      new ViewEditorModal(this.plugin, view).open(),
    );
    button(actions, "Reset filters", () => {
      delete state.fileNameQuery;
      state.filterValues = Object.create(null) as Record<
        string,
        string | string[]
      >;
      this.changed();
    });
    const properties = [
      ...new Set(
        view.columns.filter((c) => c.kind === "property").map((c) => c.name),
      ),
    ];
    const missing = new Set<string>(),
      affected = new Set<string>();
    for (const n of notes)
      if (matches(n, view.filters, state))
        for (const p of properties)
          if (!owns(n.properties, p)) {
            missing.add(p);
            affected.add(n.path);
          }
    if (affected.size)
      button(actions, `Fix missing properties (${affected.size})`, () =>
        new MissingPropertyModal(this.plugin, view, [...missing]).open(),
      );
    const right = actions.createDiv({ cls: "ntf-actions-right" });
    const toggle = right.createEl("label", { cls: "ntf-edit-toggle" });
    const checkbox = toggle.createEl("input", { type: "checkbox" });
    checkbox.checked = this.editMode;
    toggle.appendText("Edit mode");
    checkbox.addEventListener("change", () => {
      this.editMode = checkbox.checked;
      this.render();
    });
    button(right, "Refresh", () => {
      this.plugin.index.rebuild();
      this.plugin.refresh();
    });
    new FilterBar(this.mainEl.createDiv({ cls: "ntf-filters" }), () => {
      this.plugin.store.save();
      clearTimeout(this.filterTimer);
      this.filterTimer = setTimeout(() => this.plugin.refresh(), 120);
    }).render(notes, view, state);
    new ResultsTable(
      this.app,
      this.mainEl.createDiv(),
      () => this.changed(),
      {
        busy: this.creating,
        run: () => this.addNote(view),
      },
      this.editMode
        ? {
            records: [...this.plugin.index.records.values()],
            saved: () => this.plugin.refresh(),
          }
        : undefined,
    ).render(notes, view, state);
    for (const el of this.mainEl.querySelectorAll<HTMLDetailsElement>(
      "details",
    ))
      if (open.includes(el.dataset.filterProperty)) el.open = true;
    if (focusKey) {
      const target = [
        ...this.mainEl.querySelectorAll<HTMLInputElement>("input"),
      ].find((e) => e.dataset.focusKey === focusKey);
      if (target) {
        if (searchValue !== undefined) {
          target.value = searchValue;
          target.dispatchEvent(new Event("input"));
        }
        target.focus();
        if (selection !== null && selection !== undefined)
          target.setSelectionRange(selection, selection);
      }
    }
    const scroller = this.mainEl.querySelector(".ntf-table-scroll");
    if (scroller) scroller.scrollLeft = scroll;
  }
  private changed(): void {
    this.plugin.store.save();
    this.plugin.refresh();
  }
  private async addNote(view: ViewConfiguration): Promise<void> {
    if (this.creating || !view.addNew?.enabled) return;
    this.creating = true;
    this.render();
    try {
      const file = await createNote(this.app, { ...view.addNew });
      try {
        await this.app.workspace.getLeaf("tab").openFile(file);
      } catch (error) {
        console.error("NoteType Filters: could not open new note", error);
        new Notice(
          `Created ${file.path}, but could not open it. You can open it from the file explorer.`,
        );
      }
    } finally {
      this.creating = false;
      this.render();
    }
  }
  async onClose(): Promise<void> {
    this.contentEl.ownerDocument.removeEventListener("pointerdown", this.closeOutsideFilters, true);
    clearTimeout(this.filterTimer);
    await this.plugin.store.flush();
    this.contentEl.empty();
  }
}
