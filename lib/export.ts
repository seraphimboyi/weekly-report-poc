import fs from "node:fs/promises";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { ReportContent } from "./report";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "weekly-report.docx",
);

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Fill the Word template with the report snapshot. */
export async function renderReportDocx(
  content: ReportContent,
): Promise<Buffer> {
  const zip = new PizZip(await fs.readFile(TEMPLATE_PATH));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true, // newlines in notes become Word line breaks
    nullGetter: () => "", // blank instead of "undefined"
  });
  doc.render(content);
  return doc.getZip().generate({ type: "nodebuffer" });
}

/** e.g. "週報_20261102-20261106.docx" */
export function reportFileName(content: ReportContent): string {
  const compact = (s: string) => s.replaceAll("/", "");
  return `週報_${compact(content.weekStart)}-${compact(content.weekEnd)}.docx`;
}
