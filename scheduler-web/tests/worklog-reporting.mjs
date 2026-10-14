import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash} from '../../functions/lib/collaboration.ts';
import {assignedItems,assignedTasks,reconcileItems,reportsActualProgress,legacyAllocationTask} from '../src/utils/personalWork.ts';
import * as personalWork from '../src/utils/personalWork.ts';
import {filterWorkLogHistory,assignmentDeadline,proposedProgress} from '../src/utils/workLogReporting.ts';
import {projectScheduleRange,projectProgress,workDays} from '../src/utils/scheduleProgress.ts';
const {db,DB}=database(),cookies={};
for(const [id,position] of [['u_12','실장'],['u_13','수석'],['worker','프로'],['other','프로']]){
 const profile={id,name:id,position,department:'마감팀',email:id+'@example.invalid'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,id,profile.department,position,JSON.stringify(profile),'qa',await passwordHash('test-password','qa'));
}
async function req(actor,route,method='GET',body){const r=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+route,{method,headers:{Cookie:cookies[actor]||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB},async()=> ''),result={status:r.status,data:await r.json(),response:r};if(method==='POST'&&route.endsWith('/approve')&&result.status===200&&result.data.request?.status==='PENDING'&&result.data.request.approvalStage==='TEAM')return req(actor,route,method,{...body,revision:result.data.revision});return result;}
for(const id of ['u_12','u_13','worker','other']){const r=await req(id,'login','POST',{login:id,password:'test-password'});cookies[id]=r.response.headers.get('set-cookie').split(';')[0];}
async function test(name,fn){if(process.argv.includes('--only-approved-source')&&!name.startsWith('현재 Task 승인 실적'))return;if(process.argv.includes('--only-approved-caption')&&!name.startsWith('배정 변경 후'))return;await fn();console.log('PASS',name);}
// The assigned PM is also the team chief in these retained-report fixtures; approve executes both stages.
const p={id:'report-test',code:'REPORT-QA',name:'합성 업무보고',department:'마감팀',pmId:'u_12',startDate:'2026-10-01',endDate:'2026-10-02',status:'진행중',progress:80,roles:{},subTasks:{내부:{roleName:'내부',personIds:['worker','other'],personId:'worker',startDate:'2026-10-01',endDate:'2026-10-02',status:'진행중',memo:'관리자 계획 원문',progress:20,reportingModes:{worker:'TASK',other:'DAILY'}},외부:{roleName:'외부',personIds:['worker'],startDate:'2026-10-06',endDate:'2026-10-07',status:'진행중',memo:'다른 배정',progress:80}}};
const get=async()=> (await req('worker','projects')).data.projects.find(r=>r.project.id===p.id);
if(!process.argv.includes('--only-approved-caption')){
await test('관리자 직원별 보고 지정, 직원 직접 일정/보고 방식 변경 거부',async()=>{
 assert.equal((await req('u_12','projects','POST',{project:p})).status,200);
 assert.equal((await req('worker','projects','POST',{project:p})).status,403);
 assert.equal(assignedTasks('worker',[p])[0].reportingMode,'TASK');assert.equal(assignedTasks('other',[p])[0].reportingMode,'DAILY');
 const forged=assignedTasks('worker',[p])[0];forged.reportBasis='DAILY';assert.equal((await req('worker','worklogs/forged','PUT',{log:{id:'forged',date:'2026-10-01',items:[forged]}})).status,409);
});
let journal;
await test('기한 초과 Task 보고와 일자 계획은 같은 일지에 저장, 중복 일지 거부',async()=>{
 const task={...assignedTasks('worker',[p])[0],todayTask:'실제 산출 완료 부분',progress:37,workHours:2.5,remainingTask:'남은 동',delayReason:'새 도면',blockers:'도면 확인 대기',manualFields:['todayTask','progress','workHours','remainingTask','delayReason','blockers']};
 const daily={...assignedItems('worker','2026-10-06',[p])[0],dailyGoal:'외부 오늘 목표',plannedDetails:'검토 계획',planStartedAt:'2026-10-06T00:00:00Z',manualFields:['dailyGoal','plannedDetails','planStartedAt']};
 const saved=await req('worker','worklogs/same-day','PUT',{log:{id:'same-day',date:'2026-10-06',items:[task,daily],reportMode:'TASK',overallNotes:'원문'}});assert.equal(saved.status,200);journal=saved.data.log;
 assert.equal(journal.items.length,2);assert.equal(journal.items.find(i=>i.roleName==='내부').scheduleRemoved,false);assert.equal(journal.items.find(i=>i.roleName==='내부').remainingTask,'남은 동');
 assert.equal((await req('worker','worklogs/duplicate-day','PUT',{log:{...journal,id:'duplicate-day',reportMode:'DAILY'}})).status,409);
 const current=(await get()).project;assert.equal(current.subTasks.내부.progress,20);assert.equal(current.subTasks.내부.endDate,'2026-10-02');
 const predicted=proposedProgress(current,journal.items,journal.date,'worker');assert.ok(predicted>37&&predicted<80);assert.equal(current.subTasks.내부.progress,20);
});
await test('최종 승인만 실제 반영, 미입력 자동 행 기존 실적 보존, 승인 일지 불변',async()=>{
 let r=await req('worker','worklogs/same-day/submit','POST',{revision:journal.serverRevision});assert.equal(r.status,200);journal=r.data.log;
 r=await req('u_13','worklogs/same-day/review','POST',{revision:journal.serverRevision});assert.equal(r.status,200);journal=r.data.log;
 r=await req('u_12','worklogs/same-day/approve','POST',{revision:journal.serverRevision});assert.equal(r.status,200);journal=r.data.log;
 const current=(await get()).project;assert.equal(current.subTasks.내부.progress,37);assert.equal(current.subTasks.외부.progress,80);assert.equal(current.subTasks.내부.memo,p.subTasks.내부.memo);assert.equal(current.endDate,p.endDate);
 assert.equal((await req('worker','worklogs/same-day','PUT',{log:journal,revision:journal.serverRevision})).status,409);
});
let extension;
await test('연장 요청은 계획/실적/승인 일지를 그대로 유지하고 팀 관리자에게 알림',async()=>{
 const before=(await get()).project;
 const r=await req('worker',`projects/${p.id}/extensions`,'POST',{taskId:`gen-${p.id}-내부`,previousEnd:'2026-10-02',requestedEnd:'2026-10-09',reason:'새 도면 검토 후 완료'});assert.equal(r.status,200);extension=r.data.request;
 assert.deepEqual(r.data.project.subTasks,before.subTasks);assert.equal(r.data.project.endDate,p.endDate);
 assert.equal((await req('worker',`projects/${p.id}/extensions`,'POST',{taskId:extension.taskId,previousEnd:extension.previousEnd,requestedEnd:'2026-10-12',reason:'중복'})).status,409);
 assert.ok((await req('u_12','notifications')).data.notifications.some(n=>n.meeting_id===`extension:${p.id}`));
 assert.equal((await req('u_13','notifications')).data.notifications.some(n=>n.meeting_id===`extension:${p.id}`),false,'PM 검토 전에는 팀장 최종 승인 요청을 보내지 않는다');
 assert.equal((await req('other',`projects/${p.id}/extensions/${extension.id}/approve`,'POST',{revision:r.data.revision})).status,403);
});
await test('연장 승인 후 공종/캘린더/할 일 갱신, 원 납품일과 승인 이력 보존',async()=>{
 const before=await get(),body=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('same-day').body;
 assert.equal((await req('u_12',`projects/${p.id}/extensions/${extension.id}/approve`,'POST',{revision:before.revision-1})).status,409);
 const r=await req('u_12',`projects/${p.id}/extensions/${extension.id}/approve`,'POST',{revision:before.revision,memo:'도면 변경 확인'});assert.equal(r.status,200);
 assert.equal(r.data.project.subTasks.내부.endDate,'2026-10-09');assert.equal(r.data.project.roles.내부?.endDate,'2026-10-09');assert.equal(r.data.project.endDate,p.endDate);
 extension={...r.data.request,taskId:r.data.request.appliedTaskId||r.data.request.taskId};assert.equal(projectScheduleRange(r.data.project).end,'2026-10-09');assert.equal(assignedItems('worker','2026-10-08',[r.data.project])[0].id,extension.taskId);assert.equal(assignedItems('other','2026-10-08',[r.data.project]).length,0);
 assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('same-day').body,body);
 assert.ok((await req('worker','notifications')).data.notifications.some(n=>n.message.includes('연장 승인')));
 assert.ok((await req('u_13','notifications')).data.notifications.some(n=>n.meeting_id===`extension:${p.id}`));
 assert.equal((await req('u_12',`projects/${p.id}/extensions/${extension.id}/approve`,'POST',{revision:r.data.revision})).status,409);
});
await test('다른 일정 편집은 연장 이력을 삭제·위조하지 않음, stale 승인/배정 해제 차단',async()=>{
 let current=await get(),next=structuredClone(current.project);next.subTasks.외부.memo='정상 일정 편집';delete next.scheduleExtensions;
 let r=await req('u_12','projects','POST',{base:current.project,project:next});assert.equal(r.status,200);assert.equal(r.data.project.scheduleExtensions[0].status,'APPROVED');
 current=await get();r=await req('worker',`projects/${p.id}/extensions`,'POST',{taskId:extension.taskId,previousEnd:'2026-10-09',requestedEnd:'2026-10-12',reason:'추가 검토'});assert.equal(r.status,200);const pending=r.data.request;
 current=await get();next=structuredClone(current.project);next.subTasks.내부.allocations.find(a=>a.id===extension.appliedAllocationId).personIds=['other'];assert.equal((await req('u_12','projects','POST',{base:current.project,project:next})).status,200);
 current=await get();assert.equal((await req('u_12',`projects/${p.id}/extensions/${pending.id}/approve`,'POST',{revision:current.revision})).status,409);
 assert.equal((await req('u_12',`projects/${p.id}/extensions/${pending.id}/reject`,'POST',{revision:current.revision,memo:'담당 변경'})).status,200);
 const final=(await get()).project;assert.equal(final.subTasks.내부.endDate,'2026-10-09');assert.equal(final.scheduleExtensions.at(-1).status,'REJECTED');
 const checked=reconcileItems([{...assignedTasks('other',[p])[0],projectId:'forged',manualFields:['projectId','progress'],progress:10}],assignedTasks('other',[p]));assert.equal(checked[0].projectId,p.id);
});
await test('이력 필터·기한 상태 및 입력 경계 검증',async()=>{
 assert.equal(filterWorkLogHistory([journal],{projectId:p.id,query:'도면',status:'APPROVED',start:'2026-10-01',end:'2026-10-31',oldest:false}).length,1);
 assert.equal(assignmentDeadline(assignedTasks('other',[p])[0],'2026-10-06'),'기한 초과');
 const bad={...assignedItems('worker','2026-10-06',[p])[0],workHours:25};assert.equal((await req('worker','worklogs/bad-input','PUT',{log:{id:'bad-input',date:'2026-10-07',items:[bad]}})).status,400);
 assert.equal((await req('worker',`projects/${p.id}/extensions`,'POST',{taskId:'someone-else',previousEnd:'2026-10-09',requestedEnd:'2026-10-12',reason:'위조'})).status,403);
});
await test('동시 연장 승인 충돌은 일정·요청 상태·알림을 함께 취소',async()=>{
 let current=await get();const request=await req('other',`projects/${p.id}/extensions`,'POST',{taskId:extension.taskId,previousEnd:'2026-10-09',requestedEnd:'2026-10-13',reason:'동시 변경 검수'});assert.equal(request.status,200);
 current=await get();const before=structuredClone(current.project),notifications=db.prepare('SELECT count(*) n FROM studio_notifications').get().n;
 const batch=DB.batch;DB.batch=async statements=>{db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(p.id);return batch(statements);};
 try{assert.equal((await req('u_12',`projects/${p.id}/extensions/${request.data.request.id}/approve`,'POST',{revision:current.revision})).status,409);}finally{DB.batch=batch;}
 assert.deepEqual((await get()).project,before);assert.equal(db.prepare('SELECT count(*) n FROM studio_notifications').get().n,notifications);
});
await test('일일 계획만 저장된 새 보고는 실적 없이 상신하지 않음',async()=>{
 const p2={...structuredClone(p),id:'daily-plan-only',subTasks:{외부:{...p.subTasks.외부,personIds:['worker']}}};assert.equal((await req('u_12','projects','POST',{project:p2})).status,200);
 const r=await req('worker','worklogs/daily-plan','PUT',{log:{id:'daily-plan',date:'2026-10-07',reportMode:'DAILY',items:assignedItems('worker','2026-10-07',[p2])}});assert.equal(r.status,200);
 assert.equal((await req('worker','worklogs/daily-plan/submit','POST',{revision:r.data.log.serverRevision})).status,400);
});
await test('납품 후 Task 수정 보고의 완료는 수정 일정에만 반영',async()=>{
 const follow={id:'follow-task',kind:'수정',startDate:'2026-10-06',endDate:'2026-10-07',memo:'추가 도면',personIds:['worker'],status:'예정',reportingMode:'TASK'};
 const fp={...structuredClone(p),id:'follow-task-project',subTasks:{},postDeliveryTasks:[follow],progress:55};assert.equal((await req('u_12','projects','POST',{project:fp})).status,200);
 const item={...assignedTasks('worker',[fp])[0],todayTask:'수정 완료',progress:100,status:'완료',manualFields:['todayTask','progress','status']};
 let r=await req('worker','worklogs/follow-complete','PUT',{log:{id:'follow-complete',date:'2026-10-08',reportMode:'TASK',items:[item]}});assert.equal(r.status,200);
 for(const [actor,action]of [['worker','submit'],['u_13','review'],['u_12','approve']]){r=await req(actor,`worklogs/follow-complete/${action}`,'POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);}
 const final=(await req('worker','projects')).data.projects.find(row=>row.project.id===fp.id).project;assert.equal(final.postDeliveryTasks[0].status,'완료');assert.equal(final.postDeliveryTasks[0].progress,100);assert.equal(final.progress,55);assert.equal(final.endDate,fp.endDate);
});
const uiProject={...structuredClone(p),id:'groupware-ui',pmId:'u_12',subTasks:{외부:{...p.subTasks.외부,personIds:['worker'],personId:'worker',startDate:'2026-10-01',endDate:'2026-10-31',reportingMode:'TASK'}},roles:{}};
await test('완료 업무 서식 저장·재조회 및 실행 태그 제거, 다른 본문 표시 차단',async()=>{
 assert.equal((await req('u_12','projects','POST',{project:uiProject})).status,200);
 const task={...assignedTasks('worker',[uiProject])[0],todayTask:'완료 업무',reportHtml:'<img src=x onerror=alert(1)><b>완료 업무</b>',progress:25,manualFields:['todayTask','reportHtml','progress']};
 let r=await req('worker','worklogs/formatted','PUT',{log:{id:'formatted',date:'2026-10-02',reportMode:'TASK',items:[task],overallNotes:''}});assert.equal(r.status,200);assert.equal(r.data.log.items.find(item=>item.id===task.id).reportHtml,'<b>완료 업무</b>');
 assert.equal((await req('worker','personal')).data.worklogs.find(log=>log.id==='formatted').items.find(item=>item.id===task.id).reportHtml,'<b>완료 업무</b>');
 const log=r.data.log;
 assert.equal((await req('worker','worklogs/formatted','PUT',{revision:log.serverRevision,log:{...log,items:[{...task,reportHtml:'<b>다른 업무</b>'}]}})).status,400);
 assert.equal((await req('worker','worklogs/formatted','PUT',{revision:log.serverRevision,log:{...log,items:[{...task,reportHtml:123}]}})).status,400);
});
let overtime;
await test('당일 추가 시간 요청·지정 PM 알림, 다른 승인자·잘못된 시간 차단',async()=>{
 const route=`projects/${uiProject.id}/extensions`,base={taskId:`gen-${uiProject.id}-외부`,previousEnd:'2026-10-31',type:'OVERTIME',workDate:'2026-10-02',startTime:'18:30',endTime:'21:30',hours:999,reason:'추가 도면 검토',reasonCategory:'도면 변경',approverId:'u_12'};
 assert.equal((await req('worker',route,'POST',{...base,approverId:'other'})).status,403);
 assert.equal((await req('worker',route,'POST',{...base,endTime:'17:30'})).status,400);
 assert.equal((await req('worker',route,'POST',{...base,startTime:'24:00'})).status,400);
 assert.equal((await req('worker',route,'POST',{...base,workDate:'2026-09-30'})).status,400);
 const counts=id=>db.prepare('SELECT count(*) n FROM studio_notifications WHERE user_id=?').get(id).n;
 const beforeChief=counts('u_12'),beforeLeader=counts('u_13');
 const r=await req('worker',route,'POST',base);assert.equal(r.status,200);overtime=r.data.request;
 assert.equal(overtime.hours,3);assert.equal(overtime.requestedEnd,'2026-10-31');assert.equal(counts('u_12'),beforeChief+1);assert.equal(counts('u_13'),beforeLeader);
 assert.equal((await req('u_13',`${route}/${overtime.id}/approve`,'POST',{revision:r.data.revision})).status,403);
});
await test('추가 시간 승인은 요청 이력에만 반영, 계획·공정률·보고 시간 보존',async()=>{
 const current=(await req('worker','projects')).data.projects.find(row=>row.project.id===uiProject.id),before=structuredClone(current.project),logBody=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('formatted').body;
 const r=await req('u_12',`projects/${uiProject.id}/extensions/${overtime.id}/approve`,'POST',{revision:current.revision});assert.equal(r.status,200);assert.equal(r.data.request.status,'APPROVED');assert.equal(r.data.request.hours,3);
 assert.deepEqual(r.data.project.subTasks,before.subTasks);assert.deepEqual(r.data.project.roles,before.roles);assert.equal(r.data.project.progress,before.progress);assert.equal(r.data.project.endDate,before.endDate);assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('formatted').body,logBody);
});
await test('지정 PM의 완료일 연장 승인 후 동일 Task·개인 일정 연동 유지',async()=>{
 const r=await req('worker',`projects/${uiProject.id}/extensions`,'POST',{taskId:`gen-${uiProject.id}-외부`,previousEnd:'2026-10-31',type:'DEADLINE',requestedEnd:'2026-11-06',reason:'추가 도면 완료 계획',approverId:'u_12'});assert.equal(r.status,200);
 const result=await req('u_12',`projects/${uiProject.id}/extensions/${r.data.request.id}/approve`,'POST',{revision:r.data.revision});assert.equal(result.status,200);assert.equal(result.data.project.subTasks.외부.endDate,'2026-11-06');assert.equal(assignedItems('worker','2026-11-06',[result.data.project])[0].id,r.data.request.taskId);assert.equal(result.data.project.endDate,uiProject.endDate);
});


await test('업무일지 상신·팀장 검토·실장 승인 알림 수신자/중복/격리 검증',async()=>{
 const id='notification-chain';
 const item={...assignedTasks('worker',[uiProject])[0],todayTask:'알림 검수 실제 결과',progress:41,manualFields:['todayTask','progress']};
 let r=await req('worker','worklogs/'+id,'PUT',{log:{id,date:'2026-10-15',reportMode:'TASK',items:[item]}});assert.equal(r.status,200);
 const inbox=async actor=>(await req(actor,'notifications')).data.notifications.filter(n=>n.meeting_id==='worklog:'+id);
 assert.equal((await inbox('u_13')).length,0);
 r=await req('worker','worklogs/'+id+'/submit','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);
 assert.equal((await inbox('u_13')).length,1);assert.equal((await inbox('u_12')).length,0);assert.equal((await inbox('other')).length,0);
 assert.equal((await req('worker','worklogs/'+id+'/submit','POST',{revision:r.data.log.serverRevision})).status,403);assert.equal((await inbox('u_13')).length,1);
 r=await req('u_13','worklogs/'+id+'/review','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);
 assert.equal((await inbox('u_12')).length,1);assert.equal((await inbox('worker')).length,1);
 r=await req('u_12','worklogs/'+id+'/approve','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);
 assert.equal((await inbox('worker')).length,2);assert.equal((await inbox('other')).length,0);
 assert.equal((await req('u_12','worklogs/'+id+'/approve','POST',{revision:r.data.log.serverRevision})).status,403);assert.equal((await inbox('worker')).length,2);
 const entry=(await inbox('worker'))[0];
 assert.equal((await req('other','notifications/read','POST',{id:entry.id})).status,200);assert.equal(db.prepare('SELECT read_at FROM studio_notifications WHERE id=?').get(entry.id).read_at,null);
 assert.equal((await req('worker','notifications/read','POST',{id:entry.id})).status,200);assert.ok(db.prepare('SELECT read_at FROM studio_notifications WHERE id=?').get(entry.id).read_at);
});
await test('업무일지 승인 동시 충돌은 일지·공정률·알림을 함께 취소',async()=>{
 const id='notification-conflict',item={...assignedTasks('worker',[uiProject])[0],todayTask:'충돌 결과 검수',progress:73,manualFields:['todayTask','progress']};
 let r=await req('worker','worklogs/'+id,'PUT',{log:{id,date:'2026-10-16',reportMode:'TASK',items:[item]}});assert.equal(r.status,200);
 for(const [actor,action]of [['worker','submit'],['u_13','review']]){r=await req(actor,'worklogs/'+id+'/'+action,'POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);}
 const beforeBody=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get(id).body,projectBefore=db.prepare('SELECT body FROM studio_projects WHERE id=?').get(uiProject.id).body,count=db.prepare('SELECT count(*) n FROM studio_notifications').get().n;
 const batch=DB.batch;DB.batch=async statements=>{db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(uiProject.id);return batch(statements);};
 try{assert.equal((await req('u_12','worklogs/'+id+'/approve','POST',{revision:r.data.log.serverRevision})).status,409);}finally{DB.batch=batch;}
 assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get(id).body,beforeBody);assert.equal(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(uiProject.id).body,projectBefore);assert.equal(db.prepare('SELECT count(*) n FROM studio_notifications').get().n,count);
});

await test('토목·조경은 본부장에게만 상신·검토, 최종 승인 후 실적 반영',async()=>{
 for(const [id,position]of [['u_8','본부장'],['civil-worker','프로']]){const profile={id,name:id,position,department:'토목&조경팀',email:id+'@example.invalid'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,id,profile.department,position,JSON.stringify(profile),'qa',await passwordHash('test-password','qa'));const login=await req(id,'login','POST',{login:id,password:'test-password'});cookies[id]=login.response.headers.get('set-cookie').split(';')[0];}
 const civil={...structuredClone(uiProject),id:'civil-notification',department:'토목&조경팀',subTasks:{토목:{...uiProject.subTasks.외부,roleName:'토목',personIds:['civil-worker'],personId:'civil-worker'}}};db.prepare('INSERT INTO studio_projects VALUES (?,?,1,?,?)').run(civil.id,JSON.stringify(civil),new Date().toISOString(),'u_8');
 const id='civil-worklog',item={...assignedTasks('civil-worker',[civil])[0],todayTask:'토목 실제 보고',progress:35,manualFields:['todayTask','progress']};let r=await req('civil-worker','worklogs/'+id,'PUT',{log:{id,date:'2026-10-15',reportMode:'TASK',items:[item]}});assert.equal(r.status,200);r=await req('civil-worker','worklogs/'+id+'/submit','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);
 const inbox=async actor=>(await req(actor,'notifications')).data.notifications.filter(n=>n.meeting_id==='worklog:'+id);assert.equal((await inbox('u_8')).length,1);assert.equal((await inbox('u_13')).length,0);assert.equal((await inbox('u_12')).length,0);assert.ok((await req('u_8','personal')).data.worklogs.some(log=>log.id===id));assert.ok(!(await req('worker','personal')).data.worklogs.some(log=>log.id===id));
 assert.equal((await req('u_13','worklogs/'+id+'/review','POST',{revision:r.data.log.serverRevision})).status,403);r=await req('u_8','worklogs/'+id+'/review','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);const notices=await inbox('u_8');assert.equal(notices.length,2);assert.match(notices.find(n=>n.id.includes(':review:')).message,/본부장 검토 완료 · 본부장 승인 대기/);
 r=await req('u_8','worklogs/'+id+'/approve','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);assert.equal(r.data.log.approvalStatus,'APPROVED_FINAL');const result=JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(civil.id).body);assert.equal(result.subTasks.토목.progress,35);assert.equal(result.progress,35);assert.equal((await inbox('civil-worker')).length,2);
});

const legacyProject={...structuredClone(p),id:'legacy-role-extension',pmId:'u_12',startDate:'2026-10-06',endDate:'2026-10-08',progress:58,roles:{내부:{personId:'worker',startDate:'2026-10-06',endDate:'2026-10-08'},PM:{personId:'u_12',startDate:'2026-10-06',endDate:'2026-10-08'}},subTasks:{외부:{...p.subTasks.외부,personIds:['other'],personId:'other',endDate:'2026-10-08',progress:25}}};
await test('구형 roles-only 공종 완료일 연장: 해당 종료일만 변경, 담당·PM·원납품일·실적 보존',async()=>{
 assert.equal((await req('u_12','projects','POST',{project:legacyProject})).status,200);
 const route=`projects/${legacyProject.id}/extensions`,taskId=`gen-${legacyProject.id}-내부`;
 const r=await req('worker',route,'POST',{taskId,previousEnd:'2026-10-08',requestedEnd:'2026-10-12',reason:'구형 배정 추가 도면 검토'});assert.equal(r.status,200);
 const approved=await req('u_12',`${route}/${r.data.request.id}/approve`,'POST',{revision:r.data.revision});assert.equal(approved.status,200);assert.equal(approved.data.request.status,'APPROVED');
 const final=approved.data.project;
 assert.deepEqual(final.roles,{...legacyProject.roles,내부:{...legacyProject.roles.내부,endDate:'2026-10-12'}});
 assert.deepEqual(final.subTasks,legacyProject.subTasks);assert.equal(final.pmId,legacyProject.pmId);assert.equal(final.endDate,legacyProject.endDate);assert.equal(final.progress,legacyProject.progress);
 assert.equal(assignedItems('worker','2026-10-12',[final]).find(item=>item.id===taskId)?.endDate,'2026-10-12');
 const stored=(await req('worker','projects')).data.projects.find(row=>row.project.id===legacyProject.id).project;assert.deepEqual(stored,final);
});
await test('구형 roles-only 추가 시간 승인: 종료일·실적·담당·이전 승인 이력 유지',async()=>{
 const before=(await req('worker','projects')).data.projects.find(row=>row.project.id===legacyProject.id).project,route=`projects/${legacyProject.id}/extensions`;
 const r=await req('worker',route,'POST',{taskId:`gen-${legacyProject.id}-내부`,previousEnd:'2026-10-12',type:'OVERTIME',workDate:'2026-10-06',startTime:'18:30',endTime:'21:30',reason:'구형 배정 당일 추가 검토'});assert.equal(r.status,200);
 const approved=await req('u_12',`${route}/${r.data.request.id}/approve`,'POST',{revision:r.data.revision});assert.equal(approved.status,200);assert.equal(approved.data.request.hours,3);
 assert.deepEqual(approved.data.project.roles,before.roles);assert.deepEqual(approved.data.project.subTasks,before.subTasks);assert.equal(approved.data.project.progress,before.progress);assert.equal(approved.data.project.endDate,before.endDate);assert.equal(approved.data.project.pmId,before.pmId);
 assert.deepEqual(approved.data.project.scheduleExtensions.slice(0,-1),before.scheduleExtensions);
});
await test('구형 배정 연장 요청 후 관리자 공종 날짜 변경: 이전 요청 승인 차단, 이력 반려 가능',async()=>{
 const route=`projects/${legacyProject.id}/extensions`,r=await req('worker',route,'POST',{taskId:`gen-${legacyProject.id}-내부`,previousEnd:'2026-10-12',requestedEnd:'2026-10-13',reason:'추가 검토 예정'});assert.equal(r.status,200);
 const next=structuredClone(r.data.project);next.subTasks.내부={roleName:'내부',...next.roles.내부,personIds:['worker'],endDate:'2026-10-14',status:'예정',memo:'관리자가 변경한 계획'};
 const changed=await req('u_12','projects','POST',{base:r.data.project,project:next});assert.equal(changed.status,200);
 const requestRoute=`${route}/${r.data.request.id}`;
 assert.equal((await req('u_12',`${requestRoute}/approve`,'POST',{revision:changed.data.revision})).status,409);
 const rejected=await req('u_12',`${requestRoute}/reject`,'POST',{revision:changed.data.revision,memo:'관리자 일정 변경'});assert.equal(rejected.status,200);assert.equal(rejected.data.request.status,'REJECTED');assert.equal(rejected.data.project.subTasks.내부.endDate,'2026-10-14');
 assert.deepEqual(rejected.data.project.scheduleExtensions.slice(0,-1),r.data.project.scheduleExtensions.slice(0,-1));
});

for(const id of ['legacy-worker','legacy-other']){const profile={id,name:id,position:'프로',department:'마감팀',email:id+'@example.invalid'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,id,profile.department,profile.position,JSON.stringify(profile),'qa',await passwordHash('test-password','qa'));const login=await req(id,'login','POST',{login:id,password:'test-password'});cookies[id]=login.response.headers.get('set-cookie').split(';')[0];}
const legacySingle={...structuredClone(p),id:'legacy-single-progress',pmId:'u_12',startDate:'2026-10-01',endDate:'2026-10-31',progress:17,subTasks:{},roles:{내부:{personId:'legacy-worker',startDate:'2026-10-06',endDate:'2026-10-08'},PM:{personId:'u_12',startDate:'2026-10-01',endDate:'2026-10-31'}}};
async function reportLegacyProgress(project,id,actor,date,role,progress){
 const item={...assignedTasks(actor,[project]).find(task=>task.roleName===role),todayTask:`${role} 실제 수행 보고`,progress,status:'진행중',manualFields:['todayTask','progress','status']};
 let r=await req(actor,`worklogs/${id}`,'PUT',{log:{id,date,reportMode:'DAILY',items:[item]}});assert.equal(r.status,200);
 for(const [reviewer,action]of [[actor,'submit'],['u_13','review'],['u_12','approve']]){r=await req(reviewer,`worklogs/${id}/${action}`,'POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);}
 return r.data.log;
}
await test('구형 단일 공종 최종 승인: 기존 배정·개별 기간으로 실적 연결, PM·원납품일 보존',async()=>{
 assert.equal((await req('u_12','projects','POST',{project:legacySingle})).status,200);
 const log=await reportLegacyProgress(legacySingle,'legacy-single-log','legacy-worker','2026-10-06','내부',40);
 const final=(await req('legacy-worker','projects')).data.projects.find(row=>row.project.id===legacySingle.id).project;
 assert.deepEqual(final.subTasks.내부,{roleName:'내부',...legacySingle.roles.내부,memo:'',progress:40,status:'진행중',actualProgressDate:'2026-10-06'});
 assert.deepEqual(final.roles,legacySingle.roles);assert.equal(final.pmId,legacySingle.pmId);assert.equal(final.endDate,legacySingle.endDate);assert.equal(final.progress,40);assert.equal(final.subTasks.PM,undefined);
 assert.equal(log.approvalStatus,'APPROVED_FINAL');assert.equal(assignedTasks('legacy-worker',[final]).find(task=>task.roleName==='내부').progress,40);
});
const legacyMultiple={...structuredClone(legacySingle),id:'legacy-multiple-progress',progress:73,roles:{...legacySingle.roles,외부:{personId:'legacy-other',startDate:'2026-10-06',endDate:'2026-10-13'}}};
await test('구형 공종 일부만 승인: 미보고 공종 실적은 생성하지 않고 전체 실제율 유지',async()=>{
 assert.equal((await req('u_12','projects','POST',{project:legacyMultiple})).status,200);
 await reportLegacyProgress(legacyMultiple,'legacy-multiple-first','legacy-worker','2026-10-07','내부',80);
 const final=(await req('legacy-worker','projects')).data.projects.find(row=>row.project.id===legacyMultiple.id).project;
 assert.equal(final.subTasks.내부.progress,80);assert.equal(final.subTasks.외부,undefined);assert.equal(final.subTasks.PM,undefined);assert.deepEqual(final.roles,legacyMultiple.roles);
 assert.equal(projectProgress(final).actual,undefined);assert.equal(final.progress,legacyMultiple.progress);
});
await test('구형 두 공종 승인: 기존 공종별 작업일 가중식 계산, 이전 승인 원문 유지',async()=>{
 const firstLogBody=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('legacy-multiple-first').body;
 const before=(await req('legacy-other','projects')).data.projects.find(row=>row.project.id===legacyMultiple.id).project;
 await reportLegacyProgress(before,'legacy-multiple-second','legacy-other','2026-10-07','외부',20);
 const final=(await req('legacy-other','projects')).data.projects.find(row=>row.project.id===legacyMultiple.id).project;
 assert.equal(workDays('2026-10-06','2026-10-08'),3);assert.equal(workDays('2026-10-06','2026-10-13'),5);
 assert.equal(final.progress,42.5);assert.equal(projectProgress(final).actual,42.5);assert.equal(final.subTasks.내부.progress,80);assert.equal(final.subTasks.외부.progress,20);assert.equal(final.subTasks.외부.actualProgressDate,'2026-10-07');
 assert.deepEqual(final.roles,legacyMultiple.roles);assert.equal(final.pmId,legacyMultiple.pmId);assert.equal(final.endDate,legacyMultiple.endDate);assert.equal(final.subTasks.PM,undefined);
 assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('legacy-multiple-first').body,firstLogBody);
});
await test('구형 공종 상신 후 재배정: 이전 직원 실적은 새 담당 업무로 반영하지 않고 승인 원문 보존',async()=>{
 const project={...structuredClone(legacySingle),id:'legacy-reassigned-progress'};assert.equal((await req('u_12','projects','POST',{project})).status,200);
 const id='legacy-reassigned-log',item={...assignedTasks('legacy-worker',[project]).find(task=>task.roleName==='내부'),todayTask:'이전 담당자가 수행한 작업',progress:90,status:'진행중',manualFields:['todayTask','progress','status']};
 let r=await req('legacy-worker',`worklogs/${id}`,'PUT',{log:{id,date:'2026-10-08',reportMode:'DAILY',items:[item]}});assert.equal(r.status,200);
 for(const [reviewer,action]of [['legacy-worker','submit'],['u_13','review']]){r=await req(reviewer,`worklogs/${id}/${action}`,'POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);}
 const reviewed=structuredClone(r.data.log),next=structuredClone(project);next.subTasks.내부={roleName:'내부',...project.roles.내부,personId:'legacy-other',personIds:['legacy-other'],status:'예정',memo:'관리자 담당 변경'};
 const changed=await req('u_12','projects','POST',{base:project,project:next});assert.equal(changed.status,200);
 const approved=await req('u_12',`worklogs/${id}/approve`,'POST',{revision:reviewed.serverRevision});assert.equal(approved.status,200);
 const final=(await req('legacy-worker','projects')).data.projects.find(row=>row.project.id===project.id).project;
 assert.deepEqual(final,changed.data.project);assert.equal(final.subTasks.내부.progress,undefined);assert.equal(final.subTasks.내부.actualProgressDate,undefined);
 assert.deepEqual(approved.data.log.items,reviewed.items);assert.deepEqual(approved.data.log.authorSignature,reviewed.authorSignature);assert.deepEqual(approved.data.log.leaderReview,reviewed.leaderReview);assert.equal(approved.data.log.approvalStatus,'APPROVED_FINAL');
});

await test('구형 roles-only 단일 공종 제안 공정률 40%, 원본 배정·실적은 변경하지 않음',()=>{
 const project=structuredClone(legacySingle),before=structuredClone(project);
 const item={...assignedTasks('legacy-worker',[project]).find(task=>task.roleName==='내부'),progress:40,manualFields:['progress']};
 assert.equal(proposedProgress(project,[item],'2026-10-06','legacy-worker'),40);assert.deepEqual(project,before);
});
await test('구형 공종 제안 공정률: 다른 공종 미보고면 미산정, 프로젝트 기간 기본값도 유지',()=>{
 const project=structuredClone(legacyMultiple),before=structuredClone(project);
 const item={...assignedTasks('legacy-worker',[project]).find(task=>task.roleName==='내부'),progress:40,manualFields:['progress']};
 assert.equal(proposedProgress(project,[item],'2026-10-06','legacy-worker'),undefined);assert.deepEqual(project,before);
 const fallback=structuredClone(legacySingle);fallback.roles.내부.startDate='';fallback.roles.내부.endDate='';
 const fallbackItem={...assignedTasks('legacy-worker',[fallback]).find(task=>task.roleName==='내부'),progress:40,manualFields:['progress']};
 assert.equal(proposedProgress(fallback,[fallbackItem],'2026-10-06','legacy-worker'),40);assert.equal(fallback.roles.내부.startDate,'');assert.equal(fallback.roles.내부.endDate,'');
});
await test('같은 공종 제안 계산은 정식 subTask 담당·기간을 우선하고 구형 배정은 중복 계산하지 않음',()=>{
 const project={...structuredClone(legacySingle),id:'legacy-proposed-canonical',roles:{...legacySingle.roles,내부:{personId:'legacy-other',startDate:'2026-10-20',endDate:'2026-10-22'}},subTasks:{내부:{roleName:'내부',personId:'legacy-worker',personIds:['legacy-worker'],startDate:'2026-10-06',endDate:'2026-10-08',progress:25,status:'진행중',memo:'정식 배정'}}},before=structuredClone(project);
 const item={...assignedTasks('legacy-worker',[project]).find(task=>task.roleName==='내부'),progress:60,manualFields:['progress']};
 assert.equal(proposedProgress(project,[item],'2026-10-06','legacy-worker'),60);assert.equal(proposedProgress(project,[item],'2026-10-06','legacy-other'),25);assert.deepEqual(project,before);
});

await test('납품 후 수정 실적만 최종 승인: 원 전체율80·본공종40·납품일 보존, 수정100 및 승인 기록 반영',async()=>{
 const main={roleName:'내부',personId:'other',personIds:['other'],startDate:'2026-10-01',endDate:'2026-10-02',progress:40,status:'진행중',memo:'기존 납품 공종',actualProgressDate:'2026-10-01'};
 const project={...structuredClone(p),id:'follow-only-original-total',pmId:'u_12',progress:80,subTasks:{내부:main},roles:{내부:{personId:'other',startDate:main.startDate,endDate:main.endDate}},postDeliveryTasks:[{id:'follow-total',kind:'수정',personIds:['worker'],startDate:'2026-10-20',endDate:'2026-10-21',status:'예정',memo:'납품 후 변경 도면'}]};
 assert.equal((await req('u_12','projects','POST',{project})).status,200);
 const oldLogBody=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('same-day').body;
 const id='follow-only-original-log',item={...assignedTasks('worker',[project]).find(task=>task.id===`gen-${project.id}-followup-follow-total`),todayTask:'납품 후 변경 도면 완료',progress:100,status:'완료',manualFields:['todayTask','progress','status']};
 let r=await req('worker',`worklogs/${id}`,'PUT',{log:{id,date:'2026-10-20',reportMode:'DAILY',items:[item]}});assert.equal(r.status,200);
 for(const [actor,action]of [['worker','submit'],['u_13','review'],['u_12','approve']]){r=await req(actor,`worklogs/${id}/${action}`,'POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200);}
 const final=(await req('worker','projects')).data.projects.find(row=>row.project.id===project.id).project;
 assert.equal(final.progress,80);assert.deepEqual(final.subTasks,project.subTasks);assert.deepEqual(final.roles,project.roles);assert.equal(final.pmId,project.pmId);assert.equal(final.startDate,project.startDate);assert.equal(final.endDate,project.endDate);
 assert.deepEqual(final.postDeliveryTasks[0],{...project.postDeliveryTasks[0],progress:100,status:'완료',actualProgressDate:'2026-10-20'});
 assert.equal(r.data.log.approvalStatus,'APPROVED_FINAL');assert.equal(r.data.log.authorSignature.signed,true);assert.equal(r.data.log.leaderReview.approved,true);assert.equal(r.data.log.chiefApproval.approved,true);assert.equal(r.data.log.items.find(task=>task.id===item.id).todayTask,item.todayTask);
 assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('same-day').body,oldLogBody);
});

await test('구형 공종 기한 연장 승인도 실제 작업일 가중 실적을 저장하고 원납품일 보존',async()=>{
 const project={...structuredClone(p),id:'legacy-extension-weighted-final',code:'LEGACY-WEIGHT-END',startDate:'2026-10-06',endDate:'2026-10-08',pmId:'u_12',progress:60,subTasks:{},roles:{내부:{personId:'worker',startDate:'2026-10-06',endDate:'2026-10-08',progress:40},외부:{personId:'worker',startDate:'2026-10-06',endDate:'2026-10-08',progress:80}}};
 assert.equal((await req('u_12','projects','POST',{project})).status,200);
 const task=assignedTasks('worker',[project]).find(item=>item.roleName==='내부');
 const request=await req('worker',`projects/${project.id}/extensions`,'POST',{taskId:task.id,previousEnd:task.endDate,requestedEnd:'2026-10-12',approverId:'u_12',reason:'새 도면 반영'});assert.equal(request.status,200);
 const approved=await req('u_12',`projects/${project.id}/extensions/${request.data.request.id}/approve`,'POST',{revision:request.data.revision});assert.equal(approved.status,200);
 const final=(await req('worker','projects')).data.projects.find(row=>row.project.id===project.id).project;
 const days=workDays('2026-10-06','2026-10-12'),otherDays=workDays('2026-10-06','2026-10-08');assert.equal(days,4);assert.equal(otherDays,3);const expected=(days*40+otherDays*80)/(days+otherDays);
 assert.ok(Math.abs(final.progress-expected)<1e-10,`저장 실적 ${final.progress}, 기대 ${expected}`);assert.equal(projectProgress(final).actual,expected);assert.equal(final.roles.내부.endDate,'2026-10-12');assert.equal(final.endDate,project.endDate);assert.equal(final.pmId,project.pmId);assert.deepEqual(final.subTasks,{});assert.deepEqual(final.roles.외부,project.roles.외부);
});
}
await test('배정 변경 후 미연결 승인 실적 표시, 현재 실적·입력·서명 원문 보존',async()=>{
 const project={...structuredClone(p),id:'caption-project',code:'CAPTION-QA',startDate:'2026-10-12',endDate:'2026-10-16',progress:35,subTasks:{내부:{roleName:'내부',personId:'worker',personIds:['worker'],startDate:'2026-10-12',endDate:'2026-10-16',status:'진행중',memo:'원 배정',progress:35,reportingMode:'TASK',allocations:[{id:'caption-allocation',personIds:['worker'],startDate:'2026-10-12',endDate:'2026-10-16'}]}}};
 const api=async(actor,path,method='GET',body)=>{const result=await req(actor,path,method,body);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
 await api('u_12','projects','POST',{project});
 const log=(id,date,progress)=>({id,date,reportMode:'TASK',items:[{...assignedItems('worker',date,[project])[0],todayTask:'원 보고 내용',progress,manualFields:['todayTask','progress']}],overallNotes:'원 일지 메모'});
 let approved=(await api('worker','worklogs/caption-approved','PUT',{log:log('caption-approved','2026-10-12',35)})).log;
 for(const [actor,action]of [['worker','submit'],['u_13','review'],['u_12','approve']])approved=(await api(actor,`worklogs/${approved.id}/${action}`,'POST',{revision:approved.serverRevision})).log;
 assert.equal(approved.approvalStatus,'APPROVED_FINAL');assert.equal(approved.chiefApproval.approved,true);
 const draft=(await api('worker','worklogs/caption-draft','PUT',{log:log('caption-draft','2026-10-13',70)})).log;
 const stored=id=>db.prepare('SELECT body,revision FROM studio_worklogs WHERE id=?').get(id),approvedBefore=stored(approved.id),draftBefore=stored(draft.id);
 const getProject=async()=> (await api('u_12','projects')).projects.find(row=>row.project.id===project.id).project;
 const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const source=readFileSync(process.argv.find(arg=>arg.startsWith('--reporting-source='))?.slice('--reporting-source='.length)||new URL('../src/components/WorkLogReporting.tsx',import.meta.url),'utf8');
 const daily=readFileSync(new URL('../src/components/DailyWorkLogView.tsx',import.meta.url),'utf8');
 const find=(text,predicate)=>{const ast=ts.createSourceFile('component.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;const visit=node=>{if(predicate(node,ast))found=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(found);return found;};
 const fields=find(source,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TaskReportFields'),binding=find(daily,(node,ast)=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentTask');
 const context={exports:{},field:'',useState:React.useState,reportsActualProgress,ReportContentEditor:({value})=>React.createElement('textarea',{value,readOnly:true}),ReportFileUpload:()=>null,require:name=>{assert.equal(name,'react/jsx-runtime');return jsx;}};
 runInNewContext(ts.transpileModule(fields,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const select=(item,tasks)=>{const scope={exports:{},allTasks:tasks,selectedTaskId:item.id,selectedItem:item,legacyAllocationTask};runInNewContext('const '+binding+';exports.task=currentTask;',scope);return scope.exports.task;};
 const caption=(item,task,canEdit=true)=>{const html=renderToStaticMarkup(React.createElement(context.exports.TaskReportFields,{item,task,canEdit,update(){}}));return html.match(/<p[^>]*>([^<]* · 보고한 실적은 최종 승인 후 반영됩니다\.)<\/p>/)?.[1];};
 const current=await getProject(),originalItem=draft.items.find(item=>item.projectId===project.id),currentTask=select(originalItem,assignedTasks('worker',[current]));
 assert.equal(caption(originalItem,currentTask),'승인됨 35% · 보고한 실적은 최종 승인 후 반영됩니다.');assert.equal(proposedProgress(current,[originalItem],draft.date,'worker'),70);
 const changed=structuredClone(current);changed.subTasks.내부.allocations[0].personIds=['other'];changed.subTasks.내부.personId='other';changed.subTasks.내부.personIds=['other'];
 await api('u_12','projects','POST',{base:current,project:changed});
 const now=await getProject(),loaded=(await api('worker','personal')).worklogs.find(log=>log.id===draft.id),removed=loaded.items.find(item=>item.projectId===project.id);
 assert.equal(loaded.approvalStatus,'DRAFT');assert.equal(loaded.authorSignature.signed,false);assert.equal(removed.scheduleRemoved,true);assert.equal(removed.progress,70);assert.equal(removed.todayTask,originalItem.todayTask);
 assert.equal(assignedItems('worker',draft.date,[now]).length,0);assert.equal(assignedItems('other',draft.date,[now]).length,1);assert.equal(now.subTasks.내부.progress,35);assert.equal(select(removed,assignedTasks('worker',[now])),undefined);
 assert.equal(caption(removed,undefined),'승인 실적 미연결 · 보고한 실적은 최종 승인 후 반영됩니다.');
 for(const [actual,expected]of [[35,'35%'],[0,'0%'],[100,'100%'],[undefined,'미산정'],[null,'미산정']])assert.equal(caption(originalItem,{...currentTask,progress:actual}),'승인됨 '+expected+' · 보고한 실적은 최종 승인 후 반영됩니다.');
 const completed={...originalItem,status:'완료',progress:100};assert.equal(caption(completed,{...currentTask,progress:100},false),'승인됨 100% · 보고한 실적은 최종 승인 후 반영됩니다.');
 const valuesBefore=JSON.stringify({originalItem,removed,currentTask,current,now}),updates=[];
 context.useState=initial=>[initial,()=>{}];
 const nodes=[];const walk=node=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'&&node.props){nodes.push(node);walk(node.props.children);}};
 const tree=(item,canEdit)=>{nodes.length=0;walk(context.exports.TaskReportFields({item,task:currentTask,canEdit,update:(...args)=>updates.push(args)}));return nodes;};
 tree(originalItem,true);const range=nodes.find(node=>node.props['aria-label']==='보고 작업 진행률'),direct=nodes.find(node=>node.props['aria-label']==='작업 진행률 직접 입력');assert.equal(range.props.value,70);assert.equal(range.props.disabled,false);assert.equal(direct,undefined);assert.equal(nodes.find(node=>node.type==='progress').props.value,70);range.props.onChange({target:{value:'82'}});assert.deepEqual(updates,[[originalItem.id,'progress',82]]);
 tree(completed,false);assert.equal(nodes.find(node=>node.type==='progress').props.value,100);assert.equal(nodes.find(node=>node.props['aria-label']==='보고 작업 진행률').props.disabled,true);assert.equal(nodes.find(node=>node.props['aria-label']==='작업 진행률 직접 입력'),undefined);
 assert.equal(JSON.stringify({originalItem,removed,currentTask,current,now}),valuesBefore);assert.equal(proposedProgress(current,[originalItem],draft.date,'worker'),70);assert.deepEqual(stored(approved.id),approvedBefore);assert.deepEqual(stored(draft.id),draftBefore);
});
await test('현재 Task 승인 실적은 원공종·후속 raw값으로 표시하고 보고값·통계·원문은 보존',async()=>{
 const api=async(actor,path,method='GET',body)=>{const response=await req(actor,path,method,body);assert.equal(response.status,200,JSON.stringify(response.data));return response.data;};
 const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
 const source=readFileSync(process.argv.find(arg=>arg.startsWith('--reporting-source='))?.slice('--reporting-source='.length)||new URL('../src/components/WorkLogReporting.tsx',import.meta.url),'utf8'),daily=readFileSync(process.argv.find(arg=>arg.startsWith('--daily-source='))?.slice('--daily-source='.length)||new URL('../src/components/DailyWorkLogView.tsx',import.meta.url),'utf8');
 const find=(text,predicate)=>{const ast=ts.createSourceFile('component.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;const visit=node=>{if(predicate(node,ast))found=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(found);return found;};
 const fields=find(source,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TaskReportFields'),binding=find(daily,(node,ast)=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentTask');
 const dailyAST=ts.createSourceFile('Daily.tsx',daily,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let rawExpression='undefined';const capture=node=>{if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(dailyAST)==='TaskReportFields'){const attribute=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(dailyAST)==='approvedProgress');if(attribute?.initializer&&ts.isJsxExpression(attribute.initializer))rawExpression=attribute.initializer.expression.getText(dailyAST);}ts.forEachChild(node,capture);};capture(dailyAST);
 const ctx={exports:{},field:'',useState:React.useState,reportsActualProgress,ReportContentEditor:({value})=>React.createElement('textarea',{value,readOnly:true}),ReportFileUpload:()=>null,require:path=>{assert.equal(path,'react/jsx-runtime');return jsx;}};runInNewContext(ts.transpileModule(fields,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);
 const render=(item,projects)=>{const allTasks=assignedTasks('worker',projects),scope={exports:{},allTasks,projects,selectedTaskId:item.id,selectedItem:item,legacyAllocationTask,approvedTaskProgress:personalWork.approvedTaskProgress};runInNewContext('const '+binding+';exports.task=currentTask;exports.raw='+rawExpression+';',scope);const html=renderToStaticMarkup(React.createElement(ctx.exports.TaskReportFields,{item,task:scope.exports.task,approvedProgress:scope.exports.raw,canEdit:false,update(){}}));return {html,task:scope.exports.task,raw:scope.exports.raw,caption:html.match(/<p[^>]*>([^<]* · 보고한 실적은 최종 승인 후 반영됩니다\.)<\/p>/)?.[1]};};
 const base={id:'source-base',code:'SOURCE-QA',name:'合成 원 실적 표시',department:'마감팀',pmId:'',startDate:'2026-10-22',endDate:'2026-10-26',status:'진행중',progress:55,roles:{},subTasks:{}},task={roleName:'내부',personId:'worker',personIds:['worker'],startDate:base.startDate,endDate:base.endDate,status:'진행중',memo:'원 배정',reportingMode:'TASK'};
 const cases=[['legacy55',{roles:{내부:{...task,progress:55}}},'55%',0],['canonical35',{subTasks:{내부:{...task,progress:35}}},'35%',35],['canonical0',{subTasks:{내부:{...task,progress:0}}},'0%',0],['canonicalUnknown',{subTasks:{내부:{...task}},roles:{내부:{...task,progress:55}}},'미산정',0],...[[0,'0%'],[55,'55%'],[undefined,'미산정']].map(([value,label])=>['follow'+label,{endDate:base.startDate,postDeliveryTasks:[{id:'source-follow',kind:'수정',personIds:['worker'],startDate:base.startDate,endDate:base.endDate,status:value===undefined?'완료':'진행중',memo:'후속 원문',progress:value,reportingMode:'TASK'}]},label,value??100])];
 let legacy,legacyItem;
 for(const [id,patch,expected,inputDefault]of cases){const project={...structuredClone(base),id:'source-'+id,...structuredClone(patch)};await api('u_12','projects','POST',{project});const row=(await api('u_12','projects')).projects.find(row=>row.project.id===project.id),current=row.project,snapshot=JSON.stringify(row),tasks=assignedTasks('worker',[current]),item={...assignedItems('worker','2026-10-22',[current])[0],todayTask:'입력한 보고 원문',progress:70,manualFields:['todayTask','progress']},tasksBefore=JSON.stringify(tasks),itemBefore=JSON.stringify(item),counts=tasks.filter(task=>task.status==='완료'||task.progress===100).length;
  assert.equal(tasks[0].progress,inputDefault);const view=render(item,[current]);assert.equal(view.caption,'승인됨 '+expected+' · 보고한 실적은 최종 승인 후 반영됩니다.');assert.equal(JSON.stringify(tasks),tasksBefore);assert.equal(JSON.stringify(item),itemBefore);assert.equal(JSON.stringify(row),snapshot);assert.equal(assignedTasks('worker',[current]).filter(task=>task.status==='완료'||task.progress===100).length,counts);assert.match(view.html,/aria-label="보고 작업 진행률"[^>]*disabled=""[^>]*value="70"/);if(id==='legacy55'){legacy=current;legacyItem=item;}
 }
 const canonicalNull={...structuredClone(base),id:'source-null',roles:{내부:{...task,progress:55}},subTasks:{내부:{...task,progress:null}}},nullBefore=JSON.stringify(canonicalNull),nullItem={...assignedTasks('worker',[canonicalNull])[0],todayTask:'원 보고',progress:70,manualFields:['todayTask','progress']};assert.equal(render(nullItem,[canonicalNull]).caption,'승인됨 미산정 · 보고한 실적은 최종 승인 후 반영됩니다.');assert.equal(JSON.stringify(canonicalNull),nullBefore);
 const saved=(await api('worker','worklogs/source-display-draft','PUT',{log:{id:'source-display-draft',date:'2026-10-22',reportMode:'TASK',items:[legacyItem]}})).log,stored=db.prepare('SELECT body,revision FROM studio_worklogs WHERE id=?').get(saved.id);assert.ok(!stored.body.includes('approvedProgress'));const changed=structuredClone(legacy);changed.subTasks.내부={...legacy.roles.내부,personId:'other',personIds:['other']};await api('u_12','projects','POST',{base:legacy,project:changed});const latest=(await api('u_12','projects')).projects.find(row=>row.project.id===legacy.id).project,loaded=(await api('worker','personal')).worklogs.find(log=>log.id===saved.id),removed=loaded.items.find(item=>item.projectId===legacy.id);assert.equal(removed.scheduleRemoved,true);assert.equal(removed.progress,70);assert.equal(render(removed,[latest]).caption,'승인 실적 미연결 · 보고한 실적은 최종 승인 후 반영됩니다.');assert.deepEqual(db.prepare('SELECT body,revision FROM studio_worklogs WHERE id=?').get(saved.id),stored);assert.equal(latest.subTasks.내부.progress,55);
});
db.close();
