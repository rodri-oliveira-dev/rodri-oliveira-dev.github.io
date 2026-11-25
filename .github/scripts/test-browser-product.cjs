const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "../..");
function execute(file, context) {
  const filename = path.join(ROOT, "assets/js", file);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
}
function element() {
  return {
    dataset: {}, attrs: {}, children: [], events: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    append(...children) { this.children.push(...children); },
    after(child) { this.next = child; },
    addEventListener(event, handler) { this.events[event] = handler; },
    classList: { add() {} },
  };
}
function contrast({ lang = "en", stored = null, matches = false, placement = "language", blocked = false, noMedia = false } = {}) {
  const root = { lang, dataset: {} };
  const header = element(), language = element(), offline = element(), footer = element(), body = element();
  header.matches = () => placement === "header";
  header.querySelector = (selector) => selector.includes("language") && placement === "language" ? language : null;
  const events = {}, mediaEvents = {};
  let value = stored;
  const storage = {
    getItem() { if (blocked) throw Error("storage unavailable"); return value; },
    setItem(key, next) { if (blocked) throw Error("storage unavailable"); value = next; },
  };
  const media = { matches, addEventListener(event, handler) { mediaEvents[event] = handler; } };
  const document = {
    documentElement: root, body,
    createElement: element, createElementNS: element,
    querySelector(selector) {
      if (selector.includes("site-header")) return ["language", "header"].includes(placement) ? header : null;
      if (selector.includes("pwa-offline")) return placement === "offline" ? offline : null;
      return placement === "footer" ? footer : null;
    },
  };
  const window = { addEventListener(event, handler) { events[event] = handler; } };
  if (!noMedia) window.matchMedia = () => media;
  execute("contrast.js", { document, window, localStorage: storage });
  const toggle = language.next || header.children[0] || offline.children[0] || footer.children[0] || body.children[0];
  assert.ok(toggle);
  return { root, toggle, events, media, mediaEvents, storage, value: () => value };
}
test("contrast follows OS until explicit preference and synchronizes across pages", () => {
  const app = contrast({ matches: true });
  assert.equal(app.root.dataset.contrast, "system");
  assert.equal(app.toggle.attrs["aria-checked"], "true");
  assert.equal(app.toggle.attrs["aria-label"], "High contrast");
  app.toggle.events.click();
  assert.equal(app.root.dataset.contrast, "normal");
  assert.equal(app.value(), "normal");
  app.mediaEvents.change();
  assert.equal(app.toggle.attrs["aria-checked"], "false");
  app.toggle.events.click();
  assert.equal(app.value(), "high");
  app.storage.setItem("portfolio-contrast", "normal");
  app.events.storage({ key: "other", storageArea: app.storage });
  assert.equal(app.root.dataset.contrast, "high");
  app.events.storage({ key: "portfolio-contrast", storageArea: {} });
  assert.equal(app.root.dataset.contrast, "high");
  app.events.storage({ key: "portfolio-contrast", storageArea: app.storage });
  assert.equal(app.root.dataset.contrast, "normal");
  app.storage.setItem("portfolio-contrast", "unexpected");
  app.events.pageshow({ persisted: false });
  assert.equal(app.root.dataset.contrast, "normal");
  app.events.pageshow({ persisted: true });
  assert.equal(app.root.dataset.contrast, "system");
});
test("contrast works without storage or media and in all layouts", () => {
  for (const placement of ["header", "offline", "footer", "body"]) {
    const app = contrast({ lang: placement === "header" ? "es" : "pt-BR", placement, blocked: true, noMedia: true });
    assert.equal(app.toggle.attrs["aria-label"], "Alto contraste");
    assert.equal(app.toggle.attrs["aria-checked"], "false");
    app.toggle.events.click();
    assert.equal(app.root.dataset.contrast, "high");
    app.events.storage({ key: null, storageArea: app.storage });
    app.events.pageshow({ persisted: true });
    assert.equal(app.root.dataset.contrast, "high");
  }
});
test("service worker registration is optional, secure and failure tolerant", async () => {
  for (const mode of ["unsupported", "insecure", "success", "rejection"]) {
    let listener, options, calls = 0;
    const window = { isSecureContext: mode !== "insecure", addEventListener(name, handler, config) {
      assert.equal(name, "load"); listener = handler; options = config;
    } };
    const navigator = mode === "unsupported" ? {} : { serviceWorker: { register(url, config) {
      calls++; assert.equal(url, "/sw.js"); assert.equal(config.scope, "/");
      assert.equal(config.updateViaCache, "none");
      return mode === "rejection" ? Promise.reject(Error("unsupported")) : Promise.resolve({});
    } } };
    execute("pwa-register.js", { window, navigator });
    if (mode === "unsupported" || mode === "insecure") { assert.equal(listener, undefined); continue; }
    assert.equal(options.once, true);
    listener();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  }
});
