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
    createFolder: (title, parentId) => request("/api/bookmarks", {
      method: "POST",
      body: JSON.stringify({ kind: "folder", title, parentId })
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
