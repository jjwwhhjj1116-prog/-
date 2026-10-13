import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window={localStorage:globalThis.localStorage};
const realFetch=globalThis.fetch,results=[];
const before=process.argv.includes('--before');
const server=await createServer({plugins:before?[{name:'protected-before-account-race',enforce:'pre',load(id){const name=['usePersonalStore.ts','useWorkLogStore.ts'].find(file=>id.replaceAll('\\','/').endsWith('/src/store/'+file));if(name)return readFileSync(new URL('../../private-provisioning/qa-todo-leave-20261006/original/scheduler-web/src/store/'+name,import.meta.url),'utf8');}}]:[],server:{middlewareMode:true,hmr:false},appType:'custom'});
const user=id=>({id,name:'합성 계정 '+id,department:'마감팀',position:id==='u_12'?'실장':'프로'});
const log=(owner,id,revision=1,status='DRAFT')=>({id,userId:owner,date:'2026-10-06',department:'마감팀',items:[],overallNotes:'합성 보고',serverRevision:revision,approvalStatus:status});
const personal=id=>({leaves:[{id:'leave-'+id,user_id:id,start_date:'2026-10-06',end_date:'2026-10-06',kind:'연차',revision:1}],checks:[{day:'2026-10-06',task_id:'task-'+id,done:1}],worklogs:[log(id,'log-'+id)]});
function deferred(body){let release;const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),method:options?.method});if(calls.length>1)return Response.json(body);return new Promise(resolve=>{release=()=>resolve(Response.json(body));});};return {calls,release:()=>release()};}
async function changedRequest(promise){try{await promise;}catch(error){assert.match(error.message,/계정이 변경/);assert.match(error.message,/완료|처리/);}}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);process.exitCode=1;}}
try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts');
 const {useWorkLogStore:logs}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
 const {usePersonalStore:state,refreshPersonal}=await server.ssrLoadModule('/src/store/usePersonalStore.ts');
 const reset=actor=>{auth.setState({currentUser:actor?user(actor):null});logs.setState({workLogs:[],selectedWorkLogId:null});state.setState({leaves:[],checks:[],loaded:false,openDate:null});};
 await test('personal: 이전 계정 지연 응답은 새 계정 휴가·체크·일지를 덮지 않음',async()=>{
  reset('A');const pending=deferred(personal('A')),old=refreshPersonal();
  auth.setState({currentUser:user('B')});globalThis.fetch=async()=>Response.json(personal('B'));await refreshPersonal();pending.release();await old;
  assert.deepEqual(state.getState().leaves,personal('B').leaves);assert.deepEqual(state.getState().checks,personal('B').checks);assert.deepEqual(logs.getState().workLogs,personal('B').worklogs);
 });
 await test('personal: 로그인 계정 없으면 요청·메모리 갱신하지 않음',async()=>{
  reset(null);let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(personal('A'));};await refreshPersonal();
  assert.equal(calls,0);assert.deepEqual(state.getState().leaves,[]);assert.deepEqual(state.getState().checks,[]);assert.deepEqual(logs.getState().workLogs,[]);assert.equal(state.getState().loaded,false);
 });
 await test('personal: 동일 ID 재로그인에도 이전 로그인 응답을 반영하지 않음',async()=>{
  reset('A');const pending=deferred(personal('A')),old=refreshPersonal();auth.setState({currentUser:user('A')});pending.release();await old;
  assert.deepEqual(state.getState().leaves,[]);assert.deepEqual(state.getState().checks,[]);assert.deepEqual(logs.getState().workLogs,[]);assert.equal(state.getState().loaded,false);
 });
 await test('save: 계정 변경 후 기존 계정 저장 응답이 새 계정 메모리·선택값을 보존',async()=>{
  reset('A');const pending=deferred({log:log('A','saved-A',2)}),old=logs.getState().saveWorkLog(log('A','saved-A'));
  auth.setState({currentUser:user('B')});const own=log('B','saved-B');logs.setState({workLogs:[own],selectedWorkLogId:own.id});pending.release();await changedRequest(old);
  assert.deepEqual(logs.getState().workLogs,[own]);assert.equal(logs.getState().selectedWorkLogId,own.id);
 });
 await test('save: 로그아웃 후 저장 응답은 빈 메모리·선택 상태를 유지',async()=>{
  reset('A');const pending=deferred({log:log('A','saved-A',2)}),old=logs.getState().saveWorkLog(log('A','saved-A'));reset(null);pending.release();await changedRequest(old);
  assert.deepEqual(logs.getState().workLogs,[]);assert.equal(logs.getState().selectedWorkLogId,null);
 });
 await test('save: 동일 ID 재로그인 시 이전 로그인 저장 응답을 반영하지 않음',async()=>{
  reset('A');const pending=deferred({log:log('A','saved-A',2)}),old=logs.getState().saveWorkLog(log('A','saved-A'));auth.setState({currentUser:user('A')});pending.release();await changedRequest(old);
  assert.deepEqual(logs.getState().workLogs,[]);assert.equal(logs.getState().selectedWorkLogId,null);
 });
 await test('action: 계정 변경 후 같은 ID 최신 결재 revision을 지연 응답으로 되돌리지 않음',async()=>{
  reset('A');logs.setState({workLogs:[log('A','shared')]});const pending=deferred({log:log('A','shared',2,'SUBMITTED_LEADER')}),old=logs.getState().submitApprovalToLeader('shared');
  auth.setState({currentUser:user('u_12')});const latest=log('A','shared',3,'APPROVED_FINAL');logs.setState({workLogs:[latest],selectedWorkLogId:latest.id});pending.release();await changedRequest(old);
  assert.deepEqual(logs.getState().workLogs,[latest]);assert.equal(logs.getState().selectedWorkLogId,latest.id);
 });
 await test('action: 다른 계정의 다른 일지 ID 목록에 이전 계정 일지를 추가하지 않음',async()=>{
  reset('A');logs.setState({workLogs:[log('A','action-A')]});const pending=deferred({log:log('A','action-A',2,'SUBMITTED_LEADER')}),old=logs.getState().submitApprovalToLeader('action-A');
  auth.setState({currentUser:user('B')});const own=log('B','action-B');logs.setState({workLogs:[own],selectedWorkLogId:own.id});pending.release();await changedRequest(old);
  assert.deepEqual(logs.getState().workLogs,[own]);assert.equal(logs.getState().selectedWorkLogId,own.id);
 });
 await test('action: 로그아웃 후 처리 응답은 빈 일지 목록을 유지',async()=>{
  reset('A');logs.setState({workLogs:[log('A','action-A')]});const pending=deferred({log:log('A','action-A',2,'SUBMITTED_LEADER')}),old=logs.getState().submitApprovalToLeader('action-A');reset(null);pending.release();await changedRequest(old);assert.deepEqual(logs.getState().workLogs,[]);
 });
 await test('action: 동일 ID 재로그인 시 이전 로그인 처리 응답을 반영하지 않음',async()=>{
  reset('A');const original=log('A','action-A');logs.setState({workLogs:[original]});const pending=deferred({log:log('A','action-A',2,'SUBMITTED_LEADER')}),old=logs.getState().submitApprovalToLeader('action-A');auth.setState({currentUser:user('A')});pending.release();await changedRequest(old);assert.deepEqual(logs.getState().workLogs,[original]);
 });
 await test('save/action: 로그인 계정 없으면 요청 전에 거부',async()=>{
  reset(null);logs.setState({workLogs:[log('A','action-A')]});let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({log:log('A','action-A',2)});};
  await assert.rejects(logs.getState().saveWorkLog(log('A','saved-A')),/로그인/);await assert.rejects(logs.getState().submitApprovalToLeader('action-A'),/로그인/);assert.equal(calls,0);
 });
 await test('save: 동일 계정에서도 이미 반영한 더 최신 revision을 지연 응답이 덮지 않음',async()=>{
  reset('A');const pending=deferred({log:log('A','saved-A',2)}),old=logs.getState().saveWorkLog(log('A','saved-A'));const latest=log('A','saved-A',3,'SUBMITTED_LEADER');logs.setState({workLogs:[latest],selectedWorkLogId:latest.id});pending.release();
  await assert.rejects(old,error=>/최신/.test(error.message)&&/완료/.test(error.message));assert.deepEqual(logs.getState().workLogs,[latest]);assert.equal(logs.getState().selectedWorkLogId,latest.id);
 });
 await test('action: 동일 계정에서도 이미 반영한 더 최신 revision을 지연 응답이 덮지 않음',async()=>{
  reset('A');logs.setState({workLogs:[log('A','action-A')]});const pending=deferred({log:log('A','action-A',2,'SUBMITTED_LEADER')}),old=logs.getState().submitApprovalToLeader('action-A');const latest=log('A','action-A',3,'APPROVED_FINAL');logs.setState({workLogs:[latest]});pending.release();
  await assert.rejects(old,error=>/최신/.test(error.message)&&/처리/.test(error.message));assert.deepEqual(logs.getState().workLogs,[latest]);
 });
 await test('save: 같은 계정의 정상 저장은 서버 revision과 선택 일지 반영',async()=>{
  reset('A');const saved=log('A','saved-A',2);globalThis.fetch=async()=>Response.json({log:saved});await logs.getState().saveWorkLog(log('A','saved-A'));assert.deepEqual(logs.getState().workLogs,[saved]);assert.equal(logs.getState().selectedWorkLogId,saved.id);
 });
 await test('action: 같은 계정의 정상 상신은 서버 상태 반영',async()=>{
  reset('A');logs.setState({workLogs:[log('A','action-A')]});const submitted=log('A','action-A',2,'SUBMITTED_LEADER');globalThis.fetch=async()=>Response.json({log:submitted});await logs.getState().submitApprovalToLeader('action-A');assert.deepEqual(logs.getState().workLogs,[submitted]);
 });
 await test('save 실패: 서버 오류를 기존처럼 전달하고 메모리는 보존',async()=>{
  reset('A');const original=log('A','saved-A');logs.setState({workLogs:[original],selectedWorkLogId:original.id});globalThis.fetch=async()=>Response.json({error:'합성 저장 충돌'},{status:409});await assert.rejects(logs.getState().saveWorkLog(original),/합성 저장 충돌/);assert.deepEqual(logs.getState().workLogs,[original]);assert.equal(logs.getState().selectedWorkLogId,original.id);
 });
 await test('상신 연속 호출: 저장 중 계정 변경이면 새 계정의 추가 상신 요청을 중단',async()=>{
  reset('A');const pending=deferred({log:log('A','chain-A',2)}),old=logs.getState().saveWorkLog(log('A','chain-A')).then(()=>logs.getState().submitApprovalToLeader('chain-A'));
  auth.setState({currentUser:user('u_12')});logs.setState({workLogs:[log('A','chain-A',2)]});pending.release();
  await assert.rejects(old,error=>/계정이 변경/.test(error.message)&&/완료|처리/.test(error.message));assert.equal(pending.calls.length,1,'A 저장 성공 후 B 세션으로 추가 POST를 보내면 안 됨');
 });
 await test('상신 연속 호출: 같은 계정의 최신 revision 보존 중 과거 응답 후속 요청을 중단',async()=>{
  reset('A');const pending=deferred({log:log('A','chain-A',2)}),old=logs.getState().saveWorkLog(log('A','chain-A')).then(()=>logs.getState().submitApprovalToLeader('chain-A'));
  const latest=log('A','chain-A',3);logs.setState({workLogs:[latest],selectedWorkLogId:latest.id});pending.release();
  await assert.rejects(old,error=>/최신/.test(error.message)&&/완료/.test(error.message));assert.equal(pending.calls.length,1,'더 최신 메모리를 확인한 후 과거 저장 응답으로 후속 POST를 보내면 안 됨');assert.deepEqual(logs.getState().workLogs,[latest]);
 });
}finally{globalThis.fetch=realFetch;await server.close();if(process.argv[2]&&process.argv[2]!=='--before')writeFileSync(process.argv[2],JSON.stringify({kind:'ACTUAL_FUNCTIONS_SYNTHETIC_DEFERRED_FETCH',protectedOriginal:before,externalRequests:0,results},null,2)+'\n');}
