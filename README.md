# NoteType Filters

An Obsidian desktop and mobile addon for reusable property tables organized by
`NoteType`. Save views, choose columns, filter and sort notes, organize views into
categories, and optionally edit properties or create notes from templates. No
Dataview dependency is required.

## Install with your GitHub plugin updater

1. Paste https://github.com/hanchan78/notetype-filters into your updater.
2. Select the `main` branch if the updater asks for a branch.
3. Install, reload Obsidian, and enable **NoteType Filters** under
   **Settings → Community plugins**.
4. Use the table ribbon icon or **NoteType Filters: Open saved views** command.

The finished `main.js`, `manifest.json`, and `styles.css` are tracked in the
repository root for direct download. Preserve your local `data.json` when updating;
it contains settings and saved views and is excluded from Git.

For manual installation, copy those three finished files to
`<vault>/.obsidian/plugins/notetype-filters/` and enable the plugin.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The manifest and package version are **1.0.1**. Commit the rebuilt root files when
publishing updates. See [the usage guide](docs/usage.md) for features, architecture,
and limitations. Tests simulate Obsidian; real desktop and mobile UI checks remain
manual.
