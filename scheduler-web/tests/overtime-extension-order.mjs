import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {handleCollaboration,tokenHash} from '../../functions/lib/collaboration.ts';
import {assignedTasks} from '../src/utils/personalWork.ts';

const {db,DB}=database(),results=[],cookies=new Map();
const worker={id:'order-worker',name:'합성 야근 직원',department:'마감팀',position:'프로',active:true};
const peer={...worker,id:'order-peer',name:'합성 동료'};
const pm={...worker,id:'order-pm',name:'합성 PM'};
const managers=['마감팀','구조팀','토목&조경팀'].map((department,index)=>({...worker,id:['u_12','u_24','u_8'][index],name:'합성 '+department+' 실장',department,position:'실장'}));
const actors=[worker,peer,pm,...managers],manager=department=>managers.find(actor=>actor.department===department);
for(const actor of actors){
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(actor.id,actor.id,actor.id+'@example.invalid',actor.name,actor.department,actor.position,JSON.stringify(actor),'synthetic-unused','synthetic-unused');
 const token='synthetic-order-'+actor.id;db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),actor.id,Date.now()+3600000);cookies.set(actor.id,'studio_session='+token);
}
const api=async(actor,path,body)=>{const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method:'POST',headers:{Cookie:cookies.get(actor.id),'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB},async()=>{throw Error('Archive outside scope');});return {status:response.status,data:await response.json()};};
const current=id=>{const row=db.prepare('SELECT * FROM studio_projects WHERE id=?').get(id);return {project:JSON.parse(row.body),revision:row.revision};};
const snapshot=id=>({project:db.prepare('SELECT * FROM studio_projects WHERE id=?').get(id),notices:db.prepare('SELECT * FROM studio_notifications ORDER BY id').all(),logs:db.prepare('SELECT * FROM studio_worklogs ORDER BY id').all()});
const update=(id,change)=>{const row=current(id),next=structuredClone(row.project);change(next);db.prepare('UPDATE studio_projects SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),id);return current(id);};
const project=(id,department='마감팀',kind='single')=>{
 const role=department==='구조팀'?'보':department==='토목&조경팀'?'토목':'조적';
 const task={roleName:role,personId:worker.id,personIds:kind==='shared'?[worker.id,peer.id]:[worker.id],startDate:'2026-10-14',endDate:'2026-11-13',status:'진행중',progress:35,memo:'합성 배정 원문',dateMode:'CUSTOM'};
 if(kind==='allocation')task.allocations=[{id:'original-segment',personIds:[worker.id],startDate:task.startDate,endDate:task.endDate}];
 return {id,code:'QA-ORDER-130-'+id,name:'합성 야근·연장 승인 순서',department,pmId:pm.id,startDate:task.startDate,endDate:task.endDate,status:'진행중',progress:35,roles:{},subTasks:kind==='followup'?{}:{[role]:task},...(kind==='followup'?{postDeliveryTasks:[{id:'follow',kind:'검토',personIds:[worker.id],startDate:'2026-11-14',endDate:'2026-11-16',status:'진행중',progress:35,memo:'합성 후속 원문'}]}:{})};
};
async function setup(name,department='마감팀',kind='single'){
 const p=project(name,department,kind),created=await api(manager(department),'projects',{project:p});assert.equal(created.status,200,JSON.stringify(created.data));
 db.prepare('INSERT INTO studio_worklogs (id,user_id,day,department,body,revision) VALUES (?,?,?,?,?,?)').run('preserved-approved',worker.id,'2026-10-14',department,JSON.stringify({id:'preserved-approved',approvalStatus:'APPROVED_FINAL',overallNotes:'변경 금지 합성 승인 일지',items:[]}),7);
 const task=assignedTasks(worker.id,[created.data.project])[0];assert.ok(task);
 const overtime=await api(worker,`projects/${p.id}/extensions`,{taskId:task.id,previousEnd:task.endDate,type:'OVERTIME',workDate:kind==='followup'?'2026-11-14':'2026-10-15',startTime:'17:00',endTime:'20:00',reason:'합성 야근 원문',approverId:manager(department).id});assert.equal(overtime.status,200,JSON.stringify(overtime.data));
 return {p,task,overtime:overtime.data.request};
}
const decide=(actor,p,request,revision=current(p.id).revision)=>api(actor,`projects/${p.id}/extensions/${request.id}/approve`,{revision,memo:'합성 승인 원문'});
async function extend({p,task},end='2026-11-16',onlyReview=false){
 const active=assignedTasks(worker.id,[current(p.id).project]).find(candidate=>candidate.id===task.id);assert.ok(active);
 const submitted=await api(worker,`projects/${p.id}/extensions`,{taskId:active.id,previousEnd:active.endDate,type:'DEADLINE',requestedEnd:end,reason:'합성 연장 원문'});assert.equal(submitted.status,200,JSON.stringify(submitted.data));
 const reviewed=await decide(pm,p,submitted.data.request);assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));assert.equal(reviewed.data.request.status,'PENDING');assert.equal(reviewed.data.request.approvalStage,'TEAM');
 if(onlyReview)return reviewed;
 const final=await decide(manager(p.department),p,reviewed.data.request);assert.equal(final.status,200,JSON.stringify(final.data));assert.equal(final.data.request.status,'APPROVED');return final;
}
async function approveOvertime(state){
 const {p,overtime}=state,before=snapshot(p.id),approved=await decide(manager(p.department),p,overtime);assert.equal(approved.status,200,JSON.stringify(approved.data));
 const after=snapshot(p.id),request=approved.data.request;
 assert.equal(request.status,'APPROVED');
 for(const key of ['taskId','allocationId','userId','roleName','previousEnd','requestedEnd','workDate','startTime','endTime','hours','reason','createdAt'])assert.deepEqual(request[key],overtime[key],key);
 assert.equal(request.workDate,p.postDeliveryTasks?'2026-11-14':'2026-10-15');assert.equal(request.startTime,'17:00');assert.equal(request.endTime,'20:00');assert.equal(request.hours,3);assert.equal(request.userId,worker.id);
 const original=JSON.parse(before.project.body),next=JSON.parse(after.project.body);delete original.scheduleExtensions;delete next.scheduleExtensions;assert.deepEqual(next,original);assert.deepEqual(after.logs,before.logs);
 const notice=after.notices.filter(row=>row.id==='extension-approved:'+overtime.id);assert.equal(notice.length,1);assert.equal(notice[0].user_id,worker.id);assert.match(notice[0].message,new RegExp(request.workDate));assert.match(notice[0].message,/17:00 ~ 20:00, 3시간/);assert.equal(after.notices.length,before.notices.length+1);
 const frozen=snapshot(p.id);assert.equal((await decide(manager(p.department),p,overtime)).status,409);assert.deepEqual(snapshot(p.id),frozen);
 return approved;
}
async function blocked(state,status=409,actor=manager(state.p.department),revision){const frozen=snapshot(state.p.id),result=await decide(actor,state.p,state.overtime,revision);assert.equal(result.status,status,JSON.stringify(result.data));assert.deepEqual(snapshot(state.p.id),frozen);return result;}
async function check(name,run){
 try{for(const table of ['studio_projects','studio_notifications','studio_worklogs'])db.prepare('DELETE FROM '+table).run();for(const actor of actors)db.prepare('UPDATE studio_users SET department=?,position=?,active=1 WHERE id=?').run(actor.department,actor.position,actor.id);await run();results.push({name,status:'PASS'});console.log('PASS',name);}
 catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}
}
try{
 for(const department of ['마감팀','구조팀','토목&조경팀'])await check(`${department} 같은 업무 연장 최종승인 후 야근 승인·시간/원문/일지 보존·개인 알림1·재승인409`,async()=>{const state=await setup('ordered-'+department,department);await extend(state);await approveOvertime(state);});
 for(const kind of ['allocation','followup','shared'])await check(`${kind} 원업무·개인구간의 연장 먼저 승인 후 야근 정상 승인`,async()=>{const state=await setup('kind-'+kind,'마감팀',kind);await extend(state,kind==='followup'?'2026-11-18':'2026-11-16');await approveOvertime(state);});
 await check('야근 먼저 승인 후 연장 PM→실장 최종승인도 독립·각 알림1',async()=>{const state=await setup('overtime-first');await approveOvertime(state);const final=await extend(state);assert.equal(final.data.project.scheduleExtensions.find(row=>row.id===state.overtime.id).status,'APPROVED');assert.equal(db.prepare("SELECT count(*) n FROM studio_notifications WHERE user_id=? AND id LIKE 'extension-approved:%'").get(worker.id).n,2);});
 await check('PM 검토만 완료된 연장 대기 상태에서도 야근 승인 후 최종 연장 가능',async()=>{const state=await setup('pm-review-only'),reviewed=await extend(state,'2026-11-16',true);await approveOvertime(state);assert.equal((await decide(manager(state.p.department),state.p,reviewed.data.request)).status,200);});
 await check('동일 업무 두 차례 승인 연장 연쇄 뒤 야근 승인·기존 마감 원문 유지',async()=>{const state=await setup('extension-chain');await extend(state);await extend(state,'2026-11-19');const final=await approveOvertime(state);assert.equal(final.data.request.previousEnd,'2026-11-13');assert.equal(assignedTasks(worker.id,[final.data.project]).find(task=>task.id===state.task.id).endDate,'2026-11-19');});
 await check('type 없는 기존 승인 완료일 이력도 같은 업무 연장 연쇄로 판정',async()=>{const state=await setup('legacy-type');await extend(state);update(state.p.id,p=>{delete p.scheduleExtensions.find(row=>row.type==='DEADLINE').type;});await approveOvertime(state);});
 await check('일반 수동 마감일 변경은 승인 연장 이력이 없으므로409·업무/일지/알림 불변',async()=>{const state=await setup('manual-end');update(state.p.id,p=>p.subTasks.조적.endDate='2026-11-20');await blocked(state);});
 await check('정상 연장 승인 뒤 별도 수동 마감 변경은 이력으로 설명되지 않아409',async()=>{const state=await setup('approved-plus-manual');await extend(state);update(state.p.id,p=>p.subTasks.조적.endDate='2026-11-20');await blocked(state);});
 await check('공동배정에서 다른 개인 추가구간 승인 이력은 원구간 수동 연장 허용 근거가 아님',async()=>{const state=await setup('shared-false-history','마감팀','shared');await extend(state);update(state.p.id,p=>{p.subTasks.조적.allocations.find(row=>row.id===p.subTasks.조적.legacyAllocationId).endDate='2026-11-16';});await blocked(state);});
 await check('신청 전 과거 승인 이력과 현재 수동 날짜 일치만으로 야근 승인 우회 불가',async()=>{const state=await setup('old-history');await extend(state);update(state.p.id,p=>{p.scheduleExtensions.find(row=>row.type==='DEADLINE').decidedAt='2000-01-01T00:00:00.000Z';});await blocked(state);});
 await check('다른 직원의 연장 승인 이력은 동일 task 문자열이어도 야근 승인 우회 불가',async()=>{const state=await setup('other-history');await extend(state);update(state.p.id,p=>p.scheduleExtensions.find(row=>row.type==='DEADLINE').userId=peer.id);await blocked(state);});
 await check('담당자가 제거된 원업무의 대기 야근은409·일지/알림 불변',async()=>{const state=await setup('removed-owner');await extend(state);update(state.p.id,p=>p.subTasks.조적.personIds=[peer.id]);await blocked(state);});
 await check('원래 allocation이 교체되면 승인 연장 이력이 있어도409·원문/알림 불변',async()=>{const state=await setup('replaced-allocation','마감팀','allocation');await extend(state);update(state.p.id,p=>p.subTasks.조적.allocations[0].id='replacement');await blocked(state);});
 await check('배정 시작일이 야근 신청일 뒤로 이동하면 승인 연장 이력이 있어도409',async()=>{const state=await setup('shifted-start');await extend(state);update(state.p.id,p=>p.subTasks.조적.startDate='2026-10-16');const result=await blocked(state);assert.match(result.data.error,/시작일/);});
 await check('현재 시작일이 야근일과 같으면 기존 시작일 정책대로 승인',async()=>{const state=await setup('same-start');await extend(state);update(state.p.id,p=>p.subTasks.조적.startDate=state.overtime.workDate);await approveOvertime(state);});
 await check('이전 revision은 연장 승인 뒤409·최신 revision으로만 야근 승인',async()=>{const state=await setup('stale'),old=current(state.p.id).revision;await extend(state);await blocked(state,409,manager(state.p.department),old);await approveOvertime(state);});
 await check('지정자 아닌 다른 팀 실장은 유효 연장 이력과 무관하게403',async()=>{const state=await setup('foreign-approver');await extend(state);await blocked(state,403,manager('구조팀'));});
 await check('프로젝트 CAS 경쟁은 승인·알림을 쓰지 않고409',async()=>{const state=await setup('project-race');await extend(state);const before=snapshot(state.p.id),batch=DB.batch;DB.batch=async statements=>{db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(state.p.id);return batch(statements);};let result;try{result=await decide(manager(state.p.department),state.p,state.overtime);}finally{DB.batch=batch;}assert.equal(result.status,409);const after=snapshot(state.p.id);assert.equal(after.project.body,before.project.body);assert.deepEqual(after.logs,before.logs);assert.deepEqual(after.notices,before.notices);await approveOvertime(state);});
 await check('승인자 직급이 batch 전에 바뀌면 권한 CAS409·업무/일지/알림 불변',async()=>{const state=await setup('actor-race');await extend(state);const before=snapshot(state.p.id),batch=DB.batch;DB.batch=async statements=>{db.prepare('UPDATE studio_users SET position=? WHERE id=?').run('프로',manager(state.p.department).id);return batch(statements);};let result;try{result=await decide(manager(state.p.department),state.p,state.overtime);}finally{DB.batch=batch;}assert.equal(result.status,409);assert.deepEqual(snapshot(state.p.id),before);});
}finally{db.close();}
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||new URL('../test-results/overtime-extension-order.json',import.meta.url);mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_COLLABORATION_API_SQLITE_OVERTIME_DEADLINE_ORDER',operatingWrites:0,providerCalls:0,results},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
