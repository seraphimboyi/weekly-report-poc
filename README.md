# 工作日誌與週報工具（weekly-report-poc）

給公司內部同仁使用的工作日誌工具（POC）：平日在「本週記事」一到五的格子裡用幾秒記下做了什麼，週五在週報頁微調內容，一鍵匯出符合公司範本的 Word 週報。

- 完整產品規格：[`docs/spec.md`](docs/spec.md)
- 開發規範與已確定的業務規則：[`CLAUDE.md`](CLAUDE.md)

## 功能

- **本週記事頁面**：「一週」是週三到下週二，畫面上有週三、四、五、一、二 5 格，直接在每一格新增記事（工作項目必填、備註選填），可切換週次補記；週六、日不開放新增記事；只有資料庫裡原本就有週末記事（舊資料）時，才會多顯示唯讀的「週末」列，週報不帶入
- **常用項目**（`/favorites`）：維護常用的工作項目（新增、改名、刪除、↑↓ 排序），新增記事時可從「常用項目」「最近使用」兩個按鈕快速填入
- **週報頁面（預覽）**：依記事自動帶入「本週工作項目」，自動跟著最新記事更新；你修改過的欄位不會被覆蓋，也不會回寫到記事；進度與預計完成日在這裡手動填寫；下週工作項目由你按該列的「→ 加入下週」加入；可依預計完成日排序、加回已移除的項目、從頭重新產生
- **匯出 Word**：套用公司範本（`templates/weekly-report.docx`）產生 .docx
- **回顧頁**（`/review`）：聊天室式的 AI 問答，用一般說法問過去的記事（例如「我上個月做了什麼？」），也可以請它整理月報、績效自評素材。需要設定 LiteLLM（見「環境變數」）；對話記錄存在瀏覽器的 sessionStorage，關閉分頁就會清掉
- 資料存在本機 SQLite，單一使用者，沒有登入

## 使用方式

1. **平日**：打開首頁，在要記的那一天（含今天）點「＋ 新增記事」，填「工作項目」（必填）和「備註」（選填），按 Enter 儲存；Shift+Enter 可在欄位內換行，Esc 取消。工作項目下方的「最近使用」「常用項目」可以快速填入。
2. **週五**：到「週報」頁。系統已依本週記事帶入工作項目，同名的項目會合併成一列、備註依日期列出。
   - 在本週表填「目前進度」與「預計完成日」
   - 要列入下週的項目，按該列的「→ 加入下週」，再到下週表填預計達成進度與備註
   - 需要的話刪除、新增或修改任何一列；刪除的項目可從表格下方的提示區塊加回
3. 按「匯出 Word」下載 .docx。
4. **回顧**：到「回顧」頁用問題查過去的記事，期間與工作項目由問題決定。

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
| `npm run seed:demo`   | 把約 6 個月的假記事寫進獨立的 `data/demo.db`（不會動 `app.db`），用 `DATABASE_PATH=data/demo.db npm run dev` 測試回顧頁 |

目前沒有自動化測試；完成修改後請確認 `npm run lint` 與 `npm run build` 通過，並實際操作畫面。

## 專案結構

```
app/
  page.tsx               本週記事（首頁）
  report/page.tsx        週報頁
  review/page.tsx        回顧頁（AI 問答）
  favorites/page.tsx     常用項目管理頁
  api/                   Route Handler（entries、projects、favorites、reports、review）
components/              React 元件（WeekBoard、DayColumn、EntryComposer、ReportEditor、ReportTable、ReviewPanel、FavoritesManager ...）
db/                      Drizzle schema 與資料庫連線
lib/                     共用邏輯：週次與日期、由記事產生週報、同步規則、排序、Word 匯出、常用項目、LiteLLM 呼叫與回顧（llm、review）、zod 驗證
templates/               Word 範本
drizzle/                 資料庫 migration
scripts/                 容器啟動腳本（自動套用 migration）、回顧頁測試用的假資料腳本
docs/                    規格書與套版參考實作
data/                    SQLite 資料庫檔案（不進版控）
```

技術：Next.js 16（App Router）、TypeScript、Tailwind CSS v4、Biome、SQLite + Drizzle ORM（better-sqlite3）、zod、docxtemplater + pizzip。

## 資料模型

| 資料表           | 說明                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `entries`        | 每日記事：日期、工作項目（必填）、備註（選填）                                    |
| `weekly_reports` | 週報內容（JSON，含你手動修改的紀錄）、狀態（draft／exported）、匯出時間；一週一份 |
| `favorite_projects` | 常用項目（名稱、順序），只是新增記事時的填入捷徑，與記事沒有關聯，改名或刪除不影響既有記事與週報 |
| `tasks`、`logs`  | 舊版的任務與日誌，已轉成 `entries`；資料表保留作備份，程式不再使用                |

每張表都帶 `user_id`（目前固定為單一使用者），為之後團隊共享預留。

「一週」是週三到下週二（連續 7 天），週六、日為唯讀的週末，設定在 `lib/config.ts` 的 `WEEK_CONFIG`。

## API 概覽

| 方法          | 路徑                       | 用途                                          |
| ------------- | -------------------------- | --------------------------------------------- |
| GET           | `/api/entries?date=`       | 該日所在週的記事                              |
| POST          | `/api/entries`             | 新增記事                                      |
| PATCH／DELETE | `/api/entries/[id]`        | 編輯／刪除記事                                |
| GET           | `/api/projects`            | 最近用過的工作項目                            |
| GET／POST     | `/api/favorites`           | 讀取／新增常用項目（重複回 409）              |
| PATCH／DELETE | `/api/favorites/[id]`      | 改名或調整順序／刪除常用項目                  |
| POST          | `/api/review/chat`         | 回顧聊天：解析問題的期間與工作項目，再依記事回答 |
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

回顧頁的 AI 功能透過 LiteLLM（OpenAI 相容的 gateway）呼叫，設定放在 `.env.local`（範例見 `.env.example`），只在伺服器端讀取，不會傳到瀏覽器：

| 變數                       | 說明                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `LITELLM_BASE_URL`         | 必填。gateway 網址，結尾有沒有 `/v1` 都可以                                            |
| `LITELLM_MODEL`            | 必填。模型名稱                                                                         |
| `LITELLM_API_KEY`          | 選填。gateway 不需要 key 時留空，就不送 Authorization 標頭                             |
| `LITELLM_REASONING_EFFORT` | 選填。預設 `high`；可改 `low`／`medium`，模型不支援時設 `off`。開啟後回應會明顯變慢    |

URL 或 model 沒設定時，回顧頁會回 502「AI 服務尚未設定」，其他功能不受影響。

## Docker 部署

```bash
docker compose build
docker compose up -d      # 對外埠 3535
```

- 映像不含 `data/` 與 `.env*`：第一次部署時資料庫是空的，也不會帶入 LiteLLM 設定。要使用回顧頁，需另外把 `LITELLM_*` 環境變數傳給容器（`docker-compose.yml` 目前沒有設定）
- 映像採多階段建置（Node 24），以非 root 使用者執行
- 容器啟動時會先自動套用 migration，再啟動伺服器
- 資料存在具名 volume `weekly-report-data`（掛在 `/app/data`），重新部署不會消失；備份請備份這個 volume 裡的 `app.db`
- 要換對外埠，修改 `docker-compose.yml` 的 `ports` 左邊的數字

**注意**：

- 服務沒有登入機制，部署到內部主機時請只開放內網
- 最近一次完整的映像建置與容器測試，是在記事制（migration 0002）之前；部署前請重新 `docker compose build` 並實測一次（啟動、記事、週報、匯出 Word、重新部署後資料仍在）

## 備註

- 週報內容由程式依固定規則產生，不使用 LLM；只有回顧頁會呼叫 LLM
- Word 範本改版時，需要重新放置套版標記（`{weekStart}`、`{#thisWeek}…{/thisWeek}` 等），再替換 `templates/weekly-report.docx`；說明見 `docs/spec.md`
