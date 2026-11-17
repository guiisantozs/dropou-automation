import test from 'node:test';
import assert from 'node:assert/strict';

const productA='https://produto.mercadolivre.com.br/MLB-1234567890-gpu-_JM';
const productB='https://produto.mercadolivre.com.br/MLB-1234567891-headset-_JM';

async function fixture() {
  const data={};
  const openTabs=new Map();
  let nextTab=20,listener, onUpdated, onRemoved;
  let platformReply=async()=>({ok:false,error:'Desconectado'});const platformMessages=[];
  const chromeMock={
    storage:{session:{
      async get(keys) {
        const out={};
        for(const key of Array.isArray(keys)?keys:[keys]) if (key in data) out[key]=data[key];
        return out;
      },
      async set(fields){Object.assign(data,fields);},
      async remove(keys){for(const key of Array.isArray(keys)?keys:[keys]) delete data[key];},
    }},
    tabs:{
      async query(){return [...openTabs.values()].filter(t=>t.url?.startsWith('https://dropou-automation.vercel.app/'));},
      async sendMessage(id,message,options){platformMessages.push({id,message,options});return platformReply(message);},
      async create({url,active}) {
        const tab={id:nextTab++,url,active,status:'complete',windowId:1};
        openTabs.set(tab.id,tab);
        return tab;
      },
      async get(id) {
        if(!openTabs.has(id)) throw new Error('Tab not found');
        return openTabs.get(id);
      },
      async remove(id) {
        if(!openTabs.has(id)) throw new Error('Tab not found');
        openTabs.delete(id);
        // Event is async in Chrome, and should not invalidate a completed job.
        if(onRemoved) void onRemoved(id);
      },
      async update(id,params){return {...openTabs.get(id),...params};},
      onUpdated:{addListener(fn){onUpdated=fn;}},
      onRemoved:{addListener(fn){onRemoved=fn;}},
    },
    scripting:{async executeScript(){return [];}},
    windows:{async update(){return {};}},
    runtime:{onMessage:{addListener(fn){listener=fn;}}},
  };
  globalThis.chrome=chromeMock;
  // Fresh worker instance per fixture. Worker imports pure helpers from disk.
  await import('./worker.js?test='+crypto.randomUUID());
  const send=(request,sender={})=>new Promise((resolve,reject)=>{
    listener(request,sender,response=>{
      if(response?.ok) resolve(response);
      else reject(new Error(response?.error||'Request failed'));
    });
  });
  return {send,data,openTabs,platformMessages,set platformReply(fn){platformReply=fn;}, get job(){return data.dropouMercadoLivreJob;}};
}

test('inicia desligado e desativa limpando fila e aba',async()=>{
  const fx=await fixture();
  await assert.rejects(fx.send({type:'start',productUrl:productA}),/Ative/);
  await fx.send({type:'setEnabled',enabled:true});
  await fx.send({type:'start',productUrl:productA});
  assert.equal(fx.job.items.length,1);
  assert.equal(fx.job.state,'working');
  assert.equal(fx.openTabs.size,1);
  await fx.send({type:'setEnabled',enabled:false});
  assert.equal(fx.data.dropouMercadoLivreJob,undefined);
  assert.equal(fx.data.dropouMercadoLivreEnabled,false);
  assert.equal(fx.openTabs.size,0);
});

test('ponte explícita envia cinco resultados individualmente; não confirma antes do recibo, preserva request ID e reconecta sem duplicar',async()=>{
 const fx=await fixture();await fx.send({type:'setEnabled',enabled:true});
 const urls=Array.from({length:5},(_,i)=>productA.replace('1234567890',String(1234567890+i)));await fx.send({type:'start',productUrl:urls.join('\n')});
 for(let i=0;i<5;i++){const job=fx.job;await fx.send({type:'finished',jobId:job.id,success:true,resultUrl:'https://meli.la/fixture'+i},{tab:{id:job.tabId}});}
 assert.equal(fx.job.state,'completed');assert.equal(fx.platformMessages.length,0,'conversion never sends automatically');
 fx.openTabs.set(99,{id:99,url:'https://dropou-automation.vercel.app/?brand=dropou',active:true,windowId:1});
 let fail=true,operation='dropou',nonce=crypto.randomUUID();
 fx.platformReply=async message=>message.command==='connect'?{ok:true,connectionId:nonce,operation,expiresAt:Date.now()+300000}:fail?{ok:false,error:'Conexão interrompida'}:{ok:true,requestId:message.payload.requestId,status:'pending'};
 await fx.send({type:'connectDropou'});await assert.rejects(fx.send({type:'sendDropou',index:0}),/interrompida/);assert.equal(fx.job.items[0].transfer.state,'error');const requestId=fx.job.items[0].transfer.requestId;
 nonce=crypto.randomUUID();await fx.send({type:'connectDropou'});fail=false;
 for(let i=0;i<5;i++)await fx.send({type:'sendDropou',index:i});
 assert.equal(fx.job.items[0].transfer.requestId,requestId);assert.deepEqual(fx.job.items.map(i=>i.transfer.state),Array(5).fill('pending'));
 const messages=fx.platformMessages.filter(m=>m.message.command==='receive');assert.equal(messages.length,6);assert.equal(messages[0].message.payload.requestId,messages[1].message.payload.requestId);
 for(const {message,options} of messages){assert.deepEqual(Object.keys(message.payload).sort(),['candidateUrl','itemId','originalUrl','requestId','review']);assert.equal(message.payload.review,'candidate');assert.deepEqual(options,{frameId:0});}
 operation='moda';await fx.send({type:'connectDropou'});await assert.rejects(fx.send({type:'sendDropou',index:0}),/outra operação/);
 await fx.send({type:'setEnabled',enabled:false});await assert.rejects(fx.send({type:'connectDropou'}),/Ative/);await assert.rejects(fx.send({type:'sendDropou',index:0}),/desligada/);assert.equal(fx.data.dropouPlatformConnection,undefined);
});

test('ponte recusa sites não autorizados, resultados inválidos e comandos do conteúdo do Mercado Livre',async()=>{
 const fx=await fixture();await assert.rejects(fx.send({type:'setEnabled',enabled:true},{tab:{id:999}}),/painel/);await fx.send({type:'setEnabled',enabled:true});await fx.send({type:'start',productUrl:productA});
 const job=fx.job;await fx.send({type:'finished',jobId:job.id,success:true,resultUrl:'https://meli.la/fixture'},{tab:{id:job.tabId}});
 fx.data.dropouPlatformConnection={tabId:77,expiresAt:Date.now()+300000,operation:'dropou',connectionId:crypto.randomUUID()};fx.openTabs.set(77,{id:77,url:'https://dropou-automation.vercel.app.evil.test/'});
 await assert.rejects(fx.send({type:'sendDropou',index:0}),/mudou de endereço/);assert.equal(fx.platformMessages.length,0);assert.notEqual(fx.job.items[0].transfer.state,'pending');
});

test('lote converte em ordem, sem publicar ou gravar dados permanentes',async()=>{
  const fx=await fixture();
  await fx.send({type:'setEnabled',enabled:true});
  await fx.send({type:'start',productUrl:productA+'\n'+productB});
  const first=fx.job;
  const firstTask=await fx.send({type:'getTask'},{tab:{id:first.tabId}});
  assert.equal(firstTask.productUrl,productA);
  await fx.send({type:'finished',jobId:firstTask.jobId,success:true,resultUrl:'https://meli.la/ABC111'}, {tab:{id:first.tabId}});
  const second=fx.job;
  assert.equal(second.currentIndex,1);
  assert.equal(second.items[0].state,'candidate');
  assert.equal(second.state,'working');
  assert.equal(fx.openTabs.size,1);
  const secondTask=await fx.send({type:'getTask'},{tab:{id:second.tabId}});
  await fx.send({type:'finished',jobId:secondTask.jobId,success:true,resultUrl:'https://meli.la/ABC222'},{tab:{id:second.tabId}});
  assert.equal(fx.job.state,'completed');
  assert.deepEqual(fx.job.items.map(x=>x.state),['candidate','candidate']);
  assert.equal(fx.openTabs.size,0);
});

test('falha pausa lote e exige pular explicitamente',async()=>{
  const fx=await fixture();
  await fx.send({type:'setEnabled',enabled:true});
  await fx.send({type:'start',productUrl:productA+'\n'+productB});
  const first=fx.job, task=await fx.send({type:'getTask'},{tab:{id:first.tabId}});
  await fx.send({type:'finished',jobId:task.jobId,success:false,message:'Campo não encontrado'},{tab:{id:first.tabId}});
  assert.equal(fx.job.state,'needs_attention');
  assert.equal(fx.job.items[1].state,'queued');
  await fx.send({type:'skip'});
  assert.equal(fx.job.currentIndex,1);
  assert.equal(fx.job.state,'working');
  assert.equal(fx.job.items[0].state,'needs_attention');
});

test('ignora resposta antiga depois do desligamento',async()=>{
  const fx=await fixture();
  await fx.send({type:'setEnabled',enabled:true});
  await fx.send({type:'start',productUrl:productA});
  const job=fx.job;
  await fx.send({type:'setEnabled',enabled:false});
  await assert.rejects(fx.send({type:'finished',jobId:job.id,success:true,resultUrl:'https://meli.la/ABC'},{tab:{id:job.tabId}}));
  assert.equal(fx.data.dropouMercadoLivreJob,undefined);
});
