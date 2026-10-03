import { App, TFile, TFolder } from "obsidian";
import { ViewConfiguration } from "./types";

type CreationSettings = NonNullable<ViewConfiguration["addNew"]>;

function vaultPath(value: string, rootAllowed: boolean): string {
  const path = value.trim().replace(/\\/g, "/");
  if (rootAllowed && (path === "" || path === "/")) return "";
  if (
    !path ||
    path.startsWith("/") ||
    /[:\u0000-\u001f]/.test(path) ||
    path.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error(
      "Use a vault-relative path without '..' or a drive letter.",
    );
  return path.replace(/\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function validateCreation(
  app: App,
  settings: CreationSettings,
): { template: TFile; folderPath: string; templatePath: string; filename: string } {
  const filename = (settings.filename?.trim() || "NewNote").replace(/\.md$/i, "");
  if (!filename || /[<>:"/\\|?*\u0000-\u001f]/.test(filename) || /[. ]$/.test(filename))
    throw new Error("Enter a filename without folder separators or invalid filename characters.");
  const templatePath = vaultPath(settings.templatePath, false);
  const folderPath = vaultPath(settings.folderPath, true);
  const template = app.vault.getAbstractFileByPath(templatePath);
  if (!(template instanceof TFile) || template.extension !== "md")
    throw new Error(
      "Choose an existing Markdown template file, including its .md extension.",
    );
  const folder = folderPath
    ? app.vault.getAbstractFileByPath(folderPath)
    : app.vault.getRoot();
  if (!(folder instanceof TFolder))
    throw new Error(
      "The default folder does not exist. Choose an existing vault folder.",
    );
  return { template, templatePath, folderPath, filename };
}

export async function createNote(
  app: App,
  settings: CreationSettings,
): Promise<TFile> {
  if (!settings.enabled) throw new Error("Add new is disabled for this view.");
  const { template, folderPath, filename } = validateCreation(app, settings);
  // Copy verbatim: do not expand placeholders or inject filters/NoteType.
  const content = await app.vault.read(template);
  for (let suffix = 0; suffix < 10000; suffix++) {
    const name = suffix ? `${filename} ${suffix}.md` : `${filename}.md`;
    const path = folderPath ? `${folderPath}/${name}` : name;
    if (app.vault.getAbstractFileByPath(path)) continue;
    try {
      return await app.vault.create(path, content);
    } catch (error) {
      // A concurrent creation can claim the name after the existence check.
      if (!app.vault.getAbstractFileByPath(path)) throw error;
    }
  }
  throw new Error(`Could not find an available filename for ${filename}.`);
}
