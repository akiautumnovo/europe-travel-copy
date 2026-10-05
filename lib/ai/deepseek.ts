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
全文 220-320 个非空白字符（硬性 190-480），写成 9-14 行短句，归入 5-14 个 block（一行一个 block 也可以）；每个 block 内可用换行分隔短句（JSON 字符串里写 \\n），一行一句、一般不超过 28 字。

【排版：短句分行】（本次最重要的要求）
- 学朋友圈广告的节奏：一行一个完整短句，短句之间换行；同类信息用“｜”并列成一行，不要写成长段散文
- 全文 9-14 行，每行 16-28 字；**不要把半句话拆成两行**，也不要每行只写四五个字——行太碎会失去节奏
- 每个 block 内 1-3 行；行首可以用 ✅ 或与内容相关的 Emoji 做标记（住宿 🏨、交通与航班 ✈️、餐食 🍽️、门票 🎫、价格 💰、优惠 🎁、风光或收束 🌇），同一 block 内风格保持一致
- 全文 8-14 个 Emoji 或视觉符号（【与】分别计一个）：绝大多数放在行首做标记，允许 1-2 个放句尾收束；不要句中堆砌，也不要两个挨在一起

【结构】
- 前 2-3 个 block 是引子：简短、勾人，每个 block 1-2 行。点出这次旅程独特在哪，或写一句展开性、文艺性的描写（例如收束感的画面句）。**人文科普点到为止，不要展开长篇**，一行一句。
- 第 4 个 block 起是产品部分：**只用简洁短句罗列，不写完整段落**，控制在 6-9 行。优先覆盖这些类目，每类一行、用“｜”并列要点：住宿（连住几晚、酒店档次）｜交通（航司、直飞、双点进出）｜航班与班期｜门票与官导｜餐食（几顿正餐、是否全含）｜价格与早鸟优惠
- 产品部分允许 1 句展开性、文艺性的描写做收束，但不要空泛热词
- 产品段的第一句要先承接上文再引出产品，禁止“说到这里”“接下来介绍我们的产品”这类生硬转折
- 开头至少 2 个 block 是引子（简短的人文/文艺引子），category 只能用 literary 或 professional_advice；引子结束后进入产品部分，category 用 objective_fact 或 marketing
- 产品部分只用与主题最相关的 4-8 条锁定事实，不要把整份资料塞进来
- 最后一行必须是完整句，不能停在逗号、冒号、连接词或未闭合括号处

【AI 腔，禁止出现】
- “不是……而是……”“与其……不如……”等排比句式
- 宝藏、封神、此生必去、治愈、松弛感、天花板等空洞热词
- 连续设问（“你猜怎么着？”“值不值得去？”）
- 每段结尾都工整对仗、节奏雷同

【对比例子】（只示意语感与排版，禁止照抄其中任何句子、地名或数字）
坏（大段散文、太长）：“在瑞士的这几天，真的被治愈了。不是因为风景有多绝，而是那种久违的松弛感。此生必去的宝藏之地！”
好（短句分行、有节奏）：
“缆车到顶，冰川就在脚下铺开🔧
脚下的石阶被磨得发亮
风从山口吹下来，说话要凑近才听得见”
过渡坏（生硬转折）：“说到这里，我们的线路正好适合你。”
过渡好（承接上文再引出产品）：“想在同一段铁轨上多看几眼冰川，就得把行程排进山里——下面这条线路正是这么排的。”

【事实纪律】（最高优先级，与上文冲突时以事实纪律为准）
禁止编造客户经历、销售数据或第一人称亲历；价格、日期、产品行程地点、天数、酒店、航班、名额只能使用锁定事实且不得改写数值。稳定的人文、历史和旅游常识可以使用，但不要编造精确数字；若选题属于近期信息，只能使用“可靠来源”中明确提供的信息。
选题类别：${input.angleType||"custom"}\n主题：${input.topic}\n锁定事实：${JSON.stringify(input.facts)}\n可靠来源：${JSON.stringify(input.sources||[])}\n风格偏好：${input.stylePreferences.join("；")||"专业、有趣、有层次"}`, lenientDraftSchema, { temperature: 0.8, system: WRITER_SYSTEM });
  }
  async reviseCopy(input: RevisionInput): Promise<Draft> {
    const locked = input.blocks.filter(b=>input.lockedBlockIds.includes(b.id));
    const scope = input.targetBlockId ? `只允许修改 id=${input.targetBlockId} 的段落，其他段落逐字保留。` : "修改全文，但 lockedBlockIds 中的段落必须逐字保留。";
    const result = await this.callJson(`${scope}\n修改要求：${input.instruction}\n只返回与输入相同 id、相同顺序的 JSON blocks，每个 block 必须保留 id、text、category 三个字段，category 沿用输入的取值。禁止改变锁定事实，禁止编造经历或数据。
改写后必须保留“短句分行”的排版：一行一个短句、用换行分隔，同类信息用“｜”并列，绝不能改写成大段散文；全文 220-320 个非空白字符、9-14 行；8-14 个 Emoji 或视觉符号，主要放行首做标记并与内容相关（住宿🏨 交通与航班✈️ 餐食🍽️ 门票与官导🎫 价格💰 优惠🎁 风光收束🌇）。产品部分只保留简洁的短句罗列（住宿｜交通与航班｜班期｜门票与官导｜餐食｜价格与优惠），可保留 1 句展开性描写做收束；产品段第一句先承接上文再引出产品，不要生硬转折。前半段 category 只能用 literary 或 professional_advice，产品段 category 用 objective_fact 或 marketing。不得出现虚构亲历、职业身份或客户故事，句子和最后一行必须完整。
锁定段落：${JSON.stringify(locked)}\n锁定事实：${JSON.stringify(input.facts)}\n可靠来源：${JSON.stringify(input.sources||[])}\n当前段落：${JSON.stringify(input.blocks)}`, lenientDraftSchema, { temperature: 0.75, system: WRITER_SYSTEM });
    const byId = new Map(input.blocks.map(b=>[b.id,b.category] as const));
    return { blocks: result.blocks.map(b=>({ ...b, category: byId.get(b.id) ?? b.category })) };
  }
  async verifyCopy(input: GenerationContext, draft: Draft, baseline?: Draft): Promise<Verification> {
    const revisionRule=baseline?`这是修改后的文案。只检查相对原稿新增或改变的常识性错误；原稿中逐字保留的陈述不是本次修改新增内容。若本次只调整语气、结构或长度且未引入新的常识性错误，fact_safe 必须为 true。\n修改前原稿：${JSON.stringify(baseline.blocks)}`:"这是初稿。只核查常识层面：地理、历史、文化、季节、交通等基本常识是否明显错误，是否出现常识性矛盾或并不存在的说法，是否编造精确年代或近期变化。";
    return this.callJson(`核验朋友圈。只返回 JSON：{"fact_safe":true,"fact_issues":[],"naturalness_issues":[]}。
${revisionRule}
【重要】你只负责核查基本常识。价格、费用、日期、出发时间、行程天数、住宿与酒店星级、航班、名额、签证、退改等数据类内容，一律不要写进 fact_issues——这些由用户对照页面上的「已锁定产品事实」自行核对。锁定事实只用于让你理解上下文，不需要逐条比对。
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
