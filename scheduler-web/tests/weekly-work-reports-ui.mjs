import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {localDate} from '../src/utils/scheduleProgress.ts';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),ts=require('typescript');
const source=readFileSync(new URL('../src/components/WeeklyWorkReports.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
const admin={id:'qa-week-admin',name:'합성 관리자'},member={id:'qa-week-member',name:'합성 직원'};
const directory=[{id:'exec-A',name:'합성 임원 A',department:'경영지원',position:'이사'},{id:'exec-B',name:'합성 임원 B',department:'경영지원',position:'상무'}];
const item={projectCode:'QA-WEEK',projectName:'한국어 프로젝트명',roleName:'조적',progress:45,status:'진행중',todayTask:'합성 산출 검토',autoScheduleDate:'2026-10-14'};
const ot={projectCode:item.projectCode,projectName:item.projectName,roleName:item.roleName,startTime:'17:00',endTime:'20:00',hours:3,status:'APPROVED'};
function response(week='2026-10-12',canConfigure=true){
 const end=new Date(week+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);
 return {weekStart:week,weekEnd:end.toISOString().slice(0,10),teams:[
  {department:'마감팀',employees:[{id:'employee-A',name:'동일 이름',position:'프로',days:[{date:'2026-10-14',logStatus:'SUBMITTED_LEADER',reportSource:'AUTO_SCHEDULE',plannedProgress:45,notes:'자동 본문',items:[item],overtime:[ot,{...ot,status:'PENDING'},{...ot,status:'REJECTED'}]},{date:'2026-10-16',future:true,logStatus:'NONE',reportSource:'MANUAL',notes:'',items:[],overtime:[{...ot,hours:2,startTime:'17:00',endTime:'19:00'}]}],reportCount:1,approvedReportCount:0,overtimeDays:2,overtimeHours:5}]},
  {department:'구조팀',employees:[{id:'employee-B',name:'동일 이름',position:'수석',days:[{date:'2026-10-14',logStatus:'APPROVED_FINAL',reportSource:'MANUAL',reportedProgress:70,notes:'수기 보고 원문',items:[{...item,roleName:'보',progress:70,autoScheduleDate:undefined}],overtime:[]}],reportCount:1,approvedReportCount:1,overtimeDays:0,overtimeHours:0}]}
 ],delivery:{status:'NOT_SENT',recipients:[directory[0]]},canConfigure,config:{recipientIds:['exec-A']},directory};
}
function mount({actor=admin,transport=async path=>response(path.includes('?week=')?path.split('?week=')[1]:undefined),pending,initialWeek}={}){
 const hooks=[],effects=[],queue=[],timers=[],calls=[],props={initialWeek};let cursor=0,dirty=true,tree,currentActor=actor;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||(hooks[index]={current:initial});};
 const useEffect=(fn,deps)=>{const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps?.[i])))queue.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:fn()};});};
 const auth=Object.assign(selector=>selector({currentUser:currentActor}),{getState:()=>({currentUser:currentActor})});
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-14T03:00:00Z']));}};
 const modules={'react':{...React,useState,useRef,useEffect},'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../services/studioApi':{studioApi:async(path,method='GET',body)=>{calls.push({path,method,body});return pending?pending(path,method,body):transport(path,method,body);}},'../store/useAuthStore':{useAuthStore:auth},'../utils/scheduleProgress':{localDate:()=>localDate(new FixedDate())}};
 const exports={};runInNewContext(compiled,{exports,Date:FixedDate,Error,console,setInterval:fn=>{const timer={fn,active:true};timers.push(timer);return timer;},clearInterval:timer=>{timer.active=false;},require:path=>{assert.ok(modules[path],path);return modules[path];}});
 const render=()=>{cursor=0;dirty=false;tree=exports.WeeklyWorkReports(props);};
 const settle=async()=>{for(let i=0;i<15;i++){if(dirty)render();while(queue.length)queue.shift()();await new Promise(resolve=>setImmediate(resolve));}if(dirty)render();};
 const find=label=>nodes(tree).find(node=>node.props['aria-label']===label),button=label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
 const click=async label=>{const node=button(label)||find(label);assert.ok(node,label);assert.notEqual(node.props.disabled,true,label+' enabled');node.props.onClick();await settle();};
 return {settle,find,button,click,all:()=>nodes(tree),content:()=>text(tree),calls,openWeek:async next=>{props.initialWeek=next;dirty=true;await settle();},actor:async next=>{currentActor=next;dirty=true;render();return settle();},poll:async()=>{timers.filter(timer=>timer.active).forEach(timer=>timer.fn());await settle();},close:()=>effects.forEach(effect=>effect?.cleanup?.())};
}
const results=[];async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
await check('팀·개인 ID 분리, 요일별 보고 상태·계획/보고 진행률·공종·한국어 프로젝트명',async()=>{
 const screen=mount();await screen.settle();assert.equal(screen.calls[0].path,'weekly-reports?week=2026-10-12');assert.equal(screen.all().filter(node=>node.props['data-weekly-employee']).length,2);assert.equal(screen.all().filter(node=>node.props['data-weekly-day']).length,14);assert.match(screen.content(),/일정 기준 자동 보고/);assert.match(screen.content(),/직원 작성 보고/);assert.match(screen.content(),/팀장 검토 대기/);assert.match(screen.content(),/최종 승인/);assert.match(screen.content(),/계획 45%/);assert.match(screen.content(),/보고 70%/);assert.equal(screen.all().filter(node=>node.props['data-no-translate']&&text(node)==='한국어 프로젝트명').length,4);screen.close();
});
await check('승인 야근만 날짜·시간·공종 표시, 미래 승인 계획 분리, 같은 이름의 개인 합계 유지',async()=>{
 const screen=mount();await screen.settle();const a=screen.all().find(node=>node.props['data-weekly-employee']==='employee-A'),b=screen.all().find(node=>node.props['data-weekly-employee']==='employee-B');assert.equal(nodes(a).filter(node=>node.props['data-weekly-approved-overtime']).length,2);assert.equal(nodes(b).filter(node=>node.props['data-weekly-approved-overtime']).length,0);assert.match(text(a),/승인 야근 2일 · 5시간/);assert.match(text(b),/승인 야근 0일 · 0시간/);assert.match(text(a),/17:00 ~ 20:00/);assert.match(text(a),/승인 야근\(예정\)/);screen.close();
});
await check('팀 탭 필터는 해당 개인·그 팀 합계만 보여 주고 전체 복원',async()=>{
 const screen=mount();await screen.settle();await screen.click('구조팀');assert.deepEqual(screen.all().filter(node=>node.props['data-weekly-employee']).map(node=>node.props['data-weekly-employee']),['employee-B']);assert.ok(!screen.content().includes('승인 야근 2일'));await screen.click('전체 팀');assert.equal(screen.all().filter(node=>node.props['data-weekly-employee']).length,2);screen.close();
});
await check('주간 날짜는 월요일부터 조회, 이전·다음·이번 주 실제 요청 컨텍스트',async()=>{
 const screen=mount();await screen.settle();screen.find('주간 보고 조회 날짜').props.onChange({target:{value:'2026-10-21'}});await screen.settle();assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-10-19');await screen.click('이전 주');assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-10-12');await screen.click('다음 주');assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-10-19');await screen.click('이번 주');assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-10-12');screen.close();
});
await check('주간 보고 알림 진입·이미 열린 화면 새 알림은 해당 주로 이동하며 최신 공유/발송 기준 안내',async()=>{
 const screen=mount({initialWeek:'2026-09-25'});await screen.settle();assert.equal(screen.calls[0].path,'weekly-reports?week=2026-09-21');await screen.click('다음 주');assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-09-28');await screen.openWeek('2026-10-16');assert.equal(screen.calls.at(-1).path,'weekly-reports?week=2026-10-12');assert.match(screen.content(),/표는 최신 공유 기록이며 발송 시각은 마지막 주간 보고 기준/);screen.close();
});
await check('관리자 수신 임원 선택은 공유 재조회에 덮이지 않고 지정 ID로만 저장',async()=>{
 const screen=mount();await screen.settle();screen.find('주간 보고 수신 합성 임원 B').props.onChange({target:{checked:true}});await screen.settle();await screen.poll();assert.equal(screen.find('주간 보고 수신 합성 임원 B').props.checked,true);const form=screen.all().find(node=>node.type==='form');form.props.onSubmit({preventDefault(){}});await screen.settle();const request=screen.calls.find(call=>call.method==='POST');assert.equal(request.path,'weekly-reports/settings');assert.deepEqual(Array.from(request.body.recipientIds),['exec-A','exec-B']);screen.close();
});
await check('일반 직원 응답은 수신 설정 UI를 노출하지 않고 받은 개인 범위만 표시',async()=>{
 const screen=mount({actor:member,transport:async()=>({...response('2026-10-12',false),teams:[{department:'마감팀',employees:response().teams[0].employees}]})});await screen.settle();assert.equal(screen.find('주간 보고 수신 합성 임원 A'),undefined);assert.ok(!screen.content().includes('경영지원 임원 보고 수신 설정'));assert.equal(screen.all().filter(node=>node.props['data-weekly-employee']).length,1);screen.close();
});
await check('수신 실패 시 표시 기록 보존 및 재조회 복구, 전송 상태 구분',async()=>{
 let fail=false,sent=false;const screen=mount({transport:async()=>{if(fail)throw Error('합성 공유 오류');return {...response(),delivery:{status:sent?'SENT':'RECIPIENTS_REQUIRED',sentAt:sent?'2026-10-16T08:10:00Z':undefined,recipients:sent?[directory[0]]:[]}};}});await screen.settle();assert.match(screen.content(),/보고 수신 임원 설정 필요/);fail=true;await screen.poll();assert.match(screen.content(),/합성 공유 오류/);assert.equal(screen.all().filter(node=>node.props['data-weekly-employee']).length,2);fail=false;sent=true;await screen.poll();assert.match(screen.content(),/임원 보고 완료/);assert.ok(!screen.content().includes('합성 공유 오류'));screen.close();
});
await check('계정 전환 후 늦은 이전 계정 응답은 다른 직원 화면에 표시하지 않음',async()=>{
 let firstResolve;const screen=mount({pending:async()=>firstResolve?{...response('2026-10-12',false),teams:[]}:new Promise(resolve=>{firstResolve=resolve;})});await screen.settle();await screen.actor(member);firstResolve(response());await screen.settle();assert.equal(screen.all().filter(node=>node.props['data-weekly-employee']).length,0);assert.ok(!screen.content().includes('동일 이름'));screen.close();
});
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'test-results/weekly-work-reports-ui.json';mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_WEEKLY_UI_SYNTHETIC_API_HOOK_HARNESS',operatingWrites:0,limits:['실제 컴포넌트와 이벤트 실행이며 API 응답·계정·시간 입력은 합성입니다. 브라우저 및 운영 DB 검증과 구분합니다.'],results},null,2)+'\n');if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
