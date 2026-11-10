import { z } from "zod";
import type { Entry } from "@/db/schema";
import { todayString } from "./date";
import { listEntriesByRange, listProjects } from "./entries";
import { type ChatMessage, chat } from "./llm";
import { addDays, getWeekRange, parseIsoDate, toIsoDate } from "./week";

const MAX_CONTEXT_CHARS = 150_000;
const HISTORY_LIMIT = 6;
const MIN_DATE = "0000-01-01";
const MAX_DATE = "9999-12-31";

export type ReviewScope = {
  start: string | null;
  end: string | null;
  project: string | null;
};

export type ReviewReply = {
  answer: string;
  /** null when no entries were looked up (the question was off-topic). */
  scope: ReviewScope | null;
  entryCount: number;
};

const OFF_TOPIC_REPLY =
  "這個功能只能回答跟你的工作記事有關的問題，例如「我上個月做了什麼？」「DocExtractor 上傳頁面做到哪裡了？」「幫我整理今年的績效自評素材」。";

/**
 * Group entries by work item (oldest first) into compact text for the prompt:
 *   ## 工作項目
 *   MM/DD 備註
 * The year is shown only when the range crosses years.
 */
export function buildContext(list: Entry[]): string {
  const crossYear = new Set(list.map((e) => e.date.slice(0, 4))).size > 1;
  const groups = new Map<string, { lines: string[]; days: Set<string> }>();
  for (const e of list) {
    const key = e.project?.trim() || e.content.split("\n")[0].slice(0, 60);
    const day = crossYear
      ? e.date.replaceAll("-", "/")
      : e.date.slice(5).replace("-", "/");
    const note = e.content.trim().replace(/\n+/g, " / ");
    const g = groups.get(key) ?? { lines: [], days: new Set<string>() };
    g.lines.push(note ? `${day} ${note}` : day);
    g.days.add(e.date);
    groups.set(key, g);
  }
  // Counts are computed here: the model must quote them, never count itself.
  const total = `統計：共 ${list.length} 筆記事，分布在 ${new Set(list.map((e) => e.date)).size} 天，${groups.size} 個工作項目`;
  const body = [...groups]
    .map(
      ([name, g]) =>
        `## ${name}（共 ${g.lines.length} 筆記事，分布在 ${g.days.size} 天）\n${g.lines.join("\n")}`,
    )
    .join("\n\n");
  return `${total}\n\n${body}`;
}

// --- step 1: work out which entries the question is about --------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scopeSchema = z.object({
  start: isoDate.nullable().catch(null),
  end: isoDate.nullable().catch(null),
  project: z.string().nullable().catch(null),
  related: z.boolean().catch(true),
});

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Relative periods worked out in code, so the model looks them up instead of
 * calculating (it got "上上個月" wrong when a follow-up followed another month).
 */
function relativeRanges(todayIso: string): string {
  const t = parseIsoDate(todayIso);
  const y = t.getFullYear();
  const m = t.getMonth();
  const week = getWeekRange(t);
  const lastWeekStart = addDays(week.start, -7);
  const q = Math.floor(m / 3) * 3;
  const rows: [string, Date, Date][] = [
    ["這個月", new Date(y, m, 1), new Date(y, m + 1, 0)],
    ["上個月", new Date(y, m - 1, 1), new Date(y, m, 0)],
    ["上上個月", new Date(y, m - 2, 1), new Date(y, m - 1, 0)],
    ["這週", week.start, week.end],
    ["上週", lastWeekStart, addDays(lastWeekStart, 6)],
    ["這一季", new Date(y, q, 1), new Date(y, q + 3, 0)],
    ["上一季", new Date(y, q - 3, 1), new Date(y, q, 0)],
    ["今年", new Date(y, 0, 1), new Date(y, 11, 31)],
    ["去年", new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)],
  ];
  return rows
    .map(([name, a, b]) => `- ${name}：${toIsoDate(a)} 至 ${toIsoDate(b)}`)
    .join("\n");
}

function plannerPrompt(today: string, projects: string[]): string {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return [
    "你是查詢解析器。根據對話中使用者最新的問題，判斷要查哪段期間、哪個工作項目的記事。",
    `今天是 ${today}（週${weekday}）。一週是週三到下週二。日期沒寫年份就用今年；若這樣會晚於今天，改用去年。`,
    "相對時間說法一律以「今天」為基準，不是以前一個問題的期間為基準。常用的已經算好，直接查表：",
    relativeRanges(today),
    "表上沒有的說法（例如「最近兩週」「3 月到 5 月」），自己依今天換算成具體日期範圍。",
    "如果是追問（例如「只看 XX」「再詳細一點」），沿用前面對話的期間或工作項目；但使用者這次明確說了時間（例如「上上個月呢」），就以這次說的為準，照上表查。",
    "問題沒有提到期間就輸出 null（代表全部期間）；沒有提到特定工作項目就輸出 null。",
    "related 表示問題是否跟使用者的工作記事有關（做了什麼、進度、統計、月報、績效自評等）。問候、閒聊、生活或一般知識問題（例如晚餐吃什麼、天氣、寫程式教學）、問你能做什麼，都輸出 false；追問前面跟記事有關的對話一律輸出 true；拿不準就輸出 true。",
    "project 只能從下列清單原封不動挑一個，對不上就輸出 null：",
    projects.length
      ? projects.map((p) => `- ${p}`).join("\n")
      : "（目前沒有項目）",
    '只輸出一個 JSON，不要任何說明：{"start":"YYYY-MM-DD"或null,"end":"YYYY-MM-DD"或null,"project":"名稱"或null,"related":true或false}',
  ].join("\n");
}

/**
 * Never fails: anything unparsable falls back to "all entries", related.
 * `related` stays true unless the model clearly says the question is off-topic.
 */
async function planScope(
  history: ChatMessage[],
  projects: string[],
): Promise<{ scope: ReviewScope; related: boolean }> {
  const all = {
    scope: { start: null, end: null, project: null } as ReviewScope,
    related: true,
  };
  const raw = await chat([
    { role: "system", content: plannerPrompt(todayString(), projects) },
    ...history,
  ]);
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return all;
  let parsed: z.infer<typeof scopeSchema>;
  try {
    parsed = scopeSchema.parse(JSON.parse(json));
  } catch {
    return all;
  }
  let { start, end } = parsed;
  // Need both ends; a reversed or half-given range is not trusted.
  if (!start || !end || start > end) start = end = null;
  const project =
    parsed.project && projects.includes(parsed.project) ? parsed.project : null;
  return { scope: { start, end, project }, related: parsed.related };
}

// --- step 2: answer from those entries ---------------------------------------

const ANSWER_RULES = [
  "你是協助整理個人工作日誌的助理，使用繁體中文回答。",
  "下方是使用者的工作記事，依工作項目分組，每行是「日期 備註」；只有日期代表當天有做該項目但沒有備註。",
  "輸出純文字：不要使用 Markdown 語法（不要 **粗體**、# 標題、表格、分隔線）；分段用空行，條列用「・」開頭。",
  "「範圍」是系統已依使用者最新問題換算好的期間與工作項目。問題裡的相對時間（上個月、上上個月、今年、這週…）一律以此範圍為準，不要自己重新解讀或換算，也不要因為覺得日期對不上就拒絕回答。",
  "對話歷史裡先前的回答可能針對不同範圍，只當作上下文，不要沿用它的期間。",
  "只能根據記事內容回答，不要編造記事裡沒有的事實、數字或成果；只有在範圍內的記事確實沒有使用者問的內容時，才說資料不足。",
  "如果使用者的問題其實跟工作記事無關（閒聊、生活、一般知識），不要說「資料不足」，改為說明這個功能只處理工作記事，並舉一兩個可以問的例子。",
  "次數、筆數、天數一律引用記事開頭「統計」與各工作項目標題上已算好的數字，不要自己數；「次數」不明確時，筆數與天數都說明。需要的數字不在統計裡（例如某句備註出現幾次）就說明無法精確統計，不要估算。提到日期時，只列記事裡實際出現的日期（例如 5/13、5/14、5/19），不要用「5/13–5/29」這種範圍把中間沒有記事的日子帶過，也不要自行補日期；同一天出現多次只寫一次。",
  "一般提問：回答簡潔，必要時條列並註明相關日期。",
  "若使用者要月報／季報：先用 2–3 句總結整體重點，再依工作項目分段條列主要完成事項，語氣精簡正式。",
  "若使用者要績效自評：依工作項目整理具體成果與貢獻，用「做了什麼、帶來什麼結果」的寫法，記事沒提到的成效不要推測，最後用一小段總結整體貢獻。",
].join("\n");

const slash = (iso: string) => iso.replaceAll("-", "/");

function describeScope(scope: ReviewScope): string {
  const range =
    scope.start && scope.end
      ? `${slash(scope.start)}–${slash(scope.end)}`
      : "全部期間";
  return `${range}、${scope.project ?? "全部工作項目"}`;
}

export async function chatReview(
  messages: ChatMessage[],
): Promise<ReviewReply> {
  const history = messages.slice(-HISTORY_LIMIT);
  const { scope, related } = await planScope(
    history,
    listProjects().map((p) => p.project),
  );
  // Off-topic: skip the lookup entirely (no entries are sent to the model).
  if (!related) {
    return { answer: OFF_TOPIC_REPLY, scope: null, entryCount: 0 };
  }

  const list = listEntriesByRange(
    scope.start ?? MIN_DATE,
    scope.end ?? MAX_DATE,
    scope.project ?? undefined,
  );
  if (list.length === 0) {
    return {
      answer: `在「${describeScope(scope)}」找不到記事。可以換個說法或期間再問一次。`,
      scope,
      entryCount: 0,
    };
  }

  const context = buildContext(list);
  if (context.length > MAX_CONTEXT_CHARS) {
    return {
      answer: `「${describeScope(scope)}」的記事太多（${list.length} 筆），一次看不完。請在問題裡指定較短的期間或某個工作項目，例如「上個月」或「DocExtractor」。`,
      scope,
      entryCount: list.length,
    };
  }

  const answer = await chat([
    {
      role: "system",
      content: `${ANSWER_RULES}\n\n今天：${todayString()}\n範圍：${describeScope(scope)}\n\n${context}`,
    },
    // The relative wording ("上上個月") stays in the question and the model
    // tends to re-resolve it, so tell it the already-resolved scope right there.
    ...history.slice(0, -1),
    {
      role: "user",
      content: `${history[history.length - 1].content}\n\n（系統註記：這個問題的時間與項目已換算為「${describeScope(scope)}」，請直接用上方該範圍內的記事回答，不要重新解讀問題裡的時間詞。）`,
    },
  ]);
  return { answer, scope, entryCount: list.length };
}
