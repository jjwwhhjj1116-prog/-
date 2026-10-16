import assert from 'node:assert/strict';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {runDailyHarness} from './notification-context.mjs';

const require=createRequire(import.meta.url),jsx=require('react/jsx-runtime'),before=process.argv.includes('--before'),results=[];
const original='../../private-provisioning/original-before-worklog-read-20261006/scheduler-web/';
const source=path=>readFileSync(new URL((before?original:'../')+path,import.meta.url),'utf8');
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
const realFetch=globalThis.fetch;
const server=await createServer({plugins:before?[{name:'protected-before-worklog-read',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/store/useWorkLogStore.ts'))return source('src/store/useWorkLogStore.ts');}}]:[],server:{middlewareMode:true,hmr:false},appType:'custom'});
const actor=id=>({id,name:'합성 '+id,company:'컨코스트',department:'마감팀',position:'실장',active:true});
const journal=(id='qa/read',revision=9)=>({id,userId:'author',date:'2026-10-06',department:'마감팀',items:[],overallNotes:'보존할 원문',approvalStatus:'SUBMITTED_LEADER',serverRevision:revision});
function delayed(status=200,body={ok:true}){let release;const calls=[];globalThis.fetch=(url,options)=>{calls.push({url:String(url),method:options.method,body:options.body});return new Promise(resolve=>{release=()=>resolve(Response.json(body,{status}));});};return {calls,release:()=>{assert.ok(release,'요청이 실제로 시작되어야 함');release();}};}
async function check(name,fn){try{const observed=await fn();results.push({name,status:'PASS',observed});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
const drain=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts'),{useWorkLogStore:logs}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts'),{usePersonalStore:personal,refreshPersonal}=await server.ssrLoadModule('/src/store/usePersonalStore.ts'),{studioApi}=await server.ssrLoadModule('/src/services/studioApi.ts');
 const permissions=await server.ssrLoadModule('/src/utils/schedulePermissions.ts'),pendingAssignment=await server.ssrLoadModule('/src/utils/pendingAssignment.ts');
 const reset=()=>{auth.setState({currentUser:actor('reader')});logs.setState({workLogs:[journal()],selectedWorkLogId:'qa/read'});personal.setState({loaded:true,leaves:[],checks:[],openWorkLogId:null});};
 const read=(id,revision)=>{assert.equal(typeof logs.getState().readWorkLog,'function','별도 열람 helper가 존재해야 함');return logs.getState().readWorkLog(id,revision);};
 await check('실제 helper: 화면 revision만 POST하고 최신 메모리·본문·선택값은 그대로',async()=>{
  reset();const preserved=logs.getState(),calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),method:options.method,body:JSON.parse(options.body)});return Response.json({ok:true,log:{...journal(),overallNotes:'반영하면 안 되는 응답',serverRevision:99}});};
  assert.equal(await read('qa/read',3),true);assert.deepEqual(calls,[{url:'/api/collaboration/worklogs/qa%2Fread/read',method:'POST',body:{revision:3}}]);assert.strictEqual(logs.getState(),preserved);return calls;
 });
 await check('실제 helper: 비로그인·없는 ID·없는 revision은 요청하지 않음',async()=>{
  reset();let count=0;globalThis.fetch=async()=>{count++;return Response.json({ok:true});};auth.setState({currentUser:null});assert.equal(await read('qa/read',3),false);auth.setState({currentUser:actor('reader')});for(const [id,rev] of [['',3],['qa/read',0],['qa/read',undefined],['qa/read',1.5]])assert.equal(await read(id,rev),false);assert.equal(count,0);
 });
 await check('실제 helper: 다른 계정·동일 ID 재로그인·로그아웃 지연 성공은 새 화면에 ack하지 않음',async()=>{
  for(const next of [actor('other'),actor('reader'),null]){reset();const pending=delayed(),request=read('qa/read',3);auth.setState({currentUser:next});const preserved=logs.getState();pending.release();assert.equal(await request,false);assert.strictEqual(logs.getState(),preserved);assert.equal(pending.calls.length,1);}
 });
 await check('실제 helper: 이전 계정 오류는 무시하고 현재 계정 충돌은 별도 전달',async()=>{
  reset();const pending=delayed(409,{error:'합성 열람 충돌'}),request=read('qa/read',3);auth.setState({currentUser:actor('other')});pending.release();assert.equal(await request,false);
  reset();const preserved=logs.getState();globalThis.fetch=async()=>Response.json({error:'합성 열람 충돌'},{status:409});await assert.rejects(read('qa/read',3),/합성 열람 충돌/);assert.strictEqual(logs.getState(),preserved);globalThis.fetch=async()=>Response.json({ok:false});assert.equal(await read('qa/read',3),false);
 });
 await check('실제 Studio handler: 일반 알림 읽음과 본문 열기는 분리·GET 중 계정 전환 후 이동/metadata/오류 없음',async()=>{
  const compiled=ts.transpileModule(source('src/components/StudioCollaboration.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const screen=()=>{
   let cursor=0,tree,opened=0;const values=[],notice={id:'qa-alert',meeting_id:'worklog:qa/read',message:'합성 일지 상신',created_at:'2026-10-06',read_at:null};
   const useState=initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value];};
   const studio=Object.assign(()=>({ready:false,status:'합성',pending:0,conflict:null,notifications:[notice],unreadCount:1}),{setState:()=>{throw Error('예상 밖 회의 이동');}});
   const modules={'react':{useState,useEffect(){}},'react/jsx-runtime':jsx,'../services/studioApi':{studioApi},'../store/useStudioStore':{useStudioStore:studio,refreshStudioMeetings:async()=>{},publishLocalTeam:async()=>{},resolveScheduleConflict:async()=>{}},'../store/usePersonalStore':{usePersonalStore:personal,refreshPersonal},'../store/useAuthStore':{useAuthStore:Object.assign(selector=>selector(auth.getState()),{getState:auth.getState})},'../store/useProjectStore':{useProjectStore:selector=>selector({projects:[]})},'../utils/schedulePermissions':permissions,'../utils/pendingAssignment':pendingAssignment};
   modules['lucide-react']=require('lucide-react');
   const exports={};runInNewContext(compiled,{exports,console,require:id=>{assert.ok(id in modules,'Unexpected Studio dependency '+id);return modules[id];}});
   const render=()=>{cursor=0;tree=exports.StudioCollaboration({onOpenMeeting:()=>{throw Error('회의 이동 금지');},onOpenWorkLog:()=>opened++});return tree;};
   render();nodes(tree).find(n=>n.type==='button'&&n.props['aria-expanded']===false).props.onClick();render();
   return {click:()=>nodes(tree).find(n=>n.type==='button'&&n.props.className==='text-left').props.onClick(),inboxRead:()=>nodes(tree).find(n=>n.type==='button'&&n.props.children==='알림 읽음').props.onClick(),opened:()=>opened,error:()=>{render();return nodes(tree).filter(n=>n.props.role==='alert').map(n=>n.props.children).join(' ');}};
  };
  reset();const normal=screen(),calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return Response.json({ok:true,leaves:[],checks:[],worklogs:[journal()]});};normal.inboxRead();await drain();assert.deepEqual(calls,['/api/collaboration/notifications/read']);assert.equal(normal.opened(),0);assert.equal(personal.getState().openWorkLogId,null);normal.click();await drain();assert.equal(normal.opened(),1);assert.equal(personal.getState().openWorkLogId,'qa/read');
  for(const next of [actor('other'),actor('reader'),null])for(const status of [200,409]){reset();const s=screen(),pending=delayed(status,status===200?{leaves:[],checks:[],worklogs:[journal()]}:{error:'오래된 계정 조회 오류'});s.click();auth.setState({currentUser:next});personal.setState({openWorkLogId:null});pending.release();await drain();assert.equal(s.opened(),0);assert.equal(personal.getState().openWorkLogId,null);assert.ok(!s.error().includes('오래된 계정 조회 오류'));assert.equal(pending.calls.length,1);}
 });
}finally{await server.close();globalThis.fetch=realFetch;}

const component=await runDailyHarness(source('src/components/DailyWorkLogView.tsx'),async({screen,check,manager,author,originalLog})=>{
 await check('실제 Daily 효과: 표시된 상신본문만 기록·poll/reopen 중복 억제·다른 일지/new revision은 실제 본문 일치 후 기록',async()=>{
  const s=screen({worklog:originalLog.id,includeLog:true});s.settle();await s.flush();assert.equal(s.reads.length,1);assert.equal(s.reads[0].id,originalLog.id);assert.equal(s.reads[0].revision,3);assert.equal(s.reads[0].body,originalLog.overallNotes);assert.equal(s.reads[0].screen.date,originalLog.date);assert.deepEqual(s.readLogs(),[originalLog]);
  s.updateLogs({workLogs:[structuredClone(originalLog)]});s.settle();await s.flush();s.historyTab();s.openLog(originalLog);await s.flush();assert.equal(s.reads.length,1);
  const next={...structuredClone(originalLog),serverRevision:4,overallNotes:'갱신된 실제 본문'};s.updateLogs({workLogs:[next]});s.settle();await s.flush();assert.equal(s.reads.length,2);assert.equal(s.reads[1].revision,4);assert.equal(s.reads[1].body,next.overallNotes);
  const other={...next,id:'context-other',date:'2026-10-08',overallNotes:'다른 일지 원본문'};s.updateLogs({workLogs:[next,other]});s.historyTab();s.openLog(other);await s.flush();assert.equal(s.reads.length,3);assert.equal(s.reads[2].id,other.id);assert.equal(s.reads[2].body,other.overallNotes);assert.equal(s.reads[2].screen.date,other.date);return s.reads;
 });
 await check('실제 Daily 효과: 숨은 REPORT·HISTORY·DRAFT·미연결·연장·pending 알림의 이전본문은 읽음 전송 없음',async()=>{
  const hidden=screen({worklog:originalLog.id,includeLog:true,visible:false});hidden.settle();await hidden.flush();assert.equal(hidden.reads.length,0);hidden.historyTab();hidden.show(true);await hidden.flush();assert.equal(hidden.reads.length,0);hidden.openLog(originalLog);await hidden.flush();assert.equal(hidden.reads.length,1);
  const draft={...structuredClone(originalLog),approvalStatus:'DRAFT'};for(const s of [screen({worklog:draft.id,logs:[draft]}),screen({worklog:originalLog.id,includeLog:true,loaded:false}),screen({worklog:originalLog.id,includeLog:true,extension:'context-P1'}),screen()]){s.settle();await s.flush();assert.equal(s.reads.length,0);}
  const other={...originalLog,id:'context-new',date:'2026-10-08',overallNotes:'요청된 새 본문'},pending=screen({worklog:originalLog.id,logs:[originalLog,other],visible:false});pending.settle();pending.update({openWorkLogId:other.id});pending.show(true);await pending.flush();assert.deepEqual(pending.reads.map(read=>read.id),[other.id]);assert.equal(pending.reads[0].body,other.overallNotes);
  const self=screen({actor:author,worklog:originalLog.id,includeLog:true});self.settle();await self.flush();assert.equal(self.reads.length,1);assert.deepEqual(self.readLogs(),[originalLog]);
 });
 await check('실제 Daily 효과: 떠난 화면/다른 로그인/동일ID재로그인의 지연 오류는 notice에 섞이지 않음',async()=>{
  for(const target of ['history','other','same','hidden']){let reject;const s=screen({worklog:originalLog.id,includeLog:true,onRead:()=>new Promise((_,fail)=>reject=fail)});s.settle();assert.equal(s.reads.length,1);if(target==='history')s.historyTab();else if(target==='hidden')s.show(false);else{s.setActor({...manager,id:target==='same'?manager.id:'other-reader'});s.settle();}reject(Error('이전 화면의 열람 오류'));await s.flush();assert.ok(!s.notice().includes('이전 화면의 열람 오류'));}
  const s=screen({worklog:originalLog.id,includeLog:true,onRead:async()=>{throw Error('현재 열람 충돌');}});s.settle();await s.flush();assert.match(s.notice(),/본문은 표시되었으나 열람 기록/);assert.ok(!s.notice().includes('저장에 실패했습니다.'));assert.deepEqual(s.readLogs(),[originalLog]);
 });
});
results.push(...component.results);
const report={kind:'ACTUAL_READ_HELPER_STUDIO_HANDLER_FULL_DAILY_SYNTHETIC_EFFECTS',protectedOriginal:before,externalRequests:0,results,limits:component.limits};
if(process.argv[2]&&process.argv[2]!=='--before')writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
