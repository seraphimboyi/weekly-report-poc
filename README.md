# 工作日誌與週報工具（weekly-report-poc）

給公司內部同仁使用的工作日誌工具（POC）：平日在「本週記事」一到五的格子裡用幾秒記下做了什麼，週五在週報頁微調內容，一鍵匯出符合公司範本的 Word 週報。

- 完整產品規格：[`docs/spec.md`](docs/spec.md)
- 開發規範與已確定的業務規則：[`CLAUDE.md`](CLAUDE.md)

## 功能

- **本週記事頁面**：一到五 5 格，直接在每一天新增記事（工作項目必填、備註選填），可切換週次補記
- **週報頁面（預覽）**：依記事自動帶入「本週工作項目」，自動跟著最新記事更新；你修改過的欄位不會覆蓋記事頁面的內容；進度與預計完成日在這裡手動填寫；下週工作項目由你按「新增至下週工作項目」加入
- **匯出 Word**：套用公司範本（`templates/weekly-report.docx`）產生 .docx
- 資料存在本機 SQLite，單一使用者，沒有登入

## 使用方式

1. **平日**：打開首頁，在今天的格子填「工作項目」（必填）和「備註」（選填），按 Enter 儲存；Shift+Enter 可在欄位內換行。其他天（補記）點「＋ 新增記事」。
2. **週五**：到「週報」頁。系統已依本週記事帶入工作項目，同名的項目會合併成一列、備註依日期列出。
   - 在本週表填「目前進度」與「預計完成日」
   - 要列入下週的項目，按該列下方的「新增至下週工作項目」，再到下週表填預計達成進度與備註
   - 需要的話刪除、新增或修改任何一列
3. 按「匯出 Word」下載 .docx。

修改會自動保存（約 0.8 秒），刪除記事或列時要先二次確認，確認後立即刪除、無法復原。

## 快速開始

需求：Node.js 24、npm。

```bash
npm install
mkdir -p data        # 資料庫資料夾；沒有的話 db:migrate 會失敗
npm run db:migrate   # 建立 data/app.db 並套用 migration
npm run dev          # http://localhost:3535
```

資料庫檔案在 `data/app.db`（已被 git 忽略，Docker 內由容器啟動腳本自動建立與遷移）。本機開發不需要任何 `.env`。

`better-sqlite3` 是原生模組；如果啟動時出現載入失敗，執行 `npm rebuild better-sqlite3`。

## 常用指令

| 指令                  | 說明                                                  |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | 開發伺服器（埠 3535）                                 |
| `npm run build`       | 正式建置                                              |
| `npm run start`       | 啟動建置後的版本（埠 3535）                           |
| `npm run lint`        | Biome 檢查                                            |
| `npm run format`      | Biome 格式化                                          |
| `npm run db:generate` | 依 `db/schema.ts` 產生 migration（輸出到 `drizzle/`） |
| `npm run db:migrate`  | 套用 migration 到資料庫                               |

目前沒有自動化測試；完成修改後請確認 `npm run lint` 與 `npm run build` 通過，並實際操作畫面。

## 專案結構

```
app/
  page.tsx               本週記事（首頁）
  report/page.tsx        週報頁
  api/                   Route Handler（entries、projects、reports）
components/              React 元件（WeekBoard、DayColumn、EntryComposer、ReportEditor、ReportTable ...）
db/                      Drizzle schema 與資料庫連線
lib/                     共用邏輯：週次與日期、由記事產生週報、同步規則、Word 匯出、zod 驗證
templates/               Word 範本
drizzle/                 資料庫 migration
scripts/                 容器啟動腳本（自動套用 migration）
docs/                    規格書與套版參考實作
data/                    SQLite 資料庫檔案（不進版控）
```

技術：Next.js 16（App Router）、TypeScript、Tailwind CSS v4、Biome、SQLite + Drizzle ORM（better-sqlite3）、zod、docxtemplater + pizzip。

## 資料模型

| 資料表           | 說明                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `entries`        | 每日記事：日期、工作項目（必填）、備註（選填）                                    |
| `weekly_reports` | 週報內容（JSON，含你手動修改的紀錄）、狀態（draft／exported）、匯出時間；一週一份 |
| `tasks`、`logs`  | 舊版的任務與日誌，已轉成 `entries`；資料表保留作備份，程式不再使用                |

每張表都帶 `user_id`（目前固定為單一使用者），為之後團隊共享預留。

「一週」固定為週一到週五，設定在 `lib/config.ts` 的 `WEEK_CONFIG`。

## API 概覽

| 方法          | 路徑                       | 用途                                          |
| ------------- | -------------------------- | --------------------------------------------- |
| GET           | `/api/entries?date=`       | 該日所在週的記事                              |
| POST          | `/api/entries`             | 新增記事                                      |
| PATCH／DELETE | `/api/entries/[id]`        | 編輯／刪除記事                                |
| GET           | `/api/projects`            | 最近用過的工作項目                            |
| GET           | `/api/reports?date=`       | 該週週報（沒有則回 `null`）                   |
| POST          | `/api/reports`             | 從頭產生週報（需 `force: true` 才會覆蓋既有） |
| POST          | `/api/reports/sync`        | 建立或同步該週週報                            |
| GET／PATCH    | `/api/reports/[id]`        | 讀取／儲存週報                                |
| POST          | `/api/reports/[id]/apply`  | 套用最新記事到該週報                          |
| POST          | `/api/reports/[id]/export` | 產生並下載 .docx                              |

輸入以 zod 驗證，錯誤回傳 400（含欄位訊息）、404、409 或 500。

## 環境變數

| 變數            | 說明                           | 預設                                            |
| --------------- | ------------------------------ | ----------------------------------------------- |
| `DATABASE_PATH` | SQLite 檔案位置                | `data/app.db`（Docker 內為 `/app/data/app.db`） |
| `TZ`            | 時區；日期依伺服器本地時間計算 | Docker 設為 `Asia/Taipei`                       |
| `PORT`          | Docker 內的監聽埠              | `3535`                                          |

`.env.example` 裡的 LiteLLM 欄位是第二階段（AI 潤飾文字）預留，目前沒有任何程式使用。

## Docker 部署

```bash
docker compose build
docker compose up -d      # 對外埠 3535
```

- 映像採多階段建置（Node 24），以非 root 使用者執行
- 容器啟動時會先自動套用 migration，再啟動伺服器
- 資料存在具名 volume `weekly-report-data`（掛在 `/app/data`），重新部署不會消失；備份請備份這個 volume 裡的 `app.db`
- 要換對外埠，修改 `docker-compose.yml` 的 `ports` 左邊的數字

**注意**：

- 服務沒有登入機制，部署到內部主機時請只開放內網
- 最近一次完整的映像建置與容器測試，是在記事制（migration 0002）之前；部署前請重新 `docker compose build` 並實測一次（啟動、記事、週報、匯出 Word、重新部署後資料仍在）

## 備註

- 週報內容由程式依固定規則產生，不使用 LLM
- Word 範本改版時，需要重新放置套版標記（`{weekStart}`、`{#thisWeek}…{/thisWeek}` 等），再替換 `templates/weekly-report.docx`；說明見 `docs/spec.md`
