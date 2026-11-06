import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {requestOpenAI,ProviderError,modelConfig} from '../src/server/ai/core';
import {providerDiagnostic} from '../src/server/ai/provider-diagnostic';
import {analyzeVisual,VisualStore,VisualSettlement} from '../src/server/ai/visual-core';
import {ocrVisualResult} from '../src/lib/visual';
import VisualSourceNotice from '../src/components/visual-source-notice';

test('provider refusals distinguish key, permission, model and request errors without retries or raw error reflection',async()=>{
 for(const [status,code,kind,param] of [[401,'invalid_api_key','authentication',null],[403,'permission_denied','permission',null],[404,'model_not_found','model_access','model'],[400,'invalid_json_schema','invalid_request','text.format.schema'],[400,'unsupported_value','invalid_request','reasoning.effort']] as const){
  let calls=0;const http:typeof fetch=async()=>{calls++;return Response.json({error:{code,param,message:'PRIVATE MOCK KEY / raw image URL must not be reflected'}},{status,headers:{'x-request-id':'req_mock123'}});};
  await assert.rejects(requestOpenAI({model:'gpt-6-luna',max_output_tokens:900},'mock-key',http),(error:unknown)=>{assert.ok(error instanceof ProviderError);assert.equal(error.kind,kind);assert.equal(error.certain,true);assert.equal(error.diagnostic?.status,status);assert.equal(error.diagnostic?.code,code);assert.equal(error.diagnostic?.requestId,'req_mock123');assert.ok(error.message.includes('HTTP '+status));assert.ok(!error.message.includes('PRIVATE MOCK'));return true;});assert.equal(calls,1);
 }
 assert.deepEqual(providerDiagnostic(400,{code:'private-unrecognized-content',param:'sk-do-not-reflect'},'private header'),{status:400,code:'http_error'});
});

test('visual authentication refusal settles once and the cause survives OCR and the next wizard step',async()=>{
 let calls=0,settled:VisualSettlement|undefined;
 const image={dataUrl:'data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,217]).toString('base64'),width:1,height:1};
 const store:VisualStore={async reserve(){return {id:'test-reservation'};},async finish(_id,result,payload){settled=result;assert.equal(payload,null);}};
 const result=await analyzeVisual([image],'dropou',store,{...modelConfig({}),key:'mock-key',enabled:true},async()=>{calls++;return Response.json({error:{code:'invalid_api_key',message:'mock confidential key'}},{status:401});});
 assert.equal(calls,1);assert.equal(result.source,'local');assert.equal(result.diagnostic?.status,401);assert.match(result.message!,/chave/);assert.equal(settled?.state,'failed');assert.equal(settled?.error,'authentication:401:invalid_api_key');assert.equal(settled?.cost,0);
 const fallback=ocrVisualResult({name:'Produto lido localmente',price:447.05,previousPrice:null,installments:'',features:[],uncertain:[]},result);
 assert.equal(fallback.message,result.message);assert.deepEqual(fallback.diagnostic,result.diagnostic);assert.equal(fallback.source,'local');assert.equal(fallback.extraction?.currentPrice,447.05);
 const html=renderToStaticMarkup(createElement(VisualSourceNotice,{result:fallback}));assert.match(html,/role="alert"/);assert.match(html,/HTTP 401/);assert.match(html,/OCR gratuito/);assert.ok(!html.includes('mock confidential key'));
});
