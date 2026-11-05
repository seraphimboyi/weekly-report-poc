import type { NextRequest } from "next/server";
import { errorResponse, handle, parseId } from "@/lib/api";
import { DOCX_MIME, renderReportDocx, reportFileName } from "@/lib/export";
import type { ReportContent } from "@/lib/report";
import {
  applyLatest,
  getReport,
  isCurrentWeek,
  markExported,
  parseContent,
} from "@/lib/reports";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/reports/[id]/export">,
) {
  return handle(async () => {
    const parsed = parseId((await ctx.params).id);
    if ("response" in parsed) return parsed.response;

    // The current week is exported with the latest tasks and logs.
    let report = getReport(parsed.id);
    if (isCurrentWeek(report)) report = applyLatest(parsed.id).report;
    const content: ReportContent = parseContent(report);

    let buffer: Buffer;
    try {
      buffer = await renderReportDocx(content);
    } catch (e) {
      console.error(e);
      return errorResponse(500, "Word 範本套版失敗，請檢查範本標記是否正確");
    }

    markExported(parsed.id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(content))}`,
      },
    });
  });
}
