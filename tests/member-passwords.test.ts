import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {correctMemberAccess,findExistingMember,passwordIssue,updateConfirmedPassword,validateMemberLogin} from '../scripts/lib/member-passwords';
const owner='70000000-0000-4000-8000-000000000001',id='70000000-0000-4000-8000-000000000002',email='member@example.invalid',secret=()=>crypto.randomUUID()+'Aa1!';
function fixture(){
 const row={owner_id:owner,member_id:id,role:'operator',active:true,brands:['beleza','casa','natal']},state={row:row as typeof row|null,owners:[owner],users:[{id,email}],owns:false,updates:[] as any[],pages:[] as number[],changed:false};
 const db={auth:{admin:{async listUsers({page,perPage}:any){state.pages.push(page);return {data:{users:state.users.slice((page-1)*perPage,page*perPage)},error:null};},async getUserById(uid:string){return {data:{user:state.users.find(u=>u.id===uid)},error:null};},async updateUserById(uid:string,attrs:any){state.updates.push({id:uid,attrs});return {data:{user:{id:uid}},error:null};}}},from(table:string){let field='',value:any;const q:any={select(){return q;},eq(f:string,v:any){field=f;value=v;return q;},async single(){return {data:{owner_ids:state.owners},error:null};},async maybeSingle(){return {data:state.row,error:null};},async limit(){return {data:state.owns&&field==='owner_id'&&value===id?[{owner_id:id}]:[],error:null};}};return q;}} as unknown as SupabaseClient;
 return {db,state};
}
test('exact email plus independently confirmed ID is required; missing, ambiguous or wrong IDs never create accounts',async()=>{
 const {db,state}=fixture();await assert.rejects(findExistingMember(db,'other@example.invalid',id));await assert.rejects(findExistingMember(db,email,owner));await assert.rejects(findExistingMember(db,'MEMBER@example.invalid',id));assert.equal(state.updates.length,0);
 const a=await findExistingMember(db,email,id);assert.equal(a.id,id);assert.equal(correctMemberAccess(a.membership as any),true);
 state.users.push({id:crypto.randomUUID(),email});await assert.rejects(findExistingMember(db,email,id),/ambígua/);assert.equal(state.updates.length,0);
});
test('lookup paginates rather than accepting an incomplete first page',async()=>{const {db,state}=fixture();state.users=Array.from({length:100},(_,i)=>({id:crypto.randomUUID(),email:'fixture'+i+'@example.invalid'})).concat([{id,email}]);assert.equal((await findExistingMember(db,email,id)).id,id);assert.deepEqual(state.pages,[1,2]);});
test('workspace owners, other teams and admin members are refused before password update',async()=>{
 for(const mode of ['owner','owns','admin','otherTeam']){const {db,state}=fixture();if(mode==='owner')state.owners.push(id);if(mode==='owns')state.owns=true;if(mode==='admin')state.row!.role='admin';if(mode==='otherTeam')state.row!.owner_id=crypto.randomUUID();await assert.rejects(findExistingMember(db,email,id));assert.equal(state.updates.length,0);}
});
test('the only administrative mutation is updateUserById with password; memberships and all other fields stay untouched',async()=>{
 const {db,state}=fixture(),a=await findExistingMember(db,email,id),before=JSON.stringify(state.row),password=secret();assert.equal(await updateConfirmedPassword(db,a,password),true);assert.equal(state.updates.length,1);assert.deepEqual(state.updates[0],{id,attrs:{password}});assert.equal(JSON.stringify(state.row),before);
 const b=await findExistingMember(db,email,id);state.row={...state.row!,brands:['beleza']};await assert.rejects(updateConfirmedPassword(db,b,secret()),/mudou/);assert.equal(state.updates.length,1);
});
test('missing or incorrect membership is reported without granting brands or changing roles',async()=>{for(const row of [null,{owner_id:owner,member_id:id,role:'operator',active:false,brands:['beleza'] }]){const {db,state}=fixture();state.row=row;const a=await findExistingMember(db,email,id);assert.equal(await updateConfirmedPassword(db,a,secret()),false);assert.deepEqual(state.row,row);}});
test('login validation verifies the same ID and exact access, then signs out only its own temporary session',async()=>{
 const {db}=fixture(),account=await findExistingMember(db,email,id),calls:any[]=[],password=secret();const client={auth:{async signInWithPassword(body:any){calls.push(body);return {data:{user:{id},session:{user:{id}}},error:null};},async signOut(options:any){calls.push(options);}},async rpc(name:string){assert.equal(name,'dropou_access_context');return {data:{actor:id,admin:false,brands:['beleza','casa','natal']},error:null};}} as unknown as SupabaseClient;
 assert.equal(await validateMemberLogin(client,account,password),true);assert.deepEqual(calls,[{email,password},{scope:'local'}]);
});
test('password confirmation and exact member scope reject omissions, duplicates, extra brands and suspended/admin profiles',()=>{
 const p=secret();assert.equal(passwordIssue(p,p),null);assert.ok(passwordIssue('x','x'));assert.ok(passwordIssue(p,p+'x'));
 for(const v of [null,{role:'admin',active:true,brands:['beleza','casa','natal']},{role:'operator',active:false,brands:['beleza','casa','natal']},{role:'operator',active:true,brands:['beleza','casa','natal','dropou']},{role:'operator',active:true,brands:['beleza','beleza','natal']}])assert.equal(correctMemberAccess(v),false);
});
