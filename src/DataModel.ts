import {
  Category,
  Column,
  PluginData,
  SPECIALS,
  ViewConfiguration,
  ViewRuntimeState,
} from "./types";
import { reconcile } from "./core";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const column = (v: unknown): v is Column =>
  object(v) &&
  typeof v.name === "string" &&
  (v.kind === "property" ||
    (v.kind === "special" && SPECIALS.includes(v.name as never)));
export function normalize(raw: unknown): PluginData {
  const data: PluginData = {
    version: 1,
    excludedPaths: [],
    categories: [],
    views: [],
    viewStates: Object.create(null) as Record<string, ViewRuntimeState>,
    collapsed: [],
  };
  if (!object(raw)) return data;
  if (Array.isArray(raw.excludedPaths))
    data.excludedPaths = raw.excludedPaths.filter((p): p is string => typeof p === "string");
  if (typeof raw.version === "number" && raw.version > 1)
    throw new Error(
      "This data was saved by a newer plugin version. Update the plugin before loading it.",
    );
  const cats = Array.isArray(raw.categories) ? raw.categories : [];
  for (const c of cats)
    if (
      object(c) &&
      typeof c.id === "string" &&
      typeof c.name === "string" &&
      !data.categories.some((x) => x.id === c.id)
    )
      data.categories.push({
        id: c.id,
        name: c.name,
        parentId: typeof c.parentId === "string" ? c.parentId : null,
        order: typeof c.order === "number" ? c.order : 0,
      });
  for (const c of data.categories) {
    const seen = new Set([c.id]);
    let p = c.parentId,
      depth = 1;
    while (p) {
      const parent = data.categories.find((x) => x.id === p);
      if (!parent || seen.has(p) || ++depth > 4) {
        c.parentId = null;
        break;
      }
      seen.add(p);
      p = parent.parentId;
    }
  }
  for (const v of Array.isArray(raw.views) ? raw.views : []) {
    if (
      !object(v) ||
      typeof v.id !== "string" ||
      typeof v.name !== "string" ||
      typeof v.noteTypeValue !== "string" ||
      data.views.some((x) => x.id === v.id)
    )
      continue;
    const view: ViewConfiguration = {
      id: v.id,
      name: v.name,
      noteTypeValue: v.noteTypeValue,
      categoryId:
        typeof v.categoryId === "string" &&
        data.categories.some((c) => c.id === v.categoryId)
          ? v.categoryId
          : null,
      order: typeof v.order === "number" ? v.order : 0,
      columns: Array.isArray(v.columns) ? v.columns.filter(column) : [],
      filters: [],
      defaultSort: [],
    };
    if (typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color))
      view.color = v.color;
    if (typeof v.icon === "string" && v.icon.trim()) view.icon = v.icon.trim();
    if (object(v.addNew))
      view.addNew = {
        enabled: v.addNew.enabled === true,
        ...(typeof v.addNew.filename === "string" ? { filename: v.addNew.filename } : {}),
        templatePath:
          typeof v.addNew.templatePath === "string"
            ? v.addNew.templatePath
            : "",
        folderPath:
          typeof v.addNew.folderPath === "string" ? v.addNew.folderPath : "",
      };
    for (const f of Array.isArray(v.filters) ? v.filters : []) {
      if (object(f) && f.source === "fileName") {
        if (!view.filters.some((x) => x.source === "fileName"))
          view.filters.push({
            property: "File Name",
            mode: "text",
            source: "fileName",
          });
      } else if (
        object(f) &&
        typeof f.property === "string" &&
        (f.mode === "text" || f.mode === "smart" || f.mode === "checkbox") &&
        !view.filters.some((x) => !x.source && x.property === f.property)
      )
        view.filters.push({ property: f.property, mode: f.mode });
    }
    for (const s of Array.isArray(v.defaultSort) ? v.defaultSort : []) {
      if (!object(s)) continue;
      // Version 1's editor accidentally saved column keys as [kind, name].
      // Recover those selections instead of discarding the user's sort rule.
      const savedColumn: unknown =
        Array.isArray(s.column) && s.column.length === 2
          ? { kind: s.column[0], name: s.column[1] }
          : s.column;
      if (
        column(savedColumn) &&
        (s.direction === "asc" || s.direction === "desc")
      )
        view.defaultSort.push({ column: savedColumn, direction: s.direction });
    }
    data.views.push(view);
    const state = object(raw.viewStates) ? raw.viewStates[v.id] : undefined;
    const runtime: ViewRuntimeState = {
      filterValues: Object.create(null) as Record<string, string | string[]>,
    };
    if (object(state) && typeof state.fileNameQuery === "string")
      runtime.fileNameQuery = state.fileNameQuery;
    if (object(state) && object(state.filterValues))
      for (const [key, value] of Object.entries(state.filterValues))
        if (
          typeof value === "string" ||
          (Array.isArray(value) && value.every((x) => typeof x === "string"))
        )
          runtime.filterValues[key] = value as string | string[];
    if (
      object(state) &&
      object(state.temporarySort) &&
      column(state.temporarySort.column) &&
      (state.temporarySort.direction === "asc" ||
        state.temporarySort.direction === "desc")
    )
      runtime.temporarySort = {
        column: state.temporarySort.column,
        direction: state.temporarySort.direction,
      };
    data.viewStates[v.id] = reconcile(view, runtime);
  }
  data.collapsed = Array.isArray(raw.collapsed)
    ? raw.collapsed.filter(
        (v): v is string =>
          typeof v === "string" && data.categories.some((c) => c.id === v),
      )
    : [];
  if (typeof raw.activeViewId === "string")
    data.activeViewId = raw.activeViewId;
  return data;
}
export function categoryPath(
  categories: Category[],
  id: string | null,
): string {
  if (!id) return "Root";
  const c = categories.find((x) => x.id === id);
  return c ? `${categoryPath(categories, c.parentId)} / ${c.name}` : "Root";
}
