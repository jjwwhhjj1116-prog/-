import { projectProgress, allocationScheduleOnly } from '../utils/scheduleProgress';
import { canManageSchedule } from '../utils/schedulePermissions';
import { useAuthStore, type ConcostUser } from './useAuthStore';
import {applyProjectDates,type ProjectPeriod} from '../utils/projectScheduleDates';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import realProjectsData from '../data/realProjects.json';
import concostUsersData from '../data/publicDirectory.json';
import { VIET_TEAMS_DATA } from '../data/vietTeams';

export type Department = '마감팀' | '구조팀' | '토목&조경팀';
export const DEPARTMENTS: Department[] = ['마감팀', '구조팀', '토목&조경팀'];

// 팀별 물량산출 공종 정의
export const TEAM_ROLES: Record<Department, string[]> = {
  마감팀: ['PM', '조적', '창호', '외부', '내부', '세대', '가설', '내역'],
  구조팀: ['PM', '보', '슬라브', '옹벽', '기둥', '기초', '아파트슬라브', '아파트옹벽', '철골-수직', '철골-수평'],
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

export interface PostDeliveryTask {
  submissionStatus?: 'REPORTED' | 'CANCELLED';
  createdBy?: string;
  createdByName?: string;
  submittedAt?: string;
  reviewerIds?: string[];
  revision?: number;
  department?: Department;
  cancelledAt?: string;
  progress?:number;
  actualProgressDate?:string;
  reportingMode?: 'DAILY' | 'TASK';
  reportingModes?: Record<string, 'DAILY' | 'TASK'>;
  id: string;
  kind: '검토' | '수정';
  startDate: string;
  endDate: string;
  memo: string;
  personIds: string[];
  status: '예정' | '진행중' | '완료';
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
export interface ScheduleAllocation {
  dateMode?: 'PROJECT' | 'CUSTOM';
  id:string;
  personIds:string[];
  startDate:string;
  endDate:string;
  memo?:string;
  source?:{workbookHash:string;sheet:string;ownerRange:string;roleRange:string;projectRange:string;projectText:string;roleText:string};
}
export interface SubTaskSchedule {
  dateMode?: 'PROJECT' | 'CUSTOM';
  scopeExcluded?:boolean; // 담당자 미배정과 구분되는 용역 범위 제외 상태.
  allocations?:ScheduleAllocation[];
  legacyAllocationId?:string; // Retained original assignment keeps its existing work-log/task ID.
  actualProgressDate?:string;
  reportingMode?: 'DAILY' | 'TASK';
  reportingModes?: Record<string, 'DAILY' | 'TASK'>;
  progress?: number;
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
  scheduleExtensions?: ScheduleExtension[];
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
  postDeliveryTasks?: PostDeliveryTask[]; // 납품 이후 검토·수정. 기존 납품 공정률과 별도
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

export interface ScheduleExtension {
  allocationId?: string;
  id:string; taskId:string; userId:string; userName:string; roleName:string;
  type?:'DEADLINE'|'OVERTIME'; workDate?:string; startTime?:string; endTime?:string; hours?:number; reasonCategory?:string; approverId?:string;
  previousEnd:string; requestedEnd:string; reason:string; createdAt:string;
  approvalStage?:'PM'|'TEAM'; pmApproverId?:string;
  pmReview?:{userId:string;name:string;approvedAt:string;memo:string};
  appliedTaskId?:string; appliedAllocationId?:string;
  status:'PENDING'|'APPROVED'|'REJECTED'; decidedBy?:string; decidedName?:string; decidedAt?:string; decisionMemo?:string;
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
  setProjects: (projects: Project[]) => void;
  importProjects: (projects: Project[], createOnly?: boolean) => void;
  updateSubTask: (projectId: string, roleName: string, subTask: Partial<SubTaskSchedule>) => void;
  updateProjectSubTasks: (projectId: string, subTasks: Record<string, SubTaskSchedule>, period?: ProjectPeriod) => void;
  applyApprovedProgress: (projectId: string, updates: Record<string, Pick<SubTaskSchedule, "progress" | "status" | "memo">>) => void;
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

// Keep historical assignment IDs and VIET team units while applying the shared directory.
export function mergeDirectoryPersonnel(personnel: Person[], users: ConcostUser[]): Person[] {
  const people = new Map(personnel.map(person => [person.id, person]));
  for (const user of users) {
    const isVietnam = user.company === 'VIETQS' && user.active !== false && DEPARTMENTS.includes(user.department as Department);
    if (!isVietnam && (user.company !== '컨코스트' || !validTechDepts.some(dept => user.originalDept?.includes(dept) || user.department?.includes(dept)))) continue;
    people.set(user.id, {
      ...people.get(user.id), id: user.id, name: isVietnam ? user.name : `${user.name} ${user.position}`,
      avatar: people.get(user.id)?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.idPrefix}`,
      region: isVietnam ? 'VIETNAM' : 'KOREA', team: user.department,
    });
  }
  return [...people.values()];
}

// 실제 프로젝트 접수목록(30건) 기반 실무 데이터 (가짜 샘플 5건 완전 제거)
const initialProjects: Project[] = realProjectsData as unknown as Project[];

export function syncProjectTasks(project: Project, tasks: Record<string, SubTaskSchedule>): Project {
  const subTasks = Object.fromEntries(Object.entries(tasks).map(([name, task]) => {
    const personIds = task.scopeExcluded ? [] : [...new Set((task.personIds ?? (task.personId ? [task.personId] : [])).filter(Boolean))];
    return [name, { ...task, ...(task.scopeExcluded ? {allocations: []} : {}), roleName: name, personIds, personId: personIds[0] || '' }];
  }));
  const legacyRoles = Object.fromEntries(Object.entries(project.roles || {}).filter(([name]) => !project.subTasks?.[name]));
  const roles = {...legacyRoles, ...Object.fromEntries(Object.entries(subTasks).map(([name, task]) => [name, {
    personId: task.personId, startDate: task.startDate, endDate: task.endDate
  }]))};
  return { ...project, subTasks, roles, pmId: subTasks.PM?.personId ?? (project.subTasks?.PM ? '' : project.pmId), progress: allocationScheduleOnly({...project.roles,...project.subTasks},{...roles,...subTasks}) ? project.progress : projectProgress({...project, subTasks, roles}).actual ?? project.progress };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: initialProjects,
      personnel: initialPersonnel,
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      filterRegion: 'ALL',
      setFilterRegion: (region) => set({ filterRegion: region }),
      filterDepartment: 'ALL',
      setFilterDepartment: (dept) => set({ filterDepartment: dept }),
      addProject: (p) => set((state) => state.projects.some(existing => p.code && existing.code === p.code && existing.department === p.department) ? state : ({
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
        projects: state.projects.map(proj => {
          if (proj.id !== id) return proj;
          if (['startDate','endDate','pmId','roles','subTasks','postDeliveryTasks'].some(key => key in p) && !canManageSchedule(useAuthStore.getState().currentUser, proj.department)) throw new Error('해당 팀 실장·팀장만 일정을 조정할 수 있습니다.');
          const next={...proj,...p};
          return ['startDate','endDate'].some(key=>key in p)?syncProjectTasks(next,applyProjectDates(next)):next;
        })
      })),
      setProjects: (projects) => set({ projects }),
      importProjects: (incoming, createOnly = false) => set((state) => {
        const key = (p: Project) => `${p.code}::${p.department}`;
        if (incoming.some(p => !canManageSchedule(useAuthStore.getState().currentUser, p.department))) throw new Error('해당 팀 실장·팀장만 일정을 가져올 수 있습니다.');
        if (new Set(incoming.map(key)).size !== incoming.length) throw new Error('같은 프로젝트/부서가 중복되어 있습니다.');
        if (createOnly && incoming.some(p => state.projects.some(existing => key(existing) === key(p)))) throw new Error('이미 등록된 프로젝트/팀이 있습니다. 다시 미리보기를 확인하세요.');
        const updates = new Map(incoming.map(p => [key(p), p]));
        // 파일을 읽는 동안 수신한 다른 팀 일정도 보존하며 기존 문서의 연결 ID를 유지한다.
        const projects = state.projects.map(p => updates.has(key(p)) ? {...updates.get(key(p))!, id: p.id} : p);
        projects.push(...incoming.filter(p => !state.projects.some(existing => key(existing) === key(p))));
        if (projects.some(p => !p.id) || new Set(projects.map(p => p.id)).size !== projects.length) throw new Error('프로젝트 ID가 충돌합니다. 기존 일정은 변경하지 않았습니다.');
        return {projects};
      }),
      updateSubTask: (projectId, roleName, update) => set((state) => ({
        projects: state.projects.map(project => {
          if (project.id !== projectId) return project;
          if (!canManageSchedule(useAuthStore.getState().currentUser, project.department)) throw new Error('해당 팀 실장·팀장만 일정을 조정할 수 있습니다.');
          const task: SubTaskSchedule = { ...(project.subTasks[roleName] ?? {roleName, personId: '', startDate: project.startDate, endDate: project.endDate, status: '예정' as SubTaskStatus, memo: ''}), ...update };
          if (update.personId !== undefined && update.personIds === undefined) task.personIds = update.personId ? [update.personId] : [];
          return syncProjectTasks(project, { ...project.subTasks, [roleName]: task });
        })
      })),
      updateProjectSubTasks: (projectId, tasks, period) => set((state) => ({
        projects: state.projects.map(project => {
          if (project.id !== projectId) return project;
          if (!canManageSchedule(useAuthStore.getState().currentUser, project.department)) throw new Error('해당 팀 실장·팀장만 일정을 조정할 수 있습니다.');
          const next={...project,...period};
          return syncProjectTasks(next, applyProjectDates(next,tasks));
        })
      })),
      applyApprovedProgress: (projectId, updates) => set(state => ({projects: state.projects.map(project => {
        if (project.id !== projectId) return project;
        const subTasks = { ...project.subTasks };
        for (const [role, update] of Object.entries(updates)) if (subTasks[role]) subTasks[role] = { ...subTasks[role], ...update };
        return syncProjectTasks(project, subTasks);
      })})),
      addRevision: (projectId, revision) => set((state) => ({
        projects: state.projects.map((proj) => {
          if (proj.id !== projectId) return proj;
          const currentRevisions = proj.revisions || [];
          const round = currentRevisions.length + 1;
          const newRevision: Revision = { ...revision, id: Math.random().toString(36).substring(2, 9), round };
          return { ...proj, revisions: [...currentRevisions, newRevision] };
        })
      }))
    }),
    {
      name: 'concost_projects_data_v2',
      // initialProjects는 항상 30건 실무 데이터 보존
      partialize: (state) => ({
        projects: state.projects,
        filterRegion: state.filterRegion,
        filterDepartment: state.filterDepartment
      })
    }
  )
);
