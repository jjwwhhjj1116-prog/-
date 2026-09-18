import React, { useState, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  FileText,
  Plus,
  Search,
  Calendar,
  Users,
  CheckCircle2,
  FolderKanban,
  FileSignature,
  Printer,
  Save,
  Lock,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export type MeetingType = '착수회의' | '공정회의' | '도면질의협의' | '내역검토회' | '긴급이슈';
export type MeetingStatus = 'DRAFT' | 'FINAL';

export interface ActionItem {
  id: string;
  title: string;
  assigneeName: string;
  roleName: string;
  dueDate: string;
  status: '대기' | '진행중' | '완료';
}

export interface MeetingRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  type: MeetingType;
  title: string;
  meetingDate: string;
  location: string;
  department: string;
  author: string;
  attendeesInternal: string[];
  attendeesExternal: string[];
  rawTranscript: string;
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
  status: MeetingStatus;
  version: number;
  updatedAt: string;
}

// 클레임센터 스튜디오 레퍼런스 기준 실물 연동 착수회의록 초기 데이터
const INITIAL_MEETINGS: MeetingRecord[] = [
  {
    id: 'meet-01',
    projectId: 'TK-2026087',
    projectName: '[삼성물산(주)] P5 FAB2 신축공사 견적용역',
    projectCode: 'TK-2026087',
    type: '착수회의',
    title: '삼성 P5 FAB2 신축공사 견적용역 착수회의 및 공종별 물량산출 기준 확정',
    meetingDate: '2026-09-17T14:00',
    location: '컨코스트 본사 4층 대회의실 / 화상연결(VIET QS)',
    department: '마감팀',
    author: '조한빈 실장',
    attendeesInternal: ['조한빈 실장(PM)', '성대용 수석', '원종수 수석', '김재헌 수석', '임승주 선임'],
    attendeesExternal: ['삼성물산 견적팀 박상우 부장', '하이테크엔지니어링 설계를 담당'],
    rawTranscript: `[14:00 킥오프 시작]
조한빈 실장: P5 FAB2 복합시설 견적용역 착수회의 시작하겠습니다. 납품 기한은 2026년 10월 12일까지이며, 중간 체크데이는 9월 28일입니다.
박상우 부장(삼성물산): 이번 FAB2는 도면 Rev.3이 최신본입니다. 특히 클린룸 하부 조적벽체와 복도 방화구획 창호는 도면 수정사항이 많으니 인터페이스 체크 부탁드립니다.
원종수 수석: 조적 공종은 성대용 수석님과 2인 협업 투입하여 구역을 동·서로 나누어 동시 진행하겠습니다. 단열재 및 방수턱 디테일 기준을 명확히 주셔야 합니다.
성대용 수석: 내역 공종도 마감팀에서 직접 수량 집계 후 공내역서, 설계예가, 실행가 3단 산출로 납품하기로 확정되었습니다.
조한빈 실장: 네, 내역은 공내역 우선 산출 후 10월 5일까지 실행가 검토안을 작성하겠습니다. 베트남 창호팀(WIN) 및 외부팀(EXT)에 오늘 배포된 CAD 도면 즉시 공유 바랍니다.
[15:15 회의 종료]`,
    summary: `1. 프로젝트 납품 마감일: 2026-10-12 (중간 점검일: 2026-09-28)
2. 최신 도면 기준: 건축도면 Rev.3 확정 반영
3. 조적 공종 투입 계획: 원종수 수석(동측 구역) + 성대용 수석(서측 구역) 2인 동시 투입하여 산출 기간 단축
4. 내역 공종 신설 및 3대 유형(공내역, 설계예가, 실행가) 납품 체계 수립 완료`,
    decisions: [
      '건축 마감 도면 기준: 2026-09-15 배포된 Rev.3 도면 기준 일괄 적용',
      '조적 공종: 원종수 수석, 성대용 수석 2인 동시 투입 확정',
      '마감팀 내역 공종: 1차 공내역 작성 후 설계예가·실행가 순차 산출 납품',
      '베트남 VIETQS 협업: 창호 및 외벽 수량은 하노이 지사에서 산출 검증'
    ],
    actionItems: [
      {
        id: 'act-1',
        title: 'Rev.3 조적벽체 도면 기준선 분할 및 작업 착수',
        assigneeName: '원종수 수석, 성대용 수석',
        roleName: '조적',
        dueDate: '2026-09-24',
        status: '진행중'
      },
      {
        id: 'act-2',
        title: '클린룸 창호 일람표 집계 및 하노이 지사 전달',
        assigneeName: '창호팀 (VIET WIN)',
        roleName: '창호',
        dueDate: '2026-09-26',
        status: '진행중'
      },
      {
        id: 'act-3',
        title: '공내역 및 설계예가 서식 세팅 및 일위대가 검토',
        assigneeName: '성대용 수석',
        roleName: '내역',
        dueDate: '2026-10-02',
        status: '대기'
      }
    ],
    status: 'FINAL',
    version: 1,
    updatedAt: '2026-09-17 15:30'
  },
  {
    id: 'meet-02',
    projectId: 'TK-2026079',
    projectName: '[수택E구역 재개발] 건축 마감 수량산출 용역',
    projectCode: 'TK-2026079',
    type: '착수회의',
    title: '수택E구역 재개발 마감팀 착수회의 및 인터페이스 사전 조정',
    meetingDate: '2026-09-15T10:00',
    location: '기술본부 마감팀 회의실',
    department: '마감팀',
    author: '조한빈 실장',
    attendeesInternal: ['조한빈 실장', '성대용 수석', '김재헌 수석', '임승주 선임'],
    attendeesExternal: ['수택E구역 조합 실사단'],
    rawTranscript: `수택E구역 지하층 방수턱 높이 기준 및 조적벽체 단열재 두께 변경건에 대한 물량산출 적용 기준 협의.
지하 1층~2층 조적벽체와 창호 프레임 디테일은 건축도면 Rev.2 기준으로 10월 5일까지 납품하기로 협의.`,
    summary: '지하층 방수턱 및 조적벽체 단열재 두께 변경사항 반영 및 도면 Rev.2 기준 1차 납품일정 확정.',
    decisions: [
      '지하층 조적벽체 높이 기준 2,400mm 일괄 통일',
      '세대 내부 경량벽체는 건식패널 적용 여부 재확인'
    ],
    actionItems: [
      {
        id: 'act-201',
        title: '지하 1~2층 조적벽체 기준선 도면 마킹',
        assigneeName: '임승주 선임',
        roleName: '조적',
        dueDate: '2026-09-22',
        status: '완료'
      },
      {
        id: 'act-202',
        title: '창호 입면 리스트와 수량 검토 시트 동기화',
        assigneeName: '김재헌 수석',
        roleName: '창호',
        dueDate: '2026-09-25',
        status: '진행중'
      }
    ],
    status: 'FINAL',
    version: 1,
    updatedAt: '2026-09-15 11:30'
  },
  {
    id: 'meet-03',
    projectId: 'TK-2026068',
    projectName: '[과천 지식정보타운 8BL] 지하주차장 골조구조',
    projectCode: 'TK-2026068',
    type: '도면질의협의',
    title: '과천 8BL 구조팀 슬라브/보 철근 배근 변경에 따른 긴급 회의',
    meetingDate: '2026-09-12T15:30',
    location: '구조팀 디자인룸',
    department: '구조팀',
    author: '장범선 실장',
    attendeesInternal: ['장범선 실장', '신동헌 팀장', '김채원 수석', '이정철 수석'],
    attendeesExternal: [],
    rawTranscript: `구조계산서 변경으로 인한 지하주차장 기둥 드롭패널 및 슬라브 HD16 철근 간격 수정사항 긴급 반영.
VIET 골조팀에 변경된 단면도 긴급 전달 및 산출표 갱신 요청.`,
    summary: '드롭패널 두께 증가 및 HD16 철근 간격 조정으로 인한 철근 물량 증가분 재집계.',
    decisions: ['B2F 슬라브 철근 규격 변경분 우선 재산출 후 본사 승인'],
    actionItems: [
      {
        id: 'act-301',
        title: 'B2F 주차장 슬라브 철근 물량 재집계',
        assigneeName: '김채원 수석',
        roleName: '슬라브',
        dueDate: '2026-09-18',
        status: '진행중'
      }
    ],
    status: 'DRAFT',
    version: 2,
    updatedAt: '2026-09-12 17:00'
  }
];

export const MinutesView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();

  const [meetings, setMeetings] = useState<MeetingRecord[]>(INITIAL_MEETINGS);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(INITIAL_MEETINGS[0].id);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | MeetingType>('ALL');

  // 신규 회의록 모달 상태
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 현재 선택된 회의록
  const selectedMeeting = useMemo(() => {
    return meetings.find((m) => m.id === selectedMeetingId) || meetings[0];
  }, [meetings, selectedMeetingId]);

  // 편집용 상태
  const [editSummary, setEditSummary] = useState(selectedMeeting?.summary || '');
  const [editDecisions, setEditDecisions] = useState(selectedMeeting?.decisions.join('\n') || '');
  const [editTranscript, setEditTranscript] = useState(selectedMeeting?.rawTranscript || '');
  const [showTranscript, setShowTranscript] = useState(true);

  // 할 일 추가 인라인 폼
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');
  const [newActionRole, setNewActionRole] = useState('조적');
  const [newActionDueDate, setNewActionDueDate] = useState('2026-09-30');

  // 선택 회의 변경 시 편집 필드 동기화
  React.useEffect(() => {
    if (selectedMeeting) {
      setEditSummary(selectedMeeting.summary);
      setEditDecisions(selectedMeeting.decisions.join('\n'));
      setEditTranscript(selectedMeeting.rawTranscript);
    }
  }, [selectedMeeting]);

  // 신규 회의 등록 폼 상태
  const [createForm, setCreateForm] = useState({
    projectId: projects[0]?.id || '',
    type: '착수회의' as MeetingType,
    title: '',
    meetingDate: new Date().toISOString().slice(0, 16),
    location: '컨코스트 본사 회의실',
    author: currentUser?.name || '조한빈 실장',
    attendeesInternal: '조한빈 실장, 성대용 수석, 원종수 수석',
    attendeesExternal: '발주처 담당자',
    rawTranscript: '',
    summary: '',
    decisions: '1. 최신 도면 Rev.1 기준 산출 확정\n2. 공종별 납품 기한 확정'
  });

  // 회의록 저장 (DRAFT 저장)
  const handleSaveDraft = () => {
    if (!selectedMeeting) return;
    const updatedDecisions = editDecisions.split('\n').map((s) => s.trim()).filter(Boolean);

    setMeetings((prev) =>
      prev.map((m) =>
        m.id === selectedMeeting.id
          ? {
              ...m,
              summary: editSummary,
              decisions: updatedDecisions,
              rawTranscript: editTranscript,
              version: m.version + 1,
              updatedAt: new Date().toLocaleString('ko-KR')
            }
          : m
      )
    );
    alert('회의록 내용이 정상 저장되었습니다.');
  };

  // 회의록 확정 (FINAL 토글)
  const handleToggleFinalize = () => {
    if (!selectedMeeting) return;
    const nextStatus: MeetingStatus = selectedMeeting.status === 'FINAL' ? 'DRAFT' : 'FINAL';
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === selectedMeeting.id
          ? {
              ...m,
              status: nextStatus,
              updatedAt: new Date().toLocaleString('ko-KR')
            }
          : m
      )
    );
    alert(
      nextStatus === 'FINAL'
        ? '회의록이 [FINAL 확정]되었습니다. 정식 서식으로 보존되며 직인/서명이 날인됩니다.'
        : '회의록이 [DRAFT 수정모드]로 전환되었습니다.'
    );
  };

  // 할 일 추가
  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionTitle.trim() || !selectedMeeting) return;

    const newItem: ActionItem = {
      id: `act-${Date.now()}`,
      title: newActionTitle.trim(),
      assigneeName: newActionAssignee.trim() || '담당 미지정',
      roleName: newActionRole,
      dueDate: newActionDueDate,
      status: '대기'
    };

    setMeetings((prev) =>
      prev.map((m) =>
        m.id === selectedMeeting.id
          ? { ...m, actionItems: [...m.actionItems, newItem] }
          : m
      )
    );

    setNewActionTitle('');
    setNewActionAssignee('');
  };

  // 할 일 상태 토글
  const handleToggleActionStatus = (actionId: string) => {
    if (!selectedMeeting) return;
    setMeetings((prev) =>
      prev.map((m) => {
        if (m.id !== selectedMeeting.id) return m;
        return {
          ...m,
          actionItems: m.actionItems.map((ai) => {
            if (ai.id !== actionId) return ai;
            const nextStatus: ActionItem['status'] =
              ai.status === '대기' ? '진행중' : ai.status === '진행중' ? '완료' : '대기';
            return { ...ai, status: nextStatus };
          })
        };
      })
    );
  };

  // 할 일 삭제
  const handleDeleteActionItem = (actionId: string) => {
    if (!selectedMeeting) return;
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === selectedMeeting.id
          ? { ...m, actionItems: m.actionItems.filter((ai) => ai.id !== actionId) }
          : m
      )
    );
  };

  // 신규 회의록 등록 제출
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      alert('회의 제목을 입력해 주세요.');
      return;
    }

    const targetProject = projects.find((p) => p.id === createForm.projectId) || projects[0];
    const newRecord: MeetingRecord = {
      id: `meet-${Date.now()}`,
      projectId: targetProject.id,
      projectName: targetProject.name,
      projectCode: targetProject.code || targetProject.id,
      type: createForm.type,
      title: createForm.title.trim(),
      meetingDate: createForm.meetingDate,
      location: createForm.location.trim(),
      department: targetProject.department || '마감팀',
      author: createForm.author.trim(),
      attendeesInternal: createForm.attendeesInternal.split(',').map((s) => s.trim()).filter(Boolean),
      attendeesExternal: createForm.attendeesExternal.split(',').map((s) => s.trim()).filter(Boolean),
      rawTranscript: createForm.rawTranscript.trim(),
      summary: createForm.summary.trim(),
      decisions: createForm.decisions.split('\n').map((s) => s.trim()).filter(Boolean),
      actionItems: [],
      status: 'DRAFT',
      version: 1,
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    setMeetings([newRecord, ...meetings]);
    setSelectedMeetingId(newRecord.id);
    setIsCreateOpen(false);
    alert('새로운 회의록이 성공적으로 등록되었습니다.');
  };

  // 회의록 목록 필터링
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchType = typeFilter === 'ALL' || m.type === typeFilter;
      const matchSearch =
        m.title.includes(searchTerm) ||
        m.projectName.includes(searchTerm) ||
        m.author.includes(searchTerm) ||
        m.summary.includes(searchTerm);
      return matchType && matchSearch;
    });
  }, [meetings, typeFilter, searchTerm]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. 상단 타이틀 & 클레임센터 스튜디오 연계 액션 헤더 */}
      <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#00338d] text-white flex items-center justify-center font-black shadow-2xs">
              <FileSignature size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  기술본부 프로젝트 회의록 스튜디오
                </h2>
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-[#00338d] dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  클레임센터 표준 서식 연동
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                착수회의 및 공정회의 원문 대화록 보존 · 핵심 요약 및 결정사항 도출 · 공종별 Action Items 체크리스트 자동 연계
              </p>
            </div>
          </div>
        </div>

        {/* 헤더 우측: 검색 및 신규 회의록 작성 버튼 */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="회의 제목, 프로젝트, 작성자 검색..."
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#00338d]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00338d] hover:bg-[#002266] text-white text-xs font-black shadow-2xs transition active:scale-95 shrink-0"
          >
            <Plus size={14} />
            <span>+ 새 회의록 작성</span>
          </button>
        </div>
      </div>

      {/* 2. 메인 2열 그리드 (좌측: 회의 목록 4열 / 우측: 클레임센터 착수회의록 정식 서식 8열) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ===================== 좌측 회의 목록 패널 (4 cols) ===================== */}
        <div className="lg:col-span-4 space-y-3">
          {/* 회의 유형 필터 탭 */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(['ALL', '착수회의', '공정회의', '도면질의협의', '내역검토회'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTypeFilter(tab)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                  typeFilter === tab
                    ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-blue-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab === 'ALL' ? '전체' : tab}
              </button>
            ))}
          </div>

          {/* 회의록 카드 리스트 */}
          <div className="space-y-2.5">
            {filteredMeetings.map((m) => {
              const isSelected = selectedMeeting?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMeetingId(m.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/60 dark:bg-blue-950/40 border-[#00338d] dark:border-blue-500 shadow-md ring-2 ring-[#00338d]/20'
                      : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                          m.type === '착수회의'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200'
                            : m.type === '내역검토회'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                        }`}
                      >
                        {m.type}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                        {m.department}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                        m.status === 'FINAL'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                      }`}
                    >
                      {m.status === 'FINAL' ? '✓ FINAL 확정' : '✎ DRAFT 초안'}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm line-clamp-2 mb-1.5 leading-snug">
                    {m.title}
                  </h3>

                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2.5 flex items-center gap-1">
                    <FolderKanban size={13} className="text-[#00338d] dark:text-blue-400 shrink-0" />
                    <span className="truncate">{m.projectName}</span>
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar size={12} />
                      {m.meetingDate.slice(0, 10)}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
                      <Users size={12} />
                      참석 {m.attendeesInternal.length + m.attendeesExternal.length}명
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===================== 우측: 클레임센터 착수회의록 정식 서식 (8 cols) ===================== */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          {selectedMeeting ? (
            <>
              {/* 회의록 탑 바: 제목, 상태, 인쇄/저장/확정 액션 버튼 */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                        selectedMeeting.status === 'FINAL'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {selectedMeeting.status === 'FINAL' ? '✓ 정식 확정본 (FINAL)' : '✎ 작성중 초안 (DRAFT)'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Rev.{selectedMeeting.version} · 최종수정: {selectedMeeting.updatedAt}
                    </span>
                  </div>
                  <h1 className="text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    {selectedMeeting.title}
                  </h1>
                </div>

                {/* 컨트롤 버튼 그룹 */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition shadow-2xs"
                  >
                    <Printer size={13} />
                    <span>A4 인쇄</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-2xs"
                  >
                    <Save size={13} />
                    <span>저장</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleFinalize}
                    className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-black transition shadow-2xs ${
                      selectedMeeting.status === 'FINAL'
                        ? 'bg-slate-700 hover:bg-slate-800 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <Lock size={13} />
                    <span>{selectedMeeting.status === 'FINAL' ? '수정모드 전환' : '회의록 확정 (FINAL)'}</span>
                  </button>
                </div>
              </div>

              {/* 회의 개요 공식 테이블 (클레임센터 회의록 표준 서식) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-750 overflow-hidden bg-slate-50/50 dark:bg-slate-800/40">
                <div className="bg-[#00338d] text-white px-4 py-2 text-xs font-black flex items-center justify-between">
                  <span>[양식] 기술본부 회의록 개요 (KICK-OFF MEETING RECORD)</span>
                  <span className="font-mono">문서번호: CONCOST-MEET-{selectedMeeting.id.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 text-xs divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                  <div className="p-3 space-y-2">
                    <div className="flex items-start">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">프로젝트명</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {selectedMeeting.projectName} ({selectedMeeting.projectCode})
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">회의 일시</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 font-mono">
                        {selectedMeeting.meetingDate.replace('T', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">회의 장소</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {selectedMeeting.location}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="flex items-center">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">주관 부서</span>
                      <span className="font-bold text-[#00338d] dark:text-blue-400">
                        {selectedMeeting.department} (주관: {selectedMeeting.author})
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">내부 참석자</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                        {selectedMeeting.attendeesInternal.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="w-20 font-bold text-slate-500 dark:text-slate-400 shrink-0">외부 참석자</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                        {selectedMeeting.attendeesExternal.length > 0
                          ? selectedMeeting.attendeesExternal.join(', ')
                          : '외부 참석자 없음'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 보존된 회의 원문 텍스트 (Raw Kick-off Transcript) */}
              <div className="space-y-2">
                <div
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="flex items-center justify-between cursor-pointer py-1 text-xs font-black text-slate-700 dark:text-slate-300 hover:text-[#00338d]"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText size={14} className="text-[#00338d] dark:text-blue-400" />
                    <span>보존된 회의 원문 및 대화록 (Raw Kick-off Transcript)</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      (회의 시 오간 실제 협의 텍스트 원본)
                    </span>
                  </div>
                  {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>

                {showTranscript && (
                  <textarea
                    rows={6}
                    value={editTranscript}
                    onChange={(e) => setEditTranscript(e.target.value)}
                    disabled={selectedMeeting.status === 'FINAL'}
                    placeholder="회의 원문 텍스트를 기록 또는 붙여넣기 하세요."
                    className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00338d] disabled:opacity-85"
                  />
                )}
              </div>

              {/* 핵심 요약 (Summary) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-[#00338d]" />
                  <span>회의 핵심 요약 (Executive Summary)</span>
                </div>
                <textarea
                  rows={4}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  disabled={selectedMeeting.status === 'FINAL'}
                  placeholder="착수회의 핵심 쟁점 및 일정, 공종별 특이사항 요약을 입력하세요."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00338d] disabled:opacity-85"
                />
              </div>

              {/* 주요 결정사항 (Decisions) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>주요 결정사항 (Decisions & Agreements)</span>
                </div>
                <textarea
                  rows={4}
                  value={editDecisions}
                  onChange={(e) => setEditDecisions(e.target.value)}
                  disabled={selectedMeeting.status === 'FINAL'}
                  placeholder="줄바꿈으로 구분하여 결정사항을 입력하세요."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 leading-relaxed font-sans focus:outline-none focus:ring-2 focus:ring-[#00338d] disabled:opacity-85"
                />
              </div>

              {/* 공종별 조치사항 & 할 일 목록 (Action Items Table) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-200">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>공종별 실행 과제 및 조치사항 (Action Items Table)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      총 {selectedMeeting.actionItems.length}건
                    </span>
                  </div>
                </div>

                {/* 할 일 테이블 */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-750 overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5 text-center w-12">상태</th>
                        <th className="p-2.5 w-20">공종</th>
                        <th className="p-2.5">실행 과제 (Action Item)</th>
                        <th className="p-2.5 w-32">담당자</th>
                        <th className="p-2.5 w-24 text-center">기한</th>
                        {selectedMeeting.status !== 'FINAL' && (
                          <th className="p-2.5 w-12 text-center">삭제</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedMeeting.actionItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                            등록된 조치사항(Action Item)이 없습니다. 아래 폼에서 추가해 주세요.
                          </td>
                        </tr>
                      ) : (
                        selectedMeeting.actionItems.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                          >
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleActionStatus(item.id)}
                                disabled={selectedMeeting.status === 'FINAL'}
                                className={`text-[10px] font-black px-2 py-0.5 rounded-md transition ${
                                  item.status === '완료'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : item.status === '진행중'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {item.status}
                              </button>
                            </td>
                            <td className="p-2.5 font-bold text-slate-700 dark:text-slate-300">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[11px]">
                                {item.roleName}
                              </span>
                            </td>
                            <td className="p-2.5 font-medium text-slate-900 dark:text-white">
                              {item.title}
                            </td>
                            <td className="p-2.5 font-bold text-slate-700 dark:text-slate-300">
                              {item.assigneeName}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-500 dark:text-slate-400">
                              {item.dueDate}
                            </td>
                            {selectedMeeting.status !== 'FINAL' && (
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteActionItem(item.id)}
                                  className="text-slate-400 hover:text-rose-600 transition"
                                  title="할 일 삭제"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 신규 할 일 인라인 추가 바 (DRAFT 모드에서만 활성화) */}
                {selectedMeeting.status !== 'FINAL' && (
                  <form
                    onSubmit={handleAddActionItem}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex flex-wrap items-center gap-2"
                  >
                    <select
                      value={newActionRole}
                      onChange={(e) => setNewActionRole(e.target.value)}
                      className="text-xs p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-bold"
                    >
                      <option value="조적">조적</option>
                      <option value="창호">창호</option>
                      <option value="외부">외부</option>
                      <option value="내부">내부</option>
                      <option value="세대">세대</option>
                      <option value="내역">내역</option>
                      <option value="가설">가설</option>
                      <option value="PM">PM</option>
                      <option value="골조">골조</option>
                      <option value="토목">토목</option>
                    </select>

                    <input
                      type="text"
                      value={newActionTitle}
                      onChange={(e) => setNewActionTitle(e.target.value)}
                      placeholder="신규 실행 과제 내용 입력..."
                      className="flex-1 min-w-[200px] text-xs p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                    />

                    <input
                      type="text"
                      value={newActionAssignee}
                      onChange={(e) => setNewActionAssignee(e.target.value)}
                      placeholder="담당자 (예: 원종수 수석)"
                      className="w-36 text-xs p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                    />

                    <input
                      type="date"
                      value={newActionDueDate}
                      onChange={(e) => setNewActionDueDate(e.target.value)}
                      className="w-32 text-xs p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono"
                    />

                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-[#00338d] hover:bg-[#002266] text-white text-xs font-bold transition shadow-2xs shrink-0"
                    >
                      + 과제 추가
                    </button>
                  </form>
                )}
              </div>

              {/* 문서 하단 승인/서명 날인란 (A4 공식 출력 서식 룩앤필) */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800">
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">작성자</span>
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
                    {selectedMeeting.author}
                  </span>
                  <span className="block text-[10px] text-emerald-600 font-bold mt-1">✓ 서명완료</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800">
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">주관 PM</span>
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
                    조한빈 실장
                  </span>
                  <span className="block text-[10px] text-emerald-600 font-bold mt-1">✓ 결재완료</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800">
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">기술본부장</span>
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
                    (주)컨코스트 기술본부
                  </span>
                  <span className="block text-[10px] text-blue-600 font-bold mt-1">공식 회의록 날인</span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              선택된 회의록이 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 3. 신규 프로젝트 회의록 작성 모달 */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00338d] text-white flex items-center justify-center font-bold">
                  <FileSignature size={16} />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  신규 프로젝트 회의록 등록 (클레임센터 표준 서식)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    대상 프로젝트
                  </label>
                  <select
                    value={createForm.projectId}
                    onChange={(e) => setCreateForm({ ...createForm, projectId: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.department}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    회의 유형
                  </label>
                  <select
                    value={createForm.type}
                    onChange={(e) => setCreateForm({ ...createForm, type: e.target.value as MeetingType })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                  >
                    <option value="착수회의">착수회의 (Kick-off)</option>
                    <option value="공정회의">공정/진도회의 (Progress)</option>
                    <option value="도면질의협의">도면질의협의 (Drawing & Query)</option>
                    <option value="내역검토회">내역/산출 검토회 (Estimate & Takeoff)</option>
                    <option value="긴급이슈">긴급이슈 회의</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  회의 제목
                </label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="예: [삼성물산 P5] 견적용역 착수회의 및 공종별 기준 확정"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    회의 일시
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.meetingDate}
                    onChange={(e) => setCreateForm({ ...createForm, meetingDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    회의 장소
                  </label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                    placeholder="예: 대회의실 또는 화상회의"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    내부 참석자 (쉼표 구분)
                  </label>
                  <input
                    type="text"
                    value={createForm.attendeesInternal}
                    onChange={(e) => setCreateForm({ ...createForm, attendeesInternal: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    외부 참석자 (쉼표 구분)
                  </label>
                  <input
                    type="text"
                    value={createForm.attendeesExternal}
                    onChange={(e) => setCreateForm({ ...createForm, attendeesExternal: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  보존용 회의 원문 텍스트 (Raw Transcript)
                </label>
                <textarea
                  rows={4}
                  value={createForm.rawTranscript}
                  onChange={(e) => setCreateForm({ ...createForm, rawTranscript: e.target.value })}
                  placeholder="회의 시 오간 대화록 원문을 자유롭게 입력하거나 붙여넣으세요."
                  className="w-full text-xs font-mono p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  회의 핵심 요약 (Summary)
                </label>
                <textarea
                  rows={3}
                  value={createForm.summary}
                  onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                  placeholder="착수회의 주요 쟁점 및 핵심 일정을 요약하세요."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg font-bold"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs text-white bg-[#00338d] hover:bg-[#002266] font-extrabold rounded-lg shadow-2xs"
                >
                  회의록 등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
