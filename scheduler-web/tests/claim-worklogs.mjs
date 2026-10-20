import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {claimWorklogsRoute} from '../../functions/lib/claimWorklogs.ts';

// Local synthetic requests only; optional Claim root enables real two-handler SQLite integration.
const id='10000000-0000-4000-8000-000000000001';
const route='claim-worklogs/'+id;
const user={id:'u_8',login:'ybchoi',email:'ybchoi@con-cost.com',name:'Synthetic QA',department:'Synthetic',position:'Synthetic'};
const payload={date:'2026-10-20',todayTask:'Synthetic work',tomorrowPlan:'Next',notes:'',workHours:8,expectedVersion:0};
let calls=[];
const binding={async fetch(request){calls.push(await request.json());return Response.json({ok:true});}};
const req=(method='PUT',body=payload,headers={},search='')=>new Request('https://tech.example.invalid/api/collaboration/'+route+search,{method,headers:{Origin:'https://tech.example.invalid','Content-Type':'application/json',...headers},...(method==='PUT'||method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const send=(request=req(),env={CLAIM_WORKLOGS:binding},r=route,u=user)=>claimWorklogsRoute(request,env,u,r);
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS',name);}
await check('Session identity only, private destination, exact date and no editable profile forwarding',async()=>{
 await send(req('PUT',{...payload,actor:{id:'forged'},name:'forged'}));
 assert.deepEqual(calls[0].actor,{id:user.id,login:user.login,email:user.email});
 assert.equal(calls[0].body.actor.id,'forged'); // downstream schema must reject; cannot override envelope actor
 assert.equal(calls[0].path,'/api/project-worklogs/'+id);
 await send(req('GET',null,{},'?date=2026-10-20'));assert.equal(calls[1].path,'/api/project-worklogs/'+id+'?date=2026-10-20');
});
await check('CSRF, unsupported method, content type, malformed body and byte limit fail before binding',async()=>{
 const n=calls.length;
 for(const headers of [{Origin:'https://foreign.invalid'},{Origin:''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await send(req('PUT',payload,headers))).status,403);
 assert.equal((await send(req('POST'))).status,405);
 assert.equal((await send(req('PUT',payload,{'Content-Type':'text/plain'}))).status,415);
 assert.equal((await send(req('PUT','{'))).status,400);
 assert.equal((await send(req('PUT',{...payload,notes:'가'.repeat(15000)}))).status,413);
 assert.equal(calls.length,n);
});
await check('Malformed/cross-route paths, missing binding and upstream failures remain explicit',async()=>{
 for(const r of ['claim-worklogs/../../report-drafts','claim-worklogs/'+id+'/other','claim-worklogs/%2f'])assert.equal((await send(req(),{CLAIM_WORKLOGS:binding},r)).status,400);
 assert.equal(await send(req(),{},'unrelated'),null);
 assert.equal((await send(req(),{})).status,503);
 assert.equal((await send(req('GET',null,{},'?date=2026-10-20&caseId=other'))).status,400);
 assert.equal((await send(req(),{CLAIM_WORKLOGS:{fetch:async()=>{throw Error('synthetic');}}})).status,502);
 const error=await send(req(),{CLAIM_WORKLOGS:{fetch:async()=>Response.json({error:'synthetic stale'},{status:409})}});
 assert.equal(error.status,409);assert.deepEqual(await error.json(),{error:'synthetic stale'});assert.equal(error.headers.get('Cache-Control'),'no-store');
});
if(process.env.CF241_CLAIM_ROOT){
 const root=resolve(process.env.CF241_CLAIM_ROOT);
 const {handleTechWorklogs}=await import(pathToFileURL(resolve(root,'apps/cloudflare/src/index.ts')).href);
 const {handleProjectWorklogs}=await import(pathToFileURL(resolve(root,'apps/cloudflare/src/project-worklogs.ts')).href);
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE preview_users(id TEXT PRIMARY KEY,login_id TEXT,display_name TEXT,roles_json TEXT,is_active INTEGER);CREATE TABLE preview_cases(id TEXT PRIMARY KEY,organization_id TEXT,deleted_at TEXT,case_number TEXT,title TEXT,updated_at TEXT);CREATE TABLE preview_case_assignments(case_id TEXT,user_id TEXT);CREATE TABLE preview_workflow_events(id TEXT PRIMARY KEY,case_id TEXT,actor_id TEXT,event_type TEXT,entity_id TEXT,detail_json TEXT,created_at TEXT);`);
 const claimActor={id:'04913c4f-661b-4458-b920-cc8da980fe6d',loginId:user.email,displayName:'Synthetic QA',roles:['pm']};
 db.prepare('INSERT INTO preview_users VALUES(?,?,?,?,1)').run(claimActor.id,claimActor.loginId,claimActor.displayName,'["pm"]');
 for(const caseId of [id,'10000000-0000-4000-8000-000000000002'])db.prepare('INSERT INTO preview_cases VALUES(?,?,NULL,?,?,?)').run(caseId,'concost','QA','Synthetic','2026-01-01');
 db.prepare('INSERT INTO preview_case_assignments VALUES(?,?)').run(id,claimActor.id);
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};
 const env={CLAIM_WORKLOGS:{fetch:r=>handleTechWorklogs(r,{DB})}};
 try{
 await check('Actual Tech proxy -> Claim handler -> same SQLite -> Claim GET -> Tech GET exact',async()=>{
 const saved=await send(req(),env);assert.equal(saved.status,200);const log=(await saved.json()).log;assert.equal(log.version,1);
 const direct=await handleProjectWorklogs(new Request('https://claim.example.invalid/api/project-worklogs/'+id+'?date=2026-10-20'),DB,claimActor);
 const via=await send(req('GET',null,{},'?date=2026-10-20'),env);assert.equal(via.status,200);assert.deepEqual(await via.json(),await direct.json());
 assert.equal((await send(req(),env)).status,409);
 });
 await check('Actual Claim rejects browser actor override and unassigned case; forged session identity rejected',async()=>{
 assert.equal((await send(req('PUT',{...payload,actor:{id:'forged'}}),env)).status,400);
 assert.equal((await send(req(),env,'claim-worklogs/10000000-0000-4000-8000-000000000002')).status,404);
 for(const key of ['id','login','email'])assert.equal((await send(req(),env,route,{...user,[key]:'forged'})).status,403);
 assert.equal(db.prepare('SELECT count(*) AS n FROM preview_workflow_events').get().n,1);
 });
 }finally{db.close();}
}else console.log('SKIP cross-repository Claim integration: set CF241_CLAIM_ROOT and run with Claim tsx loader');
console.log(JSON.stringify({passed,remoteCalls:0,realDatabaseWrites:0}));
