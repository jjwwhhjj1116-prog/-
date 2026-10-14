import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {database} from './d1.mjs';
import {handleCollaboration,tokenHash} from '../../functions/lib/collaboration.ts';
import * as work from '../src/utils/personalWork.ts';
import * as progress from '../src/utils/scheduleProgress.ts';
import * as permissions from '../src/utils/schedulePermissions.ts';
import * as periods from '../src/utils/scheduleExtensionPeriods.ts';
import * as personnel from '../src/utils/vietPersonnel.ts';
import * as staff from '../src/utils/staffOrder.ts';
import * as holidays from '../src/constants/holidays.ts';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),ts=require('typescript');
const RealDate=Date;class TestDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-14T03:00:00Z']));}static now(){return new RealDate('2026-10-14T03:00:00Z').valueOf();}}
const {db,DB}=database(),env={DB},cookies=new Map(),results=[];
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'test-results/overtime-ui.json';
const worker={id:'qa-ot-worker',name:'합성 야근 직원',department:'마감팀',company:'컨코스트',position:'프로',active:true};
const peer={...worker,id:'qa-ot-peer'};
const chief={id:'u_12',name:'합성 마감 실장',department:'마감팀',company:'컨코스트',position:'실장',active:true};
const structureChief={...chief,id:'u_24',department:'구조팀',name:'합성 구조 실장'};
const civilChief={...chief,id:'u_8',department:'토목&조경팀',name:'합성 토목 실장'};
const pm={...worker,id:'qa-ot-pm',name:'합성 배정 PM',department:'구조팀'};
const inactive={...chief,id:'qa-inactive',active:false};
const viet=personnel.VIET_ASSIGNMENT_GROUPS.map((group,index)=>({...worker,id:'qa-viet-'+index,name:'합성 베트남 직원 '+index,company:'VIETQS',department:group.department,vietTeamId:group.id,idPrefix:'qa-viet-'+index}));
const directory=[worker,peer,chief,structureChief,civilChief,pm,inactive,...viet];
for(const person of directory){
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,?)').run(person.id,person.id,person.id+'@example.invalid',person.name,person.department,person.position,JSON.stringify(person),'synthetic-unused','synthetic-unused',person.active?1:0);
 const token='qa-overtime-'+person.id;db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),person.id,Date.now()+3600000);cookies.set(person.id,'studio_session='+token);
}
async function api(actor,path,method='GET',body){const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{Cookie:cookies.get(actor.id),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,async()=>{throw Error('Archive out of scope');});return {status:response.status,data:await response.json()};}
const manager=department=>directory.find(person=>person.department===department&&person.position==='실장'&&person.active);
const task=(role,owner)=>({roleName:role,personId:owner,personIds:[owner],startDate:'2026-10-14',endDate:'2026-10-30',status:'진행중',progress:45,memo:'합성 배정 원문'});
const project=(id,department='마감팀',owner=worker.id)=>({id,code:'QA-OVERTIME-'+id,name:'합성 야근 프로젝트',department,pmId:pm.id,startDate:'2026-10-14',endDate:'2026-10-30',status:'진행중',progress:45,subTasks:{외부:task('외부',owner),PM:task('PM',pm.id)},roles:{}});
const payload=p=>({taskId:`gen-${p.id}-외부`,previousEnd:'2026-10-30',type:'OVERTIME',workDate:'2026-10-14',startTime:'17:00',endTime:'20:00',reason:'합성 야근 사유'});
async function create(p){const result=await api(manager(p.department),'projects','POST',{project:p});assert.equal(result.status,200,JSON.stringify(result.data));return result;}
const read=async id=>(await api(chief,'projects')).data.projects.find(row=>row.project.id===id);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
function mount(name,{project:p,actor=worker,requestType='OVERTIME',suggestedDate='2026-10-14',users=directory}={}){
 const hooks=[],effects=[],queue=[],writes=[];let cursor=0,dirty=true,tree,projects=[p],currentActor=actor;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||(hooks[index]={current:initial});};
 const useEffect=(fn,deps)=>{const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps?.[i])))queue.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:fn()};});};
 const auth=Object.assign(selector=>typeof selector==='function'?selector({currentUser:currentActor,users}):{currentUser:currentActor,users},{getState:()=>({currentUser:currentActor,users})});
 const transport=async(path,method='GET',body)=>{const result=await api(currentActor,path,method,body);if(method!=='GET')writes.push({path,body:structuredClone(body),result});if(result.status!==200)throw Error(result.data.error);return result.data;};
 const projectHook=selector=>{const state={projects,personnel:[],setSelectedProjectId:()=>{}};return typeof selector==='function'?selector(state):state;};
 const modules={'react':{...React,useState,useRef,useEffect,useMemo:fn=>fn()},'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'date-fns':require('date-fns'),'date-fns/locale':require('date-fns/locale'),'../store/useAuthStore':{useAuthStore:auth},'../store/useProjectStore':{useProjectStore:projectHook},'../store/usePersonalStore':{usePersonalStore:selector=>selector({leaves:[]})},'../store/useLanguageStore':{useLanguageStore:selector=>selector({lang:'ko'})},'../utils/personalWork':work,'../utils/scheduleProgress':progress,'../utils/schedulePermissions':permissions,'../utils/scheduleExtensionPeriods':periods,'../utils/vietPersonnel':personnel,'../utils/staffOrder':staff,'../data/vietTeams':{},'../constants/holidays':holidays,'../services/studioApi':{studioApi:transport},'../store/useStudioStore':{refreshStudioMeetings:async()=>{}},'./WorkLogReporting':{WorkLogSteps:()=>null},'./VietTeamModal':{VietTeamModal:()=>null},'./ProjectCalendar':{default:()=>null},'../services/excelService':{exportProjectsToExcel:()=>{}}};
 const source=readFileSync(new URL('../src/components/'+name+'.tsx',import.meta.url),'utf8'),exports={};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,Date:TestDate,Error,console,require:path=>{assert.ok(modules[path],path);return modules[path];}});
 const render=()=>{cursor=0;dirty=false;tree=name==='ScheduleExtensionRequests'?exports.ScheduleExtensionRequests({projects,projectId:p.id,tasks:work.assignedTasks(currentActor.id,projects),selectedTaskId:work.assignedTasks(currentActor.id,projects)[0]?.id||'',requestType,suggestedDate}):exports.PersonalScheduleView({department:p.department});};
 const settle=async()=>{for(let i=0;i<15;i++){if(dirty)render();while(queue.length)queue.shift()();await new Promise(resolve=>setImmediate(resolve));}if(dirty)render();};
 const find=label=>nodes(tree).find(node=>node.props['aria-label']===label),button=label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
 const change=(label,value)=>{const node=find(label);assert.ok(node,label);node.props.onChange({target:{value}});};
 const click=async label=>{const node=button(label);assert.ok(node,label);assert.notEqual(node.props.disabled,true,label+' enabled');node.props.onClick();await settle();};
 return {settle,find,button,change,click,all:()=>nodes(tree),tree:()=>tree,writes,update:next=>{projects=[next];dirty=true;},notice:()=>text(nodes(tree).find(node=>node.props.role==='status')),close:()=>effects.forEach(effect=>effect?.cleanup?.())};
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
try{
 await check('야근 폼: 선택한 보고 날짜/업무 유지·날짜/시간/사유/결재자 실제 요청·타팀/비활성 권한 제외',async()=>{
  const p=project('form');await create(p);const screen=mount('ScheduleExtensionRequests',{project:p,suggestedDate:'2026-10-15'});await screen.settle();
  assert.equal(screen.find('야근일').props.value,'2026-10-15');assert.equal(screen.find('야근할 프로젝트 업무').props.value,payload(p).taskId);assert.equal(screen.find('요청 완료일'),undefined);
  const candidates=nodes(screen.find('야근 결재 담당자')).filter(node=>node.type==='option').map(node=>node.props.value);assert.ok(candidates.includes(pm.id)&&candidates.includes(chief.id));assert.ok(!candidates.includes(structureChief.id)&&!candidates.includes(inactive.id));
  screen.change('야근 사유','합성 UI 야근 신청');screen.change('야근 시작 시간','18:30');screen.change('야근 종료 시간','21:30');screen.change('야근 결재 담당자',chief.id);await screen.settle();await screen.click('야근 신청 제출');
  const stored=(await read(p.id)).project.scheduleExtensions[0];assert.equal(stored.type,'OVERTIME');assert.equal(stored.workDate,'2026-10-15');assert.equal(stored.hours,3);assert.equal(stored.approverId,chief.id);assert.equal(stored.reason,'합성 UI 야근 신청');assert.equal(stored.requestedEnd,p.endDate);assert.match(screen.notice(),/야근 신청을 제출/);screen.close();
 });
 await check('야근 폼/API: 날짜·당일 시간 오류 및 사유 누락은 저장하지 않고 입력/오류를 유지',async()=>{
  const p=project('invalid');await create(p);const screen=mount('ScheduleExtensionRequests',{project:p});await screen.settle();screen.change('야근 사유','보존할 사유');screen.change('야근 종료 시간','16:00');await screen.settle();await screen.click('야근 신청 제출');assert.match(screen.notice(),/시간/);assert.equal(screen.find('야근 사유').props.value,'보존할 사유');assert.equal((await read(p.id)).project.scheduleExtensions,undefined);
  for(const extra of [{workDate:'2026-10-13'},{workDate:'2026-02-30'},{reason:''},{startTime:'25:00'},{endTime:'17:00'}])assert.equal((await api(worker,'projects/'+p.id+'/extensions','POST',{...payload(p),...extra})).status,400);assert.equal((await read(p.id)).project.scheduleExtensions,undefined);screen.close();
 });
 await check('야근 폼: 활성 팀 결재자가 없으면 확인된 PM을 직접 선택한 뒤에만 신청 가능',async()=>{
  const p=project('only-pm');await create(p);const screen=mount('ScheduleExtensionRequests',{project:p,users:[worker,pm]});await screen.settle();assert.equal(screen.button('야근 신청 제출').props.disabled,true);assert.equal(nodes(screen.find('야근 결재 담당자')).find(node=>node.type==='option'&&node.props.value==='').props.disabled,true);screen.change('야근 결재 담당자',pm.id);screen.change('야근 사유','PM 직접 선택 검수');await screen.settle();await screen.click('야근 신청 제출');const request=(await read(p.id)).project.scheduleExtensions[0];assert.equal(request.approverId,pm.id);assert.ok(db.prepare('SELECT message FROM studio_notifications WHERE user_id=? AND meeting_id=?').get(pm.id,'extension:'+p.id));screen.close();
 });
 await check('실제 UI 야근 승인/반려·타입별 이력: 마감일/배정/진척률 유지 및 요청자 승인 알림',async()=>{
  const p=project('approve-ui');await create(p);let result=await api(worker,'projects/'+p.id+'/extensions','POST',{...payload(p),approverId:chief.id});assert.equal(result.status,200);const requestId=result.data.request.id;
  assert.equal((await api(structureChief,`projects/${p.id}/extensions/${requestId}/approve`,'POST',{revision:result.data.revision})).status,403);
  const approver=mount('ScheduleExtensionRequests',{project:p,actor:chief});await approver.settle();await approver.click('야근 승인');const approved=(await read(p.id)).project;assert.equal(approved.scheduleExtensions[0].status,'APPROVED');assert.deepEqual(approved.subTasks,p.subTasks);assert.equal(approved.endDate,p.endDate);assert.equal(approved.progress,p.progress);assert.ok(db.prepare('SELECT message FROM studio_notifications WHERE id=? AND user_id=?').get('extension-approved:'+requestId,worker.id));
  result=await api(worker,'projects/'+p.id+'/extensions','POST',{...payload(p),workDate:'2026-10-15',approverId:chief.id});assert.equal(result.status,200);approver.update(result.data.project);await approver.settle();await approver.click('야근 반려');assert.equal((await read(p.id)).project.scheduleExtensions[1].status,'REJECTED');assert.match(approver.notice(),/반려/);approver.close();
  const deadline=mount('ScheduleExtensionRequests',{project:approved,requestType:'DEADLINE'});await deadline.settle();assert.ok(deadline.find('요청 완료일'));assert.equal(deadline.find('야근일'),undefined);assert.ok(!text(deadline.tree()).includes('17:00 ~ 20:00'));deadline.close();
 });
 await check('동일 업무의 일정 연장 대기 중 야근 신청/승인 가능·같은 유형 중복409·두 결재 흐름 독립',async()=>{
  const p=project('parallel');await create(p);const deadline=await api(worker,'projects/'+p.id+'/extensions','POST',{...payload(p),type:'DEADLINE',requestedEnd:'2026-11-03',reason:'합성 일정 연장'});assert.equal(deadline.status,200);assert.equal(deadline.data.request.approvalStage,'PM');
  const overtime=await api(worker,'projects/'+p.id+'/extensions','POST',payload(p));assert.equal(overtime.status,200);assert.equal(overtime.data.request.type,'OVERTIME');
  for(const input of [payload(p),{...payload(p),type:'DEADLINE',requestedEnd:'2026-11-04'}])assert.equal((await api(worker,'projects/'+p.id+'/extensions','POST',input)).status,409);
  const screen=mount('ScheduleExtensionRequests',{project:overtime.data.project,actor:chief});await screen.settle();assert.ok(text(screen.tree()).includes('합성 야근 사유'));assert.ok(!text(screen.tree()).includes('합성 일정 연장'));await screen.click('야근 승인');screen.close();
  let current=await read(p.id);assert.equal(current.project.scheduleExtensions.find(request=>request.id===overtime.data.request.id).status,'APPROVED');assert.equal(current.project.scheduleExtensions.find(request=>request.id===deadline.data.request.id).status,'PENDING');assert.deepEqual(current.project.subTasks,p.subTasks);
  const reviewed=await api(pm,`projects/${p.id}/extensions/${deadline.data.request.id}/approve`,'POST',{revision:current.revision});assert.equal(reviewed.status,200);assert.equal(reviewed.data.request.approvalStage,'TEAM');assert.equal(reviewed.data.request.status,'PENDING');
  const approved=await api(chief,`projects/${p.id}/extensions/${deadline.data.request.id}/approve`,'POST',{revision:reviewed.data.revision});assert.equal(approved.status,200);assert.equal(approved.data.request.status,'APPROVED');assert.equal(approved.data.project.subTasks.외부.endDate,'2026-11-03');assert.equal(approved.data.project.scheduleExtensions.find(request=>request.id===overtime.data.request.id).status,'APPROVED');assert.equal(approved.data.project.scheduleExtensions.find(request=>request.id===overtime.data.request.id).hours,3);
 });
 await check('type 없는 기존 대기 기록은 일정 연장으로 판정·연장 중복409·야근은 별도 신청 가능',async()=>{
  const p=project('legacy-type');await create(p);const deadline=await api(worker,'projects/'+p.id+'/extensions','POST',{...payload(p),type:'DEADLINE',requestedEnd:'2026-11-03'});assert.equal(deadline.status,200);const current=await read(p.id),legacy=structuredClone(current.project);delete legacy.scheduleExtensions[0].type;db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(legacy),p.id);
  for(const input of [{...payload(p),type:'DEADLINE',requestedEnd:'2026-11-04'},{taskId:payload(p).taskId,previousEnd:p.endDate,requestedEnd:'2026-11-04',reason:'기존 기본유형'}])assert.equal((await api(worker,'projects/'+p.id+'/extensions','POST',input)).status,409);
  const overtime=await api(worker,'projects/'+p.id+'/extensions','POST',payload(p));assert.equal(overtime.status,200);assert.equal(overtime.data.project.scheduleExtensions[0].type,undefined);assert.equal(overtime.data.project.scheduleExtensions[0].status,'PENDING');assert.equal(overtime.data.project.scheduleExtensions[1].type,'OVERTIME');
 });
 await check('3팀 실제 API 승인→개인 캘린더: 승인된 야근일만 표시·동명이인 분리·대기/반려 제외·공유 갱신',async()=>{
  for(const department of ['마감팀','구조팀','토목&조경팀']){
   const p=project('calendar-'+department,department);await create(p);const submitted=await api(worker,'projects/'+p.id+'/extensions','POST',payload(p));assert.equal(submitted.status,200);const calendar=mount('PersonalScheduleView',{project:submitted.data.project,users:directory});await calendar.settle();await calendar.click('개인/팀별 캘린더');assert.equal(calendar.all().filter(node=>node.props['data-overtime-day']).length,0);
   const approved=await api(manager(department),`projects/${p.id}/extensions/${submitted.data.request.id}/approve`,'POST',{revision:submitted.data.revision});assert.equal(approved.status,200);calendar.update(approved.data.project);await calendar.settle();
   const row=calendar.all().find(node=>node.props['data-schedule-unit']===worker.id),days=nodes(row).filter(node=>node.props['data-overtime-day']);assert.equal(days.length,1);assert.equal(days[0].props['data-overtime-day'],'2026-10-14');assert.equal(text(days[0]),'야근');assert.match(days[0].props.title,/17:00~20:00/);assert.match(days[0].props.title,/3시간/);const peerRow=calendar.all().find(node=>node.props['data-schedule-unit']===peer.id);assert.equal(nodes(peerRow).filter(node=>node.props['data-overtime-day']).length,0);
   const next={...approved.data.project,scheduleExtensions:[...approved.data.project.scheduleExtensions,{...approved.data.request,id:'pending',workDate:'2026-10-15',status:'PENDING'},{...approved.data.request,id:'rejected',workDate:'2026-10-16',status:'REJECTED'}]};calendar.update(next);await calendar.settle();assert.deepEqual(calendar.all().filter(node=>node.props['data-overtime-day']).map(node=>node.props['data-overtime-day']),['2026-10-14']);calendar.close();
  }
 });
 await check('3팀 베트남 개인/팀 캘린더: 실제 신청자만 야근일 표시·팀 모드에는 직원 이름/시간 합산',async()=>{
  for(const department of ['마감팀','구조팀','토목&조경팀']){
   const member=viet.find(person=>person.department===department),p=project('viet-'+department,department,member.id);await create(p);const submitted=await api(member,'projects/'+p.id+'/extensions','POST',payload(p));assert.equal(submitted.status,200);const approved=await api(manager(department),`projects/${p.id}/extensions/${submitted.data.request.id}/approve`,'POST',{revision:submitted.data.revision});assert.equal(approved.status,200);const calendar=mount('PersonalScheduleView',{project:approved.data.project});await calendar.settle();await calendar.click('개인/팀별 캘린더');assert.equal(nodes(calendar.all().find(node=>node.props['data-schedule-unit']===member.id)).filter(node=>node.props['data-overtime-day']).length,1);calendar.find('베트남 일정 팀별').props.onClick();await calendar.settle();const group=calendar.all().find(node=>node.props['data-schedule-unit']===member.vietTeamId),days=nodes(group).filter(node=>node.props['data-overtime-day']);assert.equal(days.length,1);assert.ok(days[0].props.title.includes(member.name));assert.match(days[0].props.title,/17:00~20:00/);calendar.close();
  }
 });
}finally{db.close();mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_OVERTIME_UI_API_CALENDAR_SYNTHETIC',operatingWrites:0,results},null,2)+'\n');}
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
