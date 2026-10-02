const freshPatterns=[/最新|近期|当前|现在|今年|今日|本周|本月/,/节庆|节日|活动.*日期|开放.*时间/,/签证|入境|边境|旅行限制|旅游税/,/交通.*变化|罢工|停运|航线|航班/,/景点.*规则|预约|门票.*规则/,/重大.*旅游|突发/];
const politicalOnly=/选举|政党|议会争议|外交争端|政治丑闻/;
const travelImpact=/签证|边境|交通|航班|罢工|限制|旅游税|安全|入境/;
export function needsFreshSearch(text:string){const reason=freshPatterns.find(pattern=>pattern.test(text));return{needed:Boolean(reason)&&(!politicalOnly.test(text)||travelImpact.test(text)),reason:reason?.source||null}}
export function cacheHours(claim:string){if(/罢工|停运|突发|交通/.test(claim))return 2;if(/活动|节庆|规则|开放|门票/.test(claim))return 24;if(/签证|入境|边境/.test(claim))return 24*7;return 24*30}

