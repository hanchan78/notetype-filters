# NoteType Filters

A standalone Obsidian desktop/mobile plugin for reusable property tables. No Dataview or other plugin is required. Normal browsing, filtering, sorting and organization never write to notes.

## Installation

### GitHub plugin updater

Paste this repository's GitHub URL into your GitHub plugin updater and use the
`main` branch. The finished `main.js`, `manifest.json`, and `styles.css` are tracked
in the repository root so the updater can download them directly. After installing,
reload Obsidian and enable **NoteType Filters** in **Settings → Community plugins**.
Keep your local `data.json` when updating; it contains your settings and saved views
and is excluded from this repository.

### Manual installation

The compiled plugin is already in this repository's root. Copy these three files into `<vault>/.obsidian/plugins/notetype-filters/`:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian and enable **NoteType Filters** in **Settings → Community plugins**. Click the table ribbon icon or run **NoteType Filters: Open saved views** from the command palette. On mobile, the command palette provides access if the ribbon is hidden.

Source files, tests and `node_modules` are not needed for installation. Keep your existing `data.json` when updating. Copy/sync it too if transferring your saved views to another device.

## Using the plugin

Below **View name**, choose an optional **Color** and **Icon**. The searchable icon picker uses Obsidian's built-in icon library and supports keyboard navigation. Icons appear beside the view title and in saved-view buttons. Buttons retain their chosen color with contrasting text. A vertical line to the left marks the selected view. A preview shows the button appearance. **Reset color** and **Remove icon** restore the defaults. No additional addons are required.

1. Click **New View**, name it, choose its category, and select one exact `NoteType` value. The NoteType selector has a search field.
2. The editor discovers all properties from matching notes and displays coverage counts. New views select only **File Name** by default. Select columns; use arrow buttons to order them. Property names are retained without aliases.
3. Add filters and choose **Text** (case-insensitive contains) or **Smart** (searchable multi-select). Configure ordered default sort levels. Actual filter values are selected in the workspace after saving.
4. Smart controls use actual typed values, including true/false, numbers and dates. Lists contribute their individual members. Values in one filter combine with OR; filters combine with AND.
5. Dropdown choices reflect the other filters. An incompatible selected value stays checked and is marked **unavailable**. Zero results never silently changes selections.
6. Click a column heading to cycle ascending → descending → configured default sorting. **Reset filters** clears only the current view's filter values, leaving its configuration and temporary sorting intact.

Filters and temporary sorting are remembered across navigation and restarts. Categories may nest four levels. **Edit organization** groups ordering, move and delete controls in padded cards. Rename views through **Edit View**. Categories must be empty before deletion; destructive actions require confirmation.

To filter filenames, open **Edit View**, click **Add filter** beside **File Name (special)**, and save. The File Name text field matches case-insensitive substrings of the filename without `.md`, combines with the other filters, and remembers its text across restarts. It remains separate from any frontmatter property named `File Name`.

On small screens, navigation appears above the table and can collapse. Tables scroll horizontally; controls do not require hover or drag-and-drop.

Click **Saved views & organization** to collapse or expand the panel on desktop or mobile. **Refresh**, at the right of the action bar, rebuilds the note index from Obsidian's metadata cache.

Enable **Edit mode** beside Refresh to edit note properties in the table. Changes save when a cell loses focus; Enter saves and Escape cancels the current edit. Text fields suggest existing values for the same property across the indexed vault. Dates remain plain text fields that accept pasted dates, without suggestions or date pickers. Numbers retain their numeric type; booleans accept `true` or `false`. Lists accept a JSON array of strings or a single text value. Special columns and structured object values remain read-only.

**Copy link to view**, beside the view title, copies a complete Markdown link containing the saved view ID, current filters and temporary sort. Paste it directly into another note without adding `[[…]]`. Opening it restores that state and collapses the navigation panel. The saved view must still exist in the target vault.

At the bottom of the saved views panel, **Export** downloads `notetype-filters-views.json`. **Import** replaces all saved views, categories, organization and saved filter states with the selected export. Local excluded paths are retained. Import does not merge organizations or modify notes.

## Fix missing properties

Missing means the property key is absent; an existing empty/null property is not missing. Missing selected property cells appear in the theme's error color.

**Fix missing properties (N)** shows the number of affected notes, not cells. Choose a selected property, a default type/value, then review and confirm the operation. Types: empty/null, text, number, boolean, date (`YYYY-MM-DD`), or a list of text values entered one per line.

The scope is **all notes matching the current NoteType and runtime filters**, including those beyond the 200 visible rows. The confirmation captures the candidate paths. Each write rechecks NoteType, active filters and property absence against the current frontmatter inside `FileManager.processFrontMatter()`. Existing values are never overwritten. Deleted/renamed candidates are skipped; per-file failures are reported. Metadata events refresh the index after writes.

This operation and inline editing modify existing notes. Obsidian's native frontmatter writer may normalize YAML formatting. A multi-note operation is sequential, not an atomic transaction; the completion notice reports added, skipped and failed counts.

## Add new notes from a template

The optional **Filename** field sets the name of new notes, with or without `.md`. Blank uses `NewNote`. Existing names receive a numeric suffix, such as `AllowanceStatements 1.md`.

In **New View** or **Edit View**, select **Enable add new**. Enter the vault-relative **Template path**, including `.md`, and the **Default folder**. Both must exist; leave the folder blank (or use `/`) for the vault root. Disabling the option hides the button and retains the configured paths.

When enabled, **Add new** appears at the right of the results-count row. Clicking it creates `NewNote.md`, or `NewNote 1.md`, `NewNote 2.md`, etc. if names are already taken, and opens the note in a new tab. There is no filename prompt. The template content is copied verbatim: placeholders are not expanded and no NoteType or filter values are injected. Set the template's NoteType if the new note should belong to the view. Current filters may hide the newly created note from the table.

Creation uses native vault APIs and never overwrites an existing note or the template. Missing templates/folders produce a notice. Third-party plugins may independently react to file creation; this plugin does not invoke any template engine.

## Architecture and important files

Global exclusions are configured in **Settings → NoteType Filters → Excluded paths**, one vault-relative file or folder path per line. For example, `/Templates` excludes that folder and all subdirectories from every view, NoteType discovery, and filter options. Changes apply immediately and are saved across restarts. Excluded templates remain available for **Add new**.

| File / class                                   | Responsibility                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/main.ts` / `NoteTypePlugin`               | Plugin lifecycle, ribbon/command, native event registration and workspace integration                     |
| `src/types.ts`                                 | Stable-ID categories, `ViewConfiguration`, separate `ViewRuntimeState`, typed special/property columns    |
| `src/VaultIndex.ts` / `VaultIndex`             | Initial metadata-cache index and incremental file updates; no file content reads                          |
| `src/core.ts`                                  | Value normalization, property coverage, filtering, dependent choices, multi-level sorting, capped results |
| `src/DataModel.ts`                             | Schema version 1 loading, validation and repair of invalid category references/depth/cycles               |
| `src/Persistence.ts` / `Persistence`           | `loadData()` / `saveData()`, debounced state persistence and serialized writes                            |
| `src/TableWorkspaceView.ts`                    | Workspace layout, view selection, runtime interactions and focus preservation                             |
| `src/ViewSidebar.ts`                           | Category/view navigation and explicit organization mode                                                   |
| `src/FilterBar.ts`, `src/ResultsTable.ts`      | Dependent filter controls and read-only table rendering                                                   |
| `src/ViewEditorModal.ts`                       | Configuration editor, property discovery/coverage and ordered definitions                                 |
| `src/MissingPropertyModal.ts`, `src/repair.ts` | Typed defaults, confirmation and guarded native frontmatter updates                                       |
| `src/ui.ts`                                    | Shared accessible native controls, confirmation and naming dialogs                                        |
| `styles.css`                                   | Theme-aware responsive workspace, tables and dialogs                                                      |
| `tests/`                                       | Pure logic tests and DOM/API integration tests with a simulated Obsidian host                             |

The native APIs used follow the [official Obsidian API definitions](https://github.com/obsidianmd/obsidian-api).

## Implementation decisions

- `NoteType` is a scalar string with exact, case-sensitive matching. Lists are supported for other properties. Special columns have a separate identity, so a property named `Folder` cannot collide with the special column.
- Numbers and booleans retain their types for equality; numeric `2027` is distinct from text `"2027"`. Text filters search their displayed representation. Dates use exact stored values; ISO dates sort naturally. Objects render as JSON; internal `[[wiki links]]` retain clickable behavior.
- Missing/null sort after populated values in both directions. Sorting uses numeric-aware locale comparison, numeric arithmetic for numbers, and deterministic path tie-breaking.
- Candidates are sorted in memory before testing filters. Matching stops at the 201st match and renders only 200. Dependent-choice discovery and missing-property counts may separately inspect the full candidate set, as those features need that information. No exact total beyond 200 is computed for the result status.
- Dropdowns show up to 200 matching unselected choices plus every selected value. Searching covers the complete choices, limiting DOM size for high-cardinality properties.
- Metadata refreshes debounce at 150 ms; interactive filter rendering at 120 ms; persistence at 350 ms. Writes are serialized to prevent older snapshots from winning. Pending data is flushed on workspace close, document hiding and plugin unload. Abrupt process termination can still lose the most recent unsaved interaction.
- View edits retain compatible runtime state and remove values for deleted or mode-changed filters. Changing NoteType rediscovers properties and explicitly reports cleanup. Existing definitions whose properties disappear due to external edits remain visible as missing instead of disappearing silently.
- Schema-less earlier data with recognizable fields is normalized. Unknown newer schema versions fail safely without overwriting data. Invalid references recover to the root category.

## Development and validation

Use Node.js 22 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`main.js` is a bundled CommonJS Obsidian plugin with only `obsidian` external. All packages in `package.json` are development dependencies; no Node/Electron APIs are used by the plugin runtime. The lockfile pins installed versions.

Tests cover discovery/coverage, missing values, write guards, OR/AND/list filters, dependent choices, incompatible selections, persistent state and reset isolation, sorting/header cycling, the 200-row boundary, schema recovery, organization safety, editor behavior, native event updates, and read-only note opening. DOM integration tests simulate the Obsidian host; they do not modify real vault notes.

## Limitations and manual checks

- Actual desktop and mobile Obsidian rendering has not been exercised automatically. Verify theme appearance, mobile scrolling and real restart restoration after enabling the plugin.
- The index uses Obsidian's metadata cache. Malformed frontmatter may have no usable cached properties and therefore may not qualify for a NoteType view until corrected.
- Smart numeric/date filtering is equality selection, without ranges or a query language. Bulk list defaults contain text items.
- Categories are ordered among sibling categories and views among sibling views. Views can move between categories; existing category subtrees are not reparented. Category creation supports choosing a parent via **New subcategory**.
- Plugin-data synchronization follows Obsidian's normal file sync behavior; concurrent edits across devices are not merged by this plugin.

Suggested real-host smoke check: create a Material view with a sparsely populated column, select two smart values, change a dependent filter to obtain zero results, reopen/restart and confirm state is retained, reset it, then test a confirmed missing-property repair on disposable notes. Also test rename/delete and an external property edit while the workspace is open.
