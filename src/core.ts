import {
  Column,
  FilterDefinition,
  NoteRecord,
  SortLevel,
  ViewConfiguration,
  ViewRuntimeState,
  owns,
} from "./types";
export function display(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return elements(value).map(display).join(", ");
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? "[Invalid date]"
      : value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Unsupported value]";
    }
  }
  return String(value);
}
export function token(value: unknown): string {
  return JSON.stringify([
    value === null ? "null" : typeof value,
    display(value),
  ]);
}
export function tokenLabel(value: string): string {
  try {
    const pair: unknown = JSON.parse(value);
    return Array.isArray(pair) ? String(pair[1] || "(empty)") : value;
  } catch {
    return value;
  }
}
export function elements(value: unknown): unknown[] {
  const seen = new Set<unknown>();
  const flatten = (item: unknown, depth: number): unknown[] => {
    if (!Array.isArray(item)) return [item];
    if (seen.has(item) || depth > 32) return ["[Unsupported list]"];
    seen.add(item);
    const result = item.flatMap((child) => flatten(child, depth + 1));
    seen.delete(item);
    return result;
  };
  return flatten(value, 0);
}
export function matchesType(note: NoteRecord, type: string): boolean {
  return (
    !Array.isArray(note.properties.NoteType) &&
    typeof note.properties.NoteType === "string" &&
    note.properties.NoteType === type
  );
}
export function matches(
  note: NoteRecord,
  definitions: FilterDefinition[],
  state: ViewRuntimeState,
  ignore?: string,
): boolean {
  return definitions.every((f) => {
    if (f.source === "fileName")
      return note.name
        .toLocaleLowerCase()
        .includes((state.fileNameQuery ?? "").toLocaleLowerCase());
    if (f.property === ignore) return true;
    const value = owns(state.filterValues, f.property)
      ? state.filterValues[f.property]
      : undefined;
    if (!value || value.length === 0) return true;
    if (!owns(note.properties, f.property)) return false;
    if (f.mode === "checkbox")
      return (
        typeof note.properties[f.property] === "boolean" &&
        Array.isArray(value) &&
        value.includes(token(note.properties[f.property]))
      );
    if (f.mode === "text")
      return display(note.properties[f.property])
        .toLocaleLowerCase()
        .includes(String(value).toLocaleLowerCase());
    return (
      Array.isArray(value) &&
      elements(note.properties[f.property]).some((v) =>
        value.includes(token(v)),
      )
    );
  });
}
export function choices(
  notes: NoteRecord[],
  view: ViewConfiguration,
  state: ViewRuntimeState,
  property: string,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  // Ignore this filter, apply all others; retain incompatible selections visibly.
  for (const n of notes)
    if (
      matches(n, view.filters, state, property) &&
      owns(n.properties, property)
    )
      for (const v of elements(n.properties[property]))
        result.set(token(v), true);
  const selected = owns(state.filterValues, property)
    ? state.filterValues[property]
    : undefined;
  if (Array.isArray(selected))
    for (const v of selected) if (!result.has(v)) result.set(v, false);
  return result;
}
export function valueOf(n: NoteRecord, c: Column): unknown {
  if (c.kind === "property")
    return owns(n.properties, c.name) ? n.properties[c.name] : undefined;
  switch (c.name) {
    case "File Name":
      return n.name;
    case "Folder":
      return n.folder;
    case "Created":
      return n.ctime;
    case "Modified":
      return n.mtime;
    default:
      return undefined;
  }
}
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
export function compare(
  a: NoteRecord,
  b: NoteRecord,
  levels: SortLevel[],
): number {
  for (const level of levels) {
    const x = valueOf(a, level.column),
      y = valueOf(b, level.column);
    // Missing and null values are last in BOTH directions.
    if (x == null || y == null) {
      if (x == null && y != null) return 1;
      if (y == null && x != null) return -1;
      continue;
    }
    const result =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : collator.compare(display(x), display(y));
    if (result) return level.direction === "asc" ? result : -result;
  }
  return collator.compare(a.path, b.path) || a.path.localeCompare(b.path);
}
export function results(
  notes: NoteRecord[],
  view: ViewConfiguration,
  state: ViewRuntimeState,
): { rows: NoteRecord[]; more: boolean } {
  const sorted = [...notes].sort((a, b) =>
    compare(
      a,
      b,
      state.temporarySort ? [state.temporarySort] : view.defaultSort,
    ),
  );
  const rows: NoteRecord[] = [];
  for (const n of sorted)
    if (matches(n, view.filters, state)) {
      if (rows.length === 200) return { rows, more: true };
      rows.push(n);
    }
  return { rows, more: false };
}
export function coverage(notes: NoteRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes)
    for (const p of Object.keys(n.properties))
      counts.set(p, (counts.get(p) ?? 0) + 1);
  return counts;
}
export function reconcile(
  view: ViewConfiguration,
  state: ViewRuntimeState,
): ViewRuntimeState {
  const filterValues: Record<string, string | string[]> = Object.create(
    null,
  ) as Record<string, string | string[]>;
  for (const f of view.filters) {
    if (f.source === "fileName") continue;
    const v = state.filterValues[f.property];
    if (
      (f.mode === "text" && typeof v === "string") ||
      ((f.mode === "smart" || f.mode === "checkbox") && Array.isArray(v))
    )
      filterValues[f.property] =
        f.mode === "checkbox" && Array.isArray(v)
          ? v.filter((value) => value === token(true) || value === token(false))
          : v!;
  }
  return {
    filterValues,
    fileNameQuery: view.filters.some((f) => f.source === "fileName")
      ? state.fileNameQuery
      : undefined,
    temporarySort:
      state.temporarySort &&
      view.columns.some(
        (c) =>
          JSON.stringify(c) === JSON.stringify(state.temporarySort!.column),
      )
        ? state.temporarySort
        : undefined,
  };
}
