import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {isScheduleAdmin} from '../src/utils/schedulePermissions.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),source=readFileSync(new URL('../src/components/AutomaticWorklogSync.tsx',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const flush=async()=>{for(let n=0;n<6;n++)await Promise.resolve();};
const user=id=>({id,department:'마감팀',role:'USER'});
function engine({actor=user('a'),ready=true,hidden=false,response=()=>Promise.resolve({conflicts:0})}={}){
 const state={actor,ready,hidden},timers=new Map(),listeners=new Set(),calls=[],exported={};let now=0,id=0,effect,cleanup;
 const auth=Object.assign(select=>select({currentUser:state.actor}),{getState:()=>({currentUser:state.actor})});
 const document={get hidden(){return state.hidden;},addEventListener(name,fn){assert.equal(name,'visibilitychange');listeners.add(fn);},removeEventListener(name,fn){listeners.delete(fn);}};
 runInNewContext(compiled,{exports:exported,document,Date:{now:()=>now},setTimeout(fn,delay){const key=++id;timers.set(key,{fn,at:now+delay,delay});return key;},clearTimeout(key){timers.delete(key);},require:name=>{
  if(name==='react')return {useEffect:fn=>{effect=fn;}};
  if(name==='../store/useAuthStore')return {useAuthStore:auth};
  if(name==='../store/useStudioStore')return {useStudioStore:()=>({ready:state.ready,actorId:state.actor?.id})};
  if(name==='../services/studioApi')return {studioApi(...args){calls.push({actorId:state.actor?.id,args});return response(calls.length);}};
  if(name==='../utils/schedulePermissions')return {isScheduleAdmin};
  throw Error('Unexpected dependency '+name);
 }});
 const render=()=>{assert.equal(exported.AutomaticWorklogSync(),null);cleanup=effect?.();};
 render();
 const advance=async after=>{const end=now+after;let iterations=0;while([...timers.values()].some(timer=>timer.at<=end)){assert.ok(++iterations<100);const [key,timer]=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(key);now=timer.at;timer.fn();await flush();}now=end;await flush();};
 return {state,calls,timers,listeners,render,advance,async visible(value){state.hidden=!value;for(const fn of listeners)fn();await flush();},async actor(value){cleanup?.();state.actor=value;render();await flush();},async ready(value){cleanup?.();state.ready=value;render();await flush();},dispose(){cleanup?.();},nextDelay:()=>[...timers.values()][0]?.delay};
}
const results=[];
async function test(name,fn){try{results.push({name,status:'PASS',observed:await fn()});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.error('FAIL',name,error.message);}}
await test('실제 컴포넌트: 무 UI·로그인 후 입력 없는 POST·60초마다 실행',async()=>{const q=engine();await flush();assert.equal(q.calls.length,1);assert.deepEqual(q.calls[0].args,['automatic-worklogs/sync','POST']);assert.equal(q.nextDelay(),60000);await q.advance(59999);assert.equal(q.calls.length,1);await q.advance(1);assert.equal(q.calls.length,2);q.dispose();assert.equal(q.timers.size,0);assert.equal(q.listeners.size,0);return {calls:2};});
await test('미로그인·공유 준비 전이면 호출 없음',async()=>{for(const options of [{actor:null},{ready:false}]){const q=engine(options);await flush();assert.equal(q.calls.length,0);assert.equal(q.timers.size,0);q.dispose();}return {calls:0};});
await test('경영지원·경영진 비작업팀 MEMBER는 자동 POST·timer·listener 없음',async()=>{for(const department of ['경영지원팀','경영진','개발 TF']){const q=engine({actor:{...user('support'),department,role:'MEMBER'}});await flush();assert.equal(q.calls.length,0);assert.equal(q.timers.size,0);assert.equal(q.listeners.size,0);q.dispose();}return {calls:0};});
await test('개발 TF 진짜 관리자는 기존 권한 유틸로 전체 자동 동기화 요청 유지',async()=>{const q=engine({actor:{id:'admin',department:'개발 TF',role:'ADMIN',email:'yjw@con-cost.com',active:true}});await flush();assert.equal(q.calls.length,1);assert.deepEqual(q.calls[0].args,['automatic-worklogs/sync','POST']);assert.equal(q.nextDelay(),60000);q.dispose();return {calls:1};});
await test('hidden에서도 최초 한 번·5분 간격으로 실행하여 다른 프로그램 작업 중 보고 유지',async()=>{const q=engine({hidden:true});await flush();assert.equal(q.calls.length,1);assert.equal(q.nextDelay(),300000);await q.advance(299999);assert.equal(q.calls.length,1);await q.advance(1);assert.equal(q.calls.length,2);q.dispose();return {calls:2};});
await test('탭 숨기면 5분 주기·다시 표시하면 즉시 실행 후 60초 복구',async()=>{const q=engine();await flush();await q.visible(false);assert.equal(q.nextDelay(),300000);await q.advance(30000);assert.equal(q.calls.length,1);await q.visible(true);assert.equal(q.calls.length,2);assert.equal(q.nextDelay(),60000);await q.advance(60000);assert.equal(q.calls.length,3);q.dispose();return {calls:3};});
await test('요청 미완료 중 visibility 반복도 중복 호출 없음',async()=>{let resolve;const pending=new Promise(done=>{resolve=done;}),q=engine({response:()=>pending});await q.visible(false);await q.visible(true);await q.visible(false);await q.visible(true);assert.equal(q.calls.length,1);resolve({});await flush();await q.advance(60000);assert.equal(q.calls.length,2);q.dispose();return {calls:2};});
await test('409·통신 오류는 120→240초 backoff·visibility 반복에도 폭주 없이 성공 후 60초 복구',async()=>{const q=engine({response:n=>n<=2?Promise.reject(Object.assign(Error('Synthetic conflict'),{status:409})):Promise.resolve({})});await flush();assert.equal(q.nextDelay(),120000);await q.visible(true);assert.equal(q.calls.length,1);await q.advance(120000);assert.equal(q.calls.length,2);assert.equal(q.nextDelay(),240000);await q.advance(240000);assert.equal(q.calls.length,3);assert.equal(q.nextDelay(),60000);q.dispose();return {calls:3};});
await test('계정 전환은 이전 결과 후속 처리 차단·이전 요청과 중복 없이 새 직원 재개',async()=>{let resolve;const pending=new Promise(done=>{resolve=done;}),q=engine({response:n=>n===1?pending:Promise.resolve({})});await q.actor(user('b'));assert.equal(q.calls.length,1);resolve({});await flush();assert.equal(q.calls.length,1);await q.advance(60000);assert.equal(q.calls.length,2);assert.equal(q.calls[1].actorId,'b');await q.actor(null);await q.advance(180000);assert.equal(q.calls.length,2);assert.equal(q.listeners.size,0);return {calls:2};});
await test('대기 요청 중 언마운트는 timer/listener 정리·응답 후 재실행 없음',async()=>{let resolve;const q=engine({response:()=>new Promise(done=>{resolve=done;})});q.dispose();resolve({});await flush();await q.advance(600000);assert.equal(q.calls.length,1);assert.equal(q.timers.size,0);assert.equal(q.listeners.size,0);return {calls:1};});
const output=process.argv.find(arg=>arg.startsWith('--output='));if(output)writeFileSync(output.slice(9),JSON.stringify({kind:'ACTUAL_AUTOMATIC_WORKLOG_SYNC_COMPONENT_TIMER_TEST',results,externalRequests:0,productionWrites:0},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
