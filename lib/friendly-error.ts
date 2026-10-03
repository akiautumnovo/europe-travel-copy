export function friendlyError(message:string|undefined,fallback:string){
 const value=(message||"").trim();
 if(!value)return fallback;
 if(/409|新版本|冲突/.test(value))return "这条内容已有新版本，请刷新后再试。你当前的编辑不会丢失。";
 if(/事实检查未通过/.test(value))return value;
 if(/search|tavily|bocha|brave|联网搜索|无法联网/i.test(value))return "当前无法联网核验，这条事实暂时不会写入文案。";
 if(/pixabay|图库|media/i.test(value))return "外部图库暂时不可用，可以先使用自己的素材。";
 if(/timeout|timed out|超时/i.test(value))return `${fallback}，服务响应较慢，请稍后重试。当前内容不会丢失。`;
 if(/internal server|\b500\b|unexpected|stack|syntaxerror/i.test(value))return fallback;
 return value;
}

export function friendlyApiError(input:{error?:string;code?:string}|undefined,fallback:string){
 if(input?.code==="FACT_CHECK_FAILED")return input.error||"文案包含未确认的日期、价格或其他关键事实，请检查产品事实后重试。";
 if(input?.code==="SEARCH_UNAVAILABLE")return "当前无法联网核验，这条事实暂时不会写入文案。";
 return friendlyError(input?.error,fallback);
}
