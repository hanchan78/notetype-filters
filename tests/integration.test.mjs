import test from "node:test";
import assert from "node:assert/strict";
import {
  Modal,
  Notice,
  Platform,
  TFile,
  TFolder,
  createApp,
} from "./obsidian-mock.mjs";
import { createNote } from "../src/NoteCreation.ts";
import NoteTypePlugin from "../src/main.ts";
import { TableWorkspaceView } from "../src/TableWorkspaceView.ts";
import { ViewEditorModal } from "../src/ViewEditorModal.ts";
import { MissingPropertyModal } from "../src/MissingPropertyModal.ts";
import { Persistence } from "../src/Persistence.ts";
import { normalize } from "../src/DataModel.ts";
import { token } from "../src/core.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("filter dropdowns stay open for multiple selections and close on outside interaction", async () => {
  const f = await fixture();
  try {
    const root = f.workspace.contentEl;
    let dropdown = root.querySelector('details[data-filter-property="Year"]');
    dropdown.open = true;
    const choices = [...dropdown.querySelectorAll('input[type="checkbox"]')];
    for (const choice of choices) {
      choice.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
      assert.equal(dropdown.open, true);
      choice.click();
    }
    assert.equal(f.plugin.state("v").filterValues.Year.length, 2);
    f.plugin.refresh();
    dropdown = root.querySelector('details[data-filter-property="Year"]');
    assert.equal(dropdown.open, true);
    const other = root.querySelector('details[data-filter-property="OutlineFor"]');
    other.querySelector('summary').dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    assert.equal(dropdown.open, false);
    other.open = true;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    assert.equal(other.open, false);
    assert.equal(f.plugin.state("v").filterValues.Year.length, 2);
    f.plugin.refresh();
    assert.equal(root.querySelector('details[data-filter-property="Year"]').open, false);
  } finally { await f.close(); }
});
test("inline editing saves on blur, preserves drafts through updates and offers text suggestions", async () => {
  const f = await fixture();
  try {
    const toggle = f.workspace.contentEl.querySelector(
      ".ntf-edit-toggle input",
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    const editor = f.workspace.contentEl.querySelector(
      'input[aria-label="Theme of a"]',
    );
    editor.focus();
    assert.equal(editor.value, "Alpha");
    assert.equal(
      editor.parentElement.querySelector(".ntf-cell-suggestions").hidden,
      false,
    );
    change(editor, "Draft");
    f.plugin.refresh();
    assert.equal(
      f.workspace.contentEl.querySelector('input[aria-label="Theme of a"]'),
      editor,
    );
    assert.equal(f.files[0].frontmatter.Theme, "Alpha");
    editor.blur();
    await tick();
    assert.equal(f.files[0].frontmatter.Theme, "Draft");
    assert.deepEqual(f.app.writes, ["a.md"]);
    const missing = f.workspace.contentEl.querySelector(
      'input[aria-label="Theme of b"]',
    );
    missing.focus();
    change(missing, "Beta");
    missing.blur();
    await tick();
    assert.equal(f.files[1].frontmatter.Theme, "Beta");
  } finally {
    await f.close();
  }
});

test("date editors accept pasted text without suggestions and numbers retain their type", async () => {
  const f = await fixture();
  try {
    f.files[0].frontmatter.When = "2026-10-02";
    f.plugin.store.data.views[0].columns = [
      { kind: "property", name: "When" },
      { kind: "property", name: "Year" },
    ];
    f.plugin.index.rebuild();
    f.workspace.render();
    const toggle = f.workspace.contentEl.querySelector(
      ".ntf-edit-toggle input",
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    const date = f.workspace.contentEl.querySelector(
      'input[aria-label="When of a"]',
    );
    assert.equal(date.type, "text");
    assert.equal(
      date.parentElement.querySelector(".ntf-cell-suggestions"),
      null,
    );
    date.focus();
    change(date, "2026-11-03");
    date.blur();
    await tick();
    assert.equal(f.files[0].frontmatter.When, "2026-11-03");
    const number = f.workspace.contentEl.querySelector(
      'input[aria-label="Year of a"]',
    );
    number.focus();
    change(number, "2030");
    number.blur();
    await tick();
    assert.equal(f.files[0].frontmatter.Year, 2030);
  } finally {
    await f.close();
  }
});

test("Refresh rebuilds the index and view links restore filters with navigation collapsed", async () => {
  const f = await fixture();
  try {
    f.plugin.index.records.clear();
    await click(f.workspace.contentEl, "Refresh");
    assert.equal(f.plugin.index.records.size, 3);
    await f.plugin.openViewLink({
      view: "v",
      state: JSON.stringify({ filterValues: { Year: [token(2027)] } }),
    });
    assert.deepEqual(f.plugin.state("v").filterValues.Year, [token(2027)]);
    assert.equal(
      f.workspace.contentEl.querySelector(".ntf-navigation").open,
      false,
    );
    assert.equal(f.workspace.contentEl.querySelectorAll("tbody tr").length, 1);
    await assert.rejects(f.plugin.openViewLink({ view: "missing" }));
  } finally {
    await f.close();
  }
});
const click = async (root, text) => {
  const button = [...root.querySelectorAll("button")].find(
    (e) => e.textContent === text,
  );
  assert.ok(button, `Button ${text} exists`);
  button.click();
  await tick();
};
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
};
const field = (root, text) =>
  [...root.querySelectorAll("label")]
    .find((el) => el.firstChild?.textContent === text)
    ?.querySelector("input,select,textarea");
const config = () => ({
  id: "v",
  name: "Talks",
  categoryId: null,
  noteTypeValue: "Material",
  columns: [
    { kind: "special", name: "File Name" },
    { kind: "property", name: "Theme" },
    { kind: "special", name: "Open" },
  ],
  filters: [
    { property: "Year", mode: "smart" },
    { property: "OutlineFor", mode: "smart" },
  ],
  defaultSort: [
    { column: { kind: "special", name: "File Name" }, direction: "desc" },
  ],
  order: 0,
});
async function fixture() {
  const files = [
    new TFile("a.md", {
      NoteType: "Material",
      Year: 2027,
      OutlineFor: "CPioM",
      Theme: "Alpha",
    }),
    new TFile("b.md", { NoteType: "Material", Year: 2026, OutlineFor: "CA" }),
    new TFile("person.md", { NoteType: "Person" }),
  ];
  const app = createApp(files);
  const plugin = new NoteTypePlugin(app);
  await plugin.onload();
  plugin.store.data = normalize({ views: [config()], activeViewId: "v" });
  const workspace = new TableWorkspaceView({ app }, plugin);
  app.leaves.push({ view: workspace });
  await workspace.onOpen();
  return {
    files,
    app,
    plugin,
    workspace,
    async close() {
      for (const modal of [...Modal.opened]) modal.close();
      await workspace.onClose();
      plugin.onunload();
      for (const cleanup of plugin.cleanups) cleanup();
      document.body.replaceChildren();
    },
  };
}
test("view appearance persists, searches native icons, preserves selected colors and resets", async () => {
  const f = await fixture();
  try {
    const editor = new ViewEditorModal(f.plugin, f.plugin.store.data.views[0]);
    editor.open();
    change(field(editor.contentEl, "Color"), "#ffffff");
    await click(editor.contentEl, "Choose icon");
    const picker = Modal.opened.at(-1);
    assert.deepEqual(picker.getSuggestions("BOOK"), ["lucide-book"]);
    assert.deepEqual(picker.getSuggestions("no-match"), []);
    const suggestion = document.createElement("div");
    picker.renderSuggestion("lucide-book", suggestion);
    assert.ok(suggestion.querySelector('svg[data-icon="lucide-book"]'));
    picker.onChooseSuggestion("lucide-book");
    picker.close();
    await click(editor.contentEl, "Save view");
    f.plugin.store.data = normalize(f.plugin.saved);
    const view = f.plugin.store.data.views[0];
    assert.equal(view.color, "#ffffff");
    assert.equal(view.icon, "lucide-book");
    f.workspace.render();
    assert.ok(
      f.workspace.contentEl.querySelector(
        '.ntf-main h2 svg[data-icon="lucide-book"]',
      ),
    );
    let link = f.workspace.contentEl.querySelector(".ntf-view-link");
    assert.ok(link.querySelector('svg[data-icon="lucide-book"]'));
    assert.equal(link.style.backgroundColor, "#ffffff");
    assert.equal(link.getAttribute("aria-current"), "true");
    delete f.plugin.store.data.activeViewId;
    f.workspace.render();
    link = f.workspace.contentEl.querySelector(".ntf-view-link");
    assert.equal(link.getAttribute("aria-current"), "false");
    assert.equal(link.style.backgroundColor, "#ffffff");
    assert.equal(link.style.color, "#000000");
    view.color = "#000000";
    f.workspace.render();
    assert.equal(
      f.workspace.contentEl.querySelector(".ntf-view-link").style.color,
      "#ffffff",
    );
    const reopened = new ViewEditorModal(f.plugin, view);
    reopened.open();
    assert.equal(field(reopened.contentEl, "Color").value, "#000000");
    await click(reopened.contentEl, "Reset color");
    await click(reopened.contentEl, "Remove icon");
    await click(reopened.contentEl, "Save view");
    const reset = normalize(f.plugin.saved).views[0];
    assert.equal(reset.color, undefined);
    assert.equal(reset.icon, undefined);
    assert.equal(
      normalize({ views: [{ ...config(), color: "invalid" }] }).views[0].color,
      undefined,
    );
  } finally {
    await f.close();
  }
});

test("selecting a property sort survives save, reopening the editor, and reload", async () => {
  const f = await fixture();
  try {
    f.files[0].frontmatter.ReferenceDate = "2027-01-02";
    f.files[1].frontmatter.ReferenceDate = "2026-01-02";
    for (const file of f.files) f.plugin.index.update(file);
    const editor = new ViewEditorModal(f.plugin, f.plugin.store.data.views[0]);
    editor.open();
    change(
      field(editor.contentEl, "Column"),
      JSON.stringify(["property", "ReferenceDate"]),
    );
    await click(editor.contentEl, "Save view");
    const expected = {
      column: { kind: "property", name: "ReferenceDate" },
      direction: "desc",
    };
    assert.deepEqual(f.plugin.saved.views[0].defaultSort[0], expected);
    f.plugin.store.data = normalize(f.plugin.saved);
    const reopened = new ViewEditorModal(
      f.plugin,
      f.plugin.store.data.views[0],
    );
    reopened.open();
    const column = field(reopened.contentEl, "Column");
    assert.equal(
      column.selectedOptions[0].textContent,
      "ReferenceDate (property)",
    );
    assert.doesNotMatch(reopened.contentEl.textContent, /undefined/);
    await click(reopened.contentEl, "Save view");
    assert.deepEqual(f.plugin.saved.views[0].defaultSort[0], expected);
    assert.equal(
      f.workspace.contentEl.querySelector("tbody tr td").textContent,
      "a",
    );
  } finally {
    await f.close();
  }
});
test("File Name filter can be configured, persisted, combined and reset", async () => {
  const f = await fixture();
  try {
    const editor = new ViewEditorModal(f.plugin, f.plugin.store.data.views[0]);
    editor.open();
    const row = [
      ...editor.contentEl.querySelectorAll(".ntf-property-list .ntf-row"),
    ].find((el) => el.textContent.includes("File Name (special)"));
    await click(row, "Add filter");
    await click(editor.contentEl, "Save view");
    const text = field(f.workspace.contentEl, "File Name");
    assert.ok(text);
    change(text, "A");
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.match(f.workspace.contentEl.textContent, /1 results/);
    assert.equal(
      f.workspace.contentEl.querySelector("tbody tr td").textContent,
      "a",
    );
    await f.plugin.store.flush();
    f.plugin.store.data = normalize(f.plugin.saved);
    f.workspace.render();
    assert.equal(field(f.workspace.contentEl, "File Name").value, "A");
    f.plugin.state("v").filterValues.Year = [token(2026)];
    f.workspace.render();
    assert.match(f.workspace.contentEl.textContent, /0 results/);
    await click(f.workspace.contentEl, "Reset filters");
    assert.equal(field(f.workspace.contentEl, "File Name").value, "");
    assert.match(f.workspace.contentEl.textContent, /2 results/);
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("filter ordering survives save and reload without changing selections", async () => {
  const f = await fixture();
  try {
    const view = f.plugin.store.data.views[0];
    view.filters.push({
      property: "File Name",
      source: "fileName",
      mode: "text",
    });
    f.plugin.state("v").fileNameQuery = "a";
    f.plugin.state("v").filterValues.Year = [token(2027)];
    const editor = new ViewEditorModal(f.plugin, view);
    editor.open();
    let rows = editor.contentEl.querySelectorAll(".ntf-filter-definition");
    assert.equal(rows[0].querySelector("button").disabled, true);
    await click(rows[2], "↑");
    rows = editor.contentEl.querySelectorAll(".ntf-filter-definition");
    await click(rows[1], "↑");
    await click(editor.contentEl, "Save view");
    f.plugin.store.data = normalize(f.plugin.saved);
    assert.deepEqual(
      f.plugin.store.data.views[0].filters.map((f) => f.property),
      ["File Name", "Year", "OutlineFor"],
    );
    assert.equal(f.plugin.state("v").fileNameQuery, "a");
    assert.deepEqual(f.plugin.state("v").filterValues.Year, [token(2027)]);
    f.workspace.render();
    const root = f.workspace.contentEl;
    assert.doesNotMatch(
      root.querySelector(".ntf-main").textContent,
      /NoteType =/,
    );
    const filters = root.querySelectorAll(".ntf-filter");
    assert.equal(
      filters[0].querySelector(".ntf-field > span").textContent,
      "File Name",
    );
    assert.equal(
      filters[1].querySelector(".ntf-field > span").textContent,
      "Year",
    );
    assert.equal(filters[1].querySelector("summary").textContent, "2027");
    assert.equal(filters[2].querySelector("summary").textContent, "All");
  } finally {
    await f.close();
  }
});
test("Add new settings persist; button creates a verbatim copy with unique names and opens it", async () => {
  const f = await fixture();
  try {
    assert.equal(
      f.workspace.contentEl.querySelector(".ntf-results-toolbar button"),
      null,
    );
    const template = new TFile("Templates/Letter.md");
    template.content =
      "---\r\nNoteType: Letter\r\n---\r\n{{title}} {{date}} {{time}}\r\n<% untouched %>\r\n";
    f.files.push(template, new TFolder("Letters"));
    const editor = new ViewEditorModal(f.plugin, f.plugin.store.data.views[0]);
    editor.open();
    assert.equal(field(editor.contentEl, "Template path"), undefined);
    const toggle = [...editor.contentEl.querySelectorAll("label")]
      .find((el) => el.textContent === "Enable add new")
      .querySelector("input");
    toggle.click();
    change(field(editor.contentEl, "Template path"), "Templates/Letter.md");
    change(field(editor.contentEl, "Default folder"), "Letters");
    await click(editor.contentEl, "Save view");
    f.plugin.store.data = normalize(f.plugin.saved);
    assert.deepEqual(f.plugin.store.data.views[0].addNew, {
      enabled: true,
      templatePath: "Templates/Letter.md",
      folderPath: "Letters",
    });
    f.workspace.render();
    const toolbar = f.workspace.contentEl.querySelector(".ntf-results-toolbar");
    assert.match(toolbar.querySelector("p").textContent, /results/);
    await click(toolbar, "Add new");
    assert.equal(f.app.created[0].path, "Letters/NewNote.md");
    assert.equal(f.app.created[0].content, template.content);
    assert.deepEqual(f.app.opened, ["Letters/NewNote.md"]);
    await click(
      f.workspace.contentEl.querySelector(".ntf-results-toolbar"),
      "Add new",
    );
    assert.equal(f.app.created[1].path, "Letters/NewNote 1.md");
    assert.equal(f.app.created[1].content, template.content);
    assert.deepEqual(f.app.writes, []);
    assert.equal(template.content, f.app.created[0].content);
    const editAgain = new ViewEditorModal(
      f.plugin,
      f.plugin.store.data.views[0],
    );
    editAgain.open();
    assert.equal(
      field(editAgain.contentEl, "Template path").value,
      "Templates/Letter.md",
    );
    [...editAgain.contentEl.querySelectorAll("label")]
      .find((el) => el.textContent === "Enable add new")
      .querySelector("input")
      .click();
    assert.equal(field(editAgain.contentEl, "Template path"), undefined);
    await click(editAgain.contentEl, "Save view");
    assert.equal(
      f.workspace.contentEl.querySelector(".ntf-results-toolbar button"),
      null,
    );
  } finally {
    await f.close();
  }
});
test("custom filename persists in the editor and creates unique notes, with blank fallback", async () => {
  const f = await fixture();
  try {
    const template = new TFile("Template.md");
    template.content = "unchanged template";
    f.files.push(template);
    f.plugin.store.data.views[0].addNew = {
      enabled: true,
      templatePath: "Template.md",
      folderPath: "",
    };
    const editor = new ViewEditorModal(f.plugin, f.plugin.store.data.views[0]);
    editor.open();
    change(field(editor.contentEl, "Filename"), "AllowanceStatements.md");
    await click(editor.contentEl, "Save view");
    const settings = normalize(f.plugin.saved).views[0].addNew;
    assert.equal(settings.filename, "AllowanceStatements.md");
    assert.equal(
      (await createNote(f.app, settings)).path,
      "AllowanceStatements.md",
    );
    assert.equal(
      (await createNote(f.app, settings)).path,
      "AllowanceStatements 1.md",
    );
    assert.equal(
      (await createNote(f.app, { ...settings, filename: "  " })).path,
      "NewNote.md",
    );
    for (const filename of ["../escape", "sub/note", "bad:name", ".md"])
      await assert.rejects(createNote(f.app, { ...settings, filename }));
    assert.ok(f.app.created.every((file) => file.content === template.content));
  } finally {
    await f.close();
  }
});

test("global exclusions persist, cover descendants and live updates, and can be removed", async () => {
  const f = await fixture();
  try {
    const template = new TFile("Templates/Sub/Note.md", {
      NoteType: "TemplateOnly",
    });
    const neighbor = new TFile("TemplatesOther/Note.md", {
      NoteType: "Neighbor",
    });
    f.files.push(template, neighbor);
    f.plugin.index.rebuild();
    const tab = f.plugin.settingsTab;
    tab.display();
    const input = tab.containerEl.querySelector("textarea");
    change(input, "/Templates/\na.md");
    assert.equal(f.plugin.index.records.has(template.path), false);
    assert.equal(f.plugin.index.records.has(neighbor.path), true);
    assert.equal(f.plugin.index.records.has("a.md"), false);
    assert.ok(!f.plugin.index.types().includes("TemplateOnly"));
    f.app.metadataCache.emit("changed", template);
    assert.equal(f.plugin.index.records.has(template.path), false);
    await f.plugin.store.flush();
    f.plugin.store.data = normalize(f.plugin.saved);
    f.plugin.index.rebuild();
    assert.deepEqual(f.plugin.store.data.excludedPaths, [
      "/Templates/",
      "a.md",
    ]);
    assert.equal(f.plugin.index.records.has(template.path), false);
    const created = await createNote(f.app, {
      enabled: true,
      templatePath: template.path,
      folderPath: "",
    });
    assert.equal(created.path, "NewNote.md");
    change(input, "");
    assert.equal(f.plugin.index.records.has(template.path), true);
    assert.equal(f.plugin.index.records.has("a.md"), true);
  } finally {
    await f.close();
  }
});

test("Add new validates paths, supports vault root, and never overwrites existing files", async () => {
  const template = new TFile("Template.md");
  template.content = "{{title}}";
  const existing = new TFile("NewNote.md");
  existing.content = "keep";
  const app = createApp([template, existing]);
  const settings = {
    enabled: true,
    templatePath: "Template.md",
    folderPath: "",
  };
  for (const invalid of [
    { ...settings, enabled: false },
    { ...settings, templatePath: "missing.md" },
    { ...settings, folderPath: "missing" },
    { ...settings, folderPath: "../outside" },
    { ...settings, templatePath: "C:\\Template.md" },
  ])
    await assert.rejects(createNote(app, invalid));
  assert.equal(app.created.length, 0);
  const created = await createNote(app, settings);
  assert.equal(created.path, "NewNote 1.md");
  assert.equal(created.content, "{{title}}");
  assert.equal(existing.content, "keep");
});
test("Add new ignores duplicate clicks while a template is loading", async () => {
  const f = await fixture();
  try {
    f.files.push(new TFile("Template.md"));
    f.plugin.store.data.views[0].addNew = {
      enabled: true,
      templatePath: "Template.md",
      folderPath: "",
    };
    let release;
    f.app.vault.read = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    f.workspace.render();
    const trigger = f.workspace.contentEl.querySelector(
      ".ntf-results-toolbar button",
    );
    trigger.click();
    trigger.click();
    await tick();
    assert.equal(
      f.workspace.contentEl.querySelector(".ntf-results-toolbar button")
        .disabled,
      true,
    );
    release("verbatim");
    await tick();
    assert.equal(f.app.created.length, 1);
  } finally {
    await f.close();
  }
});
test("checkbox mode can be selected in the editor and boolean cells render accessible symbols", async () => {
  const f = await fixture();
  try {
    f.files[0].frontmatter.Starred = true;
    f.files[1].frontmatter.Starred = false;
    for (const file of f.files) f.plugin.index.update(file);
    const view = f.plugin.store.data.views[0];
    view.columns.push({ kind: "property", name: "Starred" });
    view.filters.push({ property: "Starred", mode: "smart" });
    const editor = new ViewEditorModal(f.plugin, view);
    editor.open();
    change(field(editor.contentEl, "Starred"), "checkbox");
    await click(editor.contentEl, "Save view");
    assert.equal(f.plugin.saved.views[0].filters.at(-1).mode, "checkbox");
    assert.equal(
      f.workspace.contentEl.querySelector("td .ntf-boolean-true").textContent,
      "✓",
    );
    assert.equal(
      f.workspace.contentEl
        .querySelector("td .ntf-boolean-false")
        .getAttribute("aria-label"),
      "False",
    );
    const boxes = f.workspace.contentEl.querySelectorAll(
      ".ntf-checkbox-filter input",
    );
    assert.equal(boxes.length, 2);
    boxes[1].click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.match(f.workspace.contentEl.textContent, /1 results/);
    assert.equal(
      f.workspace.contentEl.querySelector("tbody tr td").textContent,
      "b",
    );
    await f.plugin.store.flush();
    f.plugin.store.data = normalize(f.plugin.saved);
    f.workspace.render();
    assert.equal(
      f.workspace.contentEl.querySelectorAll(".ntf-checkbox-filter input")[1]
        .checked,
      true,
    );
    await click(f.workspace.contentEl, "Reset filters");
    assert.match(f.workspace.contentEl.textContent, /2 results/);
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("rows open notes without special columns while cell links remain independent", async () => {
  const f = await fixture();
  try {
    f.plugin.store.data.views[0].columns = [
      { kind: "property", name: "Theme" },
    ];
    f.files[0].frontmatter.Theme = "[[Another note]]";
    f.plugin.index.update(f.files[0]);
    f.workspace.render();
    const rows = f.workspace.contentEl.querySelectorAll("tbody tr");
    rows[0].querySelector("td").click();
    await tick();
    assert.deepEqual(f.app.opened, ["b.md"]);
    assert.equal(rows[1].tabIndex, 0);
    rows[1].dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await tick();
    assert.deepEqual(f.app.opened, ["b.md", "a.md"]);
    rows[1].querySelector("a").click();
    await tick();
    assert.deepEqual(f.app.opened, ["b.md", "a.md", "Another note"]);
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("mobile cells expand overflow before links and expose explicit note controls", async () => {
  Platform.isMobile = true;
  const f = await fixture();
  try {
    const root = f.workspace.contentEl;
    assert.ok(root.querySelector(".ntf-table-mobile"));
    assert.equal(root.querySelector(".ntf-open-column"), null);
    await click(root, "a");
    assert.deepEqual(f.app.opened, ["a.md"]);
    f.app.opened.length = 0;
    f.plugin.store.data.views[0].columns = [
      { kind: "property", name: "Theme" },
    ];
    f.files[0].frontmatter.Theme = "Long value with [[Another note]]";
    f.plugin.index.update(f.files[0]);
    f.workspace.render();
    const rows = root.querySelectorAll("tbody tr");
    assert.equal(rows[0].tabIndex, -1);
    rows[0].querySelector(".ntf-cell-content").click();
    assert.equal(Modal.opened.length, 0);
    assert.deepEqual(f.app.opened, []);
    rows[0].querySelector(".ntf-open-note").click();
    await tick();
    assert.deepEqual(f.app.opened, ["b.md"]);
    const content = rows[1].querySelector(".ntf-cell-content");
    // happy-dom has no layout engine; simulate a measured overflowing cell.
    Object.defineProperties(content, {
      clientWidth: { value: 156 },
      scrollWidth: { value: 400 },
    });
    content.querySelector("a").click();
    await tick();
    assert.deepEqual(f.app.opened, ["b.md"]);
    const modal = Modal.opened.at(-1);
    assert.equal(
      modal.contentEl.querySelector(".ntf-cell-popup").textContent,
      "Long value with Another note",
    );
    modal.contentEl.querySelector("a").click();
    await tick();
    assert.deepEqual(f.app.opened, ["b.md", "Another note"]);
    await click(modal.contentEl, "Close");
    assert.equal(Modal.opened.length, 0);
    content.parentElement.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    assert.equal(Modal.opened.length, 1);
    assert.deepEqual(f.app.writes, []);
  } finally {
    Platform.isMobile = false;
    await f.close();
  }
});

test("workspace renders missing rows, header cycle restores default, note opening is read-only", async () => {
  const f = await fixture();
  try {
    const root = f.workspace.contentEl;
    assert.match(root.textContent, /2 results/);
    assert.equal(root.querySelectorAll(".ntf-missing").length, 1);
    assert.equal(root.querySelector("tbody tr td").textContent, "b");
    await click(root, "Theme");
    assert.equal(f.plugin.state("v").temporarySort.direction, "asc");
    await click(root, "Theme ↑");
    assert.equal(f.plugin.state("v").temporarySort.direction, "desc");
    await click(root, "Theme ↓");
    assert.equal(f.plugin.state("v").temporarySort, undefined);
    assert.equal(f.plugin.store.data.views[0].defaultSort[0].direction, "desc");
    await click(root, "a");
    assert.deepEqual(f.app.opened, ["a.md"]);
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("dependent filters visibly retain incompatible selection; reset persists only current view", async () => {
  const f = await fixture();
  try {
    const state = f.plugin.state("v");
    state.filterValues = { Year: [token(2026)], OutlineFor: [token("CPioM")] };
    f.plugin.store.data.viewStates.other = { filterValues: { Theme: "keep" } };
    f.workspace.render();
    assert.match(f.workspace.contentEl.textContent, /0 results/);
    assert.match(f.workspace.contentEl.textContent, /CPioM \(unavailable\)/);
    assert.equal(
      [...f.workspace.contentEl.querySelectorAll(".ntf-option")]
        .find((el) => el.textContent.includes("CPioM"))
        .querySelector("input").checked,
      true,
    );
    await click(f.workspace.contentEl, "Reset filters");
    await f.plugin.store.flush();
    assert.deepEqual(f.plugin.saved.viewStates.v.filterValues, {});
    assert.equal(f.plugin.saved.viewStates.other.filterValues.Theme, "keep");
    assert.match(f.workspace.contentEl.textContent, /2 results/);
  } finally {
    await f.close();
  }
});
test("repair requires confirmation, writes only candidates, refreshes via metadata events", async () => {
  const f = await fixture();
  try {
    const modal = new MissingPropertyModal(
      f.plugin,
      f.plugin.store.data.views[0],
      ["Theme"],
    );
    modal.open();
    change(field(modal.contentEl, "Default value type"), "text");
    change(field(modal.contentEl, "Default value"), "Default");
    await click(modal.contentEl, "Review changes");
    assert.deepEqual(f.app.writes, []);
    const confirmation = Modal.opened.at(-1);
    assert.match(confirmation.contentEl.textContent, /up to 1 notes/);
    await click(confirmation.contentEl, "Confirm");
    assert.deepEqual(f.app.writes, ["b.md"]);
    assert.equal(f.files[0].frontmatter.Theme, "Alpha");
    assert.equal(f.files[1].frontmatter.Theme, "Default");
    assert.equal(
      f.plugin.index.records.get("b.md").properties.Theme,
      "Default",
    );
    assert.equal(
      f.workspace.contentEl.querySelectorAll(".ntf-missing").length,
      0,
    );
  } finally {
    await f.close();
  }
});
test("view editor discovers coverage, saves configuration without runtime values, and searches NoteTypes", async () => {
  const f = await fixture();
  try {
    const editor = new ViewEditorModal(f.plugin);
    editor.open();
    change(field(editor.contentEl, "View name"), "New saved view");
    change(field(editor.contentEl, "Search NoteType"), "Mater");
    assert.deepEqual(
      [...field(editor.contentEl, "Choose exactly one NoteType").options].map(
        (o) => o.value,
      ),
      ["", "Material"],
    );
    change(field(editor.contentEl, "Choose exactly one NoteType"), "Material");
    assert.match(editor.contentEl.textContent, /Theme — 1 \/ 2/);
    const theme = [
      ...editor.contentEl.querySelectorAll(".ntf-property-list label"),
    ].find((el) => el.textContent.includes("Theme"));
    theme.querySelector("input").click();
    await tick();
    await click(editor.contentEl, "Save view");
    const saved = f.plugin.saved.views.find((v) => v.name === "New saved view");
    assert.ok(saved);
    assert.ok(saved.columns.some((c) => c.name === "Theme"));
    assert.equal(saved.filterValues, undefined);
    assert.deepEqual(f.plugin.saved.viewStates[saved.id].filterValues, {});
  } finally {
    await f.close();
  }
});
test("organization mode is explicit, blocks nonempty deletion, enforces four levels", async () => {
  const f = await fixture();
  try {
    f.plugin.store.data.categories = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      name: `Level ${i + 1}`,
      parentId: i ? `c${i - 1}` : null,
      order: i,
    }));
    f.plugin.store.data.views[0].categoryId = "c3";
    f.workspace.render();
    assert.equal(
      [...f.workspace.contentEl.querySelectorAll("button")].some(
        (b) => b.textContent === "Delete",
      ),
      false,
    );
    await click(f.workspace.contentEl, "Edit organization");
    assert.equal(
      [...f.workspace.contentEl.querySelectorAll("button")].filter(
        (b) => b.textContent === "New subcategory",
      ).length,
      3,
    );
    const category = f.workspace.contentEl.querySelector(".ntf-category");
    const deletion = [...category.children].find((el) =>
      el.classList.contains("ntf-organize-order"),
    );
    await click(deletion, "Delete");
    assert.match(Notice.messages.at(-1), /Empty this category/);
    assert.equal(f.plugin.store.data.categories.length, 4);
  } finally {
    await f.close();
  }
});
test("individual metadata, rename and delete events keep index current without file reads", async () => {
  const f = await fixture();
  try {
    f.files[0].frontmatter.NoteType = "Person";
    f.app.metadataCache.emit("changed", f.files[0]);
    assert.equal(f.plugin.index.notes("Material").length, 1);
    const file = f.files[1];
    file.path = "renamed.md";
    file.basename = "renamed";
    f.app.vault.emit("rename", file, "b.md");
    assert.equal(f.plugin.index.records.has("b.md"), false);
    assert.equal(f.plugin.index.records.get("renamed.md").name, "renamed");
    f.app.vault.emit("delete", file);
    assert.equal(f.plugin.index.records.has("renamed.md"), false);
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("text entry preserves focus/cursor after debounce, then restores from persisted state", async () => {
  const f = await fixture();
  try {
    f.plugin.store.data.views[0].filters.push({
      property: "Theme",
      mode: "text",
    });
    f.workspace.render();
    const text = field(f.workspace.contentEl, "Theme");
    text.focus();
    change(text, "AL");
    text.setSelectionRange(2, 2);
    await new Promise((resolve) => setTimeout(resolve, 160));
    const current = field(f.workspace.contentEl, "Theme");
    assert.equal(document.activeElement, current);
    assert.equal(current.selectionStart, 2);
    assert.equal(current.value, "AL");
    assert.match(f.workspace.contentEl.textContent, /1 results/);
    await f.plugin.store.flush();
    const loaded = normalize(f.plugin.saved);
    assert.equal(loaded.viewStates.v.filterValues.Theme, "AL");
    assert.deepEqual(f.app.writes, []);
  } finally {
    await f.close();
  }
});
test("failed load never overwrites data; serialized saves finish in order", async () => {
  const failed = {
    loadData: async () => {
      throw new Error("Storage unavailable");
    },
    saveData: async () => assert.fail("Must not save after load failure"),
  };
  const store = new Persistence(failed);
  await assert.rejects(store.load());
  await store.flush();
  const snapshots = [];
  const sequential = new Persistence({
    loadData: async () => null,
    saveData: async (value) => {
      await tick();
      snapshots.push(value.activeViewId);
    },
  });
  await sequential.load();
  sequential.data.activeViewId = "first";
  const a = sequential.flush();
  sequential.data.activeViewId = "second";
  const b = sequential.flush();
  await Promise.all([a, b]);
  assert.deepEqual(snapshots, ["first", "second"]);
});
