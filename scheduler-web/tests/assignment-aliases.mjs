import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {database} from './d1.mjs';

const before=process.argv.includes('--before');
const onlyTeamRefs=process.argv.includes('--only-team-refs');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/assignment-aliases.json';
if(before){
 const paths=['scheduler-web/src/utils/personalWork.ts','scheduler-web/src/utils/workLogReporting.ts','functions/lib/personal.ts','functions/lib/scheduleExtensions.ts'];
 registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);const path=paths.find(path=>url===new URL('../../'+path,import.meta.url).href);return path?{...loaded,source:readFileSync(new URL('../../private-provisioning/original-before-personal-alias-20261006/'+path,import.meta.url),'utf8')}:loaded;}});
}
const personal=await import('../src/utils/personalWork.ts');
const {handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts');
const {proposedProgress}=await import('../src/utils/workLogReporting.ts');
const {VIET_TEAMS_DATA}=await import('../src/data/vietTeams.ts');
const {assignedTasks,assignedItems,reconcileWorkLogItems}=personal;
const aliasesFor=personal.assignmentAliases||((actor)=>actor?.id?[actor.id]:[]);
const {db,DB}=database(),env={DB},cookies=new Map(),results=[];
const worker={id:'alias-worker',name:'유일한 합성 직원',no:81501,department:'마감팀',position:'프로',active:true,email:'alias-worker@example.invalid'};
const other={id:'alias-other',name:'별도 합성 직원',no:81502,department:'마감팀',position:'프로',active:true,email:'alias-other@example.invalid'};
const leader={id:'u_13',name:'합성 검토 팀장',no:81503,department:'마감팀',position:'팀장',active:true,email:'alias-leader@example.invalid'};
const chief={id:'u_12',name:'합성 승인 실장',no:81504,department:'마감팀',position:'실장',active:true,email:'alias-chief@example.invalid'};
const directory=[worker,other,leader,chief];
for(const user of directory){
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(user.id,user.id,user.email,user.name,user.department,user.position,JSON.stringify(user),'synthetic-unused','synthetic-unused');
 const token='synthetic-alias-session-'+user.id;
 db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),user.id,Date.now()+3600000);cookies.set(user.id,'studio_session='+token);
}
const request=async(actor,path,method='GET',body)=>{const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{Cookie:cookies.get(actor.id),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,async()=>{throw Error('Archive is outside this isolated test');});const result={status:response.status,data:await response.json()};if(method==='POST'&&path.endsWith('/approve')&&result.status===200&&result.data.request?.status==='PENDING'&&result.data.request.approvalStage==='TEAM')return request(actor,path,method,{...body,revision:result.data.revision});return result;};
const readProject=async id=>(await request(worker,'projects')).data.projects.find(row=>row.project.id===id);
const task=identifier=>({roleName:'조적',personId:identifier,personIds:[identifier],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'합성 배정 원문',progress:35,reportingModes:{[identifier]:'TASK'}});
const project=(id,identifier)=>({id,code:'QA-ALIAS',name:'합성 식별자 연동',department:'마감팀',pmId:'',startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',progress:35,roles:{},subTasks:{조적:task(identifier)}});
const journal=(id,item,date='2026-10-06')=>({id,userId:worker.id,date,items:[{...item,todayTask:'합성 수행 원문',progress:70,manualFields:['todayTask','progress']}],reportMode:item.reportBasis,overallNotes:'합성 일지 원문'});
async function check(name,fn){if(onlyTeamRefs&&!name.startsWith('기존 VN 팀 참조:'))return;try{for(const table of ['studio_projects','studio_worklogs','studio_task_checks'])db.prepare('DELETE FROM '+table).run();await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.log('FAIL',name,error.message);}}
async function approve(log){let r=await request(worker,'worklogs/'+log.id+'/submit','POST',{revision:log.serverRevision});assert.equal(r.status,200,JSON.stringify(r.data));r=await request(leader,'worklogs/'+log.id+'/review','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200,JSON.stringify(r.data));r=await request(chief,'worklogs/'+log.id+'/approve','POST',{revision:r.data.log.serverRevision});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.log;}
try{
 await check('활성 명부의 유일한 이름·직원번호만 개인 별칭으로 선별',()=>assert.deepEqual(aliasesFor({id:worker.id},directory),[worker.id,worker.name,String(worker.no)]));
 await check('원 actor의 오래된 메타정보보다 같은 ID 명부 원문을 우선',()=>assert.deepEqual(aliasesFor({...worker,name:'오래된 이름',no:999},directory),[worker.id,worker.name,String(worker.no)]));
 await check('중복 이름·직원번호 및 이름/번호 간 충돌은 개인 연결하지 않음',()=>{
  const duplicate={...other,name:worker.name,no:worker.no};assert.deepEqual(aliasesFor(worker,[worker,duplicate]),[worker.id]);
  assert.ok(!aliasesFor(worker,[worker,{...other,name:String(worker.no)}]).includes(String(worker.no)));
 });
 await check('비활성·알 수 없는 대상은 이름/번호 대신 canonical ID만 유지',()=>{
  assert.deepEqual(aliasesFor(worker,[{...worker,active:false}]),[worker.id]);assert.deepEqual(aliasesFor(worker,[]),[worker.id]);
 });
 await check('명부 번호의 객체·무한값은 문자열로 강제 변환하여 참조하지 않음',()=>{
  for(const no of [{value:worker.no},Infinity,NaN])assert.deepEqual(aliasesFor({...worker,no},[{...worker,no}]),[worker.id,worker.name]);
 });
 await check('이름 또는 번호가 다른 canonical ID이면 ID 소유자가 우선',()=>{
  const collision={...worker,name:other.id,no:81501};assert.ok(!aliasesFor(collision,[collision,other]).includes(other.id));
  assert.ok(!aliasesFor(worker,[worker,{...other,id:String(worker.no)}]).includes(String(worker.no)));
 });
 await check('VI 팀 코드/팀 표시명은 개인 계정 별칭으로 확장하지 않음',()=>{
  for(const name of [VIET_TEAMS_DATA[0].code,VIET_TEAMS_DATA[0].displayName])assert.ok(!aliasesFor({...worker,name},[{...worker,name}]).includes(name));
 });
 await check('기존 VN 팀 참조: 정확한 ID/code/name/displayName은 역사 구성원의 같은 Task·기간·보고 방식으로 연결하고 실제 API GET은 원문 유지',async()=>{
  for(const team of VIET_TEAMS_DATA){
   const actor={...worker,id:team.members[0].id,name:'합성 기존 팀 구성원 '+team.code,no:'legacy-'+team.code,department:team.department};
   db.prepare('INSERT OR IGNORE INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(actor.id,actor.id,actor.id+'@example.invalid',actor.name,actor.department,actor.position,JSON.stringify(actor),'synthetic-unused','synthetic-unused');
   const token='synthetic-team-reference-'+actor.id;db.prepare('INSERT OR IGNORE INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),actor.id,Date.now()+3600000);cookies.set(actor.id,'studio_session='+token);
   const canonical=project('team-reference-'+team.id,team.id);canonical.department=team.department;canonical.subTasks.조적.reportingModes={[team.id]:'TASK'};
   const expected=assignedTasks(actor.id,[canonical])[0];assert.ok(expected);
   for(const reference of [team.id,team.code,team.name,team.displayName]){
    const p=structuredClone(canonical);Object.assign(p.subTasks.조적,{personId:reference,personIds:[reference],reportingMode:'DAILY',reportingModes:{[reference]:'TASK'}});const snapshot=structuredClone(p),rows=assignedTasks(actor.id,[p]);
    assert.equal(rows.length,1,team.code+' '+reference);assert.equal(rows[0].id,expected.id);assert.equal(rows[0].startDate,expected.startDate);assert.equal(rows[0].endDate,expected.endDate);assert.equal(rows[0].reportingMode,'TASK');assert.deepEqual(p,snapshot);
    p.subTasks.조적.reportingModes[actor.id]='DAILY';assert.equal(assignedTasks(actor.id,[p])[0].reportingMode,'DAILY');delete p.subTasks.조적.reportingModes[actor.id];
    const body=JSON.stringify(p),logBody=JSON.stringify({id:'team-log-'+team.id,userId:actor.id,date:'2026-10-06',department:team.department,approvalStatus:'DRAFT',items:[{...rows[0],scheduleDerived:true,manualFields:[]}]});
    db.prepare('INSERT OR REPLACE INTO studio_projects (id,body,revision,updated_at,updated_by) VALUES (?,?,1,?,?)').run(p.id,body,'2026-10-06T00:00:00Z',actor.id);
    db.prepare('INSERT OR REPLACE INTO studio_worklogs (id,user_id,day,department,body,revision) VALUES (?,?,?,?,?,1)').run('team-log-'+team.id,actor.id,'2026-10-06',team.department,logBody);
    const response=await request(actor,'personal');assert.equal(response.status,200);const read=response.data.worklogs.find(log=>log.id==='team-log-'+team.id);assert.equal(read.items.length,1);assert.equal(read.items[0].id,expected.id);assert.equal(read.items[0].reportingMode,'TASK');assert.equal(read.items[0].startDate,expected.startDate);assert.equal(read.items[0].endDate,expected.endDate);
    assert.equal(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(p.id).body,body);assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('team-log-'+team.id).body,logBody);
   }
  }
 });
 await check('기존 VN 팀 참조: 팀 예약 표기와 같은 개인 이름/번호는 비구성원에게 업무나 API 일지 연결을 만들지 않음',async()=>{
  const team=VIET_TEAMS_DATA.find(team=>team.id==='vt_horiz');
  try{for(const reference of [team.id,team.code,team.name,team.displayName]){
   const collision={...worker,name:reference,no:reference},aliases=aliasesFor(collision,[collision,other]);assert.deepEqual(aliases,[worker.id]);assert.equal(personal.taskAssignedTo({personIds:[reference]},worker.id,aliases),false);
   const p=project('team-reserved-collision',reference),snapshot=structuredClone(p);assert.equal(assignedTasks(worker.id,[p],aliases).length,0);assert.deepEqual(p,snapshot);
   db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(collision),worker.id);db.prepare('INSERT OR REPLACE INTO studio_projects (id,body,revision,updated_at,updated_by) VALUES (?,?,1,?,?)').run(p.id,JSON.stringify(p),'2026-10-06T00:00:00Z',worker.id);
   const log={id:'nonmember-team-log',userId:worker.id,date:'2026-10-06',department:worker.department,approvalStatus:'DRAFT',items:[{id:`gen-${p.id}-조적`,projectId:p.id,roleName:'조적',todayTask:'자동 후보',scheduleDerived:true,manualFields:[]}]};
   db.prepare('INSERT OR REPLACE INTO studio_worklogs (id,user_id,day,department,body,revision) VALUES (?,?,?,?,?,1)').run(log.id,worker.id,log.date,worker.department,JSON.stringify(log));
   const response=await request(worker,'personal');assert.equal(response.status,200);assert.deepEqual(response.data.worklogs.find(row=>row.id===log.id).items,[]);assert.equal((await request(worker,'task-checks','POST',{day:log.date,taskId:log.items[0].id,done:true})).status,403);
  }}finally{db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(worker),worker.id);}
 });
 await check('구형 roles·빈 기간·명시 배정 해제와 원본 객체 보존',()=>{
  const p={...project('unit-legacy',worker.name),subTasks:{},roles:{조적:{personId:worker.name,startDate:'',endDate:''}}},original=structuredClone(p),aliases=aliasesFor(worker,directory);
  const rows=assignedItems(worker.id,'2026-10-06',[p],aliases);assert.equal(rows.length,1);assert.equal(rows[0].startDate,p.startDate);assert.deepEqual(p,original);
  p.subTasks.조적={...task(worker.name),personIds:[]};assert.equal(assignedTasks(worker.id,[p],aliases).length,0);
  p.subTasks.조적.personIds=undefined;assert.equal(assignedTasks(worker.id,[p],aliases).length,1);
 });
 await check('보고 방식은 canonical 설정 우선, 현재 배정의 구형 키로만 대체',()=>{
  const p=project('unit-modes',worker.name),aliases=aliasesFor(worker,directory);
  assert.equal(assignedTasks(worker.id,[p],aliases)[0].reportingMode,'TASK');
  p.subTasks.조적.reportingModes[worker.id]='DAILY';assert.equal(assignedTasks(worker.id,[p],aliases)[0].reportingMode,'DAILY');
  delete p.subTasks.조적.reportingModes[worker.id];delete p.subTasks.조적.reportingModes[worker.name];p.subTasks.조적.reportingModes[String(worker.no)]='TASK';assert.equal(assignedTasks(worker.id,[p],aliases)[0].reportingMode,'DAILY');
 });
 for(const [format,identifier]of [['ID',worker.id],['이름',worker.name],['번호',String(worker.no)]])await check(`실제 API ${format}: 후보·체크·일지 재조회·승인·연장 연결 및 원배정 보존`,async()=>{
  const p={...project('api-'+format,identifier),pmId:chief.id},originalPersonIds=structuredClone(p.subTasks.조적.personIds),aliases=aliasesFor(worker,directory);
  assert.equal((await request(chief,'projects','POST',{project:p})).status,200);
  const row=assignedTasks(worker.id,[p],aliases)[0];assert.ok(row);assert.equal(row.reportBasis,'TASK');
  assert.equal((await request(worker,'task-checks','POST',{day:'2026-10-06',taskId:row.id,done:true})).status,200);
  assert.equal(proposedProgress(p,[{...row,progress:70,manualFields:['progress']}],'2026-10-06',worker.id,aliases),70);
  const input=journal('log-'+format,row),saved=await request(worker,'worklogs/'+input.id,'PUT',{log:input});assert.equal(saved.status,200,JSON.stringify(saved.data));
  const readByChief=(await request(chief,'personal')).data.worklogs.find(log=>log.id===input.id);assert.equal(readByChief.items[0].scheduleRemoved,false,'조회자는 승인자이나 별칭은 작성자 기준이어야 한다');
  const submittedBody=structuredClone(saved.data.log.items),approved=await approve(saved.data.log);assert.deepEqual(approved.items,submittedBody);
  let current=(await readProject(p.id)).project;assert.equal(current.subTasks.조적.progress,70);assert.equal(current.progress,70);assert.deepEqual(current.subTasks.조적.personIds,originalPersonIds);
  const extension=await request(worker,'projects/'+p.id+'/extensions','POST',{taskId:row.id,previousEnd:row.endDate,requestedEnd:'2026-10-12',type:'DEADLINE',reason:'합성 기간 연장'});assert.equal(extension.status,200,JSON.stringify(extension.data));
  const decision=await request(chief,'projects/'+p.id+'/extensions/'+extension.data.request.id+'/approve','POST',{revision:extension.data.revision});assert.equal(decision.status,200,JSON.stringify(decision.data));current=decision.data.project;assert.equal(current.subTasks.조적.endDate,'2026-10-12');assert.equal(current.endDate,p.endDate);assert.deepEqual(current.subTasks.조적.personIds,originalPersonIds);
 });
 await check('실제 API 구형 roles 이름 승인 시 원 담당·기간과 기존 작업일 가중식 보존',async()=>{
  const p={...project('api-legacy',worker.name),subTasks:{},roles:{조적:{personId:worker.name,startDate:'',endDate:''}}};assert.equal((await request(chief,'projects','POST',{project:p})).status,200);
  const item=assignedTasks(worker.id,[p],aliasesFor(worker,directory))[0];assert.ok(item);const log=journal('log-legacy',item);const saved=await request(worker,'worklogs/'+log.id,'PUT',{log});assert.equal(saved.status,200,JSON.stringify(saved.data));await approve(saved.data.log);
  const current=(await readProject(p.id)).project;assert.equal(current.subTasks.조적.personId,worker.name);assert.equal(current.subTasks.조적.startDate,p.startDate);assert.equal(current.subTasks.조적.endDate,p.endDate);assert.equal(current.progress,70);
 });
 await check('실제 API 이름 후속 업무만 승인해도 원 납품 전체값·공종·기한 유지',async()=>{
  const p={...project('api-followup',other.id),progress:55,postDeliveryTasks:[{id:'follow',kind:'수정',personIds:[worker.name],startDate:'2026-10-12',endDate:'2026-10-13',memo:'합성 후속 원문',status:'진행중',reportingModes:{[worker.name]:'TASK'}}]};assert.equal((await request(chief,'projects','POST',{project:p})).status,200);
  const item=assignedTasks(worker.id,[p],aliasesFor(worker,directory))[0];assert.ok(item);const log=journal('log-followup',item,'2026-10-12');log.items[0].progress=100;const saved=await request(worker,'worklogs/'+log.id,'PUT',{log});assert.equal(saved.status,200,JSON.stringify(saved.data));await approve(saved.data.log);
  const current=(await readProject(p.id)).project;assert.equal(current.progress,55);assert.equal(current.subTasks.조적.progress,35);assert.equal(current.endDate,p.endDate);assert.equal(current.postDeliveryTasks[0].progress,100);assert.deepEqual(current.postDeliveryTasks[0].personIds,[worker.name]);
 });
 await check('실제 API 담당 변경 뒤 기존 번호 일지 승인·연장 승인은 새 담당 실적을 덮지 않음',async()=>{
  const p={...project('api-reassigned',String(worker.no)),pmId:chief.id};assert.equal((await request(chief,'projects','POST',{project:p})).status,200);const item=assignedTasks(worker.id,[p],aliasesFor(worker,directory))[0];assert.ok(item);
  const log=journal('log-reassigned',item),saved=await request(worker,'worklogs/'+log.id,'PUT',{log});assert.equal(saved.status,200);const submitted=await request(worker,'worklogs/'+log.id+'/submit','POST',{revision:saved.data.log.serverRevision});assert.equal(submitted.status,200);
  const ext=await request(worker,'projects/'+p.id+'/extensions','POST',{taskId:item.id,previousEnd:item.endDate,requestedEnd:'2026-10-12',reason:'합성 변경 전 요청'});assert.equal(ext.status,200);
  const old=(await readProject(p.id)).project,next=structuredClone(old);Object.assign(next.subTasks.조적,{personId:other.id,personIds:[other.id],progress:40});assert.equal((await request(chief,'projects','POST',{base:old,project:next})).status,200);
  const review=await request(leader,'worklogs/'+log.id+'/review','POST',{revision:submitted.data.log.serverRevision});assert.equal(review.status,200);const approved=await request(chief,'worklogs/'+log.id+'/approve','POST',{revision:review.data.log.serverRevision});assert.equal(approved.status,200);const current=(await readProject(p.id));assert.equal(current.project.subTasks.조적.progress,40);assert.deepEqual(current.project.subTasks.조적.personIds,[other.id]);
  assert.equal((await request(chief,'projects/'+p.id+'/extensions/'+ext.data.request.id+'/approve','POST',{revision:current.revision})).status,409);
 });
 await check('실제 API 모호한 이름/번호·미확인값·팀 코드의 개인 체크와 Task 보고 거부',async()=>{
  const duplicate={...other,name:worker.name,no:worker.no};db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(duplicate),other.id);
  try{for(const [index,identifier]of [worker.name,String(worker.no),'미확인 식별자',VIET_TEAMS_DATA[0].code].entries()){
   const p=project('negative-'+index,identifier);assert.equal((await request(chief,'projects','POST',{project:p})).status,200);const id=`gen-${p.id}-조적`;
   assert.equal((await request(worker,'task-checks','POST',{day:'2026-10-06',taskId:id,done:true})).status,403);
   const row={id,projectId:p.id,roleName:'조적',reportBasis:'TASK',status:'진행중'};const log=journal('negative-log-'+index,row);assert.equal((await request(worker,'worklogs/'+log.id,'PUT',{log})).status,403);
  }}finally{db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(other),other.id);}
 });
 await check('실제 API directory profile ID 불일치는 다른 직원 별칭을 신뢰하지 않음',async()=>{
  db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify({...worker,id:other.id}),worker.id);
  try{const p=project('negative-profile',worker.name);assert.equal((await request(chief,'projects','POST',{project:p})).status,200);assert.equal((await request(worker,'task-checks','POST',{day:'2026-10-06',taskId:`gen-${p.id}-조적`,done:true})).status,403);}finally{db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(worker),worker.id);}
 });
 await check('실제 API 다른 canonical ID와 같은 이름은 ID 소유자만 체크 가능',async()=>{
  db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify({...worker,name:other.id}),worker.id);
  try{const p=project('negative-canonical-id',other.id);assert.equal((await request(chief,'projects','POST',{project:p})).status,200);const body={day:'2026-10-06',taskId:`gen-${p.id}-조적`,done:true};assert.equal((await request(worker,'task-checks','POST',body)).status,403);assert.equal((await request(other,'task-checks','POST',body)).status,200);}finally{db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(worker),worker.id);}
 });
 await check('실제 API 비활성 동명 직원은 활성 별칭을 가리지 않고 비활성 ID는 별칭이 되지 않음',async()=>{
  db.prepare('UPDATE studio_users SET profile=?,active=0 WHERE id=?').run(JSON.stringify({...other,name:worker.name,no:worker.no}),other.id);
  try{
   const p=project('active-unique-name',worker.name);assert.equal((await request(chief,'projects','POST',{project:p})).status,200);assert.equal((await request(worker,'task-checks','POST',{day:'2026-10-06',taskId:`gen-${p.id}-조적`,done:true})).status,200);
   db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify({...worker,name:other.id}),worker.id);
   const q=project('inactive-canonical-id',other.id);assert.equal((await request(chief,'projects','POST',{project:q})).status,200);const body={day:'2026-10-06',taskId:`gen-${q.id}-조적`,done:true};assert.equal((await request(worker,'task-checks','POST',body)).status,403);assert.equal((await request(other,'task-checks','POST',body)).status,401);
  }finally{db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(worker),worker.id);db.prepare('UPDATE studio_users SET profile=?,active=1 WHERE id=?').run(JSON.stringify(other),other.id);}
 });
 await check('일지 재조정은 Task 기한 초과 원문을 유지하고 배정 해제 후 연결만 제거',()=>{
  const p=project('unit-history',worker.name),aliases=aliasesFor(worker,directory),item={...assignedTasks(worker.id,[p],aliases)[0],todayTask:'이전 작성 원문',progress:70,manualFields:['todayTask','progress']};assert.ok(item.id);
  let rows=reconcileWorkLogItems([item],worker.id,'2026-10-12',[p],aliases);assert.equal(rows[0].todayTask,item.todayTask);assert.equal(rows[0].scheduleRemoved,false);
  p.subTasks.조적.personIds=[];rows=reconcileWorkLogItems([item],worker.id,'2026-10-12',[p],aliases);assert.equal(rows[0].todayTask,item.todayTask);assert.equal(rows[0].scheduleRemoved,true);
 });
}finally{
 db.close();mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
 writeFileSync(output,JSON.stringify({kind:'ACTUAL_FUNCTIONS_AND_API_SYNTHETIC_ALIASES',protectedOriginal:before,operatingRequests:0,results},null,2)+'\n');
}
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
