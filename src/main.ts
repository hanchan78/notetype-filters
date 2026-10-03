import { Plugin, TFile, TFolder, Notice } from "obsidian";
import { VaultIndex } from "./VaultIndex";
import { Persistence } from "./Persistence";
import { TableWorkspaceView, VIEW_TYPE } from "./TableWorkspaceView";
import { ViewRuntimeState } from "./types";
import { NoteTypeSettingsTab } from "./SettingsTab";
import { linkState } from "./ViewTransfer";
export default class NoteTypePlugin extends Plugin {
  index!: VaultIndex;
  store!: Persistence;
  private timer: ReturnType<typeof setTimeout> | undefined;
  async onload(): Promise<void> {
    this.store = new Persistence(this);
    try {
      await this.store.load();
    } catch (error) {
      new Notice(
        `NoteType Filters could not load data: ${String(error)}`,
        10000,
      );
      throw error;
    }
    this.index = new VaultIndex(this.app, () => this.store.data.excludedPaths);
    this.addSettingTab(new NoteTypeSettingsTab(this));
    this.registerView(VIEW_TYPE, (leaf) => new TableWorkspaceView(leaf, this));
    this.registerObsidianProtocolHandler("notetype-filters", (params) => {
      void this.openViewLink(params).catch(
        (error) => new Notice(String(error)),
      );
    });
    this.addRibbonIcon("table-properties", "Open NoteType Filters", () => {
      void this.open();
    });
    this.addCommand({
      id: "open-workspace",
      name: "Open saved views",
      callback: () => {
        void this.open();
      },
    });
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 150);
    };
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.index.update(file);
        schedule();
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.index.update(file);
          schedule();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          this.index.update(file);
          schedule();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        for (const path of this.index.records.keys())
          if (
            path === file.path ||
            (file instanceof TFolder && path.startsWith(file.path + "/"))
          )
            this.index.remove(path);
        schedule();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        for (const path of this.index.records.keys())
          if (
            path === oldPath ||
            (file instanceof TFolder && path.startsWith(oldPath + "/"))
          )
            this.index.remove(path);
        if (file instanceof TFile) this.index.update(file);
        else if (file instanceof TFolder) {
          const walk = (folder: TFolder): void => {
            for (const child of folder.children)
              if (child instanceof TFile) this.index.update(child);
              else if (child instanceof TFolder) walk(child);
          };
          walk(file);
        }
        schedule();
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      this.index.rebuild();
      this.refresh();
    });
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.hidden) void this.store.flush();
    });
  }
  state(id: string): ViewRuntimeState {
    return (
      this.store.data.viewStates[id] ??
      (this.store.data.viewStates[id] = {
        filterValues: Object.create(null) as Record<string, string | string[]>,
      })
    );
  }
  refresh(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof TableWorkspaceView) leaf.view.render();
  }
  async openViewLink(params: Record<string, string>): Promise<void> {
    const view = this.store.data.views.find((v) => v.id === params.view);
    if (!view)
      throw new Error("This saved view no longer exists in this vault.");
    const state = linkState(view, params.state ?? '{"filterValues":{}}');
    this.store.data.viewStates[view.id] = state;
    this.store.data.activeViewId = view.id;
    this.store.save();
    await this.open();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof TableWorkspaceView) {
        leaf.view.collapseNavigation();
        leaf.view.render();
      }
  }
  private async open(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  onunload(): void {
    clearTimeout(this.timer);
    void this.store?.flush();
  }
}
