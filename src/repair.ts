import { matches } from "./core";
import { NoteRecord, ViewConfiguration, ViewRuntimeState, owns } from "./types";
/** Called only inside processFrontMatter after the user confirms a fixed candidate list. */
export function addMissing(
  fm: Record<string, unknown>,
  note: NoteRecord,
  view: ViewConfiguration,
  state: ViewRuntimeState,
  property: string,
  value: unknown,
): boolean {
  if (
    fm.NoteType !== view.noteTypeValue ||
    owns(fm, property) ||
    !matches({ ...note, properties: fm }, view.filters, state)
  )
    return false;
  Object.defineProperty(fm, property, {
    value: Array.isArray(value) ? [...value] : value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return true;
}
