import assert from 'node:assert/strict';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
globalThis.window = {localStorage:globalThis.localStorage};
const excelSource=process.argv.find(arg=>arg.startsWith('--excel-source='))?.slice('--excel-source='.length),onlyRangeSummary=process.argv.includes('--only-range-summary'),integratedSource=process.argv.find(arg=>arg.startsWith('--integrated-source='))?.slice('--integrated-source='.length),onlyIntegratedAlias=process.argv.includes('--only-integrated-alias');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:`test-results/${process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'regression'}.json`;
const personalSource=process.argv.find(arg=>arg.startsWith('--personal-source='))?.slice('--personal-source='.length),onlyPersonalOverlap=process.argv.includes('--only-personal-overlap');
const meetingSource=process.argv.find(arg=>arg.startsWith('--meeting-source='))?.slice('--meeting-source='.length),minutesSource=process.argv.find(arg=>arg.startsWith('--minutes-source='))?.slice('--minutes-source='.length),onlyMinutesOutput=process.argv.includes('--only-minutes-output');
const qcSource=process.argv.find(arg=>arg.startsWith('--qc-source='))?.slice('--qc-source='.length),onlyQCLink=process.argv.includes('--only-qc-link');
const server = await createServer({ssr:{noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),{name:'protected-regression-source',enforce:'pre',load(id){if(meetingSource&&id.replaceAll('\\','/').endsWith('/src/services/meetingExcel.ts'))return readFileSync(meetingSource,'utf8');if(excelSource&&id.replaceAll('\\','/').endsWith('/src/services/excelService.ts'))return readFileSync(excelSource,'utf8');if(integratedSource&&id.replaceAll('\\','/').endsWith('/src/components/ProjectIntegratedModal.tsx'))return readFileSync(integratedSource,'utf8');if(id.replaceAll('\\','/').endsWith('/src/components/PersonalScheduleView.tsx')){
 // SSR cannot click the tab. Only its initial tab is selected in memory; the product default and overlap calculation are unchanged.
 const source=readFileSync(personalSource||new URL('../src/components/PersonalScheduleView.tsx',import.meta.url),'utf8');return source.replace(/useState<'PERSONAL'\s*\|\s*'TEAM'>\('TEAM'\)/,"useState<'PERSONAL' | 'TEAM'>('PERSONAL')");
}}}], server: { middlewareMode: true, hmr:false }, appType: 'custom' });
const results = [];
async function check(name, fn) { if(onlyRangeSummary&&!name.startsWith('범위요약')||onlyIntegratedAlias&&!name.startsWith('통합상세 명부')||onlyPersonalOverlap&&!name.startsWith('개인캘린더 중복')||onlyMinutesOutput&&!name.startsWith('회의록 출력 경계')||onlyQCLink&&!name.startsWith('QC 프로젝트 전달'))return;try { await fn(); results.push({name, status:'PASS'}); } catch(e) { results.push({name,status:'FAIL',reason:e.message}); } }
try {
  const { useProjectStore: projects, syncProjectTasks } = await server.ssrLoadModule('/src/store/useProjectStore.ts');
  const { useWorkLogStore: logs } = await server.ssrLoadModule('/src/store/useWorkLogStore.ts');
  const { extractAiMeetingSummary: summarize } = await server.ssrLoadModule('/src/services/meetingExcel.ts');
  const { useAuthStore: auth } = await server.ssrLoadModule('/src/store/useAuthStore.ts');
  auth.setState({currentUser:{id:'u_12', name:'조한빈', department:'마감팀', position:'실장'}});
  const sub = {roleName:'PM',personId:'qa-a',personIds:['qa-a'],startDate:'2026-09-01',endDate:'2026-09-30',status:'예정',memo:''};
  const project = {id:'qa-f',code:'QA-001',name:'검수 전용',department:'마감팀',pmId:'qa-a',startDate:'2026-09-01',endDate:'2026-09-30',progress:0,status:'진행중',subTasks:{PM:sub},roles:{PM:sub}};
  await check('PM 마지막 인원 해제', () => {
    projects.setState({projects:[structuredClone(project)]});
    projects.getState().updateProjectSubTasks('qa-f',{PM:{...sub,personId:'',personIds:[]}});
    assert.equal(projects.getState().projects[0].pmId,'');
  });
  await check('단일 공종 변경에서도 PM 해제', () => {
    projects.setState({projects:[structuredClone(project)]});
    projects.getState().updateSubTask('qa-f','PM',{personId:'',personIds:[]});
    assert.equal(projects.getState().projects[0].pmId,'');
  });
  await check('PM 공종이 없는 기존 프로젝트에서 다른 공종 편집 시 PM 유지', () => {
    projects.setState({projects:[{...structuredClone(project),subTasks:{외부:{...sub,roleName:'외부'}},roles:{}}]});
    projects.getState().updateProjectSubTasks('qa-f',{외부:{...sub,roleName:'외부',memo:'변경 도면'}});
    assert.equal(projects.getState().projects[0].pmId,'qa-a');
  });
  await check('PM 공종이 없는 기존 프로젝트의 단일 공종 편집 시 PM 유지', () => {
    projects.setState({projects:[{...structuredClone(project),subTasks:{외부:{...sub,roleName:'외부'}},roles:{}}]});
    projects.getState().updateSubTask('qa-f','외부',{memo:'변경 도면'});
    assert.equal(projects.getState().projects[0].pmId,'qa-a');
  });
  await check('다른 공종 편집 시 기존 roles 전용 배정 인원·기간 유지', () => {
    const old={...structuredClone(project),subTasks:{외부:{...sub,roleName:'외부'}},roles:{PM:{personId:'qa-a',startDate:project.startDate,endDate:project.endDate},창호:{personId:'qa-legacy',startDate:project.startDate,endDate:project.endDate}}};
    projects.setState({projects:[old]});projects.getState().updateSubTask('qa-f','외부',{memo:'외부 변경'});
    const result=projects.getState().projects[0];assert.deepEqual(result.roles.창호,old.roles.창호);assert.equal(logs.getState().generateItemsFromSchedule('qa-legacy','2026-09-23',[result]).length,1);
  });
  await check('공종 저장은 미보고 구형 공종이 있으면 기존 전체실적·PM을 유지하고 canonical 공종을 우선', () => {
    const role={personId:'qa-a',startDate:project.startDate,endDate:project.endDate};
    const old={...structuredClone(project),progress:37,subTasks:{},roles:{PM:role,창호:{...role,personId:'qa-legacy'},외부:{...role,personId:'qa-old',progress:90}}};
    const tasks={외부:{...sub,roleName:'외부',personId:'qa-new',personIds:['qa-new'],progress:40}};
    const result=syncProjectTasks(old,tasks);
    assert.equal(result.progress,37);assert.equal(result.pmId,'qa-a');
    assert.deepEqual(result.roles.PM,old.roles.PM);assert.deepEqual(result.roles.창호,old.roles.창호);
    assert.equal(result.subTasks.외부.progress,40);assert.equal(result.roles.외부.personId,'qa-new');
    const reported=syncProjectTasks({...old,roles:{...old.roles,창호:{...old.roles.창호,progress:80}}},tasks);
    assert.equal(reported.progress,60);assert.equal(old.progress,37);assert.equal(old.roles.외부.progress,90);
  });
  await check('명시적으로 삭제한 PM 공종의 이전 역할·PM 배정 제거', () => {
    projects.setState({projects:[structuredClone(project)]});projects.getState().updateProjectSubTasks('qa-f',{외부:{...sub,roleName:'외부'}});
    const result=projects.getState().projects[0];assert.equal(result.pmId,'');assert.equal(result.roles.PM,undefined);
  });
  await check('미배정자는 자동 업무 0건', () => assert.equal(logs.getState().generateItemsFromSchedule('QA 미배정','2026-09-23',[project]).length,0));
  await check('일정 기준 보고 진행률 85%와 원본 실제 진척률 0% 분리', () => {
    const original=structuredClone(project),report=logs.getState().generateItemsFromSchedule('qa-a','2026-09-23',[project])[0];
    assert.equal(report.progress,85,'보고 기본값은 해당 날짜까지의 일정 기준 진척률');
    assert.equal(project.progress,0,'승인되지 않은 보고 기본값을 원본 실제 진척률에 반영하지 않음');
    assert.ok(!report.manualFields.includes('progress'),'일정 기본값을 수기 실제 진척률로 표시하지 않음');
    assert.deepEqual(project,original,'원본 프로젝트·배정·기간을 그대로 보존');
  });
  await check('기간 밖 업무 제외', () => assert.equal(logs.getState().generateItemsFromSchedule('qa-a','2026-12-01',[project]).length,0));
  await check('원문에 없는 Rev와 결정사항 생성 금지', () => {
    const result = summarize('회의 일정은 아직 정하지 않았습니다.','QA');
    assert.ok(!result.summary.includes('Rev.3'));
    assert.equal(result.decisions.length,0);
  });
  await check('중복 프로젝트 등록 차단', () => {
    projects.setState({projects:[structuredClone(project)]});
    try { projects.getState().addProject(project); } catch { /* 명시적 거부 허용 */ }
    assert.equal(projects.getState().projects.length,1);
  });
  const {workDays,scheduleProgress,projectProgress,projectScheduleRange} = await server.ssrLoadModule('/src/utils/scheduleProgress.ts');
  await check('추석과 주말 제외 작업일',()=>assert.equal(workDays('2026-09-21','2026-09-30'),6));
  await check('2026년 추가 공휴일과 연간 작업일',()=>{
    assert.equal(workDays('2026-04-30','2026-05-04'),2);
    assert.equal(workDays('2026-07-16','2026-07-20'),2);
    assert.equal(workDays('2026-01-01','2026-12-31'),245);
  });
  await check('2027년 대체공휴일과 연도 경계 작업일',()=>{
    assert.equal(workDays('2026-12-31','2027-01-05'),3);
    assert.equal(workDays('2027-05-01','2027-05-05'),1);
    assert.equal(workDays('2027-07-17','2027-07-20'),1);
    assert.equal(workDays('2027-01-01','2027-12-31'),246);
  });
  await check('역전 기간과 존재하지 않는 날짜 거부',()=>{
    assert.equal(workDays('2026-09-30','2026-09-21'),undefined);
    assert.equal(workDays('2026-02-30','2026-03-02'),undefined);
  });
  const trades={조적:{...sub,roleName:'조적',startDate:'2026-09-21',endDate:'2026-09-23',progress:100},창호:{...sub,roleName:'창호',startDate:'2026-09-28',endDate:'2026-09-28',progress:0}};
  await check('작업일 가중 계획과 실제 분리',()=>{
    const result=scheduleProgress({...trades,PM:sub},'2026-09-22');
    assert.equal(result.days,4); assert.equal(result.planned,50); assert.equal(result.actual,75);
  });
  await check('미입력 실제 공정률을 0으로 간주하지 않음',()=>assert.equal(scheduleProgress({...trades,창호:{...trades.창호,progress:undefined}}).actual,undefined));
  await check('연도 경계의 계획·실제 공정률',()=>{
    const result=scheduleProgress({조적:{...sub,startDate:'2026-12-31',endDate:'2027-01-05',progress:40}},'2027-01-04');
    assert.equal(result.days,3);assert.ok(Math.abs(result.planned-200/3)<1e-10);assert.equal(result.actual,40);
  });
  await check('미확인 연도 계획 미산정',()=>assert.equal(scheduleProgress({조적:{...sub,startDate:'2028-01-01',endDate:'2028-01-05'}}).planned,undefined));
  const {dayOff,assignedItems,assignedTasks,assignedTasksForAliases}=await server.ssrLoadModule('/src/utils/personalWork.ts');
  await check('개인 일정은 정식 공종을 우선하고 빈 기간은 프로젝트 기간 사용',()=>{
    const p={...project,roles:{창호:{personId:'qa-old',startDate:'2026-08-01',endDate:'2026-12-31'}},subTasks:{창호:{...sub,roleName:'창호',startDate:'',endDate:''}}};
    const before=structuredClone(p),rows=assignedTasksForAliases(['qa-a','qa-old'],[p]);
    assert.equal(rows.length,1);assert.equal(rows[0].startDate,p.startDate);assert.equal(rows[0].endDate,p.endDate);
    assert.deepEqual(p,before);
  });
  await check('직원 번호·이름 별칭은 같은 업무를 중복하지 않고 계정 기준 보고 설정 유지',()=>{
    const p={...project,subTasks:{창호:{...sub,roleName:'창호',personIds:['qa-a','12','검수 직원'],reportingModes:{'qa-a':'TASK','12':'DAILY'}}},roles:{}};
    const rows=assignedTasksForAliases(['qa-a','12','검수 직원','qa-a',''],[p]);
    assert.equal(rows.length,1);assert.equal(rows[0].reportingMode,'TASK');
    assert.deepEqual(rows,assignedTasks('qa-a',[p]));
  });
  await check('납품 후 같은 종류 수정도 개별 ID·기간을 유지하고 원 납품일 보존',()=>{
    const p={...project,postDeliveryTasks:[{id:'follow-1',kind:'수정',personIds:['qa-a','12'],startDate:'2026-10-05',endDate:'2026-10-06',memo:'변경 도면',status:'예정'},{id:'follow-2',kind:'수정',personIds:['12'],startDate:'2026-10-12',endDate:'2026-10-12',memo:'수량 재검토',status:'진행중'}]};
    const before=structuredClone(p),rows=assignedTasksForAliases(['qa-a','12'],[p]);
    assert.deepEqual(rows.map(row=>row.id),['gen-qa-f-PM','gen-qa-f-followup-follow-1','gen-qa-f-followup-follow-2']);
    assert.deepEqual(rows.map(row=>[row.startDate,row.endDate]),[['2026-09-01','2026-09-30'],['2026-10-05','2026-10-06'],['2026-10-12','2026-10-12']]);
    assert.deepEqual(p,before);
  });
  await check('선택 담당자 배열 undefined는 단일 담당 사용, 명시적 빈 배열은 배정 해제 유지',()=>{
    const p={...project,subTasks:{PM:{...sub,personIds:undefined}},roles:{}};
    assert.equal(assignedTasks('qa-a',[p]).length,1);
    assert.equal(assignedTasksForAliases(['qa-a'],[{...p,subTasks:{PM:{...sub,personIds:[]}}}]).length,0);
  });
  await check('2027년 공휴일의 할 일 자동 배정 제외',()=>{
    assert.equal(dayOff('2027-05-03'),'노동절 대체공휴일');
    assert.equal(assignedItems('qa-a','2027-05-03',[{...project,startDate:'2027-05-01',endDate:'2027-05-05',subTasks:{PM:{...sub,startDate:'2027-05-01',endDate:'2027-05-05'}}}]).length,0);
  });
  await check('일반 직원 일정 변경 차단',()=>{
    auth.setState({currentUser:{id:'qa-member',name:'검수',department:'마감팀',position:'프로'}});
    assert.throws(()=>projects.getState().updateSubTask('qa-f','PM',{personIds:[]}));
    assert.equal(projects.getState().projects[0].pmId,'qa-a');
  });
  auth.setState({currentUser:{id:'u_12',name:'조한빈',department:'마감팀',position:'실장'}});
  await check('프로젝트 변경 저장 기록',()=>{
    projects.getState().updateSubTask('qa-f','PM',{memo:'보존 확인'});
    const saved=JSON.parse(data.get('concost_projects_data_v2'));
    assert.equal(saved.state.projects[0].subTasks.PM.memo,'보존 확인');
  });
  const {buildProjectsWorkbook,buildProjectRangeWorkbook,parseProjectsWorkbook} = await server.ssrLoadModule('/src/services/excelService.ts');
  const {buildMeetingWorkbook,rebuildTranslatedMeetingWorkbook,writeMeetingWorkbook,downloadMeetingWorkbook,readMeetingBody} = await server.ssrLoadModule('/src/services/meetingExcel.ts');
  const XLSX = await import('xlsx');
  await check('구형 역할 연장 후 다음 달 프로젝트 범위와 월간 출력 포함',()=>{
    const extended={...project,subTasks:{},roles:{창호:{personId:'qa-a',startDate:'2026-09-21',endDate:'2026-10-08'}}};
    assert.deepEqual(projectScheduleRange(extended),{start:'2026-09-01',end:'2026-10-08'});
    const wb=buildProjectRangeWorkbook([extended],[],new Date(2026,9,1),1);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['복원데이터']).length,1);
  });
  await check('같은 공종 범위는 subTasks를 우선하고 이전 roles 기간은 제외',()=>{
    const current={...project,roles:{창호:{personId:'qa-old',startDate:'2026-08-01',endDate:'2026-12-31'}},subTasks:{창호:{...sub,roleName:'창호',startDate:'2026-09-21',endDate:'2026-10-02'}}};
    assert.deepEqual(projectScheduleRange(current),{start:'2026-09-01',end:'2026-10-02'});
  });
  await check('구형 역할 범위 확장 후 원납품일·실적·별도 후속 일정 보존',()=>{
    const follow={id:'range-follow',kind:'수정',startDate:'2026-11-02',endDate:'2026-11-03',memo:'별도 변경 도면',personIds:['qa-a'],status:'예정'};
    const original={...project,progress:73,subTasks:{},roles:{창호:{personId:'qa-a',startDate:'2026-09-21',endDate:'2026-10-08'}},postDeliveryTasks:[follow]};
    const before=structuredClone(original);
    assert.deepEqual(projectScheduleRange(original),{start:'2026-09-01',end:'2026-10-08'});
    const wb=buildProjectRangeWorkbook([original],[],new Date(2026,10,1),1);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['납품후검토수정']).length,1);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['복원데이터']).length,1);
    assert.deepEqual(original,before);
  });
  await check('구형 단일 역할 실제 공정률과 원프로젝트 기간 fallback',()=>{
    const legacy={...project,subTasks:{},roles:{창호:{personId:'qa-a',startDate:'',endDate:'',progress:40}}};
    const result=projectProgress(legacy,'2026-09-22');
    assert.equal(result.actual,40);assert.equal(result.days,workDays(project.startDate,project.endDate));
    assert.deepEqual(projectScheduleRange(legacy),{start:project.startDate,end:project.endDate});
  });
  await check('구형 역할 일부만 실적 보고되면 다른 미보고 공종을 제외하지 않음',()=>{
    const legacy={...project,subTasks:{창호:{...sub,roleName:'창호',progress:40}},roles:{창호:{personId:'qa-a',startDate:project.startDate,endDate:project.endDate},외부:{personId:'qa-b',startDate:project.startDate,endDate:project.endDate}}};
    const result=projectProgress(legacy,'2026-09-22');
    assert.equal(result.actual,undefined);assert.equal(result.days,2*workDays(project.startDate,project.endDate));
  });
  await check('동일 기간 구형 두 공종 40·80은 기존 작업일 가중치로 60 반영',()=>{
    const legacy={...project,subTasks:{},roles:{창호:{personId:'qa-a',startDate:project.startDate,endDate:project.endDate,progress:40},외부:{personId:'qa-b',startDate:project.startDate,endDate:project.endDate,progress:80}}};
    assert.equal(projectProgress(legacy,'2026-09-22').actual,60);
    assert.equal(projectProgress({...legacy,subTasks:{창호:{...sub,roleName:'창호',progress:20}}},'2026-09-22').actual,50);
  });
  await check('XLSX 왕복 후 다중인원 공종 유형 수정이력 보존',()=>{
    const rich={...project,subTasks:{...trades,PM:{...sub,personIds:['qa-a','qa-b'],subType:'설계예가'}},revisions:[{id:'r1',round:1,date:'2026-09-01',memo:'원문'}]};
    const wb=buildProjectsWorkbook([rich],[],new Date(2026,8,1));
    const read=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
    assert.deepEqual(parseProjectsWorkbook(read),[rich]);
  });
  await check('검증 불가능한 Excel은 가져오기 중단',()=>assert.throws(()=>parseProjectsWorkbook(XLSX.utils.book_new())));
  await check('3개월 출력에 다음 달 전용 프로젝트 포함',()=>{
    const next={...project,id:'qa-next',code:'QA-002',startDate:'2026-10-01',endDate:'2026-10-30',subTasks:{}};
    const wb=buildProjectRangeWorkbook([project,next],[],new Date(2026,8,1),3);
    assert.equal(wb.SheetNames.filter(n=>n.includes('타임라인')).length,3);
    assert.equal(parseProjectsWorkbook(wb).length,2);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['프로젝트통합요약']).length,2);
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['계획실적']).length,2);
  });
  const summaryFixture=()=>['마감팀','구조팀','토목&조경팀'].map((department,index)=>{const startDate=`2026-${String(9+index).padStart(2,'0')}-01`,endDate=`2026-${String(9+index).padStart(2,'0')}-${index===1?31:30}`,id='range-'+index;return {id,code:'QA-RANGE-SHARED',name:'합성 부서 통합 현장',department,pmId:id,startDate,endDate,status:'진행중',progress:index*20,roles:{},subTasks:{작업:{roleName:'작업',personId:id,personIds:[id],startDate,endDate,status:'진행중',memo:'원 수행 일정',progress:index*20}}};});
  const summaryPeople=[{id:'range-0',name:'합성 마감 PM',team:'마감팀'},{id:'range-1',name:'합성 구조 PM',team:'구조팀'},{id:'range-2',name:'합성 토목 PM',team:'토목&조경팀'}],summaryLabels=['마감팀','구조팀','토목팀'];
  const summaryRow=wb=>XLSX.utils.sheet_to_json(wb.Sheets['프로젝트통합요약'])[0];
  await check('범위요약 분리월: 같은 코드의 3부서 PM·기간·실적은 3개월 병합에서도 월간값 유지',()=>{
    const fixture=summaryFixture(),combined=summaryRow(buildProjectRangeWorkbook(fixture,summaryPeople,new Date(2026,8,1),3));
    for(let i=0;i<fixture.length;i++){const single=summaryRow(buildProjectRangeWorkbook([fixture[i]],summaryPeople,new Date(2026,8+i,1),1));for(const suffix of [' PM',' 일정',' 진척률'])assert.equal(combined[summaryLabels[i]+suffix],single[summaryLabels[i]+suffix],summaryLabels[i]+suffix+' must retain the monthly value');}
    assert.equal(combined['마감팀 진척률'],'0%');
  });
  await check('범위요약 반례: 겹친월 통합 값과 실제 비해당 부서의 표시 원형 유지',()=>{
    const fixture=summaryFixture().map(p=>({...p,startDate:'2026-09-01',endDate:'2026-09-30',subTasks:{작업:{...p.subTasks.작업,startDate:'2026-09-01',endDate:'2026-09-30'}}})),visible=row=>Object.fromEntries(Object.entries(row).filter(([,value])=>value!==''));assert.deepEqual(visible(summaryRow(buildProjectRangeWorkbook(fixture,summaryPeople,new Date(2026,8,1),3))),visible(summaryRow(buildProjectRangeWorkbook(fixture,summaryPeople,new Date(2026,8,1),1))));
    const onlyStructure=summaryRow(buildProjectRangeWorkbook([summaryFixture()[1]],summaryPeople,new Date(2026,8,1),3));assert.equal(onlyStructure['구조팀 PM'],summaryPeople[1].name);for(const label of ['마감팀','토목팀'])for(const suffix of [' PM',' 일정',' 진척률'])assert.equal(onlyStructure[label+suffix],'-');
  });
  await check('범위요약 원문 보존: 3개월 XLSX 왕복·월간 시트·공종·계획실적 및 입력 원본 exact',()=>{
    const fixture=summaryFixture(),snapshot=structuredClone(fixture),wb=buildProjectRangeWorkbook(fixture,summaryPeople,new Date(2026,8,1),3),roundTrip=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});assert.deepEqual(parseProjectsWorkbook(roundTrip),snapshot);assert.deepEqual(fixture,snapshot);assert.equal(wb.SheetNames.filter(name=>name.includes('타임라인')).length,3);assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['세부공종일정']).length,3);assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['계획실적']).length,3);
  });
  await check('2027년 Excel 작업일과 공정률 기준 문구 일치',()=>{
    const task={...sub,roleName:'조적',startDate:'2026-12-31',endDate:'2027-01-05',progress:40};
    const p={...project,startDate:task.startDate,endDate:task.endDate,subTasks:{조적:task}};
    const wb=buildProjectsWorkbook([p],[],new Date(2027,0,1));
    const detail=XLSX.utils.sheet_to_json(wb.Sheets['세부공종일정']);
    const progress=XLSX.utils.sheet_to_json(wb.Sheets['계획실적']);
    assert.equal(detail.filter(row=>row['공종명']==='조적').length,1);
    assert.equal(detail.find(row=>row['공종명']==='조적')['작업일'],3);
    assert.equal(detail.find(row=>row['공종명']==='PM')['작업일'],workDays(sub.startDate,sub.endDate));
    assert.match(progress[0]['기준'],/2026~2027/);
    assert.ok(!progress[0]['기준'].includes('2026 /'));
  });
  await check('공휴일 미확인 연도는 작업일 미산정, Excel 복원은 허용',()=>{
    const task={...sub,roleName:'조적',startDate:'2028-02-01',endDate:'2028-02-04',progress:40};
    const p={...project,startDate:task.startDate,endDate:task.endDate,subTasks:{조적:task}};
    const wb=buildProjectsWorkbook([p],[],new Date(2028,1,1));
    assert.equal(workDays(task.startDate,task.endDate),undefined);
    const detail=XLSX.utils.sheet_to_json(wb.Sheets['세부공종일정']);
    assert.equal(detail.filter(row=>row['공종명']==='조적').length,1);
    assert.equal(detail.find(row=>row['공종명']==='조적')['작업일'],'');
    assert.equal(detail.find(row=>row['공종명']==='PM')['작업일'],workDays(sub.startDate,sub.endDate));
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['계획실적'])[0]['계획 공정률(%)'],'미산정');
    assert.deepEqual(parseProjectsWorkbook(wb),[p]);
  });
  await check('회의록 65줄 연속 시트 보존',()=>{
    const body=Array.from({length:65},(_,i)=>`검수 ${i+1}번째 줄`).join('\n');
    const wb=buildMeetingWorkbook({notesAndInstructions:body,attendeesInternal:[],attendeesExternal:[]});
    const read=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
    assert.equal(read.SheetNames.length,3); assert.equal(readMeetingBody(read),body);
    assert.equal(read.Sheets['회의록'].C6?.v,'');
  });
  const minutesFixture=body=>({id:'qa-minutes83',projectCode:'QA83',title:'QA title',author:'QAAuthor',authorPosition:'프로',authorAffiliation:'QA-TEAM',clientName:'QA client',meetingDate:'2026-10-07',attendeesInternal:['QAWorker'],attendeesExternal:['QAClient'],attachedFileName:'QA-original.txt',notesAndInstructions:body,summary:'',decisions:[],actionItems:[],reviews:[{recipient_id:'reviewer',stage:'director',decision:'approve',read_at:'2026-10-07'}]});
  const minutesRead=wb=>XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellStyles:true});
  const minutesCFB=XLSX.CFB||XLSX.default.CFB;
  const minutesHeightLimit=wb=>{
    for(const name of wb.SheetNames){assert.equal(wb.Sheets[name]['!ref'],'A1:I45');for(const row of wb.Sheets[name]['!rows']||[])if(row)assert.ok(row.hpt<=409,`Excel row height ${row.hpt} exceeds 409pt`);}
    const zip=minutesCFB.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
    for(let i=0;i<zip.FullPaths.length;i++)if(/\/xl\/worksheets\/sheet\d+\.xml$/.test(zip.FullPaths[i]))for(const match of zip.FileIndex[i].content.toString().matchAll(/<row\b[^>]*\bht="([\d.]+)"/g))assert.ok(Number(match[1])<=409,`Written Excel row height ${match[1]} exceeds 409pt`);
  };
  await check('회의록 출력 경계: 409pt 행높이와1540/1541·40k·surrogate 본문/원문 보존',()=>{
    const bodies=['정상 짧은 문단','가'.repeat(1540),'가'.repeat(1541),'가'.repeat(1539)+'😀끝',Array.from({length:26},(_,i)=>'Line '+i).join('\r\n')+'\r\n'+'가'.repeat(40000)+'\r\n\r\n'];
    for(const body of bodies){const fixture=minutesFixture(body),original=structuredClone(fixture),built=buildMeetingWorkbook(fixture);minutesHeightLimit(built);const read=minutesRead(built);minutesHeightLimit(read);assert.equal(readMeetingBody(read),body);assert.deepEqual(fixture,original);assert.ok(Object.values(read.Custprops).every(value=>typeof value!=='string'||value.length<=255));for(const name of read.SheetNames)for(let row=17;row<=43;row++){const value=String(read.Sheets[name]['B'+row]?.v||'');assert.ok(!/[\uD800-\uDBFF]$/.test(value));assert.ok(!/^[\uDC00-\uDFFF]/.test(value));}}
  });
  await check('회의록 출력 경계: 32767/32768/70k·surrogate·27행넘김·LF/CRLF/빈줄 XLSX 정확 왕복과255속성',()=>{
    const bodies=['가'.repeat(32767),'가'.repeat(32768),'가'.repeat(70000),'가'.repeat(32766)+'😀끝',Array.from({length:26},(_,i)=>'Short '+i).join('\n')+'\n'+'가'.repeat(70000),Array.from({length:65},(_,i)=>'Line '+i).join('\n'),'\n첫 줄\n\n끝\n\n',Array.from({length:1100},(_,i)=>'CRLF '+i).join('\r\n')+'\r\n','CR\r본문\n끝'];
    for(const body of bodies){const fixture=minutesFixture(body),original=structuredClone(fixture),wb=minutesRead(buildMeetingWorkbook(fixture));assert.equal(readMeetingBody(wb)===body,true,'본문 정확 왕복');assert.ok(Object.values(wb.Custprops||{}).every(value=>typeof value!=='string'||value.length<=255));for(const name of wb.SheetNames)for(let row=17;row<=43;row++){const value=String(wb.Sheets[name]['B'+row]?.v||'');assert.ok(value.length<=32767);assert.ok(!/[\uD800-\uDBFF]$/.test(value));assert.ok(!/^[\uDC00-\uDFFF]/.test(value));}assert.equal(wb.Sheets[wb.SheetNames[0]].C15.v,fixture.attachedFileName);assert.deepEqual(fixture,original);}
  });
  await check('회의록 출력 경계: 외부파일 및 편집/패딩추가/메타누락·변조는 기존 행읽기로 보존',()=>{
    const body='a'.repeat(70000),wb=minutesRead(buildMeetingWorkbook(minutesFixture(body))),ordinary=workbook=>{delete workbook.Custprops;return readMeetingBody(workbook);};
    const changes=[copy=>{copy.Sheets.회의록.B17.v='changed'+copy.Sheets.회의록.B17.v;},copy=>{copy.Sheets.회의록.B20={t:'s',v:'added padding text'};},copy=>{delete copy.Custprops.CONCOST_MINUTES_BODY_V1_0;},copy=>{copy.Custprops.CONCOST_MINUTES_BODY_V1=NaN;},copy=>{copy.Custprops.CONCOST_MINUTES_BODY_V1=-1;},copy=>{copy.Custprops.CONCOST_MINUTES_BODY_V1=100000000;},copy=>{copy.Custprops.CONCOST_MINUTES_BODY_V1_0+='x';}];
    for(const change of changes){const edited=structuredClone(wb);change(edited);assert.equal(readMeetingBody(edited),ordinary(structuredClone(edited)));assert.notEqual(readMeetingBody(edited),body);}
    const external=XLSX.utils.book_new();XLSX.utils.book_append_sheet(external,{'!ref':'A1:I45',C17:{t:'s',v:'외부 첫 줄'},C18:{t:'s',v:'외부 둘째 줄'}},'일반 외부 양식');assert.equal(readMeetingBody(minutesRead(external)),'외부 첫 줄\n외부 둘째 줄');
  });
  const minutesPayloads=bytes=>{const zip=minutesCFB.read(new Uint8Array(bytes),{type:'array'});return new Map(zip.FullPaths.map((name,index)=>[name,zip.FileIndex[index]]).filter(([,entry])=>entry.type===2&&entry.content).map(([name,entry])=>[name,Buffer.from(entry.content)]));};
  await check('회의록 출력 경계: 본문 wrap스타일만 추가·원문/props/다른ZIP항목exact·잘못된양식거부',()=>{
    const body='가'.repeat(1541)+'\r\n\r\n',fixture=minutesFixture(body),wb=buildMeetingWorkbook(fixture),snapshot=JSON.stringify(wb),plain=XLSX.write(structuredClone(wb),{type:'array',bookType:'xlsx'}),bytes=writeMeetingWorkbook?writeMeetingWorkbook(wb):new Uint8Array(plain),before=minutesPayloads(plain),after=minutesPayloads(bytes);
    assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort());
    const stylePath=[...before.keys()].find(name=>name.endsWith('/xl/styles.xml')),beforeStyles=before.get(stylePath).toString(),afterStyles=after.get(stylePath).toString(),beforeXfs=beforeStyles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g),afterXfs=afterStyles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
    assert.equal(afterXfs.length,beforeXfs.length+1,'A real wrap style must be written');assert.deepEqual(afterXfs.slice(0,beforeXfs.length),beforeXfs);assert.match(afterXfs.at(-1),/wrapText="1"/);assert.match(afterXfs.at(-1),/vertical="top"/);const wrapIndex=beforeXfs.length;
    const bodyTag=/<c\b[^>]*\br="(B(?:1[7-9]|[23]\d|4[0-3]))"[^>]*>/g,withoutBodyStyle=xml=>xml.replace(bodyTag,tag=>tag.replace(/\s+s="\d+"/,''));
    for(const [name,payload]of before){if(name===stylePath)continue;if(/\/xl\/worksheets\/sheet\d+\.xml$/.test(name)){const oldXml=payload.toString(),newXml=after.get(name).toString(),tags=[...newXml.matchAll(bodyTag)];assert.equal(tags.length,27);for(const tag of tags)assert.equal(Number(/\bs="(\d+)"/.exec(tag[0])?.[1]),wrapIndex);assert.equal(withoutBodyStyle(newXml),withoutBodyStyle(oldXml),'Only body cell style attributes may change');}else assert.equal(Buffer.compare(payload,after.get(name)),0,`Unrelated entry ${name} must stay exact`);}
    const read=XLSX.read(bytes,{type:'array',cellStyles:true});assert.equal(readMeetingBody(read),body);assert.deepEqual(read.Custprops,XLSX.read(plain,{type:'array'}).Custprops);assert.equal(JSON.stringify(wb),snapshot);minutesHeightLimit(read);
    const missing=buildMeetingWorkbook(minutesFixture('Short'));delete missing.Sheets.회의록.B17;assert.throws(()=>writeMeetingWorkbook(missing),/양식|구조/);
    const oldRead=minutesCFB.read;try{minutesCFB.read=(...args)=>{const zip=oldRead(...args),index=zip.FullPaths.findIndex(name=>name.endsWith('/xl/styles.xml'));zip.FileIndex[index].content=new TextEncoder().encode('<styleSheet/>');return zip;};assert.throws(()=>writeMeetingWorkbook(wb),/양식|구조/);}finally{minutesCFB.read=oldRead;}
  });
  await check('회의록 출력 경계: 실제 Blob다운로드·파일명·본문·URL정리와실패정리',async()=>{
    assert.equal(typeof downloadMeetingWorkbook,'function','Meeting byte download helper is required');const oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimeout=globalThis.setTimeout,events=[],timers=[];let blob,failClick=false,anchor;
    globalThis.document={body:{appendChild:value=>{anchor=value;events.push('append');}},createElement:tag=>{assert.equal(tag,'a');return {click(){events.push('click');if(failClick)throw Error('synthetic click failure');},remove(){events.push('remove');}};}};URL.createObjectURL=value=>{blob=value;events.push('create');return 'blob:qa-minutes85';};URL.revokeObjectURL=value=>{assert.equal(value,'blob:qa-minutes85');events.push('revoke');};globalThis.setTimeout=fn=>{timers.push(fn);return 0;};
    try{const body='마감팀\r\n\r\n',wb=buildMeetingWorkbook(minutesFixture(body));downloadMeetingWorkbook(wb,'회의록_QA85.xlsx');assert.equal(anchor.download,'회의록_QA85.xlsx');assert.equal(anchor.href,'blob:qa-minutes85');assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');const bytes=new Uint8Array(await blob.arrayBuffer()),read=XLSX.read(bytes,{type:'array',cellStyles:true}),payloads=minutesPayloads(bytes),styles=[...payloads].find(([name])=>name.endsWith('/xl/styles.xml'))[1].toString();assert.equal(readMeetingBody(read),body);assert.match(styles,/wrapText="1"/);assert.ok(events.includes('remove'));assert.equal(timers.length,1);timers.shift()();assert.equal(events.at(-1),'revoke');events.length=0;failClick=true;assert.throws(()=>downloadMeetingWorkbook(wb,'fail.xlsx'),/click failure/);assert.ok(events.includes('remove'));assert.equal(timers.length,1);timers.shift()();assert.equal(events.at(-1),'revoke');}finally{globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimeout;}
  });
  const exportSourceText=readFileSync(minutesSource||new URL('../src/components/MinutesView.tsx',import.meta.url),'utf8'),exportStart=exportSourceText.indexOf('  const handleExportMeetingExcel ='),exportEnd=exportSourceText.indexOf('  const handleExportExcel =',exportStart),exportCode=ts.transpileModule(exportSourceText.slice(exportStart,exportEnd)+'\nexports.exportMeeting=handleExportMeetingExcel;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const minutesExporter=(translate,write,lang='ko')=>{const messages=[],exports={};runInNewContext(exportCode,{exports,buildMeetingWorkbook,rebuildTranslatedMeetingWorkbook,activeSubTab:'archive',currentMeeting:undefined,getMeetingClientName:record=>record.clientName||'',translateWorkbook:translate,downloadMeetingWorkbook:write,XLSX:{writeFile:write},useLanguageStore:{getState:()=>({lang})},setAiToast:text=>messages.push(text),setTimeout:()=>0});return {export:exports.exportMeeting,messages};};
  await check('회의록 출력 경계: 실제 exporter 번역실패와 파일쓰기실패 원인을 구분',async()=>{
    let writes=0;const translation=minutesExporter(async()=>{throw Error('translation failed');},()=>{writes++;});await translation.export(minutesFixture('Short'));assert.equal(writes,0);assert.ok(translation.messages.at(-1).includes('번역'));
    const writer=minutesExporter(async wb=>wb,()=>{throw Error('file failed');});await writer.export(minutesFixture('Short'));assert.ok(writer.messages.at(-1).includes('엑셀'));assert.ok(!writer.messages.at(-1).includes('번역'));
  });
  await check('회의록 출력 경계: 실제 VI exporter 번역팽창 재분할·27행 페이지·translated헤더·CRLF 유지',async()=>{
    const {translateWorkbook}=await server.ssrLoadModule('/src/services/translationService.ts'),fetchBefore=globalThis.fetch;let calls=0;
    globalThis.fetch=async(url,init)=>{assert.equal(String(url),'/api/translation','External provider forbidden');calls++;const {texts}=JSON.parse(init.body);return Response.json({results:texts.map(text=>({translatedText:text.includes('몸')?text.replaceAll('몸','xx'):'VI:'+text.replace(/[가-힣]/g,'v')}))});};
    try{const short=minutesFixture('마감팀\r\n\r\n'),long=minutesFixture(Array.from({length:26},(_,i)=>'Short '+i).join('\n')+'\n'+'몸'.repeat(32767));let downloaded,translatedInput;
      for(const fixture of [short,long]){const original=structuredClone(fixture),caller=minutesExporter(async wb=>{translatedInput=await translateWorkbook(wb,'vi');return translatedInput;},wb=>{downloaded=XLSX.read(writeMeetingWorkbook?writeMeetingWorkbook(wb):XLSX.write(wb,{type:'array',bookType:'xlsx'}),{type:'array',cellStyles:true});},'vi');await caller.export(fixture);assert.ok(downloaded,'Actual exporter must write XLSX');minutesHeightLimit(downloaded);assert.deepEqual(fixture,original);const expected=fixture===short?'Đội hoàn thiện\r\n\r\n':Array.from({length:26},(_,i)=>'Short '+i).join('\n')+'\n'+'x'.repeat(65534);assert.equal(readMeetingBody(downloaded)===expected,true,'Translated body exact');if(fixture===long){assert.equal(downloaded.SheetNames.length,3);for(const [page,name]of downloaded.SheetNames.entries()){for(let row=0;row<16;row++)for(let col=0;col<9;col++){const key=XLSX.utils.encode_cell({r:row,c:col});assert.equal(downloaded.Sheets[name][key]?.v,translatedInput.Sheets.회의록[key]?.v);}assert.ok(downloaded.Sheets[name].B44.v.endsWith(`${page+1}/3`));}}}
      assert.ok(calls>0,'Synthetic provider must exercise expansion');
    }finally{globalThis.fetch=fetchBefore;}
  });
  const {ownLegacyMinutes,legacyMinuteId}=await server.ssrLoadModule('/src/utils/legacyMinutes.ts');
  await check('기존 회의록 이관은 본인 작성분만 선택하고 기본 예시는 제외',()=>{
    const seed={id:'sample',author:'작성자',title:'기본 예시'};
    const records=[seed,{id:'old',author:'작성자 수석',title:'직접 작성'},{id:'other',author:'타인',title:'타인 기록'},{id:'claimed',author:'작성자',authorId:'other'},{id:'shared',author:'작성자',serverRevision:1}];
    assert.deepEqual(ownLegacyMinutes(records,[seed],{id:'me',name:'작성자'}).map(m=>m.id),['old']);
    assert.equal(ownLegacyMinutes(records,[seed],null).length,0);
  });
  await check('기존 회의록 이관 재실행 ID 유지, 내용 변경은 별도 보존',async()=>{
    const source={id:'old',author:'작성자',title:'원문',summary:'내용'};
    assert.equal(await legacyMinuteId('me',source),await legacyMinuteId('me',structuredClone(source)));
    assert.notEqual(await legacyMinuteId('me',source),await legacyMinuteId('me',{...source,summary:'다른 PC 수정'}));
    assert.notEqual(await legacyMinuteId('me',source),await legacyMinuteId('another',source));
  });
  await check('휴가 출력 월·팀 범위 및 연말 3개월 엑셀 보존',async()=>{
    const {buildProjectRangeWorkbook}=await server.ssrLoadModule('/src/services/excelService.ts');
    const XLSX=await import('xlsx');
    const wb=buildProjectRangeWorkbook([project],[{id:'worker',name:'직원',team:'마감팀'}],new Date(2026,11,1),3,[{id:'leave1',user_id:'worker',start_date:'2027-01-02',end_date:'2027-01-03',kind:'연차'},{id:'leave2',user_id:'other',start_date:'2027-01-02',end_date:'2027-01-03',kind:'휴가'}]);
    const rows=XLSX.utils.sheet_to_json(wb.Sheets['휴가일정']);assert.equal(rows.length,1);assert.equal(rows[0]['성명'],'직원');assert.equal(rows[0]['시작일'],'2027-01-02');
  });
  await check('프로젝트 없는 팀의 휴가도 전체·팀별 Excel에 보존',()=>{
    const people=[{id:'fin',name:'마감 직원',team:'마감팀'},{id:'civil',name:'토목 직원',team:'토목&조경팀'}];
    const leaves=people.map(p=>({id:p.id,user_id:p.id,start_date:'2026-09-28',end_date:'2026-09-28',kind:'연차'}));
    const read=(projects,scope)=>{
      const wb=buildProjectRangeWorkbook(projects,people,new Date(2026,8,1),1,leaves,scope);
      const roundTrip=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
      return XLSX.utils.sheet_to_json(roundTrip.Sheets['휴가일정']);
    };
    assert.deepEqual(read([project],'ALL').map(r=>r['성명']),['마감 직원','토목 직원']);
    assert.deepEqual(read([],'토목&조경팀').map(r=>r['성명']),['토목 직원']);
    assert.deepEqual(read([],'구조팀'),[]);
  });
  await check('프로젝트 상세 출력에 다중 담당자·빈 배정·0%·긴 원문·겹치는 휴가 보존',async()=>{
    const {ProjectDetailPrint}=await server.ssrLoadModule('/src/components/ProjectDetailPrint.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const long='긴 원문 <보존>\n'.repeat(80);
    const p={...project,subTasks:{PM:{...sub,personIds:[],personId:'stale'},조적:{...sub,personIds:['a','b'],progress:0,memo:long}}};
    const html=renderToStaticMarkup(createElement(ProjectDetailPrint,{project:p,people:[{id:'a',name:'담당가'},{id:'b',name:'담당나'},{id:'stale',name:'해제인원'}],leaves:[{id:'l',user_id:'a',start_date:'2026-09-21',end_date:'2026-09-21',kind:'연차'},{id:'x',user_id:'b',start_date:'2026-10-01',end_date:'2026-10-01',kind:'제외휴가'}],onClose:()=>{}}));
    assert.ok(html.includes('담당가, 담당나'));assert.ok(html.includes('미배정'));assert.ok(!html.includes('해제인원'));assert.ok(html.includes('0%'));assert.equal((html.match(/긴 원문 &lt;보존&gt;/g)||[]).length,80);assert.ok(html.includes('연차'));assert.ok(!html.includes('제외휴가'));assert.ok(html.includes('printable-schedule-modal'));
  });
  await check('통합 일정의 미기재 수주정보와 해제인원은 예시·이전 값으로 대체하지 않음',async()=>{
    const {ProjectIntegratedModal}=await server.ssrLoadModule('/src/components/ProjectIntegratedModal.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const p=projects.getInitialState(),a=auth.getInitialState(),savedProjects=p.projects,savedUsers=a.users;
    try {
      p.projects=[{...project,pmId:'',notes:'',request:'',roles:{},subTasks:{조적:{...sub,personId:'stale',personIds:[]}}}];
      a.users=[{id:'stale',name:'해제인원',position:'수석',department:'마감팀'}];
      const render=()=>renderToStaticMarkup(createElement(ProjectIntegratedModal,{projectCode:project.code,onClose:()=>{}}));
      const empty=render();
      assert.ok(!empty.includes('평택 P5'));assert.ok(!empty.includes('RC,내화피복'));assert.ok(!empty.includes('해제인원'));assert.ok(empty.includes('미기재'));
      p.projects=[{...p.projects[0],notes:'원본 특기사항 <보존>',request:'원본 세부 요청사항'}];
      const actual=render();
      assert.ok(actual.includes('원본 특기사항 &lt;보존&gt;'));assert.ok(actual.includes('원본 세부 요청사항'));
    }finally{p.projects=savedProjects;a.users=savedUsers;}
  });
  await check('상세 캘린더 연도 경계와 일정 시작·종료일 포함, 기간 밖 막대 제외',async()=>{
    const {ProjectDetailPrint}=await server.ssrLoadModule('/src/components/ProjectDetailPrint.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const p={...project,startDate:'2026-12-30',endDate:'2027-01-02',roles:{},subTasks:{PM:{...sub,startDate:'2026-12-31',endDate:'2027-01-01',personIds:[]}}};
    const html=renderToStaticMarkup(createElement(ProjectDetailPrint,{project:p,people:[],leaves:[],onClose:()=>{}}));
    assert.deepEqual([...html.matchAll(/data-calendar-month="([^"]+)"/g)].map(m=>m[1]),['2026-12','2027-01']);
    assert.deepEqual([...html.matchAll(/data-schedule-date="([^"]+)" data-trade="PM"/g)].map(m=>m[1]),['2026-12-31','2027-01-01']);
    assert.ok(!html.includes('2027-01-32'));assert.ok(html.includes('공종별 일정 캘린더'));assert.ok(html.includes('KR 신정'));
    assert.ok(html.includes('일정 미입력'));
    assert.deepEqual([...html.matchAll(/data-trade="([^"]+)"/g)].map(m=>m[1]),['PM','PM']);
  });
  await check('베트남 배치창은 프로젝트·공종 선택 및 중앙 상태를 표시',async()=>{
    const {VietTeamModal}=await server.ssrLoadModule('/src/components/VietTeamModal.tsx');
    const {VIET_TEAMS_DATA}=await server.ssrLoadModule('/src/data/vietTeams.ts');
    const {resolveVietTeams}=await server.ssrLoadModule('/src/utils/vietPersonnel.ts');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const initialAuth=auth.getInitialState(),savedUsers=initialAuth.users;
    const member={id:'vn-regression-canonical',no:97001,name:VIET_TEAMS_DATA[0].members[0].name,engName:'SYNTHETIC VN MEMBER',company:'VIETQS',department:'마감팀',originalDept:'Internal1',position:'사원',idPrefix:'synthetic_vn_regression',active:true,vietTeamId:VIET_TEAMS_DATA[0].id};
    try{
    initialAuth.users=[member];
    const html=renderToStaticMarkup(createElement(VietTeamModal,{team:VIET_TEAMS_DATA[0],isOpen:true,onClose:()=>{}}));
    assert.ok(html.includes('배치할 프로젝트'));assert.ok(html.includes('배치할 공종'));assert.ok(html.includes('role="status"'));assert.ok(html.includes(VIET_TEAMS_DATA[0].members[0].name));
    assert.ok(!html.includes('선택 인원 프로젝트 배치 확정'));assert.ok(!html.includes('성공적으로 배치되었습니다'));
    assert.ok(html.includes(member.idPrefix));assert.deepEqual(resolveVietTeams(initialAuth.users,'마감팀')[0].members.map(person=>person.id),[member.id]);
    }finally{initialAuth.users=savedUsers;}
  });
  await check('현재 업무일지 UI의 결재선은 작성자 부서를 따름',async()=>{
    const {DailyWorkLogView}=await server.ssrLoadModule('/src/components/DailyWorkLogView.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const initialAuth=auth.getInitialState(),initialLogs=logs.getInitialState();
    const previous=initialAuth.currentUser,previousLogs=initialLogs.workLogs,previousSelection=initialLogs.selectedWorkLogId;
    initialLogs.workLogs=[];initialLogs.selectedWorkLogId=null;
    logs.setState({workLogs:[],selectedWorkLogId:null});
    try {
      for(const [department,position,expected] of [['구조팀','책임','1차 팀장 검토 (구조팀)'],['토목&조경팀','선임','1차 본부장 검토 (토목&amp;조경팀)']]){
        initialAuth.currentUser={id:'qa-author',name:'검수작성자',department,position};
        const html=renderToStaticMarkup(createElement(DailyWorkLogView));
        assert.ok(html.includes(expected));assert.ok(html.includes('검수작성자'));assert.ok(html.includes(department==='구조팀'?'장범선 실장':'최영배 본부장'));assert.ok(!html.includes('1차 팀장 검토 (마감팀)'));
      }
      initialAuth.currentUser={id:'qa-author',name:'검수작성자',department:'개발 TF',position:'실장'};
      const html=renderToStaticMarkup(createElement(DailyWorkLogView));
      assert.ok(html.includes('결재선이 설정되지 않았습니다'));assert.ok(!html.includes('1차 팀장 검토 (마감팀)'));
    } finally {initialAuth.currentUser=previous;initialLogs.workLogs=previousLogs;initialLogs.selectedWorkLogId=previousSelection;}
  });
  await check('팀장 검토 후 보고·결재 상태와 실장 승인 버튼을 일치시킴',async()=>{
    const {DailyWorkLogView}=await server.ssrLoadModule('/src/components/DailyWorkLogView.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const a=auth.getInitialState(),l=logs.getInitialState(),savedUser=a.currentUser,savedLogs=l.workLogs,savedId=l.selectedWorkLogId;
    const d=new Date(),date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try{
      a.currentUser={id:'u_12',name:'검수실장',position:'실장',department:'마감팀'};
      l.selectedWorkLogId='qa-stage';
      for(const reviewed of [false,true]){
        l.workLogs=[{id:'qa-stage',date,userId:'qa-worker',userName:'검수직원',department:'마감팀',userPosition:'선임',items:[],approvalStatus:'SUBMITTED_LEADER',leaderReview:{approved:reviewed}}];
        const html=renderToStaticMarkup(createElement(DailyWorkLogView));
        const expected=reviewed?'실장 승인 대기':'팀장 검토 대기';
        assert.equal(html.split(expected).length-1,2);assert.ok(html.includes('검수직원'));assert.equal(/<button[^>]*>실장 최종 승인<\/button>/.test(html),reviewed);
      }
    }finally{a.currentUser=savedUser;l.workLogs=savedLogs;l.selectedWorkLogId=savedId;}
  });
  await check('Excel 부분 이관은 최신 다른 팀 일정과 기존 연결 ID 보존', () => {
    auth.setState({currentUser:{id:'u_12',name:'검수실장',department:'마감팀',position:'실장'}});
    const other={...structuredClone(project),id:'qa-other',code:'QA-OTHER',department:'구조팀',name:'파일 읽기 중 수신한 일정'};
    projects.setState({projects:[structuredClone(project),other]});
    projects.getState().importProjects([{...structuredClone(project),id:'exported-other-pc-id',name:'복원한 일정'}]);
    assert.equal(projects.getState().projects.length,2);
    assert.equal(projects.getState().projects[0].id,project.id);
    assert.equal(projects.getState().projects[0].name,'복원한 일정');
    assert.deepEqual(projects.getState().projects[1],other);
  });
  await check('Excel 타 팀 포함·중복·ID 충돌은 전체 원자적 거부', () => {
    const before=structuredClone(projects.getState().projects);
    for(const incoming of [
      [{...project,name:'반영 금지'}, {...project,id:'qa-new',code:'QA-NEW',department:'구조팀'}],
      [project,{...project,id:'duplicate-key'}],
      [{...project,id:'qa-other',code:'QA-COLLISION'}],
      [{...project,id:'same-new',code:'QA-A'},{...project,id:'same-new',code:'QA-B'}],
    ]) {
      assert.throws(()=>projects.getState().importProjects(incoming));
      assert.deepEqual(projects.getState().projects,before);
    }
    auth.setState({currentUser:{id:'qa-staff',name:'검수직원',department:'마감팀',position:'선임'}});
    assert.throws(()=>projects.getState().importProjects([project]));
    assert.deepEqual(projects.getState().projects,before);
  });
  await check('구형 Excel은 미리보기 이후에도 기존 프로젝트 덮어쓰기 차단', () => {
    auth.setState({currentUser:{id:'u_12',name:'검수실장',department:'마감팀',position:'실장'}});
    const before=structuredClone(projects.getState().projects);
    assert.throws(()=>projects.getState().importProjects([{...project,name:'구형 원본'}],true),/이미 등록된/);
    assert.deepEqual(projects.getState().projects,before);
  });
  await check('수주 연동은 원문 담당자를 PM으로 자동 배정하지 않음', async() => {
    const {newProjectFromIntake}=await server.ssrLoadModule('/src/utils/intakeRegistration.ts');
    const intake={id:'qa-intake',no:1,code:'QA-NEW',name:'신규',client:'발주처',rawTitle:'원문',author:'작성자',receivedDate:'2026-09-28',startDate:'',endDate:'',scopeText:'',targetDepartments:['마감팀','구조팀','토목&조경팀'],status:'',isScheduled:false,pmByDepartment:{마감팀:'조한빈 실장', '토목&조경팀':'오승균 파트장'}};
    for(const dept of intake.targetDepartments){const p=newProjectFromIntake(intake,dept);assert.equal(p.pmId,'');assert.deepEqual(p.roles,{});assert.deepEqual(p.subTasks,{});assert.equal(p.department,dept);assert.equal(p.startDate,'');}
  });
  await check('구조팀 새 자료실 순서와 기존 파일 표시 호환', async() => {
    const {FOLDER_SUBTITLES,displaySubtitle}=await server.ssrLoadModule('/src/services/googleDriveService.ts');
    assert.deepEqual([...FOLDER_SUBTITLES['03.구조자료']],['1.납품자료','2.프로그램파일(RC)','3.CAD작업도면','4.견적조건 및 질의사항','5.VIET QS 작업자료']);
    assert.equal(displaySubtitle('03.구조자료','1.프로그램파일(RC)'),'2.프로그램파일(RC)');
    assert.equal(displaySubtitle('03.구조자료','2.CAD작업도면'),'3.CAD작업도면');
    assert.equal(displaySubtitle('02.마감자료','2.프로그램파일(FIN)'),'2.프로그램파일(FIN)');
  });
  await check('납품 후 일정은 팀장·실장만 수정 가능하고 기존 공정률은 유지', () => {
    auth.setState({currentUser:{id:'qa-staff',name:'검수직원',department:'마감팀',position:'선임'}});
    projects.setState({projects:[structuredClone(project)]});
    const task={id:'follow-1',kind:'수정',startDate:'2026-10-01',endDate:'2026-10-01',memo:'변경 도면 검토',personIds:['qa-a'],status:'예정'};
    assert.throws(()=>projects.getState().updateProject('qa-f',{postDeliveryTasks:[task]}),/실장·팀장/);
    auth.setState({currentUser:{id:'u_12',name:'검수실장',department:'마감팀',position:'실장'}});
    projects.getState().updateProject('qa-f',{postDeliveryTasks:[task]});
    assert.equal(projects.getState().projects[0].progress,0);
    assert.deepEqual(projects.getState().projects[0].postDeliveryTasks,[task]);
  });
  await check('납품 이후 다음 달 수정이 월간 Excel·상세 출력·복원데이터에 포함', async() => {
    const follow={id:'qa-follow',kind:'수정',startDate:'2026-10-01',endDate:'2026-10-02',memo:'새 도면 재산출',personIds:['qa-a'],status:'예정'};
    const delivered={...project,status:'납품',postDeliveryTasks:[follow]};
    const wb=buildProjectRangeWorkbook([delivered],[{id:'qa-a',name:'담당자',team:'마감팀'}],new Date(2026,9,1),1);
    const rows=XLSX.utils.sheet_to_json(wb.Sheets['납품후검토수정']);assert.equal(rows.length,1);assert.equal(rows[0]['수정·검토 메모'],'새 도면 재산출');
    assert.equal(XLSX.utils.sheet_to_json(wb.Sheets['복원데이터']).length,1);
    const {ProjectDetailPrint}=await server.ssrLoadModule('/src/components/ProjectDetailPrint.tsx');
    const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
    const html=renderToStaticMarkup(createElement(ProjectDetailPrint,{project:delivered,people:[{id:'qa-a',name:'담당자'}],leaves:[],onClose:()=>{}}));
    assert.ok(html.includes('납품 후 수정 1'));assert.ok(html.includes('새 도면 재산출'));assert.ok(html.includes('2026년 10월'));
  });
  const {ProjectIntegratedModal}=await server.ssrLoadModule('/src/components/ProjectIntegratedModal.tsx'),{createElement:modalElement}=await import('react'),{renderToStaticMarkup:renderModal}=await import('react-dom/server'),{VIET_TEAMS_DATA:modalTeams}=await server.ssrLoadModule('/src/data/vietTeams.ts');
  const modalUser=(id,name,no,position='프로')=>({id,name,no,position,company:'컨코스트',department:'마감팀',active:true});
  const modalHtml=(raw,users)=>{const p={id:'qa-integrated',code:'QA-INTEGRATED',name:'합성 통합 명부',department:'마감팀',pmId:raw,startDate:'2026-10-06',endDate:'2026-10-07',status:'진행중',progress:35,roles:{},subTasks:{내부:{roleName:'내부',personId:raw,personIds:[raw],startDate:'2026-10-06',endDate:'2026-10-07',status:'진행중',progress:35,memo:'원 수행 본문'}},postDeliveryTasks:[{id:'follow',kind:'검토',personIds:[raw],startDate:'2026-10-08',endDate:'2026-10-09',memo:'원 후속 본문',status:'진행중'}]},original=structuredClone(p);Object.assign(auth.getInitialState(),{users});auth.setState({users});Object.assign(projects.getInitialState(),{projects:[p]});projects.setState({projects:[p]});const html=renderModal(modalElement(ProjectIntegratedModal,{projectCode:p.code,onClose:()=>{}}));assert.deepEqual(p,original);assert.deepEqual(projects.getState().projects[0],original);return html;};
  await check('통합상세 명부 유일 사번·이름: PM/공종/후속 모두 현재 이름 연결·원배정 보존',()=>{
    const user=modalUser('staff-current','합성 현재 직원',88177);for(const raw of ['88177',user.name]){const html=modalHtml(raw,[user]);assert.ok(html.includes(user.name+' (프로)'));assert.ok(html.includes('담당 '+user.name));assert.ok(!html.includes('담당 88177'));}
  });
  await check('통합상세 명부 공식ID: 앞선 타직원 이름 충돌보다 ID 우선·비활성 공식ID의 과거 이름 유지',()=>{
    const current=modalUser('staff-current','합성 정식 직원',88177,'책임'),collision=modalUser('other',current.id,88178,'오표시');const html=modalHtml(current.id,[collision,current]);assert.ok(html.includes(current.name+' (책임)'));assert.ok(!html.includes(current.id+' (오표시)'));const inactive=modalHtml(current.id,[{...current,active:false}]);assert.ok(inactive.includes(current.name+' (책임)')&&inactive.includes('담당 '+current.name));
  });
  await check('통합상세 명부 미확정: 동명이인·비활성 별칭·미등록값은 첫직원으로 추정하지 않고 원문 유지',()=>{
    const raw='동명 합성 직원',one=modalUser('one',raw,88177,'첫번째 임의직원'),two=modalUser('two',raw,88178,'두번째 직원'),html=modalHtml(raw,[one,two]);assert.ok(!html.includes(raw+' (첫번째 임의직원)'));assert.ok(html.includes('담당 '+raw));const inactive=modalHtml('88177',[{...one,active:false}]);assert.ok(!inactive.includes(raw+' (첫번째 임의직원)'));assert.ok(inactive.includes('담당 88177'));assert.ok(modalHtml('미등록 원문',[one]).includes('담당 미등록 원문'));
  });
  await check('통합상세 명부 VN팀: 공식ID/code/name/displayName는 충돌한 개인이름보다 팀표시 우선',()=>{
    const team=modalTeams[0];for(const raw of [team.id,team.code,team.name,team.displayName]){const html=modalHtml(raw,[modalUser('other',raw,88177,'개인 오표시')]);assert.ok(html.includes(team.displayName));assert.ok(!html.includes(raw+' (개인 오표시)'));}
  });
  await check('통합상세 명부 정상 대조: 현재ID·공종직책/후속이름·원본문 보존',()=>{
    const current=modalUser('staff-current','합성 현재 직원',88177,'책임'),html=modalHtml(current.id,[current]);assert.ok(html.includes(current.name+' (책임)'));assert.ok(html.includes('담당 '+current.name));
  });
  const {PersonalScheduleView}=await server.ssrLoadModule('/src/components/PersonalScheduleView.tsx');
  const calendarOverlapHtml=intervals=>{
    const now=new Date(),day=number=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(number).padStart(2,'0')}`,owner=modalUser('overlap-worker','합성 중복 검수 직원',88999),beforeAuth={...auth.getInitialState()},beforeProjects={...projects.getInitialState()};
    const fixtures=intervals.map(([start,end],index)=>({id:'overlap-'+index,code:'QA-OVERLAP-'+index,name:'합성 업무 '+index,department:'마감팀',pmId:'',startDate:day(start),endDate:day(end),status:'진행중',progress:0,roles:{},subTasks:{내부:{roleName:'내부',personId:owner.id,personIds:[owner.id],startDate:day(start),endDate:day(end),status:'진행중',memo:'원 배정 '+index}}}));
    const frozen=structuredClone(fixtures);try{Object.assign(auth.getInitialState(),{users:[owner]});Object.assign(projects.getInitialState(),{projects:fixtures,personnel:[]});const html=renderModal(modalElement(PersonalScheduleView,{department:'마감팀'}));assert.deepEqual(fixtures,frozen);return html;}finally{Object.assign(auth.getInitialState(),beforeAuth);Object.assign(projects.getInitialState(),beforeProjects);}
  };
  await check('개인캘린더 중복 4개 동시 업무는 조합6쌍이 아닌 업무4건으로 표시',()=>{
    const html=calendarOverlapHtml([[1,3],[1,3],[1,3],[1,3]]);assert.ok(html.includes('당월 4건 배정 중 4개 일정이 동시 중복 진행 중입니다.'));assert.ok(!html.includes('중복 6건'));
  });
  await check('개인캘린더 중복 2개 겹침과 독립 업무1개는 총3개중 업무2개로 표시',()=>{
    const html=calendarOverlapHtml([[1,3],[3,5],[10,12]]);assert.ok(html.includes('당월 3건 배정 중 2개 일정이 동시 중복 진행 중입니다.'));
  });
  await check('개인캘린더 중복 없는 기간은 기존 정상배정 문구와 원자료 보존',()=>{
    const html=calendarOverlapHtml([[1,2],[3,4],[5,6]]);assert.ok(html.includes('당월 3건 정상 배정 진행 중'));assert.ok(!html.includes('개 일정이 동시 중복 진행 중입니다.'));
  });
  const qcText=readFileSync(qcSource||new URL('../src/components/QCLinkView.tsx',import.meta.url),'utf8'),qcCompiled=ts.transpileModule(qcText,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,qcRuntime=await import('react/jsx-runtime');
  const qcBase='https://concost-qc-studio.jjwwhhjj1116.workers.dev/';
  const qcScreen=(initialProjects,initialActor={id:'qc-user',name:'합성 직원'})=>{
    const hooks=[],effects=[],queue=[];let cursor=0,dirty=true,tree,list=initialProjects,actor=initialActor,studio={ready:true,actorId:initialActor?.id};
    const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial;return[hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];};
    const same=(left,right)=>left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
    const useMemo=(fn,deps)=>{const index=cursor++;if(!hooks[index]||!same(hooks[index].deps,deps))hooks[index]={deps,value:fn()};return hooks[index].value;};
    const useEffect=(fn,deps)=>{const index=cursor++;if(!same(effects[index]?.deps,deps)){effects[index]={deps};queue.push(fn);}};
    const exports={};runInNewContext(qcCompiled,{exports,URL,require:name=>{if(name==='react')return {useState,useEffect,useMemo};if(name==='react/jsx-runtime')return qcRuntime;if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});if(name==='../store/useAuthStore')return {useAuthStore:selector=>selector({currentUser:actor})};if(name==='../store/useProjectStore')return {useProjectStore:selector=>selector({projects:list})};if(name==='../store/useStudioStore')return {useStudioStore:selector=>selector(studio)};throw Error('Unexpected QC dependency '+name);}});
    const nodes=node=>Array.isArray(node)?Array.from(node).flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
    const render=()=>{cursor=0;tree=exports.QCLinkView();dirty=false;};
    const settle=()=>{for(let n=0;n<6&&(dirty||queue.length);n++){if(dirty)render();while(queue.length)queue.shift()();}assert.equal(dirty,false,'QC state should settle');};
    const select=()=>nodes(tree).find(node=>node.type==='select');settle();
    return {href:()=>nodes(tree).find(node=>node.type==='a').props.href,select,round:value=>{nodes(tree).find(node=>node.type==='input'&&node.props['aria-label']==='검수 차수').props.onChange({target:{value:String(value)}});settle();},options:()=>nodes(tree).filter(node=>node.type==='option').map(node=>node.props.value),choose:code=>{assert.ok(select(),'QC project selection is present');select().props.onChange({target:{value:code}});settle();},setProjects:next=>{list=next;dirty=true;settle();},setActor:next=>{actor=next;studio={ready:true,actorId:next?.id};dirty=true;render();const immediate=nodes(tree).find(node=>node.type==='a').props.href;settle();return immediate;},setStudio:next=>{studio=next;dirty=true;settle();}};
  };
  const qcRows=[{id:'finish',code:'TK-2026087',name:'원 프로젝트',department:'마감팀'},{id:'structure',code:'TK-2026087',name:'원 프로젝트',department:'구조팀'},{id:'other',code:'QA &?=#가',name:'다른 프로젝트',department:'구조팀'}];
  await check('QC 프로젝트 전달: 부서별 같은 코드 중복 제거·명시 선택 전 일반 링크·코드 제한·원본 보존',()=>{
    const rows=[...qcRows,{code:'',name:'빈 코드'},{code:'A',name:'짧은 코드'},{code:'X'.repeat(41),name:'긴 코드'},{code:' TK-2026087',name:'공백 코드'},{code:'X'.repeat(40),name:'최대 코드'}],original=JSON.stringify(rows),s=qcScreen(rows);assert.ok(s.select());assert.equal(s.select().props.value,'');assert.equal(s.href(),qcBase);assert.deepEqual(s.options(),['','TK-2026087','QA &?=#가','X'.repeat(40)]);assert.equal(JSON.stringify(rows),original);
  });
  await check('QC 프로젝트 전달: 선택한 원코드만 정확히 인코딩·잘못된 선택과 해제는 일반 링크',()=>{
    const s=qcScreen(qcRows);for(const code of ['TK-2026087','QA &?=#가']){s.choose(code);const target=new URL(s.href());assert.equal(target.origin+target.pathname,qcBase);assert.equal(target.searchParams.get('projectCode'),code);assert.deepEqual([...target.searchParams.keys()],['projectCode','register','projectName','projectRound','projectClient']);assert.equal(target.searchParams.get('projectName'),qcRows.find(p=>p.code===code).name);assert.equal(target.searchParams.get('projectRound'),'1');assert.equal(target.searchParams.get('register'),'1');}s.choose('알 수 없는 코드');assert.equal(s.href(),qcBase);s.choose('TK-2026087');s.choose('');assert.equal(s.href(),qcBase);
  });
  await check('QC 프로젝트 전달: 다른 계정·같은 ID 새 로그인·익명에서 이전 선택을 즉시 제거',()=>{
    const s=qcScreen(qcRows),original={id:'qc-user',name:'합성 직원'};for(const next of [{id:'another-user',name:'다른 직원'},original,{...original},null]){s.choose('TK-2026087');assert.equal(s.setActor(next),qcBase);assert.equal(s.href(),qcBase);assert.equal(s.select().props.value,'');}assert.equal(s.select().props.disabled,true);assert.deepEqual(s.options(),['']);
  });
  await check('QC 차수 연결: 프로젝트 수정 이력 기본값·명시 차수·잘못된 입력 차단',()=>{
    const s=qcScreen(qcRows.map(p=>p.id==='structure'?{...p,revisions:[{round:2}]}:p));s.choose('TK-2026087');assert.equal(new URL(s.href()).searchParams.get('projectRound'),'3');s.round(2);assert.equal(new URL(s.href()).searchParams.get('projectRound'),'2');for(const value of [0,-1,1.5,1000]){s.round(value);assert.equal(s.href(),undefined);}s.round(1);assert.equal(new URL(s.href()).searchParams.get('projectRound'),'1');
  });
  await check('QC 프로젝트 전달: 프로젝트 소실·중앙 연결 중단·다른 actor 공유 자료는 일반 링크이며 자동 재선택 없음',()=>{
    const s=qcScreen(qcRows);s.choose('TK-2026087');s.setProjects([qcRows[2]]);assert.equal(s.href(),qcBase);s.setProjects(qcRows);assert.equal(s.href(),qcBase);s.choose('TK-2026087');s.setStudio({ready:false,actorId:'qc-user'});assert.equal(s.href(),qcBase);assert.deepEqual(s.options(),['']);s.setStudio({ready:true,actorId:'qc-user'});assert.equal(s.href(),qcBase);s.choose('TK-2026087');s.setStudio({ready:true,actorId:'other-user'});assert.equal(s.href(),qcBase);assert.equal(s.select().props.disabled,true);s.setStudio({ready:true,actorId:'qc-user'});assert.equal(s.href(),qcBase);
  });
} finally {
  await server.close();
}
mkdirSync('test-results',{recursive:true});
writeFileSync(output,JSON.stringify(results,null,2));
for(const r of results) console.log(`${r.status} ${r.name}${r.reason ? ': '+r.reason : ''}`);
if(results.some(r=>r.status==='FAIL')) process.exitCode=1;
