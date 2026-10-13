import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {database} from './d1.mjs';

const before=process.argv.includes('--before');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/worklog-read.json';
const source=new URL('../../'+(before?'private-provisioning/original-before-worklog-read-20261006/':'')+'functions/lib/personal.ts',import.meta.url);
if(before)registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);return url===new URL('../../functions/lib/personal.ts',import.meta.url).href?{...loaded,source:readFileSync(source,'utf8')}:loaded;}});
const {handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts');
const {assignedItems}=await import('../src/utils/personalWork.ts');
const {db,DB}=database(),env={DB},cookies=new Map(),results=[];
const worker={id:'worker-a',name:'합성 작성 직원',no:101,department:'마감팀',position:'프로'};
const leader={id:'u_13',name:'합성 팀장',no:102,department:'마감팀',position:'수석'};
const chief={id:'u_12',name:'합성 실장',no:103,department:'마감팀',position:'실장'};
const other={id:'worker-b',name:'다른 합성 직원',no:104,department:'마감팀',position:'프로'};
const foreign={id:'u_25',name:'타팀 합성 팀장',no:105,department:'구조팀',position:'수석'};
const users=[worker,leader,chief,other,foreign];
const insertUser=db.prepare('INSERT OR REPLACE INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)');
function resetUsers(){for(const u of users)insertUser.run(u.id,u.id,u.id+'@example.invalid',u.name,u.department,u.position,JSON.stringify(u),'synthetic-unused','synthetic-unused');}
resetUsers();
for(const u of users){const token='synthetic-worklog-read-'+u.id;db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),u.id,Date.now()+3600000);cookies.set(u.id,'studio_session='+token);}
async function request(actor,path,method='GET',body){const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{...(actor?{Cookie:cookies.get(actor.id)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,async()=>{throw Error('Archive path is outside this test');});return {status:response.status,data:await response.json()};}
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r;};
const task=(role,reference,progress)=>({roleName:role,personId:reference,personIds:[reference],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'관리자 배정 원문',progress});
const project=(reference=worker.id)=>({id:'read-project',code:'QA-READ',name:'합성 열람 검수',department:'마감팀',startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',progress:55,roles:{},subTasks:{조적:task('조적',reference,30),창호:task('창호',other.id,80)}});
const row=id=>db.prepare('SELECT * FROM studio_worklogs WHERE id=?').get(id);
const inbox=()=>db.prepare('SELECT * FROM studio_notifications ORDER BY id').all();
const projects=()=>db.prepare('SELECT * FROM studio_projects ORDER BY id').all();
const version=key=>db.prepare('SELECT revision FROM studio_sync_versions WHERE key=?').get(key).revision;
const notices=id=>inbox().filter(n=>n.user_id===worker.id&&n.id.startsWith('worklog:'+encodeURIComponent(id)+':read:'));
const read=(actor,journal,revision=journal.serverRevision,method='POST')=>request(actor,'worklogs/'+encodeURIComponent(journal.id)+'/read',method,{revision});
const action=(actor,journal,step)=>request(actor,'worklogs/'+encodeURIComponent(journal.id)+'/'+step,'POST',{revision:journal.serverRevision});
async function draft(id='read-log',reference=worker.id){
 const p=project(reference);ok(await request(chief,'projects','POST',{project:p}));
 const item={...assignedItems(worker.id,'2026-10-06',[p],[worker.id,worker.name,String(worker.no)])[0],todayTask:'실제 수행 원문',progress:60,status:'진행중',reportHtml:'<p>실제 수행 원문</p>',tomorrowPlan:'익일 계획 원문',manualFields:['todayTask','progress','status','reportHtml','tomorrowPlan']};
 return ok(await request(worker,'worklogs/'+encodeURIComponent(id),'PUT',{log:{id,date:'2026-10-06',reportMode:'DAILY',items:[item],overallNotes:'종합 원문'}})).data.log;
}
async function submitted(id='read-log',reference=worker.id){return ok(await action(worker,await draft(id,reference),'submit')).data.log;}
async function reviewed(){return ok(await action(leader,await submitted(),'review')).data.log;}
async function check(name,fn){
 try{for(const table of ['studio_projects','studio_worklogs','studio_notifications'])db.prepare('DELETE FROM '+table).run();resetUsers();await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
 catch(error){results.push({name,status:'FAIL',reason:error.stack});console.log('FAIL',name,error.message);}
}
const batch=DB.batch;
async function race(change,fn){DB.batch=async statements=>{change();return batch(statements);};try{await fn();}finally{DB.batch=batch;}}
try{
 await check('상신 본문 열람은 해당 수신 알림만 읽음 처리하고 작성자에게 독자 이름을 알림, 본문·revision·서명·실적 불변',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeProjects=projects(),personalVersion=version('personal');
  db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').run('unrelated',leader.id,'meeting:other','관계없는 원문','2000-01-01T00:00:00Z');
  assert.deepEqual(ok(await read(leader,log)).data,{ok:true});assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(projects(),beforeProjects);assert.equal(version('personal'),personalVersion);
  assert.ok(inbox().find(n=>n.user_id===leader.id&&n.meeting_id==='worklog:'+log.id).read_at);assert.equal(inbox().find(n=>n.id==='unrelated').read_at,null);
  assert.equal(notices(log.id).length,1);assert.ok(notices(log.id)[0].message.includes(leader.name));assert.ok(notices(log.id)[0].message.includes('열람'));assert.equal(notices(log.id)[0].read_at,null);
 });
 await check('같은 독자의 중복 열람은 알림 1회·최초 읽음/생성 시각 및 inbox 버전 보존',async()=>{
  const log=await submitted();ok(await read(leader,log));const beforeInbox=inbox(),inboxVersion=version('inbox');ok(await read(leader,log));assert.deepEqual(inbox(),beforeInbox);assert.equal(version('inbox'),inboxVersion);
 });
 await check('일지 revision이 바뀌어도 같은 독자의 작성자 열람 알림은 한 건, 다른 독자는 별도 한 건',async()=>{
  let log=await submitted();ok(await read(leader,log));const first=notices(log.id)[0];log=ok(await action(leader,log,'review')).data.log;ok(await read(leader,log));ok(await read(chief,log));assert.equal(notices(log.id).length,2);assert.deepEqual(notices(log.id).find(n=>n.id===first.id),first);assert.ok(notices(log.id).some(n=>n.message.includes(chief.name)));assert.ok(inbox().find(n=>n.user_id===chief.id&&n.meeting_id==='worklog:'+log.id).read_at);
 });
 await check('기존 canRead 권한자는 수신 알림이 없어도 제출본 본문 열람을 기록',async()=>{
  const log=await submitted();assert.equal(inbox().filter(n=>n.user_id===chief.id).length,0);ok(await read(chief,log));assert.equal(notices(log.id).length,1);assert.ok(notices(log.id)[0].message.includes(chief.name));
 });
 await check('작성자 자기열람은 본인의 기존 검토 완료 알림·본문 모두 noop',async()=>{
  const log=await reviewed(),beforeInbox=inbox(),beforeRow=row(log.id),inboxVersion=version('inbox');assert.deepEqual(ok(await read(worker,log)).data,{ok:true});assert.deepEqual(inbox(),beforeInbox);assert.deepEqual(row(log.id),beforeRow);assert.equal(version('inbox'),inboxVersion);
 });
 await check('DRAFT의 권한 있는 타인 열람도 알림·본문 변경 없는 noop',async()=>{
  const log=await draft(),beforeRow=row(log.id),personalVersion=version('personal'),inboxVersion=version('inbox');ok(await read(leader,log));assert.deepEqual(row(log.id),beforeRow);assert.equal(inbox().length,0);assert.equal(version('personal'),personalVersion);assert.equal(version('inbox'),inboxVersion);
 });
 await check('타직원·타팀 결재자의 본문 열람은 403이며 알림과 본문을 보존',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeInbox=inbox();for(const actor of [other,foreign])ok(await read(actor,log),403);assert.deepEqual(inbox(),beforeInbox);assert.deepEqual(row(log.id),beforeRow);
 });
 await check('없는 일지·삭제된 일지 열람은 404이며 기존 알림을 보존',async()=>{
  const log=await submitted(),beforeInbox=inbox();ok(await read(leader,{...log,id:'missing'}),404);db.prepare('UPDATE studio_worklogs SET removed=1 WHERE id=?').run(log.id);ok(await read(leader,log),404);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('열었던 revision과 다른 수치·누락·문자열 revision은 409이며 원문과 알림을 보존',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeInbox=inbox();for(const revision of [log.serverRevision-1,null,String(log.serverRevision)])ok(await read(leader,log,revision),409);ok(await request(leader,'worklogs/'+log.id+'/read','POST',{}),409);assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('열람은 POST만 허용하고 GET·PUT·DELETE는 405로 거부',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeInbox=inbox();ok(await request(leader,'worklogs/'+log.id+'/read'),405);for(const method of ['PUT','DELETE'])ok(await read(leader,log,log.serverRevision,method),405);assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('일반 알림 읽음은 본문 열람을 증명하지 않으며 이후 실제 열람 API만 작성자 notice 생성',async()=>{
  const log=await submitted(),n=inbox().find(n=>n.user_id===leader.id);ok(await request(leader,'notifications/read','POST',{id:n.id}));assert.ok(inbox().find(item=>item.id===n.id).read_at);assert.equal(notices(log.id).length,0);ok(await read(leader,log));assert.equal(notices(log.id).length,1);
 });
 await check('열람 CAS 사이에 revision이 바뀌면 409와 읽음·작성자 알림 전체 취소',async()=>{
  const log=await submitted(),body=row(log.id).body,beforeInbox=inbox();await race(()=>db.prepare('UPDATE studio_worklogs SET revision=revision+1 WHERE id=?').run(log.id),async()=>ok(await read(leader,log),409));assert.equal(row(log.id).body,body);assert.equal(row(log.id).revision,log.serverRevision+1);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('열람 CAS 사이에 일지가 삭제되면 409와 읽음·작성자 알림 전체 취소',async()=>{
  const log=await submitted(),beforeInbox=inbox();await race(()=>db.prepare('UPDATE studio_worklogs SET removed=1 WHERE id=?').run(log.id),async()=>ok(await read(leader,log),409));assert.equal(row(log.id).removed,1);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('열람 batch의 후반 저장 실패는 앞선 읽음·작성자 notice·inbox 버전까지 원자적으로 되돌림',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeInbox=inbox(),inboxVersion=version('inbox');DB.batch=statements=>batch([...statements,DB.prepare('INSERT INTO studio_write_assertions VALUES (0)')]);try{ok(await read(leader,log),409);}finally{DB.batch=batch;}assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(inbox(),beforeInbox);assert.equal(version('inbox'),inboxVersion);
 });
 await check('작성자가 비활성이면 본문 열람은 가능하되 작성자 알림은 생성하지 않음',async()=>{
  const log=await submitted(),beforeRow=row(log.id);db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(worker.id);ok(await read(leader,log));assert.equal(notices(log.id).length,0);assert.ok(inbox().find(n=>n.user_id===leader.id).read_at);assert.deepEqual(row(log.id),beforeRow);
 });
 await check('구분자 포함 일지 ID도 원문 key로 수신 알림을 읽고 encoded 독자 key로 중복 방지',async()=>{
  const log=await submitted('qa:read/log?한글');ok(await read(leader,log));ok(await read(leader,log));assert.equal(notices(log.id).length,1);assert.equal(notices(log.id)[0].meeting_id,'worklog:'+log.id);assert.ok(inbox().find(n=>n.user_id===leader.id).read_at);
 });
 await check('로그인 없음·독자 비활성은 기존 세션 검증 401, 읽음·notice 생성 없음',async()=>{
  const log=await submitted(),beforeInbox=inbox();ok(await read(null,log),401);db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(leader.id);ok(await read(leader,log),401);assert.deepEqual(inbox(),beforeInbox);
 });
 for(const state of ['missing','inactive'])await check('상신 다음 고정 팀장 '+state+'는 친절한 409, DRAFT·미서명·원문·알림 보존',async()=>{
  const log=await draft(),beforeRow=row(log.id),beforeProjects=projects();if(state==='missing')db.prepare('DELETE FROM studio_users WHERE id=?').run(leader.id);else db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(leader.id);
  const r=ok(await action(worker,log,'submit'),409);assert.ok(r.data.error.includes('결재자'));assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(projects(),beforeProjects);assert.equal(inbox().length,0);
 });
 for(const state of ['missing','inactive'])await check('팀장 검토 다음 고정 실장 '+state+'는 친절한 409, 검토 전 원문·서명·알림 보존',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeInbox=inbox(),beforeProjects=projects();if(state==='missing')db.prepare('DELETE FROM studio_users WHERE id=?').run(chief.id);else db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(chief.id);
  const r=ok(await action(leader,log,'review'),409);assert.ok(r.data.error.includes('결재자'));assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(projects(),beforeProjects);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('상신 사전 확인 뒤 팀장 비활성 race는 CAS batch로 서명·상태·알림 전체 취소',async()=>{
  const log=await draft(),beforeRow=row(log.id),beforeProjects=projects();await race(()=>db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(leader.id),async()=>ok(await action(worker,log,'submit'),409));assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(projects(),beforeProjects);assert.equal(inbox().length,0);
 });
 await check('검토 사전 확인 뒤 실장 삭제 race는 CAS batch로 검토 서명·본문·알림 전체 취소',async()=>{
  const log=await submitted(),beforeRow=row(log.id),beforeProjects=projects(),beforeInbox=inbox();await race(()=>db.prepare('DELETE FROM studio_users WHERE id=?').run(chief.id),async()=>ok(await action(leader,log,'review'),409));assert.deepEqual(row(log.id),beforeRow);assert.deepEqual(projects(),beforeProjects);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('최종 승인 때 작성자 비활성은 승인 역사와 canonical 배정 실적 반영을 허용, 작성자 신규 알림만 제외',async()=>{
  const log=await reviewed(),beforeInbox=inbox();db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(worker.id);const final=ok(await action(chief,log,'approve')).data.log;assert.equal(final.approvalStatus,'APPROVED_FINAL');assert.equal(final.chiefApproval.approved,true);assert.equal(JSON.parse(projects()[0].body).subTasks.조적.progress,60);assert.deepEqual(inbox(),beforeInbox);
 });
 await check('사번 원작성자 상신→팀장 열람·검토→실장 열람·승인: 승인 시에만 기존 산출식으로 실제70% 반영',async()=>{
  let log=await submitted('raw-author-log',String(worker.no));const submittedBody=row(log.id).body;ok(await read(leader,log));assert.equal(row(log.id).body,submittedBody);assert.equal(JSON.parse(projects()[0].body).progress,55);log=ok(await action(leader,log,'review')).data.log;ok(await read(chief,log));assert.equal(JSON.parse(projects()[0].body).subTasks.조적.progress,30);log=ok(await action(chief,log,'approve')).data.log;
  const final=JSON.parse(projects()[0].body);assert.equal(final.subTasks.조적.progress,60);assert.equal(final.subTasks.조적.actualProgressDate,'2026-10-06');assert.equal(final.progress,70);assert.equal(final.endDate,'2026-10-08');assert.deepEqual(final.subTasks.조적.personIds,[String(worker.no)]);assert.equal(final.subTasks.조적.memo,'관리자 배정 원문');assert.equal(log.items[0].todayTask,'실제 수행 원문');assert.equal(log.items[0].tomorrowPlan,'익일 계획 원문');assert.equal(notices(log.id).length,2);const beforeRow=row(log.id);ok(await read(leader,log));assert.deepEqual(row(log.id),beforeRow);assert.equal(notices(log.id).length,2);
 });
}finally{DB.batch=batch;db.close();}
const report={mode:before?'protected-before':'current',sourceSHA256:createHash('sha256').update(readFileSync(source)).digest('hex'),passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:report.mode,passed:report.passed,failed:report.failed,output}));if(report.failed)process.exitCode=1;
