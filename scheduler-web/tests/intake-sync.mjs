import assert from 'node:assert/strict';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import { readFileSync, writeFileSync } from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const storage = new Map(), results = [], requests = [];
const original = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage };
let timer;
globalThis.setInterval = fn => { timer = fn; return 123; };
globalThis.clearInterval = () => {};
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const protectedSource = argument('sync-source');
const server = await createServer({ plugins: protectedSource ? [{ name: 'protected-intake-sync', enforce: 'pre', load(id) {
  if (id.replaceAll('\\', '/').endsWith('/src/store/useStudioStore.ts')) return readFileSync(protectedSource, 'utf8');
} }] : [], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const waiting = code => ({ id: `intake-${code}`, no: 700001, code, name: `합성 미확인 수주 ${code}`, targetDepartments: [], startDate: '', endDate: '', reason: 'department-unconfirmed' });
const project = code => ({ id: `project-${code}`, code, name: `합성 자동 일정 ${code}`, department: '구조팀', pmId: '', startDate: '', endDate: '', progress: 0, status: '착수예정', roles: {}, subTasks: {} });
const actor = id => ({ id, no: 710001, name: `합성 ${id}`, company: '컨코스트', department: '구조팀', originalDept: '구조팀', position: '실장', email: `${id}@example.invalid`, idPrefix: id, active: true, role: 'MEMBER' });
const seedIntakes=JSON.parse(readFileSync(new URL('../src/data/intakeProjects.json',import.meta.url),'utf8'));
const catalogItem=(code,no=800001,name='합성 공유 접수 '+code)=>({...waiting(code),no,name,rawTitle:name,client:'합성 한국 발주처',author:'합성',receivedDate:'2026-10-16',scopeText:'',status:'접수완료',isScheduled:false});
const flush = async () => { for (let index = 0; index < 20; index++) await new Promise(resolve => setTimeout(resolve, 0)); };
const until = async fn => { for (let index = 0; index < 100; index++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(fn(), '예상한 동기화 상태를 확인하지 못했습니다.'); };
async function check(name, fn) {
  try { const observed = await fn(); results.push({ name, status: 'PASS', observed }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', reason: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}
let stop;
try {
  const { useAuthStore: auth } = await server.ssrLoadModule('/src/store/useAuthStore.ts');
  const { useProjectStore: projects } = await server.ssrLoadModule('/src/store/useProjectStore.ts');
  const { startStudioSync, useStudioStore: studio, refreshStudioProjects,updateStudioIntakeProjects } = await server.ssrLoadModule('/src/store/useStudioStore.ts');
  let intakeVersion = 1, projectVersion = 1, current = actor('intake-A'), incoming = [waiting('QA-UNKNOWN-1')], records = [project('QA-KNOWN-1')];
  let catalogRows=[{...seedIntakes[0],no:800002,name:'서버 접수 원문 갱신'},catalogItem('QA-CATALOG-1')];
  let holdProjects = false, release, holding = false, failProjects = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/').at(-1), requestedActor = current.id;
    requests.push({ path, method: options.method || 'GET', actor: requestedActor });
    assert.ok(!options.method || options.method === 'GET', '자동 일정 반영은 클라이언트 POST 복제본을 만들면 안 됩니다.');
    if(path==='projects'&&failProjects)return Response.json({error:'합성 수주 읽기 실패'},{status:503});
    const body = {
      session: { user: current }, changes: { versions: { projects: projectVersion, intake: intakeVersion, meetings: 1, inbox: 1, directory: 1, personal: 1 } },
      projects: { projects: records.map(project => ({ project })), archived: [], pendingIntake: incoming,intakeList:catalogRows },
      meetings: { meetings: [] }, notifications: { notifications: [], unreadCount: 0 }, directory: { users: [current] }, personal: { leaves: [], checks: [], worklogs: [] },
    }[path];
    assert.ok(body, `Unexpected synthetic route ${path}`);
    if (path === 'projects' && holdProjects) {
      const snapshot = structuredClone(body); holding = true;
      return new Promise(resolve => { release = () => resolve(Response.json(snapshot)); });
    }
    return Response.json(body);
  };
  const login = user => {
    current = user; storage.set(`studio-legacy-import-v1:${user.id}`, '1');
    auth.setState({ currentUser: user }); stop = startStudioSync(user.id);
  };
  await check('로그인 첫 중앙 응답에서 자동 등록 일정과 미확인 수주를 함께 읽으며 별도 POST 없음', async () => {
    login(current); await flush();
    assert.equal(studio.getState().hasLoaded, true); assert.equal(studio.getState().actorId, current.id);
    assert.deepEqual(studio.getState().pendingIntake, incoming);
    assert.deepEqual(projects.getState().projects.map(project => project.code), ['QA-KNOWN-1']);
    assert.equal(requests.filter(request => request.path === 'projects').length, 1);
    assert.equal(studio.getState().intakeProjects.length,seedIntakes.length+1);assert.equal(studio.getState().intakeProjects[0].name,'서버 접수 원문 갱신');assert.equal(studio.getState().intakeProjects.filter(item=>item.id===seedIntakes[0].id).length,1);assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-1'));
    return { initialProjectRows: 1, initialPendingRows: 1, projectPOSTs: 0 };
  });
  await check('프로젝트 버전이 같아도 intake 버전만 변경되면 자동 등록·미확인 수주가 즉시 갱신', async () => {
    const before = requests.filter(request => request.path === 'projects').length;
    records = [...records, project('QA-KNOWN-2')]; incoming = [waiting('QA-UNKNOWN-2')];catalogRows=[catalogItem('QA-CATALOG-2',800003),{...seedIntakes[0],name:'동일 문서 최신 접수명'}]; intakeVersion++;
    await timer(); await flush();
    assert.equal(projectVersion, 1);
    assert.equal(requests.filter(request => request.path === 'projects').length, before + 1);
    assert.deepEqual(projects.getState().projects.map(project => project.code), ['QA-KNOWN-1', 'QA-KNOWN-2']);
    assert.deepEqual(studio.getState().pendingIntake, incoming);
    assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-2'));assert.ok(!studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-1'));assert.equal(studio.getState().intakeProjects.find(item=>item.id===seedIntakes[0].id).name,'동일 문서 최신 접수명');
    return { unchangedProjectVersion: projectVersion, intakeVersion, addedCentralRows: 1, pendingReplaced: true };
  });
  await check('수주 내용만 바뀌고 날짜·PM이 없는 경우도 수주 버전으로 대기 목록 갱신', async () => {
    incoming = [{ ...incoming[0], name: '변경된 합성 프로젝트명', missingDepartments: ['구조팀'] }];catalogRows=[{...catalogRows[0],name:'공유 카탈로그만 변경'}]; intakeVersion++;
    await timer(); await flush();
    assert.equal(studio.getState().pendingIntake[0].name, incoming[0].name);
    assert.deepEqual(studio.getState().pendingIntake[0].missingDepartments, ['구조팀']);
    assert.equal(studio.getState().intakeProjects.find(item=>item.code==='QA-CATALOG-2').name,'공유 카탈로그만 변경');
    return { changedMetadataRead: true, noFabricatedDates: true };
  });
  await check('동일 버전 2초 갱신은 projects/intake 추가 조회 없이 공유 원문을 유지',async()=>{const before=requests.filter(row=>row.path==='projects').length,snapshot=structuredClone(studio.getState().intakeProjects);await timer();await flush();assert.equal(requests.filter(row=>row.path==='projects').length,before);assert.deepEqual(studio.getState().intakeProjects,snapshot);assert.equal(requests.filter(row=>row.path==='intake').length,0);return {extraProjectsRequests:0,extraIntakeRequests:0};});
  await check('상태가 같아도 사용자의 중앙 자동 반영 재확인은 새 자료를 읽으며 실패를 성공으로 표시하지 않음', async () => {
    incoming = []; await refreshStudioProjects(); await flush();
    assert.deepEqual(studio.getState().pendingIntake, []);
    failProjects = true;
    await assert.rejects(refreshStudioProjects(),/합성 수주 읽기 실패/);
    assert.equal(studio.getState().ready,false);
    assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-2'),'Failed refresh retains the last confirmed catalog');
    failProjects = false;await refreshStudioProjects();await flush();
    assert.equal(studio.getState().ready,true);
    return { manualRefreshClearedPending: true, failedRefreshRejected:true, reconnectReady:true };
  });
  await check('로그아웃·다른 계정 로그인은 이전 배정 대기를 즉시 비우고 지연 응답도 섞지 않음', async () => {
    incoming = [waiting('QA-OLD-DELAYED')];catalogRows=[catalogItem('QA-CATALOG-OLD-DELAYED')]; holdProjects = true; intakeVersion++;
    const oldRefresh = timer(); await until(() => holding);
    const finishOld = release; stop(); stop = null;
    assert.deepEqual(studio.getState().pendingIntake, []); assert.equal(studio.getState().actorId, null);
    assert.deepEqual(studio.getState().intakeProjects.map(item=>item.id),seedIntakes.map(item=>item.id));
    holdProjects = false; incoming = [waiting('QA-NEW-ACTOR')]; records = [project('QA-NEW-ACTOR')];catalogRows=[catalogItem('QA-CATALOG-NEW-ACTOR')];
    login(actor('intake-B'));
    assert.deepEqual(studio.getState().pendingIntake, []); await flush();
    assert.equal(studio.getState().actorId, 'intake-B'); assert.deepEqual(studio.getState().pendingIntake, incoming);
    finishOld(); await oldRefresh; await flush();
    assert.equal(studio.getState().actorId, 'intake-B'); assert.deepEqual(studio.getState().pendingIntake, incoming);
    assert.deepEqual(projects.getState().projects.map(project => project.code), ['QA-NEW-ACTOR']);
    assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-NEW-ACTOR'));assert.ok(!studio.getState().intakeProjects.some(item=>item.code==='QA-CATALOG-OLD-DELAYED'));
    stop(); stop = null; assert.deepEqual(studio.getState().pendingIntake, []);
    assert.deepEqual(studio.getState().intakeProjects.map(item=>item.id),seedIntakes.map(item=>item.id));
    return { clearOnStop: true, clearBeforeNewLoad: true, staleResponseIgnored: true };
  });
  const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
  const pendingAssignment=await server.ssrLoadModule('/src/utils/pendingAssignment.ts'),permissions=await server.ssrLoadModule('/src/utils/schedulePermissions.ts'),registration=await server.ssrLoadModule('/src/utils/intakeRegistration.ts');
  const intakeSource=readFileSync(new URL('../src/components/IntakeListView.tsx',import.meta.url),'utf8'),intakeCompiled=ts.transpileModule(intakeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
  const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'&&node.props?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
  const hook=store=>Object.assign(selector=>typeof selector==='function'?selector(store.getState()):store.getState(),{getState:store.getState});
  function intakeView(){
    const hooks=[],effects=[],pending=[],intervals=new Map(),focus=new Set(),exports={};let cursor=0,dirty=true,tree,sequence=0;
    const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
    const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>{const next=typeof value==='function'?value(hooks[i]):value;if(!Object.is(next,hooks[i])){hooks[i]=next;dirty=true;}}];},useMemo(fn,deps){const i=cursor++;if(!hooks[i]||!same(hooks[i].deps,deps))hooks[i]={deps,value:fn()};return hooks[i].value;},useEffect(fn,deps){const i=cursor++;if(!same(effects[i]?.deps,deps)){const previous=effects[i];effects[i]={deps};pending.push(()=>{previous?.cleanup?.();effects[i].cleanup=fn();});}}};
    const dependencies={react,'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../store/useAuthStore':{useAuthStore:hook(auth)},'../store/useProjectStore':{useProjectStore:hook(projects)},'../store/useStudioStore':{useStudioStore:studio,updateStudioIntakeProjects,refreshStudioProjects,waitForSchedulePublished:async()=>assert.fail('A read-only intake refresh must not publish a schedule')},'../utils/schedulePermissions':permissions,'../utils/intakeRegistration':registration,'../utils/pendingAssignment':pendingAssignment,'../data/intakeProjects.json':seedIntakes};
    runInNewContext(intakeCompiled,{exports,Date,Map,AbortSignal,console,fetch:(...args)=>globalThis.fetch(...args),setTimeout,window:{addEventListener(name,fn){assert.equal(name,'focus');focus.add(fn);},removeEventListener(name,fn){assert.equal(name,'focus');focus.delete(fn);}},setInterval(fn,delay){const id=++sequence;intervals.set(id,{fn,delay});return id;},clearInterval(id){intervals.delete(id);},require(path){assert.ok(path in dependencies,'Unexpected actual intake component dependency '+path);return dependencies[path];}});
    const render=()=>{for(let cycle=0;cycle<12;cycle++){cursor=0;dirty=false;tree=exports.IntakeListView({intakeProjects:studio.getState().intakeProjects,onNavigateToSchedule:()=>assert.fail('Polling must not navigate')});while(pending.length)pending.shift()();if(!dirty)return;}assert.fail('Intake view did not settle');};
    render();return {render,intervals,focus,async settle(){await flush();render();},html:()=>renderToStaticMarkup(tree),rows:()=>nodes(tree).filter(node=>node.type==='tr').map(text),dispose(){for(const effect of effects)effect?.cleanup?.();}};
  }
  let view;
  await check('실제 접수 컴포넌트 60초·focus GET은 같은 전역 목록을 갱신하고 신규 행·이름·순서로 재표시',async()=>{
    const reads=[],source={rows:[catalogItem('QA-POLL-1',900002)],sync:{last_success:new Date().toISOString()}};
    globalThis.fetch=async(url,options={})=>{assert.equal(String(url),'/api/intake');assert.equal(options.method||'GET','GET');assert.equal(options.credentials,'same-origin');reads.push(String(url));requests.push({path:'intake',method:'GET',actor:auth.getState().currentUser.id});return Response.json({intakeList:source.rows,sync:source.sync});};
    view=intakeView();await view.settle();assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-POLL-1'));assert.ok(view.rows().some(row=>row.includes('QA-POLL-1')));assert.equal(view.intervals.size,1);assert.equal([...view.intervals.values()][0].delay,60000);assert.equal(view.focus.size,1);
    source.rows=[catalogItem('QA-POLL-2',900004,'60초 새 한국 현장'),catalogItem('QA-POLL-1',900003,'60초 변경 원문')];[...view.intervals.values()][0].fn();await view.settle();assert.equal(reads.length,2);assert.equal(studio.getState().intakeProjects[0].code,'QA-POLL-2');assert.ok(view.html().includes('60초 새 한국 현장')&&view.html().includes('60초 변경 원문'));const order=view.rows().filter(row=>row.includes('QA-POLL-'));assert.ok(order[0].includes('QA-POLL-2')&&order[1].includes('QA-POLL-1'));
    source.rows=[catalogItem('QA-FOCUS',900005,'focus 공유 원문')];for(const fn of view.focus)fn();await view.settle();assert.equal(reads.length,3);assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-FOCUS'));assert.ok(view.rows().some(row=>row.includes('QA-FOCUS')));assert.ok(!studio.getState().intakeProjects.some(item=>item.code==='QA-POLL-1'));view.dispose();assert.equal(view.intervals.size,0);assert.equal(view.focus.size,0);view=null;return {actualGetRequests:reads.length,pollInterval:60000,sharedStoreAndVisibleRowsUpdated:true,writeRequests:0};
  });
  await check('실제 접수 컴포넌트 계정 전환 cleanup은 이전 60초 응답을 폐기하고 새 계정 공유 목록 유지',async()=>{
    let pendingResponse,hold=false,source=[catalogItem('QA-COMPONENT-OLD',910001)],release;
    globalThis.fetch=async(url,options={})=>{assert.equal(String(url),'/api/intake');assert.equal(options.method||'GET','GET');requests.push({path:'intake',method:'GET',actor:auth.getState().currentUser.id});const response=Response.json({intakeList:structuredClone(source),sync:null});if(hold){hold=false;pendingResponse=true;return new Promise(done=>{release=()=>done(response);});}return response;};
    view=intakeView();await view.settle();hold=true;[...view.intervals.values()][0].fn();await until(()=>pendingResponse);source=[catalogItem('QA-COMPONENT-NEW',910002)];auth.setState({currentUser:actor('intake-component-new')});view.render();await view.settle();assert.ok(studio.getState().intakeProjects.some(item=>item.code==='QA-COMPONENT-NEW'));release();await view.settle();assert.ok(!studio.getState().intakeProjects.some(item=>item.code==='QA-COMPONENT-OLD'));assert.ok(view.rows().some(row=>row.includes('QA-COMPONENT-NEW')));assert.equal(view.intervals.size,1);assert.equal(view.focus.size,1);view.dispose();view=null;return {oldResponseApplied:false,activePollingLoops:1};
  });
  view?.dispose();
} finally {
  stop?.(); globalThis.fetch = original.fetch; globalThis.setInterval = original.setInterval; globalThis.clearInterval = original.clearInterval;
  await server.close();
}
const report = { kind: 'ACTUAL_STUDIO_SYNC_SYNTHETIC_INTAKE_VERSION', protectedOriginal: Boolean(protectedSource), productWrites: 0, networkRequests: 0, syntheticRequests: requests.length, syntheticPOSTs: requests.filter(request => request.method === 'POST').length, results, limits: ['실제 공유 스토어와 API 클라이언트를 실행했으며 HTTP 응답·로그인 계정·타이머는 메모리 합성입니다. 운영 수주 수집 및 서버 등록은 별도 검수 대상입니다.'] };
if (argument('output')) writeFileSync(argument('output'), JSON.stringify(report, null, 2) + '\n');
if (report.syntheticPOSTs || results.some(result => result.status === 'FAIL')) process.exitCode = 1;
