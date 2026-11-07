// Title and closing cards for the demo video, rendered from HTML at 1920x1080.
import { chromium } from "playwright";

const ring = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return `<circle cx="${11 + 7.6 * Math.cos(a)}" cy="${11 + 7.6 * Math.sin(a)}" r="1.45"/>`;
}).join("");
const mark = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 22 22"><g fill="#e8eaee">${ring}<circle cx="11" cy="11" r="2.6"/></g><g fill="#c4f04a"><circle cx="16.6" cy="16.6" r="1.6"/><circle cx="19.4" cy="19.4" r="1.8"/></g></svg>`;

const page = (body: string) => `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1920px; height: 1080px; background: #0c0d0f; color: #eef0f3; font-family: -apple-system, "SF Pro Display", Inter, system-ui, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px;
         background-image: radial-gradient(rgba(255,255,255,.07) 1.2px, transparent 1.2px); background-size: 28px 28px; }
  h1 { font-size: 132px; font-weight: 650; letter-spacing: -0.035em; display: flex; align-items: center; gap: 36px; }
  .sub { font-size: 50px; color: #c9ccd2; letter-spacing: -0.01em; }
  .foot { font-size: 30px; color: #8b9099; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .tags { display: flex; gap: 16px; margin-top: 8px; }
  .tag { font-size: 28px; padding: 10px 22px; border-radius: 999px; border: 1.5px solid #2a2d33; color: #d6d9de; }
  .lime { color: #c4f04a; }
</style></head><body>${body}</body></html>`;

export const CARDS = {
  title: page(`
    <h1>${mark(150)}Qrypt</h1>
    <div class="sub">A post-quantum Ethereum wallet</div>
    <div class="foot">Live on the EIP-8141 devnet · ETHGlobal Mumbai 2026</div>`),
  close: page(`
    <h1>${mark(120)}Qrypt</h1>
    <div class="sub">No ECDSA. <span class="lime">No ETH.</span> No middlemen.</div>
    <div class="tags"><span class="tag">Falcon-512</span><span class="tag">EIP-8141</span><span class="tag">ERC-8421 BUDGET-010</span><span class="tag">Uniswap v4</span></div>
    <div class="foot">qrypt.money · github.com/yashj09/qpay</div>`),
};

/** Captions laid over a scene: transparent except the text on the left. */
const caption = (title: string, lines: string[]) => `<!doctype html><html><head><style>
  * { margin: 0; } body { width: 1920px; height: 1080px; background: transparent; font-family: -apple-system, "SF Pro Display", Inter, system-ui, sans-serif; }
  .box { position: absolute; left: 220px; top: 420px; display: flex; flex-direction: column; gap: 22px; }
  h2 { font-size: 72px; font-weight: 650; letter-spacing: -0.03em; color: #eef0f3; }
  p { font-size: 34px; color: #9aa0a8; }
</style></head><body><div class="box"><h2>${title}</h2>${lines.map((l) => `<p>${l}</p>`).join("")}</div></body></html>`;

export const CAPTIONS = {
  phoneCaption: caption("On your phone", ["Installable app · Face ID unlock and recovery", "Scan-to-pay links · payment notifications"]),
  popupCaption: caption("Also a browser extension", ["Same wallet, same encrypted Falcon key vault", "Dapps find it through EIP-6963"]),
};

export async function renderCards(dir: string) {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const out: Record<string, string> = {};
  for (const [name, html] of Object.entries(CARDS)) {
    await p.setContent(html);
    out[name] = `${dir}/card-${name}.png`;
    await p.screenshot({ path: out[name] });
  }
  for (const [name, html] of Object.entries(CAPTIONS)) {
    await p.setContent(html);
    out[name] = `${dir}/${name}.png`;
    await p.screenshot({ path: out[name], omitBackground: true });
  }
  await browser.close();
  return out;
}
