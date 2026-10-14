import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {database} from './d1.mjs';

// Exercise the real API and SQLite planner without operating credentials or data.
const {db,DB}=database(),results=[],trace=[],cookies=new Map(),evidence={};
for(const file of ['0007_project_inquiries.sql','0008_inquiry_rounds.sql'])db.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'));
const migration=readFileSync(new URL('../../migrations/0011_intake_change_versions.sql',import.meta.url),'utf8');
const prepare=DB.prepare;
DB.prepare=sql=>{
 const statement=prepare(sql);let values=[];const bind=statement.bind;
 statement.bind=(...args)=>{values=args;bind(...args);return statement;};
 for(const method of ['first','all','run']){const execute=statement[method];statement[method]=async(...args)=>{trace.push({sql,values:[...values],method});return execute.apply(statement,args);};}
 return statement;
};
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
let handleCollaboration;
const profiles=[
 {id:'budget-admin',name:'합성 관리자',email:'yjw@con-cost.com',department:'개발 TF',position:'실장',role:'ADMIN'},
 {id:'budget-staff',name:'합성 구조 직원',email:'budget-staff@example.invalid',department:'구조팀',position:'사원',role:'MEMBER'},
];
async function request(actor,route,method='GET',body){
 const response=await handleCollaboration(new Request('https://budget.invalid/api/collaboration/'+route,{method,headers:{Cookie:cookies.get(actor)||'',Origin:'https://budget.invalid',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB},async()=>{throw Error('Archive must not execute in this test');});
 return {status:response.status,data:await response.json(),headers:response.headers};
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);process.exitCode=1;}}
const intakeVersion=()=>db.prepare("SELECT revision FROM studio_sync_versions WHERE key='intake'").get().revision;
const countProjects=()=>db.prepare('SELECT count(*) n FROM studio_projects').get().n;
const intake=(no=981)=>({id:'intake_'+no,no,code:'TK-2026'+no,name:'합성 접수 원문 '+no,scopeVerified:true,targetDepartments:['마감팀','구조팀','토목&조경팀'],startDate:'2026-10-14',endDate:'2026-10-20',notes:'기존 원문 보존'});
const project=(id,code,department='마감팀')=>({id,code,name:'합성 프로젝트 '+id,department,pmId:'',startDate:'2026-10-14',endDate:'2026-10-20',progress:0,status:'착수예정',roles:{},subTasks:{}});
const insertProject=value=>db.prepare('INSERT INTO studio_projects VALUES (?,?,1,?,?)').run(value.id,JSON.stringify(value),'2026-10-14T00:00:00Z','synthetic');
const photo={id:'budget-photo',name:'합성사진.png',mimeType:'image/png',field:'question',caption:'사진 원문 보존',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
const inquiry=(id,projectId,department='구조팀',authorId='budget-staff',status='REGISTERED')=>({id,projectId,department,no:'1',trade:department==='구조팀'?'슬라브':'조경',classification:'원문 구분',drawingNumbers:['S-001'],question:'합성 질의 원문 '+id,answer:'',review:'',notes:'',group:'1차 질의사항',roundNumber:1,images:[{...photo,id:'photo-'+id}],status,authorId,authorName:'합성 작성자',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'});
const insertInquiry=value=>db.prepare('INSERT INTO studio_project_inquiries VALUES (?,?,?,?,?,?,1,?)').run(value.id,value.projectId,value.department,value.authorId,value.status,JSON.stringify(value),value.updatedAt);
const plan=entry=>db.prepare('EXPLAIN QUERY PLAN '+entry.sql).all(...entry.values).map(row=>row.detail);
const hasCodeIndex=details=>details.some(detail=>detail.includes('idx_studio_projects_site_code'));
const hasProjectScan=details=>details.some(detail=>/SCAN (?:TABLE )?studio_projects(?:\s|$)/i.test(detail));
const snapshot=()=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'studio_%' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()]));

try{
 const module=await server.ssrLoadModule('../functions/lib/collaboration.ts');handleCollaboration=module.handleCollaboration;
 const hash=await module.passwordHash('synthetic-budget-password','synthetic-budget-salt');
 for(const profile of profiles){
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(profile.id,profile.id,profile.email,profile.name,profile.department,profile.position,JSON.stringify(profile),'synthetic-budget-salt',hash);
  const response=await request(profile.id,'login','POST',{login:profile.id,password:'synthetic-budget-password'});assert.equal(response.status,200);cookies.set(profile.id,response.headers.get('set-cookie').split(';')[0]);
 }

 await check('실제 세션 changes 100회: 접수·프로젝트 SELECT 0회, 세션·작은 버전 SELECT만 200회',async()=>{
  const before=trace.length,original=snapshot(),version=intakeVersion();
  for(let index=0;index<100;index++){const response=await request('budget-staff','changes');assert.equal(response.status,200);assert.equal(response.data.versions.intake,version);}
  const calls=trace.slice(before);assert.equal(calls.length,200);
  assert.equal(calls.filter(entry=>/\bFROM studio_sessions\b/i.test(entry.sql)).length,100);
  assert.equal(calls.filter(entry=>/^SELECT key,revision FROM studio_sync_versions$/i.test(entry.sql)).length,100);
  assert.ok(calls.every(entry=>entry.method!=='run'&&!/\bstudio_(?:projects|intake_documents)\b/i.test(entry.sql)));
  assert.deepEqual(snapshot(),original);evidence.polling={requests:100,selects:200,sessionSelects:100,versionSelects:100,projectSelects:0,intakeSelects:0,writes:0};
 });

 await check('직접 접수 INSERT·본문만 UPDATE·시각만 UPDATE·DELETE가 각각 버전을 올리고 changes는 생성하지 않음',async()=>{
  const record=intake(),version=intakeVersion(),projects=countProjects();
  const assertVersion=async expected=>{const before=trace.length,response=await request('budget-staff','changes');assert.equal(response.status,200);assert.equal(response.data.versions.intake,expected);assert.equal(countProjects(),projects);assert.ok(!trace.slice(before).some(entry=>/\bstudio_(?:projects|intake_documents)\b/i.test(entry.sql)));};
  db.prepare('INSERT INTO studio_intake_documents VALUES (?,?,?,?)').run(record.id,record.no,JSON.stringify(record),'2026-10-14T00:00:00Z');await assertVersion(version+1);
  db.prepare('UPDATE studio_intake_documents SET data=? WHERE id=?').run(JSON.stringify({...record,name:'본문만 변경'}),record.id);await assertVersion(version+2);
  db.prepare('UPDATE studio_intake_documents SET updated_at=? WHERE id=?').run('2026-10-14T00:00:01Z',record.id);await assertVersion(version+3);
  db.prepare('DELETE FROM studio_intake_documents WHERE id=?').run(record.id);await assertVersion(version+4);
  evidence.intakeTriggers={insert:true,dataOnlyUpdate:true,timestampOnlyUpdate:true,delete:true,projectWritesFromChanges:0};
 });

 await check('직접 수집 후 버전 차이→GET projects에서 빠진 팀만 생성하고 원본 배정·수주를 보존',async()=>{
  const record=intake(982),existing={...project('manual-intake-finish',record.code),pmId:'budget-staff',progress:73,notes:'원본 배정 메모'};insertProject(existing);
  const original=db.prepare('SELECT * FROM studio_projects WHERE id=?').get(existing.id),before=(await request('budget-staff','changes')).data.versions;
  db.prepare('INSERT INTO studio_intake_documents VALUES (?,?,?,?)').run(record.id,record.no,JSON.stringify(record),'2026-10-14T00:00:00Z');
  const latest=(await request('budget-staff','changes')).data.versions;assert.notEqual(latest.intake,before.intake);assert.equal(latest.projects,before.projects);
  const response=await request('budget-staff','projects');assert.equal(response.status,200);
  const linked=response.data.projects.filter(row=>row.project.code===record.code);assert.equal(linked.length,3);assert.deepEqual(linked.map(row=>row.project.department).sort(),['마감팀','구조팀','토목&조경팀'].sort());
  assert.deepEqual(db.prepare('SELECT * FROM studio_projects WHERE id=?').get(existing.id),original);
  assert.equal(db.prepare('SELECT data FROM studio_intake_documents WHERE id=?').get(record.id).data,JSON.stringify(record));
  const repaired=snapshot();assert.equal((await request('budget-staff','projects')).status,200);assert.deepEqual(snapshot(),repaired);
  evidence.repair={sameSiteTeams:3,newMissingTeams:2,existingAssignmentUnchanged:true,intakeOriginalUnchanged:true,repeatCreates:0};
 });

 await check('1000개 다른 현장 중 같은 코드 3개만 조회: 보관 원본·사진 포함, 중복·다른 팀·비공개 초안 제외',async()=>{
  db.exec('BEGIN');try{for(let index=0;index<1000;index++)insertProject(project('unrelated-'+index,'QA-UNRELATED-'+index));for(const value of [project('site-f','QA-SAME'),project('site-s',' qa-same ','구조팀'),project('site-c','qa-same','토목&조경팀')])insertProject(value);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run('site-c','2026-10-14T00:00:00Z','synthetic');
  for(const value of [inquiry('structure-source','site-f'),inquiry('structure-archive','site-c'),inquiry('civil-source','site-s','토목&조경팀'),inquiry('other-site','unrelated-0'),inquiry('own-private','site-s','구조팀','budget-staff','DRAFT'),inquiry('peer-private','site-s','구조팀','synthetic-peer','DRAFT')])insertInquiry(value);
  const originals=db.prepare('SELECT * FROM studio_project_inquiries ORDER BY id').all(),before=trace.length;
  const structure=await request('budget-staff','inquiries?projectId=site-f&department='+encodeURIComponent('구조팀'));assert.equal(structure.status,200);
  assert.deepEqual([...structure.data.capabilities.projectIds].sort(),['site-c','site-f','site-s']);assert.equal(new Set(structure.data.capabilities.projectIds).size,3);assert.ok(!structure.data.capabilities.writableProjectIds.includes('site-c'));
  assert.deepEqual(structure.data.inquiries.map(row=>row.id).sort(),['own-private','structure-archive','structure-source']);
  assert.deepEqual(structure.data.inquiries.find(row=>row.id==='structure-archive').images,[{...photo,id:'photo-structure-archive'}]);
  const civil=await request('budget-staff','inquiries?projectId=site-f&department='+encodeURIComponent('토목&조경팀'));assert.equal(civil.status,200);assert.deepEqual(civil.data.inquiries.map(row=>row.id),['civil-source']);assert.equal(civil.data.capabilities.canCreate,false);
  assert.deepEqual(db.prepare('SELECT * FROM studio_project_inquiries ORDER BY id').all(),originals);
  const lookup=trace.slice(before).find(entry=>entry.sql.startsWith('SELECT id,body,revision FROM studio_projects WHERE id=? UNION ALL'));assert.ok(lookup,'Real API must issue scoped SQL');const details=plan(lookup);assert.ok(hasCodeIndex(details),details.join('\n'));assert.ok(!hasProjectScan(details),details.join('\n'));
  evidence.siteLookup={unrelatedSites:1000,sharedSourceIds:3,duplicateIds:0,archivedSourceIncluded:true,photosUnchanged:true,peerDraftHidden:true,departmentScopePreserved:true,details};
 });

 await check('실제 질의 저장의 현장 연결 CAS 가드도 코드 색인을 사용하고 조회 뒤 새 원본이 생기면 저장을 거부',async()=>{
  const body={...inquiry('new-guard','site-f'),roundNumber:2,group:'2차 질의사항',images:[],authorId:'budget-admin'},before=trace.length;
  const saved=await request('budget-admin','inquiries/new-guard','PUT',{actorId:'budget-admin',department:'구조팀',revision:0,inquiry:body});assert.equal(saved.status,200);
  const guard=trace.slice(before).find(entry=>entry.method==='run'&&entry.sql.startsWith('INSERT OR IGNORE INTO studio_project_inquiries')&&entry.sql.includes('UNION SELECT id FROM studio_projects'));assert.ok(guard,'Actual write must contain site membership guard');
  const details=plan(guard);assert.ok(hasCodeIndex(details),details.join('\n'));assert.ok(!hasProjectScan(details),details.join('\n'));
  const originalPrepare=DB.prepare;let inserted=false;
  DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.startsWith('INSERT OR IGNORE INTO studio_project_inquiries')){const run=statement.run;statement.run=async()=>{if(!inserted){inserted=true;insertProject(project('late-source','QA-SAME','구조팀'));}return run();};}return statement;};
  try{const response=await request('budget-admin','inquiries/new-race','PUT',{actorId:'budget-admin',department:'구조팀',revision:0,inquiry:{...body,id:'new-race'}});assert.equal(response.status,409);assert.equal(db.prepare('SELECT count(*) n FROM studio_project_inquiries WHERE id=?').get('new-race').n,0);}finally{DB.prepare=originalPrepare;db.prepare('DELETE FROM studio_projects WHERE id=?').run('late-source');}
  assert.ok(inserted);evidence.siteWriteGuard={details,concurrentSourceChangeRejected:true,partialInquiryWrites:0};
 });

 await check('색인 제거 음성 검증은 전체 스캔을 검출하고 새 migration 두 번 재실행은 모든 원문·사진·버전을 보존',async()=>{
  const lookup=trace.find(entry=>entry.sql.startsWith('SELECT id,body,revision FROM studio_projects WHERE id=? UNION ALL'));assert.ok(lookup);
  const original=snapshot();db.exec('DROP INDEX idx_studio_projects_site_code');const negative=plan(lookup);assert.ok(hasProjectScan(negative),negative.join('\n'));assert.ok(!hasCodeIndex(negative));
  db.exec(migration);db.exec(migration);assert.deepEqual(snapshot(),original);const restored=plan(lookup);assert.ok(hasCodeIndex(restored));assert.ok(!hasProjectScan(restored));
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'sync_studio_intake_%'").get().n,3);
  evidence.migration={replays:2,tablesPreserved:Object.keys(original).length,unchangedDataSha256:createHash('sha256').update(JSON.stringify(original)).digest('hex'),negativeWithoutIndexDetected:true,restoredIndex:true};
 });

 await check('D1 일일 한도: 로그인·기존 세션 모두 안전한 503 코드·재시도 시각, 일반 오류에는 한도 코드 없음',async()=>{
  const canary='private-token-canary-budget',logs=[],originalError=console.error;
  console.error=(...values)=>logs.push(values);
  try{
   const failures=[
    {route:'login',method:'POST',body:{login:'synthetic-budget-login',password:canary},message:"D1_ERROR: Your account has exceeded D1's free tier daily row read limit. "+canary,quota:true},
    {route:'changes',method:'GET',message:"D1_ERROR: Your account has exceeded D1's free tier daily row write limit. "+canary,quota:true},
    {route:'changes',method:'GET',message:'D1_ERROR: unexpected failure '+canary,quota:false},
   ];
   for(const failure of failures){
    const brokenDB={prepare(){throw Error(failure.message);},async batch(){throw Error(failure.message);}};
    const response=await handleCollaboration(new Request('https://budget.invalid/api/collaboration/'+failure.route,{method:failure.method,headers:{Cookie:cookies.get('budget-staff'),Origin:'https://budget.invalid',...(failure.body?{'Content-Type':'application/json'}:{})},body:failure.body?JSON.stringify(failure.body):undefined}),{DB:brokenDB},async()=> '');
    const data=await response.json();assert.equal(response.status,503);
    const printed=JSON.stringify({data,headers:[...response.headers],logs});assert.ok(!printed.includes(canary));assert.ok(!printed.includes(failure.message));assert.ok(!printed.includes(cookies.get('budget-staff')));
    if(failure.quota){assert.equal(data.code,'D1_DAILY_LIMIT');assert.match(data.error,/오전 9시/);const retry=Number(response.headers.get('Retry-After'));assert.ok(Number.isInteger(retry)&&retry>0&&retry<=86400);}
    else{assert.equal(data.code,undefined);assert.equal(response.headers.get('Retry-After'),null);}
   }
   assert.equal(logs.length,3);assert.deepEqual(logs.map(values=>values[1]),['D1_DAILY_LIMIT','D1_DAILY_LIMIT','Error']);
  }finally{console.error=originalError;}
  evidence.quotaErrors={actualHandlerInvocations:3,quotaResponses:2,generalResponses:1,retryAfterPositive:true,koreaResetTimeShown:true,credentialOrExceptionLeaks:0};
 });
}finally{
 await server.close();db.close();
 const destination=new URL('../../private-provisioning/qa-delivery127-20261014/',import.meta.url);mkdirSync(destination,{recursive:true});
 writeFileSync(new URL('intake-polling-budget127.json',destination),JSON.stringify({kind:'ACTUAL_SQLITE_API_AND_QUERY_PLAN',operatingWrites:0,externalRequests:0,PASS:results.filter(row=>row.status==='PASS').length,FAIL:results.filter(row=>row.status==='FAIL').length,results,evidence},null,2));
}
