import { readFileSync } from "node:fs";

const css = [
  readFileSync("assets/css/site.css", "utf8"),
  readFileSync("assets/css/mobile-enhancements.css", "utf8"),
].join("\n");

const variables = new Map();
for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  variables.set(match[1], match[2].trim());
}

function parseHex(value) {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Unsupported hex color: ${value}`);
  const hex = match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function parseRgba(value) {
  const match = value.trim().match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (!match) throw new Error(`Unsupported rgba color: ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  return 0.2126 * linearize(rgb[0]) + 0.7152 * linearize(rgb[1]) + 0.0722 * linearize(rgb[2]);
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground, background, alpha) {
  return foreground.map((channel, index) => Math.round(alpha * channel + (1 - alpha) * background[index]));
}

function token(name) {
  const value = variables.get(name);
  if (!value) throw new Error(`Missing CSS variable --${name}`);
  return value;
}

function assertContrast(label, foreground, background, minimum) {
  const actual = ratio(foreground, background);
  if (actual + Number.EPSILON < minimum) {
    throw new Error(`${label}: ${actual.toFixed(2)}:1, expected >= ${minimum}:1`);
  }
  console.log(`PASS ${label}: ${actual.toFixed(2)}:1 >= ${minimum}:1`);
}

const bg = parseHex(token("bg"));
const bgElevated = parseHex(token("bg-elevated"));
const surface = parseHex(token("surface"));
const surfaceSoft = parseHex(token("surface-soft"));
const text = parseHex(token("text"));
const muted = parseHex(token("muted"));
const accent = parseHex(token("accent"));

for (const [surfaceName, background] of [
  ["bg", bg],
  ["bg-elevated", bgElevated],
  ["surface", surface],
  ["surface-soft", surfaceSoft],
]) {
  assertContrast(`--text on --${surfaceName}`, text, background, 4.5);
  assertContrast(`--muted on --${surfaceName}`, muted, background, 4.5);
  assertContrast(`--accent on --${surfaceName}`, accent, background, 4.5);
}

assertContrast("primary button text", parseHex("#08101b"), text, 4.5);
assertContrast("active language text", parseHex("#0a0e18"), text, 4.5);
assertContrast("tag text on surface", parseHex("#c1cbe0"), surface, 4.5);
assertContrast("toolkit link text", parseHex("#d7deee"), surfaceSoft, 4.5);
assertContrast("contact link text", parseHex("#dce4f4"), bgElevated, 4.5);
assertContrast("hero gradient start", parseHex("#7dd3fc"), bg, 4.5);
assertContrast("hero gradient end", parseHex("#c4b5fd"), bg, 4.5);

const controlBorder = parseRgba(token("a11y-control-border"));
for (const [surfaceName, background] of [["bg", bg], ["black mobile header", parseHex("#000000")]]) {
  const renderedBorder = composite(controlBorder.rgb, background, controlBorder.alpha);
  assertContrast(`control border on ${surfaceName}`, renderedBorder, background, 3);
}
