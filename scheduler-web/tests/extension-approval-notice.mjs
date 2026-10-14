import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime');
const compiled=ts.transpileModule(readFileSync(new URL('../src/components/StudioCollaboration.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&n.props?[n,...nodes(n.props.children)]:[];
const notice=(id='r1')=>({id:'extension-approved:'+id,meeting_id:'extension:qa-project',message:'합성 공종 연장 승인 2026-10-14 → 2026-10-16',created_at:'2026-10-14T00:00:00Z',read_at:null});
function screen({notifications=[notice()],ready=true,actorId='worker',api=async()=>({ok:true})}={}){
 const slots=[],calls=[],opens=[],personal={},actor={currentUser:{id:'worker'}},studio={ready,actorId,notifications,status:'연결',pending:0,conflict:false,unreadCount:notifications.filter(n=>!n.read_at).length};let cursor=0,tree,refreshes=0;
 const auth=selector=>selector(actor);auth.getState=()=>actor;
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
 const exports={};runInNewContext(compiled,{exports,require:name=>({'react':{...React,useState},'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../store/useAuthStore':{useAuthStore:auth},'../services/studioApi':{studioApi:async(...args)=>{calls.push(args);return api(...args);}},'../store/useStudioStore':{useStudioStore:()=>studio,refreshStudioMeetings:async()=>{refreshes++;},publishLocalTeam:async()=>{},resolveScheduleConflict:async()=>{}},'../store/usePersonalStore':{usePersonalStore:{setState:patch=>Object.assign(personal,patch)},refreshPersonal:async()=>{}}}[name]??(()=>{throw Error('Unexpected import '+name);})()),Error,Date});
 const render=()=>{cursor=0;tree=exports.StudioCollaboration({onOpenMeeting:()=>opens.push('meeting'),onOpenWorkLog:()=>opens.push('worklog')});};render();
 return {actor,studio,calls,opens,personal,render,refreshes:()=>refreshes,all:()=>nodes(tree),dialog:()=>nodes(tree).find(n=>n.props.role==='dialog'),click:async name=>{const button=nodes(tree).find(n=>n.type==='button'&&(n.props['aria-label']===name||n.props.children===name));assert.ok(button,name);button.props.onClick();await new Promise(resolve=>setImmediate(resolve));render();}};
}
const results=[];async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name,error);}}
await check('실제 알림 컴포넌트: 최종 연장 승인만 개인 팝업으로 표시',()=>{assert.ok(screen().dialog());for(const n of [{...notice(),id:'request:r1'},{...notice(),meeting_id:'worklog:1'},{...notice(),read_at:'2026-10-14'}])assert.equal(screen({notifications:[n]}).dialog(),undefined);});
await check('계정 또는 초기 공유 세션 불일치에서는 이전 직원 승인 팝업 제외',()=>{assert.equal(screen({ready:false}).dialog(),undefined);assert.equal(screen({actorId:'other'}).dialog(),undefined);});
await check('확인은 해당 알림만 읽음 처리하고 같은 세션 재표시 방지',async()=>{const e=screen();await e.click('확인');assert.equal(e.dialog(),undefined);assert.deepEqual(JSON.parse(JSON.stringify(e.calls)),[['notifications/read','POST',{id:'extension-approved:r1'}]]);assert.equal(e.refreshes(),1);assert.equal(e.studio.notifications[0].read_at,null);});
await check('연장 요청 확인은 해당 프로젝트 요청 탭으로 연결',async()=>{const e=screen();await e.click('연장 요청 확인');assert.equal(e.personal.openExtension,'qa-project');assert.deepEqual(e.opens,['worklog']);assert.equal(e.dialog(),undefined);});
await check('이후 다른 연장 승인 및 계정 전환 시 개인 알림 독립',async()=>{const e=screen();await e.click('확인');e.studio.notifications.push(notice('r2'));e.render();assert.ok(e.dialog());e.actor.currentUser={id:'other'};e.render();assert.equal(e.dialog(),undefined);});
await check('읽음 실패는 원래 알림 보존 및 화면 오류 안내',async()=>{const e=screen({api:async()=>{throw Error('읽음 저장 실패');}});await e.click('확인');assert.equal(e.studio.notifications[0].read_at,null);assert.ok(e.all().some(n=>n.props.role==='alert'&&n.props.children==='읽음 저장 실패'));});
await check('읽음 응답 전에 계정 변경 시 이전 알림 오류 또는 갱신 제외',async()=>{let reject;const e=screen({api:()=>new Promise((_,r)=>{reject=r;})});await e.click('확인');e.actor.currentUser={id:'other'};reject(Error('이전 계정 실패'));await new Promise(resolve=>setImmediate(resolve));e.render();assert.equal(e.refreshes(),0);assert.equal(e.dialog(),undefined);assert.equal(e.all().filter(n=>n.props.role==='alert'&&String(n.props.children).includes('이전 계정 실패')).length,0);});
await check('팝업 닫기 버튼은 상단 우측에 있으며 읽음 처리',async()=>{const e=screen(),button=e.all().find(n=>n.props['aria-label']==='일정 연장 승인 안내 닫기');assert.ok(button.props.className.includes('right-3 top-3'));await e.click('일정 연장 승인 안내 닫기');assert.equal(e.dialog(),undefined);});
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify({results,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
