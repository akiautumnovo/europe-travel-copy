import { analysisResultSchema, blockSchema, inspirationDraftSchema, storyboardSchema, strategiesSchema, styleSignalsSchema, verificationSchema, type AnalysisInput, type AnalysisResult, type Draft, type GenerationContext, type InspirationDraft, type InspirationGenerationInput, type RevisionInput, type Storyboard, type Strategy, type StyleSignals, type Verification } from "./types";
import { z } from "zod";
import type { AIProvider } from "./provider";

type DeepSeekConfig = { apiKey: string; baseUrl: string; model: string };
const sensitiveFields = ["价格", "日期", "出发", "名额", "航班", "酒店", "签证", "退改"];

// 文案类调用的写作者人设：是"发朋友圈的人"，不是"编辑"。人设只约束语气，不写进文案内容。
const WRITER_SYSTEM = `你是一位专业、准确的欧洲旅行内容创作者，同时有生活类旅行博主的趣味、节奏和吸引力。你擅长把人文、历史、旅游资源与产品方案自然连接，但绝不虚构亲历、客户故事、带队经历或职业身份。稳定且广为人知的目的地常识可以使用；产品专属信息和时效信息必须严格来自提供的事实或来源。严格输出指定 JSON，不添加 Markdown。`;

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
  async generateCopy(input: GenerationContext): Promise<Draft> {
    return this.callJson(`写一篇完整的欧洲旅行朋友圈，主题是“${input.topic}”。
只返回 JSON：{"blocks":[{"id":"b1","text":"段落文字","category":"objective_fact|professional_advice|personal_experience|marketing|literary"}]}。
每段一个 block，优先写成 6 段，全文控制在 400-460 个非空白字符（硬性范围 300-500 字，绝不能少于 300 字）。

【像真人的写法】
- 开头直接切入：从一个具体场景、一句吐槽或一个细节开始，禁止“最近很多朋友问我”“今天想和大家分享”这类开场
- 句子有节奏但必须完整，禁止为了口语感写残句或把结尾截断
- 一段只说一件事，宁可留白，不要用形容词填满
- 具体名词优于形容词：写“早上七点的渔市”，不写“绝美的清晨”
- 全文恰好使用 7 个 Emoji 或视觉符号（【与】分别计一个），可用【】、｜、✅、✨、🔥组织层次，不机械堆砌
- 前半段约占六成：围绕选题提供有趣、专业的事实分享或科普；后半段约占四成：自然过渡到产品方案
- 前三段 category 只能用 literary 或 professional_advice；产品方案从第四段开始，category 用 objective_fact 或 marketing
- 产品段只选择 2-5 条与主题最相关的锁定事实，不要把所有事实强行塞入
- 结尾必须是完整句，可以克制，但不能停在逗号、冒号、连接词或未闭合括号处

【AI 腔，禁止出现】
- “不是……而是……”“与其……不如……”等排比句式
- 宝藏、封神、此生必去、治愈、松弛感、天花板等空洞热词
- 连续设问（“你猜怎么着？”“值不值得去？”）
- 每段结尾都工整对仗、节奏雷同

【对比例子】（只示意语感，禁止照抄其中任何句子或复用其场景）
坏：“在瑞士的这几天，真的被治愈了。不是因为风景有多绝，而是那种久违的松弛感。此生必去的宝藏之地！”
好：“瑞士的下午四点，缆车上只有零星几个人。风很大，说话要凑近才听得见。下山时，山脚的灯已经亮了一半。”

【事实纪律】（最高优先级，与上文冲突时以事实纪律为准）
禁止编造客户经历、销售数据或第一人称亲历；价格、日期、产品行程地点、天数、酒店、航班、名额只能使用锁定事实且不得改写数值。稳定的人文、历史和旅游常识可以使用，但不要编造精确数字；若选题属于近期信息，只能使用“可靠来源”中明确提供的信息。
选题类别：${input.angleType||"custom"}\n主题：${input.topic}\n锁定事实：${JSON.stringify(input.facts)}\n可靠来源：${JSON.stringify(input.sources||[])}\n风格偏好：${input.stylePreferences.join("；")||"专业、有趣、有层次"}`, lenientDraftSchema, { temperature: 0.8, system: WRITER_SYSTEM });
  }
  async reviseCopy(input: RevisionInput): Promise<Draft> {
    const locked = input.blocks.filter(b=>input.lockedBlockIds.includes(b.id));
    const scope = input.targetBlockId ? `只允许修改 id=${input.targetBlockId} 的段落，其他段落逐字保留。` : "修改全文，但 lockedBlockIds 中的段落必须逐字保留。";
    const result = await this.callJson(`${scope}\n修改要求：${input.instruction}\n只返回与输入相同 id、相同顺序的 JSON blocks，每个 block 必须保留 id、text、category 三个字段，category 沿用输入的取值。禁止改变锁定事实，禁止编造经历或数据。
改写后保持专业且有旅行博主式吸引力，句子和结尾必须完整；全文必须写到 410-470 个非空白字符，低于 350 字视为失败，并恰好使用 7 个 Emoji 或视觉符号（【与】分别计一个）。维持“前半段知识分享、自然过渡、后半段精选产品事实”的结构，前半段 category 只能用 literary 或 professional_advice，产品段 category 用 objective_fact 或 marketing。不得出现虚构亲历、职业身份或客户故事。
锁定段落：${JSON.stringify(locked)}\n锁定事实：${JSON.stringify(input.facts)}\n可靠来源：${JSON.stringify(input.sources||[])}\n当前段落：${JSON.stringify(input.blocks)}`, lenientDraftSchema, { temperature: 0.75, system: WRITER_SYSTEM });
    const byId = new Map(input.blocks.map(b=>[b.id,b.category] as const));
    return { blocks: result.blocks.map(b=>({ ...b, category: byId.get(b.id) ?? b.category })) };
  }
  async verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification> {
    const revisionRule=baseline?`这是修改后的文案。只检查相对原稿新增或改变的事实性陈述；原稿中逐字保留的陈述不是本次修改新增事实。若本次只调整语气、结构或长度且未引入新事实，fact_safe 必须为 true。\n修改前原稿：${JSON.stringify(baseline.blocks)}`:"这是初稿。产品价格、日期、天数、产品行程地点、酒店、航班、名额必须来自锁定事实；稳定且广为人知的人文、历史与旅游常识可以保留，但不得编造精确年代、数字或近期变化。近期信息只能来自可靠来源。";
    return this.callJson(`核验朋友圈。只返回 JSON：{"fact_safe":true,"fact_issues":[],"naturalness_issues":[]}。
${revisionRule}
检查套路开头、连续问句、空洞形容词、机械CTA、虚构第一人称/客户经历/销售数据、从业身份信息，以及残句、突然截断、前后段过渡生硬、产品事实堆砌。完整但有吸引力的标题和适量 Emoji 不应判为不自然。
锁定事实：${JSON.stringify(input.facts)}\n可靠来源：${JSON.stringify(input.sources||[])}\n待核验文案：${JSON.stringify(draft.blocks)}`, verificationSchema);
  }
  async generateInspirations(input:InspirationGenerationInput):Promise<InspirationDraft>{
    return this.callJson(`根据一个已有旅行产品，生成四个中文朋友圈选题。只返回 JSON：{"topics":[{"title":"","city":"","country":"","flag":"🇪🇺","reason":"","audience":"","content_type":"","angle_type":"culture|history|resources|current","source_index":null}]}。
硬性要求：
1. 四条全部围绕同一个产品涉及的国家、地区、线路或旅游资源，禁止随机换到无关国家；
2. angle_type 必须各出现一次：culture 人文风貌、history 历史文化、resources 旅游资源、current 近期信息；
3. current 只有在搜索素材非空时才能写近期信息并引用对应 source_index；没有素材时改写为稳定的实用科普，source_index 填 null；
4. 标题要具体、有吸引力、适合知识分享，不得虚构个人经历或强行写成体验口吻；
5. 稳定常识可以作为角度，但不要编造精确年代、数字和政策；产品专属信息只能来自锁定事实；
6. 四条的核心问题必须不同，并避开上一组标题。
${input.retryHint?`\n特别注意：${input.retryHint}\n`:""}
产品：${input.productName}
产品摘要：${input.productSummary}
锁定事实：${JSON.stringify(input.facts)}
刷新次数：${input.refreshNo}
上一组选题：${JSON.stringify(input.previousTitles)}
搜索素材：${JSON.stringify(input.sourceSummaries)}`,inspirationDraftSchema);
  }
async generateStoryboard(text:string):Promise<Storyboard>{return this.callJson(`根据朋友圈文案设计简单视觉故事板。只返回 JSON：{"roles":[{"id":"hero","label":"首图","description":"画面作用","searchTheme":"对应中文主题"}],"searchThemes":[{"label":"中文主题","query":"concise English photo query including exact destination"}]}。要求 6-9 个叙事角色，但只归并为 4-6 个搜索主题；角色必须有首图、大景、生活/人物环境、细节和收尾等不同作用。先识别文案的主要国家和城市，每个 query 都必须包含文案中对应的英文城市名或国家名，不得换成相似的其他国家或城市；没有明确地点时才允许使用泛化欧洲主题。query 只描述真实摄影内容，不生成AI图片，并优先适合朋友圈方形裁切的主体居中构图。文案：${text.slice(0,5000)}`,storyboardSchema)}
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
