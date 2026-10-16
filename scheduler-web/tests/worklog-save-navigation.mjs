import assert from 'node:assert/strict';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const before=process.argv.includes('--before');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/worklog-save-navigation.json';
const source=new URL('../../'+(before?'private-provisioning/original-before-worklog-delete-20261006/':'')+'scheduler-web/src/store/useWorkLogStore.ts',import.meta.url);
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
const realFetch=globalThis.fetch,results=[];
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),plugins:before?[{name:'protected-before-save-navigation',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/store/useWorkLogStore.ts'))return readFileSync(source,'utf8');}}]:[],server:{middlewareMode:true,hmr:false},appType:'custom'});
const user=id=>({id,name:'합성 '+id,department:'마감팀',position:id==='u_12'?'실장':'프로'});
const log=(id='own-A',revision=1,owner='u_12',status='DRAFT',text='원 수행 본문')=>({id,userId:owner,date:'2026-10-06',department:'마감팀',reportMode:'DAILY',items:[{id:'item-'+id,todayTask:text,progress:37,status:'진행중',tomorrowPlan:'익일 계획',manualFields:['todayTask','progress','status','tomorrowPlan']}],overallNotes:text,serverRevision:revision,approvalStatus:status,authorSignature:{signed:status!=='DRAFT',name:owner},leaderReview:{approved:false,name:''},chiefApproval:{approved:false,name:''}});
function delayed(body,status=200){let release;const calls=[];globalThis.fetch=(url,options)=>{calls.push({url:String(url),method:options?.method,body:JSON.parse(options.body)});return new Promise(resolve=>{release=()=>resolve(Response.json(body,{status}));});};return {calls,release:()=>{assert.ok(release);release();}};}
async function check(name,fn){try{const observed=await fn();results.push({name,status:'PASS',...(observed?{observed}:{})});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.log('FAIL',name,error.message);}}
try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts'),{useWorkLogStore:logs}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
 const own=log(),other=log('staff-B',5,'staff','SUBMITTED_LEADER','타인 B 수행 본문'),saved=log('own-A',2,'u_12','DRAFT','A 저장된 수행 본문');
 const reset=(selection='own-A',journals=[own,other])=>{auth.setState({currentUser:user('u_12')});logs.setState({workLogs:structuredClone(journals),selectedWorkLogId:selection});};
 await check('정상 A 재저장은 응답 본문·revision과 A 선택을 반영',async()=>{
  reset();globalThis.fetch=async()=>Response.json({log:saved});await logs.getState().saveWorkLog(own);assert.equal(logs.getState().selectedWorkLogId,own.id);assert.deepEqual(logs.getState().workLogs,[saved,other]);
 });
 await check('null 선택의 본인 A fallback 저장은 선택 변화 없으면 A를 선택',async()=>{
  reset(null);globalThis.fetch=async()=>Response.json({log:saved});await logs.getState().saveWorkLog(own);assert.equal(logs.getState().selectedWorkLogId,own.id);
 });
 await check('정상 최초 저장 null→null은 새 서버 일지를 자동 선택',async()=>{
  reset(null,[]);const first={...own,serverRevision:undefined};globalThis.fetch=async()=>Response.json({log:own});await logs.getState().saveWorkLog(first);assert.equal(logs.getState().selectedWorkLogId,own.id);assert.deepEqual(logs.getState().workLogs,[own]);
 });
 await check('A 저장 중 같은날 B 이력 선택: A 응답은 저장만 반영하고 B 선택·본문은 유지',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own);logs.getState().setSelectedWorkLogId(other.id);pending.release();await save;assert.equal(logs.getState().selectedWorkLogId,other.id);assert.deepEqual(logs.getState().workLogs,[saved,other]);assert.deepEqual(logs.getState().workLogs.find(w=>w.id===other.id),other);assert.equal(pending.calls.length,1);
 });
 await check('본인 A fallback(null) 저장 중 같은날 B 이력 열기: late A가 B 선택을 되돌리지 않음',async()=>{
  reset(null);const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own);logs.getState().setSelectedWorkLogId(other.id);pending.release();await save;assert.equal(logs.getState().selectedWorkLogId,other.id);assert.deepEqual(logs.getState().workLogs,[saved,other]);
 });
 await check('요청 중 명시적으로 null로 바뀐 선택은 저장 성공 뒤에도 null 보존(스토어 경계)',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own);logs.getState().setSelectedWorkLogId(null);pending.release();await save;assert.equal(logs.getState().selectedWorkLogId,null);assert.deepEqual(logs.getState().workLogs,[saved,other]);
 });
 await check('같은 선택 ID의 새 일지 객체는 화면 이동으로 판단하지 않고 저장을 정상 반영',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own);logs.setState({workLogs:[{...own,overallNotes:'같은 ID 새 객체'},other]});pending.release();await save;assert.equal(logs.getState().selectedWorkLogId,own.id);assert.deepEqual(logs.getState().workLogs,[saved,other]);
 });
 await check('이력 B를 열었다가 A로 돌아온 경우 응답 시 A 선택과 정상 저장 유지',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own);logs.getState().setSelectedWorkLogId(other.id);logs.getState().setSelectedWorkLogId(own.id);pending.release();await save;assert.equal(logs.getState().selectedWorkLogId,own.id);assert.deepEqual(logs.getState().workLogs,[saved,other]);
 });
 for(const [label,next]of [['다른 계정',user('other-user')],['동일 ID 재로그인',user('u_12')],['로그아웃',null]])await check('기존 actor guard: '+label+' 뒤 이전 저장은 새 일지·선택을 오염시키지 않음',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own),newLog=log('new-selection',1,next?.id||'u_12');auth.setState({currentUser:next});logs.setState({workLogs:[newLog],selectedWorkLogId:newLog.id});pending.release();await assert.rejects(save,/계정이 변경/);assert.deepEqual(logs.getState().workLogs,[newLog]);assert.equal(logs.getState().selectedWorkLogId,newLog.id);
 });
 await check('기존 revision guard: 최신 r3·B 선택은 늦은 저장 r2로 덮지 않음',async()=>{
  reset();const pending=delayed({log:saved}),save=logs.getState().saveWorkLog(own),newest=log('own-A',3,'u_12','SUBMITTED_LEADER');logs.setState({workLogs:[newest,other],selectedWorkLogId:other.id});pending.release();await assert.rejects(save,/최신/);assert.deepEqual(logs.getState().workLogs,[newest,other]);assert.equal(logs.getState().selectedWorkLogId,other.id);
 });
 await check('현재 API 저장 실패는 기존처럼 전달하고 이동한 B 선택·일지를 보존',async()=>{
  reset();const pending=delayed({error:'합성 저장 충돌'},409),save=logs.getState().saveWorkLog(own);logs.getState().setSelectedWorkLogId(other.id);pending.release();await assert.rejects(save,error=>error.status===409&&error.message==='합성 저장 충돌');assert.deepEqual(logs.getState().workLogs,[own,other]);assert.equal(logs.getState().selectedWorkLogId,other.id);
 });
 await check('실제 메모리 API: 관리자 own A PUT200 보류→같은날 타인 B 선택→late A r2 저장·B 원문 유지',async()=>{
  const {database}=await import('./d1.mjs'),{handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts'),{db,DB}=database(),cookies=new Map(),observed=[];
  for(const id of ['u_12','u_13','staff']){const profile=user(id),token='synthetic-save-navigation-'+id;db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,id+'@example.invalid',profile.name,profile.department,profile.position,JSON.stringify(profile),'synthetic-unused','synthetic-unused');db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),id,Date.now()+3600000);cookies.set(id,'studio_session='+token);}
  const api=async(actor,path,method='GET',body)=>{const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{Cookie:cookies.get(actor),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB},async()=>{throw Error('Archive path is outside this test');});observed.push({actor,path,method,status:response.status});return response;};
  try{
   const ownInput={...own,serverRevision:undefined},staffInput={...other,serverRevision:undefined,approvalStatus:'DRAFT'};
   let response=await api('u_12','worklogs/own-A','PUT',{log:ownInput});assert.equal(response.status,200);const a=(await response.json()).log;response=await api('staff','worklogs/staff-B','PUT',{log:staffInput});assert.equal(response.status,200);const draftB=(await response.json()).log;response=await api('staff','worklogs/staff-B/submit','POST',{revision:draftB.serverRevision});assert.equal(response.status,200);const b=(await response.json()).log,beforeB=db.prepare('SELECT * FROM studio_worklogs WHERE id=?').get(b.id);
   reset(null,[a,b]);let release,committed;const ready=new Promise(resolve=>{committed=resolve;});globalThis.fetch=async(url,options)=>{const r=await api('u_12',String(url).replace('/api/collaboration/',''),options.method,JSON.parse(options.body));committed(r.status);return new Promise(resolve=>{release=()=>resolve(r);});};
   const edited={...a,overallNotes:'A 정상 저장 입력'},save=logs.getState().saveWorkLog(edited);assert.equal(await ready,200);assert.equal(db.prepare('SELECT revision FROM studio_worklogs WHERE id=?').get(a.id).revision,2);logs.getState().setSelectedWorkLogId(b.id);release();await save;
   assert.equal(logs.getState().selectedWorkLogId,b.id);assert.equal(logs.getState().workLogs.find(w=>w.id===a.id).serverRevision,2);assert.equal(logs.getState().workLogs.find(w=>w.id===a.id).overallNotes,edited.overallNotes);assert.deepEqual(logs.getState().workLogs.find(w=>w.id===b.id),b);assert.deepEqual(db.prepare('SELECT * FROM studio_worklogs WHERE id=?').get(b.id),beforeB);return observed;
  }finally{db.close();}
 });
}finally{globalThis.fetch=realFetch;await server.close();}
const report={kind:'ACTUAL_STORE_SYNTHETIC_DELAYED_FETCH_WITH_MEMORY_API',mode:before?'protected-before':'current',externalRequests:0,sourceSHA256:createHash('sha256').update(readFileSync(source)).digest('hex'),passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:report.mode,passed:report.passed,failed:report.failed,output}));if(report.failed)process.exitCode=1;
