import { defineConfig } from "vite";

// 平台會用 PORT 環境變數指派實際的埠號（autoPort），本機手動 `npm run dev`
// 沒設這個變數時就退回原本的 5274。
//
// base 只在 CI build 時由 VITE_BASE 蓋成 /poetic-cutout-layout/（GitHub Pages
// 部署在子路徑下）；本機 dev/preview 維持預設的 "/"，不然本機還要多繞一層路徑。
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: {
    port: Number(process.env.PORT) || 5274,
  },
});
