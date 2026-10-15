import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime');
const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const serviceCode=compile('../src/services/postDeliveryScheduleService.ts'),componentCode=compile('../src/components/SupplementScheduleView.tsx');
const vietTeams={},visibility={},personalWork={};runInNewContext(compile('../src/data/vietTeams.ts'),{exports:vietTeams});runInNewContext(compile('../src/utils/postDeliveryVisibility.ts'),{exports:visibility});runInNewContext(compile('../src/utils/personalWork.ts'),{exports:personalWork,require:path=>{if(path==='../constants/holidays.ts')return{HOLIDAYS:{}};if(path==='./scheduleProgress.ts')return{workDays:()=>0};if(path==='./postDeliveryVisibility.ts')return visibility;if(path==='../data/vietTeams.ts')return vietTeams;throw Error('Unexpected utility import '+path);}});
const text=node=>Array.isArray(node)?node.map(text).join(''):node==null||typeof node==='boolean'?'':typeof node==='object'?text(node.props?.children):String(node);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
class StudioError extends Error{constructor(message,status){super(message);this.status=status;}}
const fixtureTask={id:'task-own',projectId:'host-structure',projectRevision:22,deliveryDate:'2026-10-01',revision:3,kind:'수정',startDate:'2026-10-15',endDate:'2026-10-16',memo:'기존 도면 보완',personIds:['member-a'],status:'진행중',submissionStatus:'REPORTED',department:'구조팀',createdBy:'member-a',createdByName:'작성자 가',reviewerIds:['lead','chief'],canEdit:true,canCancel:true};
const fixture=()=>({capabilities:{canRegister:true,department:'구조팀',userId:'member-a'},projects:[{projectId:'representative',projectCode:'TK-QA-SUPPLEMENT',projectName:'검수전용 한국어 프로젝트',department:'구조팀',deliveryDate:'2026-10-10',projectRevision:7,tasks:[structuredClone(fixtureTask)]}]});
function screen(options={}){
 let data=options.data||fixture(),tree,cursor=0,renderNeeded=false,pendingEffects=[],mutationGate,closed=0,refreshes=0,notifications=0;
 const calls=[],hooks=[],effects=[],user={id:'member-a',no:104,name:'작성자 가',department:'구조팀',company:'컨코스트'},auth={currentUser:user,users:[user,{id:'lead',name:'팀장 가'},{id:'chief',name:'실장 가'}]},projects={projects:[]};
 const state=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return[hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;renderNeeded=true;}];};
 const ref=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
 const effect=(create,deps)=>{const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))pendingEffects.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:create()};});};
 const api=async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='GET')return structuredClone(data);if(options.holdMutation){mutationGate??=defer();return mutationGate.promise;}if(options.conflict)throw new StudioError('중앙 충돌',409);return{project:{},projectRevision:8,revision:1,task:body};};
 const service={};runInNewContext(serviceCode,{exports:service,require:path=>{assert.equal(path,'./studioApi');return{studioApi:api};},encodeURIComponent});
 const authHook=selector=>selector(auth);authHook.getState=()=>auth;
 const localDate=(date=new Date('2026-10-15T12:00:00'))=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const exported={};runInNewContext(componentCode,{exports:exported,Date,Promise,Error,Array,crypto:{randomUUID:()=>`client-stable-uuid`},document:{activeElement:null},HTMLElement:class{},require:path=>{
  if(path==='react')return{useState:state,useRef:ref,useEffect:effect,useId:()=>{cursor++;return'qa-dialog-title';}};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(path==='../store/useAuthStore')return{useAuthStore:authHook};
  if(path==='../store/useProjectStore')return{useProjectStore:selector=>selector(projects)};
  if(path==='../services/studioApi')return{StudioError};
  if(path==='../utils/personalWork')return personalWork;
  if(path==='../services/postDeliveryScheduleService')return service;
  if(path==='../store/useStudioStore')return{refreshStudioProjects:async()=>{refreshes++;if(options.refreshFailure)throw Error('공유 갱신 실패');},refreshStudioMeetings:async()=>{notifications++;}};
  if(path==='../utils/scheduleProgress')return{localDate,validDateRange:(a,b)=>/^\d{4}-\d{2}-\d{2}$/.test(a)&&/^\d{4}-\d{2}-\d{2}$/.test(b)&&a<=b};
  throw Error('Unexpected import '+path);
 }});
 const render=()=>{cursor=0;renderNeeded=false;tree=exported.SupplementScheduleView({department:'구조팀',onClose:()=>closed++,...options.props});};
 const flush=async()=>{for(let i=0;i<12;i++){const work=pendingEffects;pendingEffects=[];for(const run of work)run();await new Promise(resolve=>setImmediate(resolve));if(renderNeeded)render();if(!pendingEffects.length&&!renderNeeded)break;}};
 const find=(type,label)=>{const node=nodes(tree).find(node=>node.type===type&&(node.props['aria-label']===label||text(node).trim()===label));assert.ok(node,`${type}: ${label}`);return node;};
 const click=async label=>{find('button',label).props.onClick();render();await flush();};
 const change=async(label,value)=>{const node=nodes(tree).find(node=>node.props['aria-label']===label);assert.ok(node,label);node.props.onChange({target:{value}});render();await flush();};
 const submit=async()=>{nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});render();await flush();};
 render();return{flush,render,find,click,change,submit,calls,service,auth,projects,get tree(){return tree;},get refreshes(){return refreshes;},get notifications(){return notifications;},get closed(){return closed;},release:()=>mutationGate.resolve({project:{},projectRevision:8,revision:1,task:{}}),setData:next=>{data=next;},unmount:()=>effects.forEach(effect=>effect?.cleanup?.())};
}
const results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL'});console.error('FAIL '+name,error);}}
await check('service uses encoded host and optimistic project/task revisions; no approver or assignee supplied by client',async()=>{
 const s=screen();await s.service.registerSupplementSchedule('host/a','id',5,{kind:'검토',startDate:'2026-10-15',endDate:'2026-10-17',memo:'수정 검토'});assert.equal(s.calls.at(-1).path,'projects/host%2Fa/supplements');assert.deepEqual(Object.keys(s.calls.at(-1).body).sort(),['endDate','id','kind','memo','revision','startDate']);await s.service.updateSupplementSchedule('host/a','task/b',6,3,{kind:'수정',startDate:'2026-10-16',endDate:'2026-10-17',memo:'변경'});assert.equal(s.calls.at(-1).path,'projects/host%2Fa/supplements/task%2Fb');assert.equal(s.calls.at(-1).body.taskRevision,3);await s.service.cancelSupplementSchedule('host/a','task/b',7,4);assert.equal(s.calls.at(-1).method,'POST');assert.equal(s.calls.at(-1).path,'projects/host%2Fa/supplements/task%2Fb/cancel');
});
await check('personal calendar covers both inclusive days, excludes cancelled rows, and keeps Korean project labels',async()=>{
 const data=fixture();data.projects[0].tasks.push({...fixtureTask,id:'cancelled',startDate:'2026-10-18',endDate:'2026-10-18',submissionStatus:'CANCELLED',canEdit:false,canCancel:false});const s=screen({data});await s.flush();const chips=nodes(s.tree).filter(n=>n.type==='button'&&n.props.title?.startsWith('검수전용 한국어 프로젝트'));assert.equal(chips.length,2);assert.ok(chips.every(n=>'data-no-translate'in n.props));assert.equal(s.find('select','보완 프로젝트').props.children[1][0].props['data-no-translate'],true);assert.match(text(s.tree),/등록 즉시 확정/);assert.ok(!text(s.tree).includes('승인 대기'));
});
await check('legacy staff number and unique name assignments remain on personal calendar without granting edit rights',async()=>{
 const data=fixture();data.projects[0].tasks=[{...fixtureTask,id:'legacy-no',createdBy:undefined,createdByName:undefined,personIds:['104'],memo:'사번 배정 보완',canEdit:false,canCancel:false},{...fixtureTask,id:'legacy-name',createdBy:undefined,createdByName:undefined,personIds:['작성자 가'],memo:'이름 배정 보완',canEdit:false,canCancel:false}];const s=screen({data});await s.flush();const legacy=nodes(s.tree).filter(n=>n.type==='button'&&n.props.title?.includes('배정 보완'));assert.equal(legacy.length,4);legacy[0].props.onClick();s.render();await s.flush();assert.match(text(s.tree),/보완 일정 상세/);assert.ok(!nodes(s.tree).some(n=>n.type==='button'&&text(n)==='수정하고 재보고'));assert.equal(s.find('textarea','보완 내용').props.maxLength,500);
});
await check('date click creates personal schedule; registration is immediate report with one stable request and no input autosave',async()=>{
 const s=screen({holdMutation:true});await s.flush();await s.click('2026-10-20 보완 일정 등록');await s.change('보완 내용','  도면 수정 검수  ');assert.equal(s.calls.filter(c=>c.method!=='GET').length,0);await s.submit();await s.submit();assert.equal(s.calls.filter(c=>c.method==='POST').length,1);const request=s.calls.find(c=>c.method==='POST');assert.equal(request.body.id,'client-stable-uuid');assert.equal(request.body.startDate,'2026-10-20');assert.equal(request.body.endDate,'2026-10-20');assert.equal(request.body.memo,'도면 수정 검수');assert.equal(request.body.revision,7);s.release();await s.flush();assert.equal(s.refreshes,1);assert.equal(s.notifications,1);assert.match(text(s.tree),/보완 일정이 확정되었습니다/);
});
await check('conflict preserves edits and stable retry id while latest list refresh never overwrites form',async()=>{
 const s=screen({conflict:true});await s.flush();await s.change('보완 내용','충돌 시 보존할 도면 수정');await s.submit();assert.match(text(s.tree),/입력은 유지했습니다/);assert.equal(s.find('textarea','보완 내용').props.value,'충돌 시 보존할 도면 수정');const latest=fixture();latest.projects[0].projectRevision=8;s.setData(latest);await s.click('최신 목록 조회');assert.equal(s.find('textarea','보완 내용').props.value,'충돌 시 보존할 도면 수정');await s.submit();assert.equal(s.calls.filter(c=>c.method==='POST').length,2);assert.equal(s.calls.at(-1).body.revision,8);assert.equal(s.calls.filter(c=>c.method==='POST')[0].body.id,s.calls.at(-1).body.id);
});
await check('notification opens real host task; edit uses host delivery date/revisions rather than shared project representative',async()=>{
 const data=fixture();data.projects[0].deliveryDate='2026-11-30';const s=screen({data,props:{initialProjectId:'host-structure',initialTaskId:'task-own'}});await s.flush();assert.match(text(s.tree),/내 보완 일정 수정/);assert.equal(s.find('input','보완 시작일').props.min,'2026-10-01');await s.change('보완 내용','원 보완 내용 변경');await s.submit();const request=s.calls.find(c=>c.method==='PUT');assert.ok(request);assert.equal(request.path,'projects/host-structure/supplements/task-own');assert.equal(request.body.revision,22);assert.equal(request.body.taskRevision,3);assert.ok(!('personIds'in request.body));
});
await check('own cancellation explicitly confirms and uses soft-cancel endpoint; foreign and cancelled reports expose no edit controls',async()=>{
 const own=screen({props:{initialTaskId:'task-own'}});await own.flush();await own.click('이 보완 일정 취소');assert.equal(own.calls.filter(c=>c.method!=='GET').length,0);await own.click('보완 일정 취소 확정');assert.equal(own.calls.find(c=>c.method==='POST').path,'projects/host-structure/supplements/task-own/cancel');assert.match(text(own.tree),/취소 이력은 보존/);
 for(const task of[{...fixtureTask,personIds:['other'],createdBy:'other',createdByName:'다른 직원',canEdit:false,canCancel:false},{...fixtureTask,submissionStatus:'CANCELLED',canEdit:false,canCancel:false}]){const data=fixture();data.projects[0].tasks=[task];const s=screen({data,props:{initialTaskId:'task-own'}});await s.flush();assert.match(text(s.tree),/보완 일정 상세/);assert.ok(!nodes(s.tree).some(n=>n.type==='button'&&['수정하고 재보고','이 보완 일정 취소'].includes(text(n))));assert.equal(nodes(s.tree).find(n=>n.type==='fieldset').props.disabled,true);}
});
await check('foreign accounts cannot register; late mutation after logout cannot replace next account state',async()=>{
 const data=fixture();data.capabilities.canRegister=false;const foreign=screen({data});await foreign.flush();assert.ok(!nodes(foreign.tree).some(n=>n.type==='button'&&text(n)==='등록하고 자동 보고'));assert.equal(foreign.find('button','2026-10-20 보완 일정 등록').props.disabled,true);
 const s=screen({holdMutation:true});await s.flush();await s.change('보완 내용','이전 계정 입력');await s.submit();s.auth.currentUser={id:'member-b',name:'다음 계정',department:'마감팀'};s.render();await s.flush();s.release();await s.flush();assert.ok(!text(s.tree).includes('보완 일정이 확정되었습니다'));assert.equal(s.refreshes,0);assert.equal(s.find('textarea','보완 내용').props.value,'');
 const same=screen({holdMutation:true});await same.flush();const sameActor=same.auth.currentUser;await same.change('보완 내용','전환 전 저장');await same.submit();same.auth.currentUser={id:'member-b',name:'다음 계정'};same.render();await same.flush();same.auth.currentUser=sameActor;same.render();await same.flush();same.release();await same.flush();assert.equal(same.refreshes,0);assert.ok(!text(same.tree).includes('보완 일정이 확정되었습니다'));
});
await check('saved result remains successful when shared refresh fails, and source project sync refreshes without any polling timer',async()=>{
 const s=screen({refreshFailure:true});await s.flush();await s.change('보완 내용','정상 저장 후 갱신 실패');await s.submit();assert.match(text(s.tree),/중앙 저장과 보고는 완료/);assert.equal(s.calls.filter(c=>c.method==='POST').length,1);const oldReads=s.calls.filter(c=>c.method==='GET').length;s.projects.projects=[{id:'remote-update'}];s.render();await s.flush();assert.equal(s.calls.filter(c=>c.method==='GET').length,oldReads+1);
});
await check('invalid ranges and dates before delivery never mutate; Escape dismisses idle dialog',async()=>{
 const s=screen();await s.flush();await s.submit();assert.equal(s.calls.filter(c=>c.method!=='GET').length,0);assert.match(text(s.tree),/ 보완 내용을 입력/);await s.change('보완 내용','내용');await s.change('보완 시작일','2026-10-09');await s.submit();assert.match(text(s.tree),/원 납품일 2026-10-10/);assert.equal(s.calls.filter(c=>c.method!=='GET').length,0);await s.change('보완 시작일','2026-10-15');await s.change('보완 내용','가'.repeat(501));await s.submit();assert.match(text(s.tree),/500자 이내/);assert.equal(s.calls.filter(c=>c.method!=='GET').length,0);nodes(s.tree).find(n=>n.props.role==='dialog').props.onKeyDown({key:'Escape',stopPropagation(){}});assert.equal(s.closed,1);
});
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
