import * as XLSX from 'xlsx';
import { type Project, type ProjectStatus, type RoleName, ROLE_NAMES, type ProjectRole } from '../store/useProjectStore';

export const exportToExcel = (projects: Project[]) => {
  const data = projects.map(p => {
    const row: any = {
      '프로젝트 명': p.name,
      '착수일': p.startDate,
      '납품일': p.endDate,
      '상태': p.status
    };
    ROLE_NAMES.forEach(role => {
      row[role] = p.roles[role]?.personId || '';
    });
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Projects");
  XLSX.writeFile(wb, "CONCOST_PROJECT_SCHEDULE.xlsx");
};

export const importFromExcel = (file: File): Promise<Omit<Project, 'id'>[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      const projects: Omit<Project, 'id'>[] = json.map((row: any) => {
        const startDate = row['착수일'] || '';
        const endDate = row['납품일'] || '';
        const roles: Partial<Record<RoleName, ProjectRole>> = {};
        ROLE_NAMES.forEach(role => {
          if (row[role]) {
            roles[role] = {
              personId: row[role].toString().trim(),
              startDate,
              endDate
            };
          }
        });

        return {
          code: `TK-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`,
          name: row['프로젝트 명'] || '제목 없음',
          startDate,
          endDate,
          department: (row['부서'] || row['팀'] || '마감팀') as any,
          pmId: '22',
          progress: 0,
          roles,
          subTasks: {},
          status: (row['상태'] || '착수예정') as ProjectStatus
        };
      });
      resolve(projects);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
