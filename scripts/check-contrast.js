// @ts-check
// Checks colour contrast in both themes (WCAG 2.1 AA): text at least 4.5:1, and the parts people
// need to see to use a control (input borders, focus ring, error border) at least 3:1 (1.4.11).
// Reads the colours straight from src/input.css: light from the @theme block, dark from the
// [data-theme="dark"] block. Run with: node scripts/check-contrast.js

import { readFileSync } from "node:fs";

/** [text, background] pairs that must reach 4.5:1. */
const PAIRS = [
  ["ink", "canvas"],
  ["ink", "surface"],
  ["ink", "canvas-hover"],
  ["muted", "canvas"],
  ["muted", "surface"],
  ["muted", "canvas-hover"],
  ["primary", "canvas"],
  ["primary", "surface"],
  ["primary", "primary-soft"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["on-danger", "danger"],
  ["warning", "warning-soft"],
  ["danger", "danger-soft"],
  ["info", "info-soft"],
  // the cork: only ink text sits directly on it (the search tint and icon-hover circle)
  ["ink", "board"],
  ["danger", "canvas"],
  ["danger", "surface"],
  ["warning", "canvas"],
  ["info", "canvas"],
  ["ink", "danger-soft"],
  ["on-accent", "accent"],
];

/** [colour, background] pairs that only need 3:1: borders and the focus ring (WCAG 1.4.11). */
const NON_TEXT = [
  ["field-border", "surface"],
  ["field-border", "canvas"],
  ["primary", "surface"],
  ["primary", "canvas"],
  ["primary", "board"],
  ["danger", "danger-soft"],
];

const MIN_RATIO = 4.5;
const MIN_NON_TEXT = 3;

/**
 * The --color-* hex values inside the first block that starts with `opening`.
 * @param {string} css
 * @param {string} opening e.g. "@theme {"
 * @returns {Record<string, string>}
 */
function readColors(css, opening) {
  const start = css.indexOf(opening);
  if (start < 0) throw new Error(`Couldn't find "${opening}" in src/input.css`);
  const block = css.slice(start, css.indexOf("}", start));
  /** @type {Record<string, string>} */
  const colors = {};
  for (const [, name, hex] of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)) colors[name] = hex.toLowerCase();
  return colors;
}

/**
 * Relative luminance of a #rrggbb colour (WCAG 2.1).
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Prints the table for one theme and returns how many pairs failed.
 * @param {string} name
 * @param {Record<string, string>} colors
 * @returns {number}
 */
function checkTheme(name, colors) {
  console.log(`\n${name} theme`);
  let failures = 0;
  for (const [text, background, min = MIN_RATIO] of [...PAIRS, ...NON_TEXT.map(([a, b]) => [a, b, MIN_NON_TEXT])]) {
    const a = colors[text];
    const b = colors[background];
    if (!a || !b) {
      console.log(`  MISSING  ${text} on ${background} (colour not found in src/input.css)`);
      failures += 1;
      continue;
    }
    const ratio = contrast(a, b);
    const ok = ratio >= Number(min);
    if (!ok) failures += 1;
    console.log(`  ${ok ? "OK  " : "FAIL"}  ${`${text} on ${background}`.padEnd(28)} ${ratio.toFixed(2)}:1  (${a} on ${b})${min === MIN_NON_TEXT ? "  [3:1, border / focus]" : ""}`);
  }
  return failures;
}

/** Reads both themes, prints the results and exits with 1 if anything is below 4.5:1. */
function main() {
  const css = readFileSync(new URL("../src/input.css", import.meta.url), "utf8");
  const light = readColors(css, "@theme {");
  // the dark block only lists what changes; anything it leaves out keeps the light value
  const dark = { ...light, ...readColors(css, ':root[data-theme="dark"]') };
  const lightCopy = readColors(css, '[data-theme="light"] {\n  --color');

  let failures = checkTheme("Light", light) + checkTheme("Dark", dark);

  // the [data-theme="light"] copy (used inside dark pages) must match @theme
  const different = Object.keys(light).filter((key) => lightCopy[key] && lightCopy[key] !== light[key]);
  if (different.length) {
    console.log(`\nThe [data-theme="light"] block differs from @theme for: ${different.join(", ")}`);
    failures += different.length;
  }

  console.log(failures ? `\n${failures} problem(s) found — adjust the colours in src/input.css.` : `\nAll pairs reach ${MIN_RATIO}:1 (text) and ${MIN_NON_TEXT}:1 (borders, focus) in both themes.`);
  process.exitCode = failures ? 1 : 0;
}

main();
