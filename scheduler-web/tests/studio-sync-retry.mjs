import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';

const web=fileURLToPath(new URL('../',import.meta.url));
const storage=new Map(),results=[];
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window={localStorage:globalThis.localStorage};
const real={fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
let repeat,stop;
globalThis.setInterval=fn=>{repeat=fn;return 1;};globalThis.clearInterval=()=>{};
const option=name=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const sourceOverrides=new Map([['src/store/useStudioStore.ts',option('--sync-source')],['src/store/usePersonalStore.ts',option('--personal-source')]].filter(([,path])=>path));
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand)(\/|$)/]},root:web,plugins:[nativeSsrPackages(new URL('../package.json',import.meta.url)),{name:'protected-sync-retry-sources',enforce:'pre',load(id){const path=[...sourceOverrides.keys()].find(path=>id.replaceAll('\\','/').endsWith('/'+path));if(path)return readFileSync(sourceOverrides.get(path),'utf8');}}],server:{middlewareMode:true,hmr:false},appType:'custom'});
const until=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.ok(predicate(),'Actual tick must reach expected state');};
const hash=path=>createHash('sha256').update(readFileSync(sourceOverrides.get(path)||new URL('../'+path,import.meta.url))).digest('hex');
const clone=value=>structuredClone(value);
const project=(version)=>({id:'qa114-project',code:'QA114',name:'합성 재수신 현장',department:'마감팀',pmId:'qa114',startDate:'2026-10-14',endDate:version===1?'2026-10-16':'2026-10-19',progress:35,status:'진행중',roles:{},subTasks:{}});
const journal=revision=>({id:'qa114-log',userId:'qa114',date:'2026-10-14',department:'마감팀',items:[],overallNotes:'합성 일지 버전 '+revision,serverRevision:revision,approvalStatus:'DRAFT'});
const personal=revision=>({leaves:[{id:'qa114-leave',user_id:'qa114',start_date:'2026-10-15',end_date:revision===1?'2026-10-15':'2026-10-16',kind:'연차',revision}],checks:[{day:'2026-10-14',task_id:'qa114-task',done:revision-1}],worklogs:[journal(revision)]});

try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts');
 const {useProjectStore:projects}=await server.ssrLoadModule('/src/store/useProjectStore.ts');
 const {usePersonalStore:personalState,refreshPersonal}=await server.ssrLoadModule('/src/store/usePersonalStore.ts');
 const {useWorkLogStore:logs}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
 const {startStudioSync,useStudioStore:studio,refreshStudioMeetings}=await server.ssrLoadModule('/src/store/useStudioStore.ts');
 for(const mode of ['PERSONAL_ONLY','PROJECT_AND_PERSONAL','MEETINGS_AND_INBOX']){
  const name={PERSONAL_ONLY:'개인 revision 변경 후 personal 503: 다음 tick에 동일 revision 재수신',PROJECT_AND_PERSONAL:'프로젝트 변경 먼저 반영·personal 실패: 동일 project/personal revision 재수신',MEETINGS_AND_INBOX:'회의록/알림 revision 변경 후 inbox 503: 다음 tick에 동일 revision 재수신'}[mode];
  let calls=[],failureRoute=null,revision=1;
  const actor={id:'qa114',name:'합성 직원 114',company:'컨코스트',department:'마감팀',originalDept:'마감팀',position:'프로',active:true,idPrefix:'qa114',role:'MEMBER'};
  const versions=()=>({projects:mode==='PROJECT_AND_PERSONAL'?revision:1,intake:1,meetings:mode==='MEETINGS_AND_INBOX'?revision:1,inbox:mode==='MEETINGS_AND_INBOX'?revision:1,directory:1,personal:mode==='MEETINGS_AND_INBOX'?1:revision});
  const body=path=>({session:{user:actor},changes:{versions:versions()},projects:{projects:[{project:project(mode==='PROJECT_AND_PERSONAL'?revision:1)}],archived:[],pendingIntake:[]},meetings:{meetings:[{id:'qa114-meeting',title:'합성 회의 버전 '+revision,serverRevision:revision}]},notifications:{notifications:[{id:'qa114-notice-'+revision,meeting_id:'qa114-meeting',message:'합성 알림 버전 '+revision,read_at:null}],unreadCount:revision},directory:{users:[actor]},personal:personal(mode==='MEETINGS_AND_INBOX'?1:revision)})[path];
  try{
   stop?.();storage.set('studio-legacy-import-v1:'+actor.id,'1');storage.delete('studio-outbox:'+actor.id);
   auth.setState({currentUser:actor});projects.setState({projects:[]});logs.setState({workLogs:[]});
   globalThis.fetch=async(url,options={})=>{
    assert.equal(options.method||'GET','GET','Read-only synthetic test');
    const path=String(url).split('/').at(-1);calls.push({path,revision});
    if(path===failureRoute){failureRoute=null;return Response.json({error:'합성 단회 수신 실패 '+path},{status:503});}
    const value=body(path);assert.ok(value,'Unexpected route '+path);return Response.json(value);
   };
   stop=startStudioSync(actor.id);await until(()=>studio.getState().ready);
   assert.deepEqual(logs.getState().workLogs,personal(1).worklogs);
   revision=2;failureRoute=mode==='MEETINGS_AND_INBOX'?'notifications':'personal';repeat();
   await until(()=>studio.getState().status.startsWith('합성 단회 수신 실패'));
   const afterFailure={studio:clone(studio.getState()),personal:clone(personalState.getState()),worklogs:clone(logs.getState().workLogs),projects:clone(projects.getState().projects)};
   assert.equal(afterFailure.studio.ready,false);assert.equal(afterFailure.studio.hasLoaded,true);
   assert.deepEqual(afterFailure.worklogs,personal(1).worklogs,'A failed read must preserve the last journal');
   assert.deepEqual(afterFailure.personal.leaves,personal(1).leaves,'A failed read must preserve the last leave');
   if(mode==='PROJECT_AND_PERSONAL')assert.deepEqual(afterFailure.projects,[project(2)],'Earlier successful project read stays visible');
   if(mode==='MEETINGS_AND_INBOX')assert.equal(afterFailure.studio.meetings[0].serverRevision,1,'Rejected parallel inbox read must not partially advance meetings');
   const retryStart=calls.length;repeat();await until(()=>studio.getState().ready);
   const retryCalls=calls.slice(retryStart);
   assert.ok(retryCalls.some(call=>call.path===(mode==='MEETINGS_AND_INBOX'?'notifications':'personal')),'Unchanged server revision must still retry the failed area');
   if(mode==='MEETINGS_AND_INBOX'){
    assert.equal(studio.getState().meetings[0].serverRevision,2);assert.equal(studio.getState().notifications[0].id,'qa114-notice-2');assert.equal(studio.getState().unreadCount,2);
   }else{
    assert.deepEqual(logs.getState().workLogs,personal(2).worklogs);assert.deepEqual(personalState.getState().leaves,personal(2).leaves);assert.deepEqual(personalState.getState().checks,personal(2).checks);
   }
   const stableStart=calls.length;repeat();await until(()=>calls.length>stableStart);await new Promise(resolve=>setTimeout(resolve,10));
   assert.deepEqual(calls.slice(stableStart).map(call=>call.path),['changes'],'Successfully consumed revision stops unnecessary area requests');
   results.push({name,status:'PASS',afterFailure:{ready:false,hasLoaded:true,projectEnd:afterFailure.projects[0]?.endDate,logRevision:afterFailure.worklogs[0]?.serverRevision},retryCalls:retryCalls.map(call=>call.path),versionsAtFailure:versions(),calls});
   console.log('PASS '+name);
  }catch(error){results.push({name,status:'FAIL',reason:error.stack,calls});console.log('FAIL '+name+': '+error.message);}
  finally{stop?.();stop=null;}
 }
 for(const area of ['personal','meetings'])for(const manualFails of [true,false]){
 const name=`tick ${area} 조회보다 최신 수동 조회가 ${manualFails?'실패':'성공'}: 이전 응답 무시 후 동일 revision 재확인`;
 let calls=[],revision=1,release=null,holdNext=false,failNext=false;
 const actor={id:'qa114',name:'합성 직원 114',department:'마감팀',position:'프로',active:true,idPrefix:'qa114',role:'MEMBER'};
 try{
  storage.set('studio-legacy-import-v1:'+actor.id,'1');storage.delete('studio-outbox:'+actor.id);auth.setState({currentUser:actor});projects.setState({projects:[]});logs.setState({workLogs:[]});
  globalThis.fetch=async(url,options={})=>{
   assert.equal(options.method||'GET','GET');const path=String(url).split('/').at(-1);calls.push(path);
   if(path===area&&failNext){failNext=false;return Response.json({error:'합성 최신 수동조회 실패'},{status:503});}
   const body={session:{user:actor},changes:{versions:{projects:1,intake:1,meetings:area==='meetings'?revision:1,inbox:area==='meetings'?revision:1,directory:1,personal:area==='personal'?revision:1}},projects:{projects:[{project:project(1)}],archived:[],pendingIntake:[]},meetings:{meetings:[{id:'qa114-meeting',serverRevision:revision}]},notifications:{notifications:[{id:'qa114-notice-'+revision}],unreadCount:revision},directory:{users:[actor]},personal:personal(area==='personal'?revision:1)}[path];assert.ok(body,'Unexpected route '+path);
   if(path===area&&holdNext){holdNext=false;const held=manualFails?body:area==='personal'?personal(1):{meetings:[{id:'qa114-meeting',serverRevision:1}]};return new Promise(resolve=>{release=()=>resolve(Response.json(held));});}
   return Response.json(body);
  };
  stop=startStudioSync(actor.id);await until(()=>studio.getState().ready);assert.deepEqual(logs.getState().workLogs,personal(1).worklogs);
  revision=2;holdNext=true;repeat();await until(()=>release!==null);failNext=manualFails;
  const manual=area==='personal'?refreshPersonal():refreshStudioMeetings();
  if(manualFails)await assert.rejects(manual,/합성 최신 수동조회 실패/);else await manual;
  release();await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(logs.getState().workLogs,personal(area==='personal'&&!manualFails?2:1).worklogs,'The stale tick result cannot replace the accepted manual snapshot');
  if(area==='meetings')assert.equal(studio.getState().meetings[0].serverRevision,manualFails?1:2);
  const retryStart=calls.length;repeat();await until(()=>calls.length>retryStart);await new Promise(resolve=>setTimeout(resolve,15));
  const evidence={manualFails,ready:studio.getState().ready,status:studio.getState().status,observedLogRevision:logs.getState().workLogs[0]?.serverRevision,observedMeetingRevision:studio.getState().meetings[0]?.serverRevision,unchangedServerRevision:2,retryCalls:calls.slice(retryStart)};
  if(manualFails)assert.ok(evidence.retryCalls.includes(area),'Superseded unsuccessful refresh must not consume the server revision');
  else assert.equal(studio.getState().ready,true,'Next tick must confirm a normal connection after a superseded successful manual read');
  if(area==='personal')assert.deepEqual(logs.getState().workLogs,personal(2).worklogs);else assert.equal(studio.getState().meetings[0].serverRevision,2);
  results.push({name,status:'PASS',evidence,calls});console.log('PASS '+name);
 }catch(error){results.push({name,status:'FAIL',reason:error.stack,evidence:{manualFails,ready:studio.getState().ready,status:studio.getState().status,observedLogRevision:logs.getState().workLogs[0]?.serverRevision,observedMeetingRevision:studio.getState().meetings[0]?.serverRevision,unchangedServerRevision:2,lastCalls:calls.slice(-4)},calls});console.log('FAIL '+name+': '+error.message);}
 finally{stop?.();stop=null;}
 }
}finally{stop?.();globalThis.fetch=real.fetch;globalThis.setInterval=real.setInterval;globalThis.clearInterval=real.clearInterval;await server.close();}
const report={kind:'ACTUAL_START_STUDIO_SYNC_AND_REFRESH_STORES_SYNTHETIC_TRANSPORT',mode:sourceOverrides.size?'protected-before':'current',externalRequests:0,operatingDataWrites:0,productWrites:0,sourceSHA256:{studio:hash('src/store/useStudioStore.ts'),personal:hash('src/store/usePersonalStore.ts')},passed:results.filter(result=>result.status==='PASS').length,failed:results.filter(result=>result.status==='FAIL').length,results};
const output=option('--output')||fileURLToPath(new URL('../test-results/studio-sync-retry.json',import.meta.url));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,output}));if(report.failed)process.exitCode=1;
