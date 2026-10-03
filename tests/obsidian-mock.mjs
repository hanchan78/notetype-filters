import { Window } from "happy-dom";
const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
globalThis.Event = window.Event;
const proto = window.HTMLElement.prototype;
proto.empty = function () {
  this.replaceChildren();
};
proto.createEl = function (tag, options = {}) {
  const element = document.createElement(tag);
  if (options.text !== undefined) element.textContent = options.text;
  if (options.cls) element.className = options.cls;
  for (const [name, value] of Object.entries(options))
    if (!["text", "cls", "attr"].includes(name))
      element.setAttribute(name, value);
  for (const [name, value] of Object.entries(options.attr ?? {}))
    element.setAttribute(name, value);
  this.append(element);
  return element;
};
proto.createDiv = function (options) {
  return this.createEl("div", options);
};
proto.createSpan = function (options) {
  return this.createEl("span", options);
};
proto.addClass = function (cls) {
  this.classList.add(cls);
};
proto.toggleClass = function (cls, enabled) {
  this.classList.toggle(cls, enabled);
};
proto.setText = function (text) {
  this.textContent = text;
};
proto.appendText = function (text) {
  this.append(document.createTextNode(text));
};
proto.setAttr = function (name, value) {
  this.setAttribute(name, value);
};
Object.defineProperty(proto, "doc", {
  get() {
    return this.ownerDocument;
  },
});
export const Platform = { isMobile: false };
export class Notice {
  static messages = [];
  constructor(message) {
    Notice.messages.push(message);
  }
}
export class TFile {
  constructor(path, frontmatter = {}) {
    this.path = path;
    this.basename = path.split("/").at(-1).replace(/\.md$/, "");
    this.extension = path.split(".").at(-1);
    this.parent = { path: path.split("/").slice(0, -1).join("/") || "/" };
    this.stat = { ctime: 100, mtime: 200 };
    this.frontmatter = frontmatter;
  }
}
export class TFolder {
  constructor(path = "/") {
    this.path = path;
    this.children = [];
  }
}
export class Modal {
  static opened = [];
  constructor(app) {
    this.app = app;
    this.modalEl = document.createElement("div");
    this.contentEl = this.modalEl.createDiv();
  }
  open() {
    document.body.append(this.modalEl);
    Modal.opened.push(this);
    this.onOpen?.();
  }
  close() {
    this.onClose?.();
    this.modalEl.remove();
    Modal.opened = Modal.opened.filter((x) => x !== this);
  }
}
export class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.contentEl = document.createElement("div");
    document.body.append(this.contentEl);
  }
}
export const getIconIds = () => [
  "lucide-book",
  "lucide-calendar",
  "lucide-folder",
];
export function setIcon(parent, icon) {
  if (getIconIds().includes(icon)) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-icon", icon);
    parent.append(svg);
  }
}
export class SuggestModal extends Modal {
  setPlaceholder(value) {
    this.placeholder = value;
  }
  setInstructions(value) {
    this.instructions = value;
  }
}
export class Plugin {
  constructor(app) {
    this.app = app;
    this.saved = null;
    this.saves = [];
    this.cleanups = [];
  }
  async loadData() {
    return this.saved;
  }
  async saveData(value) {
    this.saved = structuredClone(value);
    this.saves.push(this.saved);
  }
  registerView(type, factory) {
    this.factory = factory;
  }
  registerObsidianProtocolHandler(action, handler) {
    this.protocolHandler = handler;
  }
  addRibbonIcon() {}
  addSettingTab(tab) {
    this.settingsTab = tab;
  }
  addCommand(command) {
    this.command = command;
  }
  registerEvent(ref) {
    this.cleanups.push(ref);
  }
  registerDomEvent(target, event, callback) {
    target.addEventListener(event, callback);
    this.cleanups.push(() => target.removeEventListener(event, callback));
  }
}
export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }
}
class Events {
  listeners = new Map();
  on(event, callback) {
    const list = this.listeners.get(event) ?? [];
    list.push(callback);
    this.listeners.set(event, list);
    return () =>
      this.listeners.set(
        event,
        list.filter((x) => x !== callback),
      );
  }
  emit(event, ...args) {
    for (const callback of this.listeners.get(event) ?? []) callback(...args);
  }
}
export function createApp(files) {
  const vault = new Events();
  const root = new TFolder();
  const created = [];
  Object.assign(vault, {
    getRoot: () => root,
    read: async (file) => file.content ?? "",
    create: async (path, content) => {
      if (files.some((f) => f.path === path))
        throw new Error("File already exists");
      const file = new TFile(path);
      file.content = content;
      files.push(file);
      created.push(file);
      vault.emit("create", file);
      return file;
    },
    getMarkdownFiles: () => files.filter((f) => f.extension === "md"),
    getAbstractFileByPath: (path) => files.find((f) => f.path === path),
  });
  const metadataCache = new Events();
  metadataCache.getFileCache = (file) => ({ frontmatter: file.frontmatter });
  const leaves = [];
  const opened = [];
  const writes = [];
  return {
    vault,
    metadataCache,
    writes,
    created,
    opened,
    workspace: {
      getLeavesOfType: () => leaves,
      onLayoutReady: (callback) => callback(),
      getLeaf: () => ({ openFile: async (file) => opened.push(file.path) }),
      openLinkText: async (target) => opened.push(target),
      revealLeaf: async () => {},
    },
    fileManager: {
      processFrontMatter: async (file, callback) => {
        writes.push(file.path);
        callback(file.frontmatter);
        metadataCache.emit("changed", file);
      },
    },
    leaves,
  };
}
