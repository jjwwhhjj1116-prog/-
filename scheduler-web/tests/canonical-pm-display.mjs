import assert from 'node:assert/strict';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const protectedRoot = argument('before-root'), results = [], originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { localStorage: globalThis.localStorage };
let externalRequests = 0;
globalThis.fetch = async () => { externalRequests++; throw Error('PM 표시 검수는 외부 요청을 하지 않습니다.'); };
const protectedFiles = ['src/components/ProjectIntegratedModal.tsx', 'src/components/ProjectDetailPrint.tsx', 'src/services/excelService.ts'];
const server = await createServer({ plugins: protectedRoot ? [{ name: 'protected-canonical-pm-display', enforce: 'pre', load(id) {
  const relative = protectedFiles.find(file => id.replaceAll('\\', '/').endsWith('/' + file));
  if (relative) return readFileSync(join(protectedRoot, 'scheduler-web', relative), 'utf8');
} }] : [], server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const owner = { id: 'pm-canonical102', no: 85102, name: '합성 PM 실명', position: '수석', department: '마감팀', originalDept: '마감팀', company: '컨코스트', active: true, email: 'qa-pm@example.invalid', idPrefix: 'pm-canonical102' };
const worker = { ...owner, id: 'trade-canonical102', no: 85103, name: '합성 공종 담당', idPrefix: 'trade-canonical102' };
const period = (id, startDate, endDate) => ({ id, personIds: [owner.id], startDate, endDate, memo: `PM 원문 ${id}` });
const project = { id: 'qa-canonical-pm102', code: 'QA-CANONICAL-102', name: '[합성] global PM 공백·canonical 개인 배정', department: '마감팀', pmId: '', startDate: '2026-09-07', endDate: '2026-09-11', progress: 35, status: '진행중', roles: {}, subTasks: {
  PM: { roleName: 'PM', personId: owner.id, personIds: [owner.id], startDate: '2026-09-07', endDate: '2026-09-11', status: '진행중', memo: '원 PM 업무', allocations: [period('pm-seven', '2026-09-07', '2026-09-08'), period('pm-ten', '2026-09-10', '2026-09-11')] },
  내부: { roleName: '내부', personId: worker.id, personIds: [worker.id], startDate: '2026-09-07', endDate: '2026-09-11', status: '진행중', memo: '원 산출 업무', progress: 35 },
}, postDeliveryTasks: [] };
const people = [owner, worker].map(person => ({ ...person, team: person.department, region: 'KOREA', avatar: '' }));
const snapshot = structuredClone(project), state = (store, values) => { Object.assign(store.getInitialState(), values); store.setState(values); };
const plain = html => html.replace(/<!--.*?-->|<[^>]*>/gs, '');
async function check(name, fn) {
  try { const observed = await fn(); results.push({ name, status: 'PASS', observed }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, status: 'FAIL', reason: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}
try {
  const { useProjectStore: projects } = await server.ssrLoadModule('/src/store/useProjectStore.ts');
  const { useAuthStore: auth } = await server.ssrLoadModule('/src/store/useAuthStore.ts');
  const { ProjectIntegratedModal } = await server.ssrLoadModule('/src/components/ProjectIntegratedModal.tsx');
  const { ProjectDetailPrint } = await server.ssrLoadModule('/src/components/ProjectDetailPrint.tsx');
  const { buildProjectsWorkbook, buildProjectRangeWorkbook } = await server.ssrLoadModule('/src/services/excelService.ts');
  const { assignedTasks, assignedItems } = await server.ssrLoadModule('/src/utils/personalWork.ts');
  state(projects, { projects: [project], personnel: people }); state(auth, { users: [owner, worker], currentUser: owner });
  await check('통합 상세: global pmId 공백이어도 실제 PM 실명·직급 표시, 신규 미배정 오경고 없음', () => {
    const html = renderToStaticMarkup(createElement(ProjectIntegratedModal, { projectCode: project.code, onClose() {} }));
    assert.ok(html.includes(owner.name + ' (수석)'));
    assert.ok(!html.includes('신규 프로젝트 · PM 및 담당 인원 배정이 필요합니다.'));
    assert.deepEqual(project, snapshot); assert.deepEqual(projects.getState().projects[0], snapshot);
    return { shownPM: owner.name, falseUnassignedBanner: false, dataUnchanged: true };
  });
  await check('상세 인쇄: canonical PM 실명·원2구간, 명시해제 stale 억제·빈alloc 책임자와 개인Task0 보존', () => {
    const render = p => renderToStaticMarkup(createElement(ProjectDetailPrint, { project: p, people: [...people, { id: 'stale', name: '해제 임시인원' }], leaves: [], onClose() {} }));
    const html = render(project); assert.ok(plain(html).includes('담당 PM: ' + owner.name));
    assert.deepEqual([...html.matchAll(/data-schedule-date="([^"]+)" data-trade="PM"/g)].map(match => match[1]), ['2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11']);
    const clear = { ...structuredClone(project), pmId: 'stale' };Object.assign(clear.subTasks.PM,{personId:'stale',personIds:[],allocations:[]});
    assert.ok(!render(clear).includes('해제 임시인원'));
    const master = structuredClone(project); master.subTasks.PM.allocations = [];
    assert.ok(plain(render(master)).includes('담당 PM: ' + owner.name)); assert.ok(!render(master).includes('data-trade="PM"'));
    assert.equal(assignedTasks(owner.id,[master]).length,0);assert.equal(assignedItems(owner.id,'2026-09-09',[project]).length,0);
    assert.deepEqual(project, snapshot);
    return { shownPM: owner.name, sourcePMDays: 4, clearedMemberHidden: true, emptyAllocationTaskCount: 0 };
  });
  await check('프로젝트명 한국어 고정: 실제 통합·인쇄·QC 선택·질의·업무일지 SSR 보호, 일반 라벨 유지', async()=>{
    const {useStudioStore:studio}=await server.ssrLoadModule('/src/store/useStudioStore.ts');
    const {useLanguageStore:language}=await server.ssrLoadModule('/src/store/useLanguageStore.ts');
    const {QCLinkView}=await server.ssrLoadModule('/src/components/QCLinkView.tsx');
    const {ProjectInquiries}=await server.ssrLoadModule('/src/components/ProjectInquiries.tsx');
    const {WorkLogProjectSummary}=await server.ssrLoadModule('/src/components/WorkLogReporting.tsx');
    state(studio,{ready:true,actorId:owner.id});state(language,{lang:'vi'});
    const protectedNames=html=>[...html.matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-no-translate(?:="[^"]*")?[^>]*>([^<]*)<\/\1>/g)].map(match=>match[2]);
    const intakeProjects=[{id:'intake-canonical102',no:85102,code:project.code,name:project.name,client:'',targetDepartments:[project.department]}];
    const cases=[['integrated',ProjectIntegratedModal,{projectCode:project.code,onClose(){}}],['detail-print',ProjectDetailPrint,{project,people,leaves:[],onClose(){}}],['QC-select',QCLinkView,{intakeProjects}],['inquiries',ProjectInquiries,{department:project.department,initialProjectId:project.id,intakeProjects}],['worklog-summary',WorkLogProjectSummary,{project,logs:[],date:'2026-09-09'}]];
    for(const [name,Component,props]of cases){const html=renderToStaticMarkup(createElement(Component,props)),protectedText=protectedNames(html);assert.ok(protectedText.some(text=>text.includes(project.name)),name+' projectname must be excluded from VI translation');assert.ok(!protectedText.some(text=>text==='프로젝트 상세 일정표'||text==='프로젝트 질의사항'||text==='전체 프로젝트 진행률'),name+' general labels stay translatable');}
    state(language,{lang:'ko'});assert.deepEqual(project,snapshot);
    return {surfaces:cases.map(([name])=>name),language:'vi',projectName:project.name,originalProjectUnchanged:true};
  });
  await check('실제 Excel 월간·범위 workbook roundtrip: canonical PM 열 표시와 복원 원문 보존', () => {
    for (const workbook of [buildProjectsWorkbook([project],people,new Date(2026,8,1)),buildProjectRangeWorkbook([project],people,new Date(2026,8,1),3,[])]) {
      const saved = XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
      const timeline = XLSX.utils.sheet_to_json(saved.Sheets[saved.SheetNames[0]],{header:1});
      assert.ok(timeline[3],'유효한 공종 배정 기간이 있는 프로젝트는 월간 행에 포함되어야 합니다.');
      assert.equal(timeline[3][5], owner.name);
      const summary = XLSX.utils.sheet_to_json(saved.Sheets['프로젝트통합요약']);assert.equal(summary[0]['마감팀 PM'],owner.name);
      const restore = XLSX.utils.sheet_to_json(saved.Sheets['복원데이터']);assert.equal(restore.length,1);assert.deepEqual(JSON.parse(restore[0].data),snapshot);
    }
    assert.deepEqual(project, snapshot);
    return { outputs: ['monthly-xlsx','3-month-range-xlsx'], shownPM: owner.name, originalGlobalPMIdStillEmpty: project.pmId === '' };
  });
  await check('Excel 공종 기간: 프로젝트 원문 날짜 공백·PM 지정이어도 유효한 실제 배정의 월간·3개월·복원 포함',()=>{
    const taskOnly={...structuredClone(project),pmId:owner.id,startDate:'',endDate:''};
    const original=structuredClone(taskOnly);
    for(const workbook of [buildProjectsWorkbook([taskOnly],people,new Date(2026,8,1)),buildProjectRangeWorkbook([taskOnly],people,new Date(2026,8,1),3,[])]){
      const saved=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
      const timeline=XLSX.utils.sheet_to_json(saved.Sheets[saved.SheetNames[0]],{header:1});
      assert.ok(timeline[3],'프로젝트 날짜가 공백이어도 유효한 공종 기간의 행은 누락되면 안 됩니다.');
      assert.equal(timeline[3][1],taskOnly.code);assert.equal(timeline[3][5],owner.name);assert.equal(timeline[3][6],'2026-09-07');assert.equal(timeline[3][7],'2026-09-11');
      const restore=XLSX.utils.sheet_to_json(saved.Sheets['복원데이터']);assert.equal(restore.length,1);assert.deepEqual(JSON.parse(restore[0].data),original);
    }
    assert.deepEqual(taskOnly,original);
    return {outputs:['monthly-xlsx','3-month-range-xlsx'],taskOnlyDatesIncluded:true,originalDateFieldsStillEmpty:true};
  });
} finally { globalThis.fetch = originalFetch; await server.close(); }
const report = { kind: 'ACTUAL_CANONICAL_PM_UI_AND_XLSX_SYNTHETIC', protectedOriginal: Boolean(protectedRoot), externalRequests, productWrites: 0, results, limits: ['통합·인쇄 SSR와 실제 workbook XLSX 저장 후 재열기 검수입니다. 운영 브라우저와 실제 Excel 원본 대조는 root 검수 범위입니다.'] };
if(argument('output'))writeFileSync(argument('output'),JSON.stringify(report,null,2)+'\n');
if(externalRequests||results.some(result=>result.status==='FAIL'))process.exitCode=1;
