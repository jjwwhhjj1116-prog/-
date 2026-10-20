import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as work from '../src/utils/personalWork.ts';
import * as extensions from '../src/utils/scheduleExtensionPeriods.ts';
import * as postDelivery from '../src/utils/postDeliveryVisibility.ts';
import * as workCalendar from '../src/utils/workCalendar.ts';
import * as display from '../src/utils/workCalendarDisplay.ts';
import * as progress from '../src/utils/scheduleProgress.ts';
import * as projectScheduleDates from '../src/utils/projectScheduleDates.ts';
import * as allocations from '../src/utils/scheduleAllocations.ts';
import * as rebase from '../src/utils/rebaseProject.ts';
import * as permissions from '../src/utils/schedulePermissions.ts';
import * as viet from '../src/utils/vietPersonnel.ts';
import * as staff from '../src/utils/staffOrder.ts';
import * as holidays from '../src/constants/holidays.ts';
import {VIET_TEAMS_DATA} from '../src/data/vietTeams.ts';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),before=process.argv.includes('--before'),results=[];
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'test-results/viet-personnel-ui.json';
const RealDate=Date;class TestDate extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-08T03:00:00Z']));}static now(){return new RealDate('2026-10-08T03:00:00Z').valueOf();}}
const nativeFetch=globalThis.fetch;let requests=0;globalThis.fetch=()=>{requests++;throw Error('External requests are forbidden');};
const sourceFor=name=>readFileSync(new URL((before?'../../private-provisioning/qa-vn-personal-teams-20261008/ui-originals/scheduler-web/src/components/':'../src/components/')+name+'.tsx',import.meta.url),'utf8');
function pure(file,names,globals={}){const source=ts.createSourceFile(file,readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),statements=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>names.includes(declaration.name.getText(source))));assert.equal(statements.length,names.length);const exports={};runInNewContext(ts.transpileModule(statements.map(node=>node.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,...globals});return exports;}
const {TEAM_ROLES,syncProjectTasks}=pure('store/useProjectStore.ts',['TEAM_ROLES','syncProjectTasks'],{projectProgress:progress.projectProgress,allocationScheduleOnly:progress.allocationScheduleOnly});
const {isUserAdmin}=pure('store/useAuthStore.ts',['ADMIN_EMAILS','isUserAdmin']);
const pendingAssignment=pure('utils/pendingAssignment.ts',['projectPMId','projectHasNoPM','pendingAssignmentReason'],{projectScheduleRange:progress.projectScheduleRange,validDateRange:progress.validDateRange});
const manager={id:'u_12',name:'합성 실장',email:'yjw@con-cost.com',company:'컨코스트',department:'마감팀',position:'실장',role:'ADMIN'};
const a={id:'vn-runtime-a',no:9001,name:'NGUYỄN CÙNG TÊN ĐẦY ĐỦ',engName:'NGUYEN CUNG TEN DAY DU',company:'VIETQS',department:'마감팀',originalDept:'Internal1',position:'사원',idPrefix:'synthetic-vn-a',active:true,vietTeamId:'vt_in1'};
const b={...a,id:'vn-runtime-b',no:9002,idPrefix:'synthetic-vn-b'},c={...a,id:'vn-runtime-unassigned',no:9003,name:'TRẦN KHÔNG NHÓM',idPrefix:'synthetic-vn-unassigned',vietTeamId:undefined};
const cross={...a,id:'vn-cross-department',no:9004,department:'구조팀',vietTeamId:'vt_horiz_apartment'},inactive={...a,id:'vn-inactive',no:9005,active:false};
const kr={id:'kr-retained',no:9010,name:'기존 한국 직원',company:'컨코스트',department:'마감팀',originalDept:'마감팀',position:'프로',active:true,idPrefix:'synthetic-kr'};
const directory=[manager,a,b,c,cross,inactive,kr];
const task={roleName:'내부',personId:kr.id,personIds:[kr.id],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'원 공종 업무 메모',progress:35,actualProgressDate:'2026-10-06',reportingMode:'TASK'};
const baseProject={id:'vn-ui-synthetic',code:'QA-VN-UI',name:'합성 VN 개인 일정',department:'마감팀',pmId:manager.id,startDate:'2026-10-06',endDate:'2026-10-30',status:'진행중',progress:56,roles:{},subTasks:{내부:task,PM:{...task,roleName:'PM',personId:manager.id,personIds:[manager.id],allocations:[]}}};
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'&&node.props?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
const norm=node=>text(node).replace(/\s/g,'');
function mount(name,options={}){
 const state={projects:[structuredClone(options.project||baseProject)],personnel:directory.map(user=>({id:user.id,name:user.name,team:user.department,region:user.company==='VIETQS'?'VIETNAM':'KOREA',avatar:''})),filterDepartment:'ALL'},auth={users:structuredClone(options.users||directory),currentUser:options.user||manager,googleDriveConfig:{connected:false}},shared={ready:true,conflict:false,status:'합성 공유 연결',pending:0,...options.shared},personal={leaves:structuredClone(options.leaves||[])},writes=[],accountWrites=[];
 const projectHook=selector=>typeof selector==='function'?selector(state):state;projectHook.getState=()=>state;state.setSelectedProjectId=()=>{};
 state.updateProjectSubTasks=(id,tasks)=>{assert.ok(permissions.canManageSchedule(auth.currentUser,state.projects.find(project=>project.id===id).department));writes.push(structuredClone(tasks));state.projects=state.projects.map(project=>project.id===id?syncProjectTasks(project,tasks):project);dirty=true;};
 state.updateSubTask=(id,role,patch)=>state.updateProjectSubTasks(id,{...state.projects.find(project=>project.id===id).subTasks,[role]:{...state.projects.find(project=>project.id===id).subTasks[role],...patch}});
 const hooks=[];let cursor=0,dirty=false,pending=[],tree;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(next!==hooks[index]){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
 const useEffect=(fn,deps)=>{const index=cursor++,old=hooks[index];if(!old||!deps||deps.some((value,index)=>value!==old[index])){hooks[index]=deps;pending.push(fn);}};
 const react={...React,useState,useRef,useEffect,useMemo:fn=>fn()};
 const authHook=selector=>typeof selector==='function'?selector(auth):auth;auth.clearError=()=>{};auth.testGoogleDriveConnection=async()=>false;auth.adminAddUser=async record=>{accountWrites.push(structuredClone(record));return true;};auth.adminUpdateUser=async(id,patch)=>{accountWrites.push({id,patch});return true;};auth.adminResetPassword=async()=>true;auth.adminDeleteUser=async()=>true;auth.changePassword=async()=>({success:true,message:'합성'});
 const modules={'react':react,'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'date-fns':require('date-fns'),'date-fns/locale':require('date-fns/locale'),'../store/useProjectStore':{useProjectStore:projectHook,TEAM_ROLES},'../store/useAuthStore':{useAuthStore:authHook,isUserAdmin},'../store/useStudioStore':{useStudioStore:()=>shared},'../store/usePersonalStore':{usePersonalStore:selector=>selector({leaves:[]})},'../store/useLanguageStore':{useLanguageStore:selector=>selector({lang:'ko'})},'../utils/personalWork':work,'../utils/scheduleExtensionPeriods':extensions,'../utils/scheduleProgress':progress,'../utils/schedulePermissions':permissions,'../utils/pendingAssignment':pendingAssignment,'../utils/scheduleAllocations':allocations,'../utils/rebaseProject':rebase,'../utils/vietPersonnel':viet,'../utils/staffOrder':staff,'../data/vietTeams':{VIET_TEAMS_DATA},'../constants/holidays':holidays,'../services/excelService':{exportProjectsToExcel:()=>{},importProjectsFromExcel:()=>{}},'../services/translationService':{printTranslated:()=>{},translatedAlert:()=>{}},'./ProjectDetailPrint':{ProjectDetailPrint:()=>null},'./PostDeliverySchedule':{PostDeliverySchedule:()=>null},'./VietTeamModal':{VietTeamModal:()=>null},'./ProjectCalendar':{default:()=>null}};
 modules['../store/usePersonalStore']={usePersonalStore:selector=>selector(personal)};
 modules['./GeminiKeySettings']={GeminiKeySettings:()=>null};
 modules['../utils/projectScheduleDates']=projectScheduleDates;
 modules['../utils/postDeliveryVisibility']=postDelivery;
 modules['../utils/workCalendar']=workCalendar;modules['../utils/workCalendarDisplay']=display;
 const exports={};runInNewContext(ts.transpileModule(sourceFor(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,Date:TestDate,Error,structuredClone,crypto:webcrypto,console,setTimeout:()=>1,window:{location:{search:'',hash:''}},require:path=>{assert.ok(path in modules,'Unexpected UI dependency '+path);return modules[path];}});
 const Component=exports.default||exports[name],props=options.props||({ProjectModal:{projectId:state.projects[0].id,onClose:()=>{}},VietTeamModal:{team:viet.resolveVietTeams(auth.users,'마감팀')[0],isOpen:true,onClose:()=>{}},PersonalScheduleView:{department:'마감팀'},SettingsView:{},ProjectCalendar:{date:new TestDate(2026,9,1)}}[name]);
 const render=()=>{for(let cycle=0;cycle<20;cycle++){cursor=0;pending=[];dirty=false;tree=Component(props);for(const effect of pending)effect();if(!dirty)return tree;}throw Error('UI fixture effects did not settle');};
 const find=label=>nodes(tree).find(node=>node.props['aria-label']===label),button=label=>nodes(tree).find(node=>node.type==='button'&&norm(node)===label.replace(/\s/g,''));
 const invoke=(node,value)=>{assert.ok(node,'UI event node must exist');const fn=node.props.onChange||node.props.onClick;assert.equal(typeof fn,'function');const result=fn({target:{value,checked:value},preventDefault:()=>{}});render();return result;};
 render();return {state,auth,shared,personal,writes,accountWrites,render,find,button,invoke,tree:()=>tree,html:()=>renderToStaticMarkup(tree),read:()=>structuredClone(state.projects[0]),all:()=>nodes(tree)};
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
function focusProject(e){e.invoke(e.all().find(node=>node.type==='div'&&node.key==='내부'&&node.props.onClick));if(e.find('베트남 배정 개인 선택'))e.invoke(e.find('베트남 배정 개인 선택'));}
function unitButton(e,id){const unit=e.all().find(node=>node.type==='div'&&node.key===id&&node.props.className?.includes('rounded-2xl border-2'));return nodes(unit).find(node=>node.type==='button');}
function popup(e){const selects=e.all().filter(node=>node.type==='select');e.invoke(e.find('배치할 프로젝트')||selects[0],e.state.projects[0].id);e.invoke(e.find('배치할 공종')||e.all().filter(node=>node.type==='select')[1],'내부');}
try{
 await check('실제 3부서 개인 캘린더: 승인 연장일만 빨간 게이지, 월경계·중첩·개인 배정구간 보존',()=>{
  for(const department of ['마감팀','구조팀','토목&조경팀']){
   const person={...kr,department},p={...structuredClone(baseProject),department},taskId=`gen-${p.id}-내부`,appliedTaskId=taskId+'-personal-extension';
   p.subTasks.내부.personIds=[person.id];p.subTasks.내부.endDate='2026-11-03';
   const request=(id,previousEnd,requestedEnd,status='APPROVED',extra={})=>({id,taskId,userId:person.id,userName:person.name,roleName:'내부',type:'DEADLINE',previousEnd,requestedEnd,reason:'합성',createdAt:'2026-10-14',status,...extra});
   p.scheduleExtensions=[request('first','2026-10-08','2026-10-12'),request('second','2026-10-12','2026-10-16'),request('pending','2026-10-16','2026-10-20','PENDING'),request('rejected','2026-10-16','2026-10-21','REJECTED'),request('overtime','2026-10-16','2026-10-22','APPROVED',{type:'OVERTIME'}),request('other','2026-10-16','2026-10-23','APPROVED',{taskId:'other-task'}),request('split','2026-10-16','2026-10-19','APPROVED',{appliedTaskId}),request('month-boundary','2026-10-29','2026-11-03')];
   const original=JSON.stringify(p),e=mount('PersonalScheduleView',{users:[person],props:{department},project:p});e.invoke(e.button('개인/팀별 캘린더'));
   const row=e.all().find(node=>node.props['data-schedule-unit']===person.id),red=nodes(row).filter(node=>node.props['data-extension-start']);
   assert.deepEqual(red.map(node=>[node.props['data-extension-start'],node.props['data-extension-end']]),[['2026-10-12','2026-10-16'],['2026-10-30','2026-10-30']]);assert.ok(red.every(node=>node.props.className.includes('bg-red-700')));
   // Approved intent remains unchanged; calendar bars and their overlays mask holidays/weekends.
   assert.equal(parseFloat(red[0].props.style.left),0);assert.equal(parseFloat(red[0].props.style.width),100);assert.equal(parseFloat(red[1].props.style.left),80);assert.equal(parseFloat(red[1].props.style.width),20);
   assert.deepEqual(extensions.scheduleExtensionPeriods(p,{id:appliedTaskId,startDate:'2026-10-17',endDate:'2026-10-19'}),[{start:'2026-10-17',end:'2026-10-19'}]);
   assert.equal(JSON.stringify(p),original);assert.equal(e.writes.length,0);
  }
 });
 await check('실제 ProjectModal 개인/전체 배정: same-name ID분리·기존 anchor/일지·PM·타인·공정률 보존',()=>{
  const e=mount('ProjectModal'),original=e.read();focusProject(e);assert.equal(e.writes.length,0);assert.ok(e.find('베트남 배정 개인 선택').props['aria-pressed']);assert.ok(e.html().includes(a.name)&&e.html().includes(a.idPrefix)&&e.html().includes(b.idPrefix));assert.equal(unitButton(e,cross.id),undefined);assert.equal(unitButton(e,inactive.id),undefined);
  e.invoke(unitButton(e,a.id));const personal=e.read(),old=work.assignedTasks(kr.id,[original])[0],retained=work.assignedTasks(kr.id,[personal])[0];assert.deepEqual(personal.subTasks.내부.personIds,[kr.id,a.id]);assert.equal(retained.id,old.id);assert.equal(retained.scheduleMemo,old.scheduleMemo);assert.deepEqual(personal.subTasks.PM,original.subTasks.PM);assert.equal(personal.progress,original.progress);
  e.invoke(e.find('베트남 배정 팀 전체'));e.invoke(unitButton(e,'vt_in1'));const full=e.read();assert.deepEqual(full.subTasks.내부.personIds,[kr.id,a.id,b.id]);assert.ok(full.subTasks.내부.allocations.every(period=>!period.personIds.includes('vt_in1')));assert.equal(work.assignedTasks(a.id,[full]).length,1);assert.equal(work.assignedTasks(b.id,[full]).length,1);assert.deepEqual(full.subTasks.내부.allocations[0],personal.subTasks.내부.allocations[0]);
  const manual={...old,todayTask:'원 작성 수행',progress:70,manualFields:['todayTask','progress']},draft=work.reconcileWorkLogItems([manual],kr.id,'2026-10-06',[full]);assert.equal(draft[0].id,old.id);assert.equal(draft[0].todayTask,manual.todayTask);assert.equal(draft[0].progress,70);assert.equal(work.assignedItems(b.id,'2026-10-06',[full]).length,1);
 });
 await check('실제 ProjectModal legacy 팀 상속·직접 해제·조회전용·scope guard 및 명시복원',()=>{
  const inherited={...a,id:VIET_TEAMS_DATA.find(team=>team.id==='vt_in1').members[0].id},p=structuredClone(baseProject);p.subTasks.내부.personId='vt_in1';p.subTasks.내부.personIds=['vt_in1',kr.id];const e=mount('ProjectModal',{project:p,users:[manager,inherited,b,c,kr]});focusProject(e);assert.ok(work.taskAssignedTo(e.read().subTasks.내부,inherited.id));assert.match(unitButton(e,inherited.id).props.title,/추가 배정/);e.invoke(unitButton(e,inherited.id));e.invoke(unitButton(e,inherited.id));assert.ok(e.read().subTasks.내부.personIds.includes('vt_in1'));assert.ok(work.taskAssignedTo(e.read().subTasks.내부,inherited.id));assert.ok(text(e.tree()).includes('기존 팀 배정 유지'));
  const readonly=mount('ProjectModal',{user:kr});focusProject(readonly);const prior=readonly.read();assert.equal(unitButton(readonly,a.id).props.disabled,true);readonly.invoke(unitButton(readonly,a.id));assert.equal(readonly.writes.length,0);assert.deepEqual(readonly.read(),prior);
  const scoped=structuredClone(baseProject);Object.assign(scoped.subTasks.내부,{scopeExcluded:true,personId:'',personIds:[],allocations:[]});const scope=mount('ProjectModal',{project:scoped});focusProject(scope);assert.equal(unitButton(scope,a.id).props.disabled,true);scope.invoke(unitButton(scope,a.id));assert.equal(scope.writes.length,0);scope.invoke(scope.find('내부 담당자 배정'),a.id);assert.equal(scope.read().subTasks.내부.scopeExcluded,false);assert.deepEqual(scope.read().subTasks.내부.personIds,[a.id]);
 });
 await check('실제 VietTeamModal 날짜/전체 선택: 신규 실제 ID에만 선택기간·기존 Task와 원문 유지',()=>{
  const e=mount('VietTeamModal');popup(e);const original=e.read(),old=work.assignedTasks(kr.id,[original])[0];e.invoke(e.find('베트남 인원 투입 시작일'),'2026-10-12');e.invoke(e.find('베트남 인원 투입 종료일'),'2026-10-15');e.invoke(e.find('베트남 팀 전체 인원 배정'),true);const next=e.read(),rows=work.assignedTasks(a.id,[next]);assert.deepEqual(next.subTasks.내부.personIds,[kr.id,a.id,b.id]);assert.equal(rows[0].startDate,'2026-10-12');assert.equal(rows[0].endDate,'2026-10-15');assert.equal(work.assignedTasks(kr.id,[next])[0].id,old.id);assert.equal(work.assignedTasks(kr.id,[next])[0].endDate,old.endDate);assert.deepEqual(next.subTasks.PM,original.subTasks.PM);assert.equal(next.progress,original.progress);assert.equal(work.assignedItems(a.id,'2026-10-06',[next]).length,0);assert.equal(work.assignedItems(a.id,'2026-10-12',[next]).length,1);assert.ok(e.html().includes(a.idPrefix)&&e.html().includes(b.idPrefix));
 });
 await check('실제 VietTeamModal stale callback·날짜 오류·충돌·조회전용 강제호출은 쓰기 차단',()=>{
  const e=mount('VietTeamModal');popup(e);const stale=e.find('베트남 팀 전체 인원 배정').props.onChange;e.state.projects[0]=structuredClone(e.state.projects[0]);e.state.projects[0].subTasks.내부.memo='다른 PC 메모';stale({target:{checked:true}});e.render();assert.equal(e.writes.length,0);assert.match(text(e.tree()),/다른 화면에서 일정/);e.invoke(e.find('베트남 인원 투입 시작일'),'2026-10-20');e.invoke(e.find('베트남 인원 투입 종료일'),'2026-10-12');e.invoke(e.find('베트남 팀 전체 인원 배정'),true);assert.equal(e.writes.length,0);assert.match(text(e.tree()),/시작일/);
  for(const options of [{shared:{conflict:true}},{shared:{ready:false}},{user:kr}]){const blocked=mount('VietTeamModal',options);popup(blocked);assert.equal(blocked.find('베트남 팀 전체 인원 배정').props.disabled,true);blocked.invoke(blocked.find('베트남 팀 전체 인원 배정'),true);assert.equal(blocked.writes.length,0);}
 });
 await check('실제 PersonalSchedule 개인 실명/login·미지정 보존 및 그룹 actualmembers 작업 합집합 중복0',()=>{
  const p=structuredClone(baseProject);p.subTasks.내부=allocations.updateAssignmentMembers({...task,personId:'',personIds:[],allocations:[]},{addIds:[a.id,b.id],startDate:'2026-10-12',endDate:'2026-10-15'});p.subTasks.외부=allocations.updateAssignmentMembers({...task,roleName:'외부',personId:'',personIds:[],allocations:[]},{addIds:[c.id],startDate:'2026-10-20',endDate:'2026-10-21'});
  const e=mount('PersonalScheduleView',{project:p});e.invoke(e.button('개인/팀별 캘린더'));assert.ok(e.find('베트남 일정 개인별').props['aria-pressed']);for(const person of [a,b,c]){const row=e.all().find(node=>node.type==='div'&&node.key===person.id);assert.ok(row,person.id+' personal row');assert.ok(text(row).includes(person.name)&&text(row).includes(person.idPrefix));assert.equal(nodes(row).filter(node=>node.props['data-allocation-id']).length,1);}
  e.invoke(e.find('베트남 일정 팀별'));const team=e.all().find(node=>node.type==='div'&&node.key==='vt_in1');assert.ok(text(team).includes('VIET 내부1팀'));assert.deepEqual(viet.resolveVietTeams(e.auth.users,'마감팀').find(group=>group.id==='vt_in1').members.map(member=>member.id),[a.id,b.id]);assert.equal(nodes(team).filter(node=>node.props['data-allocation-id']).length,1,'Two employees sharing one allocation must yield one team bar');assert.ok(e.all().some(node=>node.type==='div'&&node.key===c.id),'Ungrouped employee must remain visible in team mode');assert.equal(e.writes.length,0);
 });
 await check('실제 개인 캘린더: 3부서 휴가 전 일자·동명이인 ID·반차·월경계·취소 공유 갱신',()=>{
  const leave=(id,user_id,start_date,end_date,kind='연차')=>({id,user_id,start_date,end_date,kind,revision:1});
  for(const department of ['마감팀','구조팀','토목&조경팀']){
   const person={...kr,department},other={...person,id:'different-id',name:person.name};
   const leaves=[leave('cross-month',person.id,'2026-09-30','2026-10-03'),leave('am',person.id,'2026-10-14','2026-10-14','오전 반차'),leave('pm',person.id,'2026-10-14','2026-10-14','오후 반차'),leave('next-month',person.id,'2026-10-31','2026-11-02'),leave('foreign',other.id,'2026-10-06','2026-10-07'),leave('name-is-not-id',person.name,'2026-10-09','2026-10-09')];
   const e=mount('PersonalScheduleView',{users:[person,other],leaves,props:{department},project:{...structuredClone(baseProject),department}});
   e.invoke(e.button('개인/팀별 캘린더'));
   const row=()=>e.all().find(node=>node.props['data-schedule-unit']===person.id),cells=()=>nodes(row()).filter(node=>node.props['data-leave-day']);
   assert.deepEqual(cells().map(node=>node.props['data-leave-day']),['2026-10-01','2026-10-02','2026-10-03','2026-10-14','2026-10-31']);
   assert.ok(cells().every(node=>node.props.className.includes('bg-amber-50')&&text(node)==='휴'));
   assert.ok(cells().find(node=>node.props['data-leave-day']==='2026-10-14').props.title.includes('오전 반차 / 오후 반차'));
   const bars=nodes(row()).filter(node=>node.props['data-leave-id']);assert.equal(bars.length,4);assert.ok(bars.find(node=>node.props['data-leave-id']==='cross-month').props.style.left==='0%');
   assert.equal(nodes(row()).filter(node=>node.props['data-allocation-id']).length,0,'Legacy project may have a task but this check does not create allocations');
   e.invoke(e.all().find(node=>node.type==='button'&&node.props.title==='다음 달'));
   assert.deepEqual(cells().map(node=>node.props['data-leave-day']),['2026-11-01','2026-11-02']);
   assert.equal(nodes(row()).filter(node=>node.props['data-leave-id']).length,1);
   e.personal.leaves=[];e.render();assert.equal(cells().length,0);assert.equal(nodes(row()).filter(node=>node.props['data-leave-id']).length,0);assert.equal(e.writes.length,0);
  }
 });
 await check('실제 VN 개인/팀 캘린더: 현재 회원 ID 휴가 합집합·이름·팀외 제외·배정 보존',()=>{
  const leaves=[{id:'vn-a-leave',user_id:a.id,start_date:'2026-10-06',end_date:'2026-10-07',kind:'휴가',revision:1},{id:'vn-b-leave',user_id:b.id,start_date:'2026-10-08',end_date:'2026-10-08',kind:'연차',revision:1},{id:'vn-other-leave',user_id:c.id,start_date:'2026-10-10',end_date:'2026-10-11',kind:'연차',revision:1}];
  const p=structuredClone(baseProject);p.subTasks.내부=allocations.updateAssignmentMembers({...task,personId:'',personIds:[],allocations:[]},{addIds:[a.id,b.id],startDate:'2026-10-06',endDate:'2026-10-15'});
  const e=mount('PersonalScheduleView',{project:p,leaves});e.invoke(e.button('개인/팀별 캘린더'));
  const row=id=>e.all().find(node=>node.props['data-schedule-unit']===id),days=id=>nodes(row(id)).filter(node=>node.props['data-leave-day']).map(node=>node.props['data-leave-day']);
  assert.deepEqual(days(a.id),['2026-10-06','2026-10-07']);assert.deepEqual(days(b.id),['2026-10-08']);
  const personalTask=nodes(row(a.id)).find(node=>node.props['data-allocation-id']);assert.ok(personalTask);
  e.invoke(e.find('베트남 일정 팀별'));
  assert.deepEqual(days('vt_in1'),['2026-10-06','2026-10-07','2026-10-08']);
  const bars=nodes(row('vt_in1')).filter(node=>node.props['data-leave-id']);assert.equal(bars.length,2);assert.ok(bars.every(node=>node.props.title.includes(a.name)));assert.ok(!text(row('vt_in1')).includes('10-10'));
  const taskBars=nodes(row('vt_in1')).filter(node=>node.props['data-allocation-id']);assert.equal(new Set(taskBars.map(node=>node.props['data-allocation-id'])).size,1,'Shared allocation remains one source assignment');assert.deepEqual(taskBars.map(node=>[node.props['data-work-start'],node.props['data-work-end']]),[['2026-10-06','2026-10-09'],['2026-10-12','2026-10-15']],'Weekend is masked without duplicating the shared allocation');assert.deepEqual(e.read(),p);assert.equal(e.writes.length,0);
 });
 await check('실제 3부서 캘린더: 소속 외 PM legacyalias·VN 직접 배정자 휴가 포함, 미배정·다음월 제외',()=>{
  for(const department of ['마감팀','구조팀','토목&조경팀']){
   const own={...kr,department},outside={...manager,id:'outside-kr',no:9021,name:'소속 외 합성 PM',department:'개발 TF'};
   const vn={...a,id:'outside-vn',no:9022,department:department==='구조팀'?'마감팀':'구조팀',vietTeamId:department==='구조팀'?'vt_in1':'vt_vert_general'};
   const absent={...outside,id:'outside-unassigned',no:9023,name:'미배정 타팀 직원'};
   const p={...structuredClone(baseProject),department};Object.assign(p.subTasks.PM,{personId:outside.name,personIds:[outside.name],startDate:'2026-10-06',endDate:'2026-10-08'});delete p.subTasks.PM.allocations;Object.assign(p.subTasks.내부,{personId:vn.id,personIds:[vn.id]});
   const leaves=[outside,vn,absent].map(person=>({id:'leave-'+person.id,user_id:person.id,start_date:'2026-10-07',end_date:'2026-10-08',kind:'연차',revision:1}));
   const e=mount('PersonalScheduleView',{project:p,users:[own,outside,vn,absent],leaves,props:{department}});e.invoke(e.button('개인/팀별 캘린더'));
   const row=id=>e.all().find(node=>node.props['data-schedule-unit']===id);
   for(const person of [outside,vn]){assert.ok(row(person.id));assert.deepEqual(nodes(row(person.id)).filter(node=>node.props['data-leave-day']).map(node=>node.props['data-leave-day']),['2026-10-07','2026-10-08']);assert.ok(nodes(row(person.id)).some(node=>node.props.onClick),'Assigned project bar must remain');}
   assert.equal(row(absent.id),undefined);assert.ok(text(row(vn.id)).includes('타팀 배정'));
   e.invoke(e.find('베트남 일정 팀별'));assert.ok(row(vn.id),'A cross-team VN assignee must remain an individual row in team mode');
   e.invoke(e.all().find(node=>node.type==='button'&&node.props.title==='다음 달'));assert.equal(row(outside.id),undefined);assert.equal(row(vn.id),undefined);assert.deepEqual(e.read(),p);assert.equal(e.writes.length,0);
  }
 });
 await check('실제 Settings 회사별 초기/리셋 비밀번호 조건·부서그룹제한 및 개인설정8자 유지',()=>{
  const e=mount('SettingsView');e.invoke(e.all().find(node=>node.type==='button'&&/회원관리/.test(norm(node))));e.invoke(e.all().find(node=>node.type==='button'&&/신규회원/.test(norm(node))));const pw=()=>e.all().find(node=>node.type==='input'&&node.props.type==='password');assert.equal(pw().props.minLength,8);const company=e.all().find(node=>node.type==='select'&&nodes(node).some(option=>option.type==='option'&&option.props.value==='VIETQS'));e.invoke(company,'VIETQS');assert.equal(pw().props.minLength,4);assert.match(pw().props.pattern,/0-9/);const pattern=new RegExp('^(?:'+pw().props.pattern+')$');assert.ok(pattern.test('1234'));assert.ok(pattern.test('abcdefgh'));assert.ok(!pattern.test('abcd'));assert.ok(!pattern.test('12345'));const groups=e.find('신규 베트남 소속 그룹');assert.ok(nodes(groups).filter(node=>node.type==='option'&&node.props.value).every(option=>viet.VIET_ASSIGNMENT_GROUPS.find(group=>group.id===option.props.value).department==='마감팀'));
  const member=mount('SettingsView');member.invoke(member.all().find(node=>node.type==='button'&&/회원관리/.test(norm(node))));const row=member.all().find(node=>node.key===a.id&&node.type==='tr'),reset=nodes(row).find(node=>node.type==='button'&&/비밀번호|리셋/.test(node.props.title||text(node)));assert.ok(reset);member.invoke(reset);const resetInput=member.all().find(node=>node.type==='input'&&node.props.type==='password');assert.equal(resetInput.props.minLength,4);assert.match(text(member.tree()),/숫자 4자리 또는 8~256자/);
  const own=mount('SettingsView',{user:{...a,role:'MEMBER'}});assert.ok(own.all().filter(node=>node.type==='input'&&node.props.type==='password').filter(node=>node.props.minLength).every(node=>node.props.minLength===8));
 });
 await check('실제 ProjectCalendar PM 본문과 간트 본문에 베트남 전체 실명 표시',()=>{
  const p=structuredClone(baseProject);p.pmId=a.id;p.subTasks.PM.personId=a.id;p.subTasks.PM.personIds=[a.id];const e=mount('ProjectCalendar',{project:p});const visible=e.all().filter(node=>node.type==='span'&&text(node).includes(a.name));assert.ok(visible.length>=2,'Both PM column and Gantt PM caption must keep the complete name');assert.equal(e.writes.length,0);
 });
}finally{globalThis.fetch=nativeFetch;}
writeFileSync(output,JSON.stringify({kind:'ACTUAL_COMPONENT_HANDLERS_AND_SSR_SYNTHETIC',protectedUiOriginal:before,externalRequests:requests,operatingWrites:0,results,limits:['Actual UI functions and event handlers run in a memory fixture; physical browser/operating account validation belongs to root.']},null,2));
if(requests||results.some(result=>result.status!=='PASS'))process.exitCode=1;
