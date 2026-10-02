import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { readSheet } from "read-excel-file/web-worker";

const MAX_CHARS = 80_000;

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const bytes = await file.arrayBuffer();
  let text = "";
  if (name.endsWith(".txt")) text = new TextDecoder().decode(bytes);
  else if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { maxImageSize: 16_777_216 });
    if (pdf.numPages > 80) throw new Error("PDF 页数不能超过 80 页");
    const result = await extractText(pdf, { mergePages: true });
    text = String(result.text);
  } else if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: bytes });
    text = result.value;
  } else if (name.endsWith(".xlsx")) {
    const rows = await readSheet(bytes);
    text = rows.map(row => row.map(cell => cell == null ? "" : String(cell)).join("\t")).join("\n");
  } else throw new Error("当前仅支持 TXT、PDF、DOCX、XLSX 文件");
  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length < 8) throw new Error("未识别到可用文字，请直接粘贴文字内容。扫描 PDF 暂不支持 OCR。 ");
  return clean.slice(0, MAX_CHARS);
}
