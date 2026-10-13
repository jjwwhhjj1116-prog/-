import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

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
  const { startStudioSync, useStudioStore: studio, refreshStudioProjects } = await server.ssrLoadModule('/src/store/useStudioStore.ts');
  let intakeVersion = 1, projectVersion = 1, current = actor('intake-A'), incoming = [waiting('QA-UNKNOWN-1')], records = [project('QA-KNOWN-1')];
  let holdProjects = false, release, holding = false, failProjects = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).split('/').at(-1), requestedActor = current.id;
    requests.push({ path, method: options.method || 'GET', actor: requestedActor });
    assert.ok(!options.method || options.method === 'GET', '자동 일정 반영은 클라이언트 POST 복제본을 만들면 안 됩니다.');
    if(path==='projects'&&failProjects)return Response.json({error:'합성 수주 읽기 실패'},{status:503});
    const body = {
      session: { user: current }, changes: { versions: { projects: projectVersion, intake: intakeVersion, meetings: 1, inbox: 1, directory: 1, personal: 1 } },
      projects: { projects: records.map(project => ({ project })), archived: [], pendingIntake: incoming },
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
    return { initialProjectRows: 1, initialPendingRows: 1, projectPOSTs: 0 };
  });
  await check('프로젝트 버전이 같아도 intake 버전만 변경되면 자동 등록·미확인 수주가 즉시 갱신', async () => {
    const before = requests.filter(request => request.path === 'projects').length;
    records = [...records, project('QA-KNOWN-2')]; incoming = [waiting('QA-UNKNOWN-2')]; intakeVersion++;
    await timer(); await flush();
    assert.equal(projectVersion, 1);
    assert.equal(requests.filter(request => request.path === 'projects').length, before + 1);
    assert.deepEqual(projects.getState().projects.map(project => project.code), ['QA-KNOWN-1', 'QA-KNOWN-2']);
    assert.deepEqual(studio.getState().pendingIntake, incoming);
    return { unchangedProjectVersion: projectVersion, intakeVersion, addedCentralRows: 1, pendingReplaced: true };
  });
  await check('수주 내용만 바뀌고 날짜·PM이 없는 경우도 수주 버전으로 대기 목록 갱신', async () => {
    incoming = [{ ...incoming[0], name: '변경된 합성 프로젝트명', missingDepartments: ['구조팀'] }]; intakeVersion++;
    await timer(); await flush();
    assert.equal(studio.getState().pendingIntake[0].name, incoming[0].name);
    assert.deepEqual(studio.getState().pendingIntake[0].missingDepartments, ['구조팀']);
    return { changedMetadataRead: true, noFabricatedDates: true };
  });
  await check('상태가 같아도 사용자의 중앙 자동 반영 재확인은 새 자료를 읽으며 실패를 성공으로 표시하지 않음', async () => {
    incoming = []; await refreshStudioProjects(); await flush();
    assert.deepEqual(studio.getState().pendingIntake, []);
    failProjects = true;
    await assert.rejects(refreshStudioProjects(),/합성 수주 읽기 실패/);
    assert.equal(studio.getState().ready,false);
    failProjects = false;await refreshStudioProjects();await flush();
    assert.equal(studio.getState().ready,true);
    return { manualRefreshClearedPending: true, failedRefreshRejected:true, reconnectReady:true };
  });
  await check('로그아웃·다른 계정 로그인은 이전 배정 대기를 즉시 비우고 지연 응답도 섞지 않음', async () => {
    incoming = [waiting('QA-OLD-DELAYED')]; holdProjects = true; intakeVersion++;
    const oldRefresh = timer(); await until(() => holding);
    const finishOld = release; stop(); stop = null;
    assert.deepEqual(studio.getState().pendingIntake, []); assert.equal(studio.getState().actorId, null);
    holdProjects = false; incoming = [waiting('QA-NEW-ACTOR')]; records = [project('QA-NEW-ACTOR')];
    login(actor('intake-B'));
    assert.deepEqual(studio.getState().pendingIntake, []); await flush();
    assert.equal(studio.getState().actorId, 'intake-B'); assert.deepEqual(studio.getState().pendingIntake, incoming);
    finishOld(); await oldRefresh; await flush();
    assert.equal(studio.getState().actorId, 'intake-B'); assert.deepEqual(studio.getState().pendingIntake, incoming);
    assert.deepEqual(projects.getState().projects.map(project => project.code), ['QA-NEW-ACTOR']);
    stop(); stop = null; assert.deepEqual(studio.getState().pendingIntake, []);
    return { clearOnStop: true, clearBeforeNewLoad: true, staleResponseIgnored: true };
  });
} finally {
  stop?.(); globalThis.fetch = original.fetch; globalThis.setInterval = original.setInterval; globalThis.clearInterval = original.clearInterval;
  await server.close();
}
const report = { kind: 'ACTUAL_STUDIO_SYNC_SYNTHETIC_INTAKE_VERSION', protectedOriginal: Boolean(protectedSource), productWrites: 0, networkRequests: 0, syntheticRequests: requests.length, syntheticPOSTs: requests.filter(request => request.method === 'POST').length, results, limits: ['실제 공유 스토어와 API 클라이언트를 실행했으며 HTTP 응답·로그인 계정·타이머는 메모리 합성입니다. 운영 수주 수집 및 서버 등록은 별도 검수 대상입니다.'] };
if (argument('output')) writeFileSync(argument('output'), JSON.stringify(report, null, 2) + '\n');
if (report.syntheticPOSTs || results.some(result => result.status === 'FAIL')) process.exitCode = 1;
