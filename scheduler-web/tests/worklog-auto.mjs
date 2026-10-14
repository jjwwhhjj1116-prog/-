import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {syncAutomaticWorklogs} from '../../functions/lib/automaticWorklogs.ts';

const results=[];
const noon=new Date('2026-10-14T03:00:00Z'),closing=new Date('2026-10-14T08:00:00Z');
function fixture({people=['worker'],alias=false}={}){
 const {db,DB}=database();
 for(const [id,position,active] of [['worker','프로',1],['other','프로',1],['inactive','프로',0],['u_13','팀장',1],['u_12','실장',1]]){
  const profile={id,name:'합성 '+id,department:'마감팀',position,no:id==='worker'?8801:undefined,active:active===1};
  db.prepare('INSERT INTO studio_users (id,login,email,name,department,position,profile,salt,password_hash,active) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,id,id+'@example.invalid',profile.name,profile.department,position,JSON.stringify(profile),'synthetic','unused',active);
 }
 const project={id:'auto-project',code:'QA-AUTO',name:'합성 자동 업무보고',department:'마감팀',pmId:'u_12',startDate:'2026-10-12',endDate:'2026-10-16',status:'진행중',roles:{},subTasks:{내부:{roleName:'내부',personIds:alias?['8801']:people,startDate:'2026-10-12',endDate:'2026-10-16',status:'예정',progress:18,memo:'도면 수량 검토',reportingMode:'DAILY'}}};
 const putProject=project=>db.prepare('INSERT INTO studio_projects (id,body,revision,updated_at,updated_by) VALUES (?,?,?,?,?)').run(project.id,JSON.stringify(project),1,'synthetic','u_12');putProject(project);
 const row=(id='worker',day='2026-10-14')=>db.prepare('SELECT * FROM studio_worklogs WHERE user_id=? AND day=? AND removed=0').get(id,day);
 const log=(id='worker',day='2026-10-14')=>{const record=row(id,day);return record&&{...JSON.parse(record.body),serverRevision:record.revision};};
 const run=(options={})=>syncAutomaticWorklogs({DB},{now:noon,onlyUserId:'worker',...options});
 return {db,DB,project,putProject,row,log,run};
}
async function test(name,fn){try{const observed=await fn();results.push({name,status:'PASS',observed});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message,observed:error.observed});console.error('FAIL',name,error.message);}}

await test('자동 초안: 실제 D1 저장·수요일 3/5일 60%·진행중·수행본문과 당일 배정 연결',async()=>{
 const q=fixture(),beforeProject=q.db.prepare('SELECT body FROM studio_projects WHERE id=?').get(q.project.id).body,result=await q.run(),log=q.log();assert.equal(result.day,'2026-10-14');assert.equal(result.created,1);assert.equal(log.approvalStatus,'DRAFT');assert.equal(log.items.length,1);const item=log.items[0];assert.equal(item.id,'gen-auto-project-내부');assert.equal(item.progress,60);assert.equal(item.status,'진행중');assert.equal(item.autoScheduleDate,'2026-10-14');assert.ok(item.todayTask.includes('일정 기준 자동 작성'));assert.equal(item.startDate,'2026-10-12');assert.equal(item.endDate,'2026-10-16');assert.equal(log.authorSignature.signed,false);assert.equal(log.serverRevision,1);assert.equal(q.db.prepare('SELECT body FROM studio_projects WHERE id=?').get(q.project.id).body,beforeProject,'자동 보고로 관리자 일정/승인 실적을 바꾸지 않는다');return {result,log};
});
await test('동일 자료 반복 실행: 시각만 달라져도 revision·body·공유 버전 증가 없이 건너뜀',async()=>{
 const q=fixture();await q.run();const before={...q.row()},versions=q.db.prepare('SELECT * FROM studio_sync_versions ORDER BY key').all();const result=await q.run({now:new Date('2026-10-14T03:05:00Z')});assert.equal(result.updated,0);assert.equal(result.created,0);assert.equal(result.submitted,0);assert.deepEqual({...q.row()},before);assert.deepEqual(q.db.prepare('SELECT * FROM studio_sync_versions ORDER BY key').all(),versions);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {result,revision:q.row().revision};
});
await test('수기 수정 보존: %·지연·본문·서식·익일계획·첨부·종합내용을 자동 작성이 덮지 않음',async()=>{
 const q=fixture();await q.run();const record=q.row(),old=JSON.parse(record.body),item=old.items[0];Object.assign(item,{progress:23,status:'지연',todayTask:'직접 작성한 산출 검토',reportHtml:'<b>직접 작성한 산출 검토</b>',tomorrowPlan:'도면 회신 확인',attachments:[{name:'합성 근거',url:'https://example.invalid/proof.png'}],dailyGoal:'직접 목표',manualFields:['progress','status','todayTask','reportHtml','tomorrowPlan','attachments','dailyGoal']});old.overallNotes='종합 수기 원문';q.db.prepare('UPDATE studio_worklogs SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(old),record.id);const result=await q.run({now:new Date('2026-10-14T03:10:00Z')}),saved=q.log();for(const key of item.manualFields)assert.deepEqual(saved.items[0][key],item[key],key+' 보존');assert.equal(saved.overallNotes,old.overallNotes);assert.equal(saved.items[0].autoScheduleDate,'2026-10-14');return {result,item:saved.items[0],notes:saved.overallNotes};
});
await test('직원 범위: 개인 번호 alias·활성 직원만 작성하고 onlyUserId가 다른 직원 저장을 차단',async()=>{
 const alias=fixture({alias:true});await alias.run();assert.equal(alias.log().items[0].roleName,'내부');const q=fixture({people:['worker','other','inactive']});await q.run();assert.ok(q.row('worker'));assert.equal(q.row('other'),undefined);assert.equal(q.row('inactive'),undefined);const all=await q.run({onlyUserId:undefined});assert.ok(q.row('other'));assert.equal(q.row('inactive'),undefined);return {alias:alias.log(),all,count:q.db.prepare('SELECT count(*) n FROM studio_worklogs').get().n};
});
await test('대상 일정 범위: 지난·미래·보관 프로젝트 제외하고 현재 배정만 생성',async()=>{
 const q=fixture();for(const [id,start,end,archived]of [['past','2026-10-01','2026-10-13',false],['future','2026-10-15','2026-10-30',false],['archive','2026-10-12','2026-10-16',true]]){const p={...structuredClone(q.project),id,code:'QA-'+id,startDate:start,endDate:end};p.subTasks.내부.startDate=start;p.subTasks.내부.endDate=end;q.putProject(p);if(archived)q.db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run(id,'synthetic','u_12');}await q.run();assert.deepEqual(q.log().items.map(item=>item.projectId),[q.project.id]);return {items:q.log().items};
});
await test('휴가·휴일: 종일 휴가는 보고 제외·반차는 보존·취소 휴가는 반영·주말/공휴일/9시 이전 제외',async()=>{
 for(const {kind,cancelled,expected}of [{kind:'연차',cancelled:0,expected:false},{kind:'휴가',cancelled:0,expected:false},{kind:'오전 반차',cancelled:0,expected:true},{kind:'연차',cancelled:1,expected:true}]){const q=fixture();q.db.prepare('INSERT INTO studio_leaves VALUES (?,?,?,?,?,?,?)').run('leave','worker','2026-10-14','2026-10-14',kind,1,cancelled);await q.run();assert.equal(!!q.row(),expected,kind+' cancelled='+cancelled);}
 for(const instant of ['2026-10-13T15:30:00Z','2026-10-17T03:00:00Z','2026-10-09T03:00:00Z','2026-10-13T23:59:00Z']){const q=fixture();const result=await q.run({now:new Date(instant)});assert.equal(q.db.prepare('SELECT count(*) n FROM studio_worklogs').get().n,0,instant);assert.equal(result.created,0);}return {fullLeave:false,halfLeave:true,cancelledLeave:true};
});
await test('한국 17시 자동 보고: 직전은 초안·정각에 팀장 상신·요청 알림 1건·프로젝트 실적 불변',async()=>{
 const q=fixture();const before=await q.run({now:new Date('2026-10-14T07:59:59Z')});assert.equal(before.submitted,0);assert.equal(q.log().approvalStatus,'DRAFT');const result=await q.run({now:closing}),log=q.log();assert.equal(result.submitted,1);assert.equal(log.approvalStatus,'SUBMITTED_LEADER');assert.equal(log.autoReportedAt,closing.toISOString());assert.equal(log.authorSignature.signed,true);assert.equal(log.leaderReview.approved,false);assert.equal(log.chiefApproval.approved,false);const notes=q.db.prepare('SELECT * FROM studio_notifications').all();assert.equal(notes.length,1);assert.equal(notes[0].user_id,'u_13');assert.equal(notes[0].meeting_id,'worklog:'+log.id);assert.ok(notes[0].message.includes('자동 업무보고'));assert.equal(JSON.parse(q.db.prepare('SELECT body FROM studio_projects WHERE id=?').get(q.project.id).body).subTasks.내부.progress,18);return {result,log,notification:notes[0]};
});
await test('자동 보고 멱등성: 두번째 17시 실행·중복 실행에도 상신/알림/body/revision 1회만 유지',async()=>{
 const q=fixture();await q.run({now:closing});const before={...q.row()},notes=q.db.prepare('SELECT * FROM studio_notifications').all();const result=await q.run({now:new Date('2026-10-14T08:05:00Z')});assert.equal(result.submitted,0);assert.deepEqual({...q.row()},before);assert.deepEqual(q.db.prepare('SELECT * FROM studio_notifications').all(),notes);const concurrent=fixture();const combined=await Promise.all([concurrent.run({now:closing}),concurrent.run({now:closing})]);assert.equal(concurrent.db.prepare('SELECT count(*) n FROM studio_worklogs').get().n,1);assert.equal(concurrent.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,1);assert.equal(combined.reduce((n,r)=>n+r.submitted,0),1);return {result,combined};
});
await test('submit=false와 결재선 없음: 오후 5시라도 초안 유지·활성 팀장 없으면 자동 상신 금지',async()=>{
 const q=fixture();await q.run({now:closing,submit:false});assert.equal(q.log().approvalStatus,'DRAFT');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('u_13');const before={...q.row()},result=await q.run({now:closing});assert.equal(result.submitted,0);assert.deepEqual({...q.row()},before);return {result};
});
await test('최종일 날짜 비율: 5/5일 100%·완료 보고 생성과 원 일정/진척률 독립 보존',async()=>{
 const q=fixture(),day='2026-10-16';await q.run({now:new Date(day+'T03:00:00Z')});const item=q.log('worker',day).items[0];assert.equal(item.progress,100);assert.equal(item.status,'완료');assert.equal(item.endDate,q.project.endDate);assert.equal(q.project.subTasks.내부.progress,18);return {item};
});
await test('CAS 충돌 보호: 동시 수기 변경이 있으면 자동 상신·알림을 함께 취소하고 수기 원문 유지',async()=>{
 const q=fixture();await q.run();const before=q.row(),updated=JSON.parse(before.body);updated.overallNotes='동시 다른 PC의 수기 변경';const batch=q.DB.batch;q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_worklogs SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(updated),before.id);return batch(statements);};const result=await q.run({now:closing});q.DB.batch=batch;assert.equal(result.conflicts,1);assert.equal(result.submitted,0);assert.equal(q.log().overallNotes,updated.overallNotes);assert.equal(q.log().approvalStatus,'DRAFT');assert.equal(q.row().revision,before.revision+1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {result,log:q.log()};
});
await test('동시 비활성 계정 보호: 생성 직전 계정이 닫히면 일지/알림을 함께 생성하지 않음',async()=>{
 const q=fixture(),batch=q.DB.batch;q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('worker');return batch(statements);};const result=await q.run({now:closing});assert.equal(result.conflicts,1);assert.equal(result.created,0);assert.equal(q.row(),undefined);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {result};
});
await test('동시 PM 배정 변경 보호: 저장 직전 본인 배정이 해제되면 과거 일정 보고와 알림 생성 차단',async()=>{
 const q=fixture(),batch=q.DB.batch,changed=structuredClone(q.project);changed.subTasks.내부.personIds=['other'];q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_projects SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(changed),q.project.id);return batch(statements);};const result=await q.run({now:closing});assert.equal(result.conflicts,1);assert.equal(result.created,0);assert.equal(result.submitted,0);assert.equal(q.row(),undefined);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {result};
});
await test('동시 보관·휴가·소속·팀장 변경 보호: 자동 보고 직전 업무·승인 범위가 바뀌면 쓰기를 함께 차단',async()=>{
 const observed=[];for(const mutation of ['archive','leave','department','leader']){const q=fixture(),batch=q.DB.batch;q.DB.batch=async statements=>{if(mutation==='archive')q.db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run(q.project.id,'synthetic','u_12');if(mutation==='leave')q.db.prepare('INSERT INTO studio_leaves VALUES (?,?,?,?,?,?,?)').run('late-leave','worker','2026-10-14','2026-10-14','연차',1,0);if(mutation==='department')q.db.prepare('UPDATE studio_users SET department=? WHERE id=?').run('구조팀','worker');if(mutation==='leader')q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('u_13');return batch(statements);};const result=await q.run({now:closing});assert.equal(result.conflicts,1,mutation);assert.equal(result.created,0,mutation);assert.equal(result.submitted,0,mutation);assert.equal(q.row(),undefined,mutation);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0,mutation);observed.push({mutation,result});}return observed;
});

const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
if(outputArg)writeFileSync(outputArg.slice('--output='.length),JSON.stringify({kind:'ACTUAL_AUTOMATIC_WORKLOG_FUNCTION_SQLITE_D1',externalRequests:0,productWrites:0,results,limits:['실제 서버 함수와 실제 메모리 SQLite/원본 migration을 실행한다. 운영 D1·Cloudflare 예약 작업·브라우저 검수와 구분한다.']},null,2)+'\n');
if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
