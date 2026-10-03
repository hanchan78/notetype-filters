import { normalize } from "./DataModel";
import { PluginData, ViewConfiguration, ViewRuntimeState } from "./types";

export function exportViews(data: PluginData): string {
  const { categories, views, viewStates, collapsed, activeViewId } = data;
  return JSON.stringify(
    {
      format: "notetype-filters-views",
      version: 1,
      categories,
      views,
      viewStates,
      collapsed,
      activeViewId,
    },
    null,
    2,
  );
}

export function importViews(text: string, current: PluginData): PluginData {
  const raw = JSON.parse(text);
  if (
    !raw ||
    raw.format !== "notetype-filters-views" ||
    raw.version !== 1 ||
    !Array.isArray(raw.views) ||
    !Array.isArray(raw.categories)
  )
    throw new Error("This is not a supported NoteType Filters export.");
  const data = normalize(raw);
  if (
    data.views.length !== raw.views.length ||
    data.categories.length !== raw.categories.length
  )
    throw new Error(
      "The export contains invalid or duplicate views or categories.",
    );
  data.excludedPaths = [...current.excludedPaths];
  return data;
}

export function viewLink(
  vault: string,
  view: ViewConfiguration,
  state: ViewRuntimeState,
): string {
  const params = new URLSearchParams({
    vault,
    view: view.id,
    state: JSON.stringify(state),
  });
  return `obsidian://notetype-filters?${params}`;
}

export function markdownViewLink(
  vault: string,
  view: ViewConfiguration,
  state: ViewRuntimeState,
): string {
  const label = view.name.replace(/\r?\n/g, " ").replace(/[\\\[\]]/g, "\\$&");
  return `[${label}](<${viewLink(vault, view, state)}>)`;
}

export function linkState(
  view: ViewConfiguration,
  text: string,
): ViewRuntimeState {
  const raw = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !raw.filterValues ||
    typeof raw.filterValues !== "object" ||
    Array.isArray(raw.filterValues)
  )
    throw new Error("Invalid view link filters.");
  return normalize({ views: [view], viewStates: { [view.id]: raw } })
    .viewStates[view.id]!;
}
