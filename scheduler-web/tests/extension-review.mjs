import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {registerHooks,createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {database} from './d1.mjs';
import * as postDelivery from '../src/utils/postDeliveryVisibility.ts';

const before=process.argv.includes('--before');
const startShiftBefore=process.argv.includes('--before-start-shift'),onlyStartShift=process.argv.includes('--only-start-shift');
const onlyClient=process.argv.includes('--only-client-refresh');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/extension-review.json';
if(before){
 const paths=['scheduler-web/src/utils/personalWork.ts','functions/lib/scheduleExtensions.ts'];
 registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context),path=paths.find(path=>url===new URL('../../'+path,import.meta.url).href);return path?{...loaded,source:readFileSync(new URL('../../private-provisioning/original-before-extension-context-20261006/'+path,import.meta.url),'utf8')}:loaded;}});
}
if(startShiftBefore)registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);return url===new URL('../../functions/lib/scheduleExtensions.ts',import.meta.url).href?{...loaded,source:readFileSync(new URL('../../private-provisioning/qa-remaining-source-20261007/original-before-75/functions/lib/scheduleExtensions.ts',import.meta.url),'utf8')}:loaded;}});
const personal=await import('../src/utils/personalWork.ts');
const {handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts');
const {projectProgress}=await import('../src/utils/scheduleProgress.ts');
const {VIET_TEAMS_DATA}=await import('../src/data/vietTeams.ts');
const personId=personal.assignmentPersonId||((reference,directory)=>directory.find(person=>person.id===reference&&person.active!==false)?.id);
const {db,DB}=database(),env={DB},cookies=new Map(),results=[];
const worker={id:'worker-a',name:'합성 신청 직원',no:101,department:'마감팀',position:'프로',active:true};
const pm={id:'worker-b',name:'유일한 합성 PM',no:102,department:'구조팀',position:'프로',active:true};
const chief={id:'u_12',name:'합성 실장',no:103,department:'마감팀',position:'실장',active:true};
const leader={id:'u_13',name:'합성 팀장',no:104,department:'마감팀',position:'팀장',active:true};
const foreign={id:'foreign-chief',name:'타팀 합성 실장',no:105,department:'구조팀',position:'실장',active:true};
const selectedManager={id:'selected-manager',name:'합성 지정 결재자',no:106,department:'마감팀',position:'팀장',active:true};
const canonicalCollision={id:'102',name:'숫자 ID 합성 PM',no:107,department:'구조팀',position:'프로',active:true};
const directory=[worker,pm,chief,leader,foreign,selectedManager];
for(const user of directory){
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(user.id,user.id,user.id+'@example.invalid',user.name,user.department,user.position,JSON.stringify(user),'synthetic-unused','synthetic-unused');
 const token='synthetic-review-'+user.id;db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),user.id,Date.now()+3600000);cookies.set(user.id,'studio_session='+token);
}
async function request(actor,path,method='GET',body){const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{Cookie:cookies.get(actor.id),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,async()=>{throw Error('Archive path is outside this test');});return {status:response.status,data:await response.json()};}
const task=(role,owner,progress)=>({roleName:role,personId:owner,personIds:[owner],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'합성 배정 원문',...(progress===undefined?{}:{progress})});
const project=(id,reference=pm.id)=>({id,code:'QA-PM-REVIEW',name:'합성 연장 권한',department:'마감팀',pmId:reference,startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',progress:60,subTasks:{PM:task('PM',reference),조적:task('조적',worker.id,40),창호:task('창호',pm.id,80)},roles:{PM:{personId:reference,startDate:'2026-10-06',endDate:'2026-10-08'}}});
const extension=(p,approverId=pm.id)=>({taskId:`gen-${p.id}-조적`,previousEnd:'2026-10-08',requestedEnd:'2026-10-12',type:'DEADLINE',reason:'합성 신청 원문',reasonCategory:'도면 변경',...(approverId?{approverId}:{})});
const readProject=async id=>(await request(chief,'projects')).data.projects.find(row=>row.project.id===id);
// New deadline requests require both real API stages; stored legacy requests retain one approval.
const action=async(actor,p,id,decision,revision)=>{const result=await request(actor,`projects/${p.id}/extensions/${id}/${decision}`,'POST',{revision,memo:'합성 처리 메모'});return decision==='approve'&&result.status===200&&result.data.request.approvalStage==='TEAM'&&result.data.request.status==='PENDING'?request(chief,`projects/${p.id}/extensions/${id}/approve`,'POST',{revision:result.data.revision,memo:'합성 팀 최종 승인'}):result;};
const historical=async(p,result,approver)=>{assert.equal(result.status,200);const row=await readProject(p.id),record=row.project.scheduleExtensions.find(item=>item.id===result.data.request.id);delete record.approvalStage;delete record.pmApproverId;if(approver===null)delete record.approverId;else if(approver)record.approverId=approver;db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(row.project),p.id);result.data.request=record;return result;};
const approvedBody=JSON.stringify({id:'approved-history',userId:worker.id,date:'2026-10-06',approvalStatus:'APPROVED_FINAL',items:[{todayTask:'기존 승인 수행 원문',progress:35}],overallNotes:'기존 승인 원문'});
async function check(name,fn){
 if(onlyClient&&!name.startsWith('연장 화면 조회'))return;
 if(onlyStartShift&&!name.startsWith('시작일 재검사'))return;
 try{
  for(const table of ['studio_projects','studio_worklogs','studio_notifications'])db.prepare('DELETE FROM '+table).run();
  for(const user of directory)db.prepare('UPDATE studio_users SET name=?,department=?,position=?,profile=?,active=1 WHERE id=?').run(user.name,user.department,user.position,JSON.stringify(user),user.id);
  db.prepare('DELETE FROM studio_users WHERE id=?').run(canonicalCollision.id);
  db.prepare('INSERT INTO studio_worklogs (id,user_id,day,department,body) VALUES (?,?,?,?,?)').run('approved-history',worker.id,'2026-10-06','마감팀',approvedBody);
  await fn();assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('approved-history').body,approvedBody);results.push({name,status:'PASS'});console.log('PASS',name);
 }catch(error){results.push({name,status:'FAIL',reason:error.stack});console.log('FAIL',name,error.message);}
}
async function create(p){const r=await request(chief,'projects','POST',{project:p});assert.equal(r.status,200,JSON.stringify(r.data));return r;}
async function changePM(p,reference){const current=await readProject(p.id),next=structuredClone(current.project);next.pmId=reference;next.subTasks.PM.personId=reference;next.subTasks.PM.personIds=[reference];next.roles.PM.personId=reference;const saved=await request(chief,'projects','POST',{base:current.project,project:next});assert.equal(saved.status,200);return saved;}
const startShiftProject=kind=>{const t={...task('조적',worker.id,35),endDate:'2026-10-16',reportingMode:'TASK'};return {id:'start-shift-'+kind,code:'QA-START',name:'합성 시작일 변경',department:'마감팀',pmId:chief.id,startDate:kind==='followup'?'2026-10-01':t.startDate,endDate:kind==='followup'?'2026-10-05':t.endDate,status:'진행중',progress:35,roles:kind==='roles'?{조적:{...t,startDate:''}}:{},subTasks:kind==='roles'||kind==='followup'?{}:{조적:{...t,allocations:[{id:'original',personIds:[worker.id],startDate:t.startDate,endDate:t.endDate,memo:t.memo}]}},postDeliveryTasks:kind==='followup'?[{id:'follow',kind:'검토',personIds:[worker.id],startDate:t.startDate,endDate:t.endDate,memo:t.memo,status:'진행중',progress:35}]:[]};};
async function startShiftRequest(kind,type='OVERTIME',startDate='2026-10-12'){
 const p=startShiftProject(kind);await create(p);const assigned=personal.assignedTasks(worker.id,[p])[0],input={taskId:assigned.id,previousEnd:assigned.endDate,type,requestedEnd:'2026-10-19',workDate:'2026-10-07',startTime:'18:30',endTime:'21:30',reason:'합성 추가 검토 원문',approverId:chief.id};
 const r=await request(worker,'projects/'+p.id+'/extensions','POST',input);assert.equal(r.status,200,JSON.stringify(r.data));const current=await readProject(p.id),next=structuredClone(current.project);
 if(kind==='roles')next.startDate=startDate;else if(kind==='followup')next.postDeliveryTasks[0].startDate=startDate;else next.subTasks.조적.allocations[0].startDate=startDate;
 const changed=await request(leader,'projects','POST',{base:current.project,project:next});assert.equal(changed.status,200,JSON.stringify(changed.data));return {p,r,input,current:await readProject(p.id),assigned};
}
const clientRequire=createRequire(import.meta.url),ts=clientRequire('typescript'),jsx=clientRequire('react/jsx-runtime');
const clientSource=readFileSync(process.argv.find(arg=>arg.startsWith('--client-source='))?.slice('--client-source='.length)||new URL('../src/components/ScheduleExtensionRequests.tsx',import.meta.url),'utf8');
assert.ok(clientSource.includes(' return <section'));
const compiledClient=ts.transpileModule(clientSource.replace(' return <section',' capture(run,submit); return <section'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const {canManageSchedule}=await import('../src/utils/schedulePermissions.ts'),{localDate}=await import('../src/utils/scheduleProgress.ts');
const clientProject=id=>({...project(id,chief.id),progress:35,roles:{},subTasks:{조적:{...task('조적',worker.id,35),reportingMode:'TASK',allocations:[{id:'client-segment',personIds:[worker.id],startDate:'2026-10-06',endDate:'2026-10-08'}]}}});
function clientScreen(p,actor=worker){
 const hooks=[],effects=[],queued=[],tickets=[];let currentActor=actor,projects=[p],cursor=0,dirty=true,tree,run,submit,mounted=true,postsHeld=0;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return[hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||(hooks[index]={current:initial});};
 const useEffect=(fn,deps)=>{const index=cursor++,previous=effects[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps?.[i])))queued.push(()=>{previous?.cleanup?.();effects[index]={deps,cleanup:fn()};});};
 const api=async(route,method='GET',body)=>{const captured=currentActor;assert.ok(captured,'Anonymous transport forbidden');const r=await request(captured,route,method,body);assert.equal(r.status,200,JSON.stringify(r.data));const ticket=tickets.find(t=>!t.used&&(t.method||'GET')===method&&(t.route||'projects')===route);if(ticket){ticket.used=true;ticket.readyResolve(r.data);await ticket.done;if(ticket.error)throw Error(ticket.error);if(method==='POST')postsHeld++;}return r.data;};
 const auth=Object.assign(selector=>selector({currentUser:currentActor,users:directory}),{getState:()=>({currentUser:currentActor,users:directory})}),exports={};
 runInNewContext(compiledClient,{exports,Error,capture:(r,s)=>{run=r;submit=s;},require:name=>{
  if(name==='../utils/postDeliveryVisibility')return postDelivery;
  if(name==='react')return {useState,useRef,useEffect};if(name==='react/jsx-runtime')return jsx;if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});if(name==='../store/useAuthStore')return {useAuthStore:auth};if(name==='../utils/personalWork')return personal;if(name==='../utils/scheduleProgress')return {localDate};if(name==='../utils/schedulePermissions')return {canManageSchedule};if(name==='../services/studioApi')return {studioApi:api};if(name==='../store/useStudioStore')return {refreshStudioMeetings:async()=>{await Promise.all([api('meetings'),api('notifications')]);}};if(name==='./WorkLogReporting')return {WorkLogSteps:()=>null};throw Error('Unexpected extension dependency '+name);
 }});
 const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
 const text=node=>Array.isArray(node)?node.map(text).join(''):node==null||typeof node==='boolean'?'':typeof node==='object'?text(node.props?.children):String(node);
 const render=()=>{cursor=0;tree=exports.ScheduleExtensionRequests({projects,projectId:p.id,tasks:personal.assignedTasks(currentActor?.id||'',projects),selectedTaskId:`gen-${p.id}-조적-client-segment`});dirty=false;};
 const settle=async()=>{for(let n=0;n<5;n++){if(dirty&&mounted)render();while(queued.length)queued.shift()();await new Promise(resolve=>setImmediate(resolve));}if(dirty&&mounted)render();};
 const hold=(route='projects',method='GET')=>{const ticket={route,method};ticket.ready=new Promise(resolve=>{ticket.readyResolve=resolve;});ticket.done=new Promise(resolve=>{ticket.resolve=resolve;});tickets.push(ticket);return ticket;};
 const change=(label,value)=>{const node=nodes(tree).find(node=>node.props['aria-label']===label);assert.ok(node,label);node.props.onChange({target:{value}});};
 return {settle,hold,rows:()=>hooks[0],notice:()=>text(nodes(tree).find(node=>node.props.role==='status')),busy:()=>Boolean(nodes(tree).find(node=>node.type==='button'&&text(node)==='연장 요청 제출')?.props.disabled),reason:()=>nodes(tree).find(node=>node.props['aria-label']==='연장 사유 및 조치 계획')?.props.value,change,run:action=>run(action||(async()=>{})),submit:()=>run(submit),deadline:()=>assert.equal(nodes(tree).filter(node=>node.type==='input'&&node.props.type==='radio').length,0),update:next=>{projects=[next];dirty=true;},actor:next=>{currentActor=next;dirty=true;},approval:decision=>nodes(tree).find(node=>node.type==='button'&&(decision==='reject'?text(node)==='연장 반려':['연장 승인','PM 검토 승인','최종 연장 승인'].includes(text(node)))).props.onClick(),unmount:()=>{mounted=false;for(const effect of effects)effect?.cleanup?.();},close:()=>{for(const ticket of tickets)ticket.resolve();for(const effect of effects)effect?.cleanup?.();},postsHeld:()=>postsHeld};
}
try{
 await check('PM 읽기는 canonical·유일한 활성 이름/번호를 같은 개인 ID로 판정',()=>{
  assert.equal(personId(pm.id,directory),pm.id);assert.equal(personId(pm.name,directory),pm.id);assert.equal(personId(String(pm.no),directory),pm.id);
 });
 await check('PM 읽기에서 모호한 이름·번호, 미확인·그룹·비활성 참조는 확장하지 않음',()=>{
  const duplicate={...foreign,name:pm.name,no:pm.no};assert.equal(personId(pm.name,[...directory,duplicate]),undefined);assert.equal(personId(String(pm.no),[...directory,duplicate]),undefined);
  assert.equal(personId('미확인 PM',directory),undefined);assert.equal(personId(VIET_TEAMS_DATA[0].code,[{...pm,name:VIET_TEAMS_DATA[0].code}]),undefined);assert.equal(personId(pm.id,[{...pm,active:false}]),undefined);assert.equal(personId(pm.name,[{...pm,active:false}]),undefined);
 });
 await check('PM 문자열과 다른 canonical ID가 충돌하면 활성 ID를 우선하고 비활성 ID를 이름으로 우회하지 않음',()=>{
  assert.equal(personId('102',[...directory,canonicalCollision]),canonicalCollision.id);assert.equal(personId('102',[...directory,{...canonicalCollision,active:false}]),undefined);
 });
 for(const [label,reference]of [['canonical',pm.id],['이름',pm.name],['사번',String(pm.no)]])await check(`실제 API ${label} PM 지정 승인: 원PM·담당·실적·승인본문 보존 및 기존 작업일 가중식`,async()=>{
  const p=project('pm-'+label,reference);await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.request.approverId,pm.id);
  const approved=await action(pm,p,r.data.request.id,'approve',r.data.revision);assert.equal(approved.status,200,JSON.stringify(approved.data));const final=approved.data.project;
  assert.equal(final.pmId,reference);assert.deepEqual(final.subTasks.PM,p.subTasks.PM);assert.equal(final.subTasks.조적.personId,worker.id);assert.equal(final.subTasks.조적.progress,40);assert.equal(final.subTasks.창호.progress,80);assert.equal(final.endDate,p.endDate);assert.equal(final.subTasks.조적.endDate,'2026-10-12');assert.equal(final.progress,projectProgress(final).actual);assert.ok(Math.abs(final.progress-400/7)<1e-10);
  assert.equal(final.scheduleExtensions[0].reason,'합성 신청 원문');assert.equal(final.scheduleExtensions[0].approverId,pm.id);
 });
 await check('유효 지정 PM 요청은 현재 팀 관리자·타팀 관리자·신청자가 승인/반려로 우회할 수 없음',async()=>{
  const p=project('valid-designated');await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));assert.equal(r.status,200);
  for(const actor of [chief,leader,foreign,worker])for(const decision of ['approve','reject'])assert.equal((await action(actor,p,r.data.request.id,decision,r.data.revision)).status,403);
  assert.equal((await action(pm,p,r.data.request.id,'reject',r.data.revision)).status,200);
 });
 await check('PM 변경 고아 요청: 관리자 승인403/반려200, 원지정자403, 새PM 재신청200',async()=>{
  const p=project('orphan-changed');await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));assert.equal(r.status,200);const changed=await changePM(p,leader.id);
  for(const actor of [pm,chief,leader,foreign])assert.equal((await action(actor,p,r.data.request.id,'approve',changed.data.revision)).status,403);
  assert.equal((await action(pm,p,r.data.request.id,'reject',changed.data.revision)).status,403);assert.equal((await action(foreign,p,r.data.request.id,'reject',changed.data.revision)).status,403);
  const rejected=await action(chief,p,r.data.request.id,'reject',changed.data.revision);assert.equal(rejected.status,200,JSON.stringify(rejected.data));assert.equal(rejected.data.project.subTasks.조적.endDate,p.subTasks.조적.endDate);assert.equal(rejected.data.project.progress,60);assert.equal(rejected.data.request.reason,r.data.request.reason);assert.equal(rejected.data.request.approverId,pm.id);
  const fresh=await request(worker,'projects/'+p.id+'/extensions','POST',{...extension(p,leader.id),requestedEnd:'2026-10-13'});assert.equal(fresh.status,200);assert.equal(fresh.data.request.approverId,leader.id);assert.equal((await action(chief,p,fresh.data.request.id,'reject',fresh.data.revision)).status,403);assert.equal((await action(leader,p,fresh.data.request.id,'approve',fresh.data.revision)).status,200);
 });
 await check('지정 PM 비활성화: 해당팀 반려만 가능하며 일정·실적·기존 요청 원문 유지',async()=>{
  const p=project('orphan-inactive');await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));assert.equal(r.status,200);db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(pm.id);
  assert.equal((await action(pm,p,r.data.request.id,'approve',r.data.revision)).status,401);assert.equal((await action(chief,p,r.data.request.id,'approve',r.data.revision)).status,403);const rejected=await action(chief,p,r.data.request.id,'reject',r.data.revision);assert.equal(rejected.status,200);assert.deepEqual(rejected.data.project.subTasks,p.subTasks);assert.equal(rejected.data.project.progress,p.progress);
  assert.equal((await request(worker,'projects/'+p.id+'/extensions','POST',extension(p,chief.id))).status,409);
 });
 await check('기존 저장 지정 팀결재자의 자격 상실도 관리자 반려로만 해소, 유효할 때는 우회 금지',async()=>{
  const p=project('orphan-manager');await create(p);const r=await historical(p,await request(worker,'projects/'+p.id+'/extensions','POST',extension(p)),selectedManager.id);assert.equal(r.status,200);assert.equal((await action(chief,p,r.data.request.id,'reject',r.data.revision)).status,403);
  db.prepare('UPDATE studio_users SET position=?,profile=? WHERE id=?').run('프로',JSON.stringify({...selectedManager,position:'프로'}),selectedManager.id);
  assert.equal((await action(selectedManager,p,r.data.request.id,'approve',r.data.revision)).status,403);assert.equal((await action(chief,p,r.data.request.id,'approve',r.data.revision)).status,403);assert.equal((await action(chief,p,r.data.request.id,'reject',r.data.revision)).status,200);
 });
 await check('고아 반려도 stale revision/동시쓰기에서 원요청·일정·알림을 보존',async()=>{
  const p=project('orphan-cas');await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));const changed=await changePM(p,leader.id);assert.equal((await action(chief,p,r.data.request.id,'reject',r.data.revision)).status,409);
  const original=db.prepare('SELECT body FROM studio_projects WHERE id=?').get(p.id).body,notifications=db.prepare('SELECT count(*) n FROM studio_notifications').get().n,batch=DB.batch;
  DB.batch=async statements=>{db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(p.id);return batch(statements);};try{assert.equal((await action(chief,p,r.data.request.id,'reject',changed.data.revision)).status,409);}finally{DB.batch=batch;}
  assert.equal(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(p.id).body,original);assert.equal(db.prepare('SELECT count(*) n FROM studio_notifications').get().n,notifications);
 });
 await check('실제 API PM 사번 충돌·그룹·모호한 이름·비활성 참조를 다른 PM 승인자로 확장하지 않음',async()=>{
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(canonicalCollision.id,canonicalCollision.id,'collision@example.invalid',canonicalCollision.name,canonicalCollision.department,canonicalCollision.position,JSON.stringify(canonicalCollision),'synthetic-unused','synthetic-unused');const token='synthetic-collision';db.prepare('INSERT OR REPLACE INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),canonicalCollision.id,Date.now()+3600000);cookies.set(canonicalCollision.id,'studio_session='+token);
  const p=project('pm-collision','102');await create(p);assert.equal((await request(worker,'projects/'+p.id+'/extensions','POST',extension(p,pm.id))).status,403);assert.equal((await request(worker,'projects/'+p.id+'/extensions','POST',extension(p,canonicalCollision.id))).status,200);
  db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify({...foreign,name:pm.name}),foreign.id);const ambiguous=project('pm-ambiguous',pm.name);await create(ambiguous);assert.equal((await request(worker,'projects/'+ambiguous.id+'/extensions','POST',extension(ambiguous,pm.id))).status,409);
  const group=project('pm-group',VIET_TEAMS_DATA[0].code);await create(group);assert.equal((await request(worker,'projects/'+group.id+'/extensions','POST',extension(group,pm.id))).status,409);
  db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(pm.id);const inactive=project('pm-inactive',pm.id);await create(inactive);assert.equal((await request(worker,'projects/'+inactive.id+'/extensions','POST',extension(inactive,pm.id))).status,409);
 });
 await check('구형 roles-only 사번 PM의 연장은 원담당·빈 시작일·원납품·가중식 보존',async()=>{
  const p={...project('legacy-pm','102'),subTasks:{},roles:{PM:{personId:'102',startDate:'',endDate:''},조적:{personId:worker.id,startDate:'',endDate:'2026-10-08',progress:40},창호:{personId:pm.id,startDate:'2026-10-06',endDate:'2026-10-08',progress:80}}};await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',extension(p));assert.equal(r.status,200);const approved=await action(pm,p,r.data.request.id,'approve',r.data.revision);assert.equal(approved.status,200);assert.equal(approved.data.project.pmId,'102');assert.equal(approved.data.project.roles.조적.personId,worker.id);assert.equal(approved.data.project.roles.조적.startDate,'');assert.equal(approved.data.project.endDate,p.endDate);assert.deepEqual(approved.data.project.subTasks,{});assert.ok(Math.abs(approved.data.project.progress-400/7)<1e-10);
 });
 await check('후속 일정만 연장하면 원납품·본공종 실적·전체 실적 및 원PM 참조는 그대로',async()=>{
  const p={...project('follow-pm',pm.name),progress:55,postDeliveryTasks:[{id:'follow',kind:'수정',personIds:[worker.id],startDate:'2026-10-12',endDate:'2026-10-13',memo:'합성 후속 원문',status:'진행중',progress:70,actualProgressDate:'2026-10-06'}]};await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',{...extension(p),taskId:`gen-${p.id}-followup-follow`,previousEnd:'2026-10-13',requestedEnd:'2026-10-14'});assert.equal(r.status,200);const approved=await action(pm,p,r.data.request.id,'approve',r.data.revision);assert.equal(approved.status,200);assert.equal(approved.data.project.progress,55);assert.deepEqual(approved.data.project.subTasks,p.subTasks);assert.equal(approved.data.project.endDate,p.endDate);assert.equal(approved.data.project.pmId,pm.name);assert.deepEqual(approved.data.project.postDeliveryTasks,[{...p.postDeliveryTasks[0],endDate:'2026-10-14'}]);
 });
 await check('추가 시간 승인은 권한만 보정하고 마감일·전체실적·원배정은 변경하지 않음',async()=>{
  const p=project('overtime-pm',pm.name);await create(p);const r=await request(worker,'projects/'+p.id+'/extensions','POST',{...extension(p),type:'OVERTIME',workDate:'2026-10-06',startTime:'18:30',endTime:'21:30'});assert.equal(r.status,200);const approved=await action(pm,p,r.data.request.id,'approve',r.data.revision);assert.equal(approved.status,200);assert.deepEqual(approved.data.project.subTasks,p.subTasks);assert.equal(approved.data.project.progress,p.progress);assert.equal(approved.data.request.hours,3);
 });
 await check('기존 저장 승인자 미지정 요청은 팀 관리자 처리 계약을 유지',async()=>{
  const p=project('implicit-review');await create(p);const r=await historical(p,await request(worker,'projects/'+p.id+'/extensions','POST',extension(p)),null);assert.equal(r.status,200);assert.equal((await action(pm,p,r.data.request.id,'approve',r.data.revision)).status,403);assert.equal((await action(chief,p,r.data.request.id,'approve',r.data.revision)).status,200);
 });
 for(const kind of ['allocation','roles','followup'])await check(`시작일 재검사 ${kind}: 기존 추가 시간 신청일이 현재 배정 전이면409·원문/알림/일정 동결, 반려 가능`,async()=>{
  const {p,r,input,current,assigned}=await startShiftRequest(kind);assert.equal(personal.assignedItems(worker.id,input.workDate,[current.project]).length,0);assert.equal(personal.assignedTasks(worker.id,[current.project])[0].id,assigned.id);
  assert.equal((await request(worker,'projects/'+p.id+'/extensions','POST',input)).status,400);
  const snapshot=()=>({project:db.prepare('SELECT * FROM studio_projects WHERE id=?').get(p.id),notifications:db.prepare('SELECT * FROM studio_notifications ORDER BY id').all(),approved:db.prepare('SELECT * FROM studio_worklogs WHERE id=?').get('approved-history')});const frozen=snapshot();
  assert.equal((await action(leader,p,r.data.request.id,'approve',current.revision)).status,403);assert.equal((await action(chief,p,r.data.request.id,'approve',r.data.revision)).status,409);const rejectedApproval=await action(chief,p,r.data.request.id,'approve',current.revision);assert.equal(rejectedApproval.status,409,'Current OVERTIME before start must be rejected');assert.match(rejectedApproval.data.error,/시작일/);assert.deepEqual(snapshot(),frozen);
  const rejected=await action(chief,p,r.data.request.id,'reject',current.revision);assert.equal(rejected.status,200);assert.equal(rejected.data.request.status,'REJECTED');for(const key of ['id','taskId','allocationId','userId','workDate','hours','reason','previousEnd','createdAt'])assert.deepEqual(rejected.data.request[key],r.data.request[key]);assert.deepEqual(rejected.data.project.subTasks,current.project.subTasks);assert.deepEqual(rejected.data.project.roles,current.project.roles);assert.deepEqual(rejected.data.project.postDeliveryTasks,current.project.postDeliveryTasks);assert.equal(rejected.data.project.progress,current.project.progress);assert.equal(rejected.data.project.endDate,current.project.endDate);
 });
 await check('시작일 재검사: 변경된 시작일이 신청일과 같아도 유효한 추가 시간 승인·배정/실적 보존',async()=>{
  const {p,r,current}=await startShiftRequest('allocation','OVERTIME','2026-10-07');const approved=await action(chief,p,r.data.request.id,'approve',current.revision);assert.equal(approved.status,200);assert.equal(approved.data.request.status,'APPROVED');assert.equal(approved.data.request.hours,3);assert.deepEqual(approved.data.project.subTasks,current.project.subTasks);assert.equal(approved.data.project.progress,current.project.progress);assert.equal(approved.data.project.endDate,current.project.endDate);
 });
 await check('시작일 재검사: 완료일 연장은 추가 시간 날짜와 무관하게 기존 마감/배정 검사를 유지',async()=>{
  const {p,r,current}=await startShiftRequest('allocation','DEADLINE');const approved=await action(chief,p,r.data.request.id,'approve',current.revision);assert.equal(approved.status,200);assert.equal(approved.data.request.status,'APPROVED');assert.equal(approved.data.project.subTasks.조적.allocations[0].startDate,'2026-10-12');assert.equal(approved.data.project.subTasks.조적.allocations[0].endDate,'2026-10-19');assert.equal(approved.data.project.endDate,current.project.endDate);assert.equal(approved.data.project.progress,current.project.progress);
 });
 await check('연장 화면 조회: 늦은 신청 GET는 최신 승인 effect자료를 되돌리지 않고 현재 busy 해제',async()=>{
  const p=clientProject('client-late');await create(p);const s=clientScreen(p);let pending;
  try{await s.settle();s.deadline();await s.settle();s.change('연장 사유 및 조치 계획','합성 원문 신청');s.change('요청 완료일','2026-10-12');await s.settle();const old=s.hold();pending=s.submit();const held=await old.ready,req=held.projects[0].project.scheduleExtensions[0];assert.equal(held.projects[0].revision,2);const approved=await action(chief,p,req.id,'approve',2);assert.equal(approved.status,200);s.update(approved.data.project);await s.settle();assert.equal(s.rows()[0].revision,approved.data.revision);old.resolve();await pending;await s.settle();assert.equal(s.rows()[0].revision,approved.data.revision);assert.equal(s.rows()[0].project.scheduleExtensions[0].status,'APPROVED');assert.equal(s.busy(),false);const server=await readProject(p.id);assert.equal(server.project.subTasks.조적.progress,35);assert.equal(server.project.subTasks.조적.endDate,'2026-10-12');assert.equal(server.project.endDate,p.endDate);}finally{s.close();await pending?.catch(()=>{});}
 });
 await check('연장 화면 조회: 최신 실패는 마지막 승인 cache와 오류를 유지하고 늦은 성공·오류는 무시',async()=>{
  const p=clientProject('client-failure');await create(p);const s=clientScreen(p);let pending;
  try{await s.settle();const old=s.hold();pending=s.run();await old.ready;const requested=await request(worker,'projects/'+p.id+'/extensions','POST',{...extension(p,chief.id),taskId:`gen-${p.id}-조적-client-segment`});assert.equal(requested.status,200);const approved=await action(chief,p,requested.data.request.id,'approve',2);s.update(approved.data.project);await s.settle();const cached=JSON.stringify(s.rows()),latest=s.hold();s.update(approved.data.project);await s.settle();await latest.ready;latest.error='최신 조회 실패';latest.resolve();await s.settle();assert.match(s.notice(),/최신 조회 실패/);old.resolve();await pending;await s.settle();assert.equal(JSON.stringify(s.rows()),cached);assert.match(s.notice(),/최신 조회 실패/);assert.equal(s.busy(),false);
   const obsolete=s.hold();pending=s.run();await obsolete.ready;s.update(approved.data.project);await s.settle();obsolete.error='무시할 이전 조회 오류';obsolete.resolve();await pending;await s.settle();assert.equal(JSON.stringify(s.rows()),cached);assert.ok(!s.notice().includes('이전 조회 오류'));
  }finally{s.close();await pending?.catch(()=>{});}
 });
 await check('연장 화면 조회: 다른 계정·같은 ID 새 로그인·익명 전환에서 이전 응답이 행과 안내를 덮지 않음',async()=>{
  for(const [index,nextActor]of [chief,{...worker},null].entries()){const p=clientProject('client-actor-'+index);await create(p);const s=clientScreen(p);let pending;
   try{await s.settle();const old=s.hold();pending=s.run();await old.ready;const base=await readProject(p.id),next=structuredClone(base.project);next.subTasks.조적.memo='현재 세션 배정 원문';const changed=await request(chief,'projects','POST',{base:base.project,project:next});assert.equal(changed.status,200);s.actor(nextActor);await s.settle();if(nextActor)assert.equal(s.rows().find(row=>row.project.id===p.id).revision,2);else assert.equal(s.rows().length,0);const latest=JSON.stringify(s.rows()),notice=s.notice();old.error='이전 계정 조회 오류';old.resolve();await pending;await s.settle();assert.equal(JSON.stringify(s.rows()),latest);assert.equal(s.notice(),notice);if(nextActor?.id===worker.id)assert.equal(s.busy(),false);}finally{s.close();await pending?.catch(()=>{});}
  }
 });
 await check('연장 화면 조회: 신청·승인·반려 늦은 POST와 언마운트 응답은 새 원문·안내·행에 쓰지 않음',async()=>{
  for(const mode of ['submit','approve','reject','unmount']){const p=clientProject('client-action-'+mode);await create(p);let req,s,pending;
   if(mode==='approve'||mode==='reject'){const requested=await request(worker,'projects/'+p.id+'/extensions','POST',{...extension(p,chief.id),taskId:`gen-${p.id}-조적-client-segment`});assert.equal(requested.status,200);req=requested.data.request;s=clientScreen(p,chief);}else s=clientScreen(p);
   try{await s.settle();let ticket;
    if(mode==='unmount'){const base=await readProject(p.id),next=structuredClone(base.project);next.subTasks.조적.memo='뒤늦은 조회 데이터';assert.equal((await request(chief,'projects','POST',{base:base.project,project:next})).status,200);ticket=s.hold();pending=s.run();await ticket.ready;await s.settle();const rows=JSON.stringify(s.rows()),notice=s.notice();s.unmount();ticket.resolve();await pending;assert.equal(JSON.stringify(s.rows()),rows);assert.equal(s.notice(),notice);continue;}
    if(mode==='submit'){s.deadline();await s.settle();s.change('연장 사유 및 조치 계획','이전 세션 신청 원문');s.change('요청 완료일','2026-10-12');await s.settle();ticket=s.hold('projects/'+p.id+'/extensions','POST');pending=s.submit();}else{ticket=s.hold(`projects/${p.id}/extensions/${req.id}/${mode}`,'POST');s.approval(mode);}
    await ticket.ready;s.actor({...worker});await s.settle();s.change('연장 사유 및 조치 계획','새 세션 미제출 원문');await s.settle();const rows=JSON.stringify(s.rows()),notice=s.notice();ticket.resolve();await pending;await s.settle();assert.equal(s.reason(),'새 세션 미제출 원문');assert.equal(s.notice(),notice);assert.equal(JSON.stringify(s.rows()),rows);assert.equal(s.busy(),false);
   }finally{s.close();await pending?.catch(()=>{});await s.settle();}
  }
 });
}finally{db.close();mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_EXTENSION_API_AND_SHARED_RESOLVER_SYNTHETIC',protectedOriginal:before||startShiftBefore,startShiftOnly:onlyStartShift,clientRefreshOnly:onlyClient,operatingRequests:0,results},null,2)+'\n');}
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
