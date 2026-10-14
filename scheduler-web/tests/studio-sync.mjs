import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {readFileSync} from 'node:fs';
import {checkMeetingFileContext} from './meeting-file-context.mjs';
const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};globalThis.window={localStorage};
data.set('concost_daily_worklogs_v2',JSON.stringify([{id:'other-local-draft',userId:'other',department:'마감팀'},{id:'my-local-draft',userId:'qa',department:'마감팀'}]));
const syncSource=process.argv.find(arg=>arg.startsWith('--sync-source='))?.slice('--sync-source='.length),onlyConflictSession=process.argv.includes('--only-conflict-session'),onlyMeetingRefresh=process.argv.includes('--only-meeting-refresh');
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand)(\/|$)/]},plugins:[nativeSsrPackages(new URL('../package.json',import.meta.url)),...(syncSource?[{name:'protected-conflict-session',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/store/useStudioStore.ts'))return readFileSync(syncSource,'utf8');}}]:[])],server:{middlewareMode:true,hmr:false},appType:'custom'});
const realInterval=globalThis.setInterval,realClear=globalThis.clearInterval,realFetch=globalThis.fetch;
let repeat,stopped=false,fail=true,failUpdates=false,calls=[],releasePost,directoryRevision=1;
let directoryUsers=[{id:'new-staff',name:'신규 배정 직원',company:'컨코스트',department:'마감팀',originalDept:'마감팀',position:'선임',idPrefix:'new_staff',active:true}];
globalThis.setInterval=fn=>{repeat=fn;return 123;};globalThis.clearInterval=()=>{stopped=true;};
const user={id:'qa',name:'검수',department:'마감팀',position:'실장'};
globalThis.fetch=async(url,options={})=>{const path=String(url).split('/').at(-1);calls.push(path);if(path==='session'&&fail||path==='changes'&&failUpdates)return Response.json({error:'temporary outage'},{status:503});if(path==='projects'&&options.method==='POST')return new Promise(resolve=>{releasePost=()=>resolve(Response.json({project:JSON.parse(options.body).project}));});const body={session:{user},changes:{versions:{projects:1,meetings:1,inbox:1,directory:directoryRevision,personal:1}},projects:{projects:[],archived:[]},meetings:{meetings:[]},notifications:{notifications:[],unreadCount:0},directory:{users:[user,...directoryUsers]},personal:{leaves:[],checks:[],worklogs:[]}}[path];assert.ok(body,`Unexpected route ${path}`);return Response.json(body);};
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));};
let stop;
try{
 const {useAuthStore}=await server.ssrLoadModule('/src/store/useAuthStore.ts');const {useProjectStore}=await server.ssrLoadModule('/src/store/useProjectStore.ts');const {useWorkLogStore}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts');const {startStudioSync,useStudioStore,waitForSchedulePublished,resolveScheduleConflict,refreshStudioMeetings}=await server.ssrLoadModule('/src/store/useStudioStore.ts');
 if(!onlyConflictSession&&!onlyMeetingRefresh){
 const stale={id:'stale-local',code:'QA-OLD',name:'중앙에 없는 예전 일정',department:'마감팀',pmId:'',startDate:'2026-09-01',endDate:'2026-09-30',progress:0,status:'진행중',roles:{},subTasks:{}};
 data.set('studio-legacy-import-v1:'+user.id,'1');
 useAuthStore.setState({currentUser:user});useProjectStore.setState({projects:[stale]});stop=startStudioSync(user.id);await settle();
 assert.deepEqual(useWorkLogStore.getState().workLogs.map(log=>log.id),['my-local-draft'],'연결이 실패해 로컬 보기로 전환해도 다른 계정 초안이 없어야 한다');
 assert.ok(data.get('concost_daily_worklogs_v2')?.includes('other-local-draft'),'기존 PC 원본 백업은 유지한다');
 assert.equal(useStudioStore.getState().actorId,user.id);
 assert.equal(useStudioStore.getState().ready,false);assert.equal(useStudioStore.getState().hasLoaded,false);assert.equal(calls.includes('projects'),false,'Session verification must precede data requests');assert.equal(typeof repeat,'function','Initial connection failure must retain retry timer');
 const oldPeople=structuredClone(useProjectStore.getState().personnel);
 fail=false;await repeat();await settle();assert.equal(useStudioStore.getState().ready,true);assert.equal(useStudioStore.getState().hasLoaded,true);assert.ok(calls.includes('personal'));assert.match(useStudioStore.getState().status,/중앙 공유 연결/);
 assert.equal(useProjectStore.getState().personnel.find(p=>p.id==='new-staff')?.name,'신규 배정 직원 선임','중앙에서 등록한 신규 직원도 PM/출력 명부에 자동 반영되어야 한다');
 directoryUsers=[{...directoryUsers[0],name:'변경된 직원',position:'책임',active:false}];directoryRevision++;await repeat();await settle();
 assert.equal(useProjectStore.getState().personnel.find(p=>p.id==='new-staff')?.name,'변경된 직원 책임','직급 변경과 비활성화 후에도 기존 일정의 표시 이름을 보존한다');
 for(const person of oldPeople)assert.ok(useProjectStore.getState().personnel.some(p=>p.id===person.id),'기존 한국 직원과 베트남 팀의 원본 배정 ID를 보존한다');
 assert.deepEqual(useWorkLogStore.getState().workLogs.map(log=>log.id),['my-local-draft'],'다른 계정의 미전송 일지는 현재 계정 화면에서 제외해야 한다');
 assert.equal(useProjectStore.getState().projects.length,0,'중앙에 없고 전송 대기도 아닌 오래된 로컬 일정은 표시하지 않아야 한다');
 assert.ok(data.get('studio-legacy-project-backup-v1')?.includes(stale.id),'기존 PC 백업은 유지해야 한다');
 const imported={id:'legacy-qa',code:'QA-LEGACY',name:'검수 이관',department:'마감팀',pmId:'qa',startDate:'2026-09-01',endDate:'2026-09-30',progress:0,status:'진행중',roles:{},subTasks:{}};
 useProjectStore.getState().importProjects([imported],true);
 let acknowledged=false;const confirmation=waitForSchedulePublished([imported.id],3000).then(()=>{acknowledged=true;});
 await settle();assert.equal(useStudioStore.getState().pending,1);assert.equal(acknowledged,false,'성공 표시는 서버 응답 전에는 불가');assert.equal(typeof releasePost,'function');
 releasePost();await confirmation;await settle();assert.equal(acknowledged,true);assert.equal(useStudioStore.getState().pending,0);
 failUpdates=true;await repeat();await settle();assert.equal(useStudioStore.getState().ready,false,'연결 실패 후 공유 연결 표시를 유지하면 안 된다');assert.equal(useStudioStore.getState().hasLoaded,true,'마지막으로 확인한 일정을 오프라인에 유지한다');
 failUpdates=false;await repeat();await settle();assert.equal(useStudioStore.getState().ready,true,'재연결되면 공유 상태가 복구되어야 한다');
 stop();stop=null;assert.equal(useStudioStore.getState().actorId,null);assert.equal(useStudioStore.getState().hasLoaded,false);const count=calls.length;await repeat();assert.equal(calls.length,count,'Stopped account must not issue new requests');assert.equal(stopped,true);
 assert.equal(useWorkLogStore.getState().workLogs.length,0,'로그아웃 직후 이전 계정 일지는 메모리에서 지운다');
 data.set('studio-legacy-import-v1:other','1');useAuthStore.setState({currentUser:{...user,id:'other'}});
 const stopOther=startStudioSync('other');assert.deepEqual(useWorkLogStore.getState().workLogs.map(log=>log.id),['other-local-draft'],'다시 로그인한 본인은 보존된 자신의 PC 초안을 볼 수 있어야 한다');stopOther();
 console.log('PASS initial/later outage -> recovery, Excel waits for server save, stop prevents further requests');
 }
 const until=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.ok(condition(),'Expected asynchronous sync state');};
 const raceProject=()=>({id:'qa-session-project',code:'QA-SESSION',name:'합성 세션 기간',department:'마감팀',pmId:'master-pm',startDate:'2026-10-06',endDate:'2026-10-16',progress:35,status:'진행중',roles:{},subTasks:{내부:{roleName:'내부',personId:'worker',personIds:['worker'],startDate:'2026-10-06',endDate:'2026-10-08',progress:35,status:'진행중',memo:'원 공종 메모',legacyAllocationId:'retained',allocations:[{id:'retained',personIds:['worker'],startDate:'2026-10-06',endDate:'2026-10-08',memo:'원 구간 메모'}]}}});
 const changeEnd=value=>{const p=useProjectStore.getState().projects[0];useProjectStore.getState().updateSubTask(p.id,'내부',{allocations:p.subTasks.내부.allocations.map(a=>({...a,endDate:value}))});};
 const snapshot=id=>({projects:structuredClone(useProjectStore.getState().projects),outbox:data.get('studio-outbox:'+id),actor:useStudioStore.getState().actorId,pending:useStudioStore.getState().pending});
 async function conflictCase(restartSameActor,keepLocal,stale=true){
  const a={...user,id:'qa-session-'+restartSameActor+'-'+keepLocal+'-'+stale},b=restartSameActor?{...a}:{...a,id:a.id+'-B'},p=raceProject(),remote=structuredClone(p);remote.subTasks.내부.endDate=remote.subTasks.내부.allocations[0].endDate='2026-10-07';let hold=false,holding=false,offline=false,release;
  for(const actor of [a,b]){data.set('studio-legacy-import-v1:'+actor.id,'1');data.delete('studio-outbox:'+actor.id);}
  globalThis.fetch=async(url,options={})=>{const path=String(url).split('/').at(-1),actor=useAuthStore.getState().currentUser;if(path==='session'&&offline)return Response.json({error:'합성 연결 대기'},{status:503});if(path==='projects'&&options.method==='POST')return Response.json({error:'합성 실제 기간 충돌'},{status:409});const body={session:{user:actor},changes:{versions:{projects:1,meetings:1,inbox:1,directory:1,personal:1}},projects:{projects:[{project:remote}],archived:[]},meetings:{meetings:[]},notifications:{notifications:[],unreadCount:0},directory:{users:[a,b]},personal:{leaves:[],checks:[],worklogs:[]}}[path];assert.ok(body,'Unexpected synthetic route '+path);if(path==='projects'&&hold){hold=false;holding=true;return new Promise(resolve=>{release=()=>resolve(Response.json(body));});}return Response.json(body);};
  useAuthStore.setState({currentUser:a});useProjectStore.setState({projects:[p]});stop=startStudioSync(a.id);await until(()=>useStudioStore.getState().ready);changeEnd('2026-10-10');await until(()=>useStudioStore.getState().conflict);assert.equal(useStudioStore.getState().pending,1);
  hold=stale;const operation=resolveScheduleConflict(keepLocal).then(()=>({done:true})).catch(error=>({done:false,error:error.message}));
  if(stale){await until(()=>holding);offline=true;useAuthStore.setState({currentUser:b});stop=startStudioSync(b.id);await until(()=>useStudioStore.getState().status==='합성 연결 대기');changeEnd('2026-10-12');const frozen=snapshot(b.id);assert.equal(frozen.pending,1);release();const result=await operation;assert.equal(result.done,false,'Old response must be rejected for the new account/session');assert.match(result.error,/계정|연결/);assert.deepEqual(snapshot(b.id),frozen,'New session project/date/PM/anchor and outbox must remain exact');}
  else{const result=await operation;assert.equal(result.done,true);await settle();assert.equal(useStudioStore.getState().pending,0);assert.equal(useProjectStore.getState().projects[0].subTasks.내부.allocations[0].endDate,'2026-10-07');assert.equal(useProjectStore.getState().projects[0].pmId,'master-pm');assert.equal(useProjectStore.getState().projects[0].subTasks.내부.legacyAllocationId,'retained');}
  stop();stop=null;
 }
 let conflictFailures=0;
 if(!onlyMeetingRefresh){
 for(const [sameActor,label]of [[false,'계정 전환'],[true,'동일 계정 재연결']]){try{for(const keepLocal of [false,true])await conflictCase(sameActor,keepLocal);console.log('PASS '+label+' 중 늦은 충돌 응답은 기간/PM/anchor/미전송 원문 보존');}catch(error){conflictFailures++;console.log('FAIL '+label+': '+error.message);stop?.();stop=null;}}
 try{await conflictCase(false,false,false);console.log('PASS 현재 계정·현재 연결의 서버내용 적용은 정상 완료');}catch(error){conflictFailures++;console.log('FAIL 현재 연결: '+error.message);stop?.();stop=null;}
 if(conflictFailures)process.exitCode=1;
 }
 if(!onlyConflictSession){
 const refreshActor={...user,id:'qa-meeting-refresh'},meetingState=(decision=null)=>({id:'qa-meeting',authorId:refreshActor.id,serverRevision:1,title:'원 회의 제목',rawTranscript:'원 대화록',notesAndInstructions:'원 본문',attachedFileName:'original.txt',archiveRevision:1,archiveUrl:'https://example.invalid/archive',reviews:decision===undefined?[]:[{recipient_id:'chief',stage:'chief',read_at:decision?'2026-10-07T01:00:00Z':null,decision},{recipient_id:'director',stage:'director',read_at:decision?'2026-10-07T01:00:00Z':null,decision}]}),inboxState=count=>({notifications:Array.from({length:count},(_,i)=>({id:'n'+i,message:'합성 결재 알림',meeting_id:'qa-meeting'})),unreadCount:count});
 const resetRefresh=()=>{useAuthStore.setState({currentUser:refreshActor});useStudioStore.setState({actorId:refreshActor.id,ready:true,meetings:[],notifications:[],unreadCount:0,openMeetingId:'qa-meeting'});};
 function refreshTransport(old,current,{latestFailure=false}={}){let reads=0,release,held=false;globalThis.fetch=async url=>{const path=String(url).split('/').at(-1);if(path==='meetings'){const index=++reads;if(index===1){held=true;return new Promise(resolve=>{release=()=>resolve(Response.json({meetings:[old]}));});}if(latestFailure&&index===2)return Response.json({error:'합성 최신 조회 실패'},{status:503});return Response.json({meetings:[current]});}assert.equal(path,'notifications');return Response.json(inboxState(reads<=1?0:2));};return {held:()=>held,release:()=>release()};}
 async function meetingCheck(name,fn){try{await fn();console.log('PASS '+name);}catch(error){conflictFailures++;console.log('FAIL '+name+': '+error.message);stop?.();stop=null;}}
 await meetingCheck('회의록 같은버전 상신/결재: 늦은 이전 조회가 최신 receipts와 첨부/Drive/알림을 되돌리지 않음',async()=>{
  for(const [old,current]of [[{...meetingState(),reviews:[]},meetingState()], [meetingState(),meetingState('approve')]]){resetRefresh();const transport=refreshTransport(old,current),first=refreshStudioMeetings();await until(transport.held);await refreshStudioMeetings();const frozen=structuredClone(useStudioStore.getState());transport.release();await first;assert.deepEqual(useStudioStore.getState(),frozen);assert.deepEqual(useStudioStore.getState().meetings,[current]);}
 });
 await meetingCheck('회의록 최신 조회 실패: 기존 최신 cache와 다른영역 유지·늦은 이전 조회 차단',async()=>{
  resetRefresh();const latest=meetingState('approve');useStudioStore.setState({meetings:[latest],...inboxState(3),status:'기존 공유 상태',pending:2,archivedProjects:[{id:'다른 영역'}]});const frozen=structuredClone(useStudioStore.getState()),transport=refreshTransport({...latest,reviews:[]},latest,{latestFailure:true}),first=refreshStudioMeetings();await until(transport.held);await assert.rejects(refreshStudioMeetings(),/최신 조회 실패/);assert.deepEqual(useStudioStore.getState(),frozen);transport.release();await first;assert.deepEqual(useStudioStore.getState(),frozen);await refreshStudioMeetings();assert.deepEqual(useStudioStore.getState().meetings,[latest]);assert.equal(useStudioStore.getState().pending,2);assert.equal(useStudioStore.getState().status,'기존 공유 상태');
 });
 await meetingCheck('회의록 동일계정 재연결: 새 조회가 없어도 이전연결 응답은 빈 새 cache를 오염시키지 않음',async()=>{
  resetRefresh();data.set('studio-legacy-import-v1:'+refreshActor.id,'1');data.delete('studio-outbox:'+refreshActor.id);globalThis.fetch=async url=>{const path=String(url).split('/').at(-1);if(path==='session')return Response.json({error:'합성 재연결 대기'},{status:503});assert.fail('Unexpected old session route '+path);};stop=startStudioSync(refreshActor.id);await until(()=>useStudioStore.getState().status==='합성 재연결 대기');const transport=refreshTransport(meetingState(),meetingState('approve')),first=refreshStudioMeetings();await until(transport.held);globalThis.fetch=async()=>Response.json({error:'합성 새연결 대기'},{status:503});stop=startStudioSync(refreshActor.id);await until(()=>useStudioStore.getState().status==='합성 새연결 대기');const frozen=structuredClone(useStudioStore.getState());transport.release();await first;assert.deepEqual(useStudioStore.getState(),frozen);stop();stop=null;
 });
 await meetingCheck('회의록 현재 연결 정상 조회: 현재 자료/결재/Drive메타와 수신알림 반영',async()=>{
  resetRefresh();const current=meetingState('approve');globalThis.fetch=async url=>Response.json(String(url).split('/').at(-1)==='meetings'?{meetings:[current]}:inboxState(2));await refreshStudioMeetings();assert.deepEqual(useStudioStore.getState().meetings,[current]);assert.deepEqual(useStudioStore.getState().notifications,inboxState(2).notifications);assert.equal(useStudioStore.getState().unreadCount,2);
 });
 if(conflictFailures)process.exitCode=1;
 }
}finally{stop?.();globalThis.setInterval=realInterval;globalThis.clearInterval=realClear;globalThis.fetch=realFetch;await server.close();}
if(!onlyConflictSession&&!onlyMeetingRefresh){const result=await checkMeetingFileContext();if(result.failed)process.exitCode=1;}
