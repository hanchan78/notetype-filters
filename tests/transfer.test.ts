import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/DataModel";
import {
  exportViews,
  importViews,
  viewLink,
  linkState,
} from "../src/ViewTransfer";

const data = () =>
  normalize({
    categories: [{ id: "c", name: "Category", parentId: null, order: 0 }],
    views: [
      {
        id: "v",
        name: "My view",
        categoryId: "c",
        noteTypeValue: "Type",
        columns: [],
        filters: [{ property: "Topic", mode: "smart" }],
        defaultSort: [],
        order: 0,
      },
    ],
    viewStates: { v: { filterValues: { Topic: ["A & B", "日本語"] } } },
    activeViewId: "v",
    collapsed: ["c"],
    excludedPaths: ["Private"],
  });

test("export/import replaces saved organization and preserves local exclusions", () => {
  const source = data();
  const current = normalize({
    excludedPaths: ["Local"],
    categories: [{ id: "old", name: "Old" }],
  });
  const restored = importViews(exportViews(source), current);
  assert.deepEqual(restored.categories, source.categories);
  assert.deepEqual(restored.views, source.views);
  assert.deepEqual(restored.viewStates, source.viewStates);
  assert.deepEqual(restored.collapsed, ["c"]);
  assert.deepEqual(restored.excludedPaths, ["Local"]);
  assert.equal(restored.activeViewId, "v");
  assert.throws(() => importViews("{}", current));
  assert.throws(() =>
    importViews(
      '{"format":"notetype-filters-views","version":1,"views":[{}],"categories":[]}',
      current,
    ),
  );
  assert.equal(current.categories[0]!.id, "old");
});

test("view links preserve Unicode and capture a filter snapshot", () => {
  const source = data();
  const url = new URL(
    viewLink("Vault & notes", source.views[0]!, source.viewStates.v!),
  );
  source.viewStates.v!.filterValues.Topic = [];
  assert.equal(url.searchParams.get("vault"), "Vault & notes");
  assert.equal(url.searchParams.get("view"), "v");
  assert.deepEqual(
    linkState(source.views[0]!, url.searchParams.get("state")!).filterValues
      .Topic,
    ["A & B", "日本語"],
  );
  assert.throws(() => linkState(source.views[0]!, "null"));
});
