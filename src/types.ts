export type Special = "File Name" | "Folder" | "Created" | "Modified";
export type Column =
  { kind: "property"; name: string } | { kind: "special"; name: Special };
export interface FilterDefinition {
  property: string;
  mode: "text" | "smart" | "checkbox";
  source?: "fileName";
}
export interface SortLevel {
  column: Column;
  direction: "asc" | "desc";
}
export interface ViewConfiguration {
  color?: string;
  icon?: string;
  addNew?: { enabled: boolean; templatePath: string; folderPath: string; filename?: string };
  id: string;
  name: string;
  categoryId: string | null;
  noteTypeValue: string;
  columns: Column[];
  filters: FilterDefinition[];
  defaultSort: SortLevel[];
  order: number;
}
export interface ViewRuntimeState {
  filterValues: Record<string, string | string[]>;
  fileNameQuery?: string;
  temporarySort?: SortLevel;
}
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}
export interface PluginData {
  version: 1;
  excludedPaths: string[];
  categories: Category[];
  views: ViewConfiguration[];
  viewStates: Record<string, ViewRuntimeState>;
  collapsed: string[];
  activeViewId?: string;
}
export interface NoteRecord {
  path: string;
  name: string;
  folder: string;
  ctime: number;
  mtime: number;
  properties: Record<string, unknown>;
}
export const SPECIALS: Special[] = [
  "File Name",
  "Folder",
  "Created",
  "Modified",
];
export const columnKey = (c: Column): string =>
  JSON.stringify([c.kind, c.name]);
export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const owns = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);
