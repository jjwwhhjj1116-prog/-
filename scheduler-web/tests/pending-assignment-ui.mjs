import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx|date-fns|lucide-react)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), React = require('react'), jsx = require('react/jsx-runtime'), ts = require('typescript');
const results = [], originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { localStorage: globalThis.localStorage };
let externalRequests = 0;
globalThis.fetch = async () => { externalRequests++; throw Error('합성 UI 검수에서 외부 요청은 금지됩니다.'); };
const sourceArgument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const calendarSource = sourceArgument('calendar-source'), studioSource = sourceArgument('studio-source');
const server = await createServer({ plugins: [{ name: 'pending-assignment-protected-source', enforce: 'pre', load(id) {
  if (calendarSource && id.replaceAll('\\', '/').endsWith('/src/components/ProjectCalendar.tsx')) return readFileSync(calendarSource, 'utf8');
} }], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' && node.props ? [node, ...nodes(node.props.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
async function check(name, fn) {
  try { const observed = await fn(); results.push({ name, status: 'PASS', observed }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', reason: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}
const actor = (id, department, position, extra = {}) => ({ id, no: 7001, name: `합성 ${id}`, engName: 'Synthetic', company: '컨코스트', department, originalDept: department, position, phone: '', email: `${id}@example.invalid`, idPrefix: id, active: true, role: 'MEMBER', ...extra });
const admin = actor('u_10', '개발 TF', '실장', { email: 'yjw@con-cost.com', role: 'ADMIN' });
const chief = actor('u_12', '마감팀', '실장'), lead = actor('finish-lead', '마감팀', '팀장'), worker = actor('finish-worker', '마감팀', '프로');
const project = (id, department = '마감팀', extra = {}) => ({ id, code: `QA-${id}`, name: `합성 ${id} 프로젝트`, department, pmId: '', startDate: '2026-09-01', endDate: '2026-09-03', progress: 0, status: '착수예정', roles: {}, subTasks: {}, ...extra });
const waiting = { id: 'intake-wait', no: 9010, code: 'QA-WAIT', name: '참여 팀이 미확인인 합성 수주', client: '', receivedDate: '2026-10-13', targetDepartments: [], startDate: '', endDate: '', reason: 'department-unconfirmed' };
const records = [
  project('finish-old'), project('structure-future', '구조팀', { startDate: '2027-01-01', endDate: '2027-01-05' }),
  project('assigned-old', '마감팀', { pmId: chief.id }),
  project('delivered-old', '마감팀', { status: '납품', progress: 100 }),
  project('date-wait', '마감팀', { pmId: chief.id, startDate: '', endDate: '' }),
  project('assigned-current', '마감팀', { pmId: chief.id, startDate: '2026-10-13', endDate: '2026-10-15' }),
];

try {
  const { default: ProjectCalendar } = await server.ssrLoadModule('/src/components/ProjectCalendar.tsx');
  const { useProjectStore: projects } = await server.ssrLoadModule('/src/store/useProjectStore.ts');
  const permissions = await server.ssrLoadModule('/src/utils/schedulePermissions.ts');
  const pending = await server.ssrLoadModule('/src/utils/pendingAssignment.ts');
  function calendar(dept = 'ALL', incoming = [waiting]) {
    const state = { projects: records, personnel: [], filterDepartment: dept, selectedProjectId: null };
    Object.assign(projects.getInitialState(), state); projects.setState(state);
    return renderToStaticMarkup(createElement(ProjectCalendar, { date: new Date(2026, 9, 1), pendingIntake: incoming }));
  }
  await check('미배정은 과거·다음 달 기간이어도 현재 월에 유지, 배정된 타월·납품은 제외', () => {
    const html = calendar();
    for (const id of ['finish-old', 'structure-future', 'date-wait', 'assigned-current']) assert.ok(html.includes(`QA-${id}`));
    for (const id of ['assigned-old', 'delivered-old']) assert.ok(!html.includes(`QA-${id}`));
    assert.ok(html.indexOf('QA-finish-old') < html.indexOf('QA-assigned-current'));
    assert.ok(html.includes('신규 · 미배정: PM·담당 인원 배정 필요'));
    return { retained: ['past-unassigned', 'future-unassigned', 'unknown-dates', 'current'], omitted: ['assigned-other-month', 'delivered'] };
  });
  await check('미확인 팀 수주는 별도 실제 캘린더 행으로 표시, 중복 행·임의 날짜·PM 없이 접수 배정 연결', () => {
    const html = calendar('ALL', [waiting, { ...waiting }]);
    assert.equal((html.match(/data-pending-intake="QA-WAIT"/g) || []).length, 1);
    assert.ok(html.includes('담당 팀 확인 필요') && html.includes('접수 내용 확인하고 배정하기'));
    assert.ok(!html.includes('기간: 2026-10-13 ~ 2026-10-13'));
    assert.ok(!calendar('구조팀').includes('data-pending-intake='));
    assert.ok(calendar('구조팀').includes('QA-structure-future'));
    return { overallRows: 1, unknownTeamNotForged: true, individualTeamFiltered: true };
  });
  await check('이미 일정표에 같은 코드가 있으면 중복 수주 행 대신 참여 팀 확인 표시', () => {
    const html = calendar('ALL', [{ ...waiting, code: 'QA-assigned-old', reason: 'archived', missingDepartments: ['구조팀'] }]);
    assert.ok(html.includes('QA-assigned-old') && html.includes('참여 팀 확인 필요'));
    assert.ok(!html.includes('data-pending-intake="QA-assigned-old"'));
    return { sameCodeRetained: true, duplicateRows: 0 };
  });
  await check('공유 PM 공종이 이전 pmId보다 우선하며 날짜 미정은 PM 미배정과 구분', () => {
    assert.equal(pending.projectHasNoPM(project('canonical', '마감팀', { pmId: chief.id, subTasks: { PM: { personId: '', personIds: [] } } })), true);
    assert.equal(pending.projectHasNoPM(project('canonical-assigned', '마감팀', { subTasks: { PM: { personId: chief.id, personIds: [chief.id] } } })), false);
    assert.equal(pending.pendingAssignmentReason(records.find(p => p.id === 'date-wait')), '일정 미정');
    assert.equal(pending.pendingAssignmentReason(records.find(p => p.id === 'delivered-old')), null);
    return { canonicalPM: true, dateReason: '일정 미정', completedAlert: false };
  });
  const source = readFileSync(studioSource || new URL('../src/components/StudioCollaboration.tsx', import.meta.url), 'utf8');
  function notificationScreen(user, { ready = true, hasLoaded = true, actorId = user.id, notifications = [], conflict = false, unreadCount = notifications.length } = {}) {
    const auth = { currentUser: user }, projectState = { projects: structuredClone(records) };
    const studio = { ready, hasLoaded, actorId, status: '합성 중앙 공유 연결', pending: 0, conflict, notifications, unreadCount, pendingIntake: [waiting] };
    const hooks = [], trace = [], apiCalls = [], conflictCalls = []; let cursor = 0, dirty = false, effects = [], tree, refreshes = 0;
    const useState = initial => { const index = cursor++; if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { const next = typeof value === 'function' ? value(hooks[index].value) : value; if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; } }]; };
    const useEffect = (fn, deps) => { const index = cursor++; if (!sameDeps(hooks[index]?.deps, deps)) { hooks[index] = { deps }; effects.push(fn); } };
    const store = value => Object.assign(selector => typeof selector === 'function' ? selector(value) : value, { getState: () => value, setState: patch => Object.assign(value, patch) });
    const module = { exports: {} };
    const mocks = {
      react: { ...React, useState, useEffect }, 'react/jsx-runtime': jsx,
      '../services/studioApi': { studioApi: async (path,method,body) => { assert.equal(path,'notifications/read');assert.equal(method,'POST');apiCalls.push({path,method,id:body.id});return {ok:true}; } },
      '../store/useStudioStore': { useStudioStore: store(studio), refreshStudioMeetings: async () => {refreshes++;}, publishLocalTeam: async () => {}, resolveScheduleConflict: async keepLocal => {conflictCalls.push(keepLocal);} },
      '../store/usePersonalStore': { usePersonalStore: store({}), refreshPersonal: async () => {} },
      '../store/useAuthStore': { useAuthStore: store(auth) }, '../store/useProjectStore': { useProjectStore: store(projectState) },
      '../utils/schedulePermissions': permissions, '../utils/pendingAssignment': pending,
    };
    mocks['lucide-react']=require('lucide-react');
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports: module.exports, module, console, require(id) { assert.ok(id in mocks, id); return mocks[id]; } });
    const props = { onOpenMeeting:()=>trace.push({meetingId:studio.openMeetingId}), onOpenProject: (code, dept) => trace.push({ code, dept }), onOpenPendingProjects: code => trace.push({ code }) };
    const render = () => { for (let pass = 0; pass < 10; pass++) { dirty = false; cursor = 0; effects = []; tree = module.exports.StudioCollaboration(props); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('알림 상태가 수렴하지 않습니다.'); };
    return { render, html: () => renderToStaticMarkup(render()), buttons: () => nodes(render()).filter(node => node.type === 'button'), trace, apiCalls, conflictCalls, refreshes:()=>refreshes, switchUser: next => { auth.currentUser = next; }, setStudio: value => Object.assign(studio, value) };
  }
  await check('관리자·실장·팀장·직원 모두 상단 미배정 배지·안내·자동 펼침 목록 없음', () => {
    for (const user of [admin, chief, lead, worker, { ...worker, role: 'ADMIN' }, { ...admin, active: false }]) {
      const html = notificationScreen(user).html();
      for(const removed of ['배정 확인','pending-assignment-list','신규·미배정 또는 일정 미정 프로젝트','QA-finish-old','QA-structure-future','QA-WAIT'])assert.ok(!html.includes(removed),removed);
    }
    return { actorCases: 6, pendingHeaderRemoved: true, calendarCoveredSeparately:true };
  });
  const notice={id:'qa-normal-notice',meeting_id:'qa-meeting',message:'합성 회의록 결재 알림',created_at:'2026-10-13T01:00:00Z',read_at:null};
  const click=async(screen,label)=>{const button=screen.buttons().find(node=>text(node.props.children).includes(label));assert.ok(button,label);button.props.onClick();for(let i=0;i<5;i++)await Promise.resolve();screen.render();};
  await check('기존 결재 알림은 기본 닫힘·건수·일반 읽음 처리 유지', async () => {
    const screen=notificationScreen(admin,{notifications:[notice]});
    assert.equal(screen.buttons().find(node=>text(node.props.children).includes('결재 알림')).props['aria-expanded'],false);
    assert.ok(screen.buttons().some(node=>text(node.props.children)==='결재 알림 1건')&&!screen.html().includes(notice.message));
    await click(screen,'결재 알림');assert.ok(screen.html().includes(notice.message));
    await click(screen,'알림 읽음');assert.deepEqual(screen.apiCalls,[{path:'notifications/read',method:'POST',id:notice.id}]);assert.equal(screen.refreshes(),1);assert.equal(screen.trace.length,0);
    return { inboxDefaultClosed:true, unreadCount:1, syntheticReadRequests:1 };
  });
  await check('기존 공유 충돌의 서버 채택·내 변경 적용 버튼과 미전송 상태 유지', async () => {
    const screen=notificationScreen(chief,{conflict:true});screen.setStudio({pending:2});
    assert.ok(screen.html().includes('미전송 2건')&&screen.html().includes('내 입력은 로컬에 보존되어 있습니다.'));
    await click(screen,'서버 변경 채택');await click(screen,'내 변경 적용');
    assert.deepEqual(screen.conflictCalls,[false,true]);assert.equal(screen.apiCalls.length,0);
    return { conflictButtonsRetained:true, keepLocalChoices:screen.conflictCalls };
  });
  await check('미배정 안내 삭제 후 회의록 본문 이동·갱신·계정 전환 흐름 보존', async () => {
    const screen=notificationScreen(admin,{notifications:[notice]});
    await click(screen,'결재 알림');await click(screen,notice.message);
    assert.deepEqual(screen.trace,[{meetingId:notice.meeting_id}]);assert.equal(screen.buttons().find(node=>text(node.props.children).includes('결재 알림')).props['aria-expanded'],false);
    screen.setStudio({status:'2초 갱신',pendingIntake:[{...waiting,name:'변경된 미확인 수주'}]});
    assert.ok(!screen.html().includes('배정 확인'));
    screen.switchUser(worker);assert.ok(!screen.html().includes('배정 확인'));
    for (const options of [{ hasLoaded: false }, { actorId: 'previous-actor' }]) assert.ok(!notificationScreen(admin, options).html().includes('배정 확인'));
    return { normalMeetingOpened:true, headerNotRecreatedOnRefresh:true };
  });
} finally { globalThis.fetch = originalFetch; await server.close(); }
const report = { kind: 'ACTUAL_PENDING_COMPONENTS_SYNTHETIC', protectedCalendar: Boolean(calendarSource), protectedStudio: Boolean(studioSource), externalRequests, productWrites: 0, results, limits: ['실제 UI 모듈의 SSR·effect·클릭 콜백 검수입니다. 운영 서버 자동 등록과 App 연결은 별도 검수 대상입니다.'] };
const output = sourceArgument('output'); if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
if (externalRequests || results.some(result => result.status === 'FAIL')) process.exitCode = 1;
