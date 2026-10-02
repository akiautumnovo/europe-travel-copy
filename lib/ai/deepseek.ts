import { analysisResultSchema, draftSchema, strategiesSchema, verificationSchema, type AnalysisInput, type AnalysisResult, type Draft, type GenerationContext, type RevisionInput, type Strategy, type Verification } from "./types";
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
  async generateTopicStrategies(input: GenerationContext): Promise<Strategy[]> {
    const result = await this.callJson(`为一条欧洲旅游朋友圈设计三个明显不同的内容策略，固定 type 为 life、advisor、emotional，各一个。只返回 JSON：{"strategies":[{"type":"life","title":"生活分享型","approach":"策略","opening":"前2-3行预览"},...]}
主题：${input.topic}\n销售强度：${input.salesIntensity}\n锁定事实：${JSON.stringify(input.facts)}\n风格偏好：${input.stylePreferences.join("；")||"自然、克制、可信"}`, strategiesSchema);
    return result.strategies;
  }
  async generateCopy(input: GenerationContext, strategy: Strategy): Promise<Draft> {
    return this.callJson(`只为“${strategy.title}”生成一篇朋友圈，不要生成另外两个方向。策略：${strategy.approach}。销售强度 ${input.salesIntensity}（0纯内容，1自然关联，2明确转化）。
只返回 JSON：{"blocks":[{"id":"b1","text":"段落文字","category":"objective_fact|professional_advice|personal_experience|marketing|literary"}]}。
每段一个 block，3-6 段。禁止编造第一人称经历、客户经历、销售数据；价格、日期、地点、天数、酒店、航班、名额只能使用锁定事实且不得改写数值。
主题：${input.topic}\n锁定事实：${JSON.stringify(input.facts)}\n风格偏好：${input.stylePreferences.join("；")||"自然、克制、像真实朋友圈"}`, draftSchema);
  }
  async reviseCopy(input: RevisionInput): Promise<Draft> {
    const locked = input.blocks.filter(b=>input.lockedBlockIds.includes(b.id));
    const scope = input.targetBlockId ? `只允许修改 id=${input.targetBlockId} 的段落，其他段落逐字保留。` : "修改全文，但 lockedBlockIds 中的段落必须逐字保留。";
    return this.callJson(`${scope}\n修改要求：${input.instruction}\n只返回与输入相同 id、相同顺序的 JSON blocks。禁止改变锁定事实，禁止编造经历或数据。
锁定段落：${JSON.stringify(locked)}\n锁定事实：${JSON.stringify(input.facts)}\n当前段落：${JSON.stringify(input.blocks)}`, draftSchema);
  }
  async verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification> {
    const revisionRule=baseline?`这是修改后的文案。只检查相对原稿新增或改变的事实性陈述；原稿中逐字保留的陈述不是本次修改新增事实，不得仅因锁定事实为空而判失败。若本次只调整语气、长度或销售味且未引入新事实，fact_safe 必须为 true。\n修改前原稿：${JSON.stringify(baseline.blocks)}`:"这是初稿。具体的价格、日期、天数、地点、酒店、航班、名额必须来自锁定事实；一般性的专业建议可以保留，但不得伪装成精确、可核验的数据。";
    return this.callJson(`核验朋友圈。只返回 JSON：{"fact_safe":true,"fact_issues":[],"naturalness_issues":[]}。
${revisionRule}
检查套路开头、连续问句、“不是……而是……”滥用、空洞形容词、宝藏、封神、此生必去、过度感叹号、机械CTA、虚构第一人称/客户经历/销售数据。
锁定事实：${JSON.stringify(input.facts)}\n待核验文案：${JSON.stringify(draft.blocks)}`, verificationSchema);
  }

  private async callJson<T>(prompt:string, schema:{parse:(value:unknown)=>T}):Promise<T>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
    try{const response=await fetch(`${this.config.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.config.apiKey}`},body:JSON.stringify({model:this.config.model,temperature:.35,response_format:{type:"json_object"},messages:[{role:"system",content:"你是克制、可信的欧洲旅游朋友圈编辑。严格输出指定 JSON，不添加 Markdown。"},{role:"user",content:prompt}]}),signal:controller.signal});if(!response.ok)throw new Error(`AI 服务暂时不可用（${response.status}）`);const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>} ;const content=payload.choices?.[0]?.message?.content;if(!content)throw new Error("AI 没有返回可用内容");return schema.parse(JSON.parse(content.replace(/^```json\s*|\s*```$/g,"")))}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw new Error("AI 处理超时，请稍后重试");if(error instanceof SyntaxError)throw new Error("AI 返回格式无效，请重试");throw error}finally{clearTimeout(timer)}
  }

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
