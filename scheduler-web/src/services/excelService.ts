import {translateWorkbook,translatedAlert} from './translationService';
import {useLanguageStore} from '../store/useLanguageStore';
import {usePersonalStore} from '../store/usePersonalStore';
import {assignmentSegments,type Leave} from '../utils/personalWork';
import { projectProgress, workDays, validDateRange, percentLabel,projectScheduleRange } from '../utils/scheduleProgress';
import * as XLSX from 'xlsx';
import type { Project, Person, Department } from '../store/useProjectStore';
import { projectPMId } from '../utils/pendingAssignment';

/**
 * 프로젝트 일정표 엑셀 내보내기 (Export)
 */
export const buildProjectsWorkbook = (
  projects: Project[],
  personnel: Person[],
  targetDate: Date = new Date()
) => {
  const personMap = new Map(personnel.map((p) => [p.id, p.name]));
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // 1. [핵심] 화면 일치형 월간 프로젝트 타임라인 간트 매트릭스 시트 구성
  // AOA (Array of Arrays) 형식으로 정밀 구축
  const timelineAoa: any[][] = [];

  // Row 1: 대제목
  const titleRow = new Array(9 + daysInMonth).fill('');
  titleRow[0] = `CONCOST 기술본부 · ${year}년 ${month}월 프로젝트 통합 일정표 (월간 타임라인)`;
  timelineAoa.push(titleRow);

  // Row 2: 메인 헤더
  const headerRow = [
    'No',
    '프로젝트 코드',
    '프로젝트명',
    '발주처',
    '공종(팀)',
    '담당 PM',
    '시작일',
    '종료일',
    '진척률',
  ];
  for (let d = 1; d <= daysInMonth; d++) {
    headerRow.push(`${d}일`);
  }
  timelineAoa.push(headerRow);

  // Row 3: 요일 및 공휴일 서브헤더
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeekRow = ['', '', '', '', '', '', '', '', ''];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dayNames[dateObj.getDay()];
    dayOfWeekRow.push(dayOfWeek);
  }
  timelineAoa.push(dayOfWeekRow);

  // 해당 월에 일정이 겹치는 프로젝트 선별
  const activeProjects = projects.filter(p => {
    const range = projectScheduleRange(p);
    return (validDateRange(range.start,range.end)&&range.end>=monthStartStr&&range.start<=monthEndStr) ||
      (p.postDeliveryTasks||[]).some(task=>task.startDate<=monthEndStr&&task.endDate>=monthStartStr) ||
      (!range.start||!range.end)&&!projectPMId(p);
  });

  // 프로젝트 코드별 그룹핑 (마감/구조/토목 순차 행 배치)
  let rowNo = 1;
  activeProjects.forEach((p) => {
    const pmId = projectPMId(p);
    const pm = personMap.get(pmId) || pmId || '-';
    const range = projectScheduleRange(p);
    const cleanName =
      p.name.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() ||
      p.name;
    const client = (p as any).client || '-';

    const row = [
      rowNo++,
      p.code || p.id,
      cleanName,
      client,
      p.department,
      pm,
      range.start,
      range.end,
      percentLabel(projectProgress(p).actual),
    ];

    // 1일부터 말일까지 타임라인 셀 채우기
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const followUp=(p.postDeliveryTasks||[]).find(task=>dateStr>=task.startDate&&dateStr<=task.endDate);
      if (validDateRange(range.start,range.end)&&dateStr >= range.start && dateStr <= range.end) {
        // 간트 바 텍스트 표기
        const deptPrefix = p.department === '마감팀' ? '■마감' : p.department === '구조팀' ? '■구조' : '■토목';
        row.push(`${deptPrefix}(${percentLabel(projectProgress(p).actual)})${followUp?` ◆${followUp.kind}`:''}`);
      } else {
        row.push(followUp?`◆${followUp.kind}`:'');
      }
    }
    timelineAoa.push(row);
  });

  const wsTimeline = XLSX.utils.aoa_to_sheet(timelineAoa);

  // 컬럼 너비 설정
  const cols = [
    { wch: 5 },  // No
    { wch: 15 }, // 코드
    { wch: 28 }, // 프로젝트명
    { wch: 14 }, // 발주처
    { wch: 10 }, // 공종
    { wch: 10 }, // 담당 PM
    { wch: 12 }, // 시작일
    { wch: 12 }, // 종료일
    { wch: 8 },  // 진척률
  ];
  for (let d = 1; d <= daysInMonth; d++) {
    cols.push({ wch: 12 }); // 각 일자 간트 컬럼 너비 (넉넉하게 12)
  }
  wsTimeline['!cols'] = cols;

  // 2. 부서별 통합 요약 시트
  const groupMap: Record<string, any> = {};
  activeProjects.forEach((p) => {
    const code = p.code || p.id;
    if (!groupMap[code]) {
      groupMap[code] = {
        code: p.code,
        name: p.name.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() || p.name,
        client: (p as any).client || '',
        area: (p as any).area || '',
        usage: (p as any).usage || '',
        finishPm: '-',
        finishPeriod: '-',
        finishProgress: '-',
        structPm: '-',
        structPeriod: '-',
        structProgress: '-',
        civilPm: '-',
        civilPeriod: '-',
        civilProgress: '-',
        status: p.status,
      };
    }
    const pmId = projectPMId(p);
    const pm = personMap.get(pmId) || pmId || '-';
    const range = projectScheduleRange(p);
    const period = `${range.start} ~ ${range.end}`;
    const progress = percentLabel(projectProgress(p).actual);

    if (p.department === '마감팀') {
      groupMap[code].finishPm = pm;
      groupMap[code].finishPeriod = period;
      groupMap[code].finishProgress = progress;
    } else if (p.department === '구조팀') {
      groupMap[code].structPm = pm;
      groupMap[code].structPeriod = period;
      groupMap[code].structProgress = progress;
    } else if (p.department === '토목&조경팀') {
      groupMap[code].civilPm = pm;
      groupMap[code].civilPeriod = period;
      groupMap[code].civilProgress = progress;
    }
  });

  const integratedRows = Object.values(groupMap).map((grp, idx) => ({
    'No': idx + 1,
    '프로젝트 코드': grp.code,
    '프로젝트명': grp.name,
    '발주처': grp.client,
    '연면적/용도': `${grp.area} ${grp.usage ? `(${grp.usage})` : ''}`.trim(),
    '마감팀 PM': grp.finishPm,
    '마감팀 일정': grp.finishPeriod,
    '마감팀 진척률': grp.finishProgress,
    '구조팀 PM': grp.structPm,
    '구조팀 일정': grp.structPeriod,
    '구조팀 진척률': grp.structProgress,
    '토목팀 PM': grp.civilPm,
    '토목팀 일정': grp.civilPeriod,
    '토목팀 진척률': grp.civilProgress,
    '종합 상태': grp.status,
  }));

  // 3. 세부 공종별 일정 시트
  const subTaskRows: any[] = [];
  activeProjects.forEach((p) => {
    Object.entries({...p.roles, ...p.subTasks}).forEach(([roleName, task]) => {
     if (!task) return;
     const sub = task as Partial<Project['subTasks'][string]>;
     if(sub.scopeExcluded){
      subTaskRows.push({'프로젝트 코드':p.code,'프로젝트명':p.name,'담당부서':p.department,'공종명':roleName,'담당자':'용역 범위 없음','작업일':0,'실제 진척률(%)':'','공종 시작일':'','공종 종료일':'','진행상태':'용역 범위 없음'});
      return;
     }
     for(const segment of assignmentSegments(task, p.startDate, p.endDate)){
      subTaskRows.push({
        '프로젝트 코드': p.code,
        '프로젝트명': p.name,
        '담당부서': p.department,
        '공종명': roleName,
        '담당자': segment.personIds.map(id => personMap.get(id) || id).join(', '),
        '작업일': workDays(segment.startDate, segment.endDate) ?? '',
        '실제 진척률(%)': sub?.progress ?? '',
        '내역 유형': sub?.subType || '',
        '공종 시작일': segment.startDate,
        '공종 종료일': segment.endDate,
        '진행상태': sub?.status || '',
        '비고/메모': segment.memo || '',
        '버전': sub.version || (p.subTasks?.[roleName] ? 'v1' : ''),
        ...(segment.id?{'배정 구간 ID':segment.id,'원본 근거':segment.source?JSON.stringify(segment.source):''}:{}),
      });
     }
    });
  });

  const wb = XLSX.utils.book_new();
  const wsIntegrated = XLSX.utils.json_to_sheet(integratedRows);
  const wsSubTasks = XLSX.utils.json_to_sheet(subTaskRows);

  // 시트 1에 월간 타임라인 간트 차트 배치 (핵심)
  XLSX.utils.book_append_sheet(wb, wsTimeline, `${year}년${month}월_타임라인일정표`);
  XLSX.utils.book_append_sheet(wb, wsIntegrated, '프로젝트통합요약');
  XLSX.utils.book_append_sheet(wb, wsSubTasks, '세부공종일정');
  const followUpRows=activeProjects.flatMap(p=>(p.postDeliveryTasks||[]).filter(task=>task.startDate<=monthEndStr&&task.endDate>=monthStartStr).map(task=>({
    '프로젝트 코드':p.code,'프로젝트명':p.name,'담당부서':p.department,'구분':task.kind,'시작일':task.startDate,'종료일':task.endDate,
    '담당자':task.personIds.map(id=>personMap.get(id)||id).join(', '),'상태':task.status,'수정·검토 메모':task.memo,
  })));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(followUpRows,{header:['프로젝트 코드','프로젝트명','담당부서','구분','시작일','종료일','담당자','상태','수정·검토 메모']}),'납품후검토수정');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activeProjects.map(p => ({
    '프로젝트 코드': p.code, '부서': p.department, '계획 공정률(%)': projectProgress(p).planned ?? '미산정',
    '실제 공정률(%)': projectProgress(p).actual ?? '미산정', '기준': '한국 공휴일 확인 범위 2026~2027 / 오늘 기준 / PM 제외'
  }))), '계획실적');
  // 표시용 시트의 열 변경과 무관하게 다중 배정·수정이력·원본 상세를 보존한다.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activeProjects.map(p => ({schema: 'concost-project-v1', data: JSON.stringify(p)}))), '복원데이터');
  const scheduleIssues = activeProjects.flatMap(p => Object.entries(p.subTasks || {}).filter(([, task]) => !task.scopeExcluded && !validDateRange(task.startDate, task.endDate)).map(([roleName, task]) => ({
    '프로젝트 코드': p.code, '프로젝트명': p.name, '공종명': roleName, '시작일': task.startDate, '종료일': task.endDate, '오류': '시작일·종료일 또는 기간 순서를 확인해 주세요.',
  })));
  if (scheduleIssues.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleIssues), '일정검수');
  return wb;
};

export function buildProjectRangeWorkbook(projects: Project[], personnel: Person[], targetDate = new Date(), monthCount = 1, leaves: Leave[] = [], department: Department | 'ALL' = 'ALL') {
  projects = department === 'ALL' ? projects : projects.filter(p=>p.department===department);
  const wb = buildProjectsWorkbook(projects, personnel, targetDate);
  for (let i=1; i<monthCount; i++) {
    const next = buildProjectsWorkbook(projects, personnel, new Date(targetDate.getFullYear(), targetDate.getMonth()+i,1));
    XLSX.utils.book_append_sheet(wb, next.Sheets[next.SheetNames[0]], next.SheetNames[0]);
    for (const name of ['프로젝트통합요약','세부공종일정','납품후검토수정','계획실적',...(next.Sheets['일정검수']?['일정검수']:[])]) {
      const rows = [...(wb.Sheets[name]?XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]):[]), ...XLSX.utils.sheet_to_json<Record<string, unknown>>(next.Sheets[name])];
      const merged = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const key = name === '프로젝트통합요약' ? String(row['프로젝트 코드']) : JSON.stringify(row);
        const previous = merged.get(key);
        const values = Object.entries(row).filter(([field,value]) => value !== '' && !(name === '프로젝트통합요약' && value === '-' && /^(마감팀|구조팀|토목팀) (PM|일정|진척률)$/.test(field) && previous?.[field] !== undefined && previous[field] !== '-'));
        merged.set(key, {...previous, ...Object.fromEntries(values)});
      }
      wb.Sheets[name] = XLSX.utils.json_to_sheet([...merged.values()].map((row,index)=> name === '프로젝트통합요약' ? {...row,No:index+1} : row));
    }
  }
  if (monthCount > 1) {
    const start = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-01`;
    const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth()+monthCount,0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${endDate.getDate()}`;
    wb.Sheets['복원데이터'] = XLSX.utils.json_to_sheet(projects.filter(p=>{
      const range=projectScheduleRange(p);
      return (validDateRange(range.start,range.end)&&range.start<=end&&range.end>=start)||(p.postDeliveryTasks||[]).some(task=>task.startDate<=end&&task.endDate>=start)||(!range.start||!range.end)&&!projectPMId(p);
    }).map(p=>({schema:'concost-project-v1',data:JSON.stringify(p)})));
  }
  const first=`${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-01`;
  const lastDate=new Date(targetDate.getFullYear(),targetDate.getMonth()+monthCount,0);
  const last=`${lastDate.getFullYear()}-${String(lastDate.getMonth()+1).padStart(2,'0')}-${String(lastDate.getDate()).padStart(2,'0')}`;

  const rows=leaves.filter(l=>l.start_date<=last&&l.end_date>=first).filter(l=>personnel.some(p=>p.id===l.user_id&&(department==='ALL'||p.team===department))).map(l=>{const person=personnel.find(p=>p.id===l.user_id);return {'성명':person?.name||l.name||l.user_id,'팀':person?.team||'','휴가 종류':l.kind,'시작일':l.start_date,'종료일':l.end_date,'등록 상태':'본인 등록 (인사 승인 별도)'};});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows,{header:['성명','팀','휴가 종류','시작일','종료일','등록 상태']}),'휴가일정');
  return wb;
}

export async function exportProjectsToExcel(projects: Project[], personnel: Person[], targetDate = new Date(), monthCount = 1, department: Department | 'ALL' = 'ALL', language: 'ko'|'vi' = useLanguageStore.getState().lang) {
  try {
    // Project identities stay Korean in both full detail and shortened timeline cells.
    const projectNames=projects.flatMap(project=>[project.name,project.name.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim()]);
    const workbook=await translateWorkbook(buildProjectRangeWorkbook(projects, personnel, targetDate, monthCount, usePersonalStore.getState().leaves, department),language,projectNames);
    XLSX.writeFile(workbook, `CONCOST_${language==='vi'?'Lich_trinh':'일정표'}_${targetDate.getFullYear()}-${targetDate.getMonth()+1}_${monthCount}${language==='vi'?'thang':'개월'}.xlsx`);
    return true;
  }catch{void translatedAlert('엑셀 번역을 완료하지 못했습니다. 다시 시도하거나 한국어로 전환해 주세요.');return false;}
}

export function parseProjectsWorkbook(workbook: XLSX.WorkBook): Project[] {
  const sheet = workbook.Sheets['복원데이터'];
  if (!sheet) throw new Error('이 파일에는 검증 가능한 복원데이터 시트가 없습니다. 기존 일정은 변경하지 않았습니다. 새 버전에서 내보낸 파일을 사용해 주세요.');
  const rows = XLSX.utils.sheet_to_json<{schema:string,data:string}>(sheet);
  const keys = new Set<string>();
  return rows.map(row => {
    if (row.schema !== 'concost-project-v1') throw new Error('지원하지 않는 일정 데이터 형식입니다.');
    const p = JSON.parse(row.data) as Project;
    if (!p.id || !p.code || !p.name || !['마감팀','구조팀','토목&조경팀'].includes(p.department) ||
      !p.subTasks || !p.roles || !Number.isFinite(p.progress) || p.progress<0 || p.progress>100 ||
      !validDateRange(p.startDate,p.endDate)) throw new Error('필수 값 또는 기간이 잘못되었습니다.');
    for (const [roleName, task] of Object.entries(p.subTasks)) {
      if (!task || task.scopeExcluded!==undefined&&typeof task.scopeExcluded!=='boolean' ||
        task.scopeExcluded&&(roleName==='PM'||task.personId||(task.personIds||[]).length||!Array.isArray(task.allocations)||task.allocations.length) ||
        !task.scopeExcluded&&!validDateRange(task.startDate||p.startDate,task.endDate||p.endDate) ||
        (task.personIds !== undefined && (!Array.isArray(task.personIds) || task.personIds.some(id=>typeof id !== 'string')))) throw new Error(`프로젝트 ${p.code} · ${roleName} (${task?.startDate || '미설정'} ~ ${task?.endDate || '미설정'}): 공종 데이터가 잘못되었습니다. 시작일·종료일과 담당자 정보를 확인해 주세요.`);
    }
    const key = `${p.code}::${p.department}`;
    if (keys.has(key)) throw new Error('같은 프로젝트/부서가 중복되어 있습니다.');
    keys.add(key);
    return p;
  });
}

export async function importProjectsFromExcel(file: File, _personnel: Person[]): Promise<Project[]> {
  return parseProjectsWorkbook(XLSX.read(await file.arrayBuffer(), {type:'array'}));
}

export interface LegacyProjectPreview {
  row: number;
  project: Project;
  assignments: string[];
  issues: string[];
  oldProgress: number | null;
}

const legacyRoles = ['검토','내역','가설','세대','내부','외부','창호','조적'] as const;
const legacyDepartments: Department[] = ['마감팀','구조팀','토목&조경팀'];
const legacyText = (value: unknown) => String(value ?? '').trim();
const legacyOwner = (value: unknown) => {
  const text = legacyText(value);
  return !text || /^x$/i.test(text) ? '' : text;
};

function legacyDate(value: unknown, date1904: boolean): string {
  if (typeof value === 'number') {
    // 구형 시트의 날짜는 Excel 일련번호. 1900년 초 윤년 호환 구간은 이관하지 않는다.
    if (!Number.isInteger(value) || (!date1904 && value < 61) || value < 0 || value > 2958465) return '';
    const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
    return new Date(base+value*86400000).toISOString().slice(0,10);
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
  const text = legacyText(value).replace(/[./]/g,'-');
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return '';
  const [year,month,day]=text.split('-');
  return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
}

// 원본 배정 시트: MIN(WORKDAY(시작일, 표준일수-1), 납품일). 공휴일은 이 원본 수식에 없다.
function legacyEnd(start: string, end: string, days: number): string {
  if (!days) return end;
  const cursor = new Date(`${start}T12:00:00Z`);
  let remaining = days - 1;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) remaining--;
  }
  return [cursor.toISOString().slice(0,10),end].sort()[0];
}

export function parseLegacyProjectsWorkbook(workbook: XLSX.WorkBook, personnel: Person[]): LegacyProjectPreview[] {
  const sheet = workbook.Sheets['진행중'];
  const settings = workbook.Sheets['설정'];
  if (!sheet || !settings) throw new Error('지원하는 구형 일정표 형식이 아닙니다. 기존 일정은 변경하지 않았습니다.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:''});
  const header = rows[3] || [];
  if (legacyText(header[2]) !== 'No' || legacyText(header[3]) !== '업무명' ||
      legacyText(header[21]) !== '작업시작일' || legacyText(header[22]) !== '납품일' ||
      legacyText(header[11]) !== 'PM') throw new Error('구형 일정표 열 배치가 다릅니다. 기존 일정은 변경하지 않았습니다.');
  const settingRows = XLSX.utils.sheet_to_json<unknown[]>(settings,{header:1,raw:true,defval:''});
  const standardDays = new Map<string,number>();
  for (const row of settingRows.slice(3)) {
    const role=legacyText(row[0]), days=Number(row[1]);
    if (role && Number.isInteger(days) && days >= 0 && days <= 365) standardDays.set(role,days);
  }
  if (standardDays.get('PM') !== 0 || legacyRoles.some(role => !standardDays.has(role) || standardDays.get(role)! < 1))
    throw new Error('구형 일정표의 공종별 표준일수 설정을 확인할 수 없습니다.');
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const preview: LegacyProjectPreview[]=[];
  const sourceKeys=new Set<string>();
  for (let index=4; index<rows.length; index++) {
    const row=rows[index], code=legacyText(row[2]), name=legacyText(row[3]);
    if (!code && !name) continue;
    if (!code || !name || sourceKeys.has(code)) throw new Error(`${index+1}행의 번호·업무명 중복 또는 누락. 기존 일정은 변경하지 않았습니다.`);
    sourceKeys.add(code);
    const startDate=legacyDate(row[21],date1904), endDate=legacyDate(row[22],date1904);
    if (!validDateRange(startDate,endDate)) throw new Error(`${index+1}행의 시작일·납품일이 잘못되었습니다. 기존 일정은 변경하지 않았습니다.`);
    if (legacyDepartments.every((_,deptIndex)=>!legacyOwner(row[8+deptIndex]))) throw new Error(`${index+1}행의 작업범위 담당자가 없습니다. 기존 일정은 변경하지 않았습니다.`);
    for (const [deptIndex,department] of legacyDepartments.entries()) {
      const teamOwner=legacyOwner(row[8+deptIndex]);
      if (!teamOwner) continue;
      const issues:string[]=[], assignments:string[]=[];
      const findPerson=(raw:string, role:string): string => {
        const matched=personnel.filter(person => person.name===raw || person.name.startsWith(`${raw} `));
        const inTeam=matched.filter(person => person.team===department);
        if (inTeam.length===1) return inTeam[0].id;
        issues.push(`${role} 담당자 '${raw}' ${inTeam.length>1?'중복':'해당 팀에서 미확인'}`);
        return '';
      };
      const pmText=department==='마감팀' ? legacyOwner(row[11]) || teamOwner : teamOwner;
      const pmId=findPerson(pmText,'PM');
      const statusText=legacyText(row[26]);
      if (statusText && !['완료','시작전','진행중'].includes(statusText)) issues.push(`현재 상태 '${statusText}' 확인 필요`);
      const status:Project['status']=statusText==='완료'?'납품':statusText==='시작전'?'착수예정':'진행중';
      const taskStatus:Project['subTasks'][string]['status']=status==='납품'?'완료':status==='진행중'?'진행중':'예정';
      const subTasks:Project['subTasks']={PM:{roleName:'PM',personId:pmId,personIds:pmId?[pmId]:[],startDate,endDate,status:taskStatus,memo:`구형 일정표 ${index+1}행: ${pmText}`}};
      assignments.push(`PM ${pmText} (${startDate} ~ ${endDate})`);
      if (department==='마감팀') {
        if (pmText!==teamOwner) {
          const ownerId=findPerson(teamOwner,'마감');
          assignments.push(`마감 담당 ${teamOwner}${ownerId?'':' (확인 필요)'}`);
        }
        legacyRoles.forEach((role,roleIndex) => {
          const raw=legacyOwner(row[12+roleIndex]);
          if (!raw) return;
          const id=findPerson(raw,role);
          const finish=legacyEnd(startDate,endDate,standardDays.get(role)!);
          assignments.push(`${role} ${raw} (${startDate} ~ ${finish})`);
          if (id) subTasks[role]={roleName:role,personId:id,personIds:[id],startDate,endDate:finish,status:taskStatus,memo:'구형 Excel 표준 투입일수 기반 일정'};
        });
      }
      const oldProgress=legacyText(row[25])===''?Number.NaN:Number(row[25]);
      const oldProgressValid=Number.isFinite(oldProgress)&&oldProgress>=0&&oldProgress<=100?oldProgress:null;
      const details=[
        `구형 일정표 ${index+1}행 / 원본 상태: ${statusText||'미입력'} / 기존 진척률: ${oldProgressValid===null?'미입력':`${oldProgressValid}%`} (승인 업무일지 실적 아님)`,
        `원본 담당: 마감 ${legacyOwner(row[8])||'없음'}, 구조 ${legacyOwner(row[9])||'없음'}, 토목 ${legacyOwner(row[10])||'없음'}, PM ${legacyOwner(row[11])||'없음'}`,
        legacyText(row[20])?`원본 수주일: ${legacyDate(row[20],date1904)||legacyText(row[20])}`:'',
        ...[['타입수',6],['선행작업',7],['우선순위',24],['비고',27],['회의인원',28],['회의일자',29],['회의내용',30],['마감이슈',31],['구조이슈',32],['토목이슈',33]].map(([label,col])=>legacyText(row[Number(col)])?`${label}: ${legacyText(row[Number(col)])}`:'').filter(Boolean),
      ].filter(Boolean);
      const project:Project={
        id:`legacy-${code}-${deptIndex}`, code,name,department,pmId,startDate,endDate,status,progress:0,subTasks,
        roles:Object.fromEntries(Object.entries(subTasks).map(([role,task])=>[role,{personId:task.personId,startDate:task.startDate,endDate:task.endDate}])),
        client:legacyText(row[4]),area:legacyText(row[5]),notes:details.join('\n'),rawTitle:name,
      };
      preview.push({row:index+1,project,assignments,issues,oldProgress:oldProgressValid});
    }
  }
  if (!preview.length) throw new Error('구형 일정표에 작업범위 담당자가 없습니다. 기존 일정은 변경하지 않았습니다.');
  return preview;
}
