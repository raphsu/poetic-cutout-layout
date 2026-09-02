// Assembles a self-contained HTML fragment for publishing as a Claude Artifact:
// inlines html-to-image's UMD bundle as a plain <script> (no bundler/import
// resolution exists in that runtime) and rewrites main.js's ESM import to
// read the resulting `window.htmlToImage` global instead.
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

const bodyMatch = indexHtml.match(/<div class="app-container">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/);
// Fallback: grab everything between <body> and the module script tag.
const bodyContent = indexHtml.match(/<body>([\s\S]*)<script type="module"/)?.[1];
if (!bodyContent) throw new Error("Could not extract body content from index.html");

const adaptedMainJs = mainJs.replace(
  /^import \{ toPng \} from "html-to-image";\s*$/m,
  "const { toPng } = window.htmlToImage;"
);
if (adaptedMainJs === mainJs) {
  throw new Error("Failed to rewrite html-to-image import — check src/main.js's import line");
}

const out = `<title>詩意圖文排版生成器</title>
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
