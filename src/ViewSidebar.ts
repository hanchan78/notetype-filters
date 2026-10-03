import { Notice } from "obsidian";
import type NoteTypePlugin from "./main";
import { Category, ViewConfiguration, uid } from "./types";
import { button, ConfirmModal, NameModal, select, move } from "./ui";
import { categoryPath } from "./Persistence";
import { ViewEditorModal } from "./ViewEditorModal";
import { contrastText, viewLabel } from "./ViewAppearance";
import { exportViews, importViews } from "./ViewTransfer";
export class ViewSidebar {
  editing = false;
  constructor(
    private plugin: NoteTypePlugin,
    private change: () => void,
  ) {}
  render(root: HTMLElement): void {
    root.empty();
    root.toggleClass("ntf-organizing", this.editing);
    root.createEl("h3", { text: "Saved views" });
    const toolbar = root.createDiv({ cls: "ntf-nav-toolbar" });
    button(
      toolbar,
      "New View",
      () => new ViewEditorModal(this.plugin).open(),
      "mod-cta",
    );
    button(
      toolbar,
      this.editing ? "Done organizing" : "Edit organization",
      () => {
        this.editing = !this.editing;
        this.change();
      },
    );
    if (this.editing)
      button(toolbar, "New root category", () => this.create(null));
    this.branch(root, null, 1);
    const transfer = root.createDiv({ cls: "ntf-actions ntf-transfer" });
    button(transfer, "Export", () => {
      const url = URL.createObjectURL(
        new Blob([exportViews(this.plugin.store.data)], {
          type: "application/json",
        }),
      );
      const link = root.createEl("a", { href: url });
      link.download = "notetype-filters-views.json";
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const picker = root.createEl("input", {
      type: "file",
      attr: {
        accept: ".json,application/json",
        "aria-label": "Import saved views",
      },
    });
    picker.hidden = true;
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      picker.value = "";
      if (!file) return;
      void file
        .text()
        .then((text) => {
          this.plugin.store.data = importViews(text, this.plugin.store.data);
          this.save();
          new Notice("Saved views and organization imported.");
        })
        .catch((error) => new Notice(`Import failed: ${String(error)}`));
    });
    button(transfer, "Import", () => picker.click());
  }
  private save(): void {
    this.plugin.store.save();
    this.plugin.refresh();
  }
  private create(parentId: string | null): void {
    new NameModal(this.plugin.app, "New category", "", (name) => {
      this.plugin.store.data.categories.push({
        id: uid(),
        name,
        parentId,
        order: this.plugin.store.data.categories.length,
      });
      this.save();
    }).open();
  }
  private ordering<T extends Category | ViewConfiguration>(
    root: HTMLElement,
    item: T,
    items: T[],
  ): void {
    for (const [label, delta] of [
      ["↑", -1],
      ["↓", 1],
    ] as const)
      button(root, label, () => {
        const i = items.indexOf(item);
        move(items, i, delta);
        items.forEach((v, index) => (v.order = index));
        this.save();
      }).disabled =
        delta === -1 ? items[0] === item : items[items.length - 1] === item;
  }
  private branch(
    root: HTMLElement,
    parentId: string | null,
    depth: number,
  ): void {
    const data = this.plugin.store.data;
    const views = data.views
      .filter((v) => v.categoryId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const view of views) {
      const row = root.createDiv({ cls: "ntf-nav-item" });
      const open = button(
        row,
        view.name,
        () => {
          data.activeViewId = view.id;
          this.save();
        },
        "ntf-view-link",
      );
      open.toggleClass("is-active", data.activeViewId === view.id);
      open.setAttribute(
        "aria-current",
        data.activeViewId === view.id ? "true" : "false",
      );
      viewLabel(open, view.name, view.icon);
      if (view.color) {
        open.style.backgroundColor = view.color;
        open.style.color = contrastText(view.color);
      }
      if (this.editing) {
        const actions = row.createDiv({
          cls: "ntf-actions ntf-organize-order",
        });
        this.ordering(actions, view, views);
        const destination = select(
          row.createDiv({ cls: "ntf-organize-move" }),
          "Move to",
          [
            ["", "Root"],
            ...data.categories.map(
              (c) =>
                [c.id, categoryPath(data.categories, c.id)] as [string, string],
            ),
          ],
          view.categoryId ?? "",
          (id) => {
            view.categoryId = id || null;
            view.order = Date.now();
            this.save();
          },
        );
        destination.setAttribute("aria-label", `Move ${view.name} to category`);
        destination.previousElementSibling?.remove();
        button(
          actions.createDiv({ cls: "ntf-organize-delete" }),
          "Delete",
          () =>
            new ConfirmModal(
              this.plugin.app,
              `Delete saved view “${view.name}” and its filter state? Notes will remain in the vault.`,
              () => {
                data.views = data.views.filter((v) => v.id !== view.id);
                delete data.viewStates[view.id];
                if (data.activeViewId === view.id) delete data.activeViewId;
                this.save();
              },
            ).open(),
        );
      }
    }
    const categories = data.categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    for (const category of categories) {
      const row = root.createDiv({ cls: "ntf-category" });
      const collapsed = data.collapsed.includes(category.id);
      button(
        row,
        `${collapsed ? "▸" : "▾"} ${category.name}`,
        () => {
          data.collapsed = collapsed
            ? data.collapsed.filter((id) => id !== category.id)
            : [...data.collapsed, category.id];
          this.save();
        },
        "ntf-category-toggle",
      );
      if (this.editing) {
        const actions = row.createDiv({
          cls: "ntf-actions ntf-organize-order",
        });
        this.ordering(actions, category, categories);
        if (depth < 4)
          button(row.createDiv({ cls: "ntf-actions" }), "New subcategory", () =>
            this.create(category.id),
          );
        button(
          actions.createDiv({ cls: "ntf-organize-delete" }),
          "Delete",
          () => {
            if (
              data.categories.some((c) => c.parentId === category.id) ||
              data.views.some((v) => v.categoryId === category.id)
            ) {
              new Notice("Empty this category before deleting it.");
              return;
            }
            new ConfirmModal(
              this.plugin.app,
              `Delete empty category “${category.name}”?`,
              () => {
                data.categories = data.categories.filter(
                  (c) => c.id !== category.id,
                );
                data.collapsed = data.collapsed.filter(
                  (id) => id !== category.id,
                );
                this.save();
              },
            ).open();
          },
        );
      }
      if (!collapsed || this.editing)
        this.branch(
          row.createDiv({ cls: "ntf-branch" }),
          category.id,
          depth + 1,
        );
    }
  }
}
