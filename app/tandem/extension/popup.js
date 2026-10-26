// ../shared/src/format.ts
var LOCALE = "fr-FR";
var dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
var timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
var numberFormat = new Intl.NumberFormat(LOCALE);
var euros = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});
var eurosAndCents = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

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
var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
async function faviconDataUrl(pageUrl, tabIcon, fetcher = fetch) {
  if (tabIcon?.startsWith("data:image/")) return tabIcon;
  const source = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`);
  try {
    const response = await fetcher(source);
    const blob = await response.blob();
    if (!response.ok || blob.size > MAX_ICON_BYTES) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const png = PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
    const type = blob.type.startsWith("image/") ? blob.type : png ? "image/png" : void 0;
    if (!type) return;
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${type};base64,${btoa(binary)}`;
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
    /** Imports a browser's tree into Tandem's "Chrome" folder (see import.ts). */
    importBookmarks: (children) => request("/api/bookmarks/import", {
      method: "POST",
      body: JSON.stringify({ children })
    })
  };
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

// src/popup.ts
var $ = (id) => document.getElementById(id);
var tandem;
var tab;
var existing = null;
var bookmarks = [];
var iconDataUrl;
function show(section) {
  for (const id of ["loading", "problem", "form"]) $(id).hidden = id !== section;
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
function useExisting(bookmark) {
  existing = bookmark;
  $("heading").textContent = "Already in Tandem";
  const notice = $("existing");
  notice.textContent = `In ${folderPath(bookmarks, bookmark)}. Saving changes it.`;
  notice.hidden = false;
  $("title").value = bookmark.title;
  $("url").value = bookmark.url;
  $("description").value = bookmark.description;
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
    const [all, found, description, icon] = await Promise.all([
      tandem.list(),
      tandem.lookup(url),
      pageDescription(current.id),
      faviconDataUrl(url, current.favIconUrl)
    ]);
    bookmarks = all;
    iconDataUrl = icon;
    if (found) useExisting(found);
    else {
      $("title").value = current.title?.trim() || url;
      $("url").value = url;
      $("description").value = description;
    }
    show("form");
    const title = $("title");
    title.focus();
    title.select();
  } catch (error) {
    failed(error);
  }
}
async function save(event) {
  event.preventDefault();
  const message = {
    type: "save",
    tabId: tab.id,
    id: existing?.id,
    fields: {
      title: $("title").value,
      url: $("url").value,
      description: $("description").value,
      ...existing ? {} : { iconDataUrl }
    }
  };
  await chrome.runtime.sendMessage(message).catch(() => {
  });
  window.close();
}
$("form").addEventListener("submit", (event) => void save(event));
$("cancel").addEventListener("click", () => window.close());
$("description").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
    $("form").requestSubmit();
});
void start();
