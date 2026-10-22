// ../shared/src/format.ts
var LOCALE = "fr-FR";
var dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
var timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
var numberFormat = new Intl.NumberFormat(LOCALE);

// ../shared/src/calendar.ts
var CALENDAR_DIR = "Calendar";
var DAY_PATH = new RegExp(`^${CALENDAR_DIR}/(\\d{4}-\\d{2}-\\d{2})\\.md$`, "i");

// ../shared/src/bookmarks.ts
var EXTENSION_ID = "kmecpgdldjmbehndpobipnndopjdgkci";
var EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
var BOOKMARKS_OFF = "bookmarks_off";
var BOOKMARK_DESCRIPTION_MAX = 1e3;
var BOOKMARK_URL_MAX = 4e3;
function webUrl(input) {
  let text = input.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.href.length > BOOKMARK_URL_MAX ? null : url.href;
}

// src/page.ts
function readDescription() {
  const metas = [...document.querySelectorAll("meta")];
  const content = (key) => metas.find(
    (meta) => (meta.getAttribute("name") ?? meta.getAttribute("property"))?.toLowerCase() === key
  )?.getAttribute("content")?.replace(/\s+/g, " ").trim() ?? "";
  return content("description") || content("og:description") || content("twitter:description");
}
function bookmarkable(url) {
  return url ? webUrl(url) : null;
}
async function pageDescription(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readDescription
    });
    return String(result?.result ?? "").slice(0, BOOKMARK_DESCRIPTION_MAX);
  } catch {
    return "";
  }
}
var MAX_ICON_BYTES = 256 * 1024;
async function faviconDataUrl(pageUrl, tabIcon, fetcher = fetch) {
  if (tabIcon?.startsWith("data:image/")) return tabIcon;
  const source = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`);
  try {
    const response = await fetcher(source);
    const blob = await response.blob();
    if (!response.ok || !blob.type.startsWith("image/") || blob.size > MAX_ICON_BYTES) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type};base64,${btoa(binary)}`;
  } catch {
    return void 0;
  }
}

// src/tandem.ts
var DEFAULT_ADDRESS = "http://localhost:3864";
var TandemError = class extends Error {
  problem;
  status;
  /** Tandem's answer, if any (a duplicate's names its bookmark). */
  body;
  constructor(problem2, message, status = 0, body = null) {
    super(message);
    this.problem = problem2;
    this.status = status;
    this.body = body;
  }
};
function normalizeAddress(input) {
  const text = input.trim().replace(/\/+$/, "");
  if (!text) return DEFAULT_ADDRESS;
  return /^https?:\/\//i.test(text) ? text : `http://${text}`;
}
function createTandem(address, fetcher = fetch) {
  const base = normalizeAddress(address);
  async function request(path, init = {}) {
    let response;
    try {
      response = await fetcher(`${base}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...init.headers }
      });
    } catch {
      throw new TandemError("offline", `Tandem isn\u2019t running at ${base}.`);
    }
    const body = await response.json().catch(() => null);
    if (response.status === 409 && body?.code === BOOKMARKS_OFF) {
      throw new TandemError("off", "Bookmarks are off in Tandem.", 409);
    }
    if (!response.ok) {
      throw new TandemError(
        "error",
        body?.error ?? `Tandem answered with an error (${response.status}).`,
        response.status,
        body
      );
    }
    return body;
  }
  async function save2(path, method, fields) {
    try {
      const bookmark = await request(path, { method, body: JSON.stringify(fields) });
      return { bookmark, duplicate: false };
    } catch (error) {
      const existing2 = error instanceof TandemError && error.status === 409 ? error.body?.bookmark : void 0;
      if (existing2) return { bookmark: existing2, duplicate: true };
      throw error;
    }
  }
  return {
    address: base,
    /** Whether bookmarks are on (Settings › Features). */
    async enabled() {
      return (await request("/api/bookmarks/status")).enabled;
    },
    list: () => request("/api/bookmarks"),
    /** The bookmark of this page, if it's saved. */
    lookup: async (url) => (await request(
      `/api/bookmarks/lookup?url=${encodeURIComponent(url)}`
    )).bookmark,
    search: (query, limit = 6) => request(
      `/api/bookmarks/search?q=${encodeURIComponent(query)}&limit=${limit}`
    ),
    create: (fields) => save2("/api/bookmarks", "POST", fields),
    update: (id, fields) => save2(`/api/bookmarks/${encodeURIComponent(id)}`, "PATCH", fields),
    createFolder: (title, parentId) => request("/api/bookmarks", {
      method: "POST",
      body: JSON.stringify({ kind: "folder", title, parentId })
    })
  };
}
function folderOptions(bookmarks2) {
  const options = [{ id: null, label: "Bookmarks", depth: 0 }];
  const walk = (parentId, depth) => {
    const folders = bookmarks2.filter((bookmark) => bookmark.kind === "folder" && bookmark.parentId === parentId).toSorted((a, b) => a.position - b.position);
    for (const folder of folders) {
      options.push({ id: folder.id, label: folder.title, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  return options;
}
function folderPath(bookmarks2, bookmark) {
  const byId = new Map(bookmarks2.map((b) => [b.id, b]));
  const names = [];
  let parent = bookmark.parentId ? byId.get(bookmark.parentId) : void 0;
  while (parent) {
    names.unshift(parent.title);
    parent = parent.parentId ? byId.get(parent.parentId) : void 0;
  }
  return names.join(" / ") || "Bookmarks";
}

// src/settings.ts
async function getAddress() {
  const { address } = await chrome.storage.sync.get("address");
  return normalizeAddress(address ?? DEFAULT_ADDRESS);
}
async function getLastFolder() {
  const { lastFolder } = await chrome.storage.local.get("lastFolder");
  return lastFolder ?? null;
}
async function setLastFolder(id) {
  await chrome.storage.local.set({ lastFolder: id });
}

// src/popup.ts
var $ = (id) => document.getElementById(id);
var NEW_FOLDER = "+new";
var TOP = "";
var tandem;
var tab;
var existing = null;
var bookmarks = [];
var iconDataUrl;
function show(section) {
  for (const id of ["loading", "problem", "form", "saved"]) $(id).hidden = id !== section;
}
function button(label, onClick, primary = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (primary) element.className = "primary";
  element.addEventListener("click", onClick);
  return element;
}
function problem(title, text, actions = []) {
  $("problem-title").textContent = title;
  $("problem-text").textContent = text;
  $("problem-actions").replaceChildren(...actions);
  show("problem");
}
function failed(error) {
  const retry = button("Try again", () => void start(), true);
  if (error instanceof TandemError && error.problem === "offline") {
    problem(
      "Tandem isn\u2019t running",
      `Nothing answers at ${tandem.address}. Tandem starts with your computer: if it doesn\u2019t, run its install command again. If it uses another address, change it in the extension\u2019s options.`,
      [button("Options", () => void chrome.runtime.openOptionsPage()), retry]
    );
  } else if (error instanceof TandemError && error.problem === "off") {
    problem(
      "Bookmarks are off in Tandem",
      "Turn them on in Tandem\u2019s Settings \u203A Features, then try again.",
      [
        button("Open Settings", () => {
          void chrome.tabs.create({ url: `${tandem.address}/settings/features` });
          window.close();
        }),
        retry
      ]
    );
  } else {
    problem("Couldn\u2019t reach Tandem", error instanceof Error ? error.message : String(error), [
      retry
    ]);
  }
}
function fillFolders(selected) {
  const select = $("folder");
  const options = folderOptions(bookmarks).map((folder) => {
    const option = document.createElement("option");
    option.value = folder.id ?? TOP;
    option.textContent = `${"\u2003".repeat(Math.max(0, folder.depth - 1))}${folder.label}`;
    return option;
  });
  const add = document.createElement("option");
  add.value = NEW_FOLDER;
  add.textContent = "New folder\u2026";
  select.replaceChildren(...options, add);
  select.value = selected && bookmarks.some((b) => b.id === selected) ? selected : TOP;
}
function useExisting(bookmark) {
  existing = bookmark;
  $("heading").textContent = "Already in Tandem";
  const notice = $("existing");
  notice.textContent = `In ${folderPath(bookmarks, bookmark)}. Saving changes it.`;
  notice.hidden = false;
  $("title").value = bookmark.title;
  $("url").value = bookmark.url;
  $("description").value = bookmark.description;
  fillFolders(bookmark.parentId);
  $("save").textContent = "Save";
}
async function targetTab() {
  const id = Number(new URLSearchParams(location.search).get("tab"));
  if (id) return chrome.tabs.get(id);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}
async function start() {
  show("loading");
  tandem = createTandem(await getAddress());
  const current = await targetTab();
  const url = bookmarkable(current?.url);
  if (!current?.id || !url) {
    problem(
      "This page can\u2019t be bookmarked",
      "Only web pages (http and https addresses) go to Tandem."
    );
    return;
  }
  tab = current;
  try {
    if (!await tandem.enabled()) throw new TandemError("off", "Bookmarks are off in Tandem.");
    const [all, found, description, icon, lastFolder] = await Promise.all([
      tandem.list(),
      tandem.lookup(url),
      pageDescription(current.id),
      faviconDataUrl(url, current.favIconUrl),
      getLastFolder()
    ]);
    bookmarks = all;
    iconDataUrl = icon;
    if (found) useExisting(found);
    else {
      $("title").value = current.title?.trim() || url;
      $("url").value = url;
      $("description").value = description;
      fillFolders(lastFolder);
    }
    show("form");
    const title = $("title");
    title.focus();
    title.select();
  } catch (error) {
    failed(error);
  }
}
async function addFolder() {
  const name = $("new-folder-name").value.trim();
  if (!name) return;
  try {
    const folder = await tandem.createFolder(name, null);
    bookmarks = [...bookmarks, folder];
    fillFolders(folder.id);
    $("new-folder").hidden = true;
    $("new-folder-name").value = "";
  } catch (error) {
    formError(error);
  }
}
function formError(error) {
  if (error instanceof TandemError && error.problem !== "error") return failed(error);
  const element = $("form-error");
  element.textContent = error instanceof Error ? error.message : String(error);
  element.hidden = false;
}
async function save(event) {
  event.preventDefault();
  const saveButton = $("save");
  saveButton.disabled = true;
  $("form-error").hidden = true;
  const folder = $("folder").value;
  const parentId = folder === TOP || folder === NEW_FOLDER ? null : folder;
  const fields = {
    title: $("title").value,
    url: $("url").value,
    description: $("description").value,
    parentId
  };
  try {
    const result = existing ? await tandem.update(existing.id, fields) : await tandem.create({ ...fields, iconDataUrl });
    if (result.duplicate && !existing) {
      useExisting(result.bookmark);
      saveButton.disabled = false;
      return;
    }
    await setLastFolder(parentId);
    $("saved-text").textContent = `\u201C${result.bookmark.title}\u201D is in ${folderPath(bookmarks, result.bookmark)}.`;
    show("saved");
    void chrome.runtime.sendMessage({ type: "bookmarked", tabId: tab.id }).catch(() => {
    });
    setTimeout(() => window.close(), 900);
  } catch (error) {
    formError(error);
  } finally {
    saveButton.disabled = false;
  }
}
$("form").addEventListener("submit", (event) => void save(event));
$("cancel").addEventListener("click", () => window.close());
$("description").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
    $("form").requestSubmit();
});
$("folder").addEventListener("change", () => {
  const adding = $("folder").value === NEW_FOLDER;
  $("new-folder").hidden = !adding;
  if (adding) $("new-folder-name").focus();
});
$("new-folder-add").addEventListener("click", () => void addFolder());
$("new-folder-name").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void addFolder();
});
void start();
