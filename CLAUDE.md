@AGENTS.md

# weekly-report-poc

給公司內部同仁使用的工作日誌工具（POC）。同仁平日在「本週記事」一到五的格子裡用幾秒記下做了什麼，週五在週報頁微調，一鍵匯出符合公司範本的 Word 週報。

產品規格見 `docs/spec.md`（已更新成目前的記事制），套版的參考實作與範例資料見 `docs/reference/`，安裝、環境與部署見 `README.md`。規格與本檔衝突時，以本檔為準並提出來討論。

## 專案現況

- 已完成：每日記事、週報自動帶入與編輯、Word 匯出、Docker 化
- 尚未：部署到公司內部主機；登入與帳號；自動化測試
- 待重新驗證：
  - Word 匯出在記事制改版後，內容已用 API 驗證，但還沒有人工用 Word 開啟確認版面
  - Docker 映像最近一次完整建置與容器測試，是在記事制（migration 0002）之前；部署前需重新 build 並實測

## 技術選型

- Next.js 16（App Router）+ TypeScript + Tailwind CSS v4，不使用 UI 套件，固定淺色模式
- Biome 負責格式化與 lint（不使用 ESLint / Prettier）
- SQLite + Drizzle ORM（driver：better-sqlite3）
- API 輸入驗證：zod
- Word 匯出：docxtemplater + pizzip，範本在 `templates/weekly-report.docx`
- 部署：Docker（多階段建置，Next `output: "standalone"`），放到公司內部主機

Next.js 16 與舊版差異很大，且本專案開啟了 `cacheComponents`。寫 Route Handler、資料讀取、快取相關程式前，先查 `node_modules/next/dist/docs/` 的對應章節，不要依賴舊版寫法。

## 常用指令

- `npm run dev`：開發伺服器（埠 3535）
- `npm run start`：啟動正式建置的結果（埠 3535）
- `npm run lint`：Biome 檢查（`biome check`）
- `npm run format`：Biome 格式化
- `npm run build`：正式建置
- `npm run db:generate`：依 `db/schema.ts` 產生 migration（輸出到 `drizzle/`）
- `npm run db:migrate`：套用 migration 到 `data/app.db`（`data/` 資料夾要先存在，全新環境先 `mkdir -p data`）
- `docker compose build`：建置映像
- `docker compose up -d`：啟動（對外埠 3535，部署時改 `docker-compose.yml` 的埠對應）；啟動時會自動套用 migration，資料在 volume `weekly-report-data`（`/app/data`）
- 新增的 npm script 請一併寫進這裡

環境變數（目前只有這三個，本機開發不需要任何 `.env`）：

- `DATABASE_PATH`：SQLite 檔案位置，預設 `data/app.db`（Docker 內是 `/app/data/app.db`）
- `TZ`：時區，Docker 設為 `Asia/Taipei`；日期以伺服器本地時間計算
- `PORT`：Docker 內的監聽埠，3535

`.env.example` 裡的 LiteLLM 欄位是第二階段（AI 潤飾）預留，目前沒有任何程式使用。

## 目錄慣例

- `app/`：頁面與 API
  - `page.tsx`：本週記事（首頁）；`report/page.tsx`：週報頁
  - `api/**/route.ts`：Route Handler，見下方「API 端點」
- `components/`：React 元件
  - 記事：`WeekBoard`（週視圖）、`DayColumn`（單日欄位）、`EntryItem`（記事卡片）、`EntryComposer`（新增與編輯表單）
  - 週報：`ReportEditor`（載入、同步、自動保存、匯出）、`ReportTable`（可編輯表格）
  - 共用：`AppHeader`、`AutoGrowTextarea`、`TaskMenu`（「⋯」選單）、`Toast`
- `db/`：`schema.ts`（Drizzle schema）、`index.ts`（連線，啟用 WAL 與 foreign_keys）
- `lib/`：共用邏輯
  - `config.ts`（`WEEK_CONFIG`、使用者）、`date.ts`、`week.ts`（週次與日期格式）
  - `entries.ts`（記事 CRUD、最近用過的工作項目）
  - `report.ts`（由記事產生週報）、`report-sync.ts`（同步合併規則）、`report-order.ts`（依預計完成日排序，純函式，前後端共用）、`reports.ts`（週報的存取與同步）
  - `export.ts`（套 Word 範本）、`validators.ts`（zod schema）、`api.ts`（錯誤回應與輸入解析）
- `templates/`：Word 範本
- `drizzle/`：migration（`0002` 含舊資料轉換）
- `scripts/`：容器啟動腳本（`migrate.mjs`、`docker-entrypoint.sh`）
- `docs/`：規格書與套版參考
- `data/`：SQLite 資料庫檔案，不進版控、不要直接刪除或手動修改

## 資料模型

- `entries`：每日記事（主要資料）。`date`（YYYY-MM-DD）、`project`（工作項目，**必填**）、`content`（備註，選填，可為空字串）；`progress`、`due_date`、`carry_over` 欄位已不使用。同一個 `project` 的記事在週報合併成一列
- `weekly_reports`：週報內容（含手動修改的紀錄）。`week_start`、`week_end`（`YYYY/MM/DD`）、`content`（JSON）、`status`（draft / exported）、`exported_at`；`(user_id, week_start)` 唯一，一週一份
- `tasks`、`logs`：舊的任務與日誌，已在 migration 0002 轉成 `entries`。資料表保留作備份與舊週報對應，**畫面與 API 都不再使用**，不要再寫入
- 每張表都帶 `user_id`（目前寫死單一使用者 `local`），`entries` 另有 `visibility`（預設 private），為之後團隊共享預留
- `entries.project` 在資料庫層允許 NULL（舊資料），「必填」由 API 與介面把關
- 規格書裡的 `weekly_plans` 表不建：下週表的內容直接存在週報 JSON 裡

## 已確定的業務規則

### 週與日期

- 「一週」固定為週一到週五，只撈這五天的資料。設定集中在 `lib/config.ts` 的 `WEEK_CONFIG`，不要把數字散落各處
- 記事日期是 `YYYY-MM-DD`；週報裡顯示的日期是 `YYYY/MM/DD`，轉換集中在 `lib/week.ts`

### 記事（本週記事頁）

- 主要介面是「本週記事」：一到五五格，直接在每一格新增當天的記事，不需要先建立任務；可切換上一週、下一週補記
- 每筆記事：「工作項目」必填、「備註」選填。工作項目一律由使用者自己填，系統不從上次記事或瀏覽器儲存空間帶入（只有「用過的工作項目」建議清單，點選才會填入）
- 工作項目與備註是同樣的輸入框：會隨內容長高、都可以用 Shift+Enter 換行、Enter 存檔、Esc 取消；週報頁的工作項目描述與備註也是同樣的輸入框
- 週末若有記事（補記或舊資料），首頁會多顯示一列「週末」（唯讀）；週報不帶入週末的記事
- 今天那一欄的新增表單常駐；其他天點「＋ 新增記事」展開，點到別處會自動收合（已輸入內容時不收合，避免遺失）

### 週報產生（不使用 LLM）

- 本週表：本週（週一到週五）有記事的工作項目，同名的合併成一列；舊資料中沒有工作項目的記事各自一列，列名取內容
- 進度（目前進度、預計達成進度）與預計完成日：**一律由使用者在週報頁手動填**，系統不自動計算，也不從記事帶入；新的一週一律留白，同步永遠不會動這幾欄
- 備註：該項目本週所有記事的備註，每筆一行，由舊到新；跨多天時每天第一筆加 `MM/DD ` 前綴，單一天不加；沒填備註的記事不會產生空行
- 下週表：**不自動產生**，一開始是空的。使用者在本週表每一列下方按「新增至下週工作項目」，才把該列的名稱與預計完成日帶進下週表（預計達成進度、備註留白）；已加入的列按鈕顯示「已在下週工作項目」，下週表那一列被刪除後按鈕恢復。下週表是純手動表格，同步永遠不會增減或修改它的列
- 兩張表都依預計完成日由近到遠排序，沒填或不是有效日期的排最後（同步時排序，使用者選好日期約 0.8 秒後或離開欄位時也會自動重新排序；日期相同或沒填的維持原順序）

### 週報同步（自動跟著最新記事更新）

使用者不需要手動「產生」或「重新產生」：

- 打開當週週報頁（或切回分頁、匯出時）自動建立或同步；沒有週報就自動建立
- 每個本週列記著 `groupKey`（工作項目 `p:名稱`，或單筆記事 `e:id`）以及使用者手動改過的欄位 `touched`（只追蹤工作項目名稱與備註）；同步時只更新沒改過的欄位，改過的欄位一律保留
- 記事新增就加列；項目本週沒有記事且該列沒被改過就移除；使用者自己新增的列（無 `groupKey`）永遠保留
- 使用者刪除的本週表列記在 `dismissed`，同步不會加回來，表格下方「已移除 N 項」可「加回」（只是隱藏，記事本身沒被刪）；該項目本週已沒有記事時，這筆紀錄會在同步時清掉
- 只有**當週**自動套用；過去週次不自動改動，頁面顯示「套用更新」橫幅由使用者決定；未來週次不產生
- 已匯出的週報之後只要有更新或修改，狀態就回到 draft（exported 代表匯出後沒有變動）
- 預覽頁的修改只存在 `weekly_reports` 裡，**不回寫**到記事
- 「從頭重新產生」收在選單裡，會清除所有手動修改（含下週表），需確認
- 儲存方式：打字約 0.8 秒後自動保存；刪除列、新增列、加入下週等結構變動立刻保存；離開或重新整理頁面時若還有未存內容，會用 `keepalive` 補存
- 匯出前先同步（當週），成功後狀態改為 exported，檔名 `週報_YYYYMMDD-YYYYMMDD.docx`

### 舊資料

- 任務制改為記事制時，每筆日誌轉成一筆記事（任務標題成為工作項目）；舊週報裡以 `taskId` 關聯的列，載入時會依任務標題轉成 `groupKey`

## 週報內容 JSON 格式

這是 `weekly_reports.content` 的內容，也是套進 Word 範本的資料。序號、百分比、日期格式都由程式先整理好，範本不做計算；未填的欄位留白；名稱與備註可含換行（轉成 Word 換行）。

```json
{
  "weekStart": "2026/11/02",
  "weekEnd": "2026/11/06",
  "thisWeek": [
    {
      "id": "（前端列識別，uuid）",
      "groupKey": "p:DocExtractor 上傳頁面",
      "touched": ["note"],
      "no": 1,
      "title": "DocExtractor 上傳頁面",
      "progress": "60%",
      "dueDate": "2026/11/13",
      "note": "11/03 完成拖曳上傳\n11/04 修正錯誤提示"
    }
  ],
  "nextWeek": [
    {
      "id": "（uuid）",
      "groupKey": "p:DocExtractor 上傳頁面",
      "no": 1,
      "title": "DocExtractor 上傳頁面",
      "targetProgress": "100%",
      "dueDate": "2026/11/13",
      "note": ""
    }
  ],
  "dismissed": {
    "thisWeek": [{ "groupKey": "p:Wiki 文件整理", "title": "Wiki 文件整理" }],
    "nextWeek": []
  }
}
```

- 範本只用到 `weekStart`、`weekEnd`、`thisWeek`、`nextWeek` 和各列的 `no`、`title`、`progress`／`targetProgress`、`dueDate`、`note`；`id`、`groupKey`、`touched`、`dismissed` 是同步與編輯用的欄位，範本會忽略
- 下週表的 `groupKey` 只用來記得「是從哪一列加進來的」（讓按鈕顯示已加入），同步不會讀它來增減列
- 範例資料見 `docs/reference/sample-report.json`（只含範本需要的欄位）
- docxtemplater 的設定沿用 `docs/reference/render.js`：`paragraphLoop: true`、`linebreaks: true`、`nullGetter` 回傳空字串

## API 端點

輸入一律用 zod 驗證：400 驗證失敗（回 `{ error, details }`）、404 找不到、409 衝突、500 未預期錯誤。

| 方法   | 路徑                       | 用途                                                         |
| ------ | -------------------------- | ------------------------------------------------------------ |
| GET    | `/api/entries?date=`       | 該日所在週的記事（週一到週日），預設今天                     |
| POST   | `/api/entries`             | 新增記事（`date`、`project` 必填，`content` 選填）           |
| PATCH  | `/api/entries/[id]`        | 編輯記事（部分欄位，工作項目不可清空）                       |
| DELETE | `/api/entries/[id]`        | 刪除記事                                                     |
| GET    | `/api/projects`            | 最近用過的工作項目（建議清單用）                             |
| GET    | `/api/reports?date=`       | 該週週報，沒有則回 `null`                                    |
| POST   | `/api/reports`             | 從頭產生（`force: true` 才會覆蓋既有週報，否則 409）         |
| POST   | `/api/reports/sync`        | 建立或同步該週週報；回傳週報、變動摘要、是否已套用或待更新數 |
| GET    | `/api/reports/[id]`        | 單份週報                                                     |
| PATCH  | `/api/reports/[id]`        | 儲存編輯後的內容（自動保存呼叫）                             |
| POST   | `/api/reports/[id]/apply`  | 套用最新記事到該週報（橫幅按鈕、加回、還原整列）             |
| POST   | `/api/reports/[id]/export` | 產生 .docx 並回傳，同時標記為已匯出                          |

## 介面與互動慣例

- 介面文字使用繁體中文；欄位標題標明必填或選填
- 刪除記事、刪除週報列：卡片或列內二次確認（紅底「確定刪除？」，「取消」預設取得焦點，Esc 取消），確認後立即刪除，**沒有復原**；不使用瀏覽器內建的確認對話框
- 提示（Toast）預設 4 秒，目前沒有任何會用到「復原」的操作
- 預計完成日使用瀏覽器日期選擇器，點欄位任何位置就開啟（`showPicker()`）；內部儲存仍是 `YYYY/MM/DD`
- 本週記事頁的視覺：有記事的日子白底實線、標題旁顯示「N 筆」，沒有記事的日子淡色虛線加「還沒有記事」；記事卡片左側藍線、工作項目用藍色字；新增與編輯的表單是淡藍底虛線框；今天那一欄頂端有整條藍色「今天」色帶、外框加粗並有光暈
- 手機寬度：五格改直向排列；週報表格改成每列一張卡片
- 破壞性或不可逆的操作（刪除資料、覆蓋週報）一律先確認

## 開發注意事項

### Next.js 16 與 cacheComponents

- Server Component 或 Route Handler 裡讀資料庫、呼叫 `new Date()` 或讀 request 資料，要嘛包在 `<Suspense>`，要嘛先 `await connection()`；沒有讀 request 的 GET Route Handler 會被預先渲染成靜態（`/api/projects` 曾因此被固定成建置當下的資料）
- `await connection()` 要放在 `try/catch`（例如 `handle()`）**外面**，否則預先渲染時它拋出的錯誤會被當成一般錯誤印出
- 頁面裡 `await params` / `searchParams` 要放在 `<Suspense>` 內的非同步元件
- 客戶端元件需要「今天」時，在 `useEffect` 裡取得，不要在 render 階段呼叫 `new Date()`
- 刪除路由檔案後，`.next/dev/types/validator.ts` 會殘留舊路由而讓型別檢查失敗；刪掉該檔再重新 build

### 樣式

- Tailwind v4；顏色 token 定義在 `app/globals.css` 的 `@theme`；共用的 `.card`、`.field`、`.btn`、`.badge` 放在 `@layer components`
- **不要在 layer 之外寫 `* { margin: 0; padding: 0 }` 這類 reset**：沒放進 layer 的樣式優先級高於所有 Tailwind utility，會讓 `p-*`、`mx-auto` 等全部失效
- Biome 設定：CSS 開啟 `tailwindDirectives`；`drizzle/`、`docs/` 不檢查；`AutoGrowTextarea` 視為輸入元件；自動產生的 migration 不要用 Biome 重新格式化

### 資料庫

- schema 變更一律走 `db:generate` + `db:migrate`；需要轉換既有資料時，在產生的 SQL 檔後面手動附加（migration 只會執行一次）
- 做有資料轉換的遷移前，先備份 `data/app.db`（可用 better-sqlite3 的 `backup()`），備份檔放在 `data/`（已被 git 忽略）

### 驗證方式

- 沒有自動化測試。完成一個段落後，確認 `npm run lint` 與 `npm run build` 通過；API 用 curl 驗證，介面用瀏覽器實際操作（含手機寬度）
- 測試時自己建立的記事、週報、任務一律在測完後清掉，不要動使用者自己的資料

## 開發歷程（里程碑）

1. **任務與日誌**：任務的新增、編輯、完成、暫停；在任務下寫日誌並更新進度。已改為「每日記事」（見資料模型）
2. **週報預覽頁**：依規則產生兩張表，可編輯、刪除、新增列，草稿自動保存；後來改為自動跟著記事同步
3. **Word 匯出**：按「匯出 Word」產生 .docx，格式與範本一致
4. **部署**：Docker 化，SQLite 檔案掛在 volume 上；尚未部署到內部主機

MVP 不做：登入、團隊共享、AI 潤飾文字、標籤分類、進階搜尋、任務完成／暫停狀態。

## 工作方式

- 一次只做一件事，做完由我測試確認後再進下一件（原本的「一次一個里程碑」）
- 開始寫程式前，先列出實作計畫與要新增或修改的檔案，等我確認
- 安裝新套件前，先說明用途並取得同意
- API 的輸入都要做驗證，錯誤回傳明確的狀態碼與訊息
- 任何 API key 或機密都只放在伺服器端與環境變數，不進前端、不進版控
- 介面文字使用繁體中文
- 完成一個段落後，確認 `npm run lint` 與 `npm run build` 都通過
