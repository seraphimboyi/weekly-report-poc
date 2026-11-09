// Fill a SEPARATE demo database with ~6 months of fake entries for testing the
// review (LLM) page. Never touches data/app.db.
//   npm run seed:demo
//   DATABASE_PATH=data/demo.db npm run dev
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = process.env.DATABASE_PATH ?? path.join("data", "demo.db");
if (path.basename(dbPath) === "app.db") {
  console.error(
    "Refusing to seed app.db. Use a separate file, e.g. data/demo.db",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
migrate(drizzle(sqlite), {
  migrationsFolder: path.join(process.cwd(), "drizzle"),
});

const { n } = sqlite.prepare("SELECT COUNT(*) AS n FROM entries").get();
if (n > 0) {
  console.error(
    `${dbPath} already has ${n} entries; delete the file to re-seed.`,
  );
  process.exit(1);
}

// Work items with phases: notes are picked in order as time passes.
const PROJECTS = [
  {
    name: "DocExtractor 上傳頁面",
    from: 0,
    to: 0.55,
    weight: 5,
    notes: [
      "完成拖曳上傳元件",
      "修正檔案過大時的錯誤提示",
      "加入上傳進度條",
      "支援 PDF 與圖片多檔上傳",
      "補上上傳失敗重試機制",
      "跟 PM 確認上傳限制為 20MB",
      "調整手機版版面",
      "修正 Safari 拖曳無反應的問題",
      "上線前整合測試，修掉 3 個小 bug",
    ],
  },
  {
    name: "DocExtractor 辨識結果編輯",
    from: 0.4,
    to: 1,
    weight: 5,
    notes: [
      "設計欄位校正介面",
      "完成表格欄位的就地編輯",
      "新增信心分數低於 80% 的標示",
      "串接後端儲存校正結果 API",
      "加入復原／重做功能",
      "修正儲存後欄位順序跑掉",
      "效能優化：長表格改用虛擬列表",
      "收集內部試用回饋並整理改善清單",
    ],
  },
  {
    name: "Wiki 文件整理",
    from: 0.1,
    to: 0.7,
    weight: 2,
    notes: [
      "盤點舊文件，標出過期內容",
      "重寫新人環境建置文件",
      "整理 API 文件目錄結構",
      "補上部署流程說明",
      "",
    ],
  },
  {
    name: "客戶 A 需求討論",
    from: 0.55,
    to: 1,
    weight: 2,
    notes: [
      "與客戶確認報表匯出格式需求",
      "整理客戶回饋並評估工時",
      "提供 POC 展示並記錄意見",
      "回覆客戶關於資料保存期限的問題",
    ],
  },
  {
    name: "會議",
    from: 0,
    to: 1,
    weight: 3,
    notes: ["", "", "週會", "Sprint 規劃會議", "Sprint 回顧", "技術分享會"],
  },
  {
    name: "出差",
    from: 0.6,
    to: 0.7,
    weight: 1,
    notes: ["台中客戶現場支援", "客戶端環境安裝與驗收"],
  },
];

// Deterministic pseudo-random so every seed run gives the same data.
let seed = 20261109;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const end = new Date();
end.setHours(0, 0, 0, 0);
const start = new Date(end);
start.setMonth(start.getMonth() - 6);
const span = end - start;

const pad = (x) => String(x).padStart(2, "0");
const iso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const insert = sqlite.prepare(
  "INSERT INTO entries (user_id, date, project, content) VALUES ('local', ?, ?, ?)",
);

let total = 0;
sqlite.transaction(() => {
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    if (rand() < 0.08) continue; // occasionally skip a day (leave, forgot to log)
    const t = (d - start) / span;
    const active = PROJECTS.filter((p) => t >= p.from && t <= p.to);
    const count = 1 + Math.floor(rand() * 3);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const pool = active.flatMap((p) => Array(p.weight).fill(p));
      const p = pool[Math.floor(rand() * pool.length)];
      if (!p || used.has(p.name)) continue;
      used.add(p.name);
      // Walk through the notes as the project progresses.
      const phase = Math.min(
        0.999,
        Math.max(0, (t - p.from) / (p.to - p.from || 1)),
      );
      const idx = Math.min(
        p.notes.length - 1,
        Math.max(0, Math.floor(phase * p.notes.length + (rand() - 0.5) * 2)),
      );
      insert.run(iso(d), p.name, p.notes[idx]);
      total++;
    }
  }
})();

sqlite.close();
console.log(`seeded ${total} entries into ${dbPath}`);
