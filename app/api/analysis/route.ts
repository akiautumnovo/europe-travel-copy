import { getAIProvider } from "../../../lib/ai";
import { inputTypeSchema } from "../../../lib/ai/types";
import { extractTextFromFile } from "../../../lib/files/extract-text";
import { json, requireApiUser } from "../_shared";

export async function POST(request: Request) {
  await requireApiUser();
  try {
    const contentType = request.headers.get("content-type") || "";
    let type: unknown, text = "", sourceName: string | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      type = form.get("type");
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) return json({ error: "请选择文件" }, { status: 400 });
      if (file.size > 15 * 1024 * 1024) return json({ error: "文件不能超过 15MB" }, { status: 400 });
      sourceName = file.name;
      text = await extractTextFromFile(file);
    } else {
      const body = await request.json() as { type?: unknown; text?: unknown };
      type = body.type;
      text = typeof body.text === "string" ? body.text.trim() : "";
    }
    const parsedType = inputTypeSchema.parse(type);
    if (text.length < 8) return json({ error: "请提供更完整的文字内容" }, { status: 400 });
    const provider = getAIProvider();
    const analysis = parsedType === "reference" ? await provider.analyzeReference({ type: parsedType, text }) : await provider.extractProduct({ type: parsedType, text });
    return json({ type: parsedType, sourceName, rawText: text, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败，请稍后重试";
    return json({ error: message }, { status: message.includes("配置") ? 503 : 422 });
  }
}

