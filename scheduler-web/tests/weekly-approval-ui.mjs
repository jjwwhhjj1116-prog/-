import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),ts=require('typescript');
const source=readFileSync(new URL('../src/components/WeeklyReportApproval.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
const admin={id:'qa-admin',name:'합성 관리자'},execA={id:'exec-A',name:'합성 수신자 A'},execB={id:'exec-B',name:'합성 수신자 B'};
const recipientOptions=[{...execA,department:'경영진',position:'이사'},{...execB,department:'경영지원',position:'프로'}];
const overtime={projectCode:'QA-SNAPSHOT',projectName:'상신 당시 한국어 현장명',roleName:'내부',startTime:'17:00',endTime:'20:00',hours:3,status:'APPROVED'};
const item={projectCode:overtime.projectCode,projectName:overtime.projectName,roleName:'내부',progress:63,status:'진행중',todayTask:'보존할 상신 작업 본문',autoScheduleDate:'2026-10-14',manualFields:['progress']};
const submission=()=>({id:'submission-A',weekStart:'2026-10-12',weekEnd:'2026-10-18',department:'마감팀',authorId:admin.id,authorName:admin.name,status:'PENDING',sentAt:'2026-10-14T08:10:00Z',revision:7,recipients:[{...execA,decision:'PENDING'},{...execB,decision:'PENDING'}],teams:[{department:'마감팀',employees:[{id:'worker-A',name:'합성 개인',position:'프로',reportCount:1,approvedReportCount:0,overtimeDays:1,overtimeHours:3,days:[{date:'2026-10-14',logStatus:'SUBMITTED_LEADER',reportSource:'AUTO_SCHEDULE',notes:'상신 당시 종합 원문',items:[item],overtime:[overtime,{...overtime,status:'PENDING'},{...overtime,status:'REJECTED'}]}]}]}]});
const response=()=>({submissions:[submission()],canSubmit:true,recipientOptions,departments:['마감팀','구조팀','ALL']});
function mount({actor=admin,week='2026-10-12',transport=async()=>response()}={}){
 const hooks=[],effects=[],queue=[],timers=[],calls=[],props={week,onChanged:()=>{changed++;}};let cursor=0,dirty=true,tree,currentActor=actor,changed=0;
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];};
 const useRef=initial=>{const index=cursor++;return hooks[index]||(hooks[index]={current:initial});};
 const useEffect=(fn,deps)=>{const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps?.[i])))queue.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:fn()};});};
 const auth=Object.assign(selector=>selector({currentUser:currentActor}),{getState:()=>({currentUser:currentActor})});
 const modules={'react':{...React,useState,useRef,useEffect},'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../services/studioApi':{studioApi:async(path,method='GET',body)=>{calls.push({path,method,body});return transport(path,method,body);}},'../store/useAuthStore':{useAuthStore:auth}};
 const exports={};runInNewContext(compiled,{exports,Date,Error,console,setInterval:fn=>{const timer={fn,active:true};timers.push(timer);return timer;},clearInterval:timer=>{timer.active=false;},require:path=>{assert.ok(modules[path],path);return modules[path];}});
 const render=()=>{cursor=0;dirty=false;tree=exports.WeeklyReportApproval(props);};
 const settle=async()=>{for(let i=0;i<15;i++){if(dirty)render();while(queue.length)queue.shift()();await new Promise(resolve=>setImmediate(resolve));}if(dirty)render();};
 const find=label=>nodes(tree).find(node=>node.props['aria-label']===label),button=label=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
 const click=async label=>{const node=button(label)||find(label);assert.ok(node,label);assert.notEqual(node.props.disabled,true,label+' enabled');node.props.onClick();await settle();};
 const select=async(label,value)=>{const node=find(label);assert.ok(node,label);node.props.onChange({target:{value,checked:value}});await settle();};
 return {settle,find,button,click,select,all:()=>nodes(tree),content:()=>text(tree),calls,changed:()=>changed,send:async()=>{const form=nodes(tree).find(node=>node.type==='form');assert.ok(form,'상신 form');form.props.onSubmit({preventDefault(){}});await settle();},week:async next=>{props.week=next;dirty=true;await settle();},actor:async next=>{currentActor=next;dirty=true;render();await settle();},poll:async()=>{timers.filter(timer=>timer.active).forEach(timer=>timer.fn());await settle();},close:()=>effects.forEach(effect=>effect?.cleanup?.())};
}
const results=[];async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
await check('서버 허용 수신자·부서 그룹 그대로 표시, 팀과 복수 수신 선택 실제 상신 payload',async()=>{
 const screen=mount();await screen.settle();assert.equal(screen.calls[0].path,'weekly-reports/submissions?week=2026-10-12');assert.equal(screen.find('주간 결재 보고 팀').props.value,'마감팀');assert.equal(screen.button('주간 보고 상신').props.disabled,true);assert.match(screen.content(),/경영지원/);assert.match(screen.content(),/경영진/);await screen.select('주간 결재 보고 팀','구조팀');await screen.select('결재 수신 합성 수신자 A',true);await screen.select('결재 수신 합성 수신자 B',true);assert.equal(screen.button('주간 보고 상신').props.disabled,false);await screen.send();const request=screen.calls.find(call=>call.method==='POST');assert.equal(request.path,'weekly-reports/submit');assert.deepEqual(JSON.parse(JSON.stringify(request.body)),{week:'2026-10-12',department:'구조팀',recipientIds:['exec-A','exec-B']});assert.equal(screen.changed(),1);screen.close();
});
await check('자기 미결재 수신자만 승인 버튼, revision과 의견 전송 및 승인 후 개인 버튼 제거',async()=>{
 let report=response();report.canSubmit=false;const screen=mount({actor:execB,transport:async(path,method,body)=>{if(method==='POST'){report.submissions[0].recipients[1].decision=body.decision;report.submissions[0].recipients[1].memo=body.memo;}return report;}});await screen.settle();assert.ok(screen.button('주간 보고 승인'));await screen.select('submission-A 결재 의견','합성 승인 의견');await screen.click('주간 보고 승인');const request=screen.calls.find(call=>call.method==='POST');assert.equal(request.path,'weekly-reports/decision');assert.deepEqual(JSON.parse(JSON.stringify(request.body)),{id:'submission-A',revision:7,decision:'APPROVED',memo:'합성 승인 의견'});assert.equal(screen.button('주간 보고 승인'),undefined);assert.match(screen.content(),/결재 대기/);assert.match(screen.content(),/합성 승인 의견/);screen.close();
});
await check('다른 수신자·이미 승인자·최종 승인/반려 본에는 승인 및 반려 버튼 없음',async()=>{
 for(const [actor,patch] of [[admin,{}],[execA,{recipients:[{...execA,decision:'APPROVED'}]}],[execB,{status:'APPROVED'}],[execB,{status:'REJECTED'}]]){const screen=mount({actor,transport:async()=>({...response(),canSubmit:false,submissions:[{...submission(),...patch}]})});await screen.settle();assert.equal(screen.button('주간 보고 승인'),undefined);assert.equal(screen.button('주간 보고 반려'),undefined);assert.equal(screen.all().find(node=>node.type==='form'),undefined);screen.close();}
});
await check('상신본 개인·날짜·공종·원문·수기 진행률 보존 표시, 승인 야근만 표시 및 현장명 번역 제외',async()=>{
 const screen=mount();await screen.settle();assert.match(screen.content(),/상신 당시 종합 원문/);assert.match(screen.content(),/보존할 상신 작업 본문/);assert.match(screen.content(),/보고 진행률 63%/);assert.match(screen.content(),/2026-10-14/);assert.match(screen.content(),/승인 야근 1일 \/ 3시간/);assert.equal(screen.all().filter(node=>node.props['data-weekly-snapshot-employee']).length,1);assert.equal(screen.all().filter(node=>node.props['data-weekly-snapshot-overtime']).length,1);assert.equal(screen.all().filter(node=>node.props['data-no-translate']&&text(node)==='상신 당시 한국어 현장명').length,2);screen.close();
});
await check('상신본에 일지 없이 미래 승인 야근만 있으면 업무일지 없음·예정 구분',async()=>{
 const report=response();report.submissions[0].teams[0].employees[0].days=[{date:'2026-10-16',future:true,logStatus:'NONE',reportSource:'MANUAL',notes:'',items:[],overtime:[overtime]}];const screen=mount({transport:async()=>report});await screen.settle();assert.match(screen.content(),/업무일지 없음/);assert.match(screen.content(),/승인 야근\(예정\)/);assert.ok(!screen.content().includes('직원 작성 보고'));assert.equal(screen.all().filter(node=>node.props['data-weekly-snapshot-overtime']).length,1);screen.close();
});
await check('상신 오류는 팀·선택 수신자 유지, 반려 오류는 의견 보존',async()=>{
 const transport=async(path,method)=>{if(method==='POST')throw Error('합성 revision 충돌');return response();};const author=mount({transport});await author.settle();await author.select('주간 결재 보고 팀','ALL');await author.select('결재 수신 합성 수신자 B',true);await author.send();assert.match(author.content(),/합성 revision 충돌/);assert.equal(author.find('주간 결재 보고 팀').props.value,'ALL');assert.equal(author.find('결재 수신 합성 수신자 B').props.checked,true);assert.equal(author.changed(),0);author.close();const receiver=mount({actor:execB,transport});await receiver.settle();await receiver.select('submission-A 결재 의견','보존할 반려 의견');await receiver.click('주간 보고 반려');assert.match(receiver.content(),/합성 revision 충돌/);assert.equal(receiver.find('submission-A 결재 의견').props.value,'보존할 반려 의견');assert.equal(receiver.calls.find(call=>call.method==='POST').body.decision,'REJECTED');receiver.close();
});
await check('공유 재조회는 미상신 선택·미저장 결재 의견을 유지, 최신 개인 승인 응답 반영',async()=>{
 let report=response();const screen=mount({actor:execB,transport:async()=>report});await screen.settle();await screen.select('결재 수신 합성 수신자 A',true);await screen.select('submission-A 결재 의견','재조회 중 의견');await screen.poll();assert.equal(screen.find('결재 수신 합성 수신자 A').props.checked,true);assert.equal(screen.find('submission-A 결재 의견').props.value,'재조회 중 의견');report={...response(),submissions:[{...submission(),recipients:[{...execA,decision:'PENDING'},{...execB,decision:'APPROVED'}]}]};await screen.poll();assert.equal(screen.button('주간 보고 승인'),undefined);screen.close();
});
await check('계정 전환 뒤 늦은 이전 조회는 수신자·상신본을 노출하지 않음',async()=>{
 let resolveFirst;const screen=mount({transport:async()=>resolveFirst?{...response(),canSubmit:false,submissions:[],recipientOptions:[]}:new Promise(resolve=>{resolveFirst=resolve;})});await screen.settle();await screen.actor(execB);resolveFirst(response());await screen.settle();assert.equal(screen.all().filter(node=>node.props['data-weekly-submission']).length,0);assert.equal(screen.find('결재 수신 합성 수신자 A'),undefined);screen.close();
});
await check('주 변경 뒤 늦은 상신 응답은 새 주의 성공 메시지·후속 갱신에 혼입하지 않음',async()=>{
 let finishPost;const screen=mount({transport:async(path,method)=>method==='POST'?new Promise(resolve=>{finishPost=resolve;}):response()});await screen.settle();await screen.select('결재 수신 합성 수신자 B',true);await screen.send();await screen.week('2026-10-19');finishPost({ok:true});await screen.settle();assert.ok(!screen.content().includes('주간 보고를 상신했습니다'));assert.equal(screen.changed(),0);assert.equal(screen.calls.at(-1).path,'weekly-reports/submissions?week=2026-10-19');screen.close();
});
await check('조회 오류는 기존 상신본을 보존하고 다음 재조회 복구 시 오류 제거',async()=>{
 let fail=false;const screen=mount({transport:async()=>{if(fail)throw Error('합성 결재 조회 실패');return response();}});await screen.settle();fail=true;await screen.poll();assert.match(screen.content(),/합성 결재 조회 실패/);assert.equal(screen.all().filter(node=>node.props['data-weekly-submission']).length,1);fail=false;await screen.poll();assert.ok(!screen.content().includes('합성 결재 조회 실패'));screen.close();
});
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'test-results/weekly-approval-ui.json';mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_WEEKLY_APPROVAL_UI_SYNTHETIC_API_HOOK_HARNESS',operatingWrites:0,limits:['실제 컴포넌트 이벤트를 실행하며 권한·API 응답·상신본은 합성입니다. 운영 결재 저장과 구분합니다.'],results},null,2)+'\n');if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
