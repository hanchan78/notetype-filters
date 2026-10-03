import { NoteRecord, ViewConfiguration, ViewRuntimeState, uid } from "./types";
import { choices, token, tokenLabel } from "./core";
import { input } from "./ui";
export class FilterBar {
  constructor(
    private root: HTMLElement,
    private changed: () => void,
  ) {}
  render(
    notes: NoteRecord[],
    view: ViewConfiguration,
    state: ViewRuntimeState,
  ): void {
    this.root.empty();
    for (const f of view.filters) {
      const box = this.root.createDiv({ cls: "ntf-filter" });
      if (f.source === "fileName") {
        const field = input(
          box,
          "File Name",
          state.fileNameQuery ?? "",
          (value) => {
            state.fileNameQuery = value;
            this.changed();
          },
        );
        field.dataset.focusKey = "fileNameQuery";
        field.placeholder = "Filename contains…";
        continue;
      }
      if (f.mode === "checkbox") {
        const group = box.createDiv({ cls: "ntf-field" });
        const labelId = `ntf-filter-label-${uid()}`;
        group.createSpan({ text: f.property, attr: { id: labelId } });
        const options = group.createDiv({
          cls: "ntf-checkbox-filter",
          attr: { role: "group", "aria-labelledby": labelId },
        });
        for (const value of [true, false]) {
          const label = options.createEl("label", { cls: "ntf-option" });
          const checkbox = label.createEl("input", { type: "checkbox" });
          const key = token(value);
          const selected = state.filterValues[f.property];
          checkbox.checked = Array.isArray(selected) && selected.includes(key);
          label.createSpan({
            text: value ? "✓ True" : "✗ False",
            cls: value ? "ntf-boolean-true" : "ntf-boolean-false",
          });
          checkbox.onchange = () => {
            const current = state.filterValues[f.property];
            const values = Array.isArray(current) ? current : [];
            state.filterValues[f.property] = checkbox.checked
              ? [...values.filter((v) => v !== key), key]
              : values.filter((v) => v !== key);
            this.changed();
          };
        }
        options.title =
          "Select true or false. Leave both unchecked to show all values.";
        continue;
      }
      if (f.mode === "text") {
        const field = input(
          box,
          f.property,
          typeof state.filterValues[f.property] === "string"
            ? (state.filterValues[f.property] as string)
            : "",
          (v) => {
            state.filterValues[f.property] = v;
            this.changed();
          },
        );
        field.dataset.focusKey = `text:${f.property}`;
        field.placeholder = "Contains…";
      } else {
        const wrap = box.createDiv({ cls: "ntf-field" });
        const labelId = `ntf-filter-label-${uid()}`;
        wrap.createSpan({ text: f.property, attr: { id: labelId } });
        const details = wrap.createEl("details");
        const selected = Array.isArray(state.filterValues[f.property])
          ? (state.filterValues[f.property] as string[])
          : [];
        details.createEl("summary", {
          text: selected.length ? selected.map(tokenLabel).join(", ") : "All",
          attr: { "aria-labelledby": labelId },
        });
        details.dataset.filterProperty = f.property;
        const search = input(details, "Search choices", "", () => {});
        search.dataset.focusKey = `search:${f.property}`;
        const list = details.createDiv({ cls: "ntf-options" });
        const options = [...choices(notes, view, state, f.property)].sort(
          (a, b) =>
            tokenLabel(a[0]).localeCompare(tokenLabel(b[0]), undefined, {
              numeric: true,
            }),
        );
        const draw = () => {
          list.empty();
          let shown = 0,
            limited = false;
          for (const [key, available] of options) {
            if (!selected.includes(key)) {
              if (
                !tokenLabel(key)
                  .toLocaleLowerCase()
                  .includes(search.value.toLocaleLowerCase())
              )
                continue;
              if (shown >= 200) {
                limited = true;
                continue;
              }
              shown++;
            }
            const label = list.createEl("label", { cls: "ntf-option" });
            const check = label.createEl("input", { type: "checkbox" });
            check.checked = selected.includes(key);
            label.appendText(
              `${tokenLabel(key)}${available ? "" : " (unavailable)"}`,
            );
            check.onchange = () => {
              const current = Array.isArray(state.filterValues[f.property])
                ? (state.filterValues[f.property] as string[])
                : [];
              state.filterValues[f.property] = check.checked
                ? [...current, key]
                : current.filter((v) => v !== key);
              this.changed();
            };
          }
          if (limited)
            list.createEl("p", {
              text: "Showing 200 choices plus selections. Search to find more.",
            });
          if (!list.childElementCount)
            list.createSpan({ text: "No choices from matching notes." });
        };
        search.oninput = draw;
        draw();
      }
    }
  }
}
