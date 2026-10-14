import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const before=process.argv.includes('--before');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/personal-refresh.json';
const source=new URL('../../'+(before?'private-provisioning/original-before-personal-refresh-20261006/':'')+'scheduler-web/src/store/usePersonalStore.ts',import.meta.url);
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
const realFetch=globalThis.fetch,results=[];
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand)(\/|$)/]},root:fileURLToPath(new URL('../',import.meta.url)),plugins:[nativeSsrPackages(),...(before?[{name:'protected-before-personal-refresh',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/store/usePersonalStore.ts'))return readFileSync(source,'utf8');}}]:[])],server:{middlewareMode:true,hmr:false},appType:'custom'});
const user=id=>({id,name:'합성 계정 '+id,department:'마감팀',position:id==='u_12'?'실장':'프로'});
const log=(id='log-A',revision=1,status='DRAFT',owner='A',text='수행 원문')=>({id,userId:owner,date:'2026-10-06',department:'마감팀',items:[{id:'item-'+id,todayTask:text,progress:37,tomorrowPlan:'익일 계획 원문'}],overallNotes:text,serverRevision:revision,approvalStatus:status,leaderReview:{approved:status==='APPROVED_FINAL'},chiefApproval:{approved:status==='APPROVED_FINAL'}});
const personal=(logs=[],label='latest',done=1)=>({leaves:[{id:'leave-'+label,user_id:'A',start_date:'2026-10-06',end_date:'2026-10-06',kind:'연차',revision:1}],checks:[{day:'2026-10-06',task_id:'task-A',done}],worklogs:logs});
function deferred(){const queue=[],calls=[];globalThis.fetch=(url,options)=>{calls.push({url:String(url),method:options?.method||'GET'});return new Promise(resolve=>queue.push((body,status=200)=>resolve(Response.json(body,{status}))));};return {calls,release:(index,body,status=200)=>{assert.ok(queue[index],'해당 요청이 대기해야 함');queue[index](body,status);}};}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.log('FAIL',name,error.message);}}
try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts');
 const {useWorkLogStore:logs}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
 const {usePersonalStore:state,refreshPersonal}=await server.ssrLoadModule('/src/store/usePersonalStore.ts');
 const reset=(actor='A',journals=[])=>{auth.setState({currentUser:actor?user(actor):null});logs.setState({workLogs:journals,selectedWorkLogId:journals[0]?.id||null});state.setState({leaves:[],checks:[],loaded:false,openDate:null,openWorkLogId:null,openExtension:null});};
 await test('정상 개인 갱신은 서버 일지·휴가·체크 반영, 화면 선택·열기 문맥 유지',async()=>{
  reset();state.setState({openDate:'2026-10-06',openWorkLogId:'log-A',openExtension:'project-A'});const data=personal([log()]);globalThis.fetch=async()=>Response.json(data);await refreshPersonal();assert.deepEqual(logs.getState().workLogs,data.worklogs);assert.deepEqual(state.getState().leaves,data.leaves);assert.deepEqual(state.getState().checks,data.checks);assert.equal(state.getState().loaded,true);assert.equal(state.getState().openWorkLogId,'log-A');assert.equal(state.getState().openExtension,'project-A');
 });
 await test('지연 GET r1 뒤 실제 saveWorkLog r2 성공 시 최신 본문·revision·선택을 되돌리지 않음',async()=>{
  const initial=log(),saved=log('log-A',2,'DRAFT','A','저장 성공 원문');reset('A',[initial]);const pending=deferred(),refresh=refreshPersonal(),save=logs.getState().saveWorkLog(initial);pending.release(1,{log:saved});await save;pending.release(0,personal([initial],'old'));await refresh;assert.deepEqual(logs.getState().workLogs,[saved]);assert.equal(logs.getState().selectedWorkLogId,saved.id);
 });
 await test('지연 GET r3 뒤 실제 최종 승인 r4 성공 시 승인 상태·서명·실적 보고 원문 보존',async()=>{
  const initial={...log('staff-log',3,'SUBMITTED_LEADER','staff'),leaderReview:{approved:true,name:'합성 팀장'}},approved={...log('staff-log',4,'APPROVED_FINAL','staff'),chiefApproval:{approved:true,name:'합성 실장',signedAt:'2026-10-06T00:00:00Z'}};reset('u_12',[initial]);const pending=deferred(),refresh=refreshPersonal(),approve=logs.getState().approveFinalByChief(initial.id);pending.release(1,{log:approved});await approve;pending.release(0,personal([initial],'old'));await refresh;assert.deepEqual(logs.getState().workLogs,[approved]);
 });
 await test('응답에 같은 ID 낮은 revision이 있으면 이미 가진 높은 서버 revision 보존',async()=>{
  const latest=log('log-A',5,'APPROVED_FINAL');reset('A',[latest]);globalThis.fetch=async()=>Response.json(personal([log('log-A',4,'SUBMITTED_LEADER')]));await refreshPersonal();assert.deepEqual(logs.getState().workLogs,[latest]);
 });
 await test('같은 revision의 DRAFT 최신 배정 재조정은 서버 본문을 반영',async()=>{
  const initial=log(),updated=log('log-A',1,'DRAFT','A','기간·배정 메모 재조정');reset('A',[initial]);globalThis.fetch=async()=>Response.json(personal([updated]));await refreshPersonal();assert.deepEqual(logs.getState().workLogs,[updated]);
 });
 await test('더 높은 revision의 서버 응답은 기존 낮은 상태를 정상 대체',async()=>{
  const updated=log('log-A',2,'SUBMITTED_LEADER');reset('A',[log()]);globalThis.fetch=async()=>Response.json(personal([updated]));await refreshPersonal();assert.deepEqual(logs.getState().workLogs,[updated]);
 });
 await test('동시 refresh 순서 역전: 최신 요청의 일지·휴가·체크를 과거 응답이 되돌리지 않음',async()=>{
  reset();const pending=deferred(),old=refreshPersonal(),fresh=refreshPersonal(),latest=personal([log('log-A',2)],'new',0);pending.release(1,latest);await fresh;pending.release(0,personal([log()],'old',1));await old;assert.deepEqual(state.getState().leaves,latest.leaves);assert.deepEqual(state.getState().checks,latest.checks);assert.deepEqual(logs.getState().workLogs,latest.worklogs);
 });
 await test('최신 삭제 응답을 반영한 뒤 오래된 GET은 삭제된 synced 일지를 부활시키지 않음',async()=>{
  reset('A',[log('log-A',5)]);const pending=deferred(),old=refreshPersonal(),fresh=refreshPersonal();pending.release(1,{leaves:[],checks:[],worklogs:[]});await fresh;pending.release(0,personal([log('log-A',5)],'old'));await old;assert.deepEqual(logs.getState().workLogs,[]);assert.deepEqual(state.getState().leaves,[]);assert.deepEqual(state.getState().checks,[]);
 });
 await test('최신 팀 가시성 제외는 높은 revision 타인 일지도 제거, 과거 응답으로 부활하지 않음',async()=>{
  const staff=log('staff-log',10,'APPROVED_FINAL','staff');reset('u_12',[staff]);const pending=deferred(),old=refreshPersonal(),fresh=refreshPersonal();pending.release(1,{leaves:[],checks:[],worklogs:[]});await fresh;pending.release(0,personal([staff],'old'));await old;assert.deepEqual(logs.getState().workLogs,[]);
 });
 await test('최신 단독 응답에서 빠진 synced 일지는 제거하고 본인 미동기화만 보존',async()=>{
  const own={...log('local-own',undefined),serverRevision:undefined},foreign={...log('local-other',undefined,'DRAFT','other'),serverRevision:undefined};reset('A',[log('deleted',20),log('revoked',30,'APPROVED_FINAL','staff'),own,foreign]);globalThis.fetch=async()=>Response.json({leaves:[],checks:[],worklogs:[]});await refreshPersonal();assert.deepEqual(logs.getState().workLogs,[own]);
 });
 await test('GET 대기 중 추가한 본인 unsynced 본문은 보존, 같은 ID 서버 기록은 중복 없이 우선',async()=>{
  reset();const pending=deferred(),refresh=refreshPersonal(),local={...log('local-own',undefined),serverRevision:undefined};logs.setState({workLogs:[local]});pending.release(0,personal([]));await refresh;assert.deepEqual(logs.getState().workLogs,[local]);globalThis.fetch=async()=>Response.json(personal([log('local-own',1)]));await refreshPersonal();assert.deepEqual(logs.getState().workLogs,[log('local-own',1)]);
 });
 await test('실제 DELETE 성공 뒤 대기 중이던 과거 GET은 삭제 일지를 다시 만들지 않음',async()=>{
  const initial=log();reset('A',[initial]);const pending=deferred(),refresh=refreshPersonal(),remove=logs.getState().deleteWorkLog(initial.id);pending.release(1,{ok:true});await remove;assert.deepEqual(logs.getState().workLogs,[]);pending.release(0,personal([initial],'old'));await refresh;assert.deepEqual(logs.getState().workLogs,[]);
 });
 await test('실제 메모리 API 첫 저장→GET snapshot→삭제 성공 조합에서도 이전 GET이 새 일지를 부활시키지 않음',async()=>{
  const {database}=await import('./d1.mjs'),{handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts');
  const {db,DB}=database(),actor=user('A'),token='synthetic-refresh-combination';
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(actor.id,actor.id,'A@example.invalid',actor.name,actor.department,actor.position,JSON.stringify(actor),'synthetic-unused','synthetic-unused');db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),actor.id,Date.now()+3600000);
  const api=(path,options={})=>handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method:options.method||'GET',headers:{Cookie:'studio_session='+token,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body}),{DB},async()=>{throw Error('Archive path is outside this test');});
  try{
   reset();let release;globalThis.fetch=(url,options)=>String(url).endsWith('/personal')?new Promise(resolve=>{release=body=>resolve(Response.json(body));}):api(String(url).replace('/api/collaboration/',''),options);
   const refresh=refreshPersonal(),initial={...log('created-and-deleted',undefined),serverRevision:undefined,items:[{id:'manual',todayTask:'실제 수행 원문',progress:37,status:'진행중',manualFields:['todayTask','progress','status']}]};
   await logs.getState().saveWorkLog(initial);assert.equal(logs.getState().workLogs[0].serverRevision,1);const snapshotResponse=await api('personal');assert.equal(snapshotResponse.status,200);const snapshot=await snapshotResponse.json();assert.equal(snapshot.worklogs.length,1);
   await logs.getState().deleteWorkLog(initial.id);assert.equal(db.prepare('SELECT removed FROM studio_worklogs WHERE id=?').get(initial.id).removed,1);assert.deepEqual(logs.getState().workLogs,[]);release(snapshot);await refresh;assert.deepEqual(logs.getState().workLogs,[]);
  }finally{db.close();}
 });
 await test('첫 중앙 저장 성공 뒤 저장 전 빈 GET이 도착해도 새 본인 서버 일지는 보존',async()=>{
  reset();const pending=deferred(),refresh=refreshPersonal(),saved=log('newly-saved',1),save=logs.getState().saveWorkLog({...saved,serverRevision:undefined});pending.release(1,{log:saved});await save;pending.release(0,personal([],'old'));await refresh;assert.deepEqual(logs.getState().workLogs,[saved]);
 });
 await test('동일 ID 재로그인 이전 응답은 개인 상태와 일지를 오염시키지 않음',async()=>{
  reset();const pending=deferred(),refresh=refreshPersonal();auth.setState({currentUser:user('A')});pending.release(0,personal([log()]));await refresh;assert.deepEqual(logs.getState().workLogs,[]);assert.deepEqual(state.getState().leaves,[]);assert.equal(state.getState().loaded,false);
 });
 await test('로그인 없으면 네트워크 요청 없이 상태 보존',async()=>{
  reset(null);let count=0;globalThis.fetch=async()=>{count++;return Response.json(personal([log()]));};await refreshPersonal();assert.equal(count,0);assert.deepEqual(logs.getState().workLogs,[]);assert.equal(state.getState().loaded,false);
 });
 await test('최신 요청 실패 뒤 과거 대기 GET을 반영하지 않고 마지막 유효 상태를 보존',async()=>{
  const cached=log('log-A',3);reset('A',[cached]);const previous=personal([cached],'cached');state.setState({leaves:previous.leaves,checks:previous.checks,loaded:true});const pending=deferred(),old=refreshPersonal(),fresh=refreshPersonal();pending.release(1,{error:'합성 일시 오류'},503);await assert.rejects(fresh,/합성 일시 오류/);pending.release(0,personal([log()],'old',0));await old;assert.deepEqual(logs.getState().workLogs,[cached]);assert.deepEqual(state.getState().leaves,previous.leaves);assert.deepEqual(state.getState().checks,previous.checks);
 });
 await test('최신 성공 뒤 과거 요청 오류는 늦은 오류로 전파하지 않고 최신 개인 상태를 보존',async()=>{
  reset();const pending=deferred(),old=refreshPersonal(),fresh=refreshPersonal(),latest=personal([log('log-A',2)],'latest',0);pending.release(1,latest);await fresh;pending.release(0,{error:'과거 요청 실패'},503);await old;assert.deepEqual(logs.getState().workLogs,latest.worklogs);assert.deepEqual(state.getState().leaves,latest.leaves);assert.deepEqual(state.getState().checks,latest.checks);
 });
 await test('계정 전환 뒤 이전 계정 요청 오류는 새 계정 성공 상태에 전파하지 않음',async()=>{
  reset();const pending=deferred(),old=refreshPersonal();auth.setState({currentUser:user('B')});const fresh=refreshPersonal(),latest=personal([log('log-B',1,'DRAFT','B')],'B');pending.release(1,latest);await fresh;pending.release(0,{error:'이전 계정 요청 실패'},401);await old;assert.deepEqual(logs.getState().workLogs,latest.worklogs);assert.deepEqual(state.getState().leaves,latest.leaves);
 });
 await test('현재 최신 요청의 권한 오류는 기존 API 실패로 전파하고 이전 유효 상태를 보존',async()=>{
  const previous=log();reset('A',[previous]);globalThis.fetch=async()=>Response.json({error:'현재 요청 권한 오류'},{status:403});await assert.rejects(refreshPersonal(),error=>error.status===403&&error.message==='현재 요청 권한 오류');assert.deepEqual(logs.getState().workLogs,[previous]);assert.equal(state.getState().loaded,false);
 });
}finally{globalThis.fetch=realFetch;await server.close();}
const report={kind:'ACTUAL_STORES_SYNTHETIC_DEFERRED_FETCH',mode:before?'protected-before':'current',externalRequests:0,sourceSHA256:createHash('sha256').update(readFileSync(source)).digest('hex'),passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:report.mode,passed:report.passed,failed:report.failed,output}));if(report.failed)process.exitCode=1;
