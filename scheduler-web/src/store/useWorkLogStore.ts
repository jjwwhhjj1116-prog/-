import { create } from 'zustand';
import type { Department, Project } from './useProjectStore';

export interface WorkLogItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  department: Department;
  roleName: string; // 공종 임무 (조적, 창호, 보, 슬라브 등)
  todayTask: string; // 오늘 진행 업무
  progress: number; // 진행률 (%)
  status: '진행중' | '완료' | '지연' | '대기';
  tomorrowPlan: string; // 내일 예정 업무
  notes: string; // 특이사항/이슈
}

export interface DailyWorkLog {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName: string;
  userPosition: string;
  department: Department;
  items: WorkLogItem[];
  overallNotes: string;
  approvalStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED_PM' | 'APPROVED_DIRECTOR';
  authorSignature: {
    signed: boolean;
    name: string;
    signedAt?: string;
  };
  pmApproval: {
    approved: boolean;
    name: string;
    signedAt?: string;
  };
  directorApproval: {
    approved: boolean;
    name: string;
    signedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'concost_daily_worklogs_v1';

// 초기 샘플 업무일지 (팀별 일정표 연계 실사 데이터)
const INITIAL_WORKLOGS: DailyWorkLog[] = [
  {
    id: 'wl-2026-09-21-johanbin',
    date: '2026-09-21',
    userId: 'u1',
    userName: '조한빈',
    userPosition: '실장',
    department: '마감팀',
    items: [
      {
        id: 'wli-1',
        projectId: 'p_TK-2026087_F',
        projectCode: 'TK-2026087',
        projectName: '[삼성물산(주)] P5 FAB2 신축공사 견적용역',
        department: '마감팀',
        roleName: 'PM',
        todayTask: '착수회의 결정사항 공종별 전파 및 조적/창호 산출 기준선 중간점검',
        progress: 65,
        status: '진행중',
        tomorrowPlan: '하노이 지사(WIN/EXT) 1차 창호 수량 일람표 크로스체크',
        notes: '발주처 Rev.3 도면 변경사항 반영 완료, 내역팀 연계 검토'
      },
      {
        id: 'wli-2',
        projectId: 'p_TK-2026088_F',
        projectCode: 'TK-2026088',
        projectName: '[(재)21세기경제연구소] 인천광역시 영종구 운서동 LH매입 오피스텔 신축공사',
        department: '마감팀',
        roleName: 'PM',
        todayTask: '전체 공종 진척도 점검 및 공정률 66% 달성 확인',
        progress: 66,
        status: '진행중',
        tomorrowPlan: '납품 전 1차 오류 검증 및 성과물 시트 취합',
        notes: '예정 공정 대비 3일 조기 달성 중'
      }
    ],
    overallNotes: 'P5 FAB2 프로젝트 조적 2인(원종수, 성대용) 협업 및 베트남 창호팀 공정 정상 가동 중. 차주 내역 공종 초안 연계 예정.',
    approvalStatus: 'APPROVED_DIRECTOR',
    authorSignature: {
      signed: true,
      name: '조한빈 실장',
      signedAt: '2026-09-21 17:30'
    },
    pmApproval: {
      approved: true,
      name: '조한빈 실장',
      signedAt: '2026-09-21 17:40'
    },
    directorApproval: {
      approved: true,
      name: '(주)컨코스트 기술본부장',
      signedAt: '2026-09-21 18:00'
    },
    createdAt: '2026-09-21 17:00',
    updatedAt: '2026-09-21 18:00'
  },
  {
    id: 'wl-2026-09-21-sungdaeyong',
    date: '2026-09-21',
    userId: 'u3',
    userName: '성대용',
    userPosition: '수석',
    department: '마감팀',
    items: [
      {
        id: 'wli-3',
        projectId: 'p_TK-2026087_F',
        projectCode: 'TK-2026087',
        projectName: '[삼성물산(주)] P5 FAB2 신축공사 견적용역',
        department: '마감팀',
        roleName: '조적',
        todayTask: 'Rev.3 서측 구역 조적벽체 기준선 분할 및 방수턱 디테일 물량산출',
        progress: 60,
        status: '진행중',
        tomorrowPlan: '동측 구역 원종수 수석 작업분과 경계면 결합 검증',
        notes: '단열재 두께 변경 반영 완료'
      },
      {
        id: 'wli-4',
        projectId: 'p_TK-2026087_F',
        projectCode: 'TK-2026087',
        projectName: '[삼성물산(주)] P5 FAB2 신축공사 견적용역',
        department: '마감팀',
        roleName: '내역',
        todayTask: '공내역서 표준 서식 세팅 및 일위대가 코드 매핑 초안 작성',
        progress: 30,
        status: '진행중',
        tomorrowPlan: '설계예가 및 실행가 산출 기준 시트 수식 검토',
        notes: '10월 2일 납품 기한 준수 예정'
      }
    ],
    overallNotes: '조적 공종 원종수 수석님과 2인 분할 산출 원활히 진행 중. 내역 공종 사전 준비 완료.',
    approvalStatus: 'SUBMITTED',
    authorSignature: {
      signed: true,
      name: '성대용 수석',
      signedAt: '2026-09-21 17:15'
    },
    pmApproval: {
      approved: false,
      name: '조한빈 실장'
    },
    directorApproval: {
      approved: false,
      name: '(주)컨코스트 기술본부장'
    },
    createdAt: '2026-09-21 17:15',
    updatedAt: '2026-09-21 17:15'
  }
];

const loadInitialWorkLogs = (): DailyWorkLog[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load worklogs from localStorage', e);
  }
  return INITIAL_WORKLOGS;
};

interface WorkLogState {
  workLogs: DailyWorkLog[];
  selectedWorkLogId: string | null;
  setSelectedWorkLogId: (id: string | null) => void;
  saveWorkLog: (log: DailyWorkLog) => void;
  deleteWorkLog: (id: string) => void;
  submitApproval: (id: string) => void;
  approveByPm: (id: string, pmName: string) => void;
  approveByDirector: (id: string, directorName: string) => void;
  // 팀별 일정표에서 특정 인원의 특정 날짜 업무를 자동 추출하여 WorkLogItem 생성
  generateItemsFromSchedule: (userName: string, dateStr: string, projects: Project[]) => WorkLogItem[];
}

export const useWorkLogStore = create<WorkLogState>((set) => ({
  workLogs: loadInitialWorkLogs(),
  selectedWorkLogId: 'wl-2026-09-21-johanbin',

  setSelectedWorkLogId: (id) => set({ selectedWorkLogId: id }),

  saveWorkLog: (log) => {
    set((state) => {
      const exists = state.workLogs.some((w) => w.id === log.id);
      const updated = exists
        ? state.workLogs.map((w) => (w.id === log.id ? log : w))
        : [log, ...state.workLogs];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return { workLogs: updated, selectedWorkLogId: log.id };
    });
  },

  deleteWorkLog: (id) => {
    set((state) => {
      const updated = state.workLogs.filter((w) => w.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return {
        workLogs: updated,
        selectedWorkLogId: updated[0]?.id || null
      };
    });
  },

  submitApproval: (id) => {
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            approvalStatus: 'SUBMITTED' as const,
            authorSignature: {
              signed: true,
              name: `${w.userName} (${w.userPosition})`,
              signedAt: nowStr
            },
            updatedAt: nowStr
          };
        }
        return w;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return { workLogs: updated };
    });
  },

  approveByPm: (id, pmName) => {
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            approvalStatus: 'APPROVED_PM' as const,
            pmApproval: {
              approved: true,
              name: pmName,
              signedAt: nowStr
            },
            updatedAt: nowStr
          };
        }
        return w;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return { workLogs: updated };
    });
  },

  approveByDirector: (id, directorName) => {
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            approvalStatus: 'APPROVED_DIRECTOR' as const,
            directorApproval: {
              approved: true,
              name: directorName,
              signedAt: nowStr
            },
            updatedAt: nowStr
          };
        }
        return w;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return { workLogs: updated };
    });
  },

  generateItemsFromSchedule: (userName: string, _dateStr: string, projects: Project[]) => {
    const items: WorkLogItem[] = [];

    projects.forEach((p) => {
      // 1. PM으로 지정된 프로젝트 확인
      const isPm = p.pmId?.includes(userName) || (p as any).pmPerson?.name?.includes(userName);
      if (isPm) {
        items.push({
          id: `gen-${p.id}-PM`,
          projectId: p.id,
          projectCode: p.code || p.id,
          projectName: p.name,
          department: p.department,
          roleName: 'PM',
          todayTask: `[${p.name}] 전체 공정 진도 관리 및 품질 체크`,
          progress: p.progress,
          status: (p.status as any) || '진행중',
          tomorrowPlan: '익일 작업 진척도 집계 및 세부 일정 점검',
          notes: `일정: ${p.startDate} ~ ${p.endDate}`
        });
      }

      // 2. subTasks에서 배정된 공종 탐색
      if (p.subTasks) {
        Object.entries(p.subTasks).forEach(([roleName, sub]) => {
          if (roleName === 'PM') return; // 이미 위에서 처리
          const isAssigned =
            sub.personId === userName ||
            (sub.personIds && sub.personIds.includes(userName)) ||
            (sub.memo && sub.memo.includes(userName));

          if (isAssigned) {
            items.push({
              id: `gen-${p.id}-${roleName}`,
              projectId: p.id,
              projectCode: p.code || p.id,
              projectName: p.name,
              department: p.department,
              roleName,
              todayTask: sub.memo ? `[${roleName}] ${sub.memo}` : `[${roleName}] 도면 기준 수량산출 및 물량 집계 진행`,
              progress: p.progress,
              status: (sub.status as any) || '진행중',
              tomorrowPlan: `[${roleName}] 잔여 수량 산출 및 크로스체크`,
              notes: `공종 일정: ${sub.startDate || p.startDate} ~ ${sub.endDate || p.endDate}`
            });
          }
        });
      }
    });

    // 만약 탐색된 배정 공종이 없다면 기본 마감팀 주요 프로젝트 1건 자동 생성
    if (items.length === 0 && projects.length > 0) {
      const base = projects[0];
      items.push({
        id: `gen-${base.id}-default`,
        projectId: base.id,
        projectCode: base.code || base.id,
        projectName: base.name,
        department: base.department,
        roleName: '마감공종',
        todayTask: `[${base.name}] 설계 도면 검토 및 수량 산출 작업 수행`,
        progress: base.progress,
        status: '진행중',
        tomorrowPlan: '공종별 수량 집계표 작성 및 내역 대조',
        notes: '일정표 기반 자동 연계'
      });
    }

    return items;
  }
}));
