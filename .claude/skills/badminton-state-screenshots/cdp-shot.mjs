// 用 Chrome DevTools Protocol 截图,支持注入登录 cookie(以"参赛者"视角截图)。
// 依赖:Node 21+(全局 WebSocket / fetch),无需 npm install。
// 用法: node cdp-shot.mjs <url> <out.png> [cookieValue] [width] [height] [port] [clickText]
//   cookieValue 形如 "bm_user=xxxxx";留空则未登录视角。
//   clickText   截图前先点击页面上"文字包含该串"的按钮/链接(用于截开弹窗后的抽屉)。
import fs from "node:fs";

const [url, out, cookie = "", W = "500", H = "1180", PORT = "9222", clickText = ""] = process.argv.slice(2);
const width = +W, height = +H;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 取一个 page target 的 ws 调试地址
let page;
for (let i = 0; i < 20; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    page = list.find((t) => t.type === "page");
    if (page?.webSocketDebuggerUrl) break;
  } catch {}
  await sleep(300);
}
if (!page) { console.error("找不到 Chrome 调试目标"); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};

await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });

if (cookie) {
  const eq = cookie.indexOf("=");
  const name = cookie.slice(0, eq), value = cookie.slice(eq + 1);
  const host = new URL(url).hostname;
  await send("Network.setCookie", { name, value, domain: host, path: "/", httpOnly: true, sameSite: "Lax" });
}

await send("Page.navigate", { url });
await sleep(3800); // 等 React 拉数据 + 渲染

if (clickText) {
  await send("Runtime.enable");
  const js = `(()=>{const t=${JSON.stringify(clickText)};` +
    `const els=[...document.querySelectorAll('button,a,[role=button],.full-group-link,.text-link,.btn-action,.btn-secondary')];` +
    `const el=els.find(e=>((e.textContent||'').includes(t)));` +
    `if(el){el.click();return true}return false})()`;
  await send("Runtime.evaluate", { expression: js });
  await sleep(1900); // 等抽屉滑出
}

const { data } = await send("Page.captureScreenshot", {
  format: "png", captureBeyondViewport: true,
  clip: { x: 0, y: 0, width, height, scale: 1 },
});
fs.writeFileSync(out, Buffer.from(data, "base64"));
ws.close();
console.log(`saved ${out} (${fs.statSync(out).size} bytes)`);
process.exit(0);
