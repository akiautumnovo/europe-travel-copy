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
 if(input?.code==="FACT_CHECK_FAILED")return input.error||"文案里有与基本常识明显不符的说法，请检查后重试。价格、日期等数据请对照页面上的「已锁定产品事实」自行核对。";
 if(input?.code==="COPY_QUALITY_FAILED")return input.error||"文案完整性检查未通过，请换一个角度后重试。";
 if(input?.code==="AI_GENERATION_FAILED"||input?.code==="BAD_GATEWAY_RESPONSE")return input.error||fallback;
 if(input?.code==="SEARCH_UNAVAILABLE")return "当前无法联网核验，这条事实暂时不会写入文案。";
 if(input?.code==="STORYBOARD_GENERATION_FAILED")return input.error||"视觉故事板生成暂时失败，请重试。当前文案和已选图片不会丢失。";
 if(input?.code==="UNAUTHORIZED")return "当前登录账号没有访问权限，请用授权账号登录后重试。";
 return friendlyError(input?.error,fallback);
}

/**
 * 统一读取失败响应：先按状态码给出可定位的提示，再退回服务端文案。
 * 在 `response.json()` 之前调用，避免把 `{error:"..."}` 当成数据渲染。
 */
export async function readApiError(response:Response,fallback:string):Promise<string>{
 if(response.status===401)return "当前登录账号没有访问权限，请用授权账号登录后重试。";
 if(response.status===403)return "当前账号没有执行这个操作的权限。";
 if(response.status===404)return "请求的内容不存在，可能已被删除。";
 let message="";
 try{const data=await response.json() as {error?:string;code?:string};message=data?.error||""}catch{/* 非 JSON 响应，使用兜底文案 */}
 return friendlyError(message,fallback);
}
