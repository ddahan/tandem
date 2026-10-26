// ../shared/src/format.ts
var LOCALE = "fr-FR";
var dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
var timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
var numberFormat = new Intl.NumberFormat(LOCALE);
function formatNumber(value) {
  return numberFormat.format(value);
}
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

// src/import.ts
var ICON_READS = 8;
function toImportNodes(tree) {
  const roots = tree.flatMap((root) => root.children ?? []);
  return roots.filter((root) => countBookmarks([root]) > 0).map(toNode);
}
function toNode(node) {
  return node.url !== void 0 ? { title: node.title, url: node.url } : { title: node.title, children: (node.children ?? []).map(toNode) };
}
function countBookmarks(nodes) {
  return nodes.reduce(
    (sum, node) => sum + (node.url !== void 0 ? 1 : countBookmarks(node.children ?? [])),
    0
  );
}
async function withIcons(nodes, iconOf, generic, progress = () => {
}) {
  const bookmarks = [];
  const collect = (list) => {
    for (const node of list) {
      if (node.children) collect(node.children);
      else bookmarks.push(node);
    }
  };
  const copy = structuredClone(nodes);
  collect(copy);
  let next = 0;
  let done = 0;
  const read = async () => {
    while (next < bookmarks.length) {
      const bookmark = bookmarks[next++];
      const icon = await iconOf(bookmark.url).catch(() => void 0);
      if (icon && icon !== generic) bookmark.iconDataUrl = icon;
      progress(++done);
    }
  };
  await Promise.all(Array.from({ length: ICON_READS }, read));
  return copy;
}
function importSummary(result) {
  const notes = [
    result.duplicates ? `${formatNumber(result.duplicates)} already in Tandem` : "",
    result.skipped ? `${formatNumber(result.skipped)} left out (not web pages)` : ""
  ].filter(Boolean);
  const added = result.bookmarks ? `Imported ${formatNumber(result.bookmarks)} bookmark${result.bookmarks === 1 ? "" : "s"} into the \u201CChrome\u201D folder` : "Nothing new to import";
  return `${added}${notes.length ? `; ${notes.join(", ")}` : ""}.`;
}

// src/page.ts
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
  constructor(problem, message, status2 = 0, body = null) {
    super(message);
    this.problem = problem;
    this.status = status2;
    this.body = body;
  }
};
function normalizeAddress(input2) {
  const text = input2.trim().replace(/\/+$/, "");
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
  async function save(path, method, fields) {
    try {
      const bookmark = await request(path, { method, body: JSON.stringify(fields) });
      return { bookmark, duplicate: false };
    } catch (error) {
      const existing = error instanceof TandemError && error.status === 409 ? error.body?.bookmark : void 0;
      if (existing) return { bookmark: existing, duplicate: true };
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
    create: (fields) => save("/api/bookmarks", "POST", fields),
    update: (id, fields) => save(`/api/bookmarks/${encodeURIComponent(id)}`, "PATCH", fields),
    /** Imports a browser's tree into Tandem's "Chrome" folder (see import.ts). */
    importBookmarks: (children) => request("/api/bookmarks/import", {
      method: "POST",
      body: JSON.stringify({ children })
    })
  };
}

// src/settings.ts
async function getAddress() {
  const { address } = await chrome.storage.sync.get("address");
  return normalizeAddress(address ?? DEFAULT_ADDRESS);
}
async function setAddress(address) {
  const normalized = normalizeAddress(address);
  await chrome.storage.sync.set({ address: normalized });
  return normalized;
}

// src/options.ts
var input = document.getElementById("address");
var status = document.getElementById("status");
async function check(address) {
  status.className = "muted";
  status.textContent = "Checking\u2026";
  try {
    const enabled = await createTandem(address).enabled();
    status.className = enabled ? "muted" : "error";
    status.textContent = enabled ? `Tandem answers at ${address}.` : `Tandem answers at ${address}, but its bookmarks are off (Settings \u203A Features).`;
  } catch (error) {
    status.className = "error";
    status.textContent = error instanceof TandemError ? error.message : `Tandem can\u2019t be reached at ${address}.`;
  }
}
document.getElementById("form").addEventListener("submit", (event) => {
  event.preventDefault();
  void setAddress(input.value).then((address) => {
    input.value = address;
    return check(address);
  });
});
void getAddress().then((address) => {
  input.value = address;
  return check(address);
});
var importButton = document.getElementById("import");
var importStatus = document.getElementById("import-status");
function say(text, error = false) {
  importStatus.className = error ? "error" : "muted";
  importStatus.textContent = text;
}
importButton.addEventListener("click", () => {
  const granted = chrome.permissions.request({ permissions: ["bookmarks"] });
  importButton.disabled = true;
  void importBookmarks(granted).finally(() => importButton.disabled = false);
});
async function importBookmarks(granted) {
  try {
    if (!await granted) {
      say("Chrome\u2019s bookmarks weren\u2019t imported: the extension needs to read them.", true);
      return;
    }
    const nodes = toImportNodes(await chrome.bookmarks.getTree());
    const total = countBookmarks(nodes);
    if (!total) {
      say("Chrome has no bookmarks to import.");
      return;
    }
    const generic = await faviconDataUrl("https://tandem.invalid/", void 0);
    const withFavicons = await withIcons(
      nodes,
      (url) => faviconDataUrl(url, void 0),
      generic,
      (done) => say(`Reading icons\u2026 ${formatNumber(done)} / ${formatNumber(total)}`)
    );
    say(`Importing ${formatNumber(total)} bookmarks\u2026`);
    const tandem = createTandem(await getAddress());
    const result = await tandem.importBookmarks(withFavicons);
    say(importSummary(result));
  } catch (error) {
    say(error instanceof TandemError ? error.message : "The import failed.", true);
  }
}
