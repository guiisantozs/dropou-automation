import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {workspaceBrands} from '../src/lib/workspace-brands';

test('premium dashboards reuse the read model without mixing owners, operations or channel evidence',()=>{
 const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/check-operation-dashboard-data.ts'],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.equal(result.stdout.match(/passed/g)?.length,workspaceBrands.length,result.stdout);
});
