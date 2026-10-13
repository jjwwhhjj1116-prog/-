import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash} from '../../functions/lib/collaboration.ts';
import {assignedItems,assignedTasks,reconcileItems,reconcileWorkLogItems,assignmentAliases,leavesFor} from '../src/utils/personalWork.ts';
const onlyExplicitIdentity=process.argv.includes('--only-explicit-identity');
const {db,DB}=database(),cookies={},results=[];
for(const [id,name,position]of [['u_12','실장','실장'],['u_13','팀장','수석'],['worker','직원','프로'],['other','다른 직원','프로']]){
 const profile={id,name,position,department:'마감팀',email:id+'@example.invalid'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,name,'마감팀',position,JSON.stringify(profile),'test',await passwordHash('test-password','test'));
}
async function req(id,route,method='GET',body){const r=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+route,{method,headers:{Cookie:cookies[id]||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB},async()=> '');return {status:r.status,data:await r.json(),response:r};}
for(const id of ['u_12','u_13','worker','other']){const r=await req(id,'login','POST',{login:id,password:'test-password'});assert.equal(r.status,200);cookies[id]=r.response.headers.get('set-cookie').split(';')[0];}
async function test(name,fn){if(onlyExplicitIdentity&&!name.startsWith('명시 구간 연결:'))return;try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',reason:e.message});console.error('FAIL',name,e);process.exitCode=1;}}
const project={id:'p-test',code:'QA',name:'배정 연동 검수',department:'마감팀',startDate:'2026-09-01',endDate:'2026-09-30',subTasks:{조적:{roleName:'조적',personIds:['worker','other'],startDate:'2026-09-21',endDate:'2026-09-23',status:'예정',memo:'배정 원문'},PM:{roleName:'PM',personIds:['worker'],startDate:'2026-09-22',endDate:'2026-09-22',status:'예정'}},roles:{},progress:0};
let revision=1,base=structuredClone(project);
await test('실장 배정 → 개인 오늘/내일 목록, PM 공종 기간·다중 담당자 반영',async()=>{
 assert.equal((await req('u_12','projects','POST',{project})).status,200);
 assert.equal(assignedItems('worker','2026-09-21',[project]).length,1);
 assert.equal(assignedItems('worker','2026-09-22',[project]).length,2);
 assert.equal(assignedItems('other','2026-09-22',[project]).length,1);
 assert.equal(assignedItems('worker','2026-09-24',[project]).length,0);
 const unassigned=structuredClone(project);unassigned.subTasks.조적.personIds=[];unassigned.subTasks.조적.personId='worker';assert.equal(assignedItems('worker','2026-09-21',[unassigned]).length,0);
});
const initial=assignedItems('worker','2026-09-21',[project]);
await test('중앙 업무일지 저장·본인 격리·일자 중복 및 타인 수정 차단',async()=>{
 const log={id:'wl-qa',date:'2026-09-21',items:initial,overallNotes:'직접 작성',department:'마감팀'};
 assert.equal((await req('worker','worklogs/wl-qa','PUT',{log})).status,200);
 assert.equal((await req('other','personal')).data.worklogs.length,0);
 assert.equal((await req('u_13','personal')).data.worklogs.length,1);
 assert.equal((await req('other','worklogs/wl-qa','PUT',{log,revision:1})).status,403);
 assert.equal((await req('worker','worklogs/duplicate','PUT',{log:{...log,id:'duplicate'}})).status,409);
});
await test('배정 변경 → 이미 저장된 작성 중 업무일지 자동 갱신',async()=>{
 project.subTasks.조적.memo='실장이 변경한 업무';assert.equal((await req('u_12','projects','POST',{base,project})).status,200);base=structuredClone(project);
 const log=(await req('worker','personal')).data.worklogs[0];assert.equal(log.items[0].todayTask,'실장이 변경한 업무');assert.equal(log.overallNotes,'직접 작성');
});
await test('배정 해제 시 자동 행 제거, 직접 작성한 내용은 표시와 함께 보존',()=>{
 assert.equal(reconcileItems(initial,[]).length,0);
 const typed={...initial[0],todayTask:'작성한 실적',manualFields:['todayTask']};const kept=reconcileItems([typed],[]);assert.equal(kept[0].todayTask,'작성한 실적');assert.equal(kept[0].scheduleRemoved,true);
});
await test('날짜별 본인 할 일 체크 중앙 저장 및 타인 업무 체크 차단',async()=>{
 assert.equal((await req('worker','task-checks','POST',{day:'2026-09-21',taskId:initial[0].id,done:true})).status,200);
 const a=(await req('worker','personal')).data.checks;assert.equal(a[0].day,'2026-09-21');assert.equal(a[0].done,1);assert.equal((await req('other','personal')).data.checks.length,0);
 assert.equal((await req('other','task-checks','POST',{day:'2026-09-22',taskId:'gen-p-test-PM',done:true})).status,403);
});
await test('본인 연차 등록·배정 겹침 공유·타인 취소/잘못된 날짜/중복 차단',async()=>{
 const saved=await req('worker','leaves','POST',{userId:'other',startDate:'2026-09-21',endDate:'2026-09-22',kind:'연차'});assert.equal(saved.status,200);
 const rows=(await req('u_12','personal')).data.leaves;assert.equal(rows[0].user_id,'worker');assert.equal(leavesFor(rows,'worker','2026-09-21').length,1);
 assert.equal((await req('other','leaves/'+saved.data.id,'DELETE',{revision:1})).status,409);
 assert.equal((await req('worker','leaves','POST',{startDate:'2026-09-22',endDate:'2026-09-23',kind:'휴가'})).status,409);
 assert.equal((await req('worker','leaves','POST',{startDate:'2026-02-30',endDate:'2026-02-30',kind:'연차'})).status,400);
 assert.equal((await req('worker','leaves/'+saved.data.id,'DELETE',{revision:1})).status,200);
 assert.equal((await req('worker','personal')).data.leaves.length,0);
});
await test('상신본 보존·팀장/실장 단계 검증·승인 진척률 중앙 반영',async()=>{
 const current=(await req('worker','personal')).data.worklogs[0];current.items[0]={...current.items[0],progress:40,manualFields:['progress']};
 const saved=await req('worker','worklogs/wl-qa','PUT',{log:current,revision:1});assert.equal(saved.status,200);revision=2;
 assert.equal((await req('worker','worklogs/wl-qa/submit','POST',{revision})).status,200);revision++;
 project.subTasks.조적.memo='상신 후 일정 변경';assert.equal((await req('u_12','projects','POST',{base,project})).status,200);base=structuredClone(project);
 assert.equal((await req('worker','personal')).data.worklogs[0].items[0].todayTask,'실장이 변경한 업무');
 assert.equal((await req('worker','worklogs/wl-qa','PUT',{log:current,revision})).status,409);
 assert.equal((await req('u_12','worklogs/wl-qa/approve','POST',{revision})).status,403);
 assert.equal((await req('u_13','worklogs/wl-qa/review','POST',{revision})).status,200);revision++;
 const oldBatch=DB.batch;DB.batch=async statements=>{db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(project.id);return oldBatch(statements);};
 assert.equal((await req('u_12','worklogs/wl-qa/approve','POST',{revision})).status,409);DB.batch=oldBatch;
 assert.equal(JSON.parse(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('wl-qa').body).approvalStatus,'SUBMITTED_LEADER');
 assert.equal((await req('u_12','worklogs/wl-qa/approve','POST',{revision})).status,200);
 const actual=JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(project.id).body);assert.equal(actual.subTasks.조적.progress,40);assert.equal(actual.subTasks.조적.memo,'상신 후 일정 변경');
});
await test('프로젝트 정리 권한·동시 변경·활성 목록 제외·기존 일지 보존·복원',async()=>{
 const actual=JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(project.id).body);
 assert.equal((await req('worker',`projects/${project.id}/archive`,'POST',{base:actual})).status,403);
 assert.equal((await req('u_12',`projects/${project.id}/archive`,'POST',{base:{...actual,name:'stale'}})).status,409);
 const before=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('wl-qa').body;
 assert.equal((await req('u_12',`projects/${project.id}/archive`,'POST',{base:actual})).status,200);
 let state=(await req('worker','projects')).data;assert.equal(state.projects.length,0);assert.equal(state.archived.length,1);
 assert.equal((await req('u_12','projects','POST',{base:actual,project:actual})).status,409);
 assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('wl-qa').body,before);
 assert.equal((await req('u_12',`projects/${project.id}/restore`,'POST',{base:actual})).status,200);
 state=(await req('worker','projects')).data;assert.equal(state.projects.length,1);assert.equal(state.archived.length,0);
});
await test('기존 PC 일지는 본인 원본만 별도 보존·동일 원본 중복 방지·승인 미승계',async()=>{
 const log={id:'old',userId:'worker',userName:'직원',date:'2025-01-02',approvalStatus:'APPROVED_FINAL',items:[],overallNotes:'과거 원문'};
 const before=db.prepare('SELECT count(*) n FROM studio_worklogs').get().n;
 assert.equal((await req('other','legacy-worklogs','POST',{log})).status,403);
 const first=await req('worker','legacy-worklogs','POST',{log});assert.equal(first.status,200);
 assert.equal((await req('worker','legacy-worklogs','POST',{log})).data.id,first.data.id);
 assert.equal((await req('other','legacy-worklogs')).data.records.length,0);
 assert.equal((await req('u_12','legacy-worklogs')).data.records[0].source.overallNotes,'과거 원문');
 assert.equal(db.prepare('SELECT count(*) n FROM studio_worklogs').get().n,before);
 assert.equal((await req('worker','legacy-worklogs','POST',{log:{...log,overallNotes:'수정된 원본'}})).status,200);
 assert.equal((await req('worker','legacy-worklogs')).data.records.length,2);
});
await test('베트남 개인 직접 배정 해제는 명시 VN팀 배정 유지, VN팀까지 해제하면 개인 일지 제거',async()=>{
 const id='u_44',profile={id,name:'베트남 검수 직원',position:'프로',department:'마감팀',email:'viet-qa@example.invalid'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,profile.name,profile.department,profile.position,JSON.stringify(profile),'test',await passwordHash('test-password','test'));
 const login=await req(id,'login','POST',{login:id,password:'test-password'});assert.equal(login.status,200);cookies[id]=login.response.headers.get('set-cookie').split(';')[0];
 const p={...structuredClone(project),id:'viet-assignment',code:'VIET-QA',subTasks:{내부:{roleName:'내부',personIds:['vt_in1','other',id],startDate:'2026-09-21',endDate:'2026-09-22',status:'예정',memo:'베트남 개별 업무'}},roles:{}};
 assert.equal((await req(id,'projects','POST',{project:p})).status,403);
 assert.equal((await req('u_12','projects','POST',{project:p})).status,200);
 let remote=(await req(id,'projects')).data.projects.find(r=>r.project.id===p.id).project;
 const items=assignedItems(id,'2026-09-21',[remote]);assert.equal(items.length,1);assert.equal(items[0].todayTask,'베트남 개별 업무');
 assert.equal(assignedItems(id,'2026-09-22',[remote]).length,1);assert.equal(assignedItems(id,'2026-09-23',[remote]).length,0);
 assert.equal((await req(id,'worklogs/viet-log','PUT',{log:{id:'viet-log',date:'2026-09-21',items,department:'마감팀'}})).status,200);
 const changed=structuredClone(remote);changed.subTasks.내부.memo='변경된 공종 업무';
 assert.equal((await req('u_12','projects','POST',{base:remote,project:changed})).status,200);
 assert.equal((await req(id,'personal')).data.worklogs[0].items[0].todayTask,'변경된 공종 업무');
 remote=(await req(id,'projects')).data.projects.find(r=>r.project.id===p.id).project;
 const removed=structuredClone(remote);removed.subTasks.내부.personIds=removed.subTasks.내부.personIds.filter(x=>x!==id);
 assert.equal((await req('u_12','projects','POST',{base:remote,project:removed})).status,200);
 assert.equal((await req(id,'personal')).data.worklogs[0].items.length,1);
 const final=(await req(id,'projects')).data.projects.find(r=>r.project.id===p.id).project;
 assert.deepEqual(final.subTasks.내부.personIds,['vt_in1','other']);
 const noTeam=structuredClone(final);noTeam.subTasks.내부.personIds=noTeam.subTasks.내부.personIds.filter(x=>x!=='vt_in1');
 assert.equal((await req('u_12','projects','POST',{base:final,project:noTeam})).status,200);
 assert.equal((await req(id,'personal')).data.worklogs[0].items.length,0);
 assert.deepEqual((await req(id,'projects')).data.projects.find(r=>r.project.id===p.id).project.subTasks.내부.personIds,['other']);
});
await test('납품 후 수정은 담당자 할 일·업무일지에만 반영하고 공정률은 보존',async()=>{
 const task={id:'follow-qa',kind:'수정',startDate:'2026-10-01',endDate:'2026-10-02',memo:'새 도면으로 물량 수정',personIds:['worker'],status:'예정'};
 const p={...structuredClone(project),id:'follow-personal',code:'FOLLOW-QA',postDeliveryTasks:[task]};
 assert.equal((await req('u_12','projects','POST',{project:p})).status,200);
 const item=assignedItems('worker','2026-10-01',[p])[0];assert.equal(item.todayTask,task.memo);assert.equal(item.roleName,'납품 후 수정');
 assert.equal(assignedItems('other','2026-10-01',[p]).length,0);
 assert.equal(assignedItems('worker','2026-10-03',[p]).length,0);
 assert.equal((await req('worker','task-checks','POST',{day:'2026-10-01',taskId:item.id,done:true})).status,200);
 assert.equal((await req('worker','worklogs/follow-log','PUT',{log:{id:'follow-log',date:'2026-10-01',items:[item],department:'마감팀'}})).status,200);
 const saved=JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(p.id).body);assert.equal(saved.progress,0);
});
await test('열린 일지 저장·상신 직전 변경된 팀 일정은 최신 배정으로 확정',async()=>{
 const day='2026-09-22',p={...structuredClone(project),id:'race-qa',code:'RACE-QA',subTasks:{PM:{roleName:'PM',personIds:['worker'],startDate:day,endDate:day,status:'예정',memo:'변경 전 업무'}},roles:{}};
 assert.equal((await req('u_12','projects','POST',{project:p})).status,200);
 const stale=assignedItems('worker',day,[p]);stale[0].progress=45;stale[0].manualFields=['progress'];
 const before=structuredClone(p);p.subTasks.PM.memo='저장 직전 새 업무';
 assert.equal((await req('u_12','projects','POST',{base:before,project:p})).status,200);
 const saved=await req('worker','worklogs/wl-race','PUT',{log:{id:'wl-race',date:day,items:stale,department:'마감팀'}});
 assert.equal(saved.status,200);
 assert.equal(saved.data.log.items.find(i=>i.projectId===p.id).todayTask,'저장 직전 새 업무');
 assert.equal(saved.data.log.items.find(i=>i.projectId===p.id).progress,45);
 const latest=structuredClone(p);p.subTasks.PM.memo='상신 직전 새 업무';
 assert.equal((await req('u_12','projects','POST',{base:latest,project:p})).status,200);
 const submitted=await req('worker','worklogs/wl-race/submit','POST',{revision:saved.data.log.serverRevision});
 assert.equal(submitted.status,200);
 assert.equal(submitted.data.log.items.find(i=>i.projectId===p.id).todayTask,'상신 직전 새 업무');
 assert.equal(submitted.data.log.items.find(i=>i.projectId===p.id).progress,45);
});
const identityProject=(marker='anchor-A',ids=['anchor-A','replacement-B'],owner='worker',end='2026-10-08')=>({id:'identity-project',code:'QA-IDENTITY',name:'합성 명시 구간',department:'마감팀',pmId:'u_12',startDate:'2026-10-06',endDate:end,status:'진행중',progress:35,roles:{},subTasks:{내부:{roleName:'내부',personId:owner,personIds:[owner],startDate:'2026-10-06',endDate:end,status:'진행중',progress:35,memo:'원 공종메모',reportingMode:'TASK',legacyAllocationId:marker,allocations:ids.map(id=>({id,personIds:[owner],startDate:'2026-10-06',endDate:end,memo:id==='anchor-A'?'A 원 투입':'B 별도 투입'}))}}});
const identityOld=p=>({...assignedTasks('worker',[p])[0],todayTask:'원 직접수행 A',reportHtml:'<b>원 직접수행 A</b>',progress:70,status:'진행중',tomorrowPlan:'원 내일 계획',notes:'원 메모',dailyGoal:'원 목표',plannedDetails:'원 상세 계획',planMemo:'원 계획 메모',planStartedAt:'2026-10-07T01:00:00Z',attachments:[{name:'원 첨부',url:'https://example.invalid/retained'}],manualFields:['todayTask','reportHtml','progress','status','tomorrowPlan','notes','dailyGoal','plannedDetails','planMemo','planStartedAt','attachments']});
const removedExact=(actual,old)=>assert.deepEqual(actual,{...old,scheduleRemoved:true});
await test('명시 구간 연결: 직접 same-id A→B는 원문/첨부/70/A를삭제표시로보존·B복사0',()=>{
 const p=identityProject(),old=identityOld(p),next=identityProject('replacement-B',['replacement-B']),assigned=assignedTasks('worker',[next]),snapshot=structuredClone({old,assigned});const rows=reconcileItems([old],assigned);assert.equal(rows.length,1);removedExact(rows[0],old);assert.deepEqual({old,assigned},snapshot);assert.equal(assigned[0].progress,35);
});
await test('명시 구간 연결: 활성일 marker교체는 마지막 legacy덮기없이 A원문보존·ID중복0',()=>{
 const p=identityProject(),old=identityOld(p),next=identityProject('replacement-B',['replacement-B']),snapshot=structuredClone(next),rows=reconcileWorkLogItems([old],'worker','2026-10-07',[next]);assert.equal(rows.length,1);removedExact(rows[0],old);assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);assert.deepEqual(next,snapshot);
});
await test('명시 구간 연결: 기한경과 TASK same-id B를oldA id만으로재추가하지않음',()=>{
 const p=identityProject('anchor-A',['anchor-A'],'worker','2026-10-07'),old=identityOld(p),next=identityProject('replacement-B',['replacement-B'],'worker','2026-10-07'),rows=reconcileWorkLogItems([old],'worker','2026-10-12',[next]);assert.equal(rows.length,1);removedExact(rows[0],old);assert.equal(rows[0].endDate,'2026-10-07');
});
await test('명시 구간 연결: allocation명시A를same-id 무구간legacy로삭제하거나이동하지않음',()=>{
 const p=identityProject(),old=identityOld(p),next=structuredClone(p);delete next.subTasks.내부.allocations;delete next.subTasks.내부.legacyAllocationId;const rows=reconcileWorkLogItems([old],'worker','2026-10-07',[next]);assert.equal(rows.length,1);removedExact(rows[0],old);
});
await test('명시 구간 연결: 원A도남은잘못된marker는옛genID보존·현재suffix A원값35·중복0',()=>{
 const old=identityOld(identityProject()),next=identityProject('replacement-B',['anchor-A','replacement-B']),rows=reconcileWorkLogItems([old],'worker','2026-10-07',[next]);assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);removedExact(rows.find(row=>row.id===old.id),old);const fresh=rows.find(row=>row.id!==old.id);assert.equal(fresh.id,'gen-identity-project-내부-anchor-A');assert.equal(fresh.allocationId,'anchor-A');assert.equal(fresh.progress,35);assert.deepEqual(fresh.manualFields,[]);
});
await test('명시 구간 연결: 정상anchor의옛ID/완료체크ID·A실적70·B원값35·기한후A연결유지',()=>{
 const p=identityProject(),old=identityOld(p),rows=reconcileWorkLogItems([old],'worker','2026-10-07',[p]),current=rows.find(row=>row.id===old.id);assert.equal(current.allocationId,'anchor-A');assert.equal(current.scheduleRemoved,false);for(const key of old.manualFields)assert.deepEqual(current[key],old[key]);assert.equal(assignedItems('worker','2026-10-07',[p]).find(row=>row.allocationId==='anchor-A').id,old.id);assert.equal(rows.find(row=>row.allocationId==='replacement-B').progress,35);const overdue=reconcileWorkLogItems([old],'worker','2026-10-12',[p]);assert.equal(overdue.length,1);assert.equal(overdue[0].allocationId,'anchor-A');assert.equal(overdue[0].scheduleRemoved,false);assert.equal(overdue[0].endDate,old.endDate);
});
await test('명시 구간 연결: 현재활성유일사번alias에서도다른B로원문70을복사하지않음',()=>{
 const actor={id:'worker',name:'합성 개인',no:81501,active:true},aliases=assignmentAliases(actor,[actor]),p=identityProject('anchor-A',['anchor-A'],'81501'),old={...identityOld(identityProject()),...assignedTasks('worker',[p],aliases)[0],todayTask:'원 직접수행 A',progress:70,manualFields:['todayTask','progress']},next=identityProject('replacement-B',['replacement-B'],'81501'),rows=reconcileWorkLogItems([old],'worker','2026-10-07',[next],aliases);assert.equal(rows.length,1);removedExact(rows[0],old);assert.equal(assignedItems('worker','2026-10-07',[next],aliases).length,1);
});
await test('명시 구간 연결: allocation없는구형최초연결과동일A의최신보고방식은기존대로',()=>{
 const p=identityProject('anchor-A',['anchor-A']),old=identityOld(p);delete old.allocationId;delete old.legacyAllocationId;const rows=reconcileWorkLogItems([old],'worker','2026-10-07',[p]);assert.equal(rows.length,1);assert.equal(rows[0].id,old.id);assert.equal(rows[0].allocationId,'anchor-A');assert.equal(rows[0].scheduleRemoved,false);const changed=structuredClone(p);changed.subTasks.내부.reportingMode='DAILY';const updated=reconcileWorkLogItems(rows,'worker','2026-10-07',[changed])[0];assert.equal(updated.allocationId,'anchor-A');assert.equal(updated.reportBasis,'DAILY');assert.equal(updated.reportingMode,'DAILY');assert.equal(updated.progress,70);assert.deepEqual(updated.attachments,old.attachments);
});
await test('명시 구간 연결: 새 anchor DRAFT의 personal GET은 최신 일정 metadata와 수기 수행·계획을 함께 보존',async()=>{
 const day='2026-10-07',p=identityProject('anchor-A',['anchor-A']);p.id='qa-anchor-draft94';p.code='QA-ANCHOR94';
 const created=await req('u_12','projects','POST',{project:p});assert.equal(created.status,200);let base=created.data.project;
 const initial=assignedItems('worker',day,[base])[0],saved=await req('worker','worklogs/anchor-draft94','PUT',{log:{id:'anchor-draft94',date:day,items:[initial],overallNotes:'직접 종합 메모'}});assert.equal(saved.status,200);
 let next=structuredClone(base);Object.assign(next.subTasks.내부.allocations[0],{startDate:'2026-10-05',endDate:'2026-10-13',memo:'새 구간 업무'});
 let updated=await req('u_12','projects','POST',{base,project:next});assert.equal(updated.status,200);base=updated.data.project;
 let read=(await req('worker','personal')).data.worklogs.find(log=>log.id==='anchor-draft94'),row=read.items[0];
 assert.equal(row.id,initial.id);assert.equal(row.allocationId,'anchor-A');assert.equal(row.startDate,'2026-10-05');assert.equal(row.endDate,'2026-10-13');assert.equal(row.scheduleMemo,'새 구간 업무');assert.equal(row.todayTask,'새 구간 업무');assert.equal(read.serverRevision,saved.data.log.serverRevision);assert.equal(read.overallNotes,'직접 종합 메모');
 const typed={...row,todayTask:'수기 수행 원문',progress:70,tomorrowPlan:'수기 내일 계획',dailyGoal:'수기 목표',plannedDetails:'수기 세부 계획',manualFields:['todayTask','progress','tomorrowPlan','dailyGoal','plannedDetails']};
 const stored=await req('worker','worklogs/anchor-draft94','PUT',{revision:read.serverRevision,log:{...read,items:[typed]}});assert.equal(stored.status,200);
 next=structuredClone(base);Object.assign(next.subTasks.내부.allocations[0],{endDate:'2026-10-14',memo:'두 번째 구간 업무'});updated=await req('u_12','projects','POST',{base,project:next});assert.equal(updated.status,200);
 read=(await req('worker','personal')).data.worklogs.find(log=>log.id==='anchor-draft94');row=read.items[0];assert.equal(row.endDate,'2026-10-14');assert.equal(row.scheduleMemo,'두 번째 구간 업무');for(const key of typed.manualFields)assert.deepEqual(row[key],typed[key]);assert.equal(read.serverRevision,stored.data.log.serverRevision);assert.equal(read.approvalStatus,'DRAFT');assert.equal(row.scheduleRemoved,false);
});
db.close();if(process.argv[2]&&!process.argv[2].startsWith('--'))writeFileSync(process.argv[2],JSON.stringify({kind:'ACTUAL_PERSONAL_API_AND_EXPLICIT_ALLOCATION_HELPERS_SYNTHETIC',explicitIdentityOnly:onlyExplicitIdentity,externalRequests:0,results},null,2)+'\n');if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
