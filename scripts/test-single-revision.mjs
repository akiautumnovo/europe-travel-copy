import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({entryPoints:["lib/ai/deepseek.ts"],bundle:true,platform:"node",format:"esm",write:false});
const { DeepSeekProvider } = await import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].text).toString("base64"));
const provider = new DeepSeekProvider({apiKey:"test",baseUrl:"https://example.invalid",model:"test"});
const blocks = [
  {id:"b1",text:"保留的第一段",category:"literary"},
  {id:"b2",text:"要修改的第二段",category:"objective_fact"},
  {id:"b3",text:"保留的第三段",category:"marketing"},
];
const originalFetch = globalThis.fetch;
let calls = 0;
let responses = [];
globalThis.fetch = async () => {
  calls++;
  const content = responses.shift();
  assert.notEqual(content,undefined,"Unexpected extra AI request");
  return Response.json({choices:[{message:{content:JSON.stringify(content)}}]});
};
const input = {topic:"旅行",facts:[],salesIntensity:1,stylePreferences:[],blocks,lockedBlockIds:["b1"],instruction:"更自然",targetBlockId:"b2"};
try {
  for(const contentMode of ["product","knowledge"]){
    for(const response of [
      {text:"修改后的第二段"},
      {id:"b2",text:"修改后的第二段"},
      {block:{id:"b2",text:"修改后的第二段"}},
      {blocks:[{id:"b1",text:"不应接受"}, {id:"b2",text:"修改后的第二段",category:"marketing"}]},
      [{id:"b2",text:"修改后的第二段"}],
    ]){
      responses=[response];calls=0;
      const result=await provider.reviseCopy({...input,contentMode});
      assert.deepEqual(result.blocks,[blocks[0],{...blocks[1],text:"修改后的第二段"},blocks[2]]);
      assert.equal(calls,1);
    }
  }
  responses=[{unexpected:true},{text:"重试成功"}];calls=0;
  assert.equal((await provider.reviseCopy(input)).blocks[1].text,"重试成功");
  assert.equal(calls,2);
  for(const invalid of [{text:"  "},{blocks:[{id:"b1",text:"错误目标"}]},{}]){
    responses=[invalid,invalid];calls=0;
    await assert.rejects(provider.reviseCopy(input),/单段改写返回格式异常/);
    assert.equal(calls,2);
  }
  calls=0;
  await assert.rejects(provider.reviseCopy({...input,targetBlockId:"missing"}),/不存在/);
  await assert.rejects(provider.reviseCopy({...input,lockedBlockIds:["b2"]}),/解锁/);
  assert.equal(calls,0);
  assert.equal(blocks[1].text,"要修改的第二段");
  console.log("Single paragraph revision regression checks passed.");
} finally {
  globalThis.fetch=originalFetch;
}
