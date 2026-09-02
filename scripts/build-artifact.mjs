// Assembles a self-contained HTML fragment for publishing as a Claude Artifact:
// inlines html-to-image's UMD bundle as a plain <script> (no bundler/import
// resolution exists in that runtime) and rewrites main.js's ESM import to
// read the resulting `window.htmlToImage` global instead.
//
// index.html 現在也裝著「人像剪影排版」模式（src/silhouette.js），但那個模式靠
// @imgly/background-removal 在瀏覽器端摳圖，會去打 staticimgly.com 抓模型 ——
// Artifact 沙盒的 CSP 不放行那個網域，裝進去也跑不動。所以這支腳本刻意只擷取
// #mode-poetic 那個 div，維持「詩意摳圖」單一功能的獨立 Artifact。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const indexHtml = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "src/style.css"), "utf8");
const mainJs = readFileSync(path.join(root, "src/main.js"), "utf8");
const htmlToImageUmd = readFileSync(
  path.join(root, "node_modules/html-to-image/dist/html-to-image.js"),
  "utf8"
);

const preconnectLinks = indexHtml.match(/<link[^>]*rel="preconnect"[^>]*>/g) || [];
const fontsLinkMatch = indexHtml.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || [];

const modeStart = indexHtml.indexOf('<div id="mode-poetic"');
const modeEnd = indexHtml.indexOf('<div id="mode-silhouette"');
if (modeStart === -1 || modeEnd === -1) {
  throw new Error("Could not find #mode-poetic / #mode-silhouette markers in index.html");
}
const bodyContent = indexHtml.slice(modeStart, modeEnd);

const adaptedMainJs = mainJs.replace(
  /^import \{ toPng \} from "html-to-image";\s*$/m,
  "const { toPng } = window.htmlToImage;"
);
if (adaptedMainJs === mainJs) {
  throw new Error("Failed to rewrite html-to-image import — check src/main.js's import line");
}

// charset 必須落在檔案前 1024 bytes 內。發布成 Artifact 時平台外層已經有一份，
// 這行是為了「直接用瀏覽器開啟這支單檔」的情境 —— 少了它中文會變亂碼。
const out = `<meta charset="utf-8">
<title>詩意圖文排版生成器</title>
${preconnectLinks.join("\n")}
${fontsLinkMatch.join("\n")}
<style>
${css}
</style>
${bodyContent.trim()}
<script>
${htmlToImageUmd}
</script>
<script>
${adaptedMainJs}
</script>
`;

const outDir = path.join(root, "artifact");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "poetic-cutout-layout.html");
writeFileSync(outPath, out, "utf8");
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB)`);
