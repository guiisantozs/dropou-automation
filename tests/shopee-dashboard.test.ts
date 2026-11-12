import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gamerDashboardRows} from '../src/lib/shopee-dashboard';
import {classifyGamingTech} from '../src/lib/shopee-quality';
test('only genuine Games and Tech identities reach any dashboard view, even with stale eligible flags',()=>{
 for(const name of ['Creatina Monohidratada Gamer','Kit Shampoo e Condicionador','Batedor Mixer USB Gamer','Carregador de Barbeador','Processador de Alimentos','Teclado gamer kit shampoo'])assert.equal(classifyGamingTech(name).relevant,false,name);
 for(const name of ['Teclado mecânico gamer RGB','Headset USB para PC','SSD NVMe 1TB','Smartwatch Amazfit','Carregador USB Tipo C para celular','Gabinete Gamer Pichau'])assert.equal(classifyGamingTech(name).relevant,true,name);
 const noise=['Creatina','Kit Shampoo','Batedor USB'].map((name,i)=>({id:'noise'+i,data:{name},eligible:true,decision:'found',score:99}));
 for(const filter of ['eligible','all','approved','ineligible','selected'])assert.equal(gamerDashboardRows(noise,filter,new Set(noise.map(r=>r.id))).length,0);
});
test('rejected and removed offers leave every active list; explicit history remains available without deleting records',()=>{
 const rows=['found','approved','rejected','removed'].map((decision,i)=>({id:String(i),data:{name:'Headset Gamer Modelo '+i},eligible:true,decision,score:80-i}));
 for(const filter of ['eligible','all','selected'])assert.deepEqual(gamerDashboardRows(rows,filter,new Set(rows.map(r=>r.id))).map(r=>r.id),['0','1']);
 assert.deepEqual(gamerDashboardRows(rows,'rejected').map(r=>r.id),['2']);assert.deepEqual(gamerDashboardRows(rows,'removed').map(r=>r.id),['3']);assert.equal(rows.length,4);
 const changed=rows.map(r=>r.id==='0'?{...r,decision:'rejected'}:r);assert.deepEqual(gamerDashboardRows(changed,'eligible').map(r=>r.id),['1']);
});
