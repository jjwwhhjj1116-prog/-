import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime');
const sourcePath=new URL('../src/components/DailyWorkLogView.tsx',import.meta.url);
const beforePath=new URL('../../private-provisioning/original-before-extension-context-20261006/scheduler-web/src/components/DailyWorkLogView.tsx',import.meta.url);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const equalDeps=(previous,next)=>previous&&next&&previous.length===next.length&&next.every((value,index)=>Object.is(value,previous[index]));
const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T03:00:00Z']));}};

// Execute the complete real component and its effect callbacks. Hooks/stores are isolated in memory.
// This models one committed render followed by its batched effects; it is not an App/browser test.
export async function runDailyHarness(sourceText=readFileSync(sourcePath,'utf8'),checks){
 const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
 const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
 const compiled=ts.transpileModule(sourceText,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,results=[];
 try{
  const work=await server.ssrLoadModule('/src/utils/personalWork.ts'),permissions=await server.ssrLoadModule('/src/utils/schedulePermissions.ts'),{TEAM_APPROVAL_LINES}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
  const manager={id:'u_12',name:'합성 PM',company:'컨코스트',department:'마감팀',position:'실장',active:true},author={id:'context-author',name:'합성 작성자',no:8801,company:'컨코스트',department:'마감팀',position:'프로',active:true};
  const p1={id:'context-P1',code:'QA-P1',name:'알림 대상 프로젝트',department:'마감팀',pmId:manager.id,startDate:'2026-10-06',endDate:'2026-10-08',roles:{},subTasks:{내부:{roleName:'내부',personId:String(author.no),personIds:[String(author.no)],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',progress:55,memo:'원 작성자의 업무',reportingMode:'TASK'}}};
  const p2={...structuredClone(p1),id:'context-P2',code:'QA-P2',name:'PM 본인 첫 배정 프로젝트',endDate:'2026-10-07',subTasks:{PM:{roleName:'PM',personId:manager.id,personIds:[manager.id],startDate:'2026-10-06',endDate:'2026-10-07',status:'진행중',memo:'PM의 오늘 업무',reportingMode:'TASK'}}};
  const ownTask='gen-context-P2-PM',authorTask='gen-context-P1-내부';
  const authorItem={...work.assignedTasks(author.id,[p1],work.assignmentAliases(author,[author,manager]))[0],todayTask:'알림의 원 작성자 수행 본문',progress:55,manualFields:['todayTask','progress']};
  const originalLog={id:'context-worklog',userId:author.id,userName:author.name,department:'마감팀',date:'2026-10-07',items:[authorItem],overallNotes:'원 작성자의 종합 본문',approvalStatus:'SUBMITTED_LEADER',serverRevision:3,leaderReview:{approved:false},chiefApproval:{approved:false}};
  function screen({loaded=true,extension=null,worklog=null,includeLog=false,actor=manager,logs,visible=true,onRead=async()=>true}={}){
   const auth={currentUser:actor,users:[manager,author]},projectState={projects:[p2,p1]},logState={workLogs:logs|| (includeLog?[structuredClone(originalLog)]:[]),selectedWorkLogId:null},personal={leaves:[],loaded,openDate:null,openExtension:extension,openWorkLogId:worklog},props={visible};
   const hooks=[],trace=[],effects=[],reads=[];let cursor=0,dirty=false,tree,currentEffects=[];
   const memo=(factory,deps)=>{const index=cursor++,previous=hooks[index];if(!previous||!equalDeps(previous.deps,deps))hooks[index]={kind:'memo',value:factory(),deps};return hooks[index].value;};
   const useState=initial=>{const index=cursor++;if(!hooks[index]){const slot={kind:'state',value:typeof initial==='function'?initial():initial};slot.setter=value=>{const next=typeof value==='function'?value(slot.value):value;if(!Object.is(next,slot.value)){slot.value=next;dirty=true;}};hooks[index]=slot;}return [hooks[index].value,hooks[index].setter];};
   const useRef=initial=>{const index=cursor++;if(!hooks[index])hooks[index]={kind:'ref',value:{current:initial}};return hooks[index].value;};
   const useEffect=(fn,deps)=>{const index=cursor++,previous=hooks[index];if(!previous||!equalDeps(previous.deps,deps)){hooks[index]={kind:'effect',deps,cleanup:previous?.cleanup};currentEffects.push({index,fn});}};
   const makeStore=state=>{const hook=selector=>typeof selector==='function'?selector(state):state;hook.getState=()=>state;hook.setState=patch=>{Object.assign(state,typeof patch==='function'?patch(state):patch);dirty=true;};return hook;};
   const authHook=makeStore(auth),projectHook=makeStore(projectState),logHook=makeStore(logState),personalHook=makeStore(personal);
   logState.setSelectedWorkLogId=id=>{if(logState.selectedWorkLogId!==id){logState.selectedWorkLogId=id;dirty=true;}};
   logState.generateItemsFromSchedule=(id,date,projects)=>work.assignedItems(id,date,projects,work.assignmentAliases({id},auth.users));
   for(const name of ['saveWorkLog','submitApprovalToLeader','approveFinalByChief'])logState[name]=async()=>{throw Error('Unexpected write in notification harness');};
   logState.readWorkLog=(id,revision)=>{reads.push({id,revision,actor:auth.currentUser.id,screen:snapshot(),body:note()?.value});return onRead(id,revision);};
   const extensionComponent=()=>null,reporting={ScheduleExtensionRequests:extensionComponent};for(const name of ['WorkLogHistory','TaskReportFields','WorkLogProjectSummary','DailyPlanFields','WorkLogTaskInfo','WorkLogSteps'])reporting[name]=()=>null;
   const mockReact={...React,useState,useRef,useEffect,useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps)};
   const values={'react':mockReact,'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../services/translationService':{translatedAlert:async()=>{}},'./RetainedRecords':{LegacyWorkLogArchive:()=>null},'../store/usePersonalStore':{usePersonalStore:personalHook},'../utils/personalWork':work,'./WorkLogReporting':reporting,'../utils/schedulePermissions':permissions,'../store/useAuthStore':{useAuthStore:authHook},'../store/useProjectStore':{useProjectStore:projectHook},'../store/useWorkLogStore':{useWorkLogStore:logHook,TEAM_APPROVAL_LINES}};
   const exports={};runInNewContext(compiled,{exports,Date:FixedDate,structuredClone,console,require:path=>{assert.ok(path in values,'Unexpected context dependency '+path);return values[path];}});
   const control=label=>nodes(tree).find(node=>node.type==='select'&&node.props['aria-label']===label);
   const snapshot=()=>{const extensionNode=nodes(tree).find(node=>node.type===extensionComponent),taskSelect=control('보고 작업');return {project:control('보고 프로젝트')?.props.value,role:control('보고 역할')?.props.value,task:taskSelect?.props.value,date:nodes(tree).find(node=>node.type==='input'&&node.props['aria-label']==='보고 날짜')?.props.value,extension:extensionNode?{project:extensionNode.props.projectId,task:extensionNode.props.selectedTaskId}:null,log:logState.selectedWorkLogId};};
   const note=()=>nodes(tree).find(node=>node.type==='textarea'&&node.props['aria-label']==='종합 보고 및 특이사항')?.props;
   const settle=()=>{for(let cycle=0;cycle<30;cycle++){dirty=false;cursor=0;currentEffects=[];tree=exports.DailyWorkLogView(props);trace.push(snapshot());for(const effect of currentEffects){effects.push(effect.index);hooks[effect.index].cleanup?.();hooks[effect.index].cleanup=effect.fn();}if(!dirty)return snapshot();}throw Error('Notification effects did not settle');};
   const tab=label=>{const tab=nodes(tree).find(node=>node.type==='button'&&node.props.role==='tab'&&Array.isArray(node.props.children)&&node.props.children.includes(label));assert.ok(tab);tab.props.onClick();settle();};
   return {settle,snapshot,trace,effects,reads,update:patch=>personalHook.setState(patch),updateLogs:patch=>logHook.setState(patch),setActor:actor=>authHook.setState({currentUser:actor}),show:visible=>{props.visible=visible;settle();},flush:async()=>{await Promise.resolve();await Promise.resolve();return settle();},readLogs:()=>structuredClone(logState.workLogs),note,notice:()=>nodes(tree).filter(node=>node.props.role==='status').map(node=>node.props.children).join(' '),openLog:log=>{const history=nodes(tree).find(node=>node.type===reporting.WorkLogHistory);assert.ok(history);history.props.onOpen(log);settle();},editNote:value=>{const box=note();assert.ok(box);box.onChange({target:{value}});settle();},reportTab:()=>tab('업무보고'),historyTab:()=>tab('업무일지 이력')};
  }
  async function check(name,fn){let observed;try{observed=await fn();results.push({name,status:'PASS',observed});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message,observed:error.observed});console.error('FAIL',name,error.message);}}
  const target=(s)=>{const observed=s.settle();try{assert.equal(observed.project,p1.id);assert.equal(observed.extension?.project,p1.id);assert.equal(observed.extension?.task,'');assert.equal(observed.role,'');}catch(error){error.observed={settled:observed,trace:s.trace};throw error;}return observed;};
  if(checks)await checks({screen,check,manager,author,originalLog,ownTask,authorTask});else{
  await check('기본 대조: 알림 없이 최초 진입하면 본인 첫 배정과 Task 자동 선택 유지',()=>{const s=screen(),observed=s.settle();assert.equal(observed.project,p2.id);assert.equal(observed.task,ownTask);return observed;});
  await check('연장 알림: 동시/기존 mount 모두 다른 프로젝트 Task/역할 해제',()=>{const fresh=target(screen({extension:p1.id})),s=screen();s.settle();s.editNote('기존 미저장 본문');s.update({openExtension:p1.id});const mounted=target(s);s.reportTab();assert.equal(s.note().value,'기존 미저장 본문');return {fresh,mounted};});
  await check('업무일지 알림과 최초 mount: 원 작성자 Task·날짜·상신 본문/권한 유지',()=>{const s=screen({worklog:originalLog.id,includeLog:true}),observed=s.settle();try{assert.equal(observed.project,p1.id);assert.equal(observed.task,authorTask);assert.equal(observed.date,originalLog.date);assert.equal(observed.log,originalLog.id);assert.equal(s.note().value,originalLog.overallNotes);assert.equal(s.note().disabled,true);assert.deepEqual(s.readLogs(),[originalLog]);}catch(error){error.observed={settled:observed,trace:s.trace};throw error;}return observed;});
  }
  return {kind:'ACTUAL_DAILY_MODULE_SYNTHETIC_HOOK_EFFECT_HARNESS',externalRequests:0,productWrites:0,results,limits:['실제 App/브라우저 effect scheduling과 구분한다. root의 별도 실제 UI 증거와 대조해야 한다.','React hook/스토어 입력은 합성이며 실제 컴포넌트 소스와 effect callback을 실행한다.']};
 }finally{await server.close();}
}
export const runNotificationChecks=sourceText=>runDailyHarness(sourceText);

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const before=process.argv.includes('--before'),result=await runNotificationChecks(readFileSync(before?beforePath:sourcePath,'utf8'));
 if(process.argv[2]&&process.argv[2]!=='--before')writeFileSync(process.argv[2],JSON.stringify({...result,protectedOriginal:before},null,2)+'\n');
 if(result.results.some(result=>result.status==='FAIL'))process.exitCode=1;
}
