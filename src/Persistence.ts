import { Notice, Plugin } from "obsidian";
import { PluginData } from "./types";
import { normalize } from "./DataModel";
export { categoryPath } from "./DataModel";
export class Persistence {
  data: PluginData = normalize(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private loaded = false;
  constructor(private plugin: Plugin) {}
  async load(): Promise<void> {
    this.data = normalize(await this.plugin.loadData());
    this.loaded = true;
  }
  save(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 350);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.loaded) return this.queue;
    const snapshot = JSON.parse(JSON.stringify(this.data)) as PluginData;
    this.queue = this.queue
      .then(() => this.plugin.saveData(snapshot))
      .catch((error) => {
        console.error("NoteType Filters: save failed", error);
        new Notice(
          "Could not save NoteType Filters data. Check storage and try again.",
        );
      });
    return this.queue;
  }
}
