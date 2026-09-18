import { create } from 'zustand';

export type Department = '마감팀' | '구조팀' | '토목&조경팀';
export const DEPARTMENTS: Department[] = ['마감팀', '구조팀', '토목&조경팀'];

// 팀별 물량산출 공종 정의
export const TEAM_ROLES: Record<Department, string[]> = {
  마감팀: ['PM', '조적', '창호', '외부', '내부', '세대', '가설'],
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

// 1~N 세부 공종 일정 스키마 (스크린샷 2 모달 카드 연동)
export interface SubTaskSchedule {
  roleName: string;
  personId: string;
  startDate: string;
  endDate: string;
  status: SubTaskStatus;
  memo: string;
  version?: string;
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

// 28명 기술본부 담당 인원 목록
const initialPersonnel: Person[] = [
  // DOMESTIC (KOREA)
  { id: '1', name: '최영배 본부장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=cyb', region: 'KOREA', team: '기술본부' },
  { id: '2', name: '조한빈 실장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jhb', region: 'KOREA', team: '마감팀' },
  { id: '3', name: '김재헌 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=kjh', region: 'KOREA', team: '구조팀' },
  { id: '4', name: '양한규 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yhg', region: 'KOREA', team: '마감팀' },
  { id: '5', name: '성대용 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sdy', region: 'KOREA', team: '마감팀' },
  { id: '6', name: '원종수 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wjs', region: 'KOREA', team: '구조팀' },
  { id: '7', name: '송영길 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=syg', region: 'KOREA', team: '마감팀' },
  { id: '8', name: '이은지 책임', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lej', region: 'KOREA', team: '마감팀' },
  { id: '9', name: '송치영 책임', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=scy', region: 'KOREA', team: '마감팀' },
  { id: '10', name: '남은주 책임', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=nej', region: 'KOREA', team: '마감팀' },
  { id: '11', name: '임승주 선임', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=isj', region: 'KOREA', team: '마감팀' },
  { id: '12', name: '임창열 선임', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=icy', region: 'KOREA', team: '마감팀' },
  { id: '13', name: '김수겸 프로', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ksg', region: 'KOREA', team: '마감팀' },
  // VIET (VIETNAM)
  { id: '14', name: 'VIET 내부1팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vin1', region: 'VIETNAM', team: 'VIET QS' },
  { id: '15', name: 'VIET 내부2팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vin2', region: 'VIETNAM', team: 'VIET QS' },
  { id: '16', name: 'VIET 내부3팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vin3', region: 'VIETNAM', team: 'VIET QS' },
  { id: '17', name: 'VIET 외부팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vout', region: 'VIETNAM', team: 'VIET QS' },
  { id: '18', name: 'VIET 창호팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vwin', region: 'VIETNAM', team: 'VIET QS' },
  { id: '19', name: 'VIET 조적팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vbrick', region: 'VIETNAM', team: 'VIET QS' },
  { id: '20', name: 'VIET 골조팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vframe', region: 'VIETNAM', team: 'VIET QS' },
  { id: '21', name: 'VIET 토목팀', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vcivil', region: 'VIETNAM', team: 'VIET QS' },
  // OTHER KOREA
  { id: '23', name: '신동헌 팀장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sdh', region: 'KOREA', team: '구조팀' },
  { id: '24', name: '박용진 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=pyj', region: 'KOREA', team: '개발 TF' },
  { id: '25', name: '장범선 실장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bsjang', region: 'KOREA', team: '구조팀' },
  { id: '26', name: '오승균 파트장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=osg', region: 'KOREA', team: '토목&조경팀' },
  { id: '27', name: '이성희 파트장', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lsh', region: 'KOREA', team: '구조팀' },
  { id: '28', name: '김채원 수석', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=cwkim', region: 'KOREA', team: '구조팀' },
];

// 초기 프로젝트 데이터 (팀별 공종 완비)
const initialProjects: Project[] = [
  {
    id: 'p1',
    code: 'TK-2026-00001',
    name: '[수택E구역 재개발] 건축 마감 수량산출 및 공사비 산출',
    startDate: '2026-09-10',
    endDate: '2026-10-30',
    department: '마감팀',
    pmId: '2', // 조한빈 실장 (마감팀 총괄 PM)
    progress: 42,
    status: '진행중',
    roles: {
      'PM': { personId: '2', startDate: '2026-09-10', endDate: '2026-10-30' },
      '조적': { personId: '19', startDate: '2026-09-15', endDate: '2026-09-28' },
      '창호': { personId: '18', startDate: '2026-09-20', endDate: '2026-10-05' },
      '내부': { personId: '14', startDate: '2026-09-25', endDate: '2026-10-15' },
    },
    subTasks: {
      'PM': { roleName: 'PM', personId: '2', startDate: '2026-09-10', endDate: '2026-10-30', status: '진행중', memo: '조한빈 실장: 도면 접수 및 현장 착수회의 완료', version: 'v3' },
      '조적': { roleName: '조적', personId: '19', startDate: '2026-09-15', endDate: '2026-09-28', status: '진행중', memo: '지하층 벽체 산출 진행 중', version: 'v2' },
      '창호': { roleName: '창호', personId: '18', startDate: '2026-09-20', endDate: '2026-10-05', status: '예정', memo: '창호도면 리비전 대기', version: 'v1' },
      '외부': { roleName: '외부', personId: '17', startDate: '2026-09-22', endDate: '2026-10-10', status: '예정', memo: '외벽 석재·판넬 산출 준비', version: 'v1' },
      '내부': { roleName: '내부', personId: '14', startDate: '2026-09-25', endDate: '2026-10-15', status: '예정', memo: '단위세대 내부 마감 준비', version: 'v1' },
      '세대': { roleName: '세대', personId: '15', startDate: '2026-10-01', endDate: '2026-10-20', status: '예정', memo: '세대별 산출 투입 예정', version: 'v1' },
      '가설': { roleName: '가설', personId: '8', startDate: '2026-10-15', endDate: '2026-10-28', status: '예정', memo: '외부비계 및 가설울타리 집계', version: 'v1' },
    }
  },
  {
    id: 'p2',
    code: 'TK-2026-00002',
    name: '[광양 바이오매스] 지하·지상 골조 구조체 정밀 수량산출',
    startDate: '2026-09-15',
    endDate: '2026-11-15',
    department: '구조팀',
    pmId: '3', // 김재헌 수석
    progress: 25,
    status: '진행중',
    roles: {
      'PM': { personId: '3', startDate: '2026-09-15', endDate: '2026-11-15' },
      '기초': { personId: '10', startDate: '2026-09-15', endDate: '2026-09-30' },
      '기둥': { personId: '12', startDate: '2026-09-25', endDate: '2026-10-15' },
    },
    subTasks: {
      'PM': { roleName: 'PM', personId: '3', startDate: '2026-09-15', endDate: '2026-11-15', status: '진행중', memo: '구조계산서 및 배근도 검토', version: 'v1' },
      '기초': { roleName: '기초', personId: '10', startDate: '2026-09-15', endDate: '2026-09-30', status: '진행중', memo: 'MAT기초 및 파일캡 배근 산출 중', version: 'v1' },
      '기둥': { roleName: '기둥', personId: '12', startDate: '2026-09-25', endDate: '2026-10-15', status: '예정', memo: '1~3층 SRC 복합기둥 산출', version: 'v1' },
      '보': { roleName: '보', personId: '6', startDate: '2026-10-01', endDate: '2026-10-20', status: '예정', memo: '대보 및 캔틸레버 보 철근 산출', version: 'v1' },
      '슬라브': { roleName: '슬라브', personId: '20', startDate: '2026-10-05', endDate: '2026-10-25', status: '예정', memo: '데크플레이트 및 슬라브 철근', version: 'v1' },
      '옹벽': { roleName: '옹벽', personId: '20', startDate: '2026-10-10', endDate: '2026-10-30', status: '예정', memo: '코어벽체 수량 집계', version: 'v1' },
      '아파트슬라브': { roleName: '아파트슬라브', personId: '10', startDate: '2026-10-15', endDate: '2026-11-05', status: '예정', memo: '기준층 슬라브 물량', version: 'v1' },
      '아파트옹벽': { roleName: '아파트옹벽', personId: '12', startDate: '2026-10-20', endDate: '2026-11-10', status: '예정', memo: '기준층 벽체 물량 집계', version: 'v1' },
    }
  },
  {
    id: 'p3',
    code: 'TK-2026-00003',
    name: '[평택고덕 A-64BL] 단지 조성 토공 및 부대토목·조경 적산',
    startDate: '2026-09-18',
    endDate: '2026-11-20',
    department: '토목&조경팀',
    pmId: '26', // 오승균 파트장 (토목&조경팀)
    progress: 15,
    status: '착수예정',
    roles: {
      'PM': { personId: '26', startDate: '2026-09-18', endDate: '2026-11-20' },
      '토목': { personId: '7', startDate: '2026-09-20', endDate: '2026-10-15' },
    },
    subTasks: {
      'PM': { roleName: 'PM', personId: '26', startDate: '2026-09-18', endDate: '2026-11-20', status: '진행중', memo: '오승균 파트장: 토공 횡단면도 및 지반조사서 확인', version: 'v1' },
      '토목': { roleName: '토목', personId: '7', startDate: '2026-09-20', endDate: '2026-10-15', status: '예정', memo: '절토/성토 토공량 및 흙막이 가시설 산출', version: 'v1' },
      '부대토목': { roleName: '부대토목', personId: '21', startDate: '2026-10-05', endDate: '2026-10-30', status: '예정', memo: '우·오수관로 및 포장공사 산출', version: 'v1' },
      '조경': { roleName: '조경', personId: '13', startDate: '2026-10-20', endDate: '2026-11-15', status: '예정', memo: '식재 및 조경시설물 산출', version: 'v1' },
    }
  },
  {
    id: 'p4',
    code: 'TK-2026-00004',
    name: '[위례복정역세권] 오피스텔 복합시설 마감 재산출 및 도면변경 반영',
    startDate: '2026-09-01',
    endDate: '2026-09-25',
    department: '마감팀',
    pmId: '4', // 양한규 수석 (마감팀)
    progress: 88,
    status: '수정',
    roles: {
      'PM': { personId: '4', startDate: '2026-09-01', endDate: '2026-09-25' },
      '창호': { personId: '18', startDate: '2026-09-05', endDate: '2026-09-20' },
    },
    subTasks: {
      'PM': { roleName: 'PM', personId: '4', startDate: '2026-09-01', endDate: '2026-09-25', status: '진행중', memo: '양한규 수석: 거래처 변경도면(REV.2) 접수 및 마감 재검토 총괄', version: 'v4' },
      '조적': { roleName: '조적', personId: '19', startDate: '2026-09-05', endDate: '2026-09-15', status: '완료', memo: '조적 변경분 완료', version: 'v2' },
      '창호': { roleName: '창호', personId: '18', startDate: '2026-09-10', endDate: '2026-09-20', status: '진행중', memo: '커튼월 사양 변경 반영 중', version: 'v3' },
      '외부': { roleName: '외부', personId: '17', startDate: '2026-09-12', endDate: '2026-09-22', status: '완료', memo: '외부 마감 변경 완료', version: 'v2' },
      '내부': { roleName: '내부', personId: '11', startDate: '2026-09-15', endDate: '2026-09-24', status: '진행중', memo: '공용부 석재 변경 반영', version: 'v2' },
      '세대': { roleName: '세대', personId: '14', startDate: '2026-09-16', endDate: '2026-09-25', status: '진행중', memo: '전용부 평면 변경분 재산출', version: 'v2' },
      '가설': { roleName: '가설', personId: '8', startDate: '2026-09-20', endDate: '2026-09-25', status: '예정', memo: '최종 가설비 재집계', version: 'v1' },
    }
  },
  {
    id: 'p5',
    code: 'TK-2026-00005',
    name: '[용산 국제업무지구 2BL] 상업·업무 복합시설 마감 적산',
    startDate: '2026-09-16',
    endDate: '2026-10-25',
    department: '마감팀',
    pmId: '2', // 조한빈 실장
    progress: 30,
    status: '진행중',
    roles: {
      'PM': { personId: '2', startDate: '2026-09-16', endDate: '2026-10-25' },
      '조적': { personId: '5', startDate: '2026-09-18', endDate: '2026-10-05' },
      '창호': { personId: '9', startDate: '2026-09-15', endDate: '2026-10-08' },
    },
    subTasks: {
      'PM': { roleName: 'PM', personId: '2', startDate: '2026-09-16', endDate: '2026-10-25', status: '진행중', memo: '복합시설 마감 인터페이스 총괄 PM', version: 'v1' },
      '조적': { roleName: '조적', personId: '5', startDate: '2026-09-18', endDate: '2026-10-05', status: '진행중', memo: '성대용 수석: 지하주차장 방화구획 조적', version: 'v1' },
      '창호': { roleName: '창호', personId: '9', startDate: '2026-09-15', endDate: '2026-10-08', status: '진행중', memo: '송치영 책임: 로비 및 기준층 커튼월 산출', version: 'v1' },
      '외부': { roleName: '외부', personId: '8', startDate: '2026-09-22', endDate: '2026-10-15', status: '진행중', memo: '이은지 책임: 테라코타 및 알루미늄 루버', version: 'v1' },
      '내부': { roleName: '내부', personId: '11', startDate: '2026-09-20', endDate: '2026-10-18', status: '예정', memo: '임승주 선임: 엘리베이터홀 및 코어 마감', version: 'v1' },
      '세대': { roleName: '세대', personId: '14', startDate: '2026-10-01', endDate: '2026-10-20', status: '예정', memo: '오피스 전용구획 분할 산출', version: 'v1' },
      '가설': { roleName: '가설', personId: '8', startDate: '2026-10-10', endDate: '2026-10-25', status: '예정', memo: '이은지 책임: 시스템비계 및 안전시설 집계', version: 'v1' },
    }
  }
];

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
