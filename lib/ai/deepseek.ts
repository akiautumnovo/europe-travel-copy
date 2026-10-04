import { analysisResultSchema, blockSchema, draftSchema, inspirationDraftSchema, storyboardSchema, strategiesSchema, styleSignalsSchema, verificationSchema, type AnalysisInput, type AnalysisResult, type Draft, type GenerationContext, type InspirationDraft, type InspirationGenerationInput, type RevisionInput, type Storyboard, type Strategy, type StyleSignals, type Verification } from "./types";
import { z } from "zod";
import type { AIProvider } from "./provider";

type DeepSeekConfig = { apiKey: string; baseUrl: string; model: string };
const sensitiveFields = ["价格", "日期", "出发", "名额", "航班", "酒店", "签证", "退改"];

// 文案类调用的写作者人设：是"发朋友圈的人"，不是"编辑"。人设只约束语气，不写进文案内容。
const WRITER_SYSTEM = `你是一位长期做欧洲定制游的顾问，朋友圈就是你随手记录工作和见闻的地方，不是写作的地方。说话像真人：短句、口语、有具体细节、不端着。这个身份只决定你看事情的角度和语气，文案正文里绝对不能出现任何从业身份信息——不写从业年限（做了X年/第X个年头），不写职业头衔（定制师/顾问/从业者/带队），不写"我的客人/带过的客人/接的单子"，视角始终是普通旅行者。严格输出指定 JSON，不添加 Markdown。`;

// 高温文案调用时模型偶尔丢 category 字段：宽松解析兜底为 literary，reviseCopy 会再按 id 回填。
const lenientDraftSchema = z.object({ blocks: z.array(blockSchema.extend({ category: z.enum(["objective_fact","professional_advice","personal_experience","marketing","literary"]).catch("literary") })).min(1) });

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
    return this.callJson(`写一篇朋友圈，方向是“${strategy.title}”：${strategy.approach}。销售强度 ${input.salesIntensity}（0纯内容，1自然关联，2明确转化）。
只返回 JSON：{"blocks":[{"id":"b1","text":"段落文字","category":"objective_fact|professional_advice|personal_experience|marketing|literary"}]}。
每段一个 block，3-6 段。

【像真人的写法】
- 开头直接切入：从一个具体场景、一句吐槽或一个细节开始，禁止“最近很多朋友问我”“今天想和大家分享”这类开场
- 句子要短，多用逗号和句号断开，允许口语化的不完整句
- 一段只说一件事，宁可留白，不要用形容词填满
- 具体名词优于形容词：写“早上七点的渔市”，不写“绝美的清晨”
- 全文 emoji 最多 2 个，感叹号最多 1 个
- 结尾克制：可以停在一句话上，不总结、不升华，不是每条都要带行动号召

【AI 腔，禁止出现】
- “不是……而是……”“与其……不如……”等排比句式
- 宝藏、封神、此生必去、治愈、松弛感、天花板等空洞热词
- 连续设问（“你猜怎么着？”“值不值得去？”）
- 每段结尾都工整对仗、节奏雷同

【对比例子】（只示意语感，禁止照抄其中任何句子或复用其场景）
坏：“在瑞士的这几天，真的被治愈了。不是因为风景有多绝，而是那种久违的松弛感。此生必去的宝藏之地！”
好：“瑞士的下午四点，缆车上只有零星几个人。风很大，说话要凑近才听得见。下山时，山脚的灯已经亮了一半。”

【事实纪律】（最高优先级，与上文冲突时以事实纪律为准）
禁止编造客户经历、销售数据；文案正文不得出现任何从业身份信息——从业年限（做了X年/第X个年头）、职业头衔（定制师/顾问/从业/带队）、客户表述（我的客人/带过的客人/接的单子）一律不写，视角是普通旅行者；价格、日期、地点、天数、酒店、航班、名额只能使用锁定事实且不得改写数值。
主题：${input.topic}\n锁定事实：${JSON.stringify(input.facts)}\n风格偏好：${input.stylePreferences.join("；")||"自然、克制、像真实朋友圈"}`, lenientDraftSchema, { temperature: 1.0, system: WRITER_SYSTEM });
  }
  async reviseCopy(input: RevisionInput): Promise<Draft> {
    const locked = input.blocks.filter(b=>input.lockedBlockIds.includes(b.id));
    const scope = input.targetBlockId ? `只允许修改 id=${input.targetBlockId} 的段落，其他段落逐字保留。` : "修改全文，但 lockedBlockIds 中的段落必须逐字保留。";
    const result = await this.callJson(`${scope}\n修改要求：${input.instruction}\n只返回与输入相同 id、相同顺序的 JSON blocks，每个 block 必须保留 id、text、category 三个字段，category 沿用输入的取值。禁止改变锁定事实，禁止编造经历或数据。
改写时保持真人朋友圈语感：短句、具体名词、少形容词；避免排比句式和“宝藏、封神、此生必去、治愈、松弛感”等空洞热词，开头不设问不寒暄，结尾不总结升华。文案里不得出现从业年限、职业头衔（定制师/顾问/从业/带队）或“我的客人/带过的客人”这类职业身份信息，视角是普通旅行者。
锁定段落：${JSON.stringify(locked)}\n锁定事实：${JSON.stringify(input.facts)}\n当前段落：${JSON.stringify(input.blocks)}`, lenientDraftSchema, { temperature: 0.9, system: WRITER_SYSTEM });
    const byId = new Map(input.blocks.map(b=>[b.id,b.category] as const));
    return { blocks: result.blocks.map(b=>({ ...b, category: byId.get(b.id) ?? b.category })) };
  }
  async verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification> {
    const revisionRule=baseline?`这是修改后的文案。只检查相对原稿新增或改变的事实性陈述；原稿中逐字保留的陈述不是本次修改新增事实，不得仅因锁定事实为空而判失败。若本次只调整语气、长度或销售味且未引入新事实，fact_safe 必须为 true。\n修改前原稿：${JSON.stringify(baseline.blocks)}`:"这是初稿。具体的价格、日期、天数、地点、酒店、航班、名额必须来自锁定事实；一般性的专业建议可以保留，但不得伪装成精确、可核验的数据。";
    return this.callJson(`核验朋友圈。只返回 JSON：{"fact_safe":true,"fact_issues":[],"naturalness_issues":[]}。
${revisionRule}
检查套路开头、连续问句、“不是……而是……”滥用、空洞形容词、宝藏、封神、此生必去、过度感叹号、机械CTA、虚构第一人称/客户经历/销售数据、从业身份信息（做了X年/第X个年头/定制师/顾问/从业/带队/我的客人/带过的客人）。
锁定事实：${JSON.stringify(input.facts)}\n待核验文案：${JSON.stringify(draft.blocks)}`, verificationSchema);
  }
  async generateInspirations(input:InspirationGenerationInput):Promise<InspirationDraft>{
    const candidates=input.candidateCities.map(d=>`- ${d.city}（${d.country}）| 场景：${d.scene}`).join("\n");
    return this.callJson(`生成四个中文欧洲旅游朋友圈选题。只返回 JSON：{"topics":[{"title":"","city":"","country":"","flag":"🇪🇺","reason":"","audience":"","content_type":"","source_index":null}]}。
硬性要求：
1. 标题必须自然中文，禁止直接复制或翻译网页标题，禁止出现英文标题；
2. **四个选题必须落在四个不同的城市，且分属四个不同的国家**。禁止四条围绕同一个国家或同一区域，也禁止用“欧洲”“多国”这类大范围当目的地；
3. city 必须是具体城市或地区名，country 必须是它所属的国家，flag 用该国家国旗 emoji，三者必须对应；
4. 四条必须在核心问题上真正不同，不得只是替换城市、国家或同义改写；
5. 分别覆盖不同维度：行程决策、客群需求、当地体验、近期信息；开头结构和内容价值也要不同；
6. 不得重复“为什么不要排满/留白/慢旅行”等同一逻辑；
7. 有可靠搜索素材时最多两条使用，source_index 指向素材序号；其余为稳定常青角度并填 null；
8. 搜索素材只作为事实背景，不把机构网页标题当选题；不得扩写素材未包含的具体事实；
9. 避开 previousTitles，也尽量避开 recentCountries 里近期高频出现的国家；
10. 若给了主推产品，**最多只有一条**选题与它所在国家相关，其余三条必须落在其他国家的城市。
${candidates?`\n优先从以下随机候选目的地中挑选（请优先使用靠前的城市）：\n${candidates}\n`:"\n"}${input.retryHint?`\n特别注意：${input.retryHint}\n`:""}
主推产品：${input.productName||"无"}
刷新次数：${input.refreshNo}
上一组选题：${JSON.stringify(input.previousTitles)}
近期国家：${JSON.stringify(input.recentCountries)}
搜索素材：${JSON.stringify(input.sourceSummaries)}`,inspirationDraftSchema);
  }
async generateStoryboard(text:string):Promise<Storyboard>{return this.callJson(`根据朋友圈文案设计简单视觉故事板。只返回 JSON：{"roles":[{"id":"hero","label":"首图","description":"画面作用","searchTheme":"对应中文主题"}],"searchThemes":[{"label":"中文主题","query":"concise English Pixabay query"}]}。要求 6-9 个叙事角色，但只归并为 4-6 个搜索主题；角色必须有首图、大景、生活/人物环境、细节和收尾等不同作用，禁止同一地名重复九次；query 只描述真实摄影内容，不生成AI图片。文案：${text.slice(0,5000)}`,storyboardSchema)}
  async summarizeStyleChange(original:Draft,adopted:Draft):Promise<StyleSignals>{return this.callJson(`只分析写作风格差异，不提取或学习任何事实。对比原始选中版本与最终采用版本，识别删除词语、CTA强弱、Emoji、长度、开头和专业表达变化。只返回 JSON：{"signals":[{"label":"偏好描述","flexible":true,"evidence":"差异证据"}],"summary":{"length_change":"","cta_change":"","emoji_change":"","opening_change":"","professional_change":""}}。signals 最多6条；只输出有明确差异支持的偏好，不把地点、价格、日期或产品信息当作风格。原始：${JSON.stringify(original.blocks)}\n最终：${JSON.stringify(adopted.blocks)}`,styleSignalsSchema)}

  private async callJson<T>(prompt:string, schema:{parse:(value:unknown)=>T}, options:{temperature?:number; system?:string}={}):Promise<T>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30_000);
    try{const response=await fetch(`${this.config.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.config.apiKey}`},body:JSON.stringify({model:this.config.model,temperature:options.temperature??.35,response_format:{type:"json_object"},messages:[{role:"system",content:options.system||"你是克制、可信的欧洲旅游朋友圈编辑。严格输出指定 JSON，不添加 Markdown。"},{role:"user",content:prompt}]}),signal:controller.signal});if(!response.ok)throw new Error(`AI 服务暂时不可用（${response.status}）`);const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>} ;const content=payload.choices?.[0]?.message?.content;if(!content)throw new Error("AI 没有返回可用内容");return schema.parse(JSON.parse(content.replace(/^```json\s*|\s*```$/g,"")))}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw new Error("AI 处理超时，请稍后重试");if(error instanceof SyntaxError)throw new Error("AI 返回格式无效，请重试");throw error}finally{clearTimeout(timer)}
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
