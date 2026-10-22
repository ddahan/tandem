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
function siteOf(input) {
  try {
    return new URL(input).hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
}

// src/page.ts
function bookmarkable(url) {
  return url ? webUrl(url) : null;
}
var MAX_ICON_BYTES = 256 * 1024;

// src/tandem.ts
var DEFAULT_ADDRESS = "http://localhost:3864";
var TandemError = class extends Error {
  problem;
  status;
  /** Tandem's answer, if any (a duplicate's names its bookmark). */
  body;
  constructor(problem, message, status = 0, body = null) {
    super(message);
    this.problem = problem;
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
    create: (fields) => save2("/api/bookmarks", "POST", fields),
    update: (id, fields) => save2(`/api/bookmarks/${encodeURIComponent(id)}`, "PATCH", fields)
  };
}

// src/settings.ts
async function getAddress() {
  const { address } = await chrome.storage.sync.get("address");
  return normalizeAddress(address ?? DEFAULT_ADDRESS);
}

// src/background.ts
var BADGE_COLOR = "#f59e0b";
var ERROR_COLOR = "#dc2626";
async function tandem() {
  return createTandem(await getAddress());
}
var saving = /* @__PURE__ */ new Set();
async function refreshBadge(tabId, url) {
  if (saving.has(tabId)) return;
  const page = bookmarkable(url);
  let saved = false;
  if (page) {
    try {
      saved = !!await (await tandem()).lookup(page);
    } catch {
    }
  }
  if (saving.has(tabId)) return;
  await badge(tabId, saved ? "\u2713" : "", saved ? "Already in Tandem" : "Add to Tandem");
}
async function badge(tabId, text, title, color = BADGE_COLOR) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {
  });
  await chrome.action.setBadgeText({ tabId, text }).catch(() => {
  });
  await chrome.action.setTitle({ tabId, title }).catch(() => {
  });
}
async function save({ tabId, id, fields }) {
  saving.add(tabId);
  await badge(tabId, "\u2713", "Already in Tandem");
  try {
    const client = await tandem();
    await (id ? client.update(id, fields) : client.create(fields));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await badge(tabId, "!", `Couldn\u2019t save in Tandem: ${reason}`, ERROR_COLOR);
  } finally {
    saving.delete(tabId);
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => refreshBadge(tabId, tab.url));
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === "complete") void refreshBadge(tabId, tab.url);
});
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== "save") return;
  respond({ received: true });
  void save(message);
});
function xml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function matched(titleHtml) {
  return titleHtml.replace(/<mark>/g, "<match>").replace(/<\/mark>/g, "</match>");
}
chrome.omnibox.setDefaultSuggestion({ description: "Search your bookmarks in Tandem" });
var typed = 0;
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const request = ++typed;
  void (async () => {
    try {
      const results = await (await tandem()).search(text, 6);
      if (request !== typed) return;
      chrome.omnibox.setDefaultSuggestion({
        description: results.length ? `Search your bookmarks in Tandem: <match>${xml(text)}</match>` : `No bookmark matches <match>${xml(text)}</match> in Tandem`
      });
      suggest(
        results.map(({ bookmark, titleHtml, folders }) => ({
          content: bookmark.url,
          description: `${matched(titleHtml)} <dim>\u2014</dim> <url>${xml(siteOf(bookmark.url))}</url>${folders ? ` <dim>${xml(folders)}</dim>` : ""}`
        }))
      );
    } catch (error) {
      chrome.omnibox.setDefaultSuggestion({
        description: xml(
          error instanceof TandemError && error.problem === "off" ? "Bookmarks are off in Tandem (Settings \u203A Features)" : error instanceof Error ? error.message : "Tandem can\u2019t be reached"
        )
      });
      suggest([]);
    }
  })();
});
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    let url = bookmarkable(text);
    if (!url || !/^https?:\/\//i.test(text)) {
      const [best] = await (await tandem()).search(text, 1).catch(() => []);
      url = best?.bookmark.url ?? null;
    }
    if (!url) return;
    if (disposition === "currentTab") await chrome.tabs.update({ url });
    else await chrome.tabs.create({ url, active: disposition === "newForegroundTab" });
  })();
});
