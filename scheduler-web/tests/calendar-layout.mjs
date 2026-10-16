import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as vietPersonnel from '../src/utils/vietPersonnel.ts';
import {HOLIDAYS} from '../src/constants/holidays.ts';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { nativeSsrPackages } from './ssr-native-packages.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript'), React = require('react'), jsx = require('react/jsx-runtime');
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const calendarSource = argument('calendar-source'), personalSource = argument('personal-source');
const output = argument('output') || process.argv.slice(2).find(value => !value.startsWith('--'));
const results = [], originalFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.fetch = async () => { externalRequests++; throw Error('합성 캘린더 검수의 외부 요청은 금지됩니다.'); };
const server = await createServer({
  ssr: {noExternal: [/^(react|react-dom|zustand|xlsx|date-fns|lucide-react)(\/|$)/]},
  plugins: [nativeSsrPackages(), ...(calendarSource ? [{ name: 'protected-calendar-layout', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/components/ProjectCalendar.tsx')) return readFileSync(calendarSource, 'utf8');
  } }] : [])],
  server: { middlewareMode: true, hmr: false }, appType: 'custom',
});
const person = { id: 'calendar-layout-person', no: 90001, name: '합성 담당자', engName: 'Synthetic', company: '컨코스트', department: '마감팀', originalDept: '마감팀', position: '프로', phone: '', email: 'calendar-layout@example.invalid', idPrefix: 'calendar-layout', active: true, role: 'MEMBER' };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' && node.props ? [node, ...nodes(node.props.children)] : [];
const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
function fixture(date, length) {
  const first = day(date), last = day(new Date(date.getFullYear(), date.getMonth(), length));
  const before = day(new Date(date.getFullYear(), date.getMonth(), 0)), after = day(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  return [['whole', before, after], ['last', last, last], ['left', before, first], ['right', last, after], ['outside', after, after]].map(([id, startDate, endDate]) => ({
    id: `calendar-${id}`, code: `QA-CALENDAR-${id.toUpperCase()}`, name: `합성 캘린더 ${id}`, department: '마감팀', pmId: person.id, startDate, endDate, progress: 10, status: '진행중', roles: {},
    subTasks: { 내부: { roleName: '내부', personId: person.id, personIds: [person.id], startDate, endDate, progress: 10, status: '진행중', memo: '실제 업무 아님', allocations: [{ id: `calendar-${id}`, personIds: [person.id], startDate, endDate, memo: '합성 경계 검수' }] } },
  }));
}
function calendarGeometry(html, date, length, fixedWidth) {
  const month = day(date).slice(0, 7);
  const headers = [...html.matchAll(/data-calendar-day="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(headers, Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`), '헤더는 해당 월의 1일~말일만 포함해야 합니다.');
  const grid = html.match(new RegExp(`<div[^>]*data-calendar-month="${month}"[^>]*>`))?.[0];
  assert.ok(grid, '실제 월 그리드가 있어야 합니다.');
  assert.ok(grid.includes('width:100%'), '그리드는 넓은 창의 가용 폭을 채워야 합니다.');
  const minimum = Number(grid.match(/min-width:(\d+)px/)?.[1]);
  assert.ok(minimum >= fixedWidth + length * 36, '좁은 창에서 날짜 칸의 최소 폭을 보존해야 합니다.');
  const bars = [...html.matchAll(/<(?:div|button)\b[^>]*title="[^\"]*합성 캘린더 (whole|last|left|right|outside)[^\"]*기간:[^\"]*"[^>]*>/g)];
  const bounds = new Map(),dates=new Map();
  for(const match of bars){
    const style = match[0].match(/style="([^"]*)"/)?.[1] || '';
    const left = Number(style.match(/left:calc\(([\d.]+)%/)?.[1]);
    const width = Number(style.match(/width:(?:max\(30px, )?calc\(([\d.]+)%/)?.[1]);
    assert.ok(Number.isFinite(left) && Number.isFinite(width), '바 위치와 길이는 월 너비의 비율이어야 합니다.');
    assert.ok(left >= 0 && width > 0 && left + width <= 100.000001, '바가 다음 월 영역을 침범하면 안 됩니다.');
    const start=match[0].match(/data-work-start="([^"]+)"/)?.[1],end=match[0].match(/data-work-end="([^"]+)"/)?.[1];assert.ok(start&&end,'표시 막대에는 실제 근무 구간이 있어야 합니다.');
    near(left,(Number(start.slice(-2))-1)/length*100);near(width,(Number(end.slice(-2))-Number(start.slice(-2))+1)/length*100);
    const intervals=bounds.get(match[1])||[];intervals.push({left,width,start,end});bounds.set(match[1],intervals);
    const included=dates.get(match[1])||[];for(let n=Number(start.slice(-2));n<=Number(end.slice(-2));n++)included.push(`${month}-${String(n).padStart(2,'0')}`);dates.set(match[1],included);
  }
  const working=Array.from({length},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`).filter(value=>{const weekday=new Date(value+'T12:00:00Z').getUTCDay();return weekday!==0&&weekday!==6&&HOLIDAYS[value]?.country!=='KR';});
  for(const id of ['whole','left','last','right','outside']){const expected=id==='whole'?working:id==='left'?working.filter(value=>value.endsWith('-01')):['last','right'].includes(id)?working.filter(value=>Number(value.slice(-2))===length):[];assert.deepEqual(dates.get(id)||[],expected,`${id}: 월 경계와 휴무일을 모두 보존해야 합니다.`);}
  assert.ok(html.includes('schedule-calendar-scrollport') && html.includes('tabindex="0"'), '스크롤 영역은 키보드로 진입할 수 있어야 합니다.');
  return { month, headerDays: headers.length, first: headers[0], last: headers.at(-1), minimumWidth: minimum, clippedBars: Object.fromEntries(bounds), outsideBars: 0 };
}
async function check(name, fn) {
  try { const observed = await fn(); results.push({ name, status: 'PASS', observed }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', reason: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}
try {
  const { default: ProjectCalendar } = await server.ssrLoadModule('/src/components/ProjectCalendar.tsx');
  const { useProjectStore: projects } = await server.ssrLoadModule('/src/store/useProjectStore.ts');
  const { useAuthStore: auth } = await server.ssrLoadModule('/src/store/useAuthStore.ts');
  const { usePersonalStore: personal } = await server.ssrLoadModule('/src/store/usePersonalStore.ts');
  const { useLanguageStore: language } = await server.ssrLoadModule('/src/store/useLanguageStore.ts');
  const work = await server.ssrLoadModule('/src/utils/personalWork.ts');
  const extensionPeriods = await server.ssrLoadModule('/src/utils/scheduleExtensionPeriods.ts');
  const postDeliveryVisibility = await server.ssrLoadModule('/src/utils/postDeliveryVisibility.ts');
  const staff = await server.ssrLoadModule('/src/utils/staffOrder.ts');
  const holidays = await server.ssrLoadModule('/src/constants/holidays.ts');
  const workCalendar=await server.ssrLoadModule('/src/utils/workCalendar.ts'),workCalendarDisplay=await server.ssrLoadModule('/src/utils/workCalendarDisplay.ts');
  const { VIET_TEAMS_DATA } = await server.ssrLoadModule('/src/data/vietTeams.ts');
  const excel = await server.ssrLoadModule('/src/services/excelService.ts');
  const state = (store, value) => { Object.assign(store.getInitialState(), value); store.setState(value); };
  const personalText = readFileSync(personalSource || new URL('../src/components/PersonalScheduleView.tsx', import.meta.url), 'utf8');
  const hook = store => Object.assign(selector => typeof selector === 'function' ? selector(store.getState()) : store.getState(), { getState: store.getState });
  function personalCalendar(date) {
    let cursor = 0, tree;
    const hooks = [];
    const mockReact = { ...React, useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: index === 1 ? date : typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; }, useMemo: fn => fn() };
    const modules = { react: mockReact, 'react/jsx-runtime': jsx, 'date-fns': require('date-fns'), 'date-fns/locale': require('date-fns/locale'), 'lucide-react': require('lucide-react'), '../store/useProjectStore': { useProjectStore: hook(projects) }, '../store/useAuthStore': { useAuthStore: hook(auth) }, '../store/usePersonalStore': { usePersonalStore: hook(personal) }, '../store/useLanguageStore': { useLanguageStore: hook(language) }, '../utils/personalWork': work, '../utils/staffOrder': staff, '../utils/vietPersonnel': vietPersonnel, '../data/vietTeams': { VIET_TEAMS_DATA }, '../constants/holidays': holidays, './VietTeamModal': { VietTeamModal: () => null }, './ProjectCalendar': { default: ProjectCalendar }, '../services/excelService': excel };
    modules['../utils/scheduleExtensionPeriods'] = extensionPeriods;
    modules['../utils/postDeliveryVisibility'] = postDeliveryVisibility;
    modules['../utils/workCalendar']=workCalendar;modules['../utils/workCalendarDisplay']=workCalendarDisplay;
    const exports = {};
    runInNewContext(ts.transpileModule(personalText, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports, Date, console, require(id) { assert.ok(id in modules, '예상하지 못한 개인 캘린더 의존성: ' + id); return modules[id]; } });
    const render = () => { cursor = 0; tree = exports.PersonalScheduleView({ department: '마감팀' }); };
    render();
    const toggle = nodes(tree).find(node => node.type === 'button' && String(node.props.children).includes('개인/팀별 캘린더'));
    assert.ok(toggle); toggle.props.onClick(); render();
    return renderToStaticMarkup(tree);
  }
  for (const [year, month, length] of [[2026, 10, 31], [2026, 9, 30], [2026, 2, 28], [2028, 2, 29]]) {
    const date = new Date(year, month - 1, 1), records = fixture(date, length);
    state(projects, { projects: records, personnel: [{ id: person.id, name: person.name, region: 'KOREA', team: '마감팀', avatar: '' }], filterDepartment: '마감팀', selectedProjectId: null });
    state(auth, { users: [person], currentUser: person, isAuthenticated: true }); state(personal, { leaves: [], checks: [] }); state(language, { lang: 'ko' });
    await check(`프로젝트 ${year}-${String(month).padStart(2, '0')} ${length}일·월 경계 clip·말일`, () => calendarGeometry(renderToStaticMarkup(createElement(ProjectCalendar, { date })), date, length, 410));
    await check(`개인 ${year}-${String(month).padStart(2, '0')} ${length}일·월 경계 clip·말일`, () => calendarGeometry(personalCalendar(date), date, length, 280));
  }
  assert.equal(externalRequests, 0, '원격 요청이 없어야 합니다.');
} finally { globalThis.fetch = originalFetch; await server.close(); }
const report = { kind: 'ACTUAL_CALENDAR_SSR_SYNTHETIC', protectedCalendar: Boolean(calendarSource), protectedPersonal: Boolean(personalSource), externalRequests, productWrites: 0, results, limits: ['실제 컴포넌트와 날짜 계산을 합성 자료로 렌더했습니다. 창 크기·스크롤·가독성은 별도 실제 브라우저 검수 대상입니다.'] };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
