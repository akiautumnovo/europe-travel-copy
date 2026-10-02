import { analysisResultSchema, type AnalysisInput, type AnalysisResult } from "./types";
import type { AIProvider } from "./provider";

type DeepSeekConfig = { apiKey: string; baseUrl: string; model: string };
const sensitiveFields = ["价格", "日期", "出发", "名额", "航班", "酒店", "签证", "退改"];

const systemPrompt = `你是欧洲旅游产品资料分析助手。只提取输入中明确出现的信息，绝不补全、猜测或把主观形容词升级为具体事实。subjective_claims、uncertain_items、possible_content_angles 的每一项必须是字符串，禁止返回对象。
必须只返回 JSON，结构为：{"hard_facts":[{"field":"","value":"","source_quote":"","confidence":0.0,"requires_confirmation":true,"freshness":"current|time_sensitive|unknown","status":"pending"}],"subjective_claims":[],"uncertain_items":[],"product_summary":"","possible_content_angles":[]}。
source_quote 必须是输入原文中的短句。未出现的信息应放入 uncertain_items。不要把“酒店很好”改成“五星酒店”，不要把月份补成日期，不要把“名额有限”补成具体席位。`;

export class DeepSeekProvider implements AIProvider {
  constructor(private config: DeepSeekConfig) {}

  async extractProduct(input: AnalysisInput) { return this.run(input); }
  async analyzeReference(input: AnalysisInput) { return this.run(input); }

  private async run(input: AnalysisInput): Promise<AnalysisResult> {
    const referenceRule = input.type === "reference"
      ? "这是普通参考内容：hard_facts 必须为空，只提取表达角度、逻辑和灵感。"
      : input.type === "colleague_post"
        ? "这是同事朋友圈：价格、出发日期、剩余名额、航班、酒店、签证和退改即使识别成功也必须 requires_confirmation=true、freshness=time_sensitive。"
        : "这是正式产品资料：仍需严格以原文为唯一依据。";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ model: this.config.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `${referenceRule}\n\n原始输入：\n${input.text}` }] }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`AI 服务暂时不可用（${response.status}）`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("AI 没有返回可用内容");
      const parsed = analysisResultSchema.parse(JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")));
      const evidenced = parsed.hard_facts.filter(f => input.text.includes(f.source_quote.trim()));
      const rejected = parsed.hard_facts.filter(f => !input.text.includes(f.source_quote.trim())).map(f => `${f.field}：缺少可核对的原文证据`);
      parsed.hard_facts = evidenced;
      parsed.uncertain_items = [...new Set([...parsed.uncertain_items, ...rejected])];
      if (input.type === "reference") parsed.hard_facts = [];
      if (input.type === "colleague_post") parsed.hard_facts = parsed.hard_facts.map(f => sensitiveFields.some(k => f.field.includes(k)) ? { ...f, requires_confirmation: true, freshness: "time_sensitive", status: "pending" as const } : f);
      return parsed;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI 解析超时，请稍后重试");
      if (error instanceof SyntaxError) throw new Error("AI 返回格式无效，请重试");
      throw error;
    } finally { clearTimeout(timer); }
  }
}
