import test from "node:test";
import assert from "node:assert/strict";
import {
  choices,
  compare,
  coverage,
  display,
  matches,
  matchesType,
  reconcile,
  results,
  token,
} from "../src/core";
import { normalize, categoryPath } from "../src/DataModel";
import { addMissing } from "../src/repair";
import { NoteRecord, ViewConfiguration, ViewRuntimeState } from "../src/types";
const note = (properties: Record<string, unknown>, i = 0): NoteRecord => ({
  path: `notes/${i}.md`,
  name: String(i),
  folder: "notes",
  ctime: i,
  mtime: i,
  properties: { NoteType: "Material", ...properties },
});
const view = (extra: Partial<ViewConfiguration> = {}): ViewConfiguration => ({
  id: "v",
  name: "Talks",
  categoryId: null,
  noteTypeValue: "Material",
  columns: [
    { kind: "special", name: "File Name" },
    { kind: "property", name: "Theme" },
  ],
  filters: [],
  defaultSort: [],
  order: 0,
  ...extra,
});
const state = (
  filterValues: ViewRuntimeState["filterValues"] = {},
): ViewRuntimeState => ({ filterValues });
test("A: coverage includes sparsely present properties across all matching notes", () => {
  const notes = Array.from({ length: 500 }, (_, i) =>
    note(
      {
        ...(i < 493 ? { Theme: "Theme" } : {}),
        ...(i < 312 ? { TalkType: "Talk" } : {}),
      },
      i,
    ),
  );
  assert.equal(coverage(notes).get("Theme"), 493);
  assert.equal(coverage(notes).get("TalkType"), 312);
});
test("B: missing selected properties do not exclude a row; null is present", () => {
  const rows = [note({}), note({ Theme: null }, 1)];
  assert.equal(results(rows, view(), state()).rows.length, 2);
  assert.equal(coverage(rows).get("Theme"), 1);
});
test("C: repair adds only missing keys, including concurrent change and type checks", () => {
  const n = note({}),
    v = view();
  const fm: Record<string, unknown> = { NoteType: "Material" };
  assert.equal(addMissing(fm, n, v, state(), "TalkType", ["Talk"]), true);
  assert.deepEqual(fm.TalkType, ["Talk"]);
  assert.equal(addMissing(fm, n, v, state(), "TalkType", "Overwrite"), false);
  assert.equal(
    addMissing({ NoteType: "Person" }, n, v, state(), "TalkType", "Talk"),
    false,
  );
  assert.equal(
    addMissing(
      { NoteType: "Material", TalkType: null },
      n,
      v,
      state(),
      "TalkType",
      "Talk",
    ),
    false,
  );
  const filtered = view({ filters: [{ property: "Year", mode: "smart" }] });
  assert.equal(
    addMissing(
      { NoteType: "Material", Year: 2026 },
      n,
      filtered,
      state({ Year: [token(2027)] }),
      "TalkType",
      "Talk",
    ),
    false,
  );
});
test("D/E: OR within smart filter, AND across filters, individual list members", () => {
  const filters: ViewConfiguration["filters"] = [
    { property: "OutlineFor", mode: "smart" },
    { property: "Participants", mode: "smart" },
    { property: "Year", mode: "smart" },
  ];
  const s = state({
    OutlineFor: [token("CPioM"), token("CA")],
    Participants: [token("Interview")],
    Year: [token(2027)],
  });
  assert.equal(
    matches(
      note({
        OutlineFor: "CA",
        Participants: ["Interview", "Demonstration"],
        Year: 2027,
      }),
      filters,
      s,
    ),
    true,
  );
  assert.equal(
    matches(
      note({ OutlineFor: "Other", Participants: ["Interview"], Year: 2027 }),
      filters,
      s,
    ),
    false,
  );
  assert.equal(
    matches(
      note({ OutlineFor: "CA", Participants: ["Interview"], Year: 2026 }),
      filters,
      s,
    ),
    false,
  );
  assert.equal(
    matches(
      note({ OutlineFor: "CA", Participants: ["Interview"], Year: "2027" }),
      filters,
      s,
    ),
    false,
  );
});
test("F: dependent options ignore own selection and retain unavailable selections", () => {
  const v = view({
    filters: [
      { property: "Year", mode: "smart" },
      { property: "OutlineFor", mode: "smart" },
    ],
  });
  const notes = [
    note({ Year: 2027, OutlineFor: "CPioM" }),
    note({ Year: 2026, OutlineFor: "CA" }, 1),
    note({ Year: 2026, OutlineFor: "PublicTalk" }, 2),
  ];
  const s = state({ Year: [token(2026)], OutlineFor: [token("CPioM")] });
  const opts = choices(notes, v, s, "OutlineFor");
  assert.equal(opts.get(token("CPioM")), false);
  assert.equal(opts.get(token("CA")), true);
  assert.equal(opts.get(token("PublicTalk")), true);
  assert.equal(results(notes, v, s).rows.length, 0);
  assert.deepEqual(s.filterValues.OutlineFor, [token("CPioM")]);
});
test("text search is case-insensitive and handles simple, list and unexpected values", () => {
  for (const value of [
    "Demonstration",
    ["Interview", "Demonstration"],
    { type: "Demonstration" },
  ])
    assert.equal(
      matches(
        note({ Theme: value }),
        [{ property: "Theme", mode: "text" }],
        state({ Theme: "DEMON" }),
      ),
      true,
    );
  assert.equal(display(null), "");
  assert.equal(display(true), "true");
  assert.doesNotThrow(() => display({ a: 1 }));
});
test("NoteType is one exact scalar string, with case retained", () => {
  assert.equal(matchesType(note({ NoteType: "Material" }), "Material"), true);
  for (const type of ["material", ["Material"], null])
    assert.equal(matchesType(note({ NoteType: type }), "Material"), false);
});
test("malformed cyclic values and invalid dates cannot break display or filters", () => {
  const cyclic: unknown[] = [];
  cyclic.push(cyclic, cyclic);
  assert.match(display(cyclic), /Unsupported list/);
  assert.equal(display(new Date("invalid")), "[Invalid date]");
  assert.doesNotThrow(() =>
    matches(
      note({ Theme: cyclic }),
      [{ property: "Theme", mode: "smart" }],
      state({ Theme: [token("anything")] }),
    ),
  );
});
test("G/H: runtime state survives serialization, reset only clears the current view", () => {
  const a = view(),
    b = view({ id: "b", filters: [{ property: "Year", mode: "smart" }] });
  a.filters = [{ property: "Year", mode: "smart" }];
  const data = normalize({
    version: 1,
    views: [a, b],
    viewStates: {
      v: state({ Year: [token(2027)] }),
      b: state({ Year: [token(2026)] }),
    },
  });
  const copy = normalize(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(copy.viewStates.v?.filterValues.Year, [token(2027)]);
  copy.viewStates.v!.filterValues = {};
  const reset = normalize(JSON.parse(JSON.stringify(copy)));
  assert.deepEqual(reset.viewStates.v?.filterValues.Year, undefined);
  assert.deepEqual(reset.viewStates.b?.filterValues.Year, [token(2026)]);
  assert.deepEqual(reset.views[0]?.filters, a.filters);
});
test("edits remove obsolete or incompatible runtime filters", () => {
  const v = view({
    filters: [
      { property: "Year", mode: "smart" },
      { property: "Theme", mode: "text" },
    ],
  });
  const s = reconcile(
    v,
    state({ Year: [token(2027)], Theme: ["old smart value"], Removed: "x" }),
  );
  assert.deepEqual(s.filterValues.Year, [token(2027)]);
  assert.equal(s.filterValues.Removed, undefined);
  assert.equal(s.filterValues.Theme, undefined);
});
test("I: multi-level default sorting, natural comparison, null/missing last both ways", () => {
  const v = view({
    defaultSort: [
      { column: { kind: "property", name: "Year" }, direction: "desc" },
      { column: { kind: "property", name: "Outline" }, direction: "asc" },
      { column: { kind: "property", name: "Number" }, direction: "asc" },
    ],
  });
  const notes = [
    note({ Year: 2026 }, 0),
    note({ Year: 2027, Outline: "A", Number: 10 }, 1),
    note({ Year: 2027, Outline: "A", Number: 2 }, 2),
    note({}, 3),
    note({ Year: null }, 4),
  ];
  assert.deepEqual(
    results(notes, v, state()).rows.map((n) => n.name),
    ["2", "1", "0", "3", "4"],
  );
  assert.ok(
    compare(note({}), note({ Year: 1 }), [
      { column: { kind: "property", name: "Year" }, direction: "asc" },
    ]) > 0,
  );
});
test("J: temporary sort overrides defaults without mutating configuration", () => {
  const v = view({
    defaultSort: [
      { column: { kind: "special", name: "File Name" }, direction: "asc" },
    ],
  });
  const before = JSON.stringify(v);
  const s = state();
  s.temporarySort = {
    column: { kind: "special", name: "File Name" },
    direction: "desc",
  };
  assert.deepEqual(
    results([note({}, 0), note({}, 1)], v, s).rows.map((n) => n.name),
    ["1", "0"],
  );
  assert.equal(JSON.stringify(v), before);
  delete s.temporarySort;
  assert.equal(results([note({}, 0), note({}, 1)], v, s).rows[0]?.name, "0");
});
test("K: correctly ordered first 200, capped match detection, exact boundary", () => {
  const v = view({
    defaultSort: [
      { column: { kind: "property", name: "Number" }, direction: "desc" },
    ],
  });
  const notes = Array.from({ length: 1200 }, (_, i) => note({ Number: i }, i));
  const r = results(notes, v, state());
  assert.equal(r.more, true);
  assert.equal(r.rows.length, 200);
  assert.equal(r.rows[0]?.properties.Number, 1199);
  assert.equal(r.rows[199]?.properties.Number, 1000);
  for (const count of [0, 47, 200]) {
    const r = results(notes.slice(0, count), v, state());
    assert.equal(r.more, false);
    assert.equal(r.rows.length, count);
  }
  let accesses = 0;
  const probe = notes.map((n) => ({
    ...n,
    properties: {
      ...n.properties,
      get Probe() {
        accesses++;
        return true;
      },
    },
  }));
  results(
    probe,
    view({ filters: [{ property: "Probe", mode: "smart" }] }),
    state({ Probe: [token(true)] }),
  );
  assert.equal(accesses, 201);
});
test("schema repair handles cycles, invalid references, old data, and future versions", () => {
  const data = normalize({
    categories: [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ],
    views: [view({ categoryId: "unknown" })],
  });
  assert.equal(data.views[0]?.categoryId, null);
  for (const c of data.categories)
    assert.doesNotThrow(() => categoryPath(data.categories, c.id));
  assert.equal(normalize(null).version, 1);
  assert.throws(() => normalize({ version: 2 }), /newer/);
});
test("recovers legacy array sort columns without losing level order or direction", () => {
  const data = normalize({
    views: [
      {
        ...view(),
        defaultSort: [
          { column: ["property", "ReferenceDate"], direction: "desc" },
          { column: ["special", "File Name"], direction: "asc" },
          { column: ["invalid", "Anything"], direction: "asc" },
        ],
      },
    ],
  });
  assert.deepEqual(data.views[0]?.defaultSort, [
    { column: { kind: "property", name: "ReferenceDate" }, direction: "desc" },
    { column: { kind: "special", name: "File Name" }, direction: "asc" },
  ]);
  assert.deepEqual(
    normalize(JSON.parse(JSON.stringify(data))).views[0]?.defaultSort,
    data.views[0]?.defaultSort,
  );
});
test("filename filtering is distinct from a File Name property and constrains dependent choices", () => {
  const v = view({
    filters: [
      { property: "File Name", mode: "text", source: "fileName" },
      { property: "File Name", mode: "text" },
      { property: "Year", mode: "smart" },
    ],
  });
  const notes = [
    {
      ...note({ "File Name": "frontmatter", Year: 2027 }),
      name: "Pioneer Talk",
    },
    { ...note({ "File Name": "frontmatter", Year: 2026 }, 1), name: "Other" },
  ];
  const s = { ...state({ "File Name": "FRONT" }), fileNameQuery: "pIoNeEr" };
  assert.equal(results(notes, v, s).rows.length, 1);
  assert.deepEqual([...choices(notes, v, s, "Year").keys()], [token(2027)]);
  const restored = normalize({ views: [v], viewStates: { v: s } });
  assert.equal(restored.views[0]?.filters.length, 3);
  assert.equal(restored.viewStates.v?.fileNameQuery, "pIoNeEr");
  assert.equal(restored.viewStates.v?.filterValues["File Name"], "FRONT");
  assert.equal(reconcile(view(), s).fileNameQuery, undefined);
});
test("checkbox filters match booleans, persist, and distinguish false from missing", () => {
  const v = view({ filters: [{ property: "Starred", mode: "checkbox" }] });
  const notes = [
    note({ Starred: true }),
    note({ Starred: false }, 1),
    note({}, 2),
    note({ Starred: "false" }, 3),
  ];
  assert.equal(results(notes, v, state()).rows.length, 4);
  assert.deepEqual(
    results(notes, v, state({ Starred: [token(false)] })).rows.map(
      (n) => n.name,
    ),
    ["1"],
  );
  assert.equal(
    results(notes, v, state({ Starred: [token(true), token(false)] })).rows
      .length,
    2,
  );
  const loaded = normalize({
    views: [v],
    viewStates: { v: state({ Starred: [token(false)] }) },
  });
  assert.equal(loaded.views[0]?.filters[0]?.mode, "checkbox");
  assert.deepEqual(loaded.viewStates.v?.filterValues.Starred, [token(false)]);
});
test("prototype-like property names remain ordinary data through persistence and repair", () => {
  const v = view({ filters: [{ property: "__proto__", mode: "text" }] });
  const filters = JSON.parse('{"__proto__":"safe"}') as Record<string, string>;
  const data = normalize({ views: [v], viewStates: { v: state(filters) } });
  assert.equal(data.viewStates.v?.filterValues["__proto__"], "safe");
  const fm = { NoteType: "Material" };
  assert.equal(
    addMissing(fm, note({}), v, state(), "__proto__", "value"),
    true,
  );
  assert.equal(Object.getPrototypeOf(fm), Object.prototype);
});
