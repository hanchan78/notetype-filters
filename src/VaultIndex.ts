import { App, TFile } from "obsidian";
import { NoteRecord } from "./types";
export class VaultIndex {
  readonly records = new Map<string, NoteRecord>();
  private readonly byType = new Map<string, Set<string>>();
  constructor(private app: App, private excludedPaths: () => string[] = () => []) {}
  rebuild(): void {
    this.records.clear();
    this.byType.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.update(file);
  }
  update(file: TFile): void {
    this.remove(file.path);
    if (file.extension !== "md" || this.excludedPaths().some((value) => {
      const path = value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
      return path !== "" && (file.path === path || file.path.startsWith(path + "/"));
    })) {
      return;
    }
    const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const properties: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    if (raw)
      for (const key of Object.keys(raw))
        if (key !== "position") properties[key] = raw[key];
    this.records.set(file.path, {
      path: file.path,
      name: file.basename,
      folder: file.parent?.path === "/" ? "" : (file.parent?.path ?? ""),
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      properties,
    });
    if (typeof properties.NoteType === "string") {
      const paths = this.byType.get(properties.NoteType) ?? new Set<string>();
      paths.add(file.path);
      this.byType.set(properties.NoteType, paths);
    }
  }
  remove(path: string): void {
    const type = this.records.get(path)?.properties.NoteType;
    if (typeof type === "string") {
      const paths = this.byType.get(type);
      paths?.delete(path);
      if (!paths?.size) this.byType.delete(type);
    }
    this.records.delete(path);
  }
  notes(type: string): NoteRecord[] {
    const notes: NoteRecord[] = [];
    for (const path of this.byType.get(type) ?? []) {
      const note = this.records.get(path);
      if (note) notes.push(note);
    }
    return notes;
  }
  types(): string[] {
    return [...this.byType.keys()].sort((a, b) => a.localeCompare(b));
  }
}
