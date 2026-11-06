// Renders the Qrypt app icons (PWA manifest + iOS home screen) from the lattice-Q mark. Rerun after changing the mark:
//   pnpm icons
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = new URL("../app/public/icons/", import.meta.url).pathname;
const BG = "#0c0d0f"; // the dark wallet background
const DOT = "oklch(0.93 0.004 265)";
const TAIL = "oklch(0.9 0.19 124)"; // the success lime: the Q's tail

const ring = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return `<circle cx="${11 + 7.6 * Math.cos(a)}" cy="${11 + 7.6 * Math.sin(a)}" r="1.45"/>`;
}).join("");

/** `scale` is the share of the icon the 22-unit mark spans; `round` gives the "any" icon its own corners. */
const svg = (size: number, scale: number, round: boolean) => {
  const s = (size * scale) / 22;
  const o = (size - 22 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="${BG}"/>
  <g transform="translate(${o} ${o}) scale(${s})">
    <g fill="${DOT}">${ring}<circle cx="11" cy="11" r="2.6"/></g>
    <g fill="${TAIL}"><circle cx="16.6" cy="16.6" r="1.6"/><circle cx="19.4" cy="19.4" r="1.8"/></g>
  </g>
</svg>`;
};

// Maskable icons get cropped to a circle of 80% diameter, so the mark stays inside ~60%.
const ICONS = [
  { file: "icon-192.png", size: 192, scale: 0.68, round: true },
  { file: "icon-512.png", size: 512, scale: 0.68, round: true },
  { file: "maskable-512.png", size: 512, scale: 0.56, round: false },
  { file: "apple-touch-icon.png", size: 180, scale: 0.64, round: false }, // iOS rounds it itself
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<style>*{margin:0}</style>${svg(icon.size, icon.scale, icon.round)}`);
  await page.locator("svg").screenshot({ path: OUT + icon.file, omitBackground: icon.round });
  console.log(`- ${icon.file}`);
}
await browser.close();
