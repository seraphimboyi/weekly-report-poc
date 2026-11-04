@AGENTS.md

# weekly-report-poc

給公司內部同仁使用的工作日誌工具（POC）。同仁平日用幾秒記錄工作，週五一鍵產出符合公司範本的 Word 週報。

完整規格見 `docs/spec.md`，套版的參考實作與範例資料見 `docs/reference/`。規格與本檔衝突時，以本檔為準並提出來討論。

## 技術選型

- Next.js 16（App Router）+ TypeScript + Tailwind CSS
- Biome 負責格式化與 lint（不使用 ESLint / Prettier）
- SQLite + Drizzle ORM（driver：better-sqlite3）
- Word 匯出：docxtemplater + pizzip，範本在 `templates/weekly-report.docx`
- 部署：Docker，放到公司內部主機（里程碑 4）

Next.js 16 與舊版差異很大，且本專案開啟了 `cacheComponents`。寫 Route Handler、資料讀取、快取相關程式前，先查 `node_modules/next/dist/docs/` 的對應章節，不要依賴舊版寫法。

## 常用指令

- `npm run dev`：開發伺服器
- `npm run lint`：Biome 檢查（`biome check`）
- `npm run format`：Biome 格式化
- `npm run build`：正式建置
- 資料庫 migration 用 drizzle-kit（generate / migrate）；新增的 npm script 請一併寫進這裡

## 目錄慣例

- `app/`：頁面；API 放在 `app/api/**/route.ts`
- `db/`：`schema.ts`（Drizzle schema）、`index.ts`（連線）
- `lib/`：共用邏輯（週報產生規則、日期與週次計算、設定）
- `components/`：React 元件
- `templates/`：Word 範本
- `data/`：SQLite 資料庫檔案，不進版控

## 資料模型

- `tasks`：工作項目。title、progress（0–100）、due_date、status（in_progress / done / paused）、completed_at
- `logs`：每日日誌，掛在任務底下。task_id、date、content、progress_after（選填）
- `weekly_reports`：週報快照。week_start、week_end、content（JSON）、status（draft / exported）、exported_at
- 每張表都帶 `user_id`（目前寫死單一使用者），`tasks` 另有 `visibility`（預設 private），為之後團隊共享預留
- `docs/spec.md` 裡的 `weekly_plans` 表先不建，等做到週報預覽時再確認是否需要

## 已確定的業務規則

- 「一週」固定為週一到週五，只撈這五天的資料。設定集中在一個設定檔（例如 `lib/config.ts` 的 `WEEK_CONFIG`），不要把數字散落各處
- 進度一律由使用者手動填，系統不自動計算；介面用滑桿加 +10% / +20% 快捷按鈕，並記住上次的數值
- 任務標記完成時，進度設為 100 並寫入 completed_at；從完成改回其他狀態時清空 completed_at
- 週報草稿由程式依規則產生，**不使用 LLM**：
  - 本週表：所有進行中的任務，加上本週內完成的任務；暫停的任務不帶入；本週沒有日誌的進行中任務也要帶入
  - 本週表的備註：該任務本週最近一筆日誌，沒有就留白
  - 下週表：所有尚未完成的任務；預計達成進度與備註留白
  - 本週完成的任務不出現在下週表
  - 兩張表都依預計完成日由近到遠排序
- 預覽頁的修改只存在 `weekly_reports` 的快照裡，**不回寫**到任務資料
- 週末加班的工作由使用者在預覽頁自行補上，系統不處理

## 週報快照 JSON 格式

這是 `weekly_reports.content` 的內容，也是套進 Word 範本的資料。序號、百分比、日期格式都由程式先整理好，範本不做計算；未填的欄位留白。

```json
{
  "weekStart": "2026/11/02",
  "weekEnd": "2026/11/06",
  "thisWeek": [
    {
      "no": 1,
      "title": "…",
      "progress": "60%",
      "dueDate": "2026/11/13",
      "note": "…"
    }
  ],
  "nextWeek": [
    {
      "no": 1,
      "title": "…",
      "targetProgress": "100%",
      "dueDate": "2026/11/13",
      "note": ""
    }
  ]
}
```

docxtemplater 的設定請沿用 `docs/reference/render.js`：`paragraphLoop: true`、`linebreaks: true`、`nullGetter` 回傳空字串。

## 開發里程碑

一次只做一個里程碑，做完由我測試確認後再進下一個。

1. **任務與日誌**：任務的新增、編輯、完成、暫停；在任務下寫日誌並更新進度；資料存 SQLite
2. **週報預覽頁**：依上面的規則產生兩張表，可編輯、刪除、新增列，草稿自動保存
3. **Word 匯出**：按「匯出 Word」產生 .docx，格式與範本一致
4. **部署**：Docker 化，SQLite 檔案掛在 volume 上

MVP 不做：登入、團隊共享、AI 潤飾文字、專案標籤、進階搜尋。

## 工作方式

- 開始寫程式前，先列出實作計畫與要新增或修改的檔案，等我確認
- 安裝新套件前，先說明用途並取得同意
- API 的輸入都要做驗證，錯誤回傳明確的狀態碼與訊息
- 任何 API key 或機密都只放在伺服器端與環境變數，不進前端、不進版控
- 介面文字使用繁體中文
- 完成一個段落後，確認 `npm run lint` 與 `npm run build` 都通過
