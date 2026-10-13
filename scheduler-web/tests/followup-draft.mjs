import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {rebaseProject} from '../src/utils/rebaseProject.ts';
import * as scheduleProgress from '../src/utils/scheduleProgress.ts';
import * as projectScheduleDates from '../src/utils/projectScheduleDates.ts';
import * as personalWork from '../src/utils/personalWork.ts';
import {withAllocationBounds,updateAssignmentMembers} from '../src/utils/scheduleAllocations.ts';
import * as vietPersonnel from '../src/utils/vietPersonnel.ts';
import {canManageSchedule} from '../src/utils/schedulePermissions.ts';

const sourcePath=fileURLToPath(new URL('../src/components/PostDeliverySchedule.tsx',import.meta.url));
const source=readFileSync(sourcePath,'utf8');
const rebaseSourcePath=fileURLToPath(new URL('../src/utils/rebaseProject.ts',import.meta.url));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const require=createRequire(import.meta.url);
const jsx=require('react/jsx-runtime');
const hash=text=>createHash('sha256').update(text).digest('hex');
const task={id:'follow-qa',kind:'수정',startDate:'2026-10-06',endDate:'2026-10-09',memo:'원본 메모',personIds:['worker'],status:'예정',reportingModes:{worker:'DAILY'},progress:35,actualProgressDate:'2026-10-02'};
const project={id:'project-qa',code:'QA',name:'합성 검수',department:'마감팀',startDate:'2026-09-01',endDate:'2026-09-30',progress:55,status:'납품',pmId:'manager',roles:{},subTasks:{},postDeliveryTasks:[task]};

// Execute the real component's handlers; only React state, authentication and the store are isolated.
function editor(options={}){
 let state={projects:[structuredClone(options.project||project)]},writes=0,cursor=0,tree;
 const directory=structuredClone(options.users||[{id:'worker',name:'검수 직원',company:'컨코스트',department:'마감팀',position:'선임'}]);
 const hooks=[];
 state.updateProject=(id,patch)=>{writes++;state.projects=state.projects.map(p=>p.id===id?{...p,...patch}:p);};
 const useProjectStore=selector=>selector(state);useProjectStore.getState=()=>state;
 const useAuthStore=selector=>selector({currentUser:options.user||{id:'manager',department:'마감팀',position:'실장'},users:directory});
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];};
 const exports={};
 runInNewContext(compiled,{exports,structuredClone,crypto:{randomUUID:()=> 'follow-new'},require:path=>{
  if(path==='react')return {useState};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='../store/useProjectStore')return {useProjectStore};
  if(path==='../store/useAuthStore')return {useAuthStore};
  if(path==='../utils/schedulePermissions')return {canManageSchedule};
  if(path==='../utils/scheduleProgress')return {localDate:()=> '2026-10-05'};
  if(path==='../utils/vietPersonnel')return vietPersonnel;
  throw Error(`Unexpected dependency: ${path}`);
 }},{filename:sourcePath});
 const render=()=>{cursor=0;tree=exports.PostDeliverySchedule({project:state.projects[0]});};
 const nodes=node=>Array.isArray(node)?node.flatMap(child=>nodes(child)):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
 const control=label=>{const row=nodes(tree).find(node=>node.type==='label'&&Array.isArray(node.props.children)&&node.props.children[0]===label);assert.ok(row,`Missing label: ${label}`);return nodes(row).find(node=>node.type==='input'||node.type==='select');};
 const click=text=>{const button=nodes(tree).find(node=>node.type==='button'&&node.props.children===text);assert.ok(button,`Missing button: ${text}`);button.props.onClick();render();};
 render();
 return {
  open:()=>click('편집'),
  change:(label,value)=>{control(label).props.onChange({target:{value}});render();},
  remote:patch=>{state.projects=state.projects.map(p=>({...p,postDeliveryTasks:p.postDeliveryTasks.map(t=>({...t,...patch}))}));render();},
  remove:()=>{state.projects=[{...state.projects[0],postDeliveryTasks:[]}];render();},
  save:()=>click('일정 수정 저장'),
  read:label=>control(label).props.value,
  candidates:()=>nodes(control('담당자')).filter(node=>node.type==='option').map(node=>node.props.value),
  directory,all:()=>nodes(tree),
  message:()=>nodes(tree).find(node=>node.props.role==='status')?.props.children||'',
  task:()=>state.projects[0].postDeliveryTasks[0],
  writes:()=>writes,
  project:()=>state.projects[0]
 };
}

const results=[],onlyProjectDates=process.argv.includes('--only-project-dates'),onlyVietFollowup=process.argv.includes('--only-viet-followup');
function check(name,fn){if(onlyProjectDates&&!name.startsWith('프로젝트 원기간')||onlyVietFollowup&&!name.startsWith('VN 후속'))return;try{fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',reason:error.message});}}
check('메모만 수정하면 최신 승인 실적·일자·변경된 상태를 보존',()=>{
 const e=editor();e.open();e.remote({progress:100,actualProgressDate:'2026-10-05',status:'완료'});e.change('수정·검토 메모','수정 메모');e.save();
 assert.equal(e.task().progress,100);assert.equal(e.task().actualProgressDate,'2026-10-05');assert.equal(e.task().status,'완료');assert.equal(e.task().memo,'수정 메모');assert.equal(e.project().progress,55);
});
check('로컬 시작일과 원격 종료일을 합치고 승인 실적을 보존',()=>{
 const e=editor();e.open();e.remote({endDate:'2026-10-12',progress:70,actualProgressDate:'2026-10-05'});e.change('시작일','2026-10-07');e.save();
 assert.equal(e.task().startDate,'2026-10-07');assert.equal(e.task().endDate,'2026-10-12');assert.equal(e.task().progress,70);assert.equal(e.task().actualProgressDate,'2026-10-05');
});
check('같은 메모의 원격 변경은 저장을 거절하고 초안을 유지',()=>{
 const e=editor();e.open();e.remote({memo:'원격 메모'});e.change('수정·검토 메모','로컬 메모');e.save();
 assert.equal(e.writes(),0);assert.equal(e.task().memo,'원격 메모');assert.equal(e.read('수정·검토 메모'),'로컬 메모');assert.match(e.message(),/변경|충돌/);
});
check('삭제된 일정은 저장을 거절하고 초안을 유지',()=>{
 const e=editor();e.open();e.change('수정·검토 메모','삭제 후 남은 초안');e.remove();e.save();
 assert.equal(e.writes(),0);assert.equal(e.task(),undefined);assert.equal(e.read('수정·검토 메모'),'삭제 후 남은 초안');assert.match(e.message(),/삭제|찾을/);
});
check('명시적인 완료 상태 변경도 승인된 70%를 100%로 바꾸지 않음',()=>{
 const e=editor();e.open();e.remote({progress:70,actualProgressDate:'2026-10-05'});e.change('상태','완료');e.save();
 assert.equal(e.task().status,'완료');assert.equal(e.task().progress,70);assert.equal(e.task().actualProgressDate,'2026-10-05');
});
check('같은 상태를 다른 화면에서 바꿨으면 저장을 거절하고 초안을 유지',()=>{
 const e=editor();e.open();e.remote({status:'진행중',progress:70});e.change('상태','완료');e.save();
 assert.equal(e.writes(),0);assert.equal(e.task().status,'진행중');assert.equal(e.read('상태'),'완료');assert.match(e.message(),/변경|충돌/);
});
check('서로 다른 기간 변경을 합친 결과가 역전되면 저장을 거절',()=>{
 const e=editor();e.open();e.remote({endDate:'2026-10-07'});e.change('시작일','2026-10-08');e.save();
 assert.equal(e.writes(),0);assert.equal(e.task().endDate,'2026-10-07');assert.equal(e.read('시작일'),'2026-10-08');assert.match(e.message(),/시작|종료|기간/);
});
check('충돌 재적용은 로컬 메모만 적용하고 원격 승인 실적·상태·기간을 보존',()=>{
 const base=structuredClone(project),remote=structuredClone(base),local=structuredClone(base);
 Object.assign(remote.postDeliveryTasks[0],{progress:70,actualProgressDate:'2026-10-05',status:'진행중',endDate:'2026-10-12'});local.postDeliveryTasks[0].memo='충돌 후 로컬 메모';
 const result=rebaseProject(remote,base,local).postDeliveryTasks[0];
 assert.equal(result.memo,'충돌 후 로컬 메모');assert.equal(result.progress,70);assert.equal(result.actualProgressDate,'2026-10-05');assert.equal(result.status,'진행중');assert.equal(result.endDate,'2026-10-12');
 assert.equal(remote.postDeliveryTasks[0].memo,'원본 메모');assert.equal(local.postDeliveryTasks[0].progress,35);
});
check('충돌 재적용의 명시적 완료 변경도 실제 실적·승인일을 덮지 않음',()=>{
 const base=structuredClone(project),remote=structuredClone(base),local=structuredClone(base);
 Object.assign(remote.postDeliveryTasks[0],{progress:70,actualProgressDate:'2026-10-05',status:'진행중'});Object.assign(local.postDeliveryTasks[0],{status:'완료',progress:100,actualProgressDate:'2026-10-06'});
 const result=rebaseProject(remote,base,local).postDeliveryTasks[0];
 assert.equal(result.status,'완료');assert.equal(result.progress,70);assert.equal(result.actualProgressDate,'2026-10-05');
});
check('충돌 재적용에서 원격 삭제된 기존 일정은 부활시키지 않고 원본을 유지',()=>{
 const base=structuredClone(project),remote={...structuredClone(base),postDeliveryTasks:[]},local=structuredClone(base);local.postDeliveryTasks[0].memo='삭제된 일정의 초안';
 assert.throws(()=>rebaseProject(remote,base,local),/삭제|충돌/);assert.equal(remote.postDeliveryTasks.length,0);assert.equal(local.postDeliveryTasks[0].memo,'삭제된 일정의 초안');
});
check('충돌 재적용의 담당자 변경은 최신 실적과 다른 관리 필드를 보존',()=>{
 const base=structuredClone(project),remote=structuredClone(base),local=structuredClone(base);
 Object.assign(remote.postDeliveryTasks[0],{progress:70,actualProgressDate:'2026-10-05',memo:'원격 메모',reportingModes:{worker:'TASK'}});local.postDeliveryTasks[0].personIds=['new-worker'];
 const result=rebaseProject(remote,base,local).postDeliveryTasks[0];
 assert.deepEqual(result.personIds,['new-worker']);assert.equal(result.progress,70);assert.equal(result.actualProgressDate,'2026-10-05');assert.equal(result.memo,'원격 메모');assert.equal(result.reportingModes.worker,'TASK');
});
check('충돌 재적용은 사용자가 새로 추가한 일정과 다른 원격 신규 일정을 함께 보존',()=>{
 const base=structuredClone(project),remote=structuredClone(base),local=structuredClone(base);
 remote.postDeliveryTasks.push({...structuredClone(task),id:'remote-new',memo:'원격 신규'});local.postDeliveryTasks.push({...structuredClone(task),id:'local-new',memo:'로컬 신규'});
 const result=rebaseProject(remote,base,local).postDeliveryTasks;
 assert.deepEqual(result.map(t=>t.id).sort(),['follow-qa','local-new','remote-new']);assert.equal(result.find(t=>t.id==='local-new').memo,'로컬 신규');
});

const vnA={id:'vn-follow-a',name:'NGUYỄN CÙNG TÊN',company:'VIETQS',department:'마감팀',position:'팀장',active:true,vietTeamId:'vt_in1'};
const vnB={...vnA,id:'vn-follow-b',position:'프로'},vnUngrouped={...vnA,id:'vn-follow-ungrouped',vietTeamId:undefined};
const krWorker={id:'worker',name:'기존 한국 직원',company:'컨코스트',department:'마감팀',position:'선임',active:true};
const inactiveVn={...vnA,id:'vn-follow-inactive',active:false},inactiveKr={...krWorker,id:'kr-follow-inactive',active:false};
const crossVn={...vnA,id:'vn-follow-structure',department:'구조팀',vietTeamId:'vt_horiz_general'};
const followDirectory=[krWorker,vnA,vnB,vnUngrouped,inactiveVn,inactiveKr,crossVn];
check('VN 후속 개인 배정: 활성 동일부서 개인 선택·저장 후 할 일/업무일지 연결 및 원실적 보존',()=>{
 const e=editor({users:followDirectory});e.open();const choices=e.candidates();
 for(const id of [vnA.id,vnB.id,vnUngrouped.id])assert.ok(choices.includes(id),`VN 개인 후보 누락: ${id}`);
 for(const id of [inactiveVn.id,inactiveKr.id,crossVn.id])assert.ok(!choices.includes(id),`신규 후보 경계 위반: ${id}`);
 e.change('담당자',vnUngrouped.id);e.save();assert.equal(e.writes(),1);assert.deepEqual([...e.task().personIds],['worker',vnUngrouped.id]);
 for(const key of ['id','memo','startDate','endDate','status','progress','actualProgressDate'])assert.equal(e.task()[key],task[key]);assert.equal(e.project().progress,project.progress);
 const todo=personalWork.assignedItems(vnUngrouped.id,'2026-10-06',[e.project()]),log=personalWork.reconcileWorkLogItems([],vnUngrouped.id,'2026-10-06',[e.project()]);
 assert.equal(todo.length,1);assert.equal(log.length,1);assert.equal(todo[0].id,`gen-${project.id}-followup-${task.id}`);assert.equal(log[0].id,todo[0].id);assert.equal(log[0].todayTask,task.memo);assert.equal(log[0].progress,task.progress);
 assert.equal(personalWork.assignedTasks(crossVn.id,[e.project()]).length,0);
});
check('VN 후속 팀 전체: 개인 ID snapshot 중복제거·기존 비활성 이력·승인실적·팀 변경 후 배정 보존',()=>{
 const seed=structuredClone(project);seed.postDeliveryTasks[0].personIds=['worker',inactiveVn.id,vnA.id];const e=editor({users:followDirectory,project:seed});e.open();
 assert.ok(e.candidates().includes('team:vt_in1'),'현재 VN 팀 전체 후보 누락');e.change('담당자','team:vt_in1');e.change('담당자','team:vt_in1');
 e.directory.find(person=>person.id===vnB.id).vietTeamId='vt_in2';e.remote({progress:70,actualProgressDate:'2026-10-05',status:'진행중'});e.save();
 assert.equal(e.writes(),1);assert.deepEqual([...e.task().personIds],['worker',inactiveVn.id,vnA.id,vnB.id]);assert.ok(!e.task().personIds.some(id=>id.startsWith('team:')||id==='vt_in1'));assert.equal(e.task().progress,70);assert.equal(e.task().status,'진행중');assert.equal(e.task().actualProgressDate,'2026-10-05');
 for(const id of [vnA.id,vnB.id]){const todo=personalWork.assignedItems(id,'2026-10-06',[e.project()]);assert.equal(todo.length,1);assert.equal(todo[0].id,`gen-${project.id}-followup-${task.id}`);}
 assert.equal(personalWork.assignedTasks(vnUngrouped.id,[e.project()]).length,0);assert.equal(personalWork.assignedTasks(krWorker.id,[e.project()]).length,1);
});
check('VN 후속 구조 그룹: 동명이인 Xuan 소속별 팀/개인 선택 및 무권한·위조 후보 저장 차단',()=>{
 const xuan={...vnA,id:'vn-xuan-male',name:'XUÂN',department:'구조팀',vietTeamId:'vt_vert_apartment'},thanhxuan={...xuan,id:'vn-xuan-female',vietTeamId:'vt_vert_general'};
 const seed={...structuredClone(project),department:'구조팀'},manager={id:'structure-chief',department:'구조팀',position:'실장'},people=[xuan,thanhxuan,inactiveVn];
 const e=editor({project:seed,users:people,user:manager});e.open();assert.ok(e.candidates().includes('team:vt_vert_apartment'),'구조 아파트 팀 후보 누락');assert.ok(e.candidates().includes('team:vt_vert_general'),'구조 일반 팀 후보 누락');assert.ok(!e.candidates().includes('team:vt_in1'));
 for(const id of ['unknown-person','team:vt_in1',inactiveVn.id])e.change('담당자',id);
 e.change('담당자','team:vt_vert_apartment');e.save();assert.deepEqual([...e.task().personIds],['worker',xuan.id]);assert.equal(personalWork.assignedTasks(thanhxuan.id,[e.project()]).length,0);
 e.open();e.change('담당자',thanhxuan.id);e.save();assert.deepEqual([...e.task().personIds],['worker',xuan.id,thanhxuan.id]);assert.equal(personalWork.assignedTasks(thanhxuan.id,[e.project()]).length,1);
 for(const actor of [{...manager,department:'마감팀'},{...manager,position:'프로'}]){const readonly=editor({project:seed,users:people,user:actor});assert.ok(!readonly.all().some(node=>node.type==='select'));assert.equal(readonly.writes(),0);}
});

const projectSourcePath=process.argv.find(arg=>arg.startsWith('--project-source='))?.slice('--project-source='.length)||fileURLToPath(new URL('../src/components/ProjectModal.tsx',import.meta.url)),projectSource=readFileSync(projectSourcePath,'utf8'),projectCompiled=ts.transpileModule(projectSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const pmHelperSource=ts.createSourceFile('pendingAssignment.ts',readFileSync(new URL('../src/utils/pendingAssignment.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const pmHelperDeclaration=pmHelperSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='projectPMId');
assert.ok(pmHelperDeclaration,'실제 PM 표시 helper가 있어야 합니다.');
const pmHelper={};runInNewContext(ts.transpileModule(pmHelperDeclaration.getText(pmHelperSource),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:pmHelper});
const legacyTrade=(role,start='2026-10-10',end='2026-10-05')=>({roleName:role,personId:'worker',personIds:['worker'],startDate:start,endDate:end,status:'진행중',memo:'옛 원문 '+role,progress:70,actualProgressDate:'2026-10-02',version:'v1'});
const legacyProject=()=>({...structuredClone(project),status:'진행중',endDate:'2026-10-05',postDeliveryTasks:[],subTasks:{PM:legacyTrade('PM','2026-09-01'),가설:legacyTrade('가설'),내역:legacyTrade('내역','2026-10-12')},roles:{}});
function projectEditor(seed=legacyProject()){
 let state={projects:[structuredClone(seed)],personnel:[]},writes=0,cursor=0,tree,dirty=false,queued=[];const hooks=[];
 state.updateProjectSubTasks=(id,tasks)=>{writes++;state.projects=state.projects.map(p=>p.id===id?{...p,subTasks:tasks}:p);dirty=true;};
 const useProjectStore=selector=>selector?selector(state):state;useProjectStore.getState=()=>state;
 const people=[{id:'manager',name:'合成 실장',company:'컨코스트',department:'마감팀',position:'실장',active:true},{id:'worker',name:'合成 직원',company:'컨코스트',department:'마감팀',position:'프로',active:true}];
 const useAuthStore=selector=>selector?selector({currentUser:people[0],users:people}):{currentUser:people[0],users:people};
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(next!==hooks[index]){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]??=( {current:initial} );};
 const useEffect=(fn,deps)=>{const index=cursor++;if(!hooks[index]||deps.some((value,i)=>value!==hooks[index][i]))queued.push(fn);hooks[index]=deps;};
 const exports={};runInNewContext(projectCompiled,{exports,crypto,console,setTimeout:()=>0,require:path=>{
  if(path==='react')return {useState,useRef,useEffect};if(path==='react/jsx-runtime')return jsx;
  if(path==='lucide-react')return require(path);if(path==='../store/useProjectStore')return {useProjectStore,TEAM_ROLES:{마감팀:['PM','가설','내역','창호']}};
  if(path==='../store/useAuthStore')return {useAuthStore};if(path==='../store/usePersonalStore')return {usePersonalStore:selector=>selector({leaves:[]})};
  if(path==='../utils/schedulePermissions')return {canManageSchedule:()=>true};if(path==='../utils/scheduleProgress')return scheduleProgress;
  if(path==='../utils/pendingAssignment')return pmHelper;
  if(path==='../utils/projectScheduleDates')return projectScheduleDates;
  if(path==='../utils/personalWork')return personalWork;if(path==='../utils/scheduleAllocations')return {withAllocationBounds,updateAssignmentMembers};if(path==='../utils/rebaseProject')return {rebaseProject};if(path==='../utils/vietPersonnel')return vietPersonnel;
  if(path==='../data/vietTeams')return {VIET_TEAMS_DATA:[]};if(path==='./ProjectDetailPrint')return {ProjectDetailPrint:()=>null};if(path==='./PostDeliverySchedule')return {PostDeliverySchedule:()=>null};throw Error('Unexpected dependency '+path);
 }},{filename:projectSourcePath});
 const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
 const render=(effects=true)=>{let iterations=0;do{dirty=false;cursor=0;queued=[];tree=exports.default({projectId:seed.id,onClose:()=>{}});if(effects)queued.forEach(fn=>fn());else break;assert.ok(++iterations<12,'Actual component effects must settle');}while(dirty);};
 const control=(role,field)=>{const card=nodes(tree).find(node=>node.type==='div'&&node.props.onClick&&nodes(node).some(child=>child.type==='h4'&&child.props.children===role));assert.ok(card,'Missing role '+role);const fields=nodes(card).filter(node=>node.type==='input'&&node.props.type==='date');if(field==='memo')return nodes(card).find(node=>node.type==='input'&&node.props.type==='text');return fields[field==='startDate'?0:1];};
 render();return {change:(role,field,value,effects=true)=>{const node=control(role,field);assert.ok(node,'Missing '+role+' '+field);node.props.onChange({target:{value}});render(effects);},save:()=>{nodes(tree).find(node=>node.type==='button'&&node.props.onClick?.name==='handleSaveAll').props.onClick();render();},remote:change=>{state.projects=[change(structuredClone(state.projects[0]))];render();},project:()=>state.projects[0],writes:()=>writes,draft:(role,field)=>control(role,field)?.props.value};
}
check('프로젝트 원기간: 정상 PM기간과 메모는 자동/명시 저장하며 옛 invalid 원문/승인 실적 보존',()=>{
 const seed=legacyProject(),old=JSON.stringify(seed.subTasks.가설),e=projectEditor(seed);e.change('PM','endDate','2026-10-06');assert.equal(e.writes(),1);e.save();assert.equal(e.writes(),2);e.change('가설','memo','사용자의 새 메모');assert.equal(e.writes(),3);assert.equal(e.project().subTasks.PM.endDate,'2026-10-06');assert.equal(JSON.stringify({...e.project().subTasks.가설,memo:seed.subTasks.가설.memo}),old);assert.equal(e.project().progress,55);
});
check('프로젝트 원기간: roles-only 옛 invalid를 materialize하는 메모는 effective 기간 그대로 저장',()=>{
 const seed=legacyProject();seed.roles.가설={...seed.subTasks.가설};delete seed.subTasks.가설;const e=projectEditor(seed);e.change('가설','memo','새 메모');assert.equal(e.writes(),1);assert.equal(e.project().subTasks.가설.startDate,'2026-10-10');assert.equal(e.project().subTasks.가설.endDate,'2026-10-05');
});
check('프로젝트 원기간: 새 공종과 변경된 invalid 기간은 자동/명시 저장을 거부',()=>{
 const e=projectEditor();e.change('가설','endDate','2026-10-04');e.save();assert.equal(e.writes(),0);assert.equal(e.draft('가설','endDate'),'2026-10-04');const seed=legacyProject();seed.startDate='2026-10-10';const next=projectEditor(seed);next.change('창호','memo','새 공종 메모');next.save();assert.equal(next.writes(),0);assert.equal(next.project().subTasks.창호,undefined);
});
check('프로젝트 원기간: old invalid 유효 날짜로의 명시 교정은 저장',()=>{
 const e=projectEditor();e.change('가설','startDate','2026-10-01');e.save();assert.equal(e.writes(),2);assert.equal(e.project().subTasks.가설.startDate,'2026-10-01');assert.equal(e.project().subTasks.가설.progress,70);assert.equal(e.project().subTasks.내역.startDate,'2026-10-12');
});
check('프로젝트 원기간: blank fallback 원의미 보존·변경된 invalid 의미 거부·유효 교정 허용',()=>{
 const seed=legacyProject();seed.subTasks.가설.endDate='';const e=projectEditor(seed);e.change('PM','memo','PM 새 메모');assert.equal(e.writes(),1);assert.equal(e.project().subTasks.가설.endDate,'');e.change('가설','endDate','2026-10-04');e.save();assert.equal(e.writes(),1);const corrected=projectEditor();corrected.change('가설','startDate','');assert.equal(corrected.writes(),1);assert.equal(corrected.project().subTasks.가설.startDate,'');
});
check('프로젝트 원기간: 원격 최신 유효기간과 기본기간은 로컬 메모 저장시 보존',()=>{
 const e=projectEditor();e.change('가설','memo','대기 로컬 메모',false);e.remote(p=>{p.endDate='2026-10-08';p.subTasks.가설.startDate='2026-10-01';p.subTasks.가설.endDate='';return p;});assert.equal(e.project().endDate,'2026-10-08');assert.equal(e.project().subTasks.가설.startDate,'2026-10-01');assert.equal(e.project().subTasks.가설.endDate,'');assert.equal(e.project().subTasks.가설.memo,'대기 로컬 메모');assert.equal(e.writes(),1);
});
check('프로젝트 원기간: 원격 같은날짜 충돌과 공종 삭제는 대기 초안만 유지·부활 없음',()=>{
 const conflict=projectEditor();conflict.change('가설','startDate','2026-10-09',false);conflict.remote(p=>{p.subTasks.가설.startDate='2026-10-01';return p;});conflict.save();assert.equal(conflict.writes(),0);assert.equal(conflict.project().subTasks.가설.startDate,'2026-10-01');assert.equal(conflict.draft('가설','startDate'),'2026-10-09');const removed=projectEditor();removed.change('가설','memo','삭제 대기 메모',false);removed.remote(p=>{delete p.subTasks.가설;delete p.roles.가설;return p;});removed.save();assert.equal(removed.writes(),0);assert.equal(removed.project().subTasks.가설,undefined);
});
check('프로젝트 원기간: allocations/완전공백 미확정과 빈담당/새 invalid구간의 서버 경계 일치',()=>{
 for(const allocation of [{id:'new',personIds:[],startDate:'2026-10-01',endDate:'2026-10-03'},{id:'new',personIds:['worker'],startDate:'2026-10-10',endDate:'2026-10-05'}]){const seed=legacyProject();seed.subTasks.가설.allocations=[allocation];const e=projectEditor(seed);e.change('PM','memo','PM 메모');e.save();assert.equal(e.writes(),0);}
 for(const allocations of [[],[{id:'current',personIds:['worker'],startDate:'2026-10-01',endDate:'2026-10-03'}]]){const seed=legacyProject();delete seed.subTasks.내역;seed.subTasks.가설.allocations=allocations;const e=projectEditor(seed);e.change('PM','memo','PM 메모');assert.equal(e.writes(),1);assert.equal(JSON.stringify(e.project().subTasks.가설.allocations),JSON.stringify(allocations));}
 const undated={...legacyProject(),startDate:'',endDate:'',subTasks:{},roles:{}},blank=projectEditor(undated);blank.change('PM','memo','미확정 원문');assert.equal(blank.writes(),1);assert.equal(blank.project().subTasks.PM.startDate,'');assert.equal(blank.project().subTasks.PM.endDate,'');const partial=projectEditor(undated);partial.change('PM','endDate','2026-10-05');partial.save();assert.equal(partial.writes(),0);
});

const output=resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'test-results/followup-draft.json');mkdirSync(dirname(output),{recursive:true});
const report={sourcePath,sourceSha256:hash(source),rebaseSourcePath,rebaseSourceSha256:hash(readFileSync(rebaseSourcePath)),projectSourcePath,projectSourceSha256:hash(projectSource),testSha256:hash(readFileSync(fileURLToPath(import.meta.url))),validation:'Real component handlers/hooks/effects with isolated React state/store and actual rebaseProject, dates/allocations helpers; not a browser or production test.',passed:results.filter(row=>row.status==='PASS').length,total:results.length,results};
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
