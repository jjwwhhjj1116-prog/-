import * as XLSX from 'xlsx';
import type { Project, Person, Department } from '../store/useProjectStore';

/**
 * 프로젝트 일정표 엑셀 내보내기 (Export)
 */
export const exportProjectsToExcel = (projects: Project[], personnel: Person[]) => {
  const personMap = new Map(personnel.map((p) => [p.id, p.name]));

  // 1. 메인 프로젝트 목록 시트
  const projectRows = projects.map((p, idx) => ({
    'No': idx + 1,
    '프로젝트 코드': p.code,
    '프로젝트명': p.name,
    '담당부서': p.department,
    '총괄 PM': personMap.get(p.pmId) || p.pmId,
    '시작일': p.startDate,
    '종료일': p.endDate,
    '진척률(%)': p.progress,
    '상태': p.status,
  }));

  // 2. 세부 공종별 일정 시트
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
  const wsProjects = XLSX.utils.json_to_sheet(projectRows);
  const wsSubTasks = XLSX.utils.json_to_sheet(subTaskRows);

  XLSX.utils.book_append_sheet(wb, wsProjects, '프로젝트목록');
  XLSX.utils.book_append_sheet(wb, wsSubTasks, '세부공종일정');

  const today = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `CONCOST_기술본부_프로젝트일정표_${today}.xlsx`);
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
