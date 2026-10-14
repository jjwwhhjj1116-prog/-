import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const web=new URL('../',import.meta.url),require=createRequire(new URL('package.json',web));

export async function runWorklogSaveNavigation({beforeStore=false,beforeDaily=false,beforeTyping=false,beforePlan=false}={}){
 const storePath=new URL(beforeStore?'../private-provisioning/original-before-worklog-delete-20261006/scheduler-web/src/store/useWorkLogStore.ts':'src/store/useWorkLogStore.ts',web),dailyPath=new URL(beforePlan?'../private-provisioning/qa-worklog-save-navigation-20261006/before-start-plan/DailyWorkLogView.tsx':beforeTyping?'../private-provisioning/qa-worklog-save-navigation-20261006/before-typing/DailyWorkLogView.tsx':beforeDaily?'../private-provisioning/original-before-worklog-save-navigation-20261006/scheduler-web/src/components/DailyWorkLogView.tsx':'src/components/DailyWorkLogView.tsx',web);
 const storeSource=readFileSync(storePath,'utf8'),dailySource=readFileSync(dailyPath,'utf8');
 let harness=readFileSync(new URL('tests/notification-context.mjs',web),'utf8');
 // Expose existing DOM handlers only in memory; product and shared harness files stay intact.
 harness=harness.slice(0,harness.indexOf('if(process.argv[1]'));
 for(const name of ['vite','typescript'])harness=harness.replaceAll("from '"+name+"'","from '"+pathToFileURL(require.resolve(name)).href+"'");
 harness=harness.replace("from './ssr-native-packages.mjs'","from '"+new URL('tests/ssr-native-packages.mjs',web).href+"'");
 harness=harness.replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(new URL('package.json',web).href)})`)
  .replace("new URL('../src/components/DailyWorkLogView.tsx',import.meta.url)",`new URL(${JSON.stringify(new URL('src/components/DailyWorkLogView.tsx',web).href)})`)
  .replace("new URL('../../private-provisioning/original-before-extension-context-20261006/scheduler-web/src/components/DailyWorkLogView.tsx',import.meta.url)",`new URL(${JSON.stringify(dailyPath.href)})`)
  .replace("new URL('../',import.meta.url)",`new URL(${JSON.stringify(web.href)})`);
 const exposed="saveUi:()=>{const save=nodes(tree).find(node=>node.type==='button'&&Array.isArray(node.props.children)&&node.props.children.includes('임시 저장'));assert.ok(save);assert.equal(save.props.disabled,false);save.props.onClick();settle();const current=nodes(tree).find(node=>node.type==='button'&&Array.isArray(node.props.children)&&node.props.children.includes('임시 저장')),history=nodes(tree).find(node=>node.type==='button'&&node.props.role==='tab'&&Array.isArray(node.props.children)&&node.props.children.includes('업무일지 이력'));return {saveDisabled:current.props.disabled,historyDisabled:!!history.props.disabled};},filter:(label,value)=>{const select=control(label);assert.ok(select);select.props.onChange({target:{value}});settle();},revision:()=>nodes(tree).find(node=>node.props['data-worklog-screen'])?.props['data-qa-form-revision'],";
 const taskInput="editTask:value=>{const fields=nodes(tree).find(node=>node.type===reporting.TaskReportFields);assert.ok(fields);assert.equal(fields.props.canEdit,true);fields.props.update(fields.props.item.id,'todayTask',value);settle();},taskText:()=>nodes(tree).find(node=>node.type===reporting.TaskReportFields)?.props.item.todayTask,";
 const planInput="dailyMode:()=>{projectState.projects=projectState.projects.map(project=>({...project,subTasks:Object.fromEntries(Object.entries(project.subTasks||{}).map(([key,task])=>[key,{...task,reportingMode:'DAILY'}]))}));settle();control('보고 작업').props.onChange({target:{value:control('보고 작업').props.value}});settle();},startUi:()=>{const start=nodes(tree).find(node=>node.type==='button'&&node.props.children==='업무 시작');assert.ok(start);assert.equal(start.props.disabled,false);start.props.onClick();settle();},editGoal:value=>{const fields=nodes(tree).find(node=>node.type===reporting.DailyPlanFields&&node.props.canEdit);assert.ok(fields);fields.props.update(fields.props.item.id,'dailyGoal',value);settle();},formItems:()=>structuredClone(nodes(tree).find(node=>node.props['data-worklog-screen'])?.props['data-qa-items']),";
 assert.ok(harness.includes('return {settle,snapshot,trace,effects,reads,'));harness=harness.replace('return {settle,snapshot,trace,effects,reads,','return {'+exposed+taskInput+planInput+'settle,snapshot,trace,effects,reads,');
 assert.ok(dailySource.includes('data-worklog-screen'));const instrumented=dailySource.replace('data-worklog-screen','data-worklog-screen data-qa-form-revision={formRevision} data-qa-items={items}');
 const {runDailyHarness}=await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64'));
 const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
 const realFetch=globalThis.fetch,server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand)(\/|$)/]},root:fileURLToPath(web),plugins:[nativeSsrPackages(),{name:'captured-worklog-store',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/store/useWorkLogStore.ts'))return storeSource;}}],server:{middlewareMode:true,hmr:false},appType:'custom'});
 let auth,store;try{({useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts'));({useWorkLogStore:store}=await server.ssrLoadModule('/src/store/useWorkLogStore.ts'));}finally{await server.close();}
 const drain=async screen=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));await screen.flush();};
 let result;
 try{
  result=await runDailyHarness(instrumented,async({screen,check,manager,author,originalLog,ownTask,authorTask})=>{
   const own={...structuredClone(originalLog),id:'manager-own-A',date:'2026-10-06',userId:manager.id,userName:manager.name,approvalStatus:'DRAFT',serverRevision:1,overallNotes:'A 기존 본문',items:[{...originalLog.items[0],id:ownTask,projectId:'context-P2',projectCode:'QA-P2',projectName:'PM 본인 첫 배정 프로젝트',roleName:'PM',todayTask:'A 실제 수행 본문',progress:20}]};
   const employee={...structuredClone(originalLog),id:'employee-B',date:own.date,overallNotes:'B 상신된 원문 보존',serverRevision:7};
   const setup=({existing=true,selected=null,dailyPlan=false}={})=>{
    const targetOwn=dailyPlan?{...structuredClone(own),reportMode:'DAILY',items:own.items.map(item=>({...item,reportBasis:'DAILY',todayTask:'',manualFields:['dailyGoal','plannedDetails'],dailyGoal:'요청시 계획 목표',plannedDetails:'요청시 계획 세부 내용'}))}:structuredClone(own);
    auth.setState({currentUser:manager,users:[manager,author]});store.setState({workLogs:existing?[targetOwn,structuredClone(employee)]:[structuredClone(employee)],selectedWorkLogId:selected});
    const s=screen({actor:manager,logs:store.getState().workLogs});s.updateLogs({workLogs:store.getState().workLogs,selectedWorkLogId:selected,setSelectedWorkLogId:store.getState().setSelectedWorkLogId,saveWorkLog:store.getState().saveWorkLog});
    const unsubscribe=store.subscribe(state=>s.updateLogs({workLogs:state.workLogs,selectedWorkLogId:state.selectedWorkLogId}));s.settle();if(dailyPlan)s.dailyMode();
    let release,posted;const calls=[];globalThis.fetch=(url,options)=>{calls.push({url:String(url),method:options.method});if(options.method==='PUT'){posted=JSON.parse(options.body).log;return new Promise(resolve=>{release=()=>resolve(Response.json({log:{...posted,serverRevision:(posted.serverRevision||0)+1}}));});}return Promise.resolve(Response.json({ok:true}));};
    return {s,calls,unsubscribe,release:()=>{assert.ok(release,'실제 UI 저장이 PUT를 시작해야 함');release();},posted:()=>posted};
   };
   await check('실제 Daily 정상 저장: null→null 최초 저장/ownA fallback의 선택·본문·폼revision 정상 반영',async()=>{
    const observed=[];for(const existing of [false,true]){const q=setup({existing});try{q.s.editNote(existing?'A 정상 재저장 본문':'A 최초 저장 본문');const before=q.s.snapshot(),busy=q.s.saveUi();assert.equal(before.log,null);assert.equal(busy.saveDisabled,true);assert.equal(busy.historyDisabled,false);q.release();await drain(q.s);const after={...q.s.snapshot(),formRevision:q.s.revision()};assert.equal(after.log,q.posted().id);assert.equal(q.s.note().value,q.posted().overallNotes);assert.equal(after.task,ownTask);assert.equal(after.formRevision,(q.posted().serverRevision||0)+1);assert.equal(q.s.reads.length,0,'작성중 본문은 열람 기록 대상이 아님');observed.push({existing,before,busy,after,body:q.s.note().value,requests:q.calls});}finally{q.unsubscribe();}}return observed;
   });
   await check('실제 Daily 지연 저장: B 선택·원본문·Task·readonly·열람revision 유지, 돌아온 A는 성공ack revision 사용',async()=>{
    const observed=[];for(const selected of [null,own.id]){const q=setup({selected});try{q.s.editNote('A 요청 때의 작성 본문');const busy=q.s.saveUi();q.s.filter('보고 프로젝트','ALL');q.s.filter('보고 역할','');q.s.historyTab();q.s.openLog(employee);const waiting={...q.s.snapshot(),body:q.s.note().value,readonly:q.s.note().disabled,formRevision:q.s.revision()};assert.equal(waiting.log,employee.id);assert.equal(waiting.task,authorTask);assert.equal(waiting.body,employee.overallNotes);assert.equal(waiting.readonly,true);assert.equal(waiting.formRevision,employee.serverRevision);q.release();await drain(q.s);const after={...q.s.snapshot(),body:q.s.note().value,readonly:q.s.note().disabled,formRevision:q.s.revision()},saved=store.getState().workLogs.find(log=>log.id===own.id);observed.push({initialSelected:selected,busy,waiting,after,savedOwn:saved,reads:q.s.reads,requests:q.calls});try{assert.equal(after.log,employee.id);assert.equal(after.task,authorTask);assert.equal(after.body,employee.overallNotes);assert.equal(after.readonly,true);assert.equal(after.formRevision,employee.serverRevision,'A 응답 revision을 현재 B 본문에 적용하면 안 됨');assert.equal(saved.serverRevision,2);assert.equal(saved.overallNotes,'A 요청 때의 작성 본문');assert.deepEqual(q.s.reads.map(read=>({id:read.id,revision:read.revision,body:read.body})),[{id:employee.id,revision:employee.serverRevision,body:employee.overallNotes}]);q.s.historyTab();q.s.openLog(saved);await drain(q.s);const returned={...q.s.snapshot(),body:q.s.note().value,formRevision:q.s.revision()};assert.equal(returned.log,own.id);assert.equal(returned.task,ownTask);assert.equal(returned.body,saved.overallNotes);assert.equal(returned.formRevision,saved.serverRevision,'성공A초안 정리 후 저장된 최신revision을 불러와야 함');assert.equal(q.s.note().disabled,false);observed.at(-1).returnedOwn=returned;}catch(error){error.observed=observed;throw error;}}finally{q.unsubscribe();}}return observed;
   });
   await check('실제 Daily 저장 중 새 입력: HISTORY 기억 초안을 보존하고 성공revision으로 후속 저장',async()=>{
    const observed=[];for(const changed of ['notes','items','both']){const q=setup();try{
     q.s.editNote('A.old 저장 종합 본문');const oldTask=q.s.taskText(),busy=q.s.saveUi();assert.equal(busy.saveDisabled,true);const oldPayload=structuredClone(q.posted());
     const expectedNotes=changed==='items'?oldPayload.overallNotes:'A.new 미저장 종합 본문',expectedTask=changed==='notes'?oldTask:'A.new 미저장 수행 본문';
     if(changed!=='items')q.s.editNote(expectedNotes);if(changed!=='notes')q.s.editTask(expectedTask);
     q.s.filter('보고 프로젝트','ALL');q.s.filter('보고 역할','');q.s.historyTab();q.s.openLog(employee);q.release();await drain(q.s);
     const b={...q.s.snapshot(),body:q.s.note().value,formRevision:q.s.revision()};assert.equal(b.log,employee.id);assert.equal(b.body,employee.overallNotes);assert.equal(b.formRevision,employee.serverRevision);
     const saved=store.getState().workLogs.find(log=>log.id===own.id);assert.equal(saved.overallNotes,oldPayload.overallNotes);assert.equal(saved.items[0].todayTask,oldTask);assert.equal(saved.serverRevision,2);
     q.s.historyTab();q.s.openLog(saved);await drain(q.s);const returned={...q.s.snapshot(),body:q.s.note().value,taskText:q.s.taskText(),formRevision:q.s.revision()};observed.push({changed,b,returned,expectedNotes,expectedTask,savedOld:structuredClone(saved)});
     try{assert.equal(returned.body,expectedNotes,'저장대기 중 새 종합입력이 성공한 과거payload로 되돌아가면 안 됨');assert.equal(returned.taskText,expectedTask,'저장대기 중 새 수행입력이 성공한 과거payload로 되돌아가면 안 됨');assert.equal(returned.formRevision,2,'새 초안은 성공한 저장revision을 기준으로 이어서 저장해야 함');q.s.saveUi();assert.equal(q.posted().serverRevision,2);assert.equal(q.posted().overallNotes,expectedNotes);assert.equal(q.posted().items[0].todayTask,expectedTask);q.release();await drain(q.s);assert.equal(q.s.revision(),3);assert.equal(store.getState().workLogs.find(log=>log.id===own.id).overallNotes,expectedNotes);observed.at(-1).nextSavedRevision=3;}catch(error){error.observed=observed;throw error;}
    }finally{q.unsubscribe();}}return observed;
   });
   await check('실제 Daily 업무 시작 지연: B items/notice 보호·새 계획 입력 보존·계획시작 metadata ack',async()=>{
    const observed=[],failures=[];for(const mode of ['navigate-unchanged','navigate-typed','stay-typed']){const q=setup({dailyPlan:true});try{
     q.s.startUi();const payload=structuredClone(q.posted());assert.ok(payload.items[0].planStartedAt);const typed=mode!=='navigate-unchanged';if(typed)q.s.editGoal('요청중 새 계획 목표');
     if(mode!=='stay-typed'){q.s.filter('보고 프로젝트','ALL');q.s.filter('보고 역할','');q.s.historyTab();q.s.openLog(employee);}q.release();await drain(q.s);
     const settled={...q.s.snapshot(),body:q.s.note().value,items:q.s.formItems(),formRevision:q.s.revision(),notice:q.s.notice()},saved=store.getState().workLogs.find(log=>log.id===own.id);assert.equal(saved.serverRevision,2);assert.equal(saved.items[0].planStartedAt,payload.items[0].planStartedAt);
     if(mode!=='stay-typed'){if(settled.log!==employee.id||settled.items[0]?.id!==authorTask||settled.body!==employee.overallNotes||settled.formRevision!==employee.serverRevision||settled.notice.includes('업무를 시작했습니다'))failures.push(mode+': A callback이 B items/notice/revision에 적용됨');q.s.historyTab();q.s.openLog(saved);await drain(q.s);}
     const returned={...q.s.snapshot(),items:q.s.formItems(),formRevision:q.s.revision()},item=returned.items.find(item=>item.id===ownTask),expectedGoal=typed?'요청중 새 계획 목표':'요청시 계획 목표';
     if(item?.dailyGoal!==expectedGoal)failures.push(mode+': 저장대기 중 새 계획 목표 손실');if(item?.planStartedAt!==payload.items[0].planStartedAt||!item?.manualFields?.includes('planStartedAt'))failures.push(mode+': override 계획시작 metadata ack 누락');if(returned.formRevision!==2)failures.push(mode+': 성공revision ack 누락');observed.push({mode,payload,settled,returned,expectedGoal});
    }finally{q.unsubscribe();}}try{assert.deepEqual(failures,[]);}catch(error){error.observed={failures,scenarios:observed};throw error;}return observed;
   });
  });
 }finally{globalThis.fetch=realFetch;}
 return {...result,kind:'ACTUAL_DAILY_SAVE_HISTORY_ONOPEN_AND_STORE_DEFERRED_FETCH',protectedStore:beforeStore,protectedDaily:beforeDaily,protectedTyping:beforeTyping,protectedPlan:beforePlan,productWrites:0,storeSource:fileURLToPath(storePath),storeSha256:createHash('sha256').update(storeSource).digest('hex'),dailySource:fileURLToPath(dailyPath),dailySha256:createHash('sha256').update(dailySource).digest('hex'),limits:[...result.limits,'실제 UI 저장/업무시작 onClick/HISTORY/onOpen와 실제 store를 실행하며 root의 실제 브라우저 증거와 구분한다.','도구를 메모리 문자열로 확장하고 관찰용 data-qa-form-revision/items 속성만 메모리 JSX에 추가했다. 제품과 기존 검사 파일은 바꾸지 않았다.','수행내용/계획목표 입력은 자식 필드에 전달된 실제 Daily update callback을 실행한다. Rich-text editor 자체의 브라우저 이벤트는 root 실제UI 검수와 구분한다.']};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=await runWorklogSaveNavigation({beforeDaily:process.argv.includes('--before'),beforeTyping:process.argv.includes('--before-typing'),beforePlan:process.argv.includes('--before-plan')});
 if(process.argv[2]&&!process.argv[2].startsWith('--'))writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
 if(result.results.some(row=>row.status==='FAIL'))process.exitCode=1;
}
