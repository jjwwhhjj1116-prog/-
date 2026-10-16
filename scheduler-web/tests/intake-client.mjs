import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {canManageSchedule} from '../src/utils/schedulePermissions.ts';
import {newProjectFromIntake} from '../src/utils/intakeRegistration.ts';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const pendingAssignment=await server.ssrLoadModule('/src/utils/pendingAssignment.ts');
const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
const source=readFileSync(process.argv.find(arg=>arg.startsWith('--source='))?.slice('--source='.length)||new URL('../src/components/IntakeListView.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
assert.ok(compiled.includes('const t = {'));
const instrumented=compiled.replace('const t = {','captureRegister(handleRegisterToSchedule); const t = {');
const intake={id:'intake_850001',no:850001,code:'TK-2026998',name:'합성 다부서 수주',rawTitle:'합성 원 제목',client:'합성 발주처',author:'합성 작성자',receivedDate:'2026-10-07',startDate:'2026-10-07',endDate:'2026-10-16',targetDepartments:['마감팀','구조팀'],scopeText:'마감팀, 구조팀',scopeVerified:true,status:'접수완료',isScheduled:false};
const manager={id:'u_24',name:'합성 구조실장',department:'구조팀',position:'실장'},viewer={...manager,id:'readonly',position:'프로'};
const project=department=>({...newProjectFromIntake(intake,department),id:department==='마감팀'?'existing-finish':'existing-structure',pmId:'synthetic-pm'});
const text=node=>Array.isArray(node)?node.map(text).join(''):node==null||typeof node==='boolean'?'':typeof node==='object'?text(node.props?.children):String(node);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];

// Execute the complete component. Isolate hooks/store/effects; expose its unchanged registration handler for negative controls.
function screen(projects,user=manager,item=intake,options={}){
 const hooks=[],navigation=[],selection=[],writes=[],timers=[],refreshes=[],waits=[];let cursor=0,tree,register;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return[hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];};
 const auth={currentUser:user},studio={ready:options.ready??true};
 const state={projects,addProject:value=>{writes.push(value);state.projects=[...state.projects,{...value,id:'synthetic-created'}];},setSelectedProjectId:id=>selection.push(id)},exports={};
 runInNewContext(instrumented,{exports,Date,Map,Error,AbortSignal,captureRegister:fn=>{register=fn;},setTimeout:(fn,delay)=>timers.push({fn,delay}),require:path=>{
  if(path==='react')return {useState,useEffect(){},useMemo:fn=>fn()};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(path==='../store/useAuthStore')return {useAuthStore:Object.assign(selector=>selector(auth),{getState:()=>auth})};
  if(path==='../store/useProjectStore')return {useProjectStore:Object.assign(()=>state,{getState:()=>state})};
  if(path==='../store/useStudioStore')return {useStudioStore:{getState:()=>studio},updateStudioIntakeProjects:()=>{throw Error('Registration-only fixture must not poll intake');},refreshStudioProjects:async()=>{refreshes.push('projects');if(options.refreshError)throw Error(options.refreshError);},waitForSchedulePublished:async ids=>{waits.push(Array.from(ids));if(options.wait)await options.wait();if(options.waitError)throw Error(options.waitError);}};
  if(path==='../utils/schedulePermissions')return {canManageSchedule};
  if(path==='../utils/intakeRegistration')return {newProjectFromIntake};
  if(path==='../utils/pendingAssignment')return pendingAssignment;
  if(path==='../data/intakeProjects.json')return [structuredClone(item)];
  throw Error('Unexpected dependency '+path);
 }});
 const render=()=>{cursor=0;tree=exports.IntakeListView({intakeProjects:options.intakeProjects||[structuredClone(item)],onNavigateToSchedule:dept=>navigation.push(dept)});};render();
 const row=()=>nodes(tree).find(node=>node.type==='tr'&&text(node).includes(item.code));
 const buttons=root=>nodes(root).filter(node=>node.type==='button').map(node=>({text:text(node).trim(),disabled:Boolean(node.props.disabled)}));
 const button=(label,root=tree)=>{const found=nodes(root).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(found,label);return found;};
 return {row,rowText:()=>text(row()),rowButtons:()=>buttons(row()),buttons:()=>buttons(tree),html:()=>renderToStaticMarkup(tree),open:()=>{nodes(row()).find(node=>node.type==='td'&&node.props.onClick).props.onClick();render();},click:async label=>{const found=button(label);assert.equal(Boolean(found.props.disabled),false,label+' disabled');await found.props.onClick();for(let i=0;i<4;i++)await Promise.resolve();render();},register:async(value,department)=>{await register(value,department);render();},toast:()=>hooks[6],navigation,selection,writes,timers,refreshes,waits,switchActor:next=>{auth.currentUser=next;}};
}
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.log('FAIL',name,error.message);}}
await check('부분 등록 목록은 기존 팀 보기와 미등록 팀 등록을 구분하고 정확한 프로젝트·팀으로 이동',async()=>{
 const projects=[project('마감팀')],before=JSON.stringify(projects),s=screen(projects,viewer);
 assert.match(s.rowText(),/일부 등록/);assert.match(s.html(),/일부 등록/);assert.deepEqual(s.rowButtons(),[{text:'마감 일정 보기',disabled:false},{text:'구조 등록',disabled:true}]);
 await s.click('마감 일정 보기');assert.deepEqual(s.selection,['existing-finish']);assert.deepEqual(s.navigation,['마감팀']);assert.equal(s.writes.length,0);assert.equal(s.timers.length,0);assert.equal(JSON.stringify(projects),before);
});
await check('부분 등록 상세는 PM 미배정 안내와 기존 팀 보기·미등록 팀 등록을 함께 유지',async()=>{
 const projects=[{...project('마감팀'),pmId:''}],before=JSON.stringify(projects),s=screen(projects);s.open();
 assert.match(s.html(),/일부 등록 · PM 배정 필요/);assert.ok(s.buttons().some(button=>button.text==='마감팀 일정 보기'&&!button.disabled));assert.ok(s.buttons().some(button=>button.text==='구조팀 자동 반영 확인'&&!button.disabled));
 await s.click('마감팀 일정 보기');assert.deepEqual(s.selection,['existing-finish']);assert.deepEqual(s.navigation,['마감팀']);assert.equal(s.writes.length,0);assert.equal(JSON.stringify(projects),before);
});
await check('전체 등록 every와 신규·미배정 집계·필터를 유지하고 모든 팀 등록일 때 기존 보기·PM 안내 표시',async()=>{
 const none=screen([]);assert.match(none.rowText(),/신규·미배정/);assert.ok(!none.rowText().includes('일부 등록'));await none.click('배정 확인');assert.equal(none.row(),undefined);
 const partial=screen([project('마감팀')]);await partial.click('배정 확인');assert.equal(partial.row(),undefined);const pending=screen([project('마감팀')]);await pending.click('미배정');assert.ok(pending.row());assert.match(pending.html(),/건 배정 대기/);
 const all=screen([project('마감팀'),project('구조팀')]);assert.deepEqual(all.rowButtons(),[{text:'일정표 보기',disabled:false}]);await all.click('미배정');assert.equal(all.row(),undefined);
 const missingPM=screen([{...project('마감팀'),pmId:''},project('구조팀')]);assert.match(missingPM.rowText(),/신규 · PM 배정 필요/);
});
await check('미등록 팀은 기존 권한을 유지하고 타팀 기존 프로젝트 보기는 등록 권한과 무관한 읽기 동작',async()=>{
 const s=screen([project('마감팀')],viewer);s.open();assert.ok(s.buttons().some(button=>button.text==='구조팀 자동 반영 확인'&&button.disabled));await s.register(intake,'구조팀');assert.equal(s.toast(),'해당 팀 실장·팀장만 일정을 등록할 수 있습니다.');assert.equal(s.writes.length,0);assert.equal(s.timers.length,0);await s.click('마감팀 일정 보기');assert.deepEqual(s.selection,['existing-finish']);assert.deepEqual(s.navigation,['마감팀']);
});
await check('확인된 참여 팀은 중앙 자동 등록을 다시 읽고 별도 로컬 중복을 생성하지 않음',async()=>{
 const existing=project('마감팀'),original=JSON.stringify({existing,intake}),s=screen([existing]);s.open();await s.click('구조팀 자동 반영 확인');assert.equal(s.writes.length,0);assert.deepEqual(s.refreshes,['projects']);assert.equal(s.waits.length,0);assert.match(s.toast(),/중앙 일정표에 자동 반영/);assert.equal(JSON.stringify({existing,intake}),original);assert.equal(s.selection.length,0);assert.equal(s.navigation.length,0);
});
await check('기존 등록 중복·역전 원문 날짜는 거부하고 미확정 공백 날짜는 추정하지 않음',async()=>{
 const duplicate=screen([project('구조팀')]);await duplicate.register(intake,'구조팀');assert.equal(duplicate.toast(),'이미 등록된 프로젝트/부서입니다.');assert.equal(duplicate.refreshes.length,0);assert.equal(duplicate.writes.length,0);
 const invalid=screen([]);await invalid.register({...intake,startDate:'2026-10-16',endDate:'2026-10-07'},'구조팀');assert.match(invalid.toast(),/순서가 잘못/);assert.equal(invalid.refreshes.length,0);assert.equal(invalid.writes.length,0);
 const blank={...intake,targetDepartments:[],startDate:'',endDate:''},undated=screen([],manager,blank);await undated.register(blank,'구조팀');assert.equal(undated.writes[0].startDate,'');assert.equal(undated.writes[0].endDate,'');assert.equal(undated.writes[0].pmId,'');assert.deepEqual(undated.writes[0].roles,{});assert.deepEqual(undated.writes[0].subTasks,{});
});
await check('미확인 담당 팀은 권한에 맞춰 선택하고 중앙 저장 확인 후 해당 팀 배정 화면으로 연결',async()=>{
 const blank={...intake,targetDepartments:[],startDate:'',endDate:''},s=screen([],manager,blank);s.open();
 assert.ok(s.buttons().some(button=>button.text==='구조팀 담당팀 지정'&&!button.disabled));
 assert.ok(s.buttons().some(button=>button.text==='마감팀 담당팀 지정'&&button.disabled));
 await s.click('구조팀 담당팀 지정');assert.equal(s.writes.length,1);assert.deepEqual(s.waits,[['synthetic-created']]);assert.deepEqual(s.selection,['synthetic-created']);assert.deepEqual(s.navigation,['구조팀']);assert.match(s.toast(),/PM·담당 인원·날짜/);
});
await check('미확인 담당 팀의 서버 미연결·저장 실패·계정 전환은 성공 이동을 차단',async()=>{
 const blank={...intake,targetDepartments:[],startDate:'',endDate:''};
 const offline=screen([],manager,blank,{ready:false});await offline.register(blank,'구조팀');assert.equal(offline.writes.length,0);assert.equal(offline.selection.length,0);assert.match(offline.toast(),/중앙 공유 연결/);
 const failure=screen([],manager,blank,{waitError:'합성 저장 실패'});await failure.register(blank,'구조팀');assert.equal(failure.selection.length,0);assert.equal(failure.navigation.length,0);assert.equal(failure.toast(),'합성 저장 실패');
 let release;const delayed=screen([],manager,blank,{wait:()=>new Promise(resolve=>{release=resolve;})});const request=delayed.register(blank,'구조팀');await Promise.resolve();assert.equal(typeof release,'function');assert.equal(delayed.selection.length,0);delayed.switchActor(viewer);release();await request;assert.equal(delayed.selection.length,0);assert.equal(delayed.navigation.length,0);
 const refreshError=screen([],manager,intake,{refreshError:'합성 다시 읽기 실패'});await refreshError.register(intake,'구조팀');assert.equal(refreshError.writes.length,0);assert.equal(refreshError.toast(),'합성 다시 읽기 실패');
});
await check('공유 intakeProjects prop은 자체 번들명부 대신 입력된 동일 목록·순서·접수 이름을 표시',()=>{const high={...intake,id:'intake-shared-1',no:850003,code:'TK-2026999',name:'공유 최신 한국 현장'},low={...intake,id:'intake-shared-2',no:850002,code:'TK-2026997',name:'공유 다음 한국 현장'},records=[high,low],before=JSON.stringify(records),s=screen([],manager,intake,{intakeProjects:records}),html=s.html();assert.ok(html.includes(high.code)&&html.includes(low.code));assert.ok(html.indexOf(high.code)<html.indexOf(low.code));assert.ok(html.includes(high.name)&&html.includes(low.name));assert.equal(s.row(),undefined,'A project outside the shared prop must not reappear from the bundled seed');assert.equal(JSON.stringify(records),before);assert.equal(s.writes.length,0);});
const report={kind:'ACTUAL_INTAKE_COMPONENT_HOOKS_SSR_AND_HANDLER_MEMORY',sourceSHA256:createHash('sha256').update(source).digest('hex').toUpperCase(),PASS:results.filter(row=>row.status==='PASS').length,FAIL:results.filter(row=>row.status==='FAIL').length,results,operationalRegistrationWrites:0,networkRequests:0,limits:['Complete component runs with isolated hooks/store/auth/icons/raw-data/effects; actual registration handler is exposed only by test instrumentation.','Existing canManageSchedule and newProjectFromIntake execute; central refresh/save confirmation is modeled in memory. No actual browser/OS/crawler/DB run.']};
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');if(report.FAIL)process.exitCode=1;
await server.close();
