import { create } from 'zustand';
import realProjectsData from '../data/realProjects.json';
import concostUsersData from '../data/concostUsers.json';
import { VIET_TEAMS_DATA } from '../data/vietTeams';

export type Department = '마감팀' | '구조팀' | '토목&조경팀';
export const DEPARTMENTS: Department[] = ['마감팀', '구조팀', '토목&조경팀'];

// 팀별 물량산출 공종 정의
export const TEAM_ROLES: Record<Department, string[]> = {
  마감팀: ['PM', '조적', '창호', '외부', '내부', '세대', '가설', '내역'],
  구조팀: ['PM', '보', '슬라브', '옹벽', '기둥', '기초', '아파트슬라브', '아파트옹벽'],
  '토목&조경팀': ['PM', '토목', '부대토목', '조경'],
};

// 전체 공종 목록 (유니크)
export const ALL_ROLES = Array.from(
  new Set([...TEAM_ROLES.마감팀, ...TEAM_ROLES.구조팀, ...TEAM_ROLES['토목&조경팀']])
);

export type RoleName = string;
export const ROLE_NAMES = ALL_ROLES;

export interface Revision {
  id: string;
  round: number;
  reason: '도면변경' | '거래처 요청사항 반영' | '산출오류' | string;
  date: string;
  comment: string;
  attachments: { name: string; url: string }[];
}

export interface Person {
  id: string;
  name: string;
  avatar: string;
  region: 'KOREA' | 'VIETNAM';
  team: string;
}

export type ProjectStatus = '착수예정' | '진행중' | '납품' | '수정';
export type SubTaskStatus = '예정' | '진행중' | '완료' | '지연';

// 1~N 세부 공종 일정 스키마 (다중 인원 및 내역 유형 지원)
export interface SubTaskSchedule {
  roleName: string;
  personId: string; // 단일 호환용
  personIds?: string[]; // 다중인원 배정 (예: ['원종수', '성대용'] or ['u_14', 'u_15'])
  startDate: string;
  endDate: string;
  status: SubTaskStatus;
  memo: string;
  version?: string;
  subType?: '공내역' | '설계예가' | '실행가' | string; // '내역' 공종 유형 (공내역 / 설계예가 / 실행가)
}

export interface ProjectRole {
  personId: string;
  startDate: string;
  endDate: string;
}

export interface Project {
  id: string;
  code: string; // 예: CC-2026-00004
  name: string;
  startDate: string;
  endDate: string;
  department: Department;
  pmId: string;
  progress: number; // 0 ~ 100%
  status: ProjectStatus;
  subTasks: Record<string, SubTaskSchedule>; // 공종명 -> 세부 일정
  roles: Partial<Record<string, ProjectRole>>; // 이전 호환
  revisions?: Revision[];
  // 그룹웨어 수주 세부 스펙 필드
  client?: string;
  area?: string; // 연면적 (예: 444,688평)
  usage?: string; // 건물용도 (예: 반도체공장)
  buildings?: string; // 동수 (예: 2개동)
  floors?: string; // 층수 (예: B4/S13)
  contacts?: string[]; // 발주처 담당자 리스트
  notes?: string; // 견적조건 및 특기사항
  request?: string; // 수주시 요청사항 및 회의록
  rawTitle?: string;
}

interface ProjectState {
  projects: Project[];
  personnel: Person[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  filterRegion: 'ALL' | 'KOREA' | 'VIETNAM';
  setFilterRegion: (region: 'ALL' | 'KOREA' | 'VIETNAM') => void;
  filterDepartment: Department | 'ALL';
  setFilterDepartment: (dept: Department | 'ALL') => void;
  addProject: (p: Omit<Project, 'id'>) => void;
  updateProject: (id: string, p: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setProjects: (projects: Project[]) => void;
  updateSubTask: (projectId: string, roleName: string, subTask: Partial<SubTaskSchedule>) => void;
  addRevision: (projectId: string, revision: Omit<Revision, 'id' | 'round'>) => void;
}

// 기술본부 유효 부서만 필터링 (사용자 규칙: 기술본부, 마감, 개발/TF, 구조, 구조(BIM), 토목·조경파트 / 임원, 경영지원 완전 제외)
const validTechDepts = ['기술본부', '마감', '구조', '토목·조경파트', '토목', '조경', '개발/TF', '개발 TF'];

const initialPersonnel: Person[] = [
  // 1. 한국 본사 기술본부 인원 (사내 엑셀 100% 동기화)
  ...concostUsersData
    .filter((u) => u.company === '컨코스트' && validTechDepts.some((d) => u.originalDept?.includes(d) || u.department?.includes(d)))
    .map((u) => ({
      id: u.id,
      name: `${u.name} ${u.position}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.idPrefix}`,
      region: 'KOREA' as const,
      team: u.department,
    })),
  // 2. 베트남 기술본부 팀 유닛 (마감 6개팀, 구조 2개팀, 토목 1개팀)
  ...VIET_TEAMS_DATA.map((vt) => ({
    id: vt.id,
    name: vt.displayName,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${vt.code}`,
    region: 'VIETNAM' as const,
    team: vt.department,
  })),
];

// 실제 프로젝트 접수목록(30건) 기반 실무 데이터 (가짜 샘플 5건 완전 제거)
const initialProjects: Project[] = realProjectsData as unknown as Project[];

export const useProjectStore = create<ProjectState>((set) => ({
  projects: initialProjects,
  personnel: initialPersonnel,
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  filterRegion: 'ALL',
  setFilterRegion: (region) => set({ filterRegion: region }),
  filterDepartment: 'ALL',
  setFilterDepartment: (dept) => set({ filterDepartment: dept }),
  addProject: (p) => set((state) => ({
    projects: [
      ...state.projects,
      {
        ...p,
        id: 'p_' + Math.random().toString(36).substring(2, 9),
        code: p.code || `TK-${new Date().getFullYear()}-${String(state.projects.length + 1).padStart(5, '0')}`,
        subTasks: p.subTasks || {},
        roles: p.roles || {},
        progress: p.progress || 0,
      }
    ]
  })),
  updateProject: (id, p) => set((state) => ({
    projects: state.projects.map((proj) => (proj.id === id ? { ...proj, ...p } : proj))
  })),
  deleteProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id)
  })),
  setProjects: (projects) => set({ projects }),
  updateSubTask: (projectId, roleName, subTaskUpdate) => set((state) => ({
    projects: state.projects.map((proj) => {
      if (proj.id !== projectId) return proj;
      const currentSub = proj.subTasks[roleName] || {
        roleName,
        personId: '',
        startDate: proj.startDate,
        endDate: proj.endDate,
        status: '예정',
        memo: '',
        version: 'v1'
      };
      const updatedSub: SubTaskSchedule = { ...currentSub, ...subTaskUpdate };
      return {
        ...proj,
        subTasks: {
          ...proj.subTasks,
          [roleName]: updatedSub
        },
        roles: {
          ...proj.roles,
          [roleName]: {
            personId: updatedSub.personId,
            startDate: updatedSub.startDate,
            endDate: updatedSub.endDate
          }
        }
      };
    })
  })),
  addRevision: (projectId, revision) => set((state) => ({
    projects: state.projects.map((proj) => {
      if (proj.id !== projectId) return proj;
      const currentRevisions = proj.revisions || [];
      const round = currentRevisions.length + 1;
      const newRevision: Revision = { ...revision, id: Math.random().toString(36).substring(2, 9), round };
      return { ...proj, revisions: [...currentRevisions, newRevision] };
    })
  }))
}));
