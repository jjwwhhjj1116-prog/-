import { create } from 'zustand';
import { useProjectStore, type Department, type Project } from './useProjectStore';

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

export interface ApprovalSign {
  approved: boolean;
  name: string;
  signedAt?: string;
}

export const TEAM_APPROVAL_LINES: Record<
  Department,
  {
    leader: { name: string; title: string };
    chief: { name: string; title: string };
  }
> = {
  마감팀: {
    leader: { name: '김재헌 팀장', title: '팀장' },
    chief: { name: '조한빈 실장', title: '실장' }
  },
  구조팀: {
    leader: { name: '신동헌 팀장', title: '팀장' },
    chief: { name: '장범선 실장', title: '실장' }
  },
  '토목&조경팀': {
    leader: { name: '김재헌 팀장', title: '팀장' },
    chief: { name: '조한빈 실장', title: '실장' }
  }
};

export interface DailyWorkLog {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  userName: string;
  userPosition: string;
  department: Department;
  items: WorkLogItem[];
  overallNotes: string;
  // 2단 결재 상태: 작성중(DRAFT) -> 1차 팀장검토대기(SUBMITTED_LEADER) -> 2차 실장최종승인(APPROVED_FINAL)
  approvalStatus: 'DRAFT' | 'SUBMITTED_LEADER' | 'APPROVED_FINAL' | 'SUBMITTED_PM' | 'APPROVED_PM';
  authorSignature: {
    signed: boolean;
    name: string;
    signedAt?: string;
  };
  // 1차 팀장 검토 (마감팀: 김재헌 팀장, 구조팀: 신동헌 팀장)
  leaderReview: ApprovalSign;
  // 2차 실장 최종 승인 (마감팀: 조한빈 실장, 구조팀: 장범선 실장)
  chiefApproval: ApprovalSign;
  // 레거시 호환 필드
  pmApproval?: ApprovalSign;
  teamLeaderApproval?: ApprovalSign;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'concost_daily_worklogs_v2';

// 초기 샘플 업무일지
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
        tomorrowPlan: 'VIET QS(호치민) 1차 창호 수량 일람표 크로스체크',
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
    approvalStatus: 'APPROVED_FINAL',
    authorSignature: {
      signed: true,
      name: '조한빈 실장',
      signedAt: '2026-09-21 17:30'
    },
    leaderReview: {
      approved: true,
      name: '김재헌 팀장',
      signedAt: '2026-09-21 17:40'
    },
    chiefApproval: {
      approved: true,
      name: '조한빈 실장',
      signedAt: '2026-09-21 18:00'
    },
    pmApproval: {
      approved: true,
      name: '김재헌 팀장',
      signedAt: '2026-09-21 17:40'
    },
    teamLeaderApproval: {
      approved: true,
      name: '조한빈 실장',
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
    approvalStatus: 'SUBMITTED_LEADER',
    authorSignature: {
      signed: true,
      name: '성대용 수석',
      signedAt: '2026-09-21 17:15'
    },
    leaderReview: {
      approved: false,
      name: '김재헌 팀장'
    },
    chiefApproval: {
      approved: false,
      name: '조한빈 실장'
    },
    pmApproval: {
      approved: false,
      name: '김재헌 팀장'
    },
    teamLeaderApproval: {
      approved: false,
      name: '조한빈 실장'
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
        return parsed.map((item: any) => {
          const dept = (item.department || '마감팀') as Department;
          const line = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;
          return {
            ...item,
            leaderReview: item.leaderReview || item.pmApproval || { approved: false, name: line.leader.name },
            chiefApproval: item.chiefApproval || item.teamLeaderApproval || { approved: false, name: line.chief.name }
          };
        });
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
  // 1단계: 작성자 -> 해당 팀 팀장에게 결재 상신 (마감팀: 김재헌 팀장, 구조팀: 신동헌 팀장)
  submitApprovalToLeader: (id: string) => void;
  // 2단계: 해당 팀 실장 최종 결재 승인 (마감팀: 조한빈 실장, 구조팀: 장범선 실장) -> 일정표에 실시간 반영 및 저장
  approveFinalByChief: (id: string, chiefName?: string) => void;
  // 이전 호환 메서드 (하위호환 유지)
  submitApprovalToPm: (id: string) => void;
  approveByPm: (id: string, pmName: string) => void;
  approveFinalByLeader: (id: string, leaderName: string) => void;
  // 팀별 일정표에서 특정 인원의 오늘 업무 자동 추출 (정밀 연계)
  generateItemsFromSchedule: (userName: string, _dateStr: string, projects: Project[]) => WorkLogItem[];
}

export const useWorkLogStore = create<WorkLogState>((set) => ({
  workLogs: loadInitialWorkLogs(),
  selectedWorkLogId: 'wl-2026-09-21-sungdaeyong',

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

  // 1단계: 작성자 결재 상신 -> 각 팀 팀장에게 전달 (마감팀: 김재헌 팀장, 구조팀: 신동헌 팀장)
  submitApprovalToLeader: (id) => {
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          const dept = (w.department || '마감팀') as Department;
          const line = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;
          return {
            ...w,
            approvalStatus: 'SUBMITTED_LEADER' as const,
            authorSignature: {
              signed: true,
              name: `${w.userName} (${w.userPosition})`,
              signedAt: nowStr
            },
            leaderReview: {
              approved: false,
              name: line.leader.name
            },
            chiefApproval: {
              approved: false,
              name: line.chief.name
            },
            // 레거시 호환
            pmApproval: {
              approved: false,
              name: line.leader.name
            },
            teamLeaderApproval: {
              approved: false,
              name: line.chief.name
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

  // 2단계: 각 팀 실장 최종 결재 승인 (마감팀: 조한빈 실장, 구조팀: 장범선 실장)
  // 최종 결재 시 해당 일정이 일정표에 그대로 정리되어 저장!
  approveFinalByChief: (id, chiefName) => {
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const targetLog = state.workLogs.find((w) => w.id === id);

      if (targetLog) {
        const projectStore = useProjectStore.getState();
        targetLog.items.forEach((item) => {
          const targetProj = projectStore.projects.find(
            (p) => p.id === item.projectId || (p.code && p.code === item.projectCode)
          );
          if (targetProj) {
            const updatedSubTasks = { ...(targetProj.subTasks || {}) };
            if (item.roleName && updatedSubTasks[item.roleName]) {
              const mappedStatus = item.status === '대기' ? '예정' : item.status;
              updatedSubTasks[item.roleName] = {
                ...updatedSubTasks[item.roleName],
                status: mappedStatus as any,
                memo: item.todayTask
              };
            }
            projectStore.updateProject(targetProj.id, {
              progress: item.progress,
              subTasks: updatedSubTasks
            });
          }
        });
      }

      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          const dept = (w.department || '마감팀') as Department;
          const line = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;
          const finalChiefName = chiefName || line.chief.name;
          return {
            ...w,
            approvalStatus: 'APPROVED_FINAL' as const,
            leaderReview: {
              approved: true,
              name: line.leader.name,
              signedAt: w.leaderReview?.signedAt || nowStr
            },
            chiefApproval: {
              approved: true,
              name: finalChiefName,
              signedAt: nowStr
            },
            // 레거시 호환
            pmApproval: {
              approved: true,
              name: line.leader.name,
              signedAt: nowStr
            },
            teamLeaderApproval: {
              approved: true,
              name: finalChiefName,
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

  // 레거시 호환 래퍼
  submitApprovalToPm: (id) => {
    useWorkLogStore.getState().submitApprovalToLeader(id);
  },
  approveByPm: (id, pmName) => {
    // 1차 팀장 검토 승인
    const nowStr = new Date().toLocaleString('ko-KR');
    set((state) => {
      const updated = state.workLogs.map((w) => {
        if (w.id === id) {
          return {
            ...w,
            leaderReview: {
              approved: true,
              name: pmName,
              signedAt: nowStr
            },
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
  approveFinalByLeader: (id, leaderName) => {
    useWorkLogStore.getState().approveFinalByChief(id, leaderName);
  },

  // 팀별 일정표에서 특정 인원의 오늘 업무 정밀 자동 추출
  generateItemsFromSchedule: (userName: string, _dateStr: string, projects: Project[]) => {
    const items: WorkLogItem[] = [];
    const targetDate = _dateStr || new Date().toISOString().split('T')[0];

    // 1. 이름 정규화 (예: '성대용 수석' -> '성대용')
    const cleanName = userName.replace(/\s*(실장|팀장|수석|책임|선임|전임|사원|PM|본부장|이사|대표).*$/, '').trim();

    // 2. 사내 인원 목록에서 ID 및 이름 매핑 셋 구축
    const personnel = useProjectStore.getState().personnel || [];
    const matchedPersons = personnel.filter(
      (p) => p.name.includes(cleanName) || p.id === userName || p.name === userName
    );
    const candidateKeys = new Set<string>([
      userName,
      cleanName,
      ...matchedPersons.map((p) => p.id),
      ...matchedPersons.map((p) => p.name),
      ...matchedPersons.map((p) => p.name.split(' ')[0])
    ].filter(Boolean));

    projects.forEach((p) => {
      // 프로젝트 진행 기간 검사 (당일 포함 또는 진행중)
      const isDateInRange =
        (!p.startDate || p.startDate <= targetDate) &&
        (!p.endDate || targetDate <= p.endDate);
      const isProjectActive = p.status === '진행중' || isDateInRange;

      if (!isProjectActive) return;

      // A. PM 지정 여부 검사 (p.pmId가 candidateKeys에 포함되거나 cleanName이 포함된 경우)
      const isPm =
        (p.pmId && candidateKeys.has(p.pmId)) ||
        (p.pmId && candidateKeys.has(p.pmId.trim())) ||
        (p.roles?.PM?.personId && candidateKeys.has(p.roles.PM.personId)) ||
        (p as any).pmPerson?.name?.includes(cleanName);

      if (isPm) {
        items.push({
          id: `gen-${p.id}-PM`,
          projectId: p.id,
          projectCode: p.code || p.id,
          projectName: p.name,
          department: p.department,
          roleName: 'PM',
          todayTask: `[${p.name}] 전체 공정 진도 관리, 품질 검증 및 납품 일정 관리`,
          progress: p.progress || 60,
          status: (p.status as any) || '진행중',
          tomorrowPlan: '익일 작업 진척도 집계 및 세부 공종 크로스체크',
          notes: `프로젝트 기간: ${p.startDate} ~ ${p.endDate}`
        });
      }

      // B. subTasks 검사
      if (p.subTasks) {
        Object.entries(p.subTasks).forEach(([roleName, sub]) => {
          if (roleName === 'PM') return;

          const isAssigned =
            (sub.personId && candidateKeys.has(sub.personId)) ||
            (sub.personIds && sub.personIds.some((pid) => candidateKeys.has(pid))) ||
            (sub.memo && candidateKeys.has(sub.memo.trim())) ||
            (sub.memo && cleanName && sub.memo.includes(cleanName));

          if (isAssigned) {
            items.push({
              id: `gen-${p.id}-${roleName}`,
              projectId: p.id,
              projectCode: p.code || p.id,
              projectName: p.name,
              department: p.department,
              roleName,
              todayTask: sub.memo ? `[${roleName}] ${sub.memo}` : `[${roleName}] 도면 기준 물량산출 및 집계표 작성 진행`,
              progress: p.progress || 50,
              status: (sub.status as any) || '진행중',
              tomorrowPlan: `[${roleName}] 잔여 구역 산출 및 내역팀 크로스체크`,
              notes: `공종 일정: ${sub.startDate || p.startDate} ~ ${sub.endDate || p.endDate}`
            });
          }
        });
      }

      // C. roles 객체 검사 (subTasks에 없거나 roles에 직접 정의된 경우)
      if (p.roles) {
        Object.entries(p.roles).forEach(([roleName, roleData]) => {
          if (!roleData || roleName === 'PM') return;
          if (items.some((it) => it.projectId === p.id && it.roleName === roleName)) return;

          const isAssigned = roleData.personId && candidateKeys.has(roleData.personId);
          if (isAssigned) {
            items.push({
              id: `gen-${p.id}-${roleName}-role`,
              projectId: p.id,
              projectCode: p.code || p.id,
              projectName: p.name,
              department: p.department,
              roleName,
              todayTask: `[${roleName}] 도면 기준 물량산출 및 집계표 작성 진행`,
              progress: p.progress || 50,
              status: '진행중',
              tomorrowPlan: `[${roleName}] 잔여 수량 산출 및 일람표 검증`,
              notes: `공종 일정: ${roleData.startDate || p.startDate} ~ ${roleData.endDate || p.endDate}`
            });
          }
        });
      }
    });

    // 만약 탐색된 배정 공종이 없다면 진행 중인 최우선 프로젝트 1건을 기본 연계
    if (items.length === 0 && projects.length > 0) {
      const activeProj = projects.find((p) => p.status === '진행중') || projects[0];
      items.push({
        id: `gen-${activeProj.id}-default`,
        projectId: activeProj.id,
        projectCode: activeProj.code || activeProj.id,
        projectName: activeProj.name,
        department: activeProj.department,
        roleName: '도면산출',
        todayTask: `[${activeProj.name}] 설계도면 검토 및 수량산출 작업 진행`,
        progress: activeProj.progress || 50,
        status: '진행중',
        tomorrowPlan: '산출 물량 집계표 작성 및 내역 대조',
        notes: `일정: ${activeProj.startDate} ~ ${activeProj.endDate}`
      });
    }

    return items;
  }
}));
