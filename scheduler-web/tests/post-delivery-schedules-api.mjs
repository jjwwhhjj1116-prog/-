import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createServer} from 'vite';
import {database} from './d1.mjs';
import {tokenHash} from '../../functions/lib/collaboration.ts';

// Actual Pages onRequest / cookie authentication / D1 transaction semantics; memory SQLite only.
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {onRequest}=await server.ssrLoadModule('../functions/api/[[route]].ts');
const checks=[];
async function fixture(){
 const {db,DB}=database(),cookies=new Map();
 const people=[['worker','마감팀','프로'],['peer','마감팀','프로'],['struct','구조팀','선임'],['civil','토목&조경팀','파트장'],['u_13','마감팀','수석'],['u_12','마감팀','실장'],['u_25','구조팀','팀장'],['u_24','구조팀','실장'],['u_8','기술본부 총괄','본부장'],['viet','마감팀','팀장','VIETQS'],['inactive','마감팀','프로','컨코스트',false],['mismatch','마감팀','프로'],['office','경영지원','실장'],['admin','개발 TF','실장']];
 for(const [id,department,position,company='컨코스트',active=true] of people){
  const profile={id:id==='mismatch'?'another':id,name:'합성 '+id,company,department,position,email:id==='admin'?'yjw@con-cost.com':id+'@example.invalid',role:id==='admin'?'ADMIN':'MEMBER'};
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,id,profile.email,profile.name,department,position,JSON.stringify(profile),'unused','unused',active?1:0);
  const token='synthetic-supplement-'+id;
  db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),id,Date.now()+600000);cookies.set(id,'studio_session='+token);
 }
 const legacy={id:'legacy',kind:'검토',startDate:'2026-10-16',endDate:'2026-10-17',memo:'기존 관리자 검토 일정',personIds:['peer'],status:'완료',progress:65,actualProgressDate:'2026-10-16'};
 const source={id:'pF',code:'QA-SHARED',name:'합성 한국어 현장',department:'마감팀',startDate:'2026-10-01',endDate:'2026-10-14',status:'납품',progress:100,subTasks:{조적:{personId:'worker',personIds:['worker'],startDate:'2026-10-01',endDate:'2026-10-14',status:'완료',progress:100}},roles:{},postDeliveryTasks:[legacy]};
 const projects=[source,{...structuredClone(source),id:'pS',department:'구조팀',endDate:'2026-10-15',postDeliveryTasks:[]},{...structuredClone(source),id:'fallback',code:'QA-FALLBACK',postDeliveryTasks:[]},{...structuredClone(source),id:'archived',code:'QA-ARCHIVE',postDeliveryTasks:[]}];
 for(const project of projects)db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run(project.id,JSON.stringify(project),1,'synthetic','admin');
 db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run('archived','synthetic','admin');
 const call=async(actor,route,method='GET',body,origin='https://qa.invalid')=>{
  const response=await onRequest({request:new Request('https://qa.invalid/api/collaboration/'+route,{method,headers:{...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{}),Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)}),env:{DB}});
  return {status:response.status,data:await response.json()};
 };
 const row=id=>db.prepare('SELECT * FROM studio_projects WHERE id=?').get(id);
 const project=id=>JSON.parse(row(id).body);
 const draft=(id='new',extra={})=>({id,revision:row('pF').revision,kind:'수정',startDate:'2026-10-15',endDate:'2026-10-19',memo:'합성 보완 작업',...extra});
 const create=(actor='worker',body=draft(),projectId='pF')=>call(actor,`projects/${projectId}/supplements`,'POST',body);
 const edit=(actor,result,extra={})=>call(actor,`projects/${result.project.id}/supplements/${result.task.id}`,'PUT',{revision:row(result.project.id).revision,taskRevision:result.task.revision,kind:result.task.kind,startDate:result.task.startDate,endDate:result.task.endDate,memo:result.task.memo,...extra});
 const cancel=(actor,result,extra={})=>call(actor,`projects/${result.project.id}/supplements/${result.task.id}/cancel`,'POST',{revision:row(result.project.id).revision,taskRevision:result.task.revision,...extra});
 const notes=()=>db.prepare('SELECT * FROM studio_notifications ORDER BY id').all();
 return {db,DB,call,row,project,draft,create,edit,cancel,notes,legacy,source};
}
async function check(name,run){const q=await fixture();try{await run(q);checks.push({name,status:'PASS'});console.log('PASS',name);}catch(error){checks.push({name,status:'FAIL',error:error.stack});console.error('FAIL',name,error.stack);process.exitCode=1;}finally{q.db.close();}}
try{
 await check('현장 code 중복 통합 · 본인팀 record 우선 · 국내 등록 capability',async q=>{
  const finish=await q.call('worker','post-delivery-schedules'),structure=await q.call('struct','post-delivery-schedules');assert.equal(finish.status,200);assert.equal(finish.data.projects.length,2);assert.equal(finish.data.projects.find(p=>p.projectCode==='QA-SHARED').projectId,'pF');assert.equal(structure.data.projects.find(p=>p.projectCode==='QA-SHARED').projectId,'pS');assert.deepEqual(finish.data.capabilities,{canRegister:true,department:'마감팀',userId:'worker'});assert.equal(finish.data.projects.find(p=>p.projectId==='pF').tasks[0].canEdit,false);
 });
 await check('신규 보완은 납품 상태 또는 실적100 현장만 허용 · 과거 납기와 미래 납기만으로 납품 간주 금지',async q=>{
  for(const [index,status,progress,endDate,expected]of [[0,'진행중',25,'2026-10-14',409],[1,'착수예정',0,'2026-10-31',409],[2,'납품',0,'2026-10-14',200],[3,'수정',100,'2026-10-31',200]]){
   const project=q.project('pF');Object.assign(project,{status,progress,endDate});q.db.prepare('UPDATE studio_projects SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(project),'pF');
   const result=await q.create('worker',q.draft('eligibility-'+index,{startDate:'2026-10-31',endDate:'2026-11-02'}));assert.equal(result.status,expected,result.data.error);if(expected===409)assert.match(result.data.error,/납품/);
   const listed=(await q.call('worker','post-delivery-schedules')).data.projects.find(project=>project.projectId==='pF');assert.equal(listed.delivered,expected===200,status+' '+progress);assert.ok(listed.tasks.some(task=>task.id==='legacy'),'미납품 현장 기존 일정도 조회 유지');
  }
  assert.equal(q.notes().length,4);
 });
 await check('공통 현장 신규 납품 판정은 실제 본인팀 저장 target 기준 · 타팀 경로로 미납품 우회 불가',async q=>{
  const structure=q.project('pS');structure.status='진행중';structure.progress=20;q.db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(structure),'pS');
  const forFinish=(await q.call('worker','post-delivery-schedules')).data.projects.find(project=>project.projectCode==='QA-SHARED'),forStructure=(await q.call('struct','post-delivery-schedules')).data.projects.find(project=>project.projectCode==='QA-SHARED');assert.equal(forFinish.delivered,true);assert.equal(forStructure.delivered,false);assert.equal((await q.create('struct',q.draft('blocked'))).status,409);assert.equal(q.notes().length,0);
  structure.status='납품';q.db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(structure),'pS');const finish=q.project('pF');finish.status='진행중';finish.progress=0;q.db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(finish),'pF');
  const registered=await q.create('struct',q.draft('own-delivered'));assert.equal(registered.status,200,registered.data.error);assert.equal(registered.data.project.id,'pS');assert.equal(registered.data.task.department,'구조팀');
 });
 await check('납품 상태가 변경돼도 기존 본인 보고 조회·수정·취소 및 정확 ID 재시도 보존',async q=>{
  const body=q.draft(),created=(await q.create('worker',body)).data,project=q.project('pF');project.status='진행중';project.progress=0;q.db.prepare('UPDATE studio_projects SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(project),'pF');
  const listed=(await q.call('worker','post-delivery-schedules')).data.projects.find(project=>project.projectId==='pF');assert.equal(listed.delivered,false);assert.equal(listed.tasks.find(task=>task.id==='new').canEdit,true);assert.equal(listed.tasks.find(task=>task.id==='new').canCancel,true);
  const retry=await q.create('worker',body);assert.equal(retry.status,200,retry.data.error);assert.deepEqual(retry.data.task,created.task);assert.equal(q.notes().length,2);assert.equal((await q.create('worker',q.draft('another'))).status,409);
  const edited=await q.edit('worker',created,{memo:'기존 보완 본인 수정'});assert.equal(edited.status,200,edited.data.error);const cancelled=await q.cancel('worker',edited.data);assert.equal(cancelled.status,200,cancelled.data.error);assert.equal(cancelled.data.task.submissionStatus,'CANCELLED');assert.equal(q.notes().length,6);assert.deepEqual(q.project('pF').postDeliveryTasks[0],q.legacy);
 });
 await check('빈 코드 현장은 ID 원문별 분리 · 공백/대소문자 ID와 공종이 같은 현장도 합치지 않음',async q=>{
  for(const id of ['blank','BLANK',' blank ']){const p={...structuredClone(q.source),id,code:'   ',postDeliveryTasks:[]};q.db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run(id,JSON.stringify(p),1,'synthetic','admin');}
  const response=await q.call('worker','post-delivery-schedules');assert.equal(response.data.projects.length,5);for(const id of ['blank','BLANK',' blank '])assert.ok(response.data.projects.some(project=>project.projectId===id));
  const written=await q.create('worker',q.draft('blank-task'),'blank');assert.equal(written.status,200,written.data.error);assert.equal(written.data.project.id,'blank');assert.equal(q.project('BLANK').postDeliveryTasks.length,0);assert.equal(q.project(' blank ').postDeliveryTasks.length,0);
 });
 await check('일반 국내 직원 본인 등록 즉시 확정 · 정확한 수신자 · 원 납품/legacy 완전 보존',async q=>{
  const result=await q.create();assert.equal(result.status,200,result.data.error);const {task,project}=result.data;assert.equal(task.submissionStatus,'REPORTED');assert.deepEqual(task.personIds,['worker']);assert.equal(task.createdBy,'worker');assert.equal(task.createdByName,'합성 worker');assert.equal(task.department,'마감팀');assert.equal(task.revision,1);assert.deepEqual(task.reviewerIds,['u_13','u_12']);assert.equal(task.approvalStatus,undefined);assert.equal(result.data.projectRevision,2);
  for(const key of ['startDate','endDate','status','progress','subTasks','roles'])assert.deepEqual(project[key],q.source[key]);assert.deepEqual(project.postDeliveryTasks[0],q.legacy);
  assert.deepEqual(q.notes().map(n=>n.user_id).sort(),['u_12','u_13']);for(const note of q.notes()){assert.equal(note.meeting_id,'supplement:pF:new');assert.equal(note.id,`supplement-report:new:r1:${note.user_id}`);assert.ok(note.message.includes('등록'));}
  const taskView=(await q.call('worker','post-delivery-schedules')).data.projects.find(p=>p.projectId==='pF').tasks.find(t=>t.id==='new');assert.equal(taskView.projectRevision,2);assert.equal(taskView.deliveryDate,'2026-10-14');assert.equal(taskView.canEdit,true);assert.equal(taskView.canCancel,true);
 });
 await check('외국팀 경로 요청은 본인팀 record에 재해석 · 본인팀 record 없으면 현장에 별도 국내팀 저장',async q=>{
  const structural=await q.create('struct',q.draft('structure',{startDate:'2026-10-15'}));assert.equal(structural.status,200,structural.data.error);assert.equal(structural.data.project.id,'pS');assert.equal(q.project('pF').postDeliveryTasks.length,1);assert.equal(structural.data.task.department,'구조팀');assert.deepEqual(structural.data.task.reviewerIds,['u_25','u_24']);
  const civil=await q.create('civil',q.draft('civil'), 'fallback');assert.equal(civil.status,200,civil.data.error);assert.equal(civil.data.project.id,'fallback');assert.equal(civil.data.project.department,'마감팀');assert.equal(civil.data.task.department,'토목&조경팀');assert.deepEqual(civil.data.task.reviewerIds,['u_8']);
 });
 await check('익명/비활성/비canonical/VIETQS/경영지원 등록 차단 · 타출처와 미지원 승인 route',async q=>{
  for(const actor of ['anonymous','inactive'])assert.equal((await q.create(actor)).status,401);
  for(const actor of ['mismatch','viet','office','admin'])assert.equal((await q.create(actor)).status,403);
  for(const actor of ['viet','office'])assert.equal((await q.call(actor,'post-delivery-schedules')).data.capabilities.canRegister,false);
  assert.equal((await q.call('worker','projects/pF/supplements','POST',q.draft(),'https://foreign.invalid')).status,403);
  assert.equal((await q.call('worker','projects/pF/supplements/new/approve','POST',{})).status,404);assert.equal((await q.call('worker','projects/pF/supplements/new/reject','POST',{})).status,404);assert.equal(q.notes().length,0);
 });
 await check('날짜·납품일·memo·요청 형태·서버 메타 주입은 저장 거부',async q=>{
  for(const extra of [{startDate:'2026-10-13'},{startDate:'2026-10-32'},{startDate:'2026-10-20'},{endDate:'bad'},{kind:'보완'},{memo:''},{memo:'x'.repeat(501)},{personIds:['peer']},{createdBy:'peer'},{progress:100},{submissionStatus:'CANCELLED'},{department:'구조팀'},{reviewerIds:['viet']}])assert.equal((await q.create('worker',q.draft('invalid',extra))).status,400,JSON.stringify(extra));
  for(const body of [null,[],3])assert.equal((await q.create('worker',body)).status,400);
  const sameDay=await q.create('worker',q.draft('same-day',{startDate:'2026-10-14',endDate:'2026-10-14'}));assert.equal(sameDay.status,200);assert.equal(q.notes().length,2);
 });
 await check('정확한 client id 재시도는 중복 등록·상신 0 · 내용 또는 작성자 다르면409',async q=>{
  const body=q.draft(),first=await q.create('worker',body),again=await q.create('worker',body);assert.equal(first.status,200);assert.equal(again.status,200);assert.deepEqual(again.data.task,first.data.task);assert.equal(q.row('pF').revision,2);assert.equal(q.notes().length,2);
  assert.equal((await q.create('worker',{...body,memo:'다른 내용'})).status,409);assert.equal((await q.create('peer',body)).status,409);
  assert.equal((await q.create('worker',body,'fallback')).status,409);
 });
 await check('본인 수정 즉시 재보고 · ID/진척 이력 보존 · 타인과 legacy 변경 금지',async q=>{
  const registered=(await q.create()).data;const p=q.project('pF');Object.assign(p.postDeliveryTasks[1],{progress:45,actualProgressDate:'2026-10-16',status:'진행중'});q.db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(p),'pF');
  assert.equal((await q.edit('peer',registered,{memo:'타인 수정'})).status,403);
  const edited=await q.edit('worker',registered,{memo:'본인 수정 내용',endDate:'2026-10-20'});assert.equal(edited.status,200,edited.data.error);assert.equal(edited.data.task.id,'new');assert.equal(edited.data.task.revision,2);assert.equal(edited.data.task.progress,45);assert.equal(edited.data.task.actualProgressDate,'2026-10-16');assert.equal(edited.data.task.status,'진행중');assert.equal(edited.data.task.submissionStatus,'REPORTED');assert.equal(q.notes().length,4);
  assert.equal((await q.edit('worker',edited.data,{startDate:'2026-10-17'})).status,409);assert.equal((await q.edit('worker',edited.data,{endDate:'2026-10-15'})).status,409);
  assert.equal((await q.call('peer','projects/pF/supplements/legacy','PUT',{revision:q.row('pF').revision,taskRevision:1,startDate:'2026-10-16',endDate:'2026-10-17',memo:'legacy'})).status,403);
 });
 await check('본인 취소는 원문·진척·ID 보존 · 수신자 재보고 · 이중 취소와 수정 불가',async q=>{
  const created=(await q.create()).data;const historical=JSON.stringify({id:'historical',userId:'worker',date:'2026-10-15',approvalStatus:'APPROVED_FINAL',items:[{id:'gen-pF-followup-new',projectId:'pF',roleName:'납품 후 수정',todayTask:'이미 승인된 수행 원문',progress:37}],overallNotes:'취소해도 보존할 승인 이력'});q.db.prepare('INSERT INTO studio_worklogs VALUES (?,?,?,?,?,?,?)').run('historical','worker','2026-10-15','마감팀',historical,3,0);
  assert.equal((await q.cancel('peer',created)).status,403);const cancelled=await q.cancel('worker',created);assert.equal(cancelled.status,200,cancelled.data.error);assert.equal(cancelled.data.task.submissionStatus,'CANCELLED');assert.equal(cancelled.data.task.memo,created.task.memo);assert.equal(cancelled.data.task.id,created.task.id);assert.equal(cancelled.data.task.revision,2);assert.ok(cancelled.data.task.cancelledAt);assert.equal(q.project('pF').postDeliveryTasks.length,2);assert.equal(q.notes().length,4);assert.equal(q.db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('historical').body,historical);assert.equal(q.db.prepare('SELECT revision FROM studio_worklogs WHERE id=?').get('historical').revision,3);
  assert.equal((await q.cancel('worker',cancelled.data)).status,409);assert.equal((await q.edit('worker',cancelled.data)).status,409);assert.equal((await q.create('worker',q.draft())).status,409);const task=(await q.call('worker','post-delivery-schedules')).data.projects.find(p=>p.projectId==='pF').tasks.find(t=>t.id==='new');assert.equal(task.canEdit,false);assert.equal(task.canCancel,false);
 });
 await check('프로젝트 CAS와 task revision 충돌은 보고·본문 미변경',async q=>{
  assert.equal((await q.create('worker',q.draft('stale',{revision:0}))).status,409);assert.equal(q.notes().length,0);const created=(await q.create()).data;const before=q.row('pF').body;
  assert.equal((await q.edit('worker',created,{taskRevision:99})).status,409);assert.equal(q.row('pF').body,before);assert.equal(q.notes().length,2);
 });
 await check('저장직전 프로젝트/계정/수신자/아카이브 경쟁은 D1 batch 전체 롤백',async q=>{
  const batch=q.DB.batch;
  for(const mutate of [()=>q.db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run('pF'),()=>q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('worker'),()=>q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('u_12'),()=>q.db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run('pF','synthetic','admin')]){
   const original=q.row('pF');q.DB.batch=async statements=>{mutate();return batch(statements);};assert.equal((await q.create('worker',q.draft('race'))).status,409);assert.equal(q.project('pF').postDeliveryTasks.length,1);assert.equal(q.notes().length,0);q.DB.batch=batch;
   q.db.prepare('UPDATE studio_projects SET body=?,revision=? WHERE id=?').run(original.body,original.revision,'pF');q.db.prepare('UPDATE studio_users SET active=1 WHERE id IN (?,?)').run('worker','u_12');q.db.prepare('DELETE FROM studio_project_archive WHERE project_id=?').run('pF');
  }
 });
 await check('활성 국내 보고 수신자 없으면409 · archived 현장 등록불가 · 100개 제한',async q=>{
  q.db.prepare('UPDATE studio_users SET active=0 WHERE id IN (?,?)').run('u_12','u_13');assert.equal((await q.create()).status,409);assert.equal(q.notes().length,0);q.db.prepare('UPDATE studio_users SET active=1 WHERE id IN (?,?)').run('u_12','u_13');assert.equal((await q.create('worker',q.draft(),'archived')).status,404);
  const p=q.project('pF');p.postDeliveryTasks=Array.from({length:100},(_,i)=>({...q.legacy,id:'legacy-'+i}));q.db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(p),'pF');assert.equal((await q.create()).status,409);
 });
 await check('일반 프로젝트 POST 메타 위조/수정/삭제 차단 · 기존 legacy 관리자 편집 보존',async q=>{
  const created=(await q.create()).data,base=q.project('pF');
  for(const change of [p=>p.postDeliveryTasks[1].memo='우회',p=>p.postDeliveryTasks.pop(),p=>p.postDeliveryTasks[0].createdBy='worker',p=>p.postDeliveryTasks.push({...created.task,id:'forged'})]){
   const next=structuredClone(base);change(next);assert.equal((await q.call('admin','projects','POST',{base,project:next})).status,403);assert.deepEqual(q.project('pF'),base);
  }
  const legacy=structuredClone(base);legacy.postDeliveryTasks[0].memo='관리자 기존 검토 수정';const result=await q.call('admin','projects','POST',{base,project:legacy});assert.equal(result.status,200,result.data.error);assert.equal(result.data.project.postDeliveryTasks[0].memo,'관리자 기존 검토 수정');assert.deepEqual(result.data.project.postDeliveryTasks[1],created.task);
  const forged={...structuredClone(q.source),id:'new-forged',code:'NEW-FORGED',postDeliveryTasks:[created.task]};assert.equal((await q.call('admin','projects','POST',{project:forged})).status,403);
 });
}finally{
 await server.close();const index=process.argv.indexOf('--output');if(index!==-1){const file=resolve(process.argv[index+1]);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify({kind:'ACTUAL_PAGES_ONREQUEST_MEMORY_SQLITE',status:checks.some(row=>row.status==='FAIL')?'FAIL':'PASS',checks,operatingWrites:0,externalRequests:0},null,2)+'\n');}
}
