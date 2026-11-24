const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");
const { urls } = require("../../.pa11yci.cjs");
const ORIGIN = process.env.SITE_ORIGIN || "http://127.0.0.1:8080";
const results = require("./accessibility-results.cjs").createResults("Text adaptations and accessibility tree");

// These checks supplement Pa11y. They are not browser zoom or AT conformance tests.
const inspectContent = () => {
  const isVisible = (element) => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible";
  const controls = [...document.querySelectorAll("a[href], button, input, select, textarea, summary, [role=button], [role=link]")]
    .filter(isVisible);
  const clipped = [];
  for (const element of document.querySelectorAll("main, header, footer, main *, header *, footer *")) {
    if (!isVisible(element) || element.closest(".case-study-code, .case-study-table-wrap, svg, .visually-hidden")) continue;
    const style = getComputedStyle(element);
    if (style.position === "absolute" || style.position === "fixed") continue;
    const rect = element.getBoundingClientRect();
    const text = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const clipsDescendants =
      (["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) ||
      (["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1);
    // A container without direct text can still clip its descendants.
    if (clipsDescendants || ((text || controls.includes(element)) &&
        (rect.left < -1 || rect.right > innerWidth + 1))) {
      clipped.push(element.tagName + ": " + element.textContent.trim().slice(0, 60));
    }
  }
  const main = document.querySelector("main");
  // Only the homepage hero swaps its email CTA for a vCard on mobile.
  // Service pages reuse .hero-actions but must preserve their email CTAs.
  const heroEmail = ".hero .hero-actions > a[href^='mailto:']";
  const heroVcard = ".hero .hero-actions > a.mobile-contact-action";
  const alternateContact = heroEmail + ", " + heroVcard;
  const stableText = [];
  if (main) {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && isVisible(node.parentElement) &&
          !node.parentElement.closest(alternateContact + ", script, style, .visually-hidden")) {
        const value = node.textContent.replace(/\s+/g, " ").trim();
        if (value) stableText.push(value);
      }
    }
  }
  const describe = element => [element.tagName, element.getAttribute("href"), element.textContent.trim(), element.getAttribute("aria-label")];
  return {
    stableText,
    mainControls: controls.filter(element => main?.contains(element) && !element.closest(alternateContact)).map(describe),
    desktopContact: controls.some(element => element.matches(heroEmail)),
    mobileContact: controls.some(element => element.matches(heroVcard)),
    alternateEmail: controls.some(element => element.matches(".contact-links a[href^='mailto:']")),
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    clipped,
    controls: controls.map((element) => [element.tagName, element.getAttribute("href"), element.textContent.trim(), element.getAttribute("aria-label")]),
    text: document.querySelector("main")?.innerText.replace(/\s+/g, " ").trim()
  };
};

async function assertLayout(page, url, mode, baseline, reflow = false) {
  const actual = await page.evaluate(inspectContent);
  await results.run(`${url} | ${mode} | horizontal overflow`, () => assert.ok(actual.documentWidth <= actual.viewport + 1, `document ${actual.documentWidth}px / viewport ${actual.viewport}px`));
  await results.run(`${url} | ${mode} | clipped content`, () => assert.deepEqual(actual.clipped, []));
  if (reflow) {
    await results.run(`${url} | ${mode} | main text`, () => assert.deepEqual(actual.stableText, baseline.stableText));
    await results.run(`${url} | ${mode} | main controls`, () => assert.deepEqual(actual.mainControls, baseline.mainControls));
    if (baseline.desktopContact) {
      await results.run(`${url} | ${mode} | alternate contact actions`, () => {
        assert.ok(actual.alternateEmail && actual.mobileContact, "Mobile contact download and equivalent email link must remain available");
      });
    }
  } else {
    await results.run(`${url} | ${mode} | main text`, () => assert.equal(actual.text, baseline.text));
    await results.run(`${url} | ${mode} | visible controls`, () => assert.deepEqual(actual.controls, baseline.controls));
  }
}

async function enlargeText(page) {
  // Capture computed sizes before applying overrides, avoiding inherited double scaling.
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll("body, body *")]
      .filter((element) => !(element instanceof SVGElement))
      .map((element) => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) {
      if (Number.isFinite(size)) element.style.setProperty("font-size", size * 2 + "px", "important");
    }
  });
}

async function assertAccessibilityTree(page, url) {
  const session = await page.createCDPSession();
  try {
    await session.send("Accessibility.enable");
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const exposed = nodes.filter((node) => !node.ignored);
    const role = (node) => node.role?.value;
    const name = (node) => String(node.name?.value ?? "").trim();
    assert.equal(exposed.filter((node) => role(node) === "main").length, 1, `${url}: expected one main landmark`);
    const headings = exposed.filter((node) => role(node) === "heading");
    assert.equal(headings.filter((node) => node.properties?.some((p) => p.name === "level" && p.value.value === 1)).length, 1,
      `${url}: expected one exposed level-one heading`);
    const unnamed = exposed.filter((node) =>
      ["heading", "button", "link", "checkbox", "radio", "textbox", "combobox", "switch"].includes(role(node)) && !name(node));
    assert.deepEqual(unnamed.map((node) => role(node)), [], `${url}: unnamed exposed controls or headings`);
  } finally {
    await session.detach();
  }
}

async function assertMobileMenuTree(page, url) {
  const toggle = await page.$(".mobile-nav-toggle");
  if (!toggle) return;
  const session = await page.createCDPSession();
  try {
    await session.send("Accessibility.enable");
    const { root } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".mobile-nav-toggle" });
    async function check(expected) {
      const { nodes } = await session.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
      const node = nodes[0];
      assert.ok(node && !node.ignored && node.role?.value === "button" && node.name?.value, `${url}: mobile menu accessible button`);
      assert.equal(node.properties?.find((p) => p.name === "expanded")?.value.value, expected, `${url}: menu expanded state in AX tree`);
    }
    await check(false);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector(".mobile-nav-toggle").getAttribute("aria-expanded") === "true");
    await check(true);
    await page.keyboard.press("Escape");
    await check(false);
  } finally {
    await session.detach();
    await toggle.dispose();
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    await results.run("Clipping inspector regression", async () => {
      const page = await browser.newPage();
      try {
        await page.setContent('<main><div id="clip-fixture" style="height:10px;overflow:hidden"><p style="margin:0">Clipped descendant</p></div></main>');
        const actual = await page.evaluate(inspectContent);
        assert.ok(actual.clipped.some(value => value.startsWith("DIV: Clipped descendant")), "Clipping ancestor must be detected");
        const baseline = actual.stableText;
        await page.$eval("#clip-fixture", el => { el.style.display = "none"; });
        const hidden = await page.evaluate(inspectContent);
        assert.notDeepEqual(hidden.stableText, baseline, "Hidden main text must change the baseline");
      } finally { await page.close(); }
    });
    await results.run("Responsive contact contract regression", async () => {
      const page = await browser.newPage();
      try {
        await page.setContent('<main><section class="services-hero"><div class="hero-actions"><a href="mailto:test@example.com?subject=Project">Project email</a></div></section><section class="services-cta"><div class="hero-actions"><a href="mailto:test@example.com?subject=Project">Contact email</a></div></section></main>');
        const desktop = await page.evaluate(inspectContent);
        assert.equal(desktop.desktopContact, false, "Service CTAs must not trigger the homepage vCard exception");
        assert.equal(desktop.mainControls.length, 2, "Both service CTAs must be preserved");
        assert.deepEqual(desktop.stableText, ["Project email", "Contact email"]);
        await page.$eval(".services-cta a", el => { el.style.display = "none"; });
        const mobile = await page.evaluate(inspectContent);
        assert.notDeepEqual(mobile.mainControls, desktop.mainControls, "Hidden service CTA must be detected");
        assert.notDeepEqual(mobile.stableText, desktop.stableText, "Hidden service CTA text must be detected");
      } finally { await page.close(); }
    });
    for (const configuredUrl of urls) {
      const url = new URL(new URL(configuredUrl).pathname, ORIGIN).href;
      const scenario = async (name, width, height, check) => {
        await results.run(url + " | " + name, async () => {
          const page = await browser.newPage();
          try {
            await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
            await page.setViewport({ width, height, deviceScaleFactor: 1 });
            await page.goto(url, { waitUntil: "load" });
            await check(page);
          } finally {
            await page.close();
          }
        });
      };
      let desktopHeading;
      let desktopBaseline;
      await scenario("Desktop accessibility tree", 1280, 900, async page => {
        desktopHeading = await page.$eval("main h1", element => element.innerText.trim());
        desktopBaseline = await page.evaluate(inspectContent);
        await assertAccessibilityTree(page, url);
      });
      await scenario("200% text", 1280, 900, async page => {
        const baseline = await page.evaluate(inspectContent);
        await enlargeText(page);
        await assertLayout(page, url, "200% computed font-size", baseline);
      });
      await scenario("320px reflow", 320, 256, async page => {
        const heading = await page.$eval("main h1", element => element.innerText.trim());
        await results.run(url + " | reflow | primary heading", () => assert.equal(heading, desktopHeading, "Desktop and mobile primary heading must match"));
        assert.ok(desktopBaseline, "Desktop baseline unavailable");
        await assertLayout(page, url, "320px reflow", desktopBaseline, true);
      });
      await scenario("Mobile accessibility tree", 320, 256, page => assertAccessibilityTree(page, url));
      await scenario("Mobile menu accessibility tree", 320, 256, page => assertMobileMenuTree(page, url));
      await scenario("WCAG text spacing", 320, 256, async page => {
        const baseline = await page.evaluate(inspectContent);
        await page.evaluate(() => {
          for (const element of document.querySelectorAll("body, body *")) {
            if (element instanceof SVGElement) continue;
            element.style.setProperty("line-height", "1.5", "important");
            element.style.setProperty("letter-spacing", "0.12em", "important");
            element.style.setProperty("word-spacing", "0.16em", "important");
            if (element.tagName === "P") element.style.setProperty("margin-bottom", "2em", "important");
          }
        });
        await assertLayout(page, url, "WCAG text spacing", baseline);
      });
    }
  } finally {
    await browser.close();
    results.finish();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
