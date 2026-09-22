import * as XLSX from 'xlsx';
import type { Project, Person, Department } from '../store/useProjectStore';

/**
 * 프로젝트 일정표 엑셀 내보내기 (Export)
 */
export const exportProjectsToExcel = (
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
  const activeProjects = projects.filter(
    (p) => !(p.endDate < monthStartStr || p.startDate > monthEndStr)
  );

  // 프로젝트 코드별 그룹핑 (마감/구조/토목 순차 행 배치)
  let rowNo = 1;
  activeProjects.forEach((p) => {
    const pm = personMap.get(p.pmId) || p.pmId || '-';
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
      p.startDate,
      p.endDate,
      `${p.progress}%`,
    ];

    // 1일부터 말일까지 타임라인 셀 채우기
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dateStr >= p.startDate && dateStr <= p.endDate) {
        // 간트 바 텍스트 표기
        const deptPrefix = p.department === '마감팀' ? '■마감' : p.department === '구조팀' ? '■구조' : '■토목';
        row.push(`${deptPrefix}(${p.progress}%)`);
      } else {
        row.push('');
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
  projects.forEach((p) => {
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
    const pm = personMap.get(p.pmId) || p.pmId || '-';
    const period = `${p.startDate} ~ ${p.endDate}`;
    const progress = `${p.progress}%`;

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
  projects.forEach((p) => {
    Object.entries(p.subTasks || {}).forEach(([roleName, sub]) => {
      subTaskRows.push({
        '프로젝트 코드': p.code,
        '프로젝트명': p.name,
        '담당부서': p.department,
        '공종명': roleName,
        '담당자': personMap.get(sub.personId) || sub.personId,
        '공종 시작일': sub.startDate,
        '공종 종료일': sub.endDate,
        '진행상태': sub.status,
        '비고/메모': sub.memo || '',
        '버전': sub.version || 'v1',
      });
    });
  });

  const wb = XLSX.utils.book_new();
  const wsIntegrated = XLSX.utils.json_to_sheet(integratedRows);
  const wsSubTasks = XLSX.utils.json_to_sheet(subTaskRows);

  // 시트 1에 월간 타임라인 간트 차트 배치 (핵심)
  XLSX.utils.book_append_sheet(wb, wsTimeline, `${year}년${month}월_타임라인일정표`);
  XLSX.utils.book_append_sheet(wb, wsIntegrated, '프로젝트통합요약');
  XLSX.utils.book_append_sheet(wb, wsSubTasks, '세부공종일정');

  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `CONCOST_기술본부_프로젝트통합일정표_${year}년${month}월_${today}.xlsx`);
};

/**
 * 엑셀 가져오기 (Import) 및 프로젝트 업데이트 파싱
 */
export const importProjectsFromExcel = async (
  file: File,
  currentPersonnel: Person[]
): Promise<Project[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const secondSheetName = workbook.SheetNames[1];

        const projectData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
        const subTaskData: any[] = secondSheetName
          ? XLSX.utils.sheet_to_json(workbook.Sheets[secondSheetName])
          : [];

        const personNameToId = new Map(currentPersonnel.map((p) => [p.name, p.id]));

        // 프로젝트 맵 구성
        const parsedProjects: Project[] = projectData.map((row, idx) => {
          const code = String(row['프로젝트 코드'] || `TK-${new Date().getFullYear()}-${String(idx + 1).padStart(5, '0')}`);
          const dept = (row['담당부서'] as Department) || '마감팀';
          const pmName = String(row['총괄 PM'] || '');
          const pmId = personNameToId.get(pmName) || (dept === '마감팀' ? '4' : dept === '구조팀' ? '3' : '26');

          return {
            id: `p_excel_${idx}_${Date.now()}`,
            code,
            name: String(row['프로젝트명'] || `신규 프로젝트 ${idx + 1}`),
            department: dept,
            pmId,
            startDate: String(row['시작일'] || new Date().toISOString().split('T')[0]),
            endDate: String(row['종료일'] || new Date().toISOString().split('T')[0]),
            progress: Number(row['진척률(%)']) || 0,
            status: (row['상태'] as any) || '진행중',
            roles: {},
            subTasks: {},
          };
        });

        // 세부 공종 매핑
        const projectMap = new Map(parsedProjects.map((p) => [p.code, p]));

        subTaskData.forEach((subRow) => {
          const pCode = String(subRow['프로젝트 코드'] || '');
          const proj = projectMap.get(pCode);
          if (proj) {
            const roleName = String(subRow['공종명'] || '');
            const personName = String(subRow['담당자'] || '');
            const personId = personNameToId.get(personName) || '';

            if (roleName) {
              const subTask = {
                roleName,
                personId,
                startDate: String(subRow['공종 시작일'] || proj.startDate),
                endDate: String(subRow['공종 종료일'] || proj.endDate),
                status: (subRow['진행상태'] as any) || '예정',
                memo: String(subRow['비고/메모'] || ''),
                version: String(subRow['버전'] || 'v1'),
              };
              proj.subTasks[roleName] = subTask;
              proj.roles[roleName] = {
                personId,
                startDate: subTask.startDate,
                endDate: subTask.endDate,
              };
            }
          }
        });

        resolve(parsedProjects);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
