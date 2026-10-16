import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DEFAULT_THEME, THEMES } from "./themes";

/** Read the REAL stylesheet, so the test checks exactly what the browser will use. */
const css = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.css"),
  "utf8",
);

type RGB = [number, number, number];
const tokensIn = (block: string): Record<string, RGB> => {
  const out: Record<string, RGB> = {};
  for (const m of block.matchAll(/--c-([a-z-]+):\s*(\d+) (\d+) (\d+);/g))
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
};
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)![1];
const base = tokensIn(rootBlock);
const themeTokens = (id: string): Record<string, RGB> => {
  const m = css.match(
    new RegExp(`html\\[data-theme=['"]${id}['"]\\]\\s*\\{([^}]*)\\}`),
  );
  return { ...base, ...(m ? tokensIn(m[1]) : {}) };
};
const lin = (v: number) =>
  (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const lum = ([r, g, b]: RGB) =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `alpha` of fg painted over bg, as the browser would blend it */
const over = (fg: RGB, bg: RGB, alpha: number): RGB =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;
const WHITE: RGB = [255, 255, 255];
const hex = ([r, g, b]: RGB) =>
  "#" +
  [r, g, b]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

const REQUIRED = [
  "ink",
  "paper",
  "line",
  "muted",
  "seal",
  "seal-dark",
  "seal-tint",
  "seal-glow",
  "vault",
  "vault-deep",
  "vault-rim",
  "brass",
  "brass-bright",
  "brass-tint",
  "sindoor",
  "sindoor-tint",
];

test("the default theme and every named theme define every token", () => {
  for (const t of THEMES) {
    const tok = themeTokens(t.id);
    for (const name of REQUIRED)
      assert.ok(tok[name], `${t.id} is missing --c-${name}`);
  }
  assert.equal(DEFAULT_THEME, "tijori");
});

test("each theme lists a swatch that matches the stylesheet", () => {
  for (const t of THEMES) {
    const tok = themeTokens(t.id);
    assert.equal(hex(tok["seal"]), t.swatch.seal, `${t.id} seal swatch`);
    assert.equal(hex(tok["vault"]), t.swatch.vault, `${t.id} vault swatch`);
  }
});

test("readable text in every theme (WCAG AA: 4.5 for normal text, 3 for large display text)", () => {
  const checks: [string, (t: Record<string, RGB>) => number, number][] = [
    ["ink on paper", (t) => contrast(t["ink"], t["paper"]), 7],
    ["ink on white", (t) => contrast(t["ink"], WHITE), 7],
    ["muted on paper", (t) => contrast(t["muted"], t["paper"]), 4.5],
    ["muted on white", (t) => contrast(t["muted"], WHITE), 4.5],
    ["white on seal (buttons)", (t) => contrast(WHITE, t["seal"]), 4.5],
    [
      "white on seal-dark (button hover)",
      (t) => contrast(WHITE, t["seal-dark"]),
      4.5,
    ],
    ["seal on white (links)", (t) => contrast(t["seal"], WHITE), 4.5],
    [
      "seal-dark on seal-tint (chips)",
      (t) => contrast(t["seal-dark"], t["seal-tint"]),
      4.5,
    ],
    [
      "ink on seal-tint (highlighted step)",
      (t) => contrast(t["ink"], t["seal-tint"]),
      4.5,
    ],
    [
      "muted on seal-tint (hints)",
      (t) => contrast(t["muted"], t["seal-tint"]),
      4.5,
    ],
    ["white on vault (header, landing)", (t) => contrast(WHITE, t["vault"]), 7],
    [
      "inactive tab, white at 65% on vault",
      (t) => contrast(over(WHITE, t["vault"], 0.65), t["vault"]),
      4.5,
    ],
    [
      "landing body copy, white at 80% on vault",
      (t) => contrast(over(WHITE, t["vault"], 0.8), t["vault"]),
      4.5,
    ],
    [
      "footer, white at 55% on vault",
      (t) => contrast(over(WHITE, t["vault"], 0.55), t["vault"]),
      4.5,
    ],
    [
      "brass-bright on vault (large headline)",
      (t) => contrast(t["brass-bright"], t["vault"]),
      3,
    ],
    [
      "brass-bright on vault-deep",
      (t) => contrast(t["brass-bright"], t["vault-deep"]),
      3,
    ],
    [
      "vault-deep on brass-bright (gold button)",
      (t) => contrast(t["vault-deep"], t["brass-bright"]),
      4.5,
    ],
    [
      "brass on brass-tint (warnings)",
      (t) => contrast(t["brass"], t["brass-tint"]),
      4.5,
    ],
    [
      "sindoor on sindoor-tint (errors)",
      (t) => contrast(t["sindoor"], t["sindoor-tint"]),
      4.5,
    ],
    [
      "sindoor on white (danger button)",
      (t) => contrast(t["sindoor"], WHITE),
      4.5,
    ],
    [
      "white on sindoor (danger hover)",
      (t) => contrast(WHITE, t["sindoor"]),
      4.5,
    ],
  ];
  const failures: string[] = [];
  for (const t of THEMES) {
    const tok = themeTokens(t.id);
    for (const [name, fn, min] of checks) {
      const ratio = fn(tok);
      if (ratio < min)
        failures.push(`${t.id}: ${name} is ${ratio.toFixed(2)}, needs ${min}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("brass and sindoor keep the same meaning (same colour) in every theme", () => {
  const ref = themeTokens("tijori");
  for (const t of THEMES) {
    const tok = themeTokens(t.id);
    for (const name of [
      "brass",
      "brass-bright",
      "brass-tint",
      "sindoor",
      "sindoor-tint",
    ])
      assert.deepEqual(tok[name], ref[name], `${t.id} changed ${name}`);
  }
});
