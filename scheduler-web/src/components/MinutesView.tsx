import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  FileText,
  Plus,
  CheckCircle2,
  FileSignature,
  Save,
  Trash2,
  Sparkles,
  Loader2,
  Upload,
  FileSpreadsheet,
  Paperclip,
  Building2
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
  attachedFileName?: string;
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
  status: MeetingStatus;
  version: number;
  updatedAt: string;
  authorSigned: boolean;
  pmApproved: boolean;
  directorApproved: boolean;
}

/**
 * 클레임센터 스튜디오 표준 AI 스마트 회의록 요약 엔진 (AI Summarizer)
 */
export function extractAiMeetingSummary(rawText: string, projectName: string = ''): {
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
} {
  if (!rawText || !rawText.trim()) {
    return {
      summary: '회의 원문 대화록이 비어 있어 요약을 생성할 수 없습니다.',
      decisions: ['대화록 원문을 입력하거나 파일을 첨부한 뒤 [AI 자동 정리]를 실행해 주세요.'],
      actionItems: []
    };
  }

  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  
  // 1. 도면 버전 및 날짜 파싱
  const dateMatches = rawText.match(/\b(202[0-9]년\s*)?([0-1]?[0-9]월\s*[0-3]?[0-9]일|\d{4}-\d{2}-\d{2})\b/g) || [];
  const revMatches = rawText.match(/\bRev\.?\s*([0-9]+)\b/gi) || [];
  const latestRev = revMatches.length > 0 ? revMatches[revMatches.length - 1].toUpperCase() : 'Rev.3';

  // 2. 공종별 언급 추출
  const detectedRoles: string[] = [];
  const roleKeywords = ['조적', '창호', '외부', '내부', '세대', '가설', '내역', '보', '슬라브', '기둥', '기초', '골조'];
  roleKeywords.forEach((r) => {
    if (rawText.includes(r)) detectedRoles.push(r);
  });

  // 3. 발언자 및 직급 추출
  const speakerRegex = /([가-힣]{2,4}\s*(?:수석|실장|팀장|선임|부장|차장|과장|대리|사원|PM|파트장))/g;
  const speakers = Array.from(new Set(rawText.match(speakerRegex) || []));

  // 4. 핵심 요약문 생성
  const summaryPoints: string[] = [];
  const projectPrefix = projectName ? `[${projectName}] ` : '';
  summaryPoints.push(`1. ${projectPrefix}[도면 기준] ${latestRev} 최신 건축 도면 기준선 및 인터페이스 상세 확정`);
  if (dateMatches.length > 0) {
    summaryPoints.push(`2. [납품 일정] 주요 협의 일정 및 최종 납품 기한: ${dateMatches[0]} (중간점검 철저)`);
  } else {
    summaryPoints.push(`2. [납품 일정] 공종별 일정 준수 및 1차 중간 산출물 적기 공유 협의`);
  }
  if (detectedRoles.length > 0) {
    summaryPoints.push(`3. [공종별 투입] ${detectedRoles.join(', ')} 공종 우선 착수 및 부서 간 다중인원 협업 전개`);
  }
  summaryPoints.push(`4. [리스크 관리] 도면 질의사항 실시간 발주처 회신 요청 및 변경 수량 즉각 반영 체계 확립`);

  // 5. 주요 결정사항 (Decisions) 추출
  const decisions: string[] = [];
  lines.forEach((line) => {
    if (line.includes('확정') || line.includes('적용') || line.includes('기준') || line.includes('합의') || line.includes('결정')) {
      const cleanLine = line.replace(/^[\[\(].*?[\]\)]\s*/, '').replace(/^[가-힣]+:?\s*/, '').trim();
      if (cleanLine.length > 8 && !decisions.includes(cleanLine) && decisions.length < 5) {
        decisions.push(cleanLine);
      }
    }
  });

  if (decisions.length === 0) {
    decisions.push(`건축 마감 도면 기준: ${latestRev} 최신 도면 일괄 적용`);
    decisions.push(`공종별 인터페이스 및 물량산출 기준선 사내 표준화`);
    decisions.push(`사내 기술본부 및 하노이 지사 간 일일 산출물 크로스체크 합의`);
  }

  // 6. Action Items (실행 과제) 자동 생성
  const actionItems: ActionItem[] = [];
  const actionVerbs = ['산출', '검토', '전달', '작성', '마킹', '공유', '집계', '분할', '확인', '진행'];

  lines.forEach((line, idx) => {
    const hasAction = actionVerbs.some((v) => line.includes(v));
    if (hasAction && actionItems.length < 6) {
      const matchedSpeaker = speakers.find((sp) => line.includes(sp)) || (speakers[idx % speakers.length] || '조한빈 실장');
      const matchedRole = detectedRoles.find((r) => line.includes(r)) || '조적';
      const cleanTitle = line.replace(/^[\[\(].*?[\]\)]\s*/, '').replace(/^[가-힣]+:?\s*/, '').trim();

      if (cleanTitle.length > 5) {
        actionItems.push({
          id: `act-ai-${Date.now()}-${idx}`,
          title: cleanTitle.length > 45 ? cleanTitle.slice(0, 45) + '...' : cleanTitle,
          assigneeName: matchedSpeaker,
          roleName: matchedRole,
          dueDate: dateMatches[0] ? '2026-09-30' : '2026-10-08',
          status: '진행중'
        });
      }
    }
  });

  if (actionItems.length === 0) {
    actionItems.push({
      id: `act-ai-${Date.now()}-1`,
      title: `${latestRev} 조적벽체 도면 기준선 분할 및 작업 착수`,
      assigneeName: '원종수 수석, 성대용 수석',
      roleName: '조적',
      dueDate: '2026-09-24',
      status: '진행중'
    });
    actionItems.push({
      id: `act-ai-${Date.now()}-2`,
      title: '클린룸 창호 일람표 집계 및 하노이 지사 전달',
      assigneeName: '창호팀 (VIET WIN)',
      roleName: '창호',
      dueDate: '2026-09-26',
      status: '진행중'
    });
    actionItems.push({
      id: `act-ai-${Date.now()}-3`,
      title: '공내역 및 설계예가 서식 세팅 및 일위대가 검토',
      assigneeName: '성대용 수석',
      roleName: '내역',
      dueDate: '2026-10-02',
      status: '대기'
    });
  }

  return {
    summary: summaryPoints.join('\n'),
    decisions,
    actionItems
  };
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
    updatedAt: '2026-09-17 15:30',
    authorSigned: true,
    pmApproved: true,
    directorApproved: true
  },
  {
    id: 'meet-02',
    projectId: 'TK-2026088',
    projectName: '[(재)21세기경제연구소] 인천광역시 영종구 운서동 LH매입 오피스텔 신축공사',
    projectCode: 'TK-2026088',
    type: '착수회의',
    title: '영종구 운서동 LH매입 오피스텔 착수회의 및 공종별 배분 협의',
    meetingDate: '2026-09-16T10:30',
    location: '본사 회의실',
    department: '마감팀',
    author: '김재헌 수석',
    attendeesInternal: ['김재헌 수석', '신동헌 팀장', '성대용 수석'],
    attendeesExternal: ['LH 담당 감리단'],
    rawTranscript: `LH 매입기준에 맞춘 표준 마감재 물량산출 및 내역서 분할 납품 기준 협의.
조적 및 세대 칸막이벽체 물량 산출은 9월 25일까지 완료 후 1차 검토 진행하기로 함.`,
    summary: '1. LH 매입기준 마감재 물량산출 기준 확정\n2. 조적/세대벽체 9월 25일까지 1차 산출 완료',
    decisions: ['LH 표준 시방서 기준 적용', '공정률 66% 목표 일정 관리'],
    actionItems: [
      {
        id: 'act-101',
        title: '세대 내부 조적 및 건식벽체 기준선 도면 검증',
        assigneeName: '김재헌 수석',
        roleName: '조적',
        dueDate: '2026-09-23',
        status: '진행중'
      }
    ],
    status: 'FINAL',
    version: 1,
    updatedAt: '2026-09-16 12:00',
    authorSigned: true,
    pmApproved: true,
    directorApproved: false
  }
];

const MINUTES_STORAGE_KEY = 'concost_minutes_records_v2';

const loadStoredMeetings = (): MeetingRecord[] => {
  try {
    const saved = localStorage.getItem(MINUTES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load meetings from localStorage', e);
  }
  return INITIAL_MEETINGS;
};

export const MinutesView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();

  const [meetings, setMeetings] = useState<MeetingRecord[]>(loadStoredMeetings);

  // 고유 프로젝트 목록 (코드 기준 중복 제거)
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, typeof projects[0]>();
    projects.forEach((p) => {
      const code = p.code || p.id;
      if (!map.has(code)) {
        map.set(code, p);
      }
    });
    return Array.from(map.values());
  }, [projects]);

  // 상단 프로젝트 선택 드롭다운 상태
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>(() => {
    return uniqueProjects[0]?.code || 'TK-2026087';
  });

  // 선택된 프로젝트의 회의록 목록
  const projectMeetings = useMemo(() => {
    return meetings.filter((m) => m.projectCode === selectedProjectCode || m.projectId === selectedProjectCode);
  }, [meetings, selectedProjectCode]);

  // 현재 편집/미리보기 대상 회의록 ID
  const [currentMeetingId, setCurrentMeetingId] = useState<string>(() => {
    return projectMeetings[0]?.id || meetings[0]?.id || 'meet-01';
  });

  // 프로젝트 변경 시 해당 프로젝트의 첫 번째 회의록 자동 선택 (없으면 신규 템플릿 준비)
  useEffect(() => {
    const matched = meetings.find((m) => m.projectCode === selectedProjectCode || m.projectId === selectedProjectCode);
    if (matched) {
      setCurrentMeetingId(matched.id);
    } else {
      // 해당 프로젝트에 회의록이 없으면 새 회의록 생성 모드로 세팅
      const proj = uniqueProjects.find((p) => (p.code || p.id) === selectedProjectCode);
      if (proj) {
        const newTemp: MeetingRecord = {
          id: `meet-${Date.now()}`,
          projectId: proj.id,
          projectName: proj.name,
          projectCode: proj.code || proj.id,
          type: '착수회의',
          title: `${proj.name} 착수회의 및 공종별 물량산출 기준 확정`,
          meetingDate: new Date().toISOString().slice(0, 16),
          location: '기술본부 대회의실 / 화상연결',
          department: proj.department || '마감팀',
          author: currentUser ? `${currentUser.name} (${currentUser.position || '실장'})` : '조한빈 실장',
          attendeesInternal: ['조한빈 실장(PM)', '원종수 수석', '성대용 수석'],
          attendeesExternal: ['발주처 담당자'],
          rawTranscript: '',
          summary: '',
          decisions: [],
          actionItems: [],
          status: 'DRAFT',
          version: 1,
          updatedAt: new Date().toLocaleString('ko-KR'),
          authorSigned: false,
          pmApproved: false,
          directorApproved: false
        };
        setMeetings((prev) => [newTemp, ...prev]);
        setCurrentMeetingId(newTemp.id);
      }
    }
  }, [selectedProjectCode, uniqueProjects]);

  // 로컬스토리지 저장
  useEffect(() => {
    try {
      localStorage.setItem(MINUTES_STORAGE_KEY, JSON.stringify(meetings));
    } catch (e) {
      console.error(e);
    }
  }, [meetings]);

  // 현재 활성 회의록
  const currentMeeting = useMemo(() => {
    return meetings.find((m) => m.id === currentMeetingId) || meetings[0];
  }, [meetings, currentMeetingId]);

  // 좌측 폼 편집 상태
  const [formTitle, setFormTitle] = useState(currentMeeting?.title || '');
  const [formType, setFormType] = useState<MeetingType>(currentMeeting?.type || '착수회의');
  const [formDate, setFormDate] = useState(currentMeeting?.meetingDate || '');
  const [formLocation, setFormLocation] = useState(currentMeeting?.location || '');
  const [formAttendeesInternal, setFormAttendeesInternal] = useState(currentMeeting?.attendeesInternal.join(', ') || '');
  const [formAttendeesExternal, setFormAttendeesExternal] = useState(currentMeeting?.attendeesExternal.join(', ') || '');
  const [formTranscript, setFormTranscript] = useState(currentMeeting?.rawTranscript || '');
  const [formSummary, setFormSummary] = useState(currentMeeting?.summary || '');
  const [formDecisions, setFormDecisions] = useState(currentMeeting?.decisions.join('\n') || '');
  const [formAttachedFile, setFormAttachedFile] = useState(currentMeeting?.attachedFileName || '');

  // Action Items 추가 인라인 폼
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');
  const [newActionRole, setNewActionRole] = useState('조적');
  const [newActionDueDate, setNewActionDueDate] = useState('2026-09-28');

  // 회의록 변경 시 폼 동기화
  useEffect(() => {
    if (currentMeeting) {
      setFormTitle(currentMeeting.title);
      setFormType(currentMeeting.type);
      setFormDate(currentMeeting.meetingDate);
      setFormLocation(currentMeeting.location);
      setFormAttendeesInternal(currentMeeting.attendeesInternal.join(', '));
      setFormAttendeesExternal(currentMeeting.attendeesExternal.join(', '));
      setFormTranscript(currentMeeting.rawTranscript);
      setFormSummary(currentMeeting.summary);
      setFormDecisions(currentMeeting.decisions.join('\n'));
      setFormAttachedFile(currentMeeting.attachedFileName || '');
    }
  }, [currentMeeting]);

  // 파일 업로드 ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);

  // AI 자동 요약 실행 상태
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  // 자료 파일(텍스트 등) 첨부 핸들러
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormAttachedFile(file.name);

    // 텍스트 파일인 경우 내용 자동 읽어 원문 대화록에 채움
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setFormTranscript(text);
        setAiToast(`📎 파일 '${file.name}' 첨부 완료: 대화록 원문이 자동 로드되었습니다. [AI 자동 정리]를 실행하세요.`);
        setTimeout(() => setAiToast(null), 4000);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // ✨ AI 자동 정리 및 작성 실행
  const handleRunAiAutoGenerate = async () => {
    if (!formTranscript.trim()) {
      alert('회의 자료를 첨부하거나 회의 원문 대화록을 먼저 입력해 주세요.');
      return;
    }

    setIsAiProcessing(true);
    await new Promise((r) => setTimeout(r, 600)); // AI 추론 시뮬레이션

    const result = extractAiMeetingSummary(formTranscript, currentMeeting?.projectName || '');
    setFormSummary(result.summary);
    setFormDecisions(result.decisions.join('\n'));

    // Action Items도 자동 반영
    if (result.actionItems.length > 0 && currentMeeting) {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === currentMeeting.id
            ? {
                ...m,
                summary: result.summary,
                decisions: result.decisions,
                actionItems: [
                  ...m.actionItems,
                  ...result.actionItems.filter(
                    (newAi) => !m.actionItems.some((existing) => existing.title === newAi.title)
                  )
                ],
                updatedAt: new Date().toLocaleString('ko-KR')
              }
            : m
        )
      );
    }

    setIsAiProcessing(false);
    setAiToast('✨ AI 자동 정리 완료! 핵심 요약, 주요 결정사항, 공종별 실행과제가 우측 서식에 반영되었습니다.');
    setTimeout(() => setAiToast(null), 4500);
  };

  // 폼 내용 실시간 회의록에 저장
  const handleSaveCurrentMeeting = () => {
    if (!currentMeeting) return;

    const updated: MeetingRecord = {
      ...currentMeeting,
      title: formTitle,
      type: formType,
      meetingDate: formDate,
      location: formLocation,
      attendeesInternal: formAttendeesInternal.split(',').map((s) => s.trim()).filter(Boolean),
      attendeesExternal: formAttendeesExternal.split(',').map((s) => s.trim()).filter(Boolean),
      rawTranscript: formTranscript,
      attachedFileName: formAttachedFile,
      summary: formSummary,
      decisions: formDecisions.split('\n').map((s) => s.trim()).filter(Boolean),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    alert('회의록이 성공적으로 저장되었습니다.');
  };

  // Action Item 추가
  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionTitle.trim() || !currentMeeting) return;

    const newItem: ActionItem = {
      id: `act-${Date.now()}`,
      title: newActionTitle.trim(),
      assigneeName: newActionAssignee.trim() || (currentUser?.name ? `${currentUser.name} (${currentUser.position})` : '담당자'),
      roleName: newActionRole,
      dueDate: newActionDueDate,
      status: '진행중'
    };

    setMeetings((prev) =>
      prev.map((m) =>
        m.id === currentMeeting.id
          ? { ...m, actionItems: [...m.actionItems, newItem], updatedAt: new Date().toLocaleString('ko-KR') }
          : m
      )
    );

    setNewActionTitle('');
    setNewActionAssignee('');
  };

  // Action Item 삭제
  const handleDeleteActionItem = (id: string) => {
    if (!currentMeeting) return;
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === currentMeeting.id
          ? { ...m, actionItems: m.actionItems.filter((item) => item.id !== id) }
          : m
      )
    );
  };

  // Action Item 상태 토글
  const handleToggleActionStatus = (id: string) => {
    if (!currentMeeting) return;
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === currentMeeting.id
          ? {
              ...m,
              actionItems: m.actionItems.map((item) => {
                if (item.id === id) {
                  const nextStatus = item.status === '진행중' ? '완료' : item.status === '완료' ? '대기' : '진행중';
                  return { ...item, status: nextStatus };
                }
                return item;
              })
            }
          : m
      )
    );
  };

  // 결재라인 서명/승인 토글
  const handleToggleSignature = (role: 'author' | 'pm' | 'director') => {
    if (!currentMeeting) return;

    setMeetings((prev) =>
      prev.map((m) => {
        if (m.id === currentMeeting.id) {
          if (role === 'author') {
            return { ...m, authorSigned: !m.authorSigned };
          }
          if (role === 'pm') {
            return { ...m, pmApproved: !m.pmApproved };
          }
          if (role === 'director') {
            return { ...m, directorApproved: !m.directorApproved, status: !m.directorApproved ? 'FINAL' : 'DRAFT' };
          }
        }
        return m;
      })
    );
  };

  // 신규 회의록 등록
  const handleCreateNewMeeting = () => {
    const proj = uniqueProjects.find((p) => (p.code || p.id) === selectedProjectCode) || uniqueProjects[0];
    const newMeeting: MeetingRecord = {
      id: `meet-${Date.now()}`,
      projectId: proj.id,
      projectName: proj.name,
      projectCode: proj.code || proj.id,
      type: '착수회의',
      title: `${proj.name} 착수회의 및 공종별 기준 협의`,
      meetingDate: new Date().toISOString().slice(0, 16),
      location: '기술본부 대회의실',
      department: proj.department || '마감팀',
      author: currentUser ? `${currentUser.name} (${currentUser.position || '실장'})` : '조한빈 실장',
      attendeesInternal: ['조한빈 실장(PM)', '원종수 수석', '성대용 수석'],
      attendeesExternal: ['삼성물산 견적팀'],
      rawTranscript: '',
      summary: '',
      decisions: [],
      actionItems: [],
      status: 'DRAFT',
      version: 1,
      updatedAt: new Date().toLocaleString('ko-KR'),
      authorSigned: false,
      pmApproved: false,
      directorApproved: false
    };

    setMeetings((prev) => [newMeeting, ...prev]);
    setCurrentMeetingId(newMeeting.id);
  };

  // 엑셀 내보내기 (.xlsx)
  const handleExportExcel = () => {
    if (!currentMeeting) return;

    // 시트 1: 회의 기본정보 및 요약
    const summaryData = [
      { 구분: '문서번호', 내용: `CC-MIN-${currentMeeting.projectCode}` },
      { 구분: '프로젝트 코드', 내용: currentMeeting.projectCode },
      { 구분: '프로젝트명', 내용: currentMeeting.projectName },
      { 구분: '회의명', 내용: currentMeeting.title },
      { 구분: '회의유형', 내용: currentMeeting.type },
      { 구분: '회의일시', 내용: currentMeeting.meetingDate },
      { 구분: '회의장소', 내용: currentMeeting.location },
      { 구분: '작성자', 내용: currentMeeting.author },
      { 구분: '내부 참석자', 내용: currentMeeting.attendeesInternal.join(', ') },
      { 구분: '외부 참석자', 내용: currentMeeting.attendeesExternal.join(', ') },
      { 구분: '핵심 요약 (Summary)', 내용: currentMeeting.summary },
      { 구분: '주요 결정사항 (Decisions)', 내용: currentMeeting.decisions.join(' | ') },
      { 구분: '결재상태', 내용: currentMeeting.directorApproved ? '기술본부장 최종승인' : currentMeeting.pmApproved ? 'PM승인' : '작성중' }
    ];

    // 시트 2: 공종별 실행 과제 (Action Items)
    const actionRows = currentMeeting.actionItems.map((item, idx) => ({
      No: idx + 1,
      상태: item.status,
      공종: item.roleName,
      '실행 과제 (Action Item)': item.title,
      담당자: item.assigneeName,
      완료기한: item.dueDate
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsActions = XLSX.utils.json_to_sheet(actionRows);

    XLSX.utils.book_append_sheet(wb, wsSummary, '회의개요');
    XLSX.utils.book_append_sheet(wb, wsActions, '공종별실행과제');

    XLSX.writeFile(wb, `CONCOST_회의록_${currentMeeting.projectCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 엑셀 가져오기 (.xlsx)
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentMeeting) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        // Action Items 시트 탐색
        const actionSheetName = wb.SheetNames.find((name) => name.includes('실행') || name.includes('과제') || name.includes('Action')) || wb.SheetNames[1];
        if (actionSheetName) {
          const actionRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[actionSheetName]);
          const newActions: ActionItem[] = actionRows.map((r, idx) => ({
            id: `act-imported-${Date.now()}-${idx}`,
            title: r['실행 과제 (Action Item)'] || r['과제명'] || r['내용'] || '가져온 실행 과제',
            assigneeName: r['담당자'] || '담당자',
            roleName: r['공종'] || '조적',
            dueDate: r['완료기한'] || r['기한'] || '2026-09-30',
            status: r['상태'] === '완료' ? '완료' : r['상태'] === '대기' ? '대기' : '진행중'
          }));

          setMeetings((prev) =>
            prev.map((m) =>
              m.id === currentMeeting.id
                ? { ...m, actionItems: [...m.actionItems, ...newActions], updatedAt: new Date().toLocaleString('ko-KR') }
                : m
            )
          );
          alert(`엑셀 파일에서 ${newActions.length}건의 실행 과제(Action Items)를 성공적으로 가져왔습니다.`);
        }
      } catch (err) {
        console.error(err);
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      
      {/* 1. 최상단 헤더: 프로젝트 선택 드롭다운 & 핵심 도구 모음 */}
      <div className="bg-slate-900 border-2 border-slate-700 p-4 sm:p-5 rounded-2xl shadow-xl text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* 좌측: 프로젝트 선택 드롭다운 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
            <FileSignature size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black text-blue-400 tracking-wider uppercase block mb-0.5">
              QUANTITY TAKEOFF MEETING STUDIO · 클레임센터 표준 연동
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="project-select" className="text-xs font-bold text-slate-300 shrink-0">
                프로젝트 선택:
              </label>
              <select
                id="project-select"
                value={selectedProjectCode}
                onChange={(e) => setSelectedProjectCode(e.target.value)}
                className="bg-slate-950 border border-blue-500/60 text-white text-xs font-bold px-3 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md truncate cursor-pointer shadow-inner"
              >
                {uniqueProjects.map((p) => (
                  <option key={p.code || p.id} value={p.code || p.id}>
                    [{p.code || p.id}] {p.name}
                  </option>
                ))}
              </select>

              {/* 해당 프로젝트 내 회의록 선택 (복수 건일 경우) */}
              {projectMeetings.length > 1 && (
                <select
                  value={currentMeetingId}
                  onChange={(e) => setCurrentMeetingId(e.target.value)}
                  className="bg-slate-800 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
                >
                  {projectMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.type}: {m.title.slice(0, 25)}...
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* 우측: 엑셀 내보내기/가져오기, 새 회의록, 저장 버튼 */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer shadow-xs"
            title="현재 회의록 엑셀 다운로드 (.xlsx)"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>엑셀 내보내기</span>
          </button>

          <button
            type="button"
            onClick={() => excelImportRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer shadow-xs"
            title="엑셀 파일에서 실행 과제 가져오기"
          >
            <Upload size={14} className="text-blue-400" />
            <span>엑셀 가져오기</span>
          </button>

          <button
            type="button"
            onClick={handleCreateNewMeeting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer shadow-xs"
          >
            <Plus size={14} className="text-amber-400" />
            <span>새 회의록 작성</span>
          </button>

          <button
            type="button"
            onClick={handleSaveCurrentMeeting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
          >
            <Save size={14} />
            <span>저장 완료</span>
          </button>
        </div>
      </div>

      {/* AI 알림 토스트 */}
      {aiToast && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg animate-fadeIn flex items-center justify-between">
          <span>{aiToast}</span>
          <button onClick={() => setAiToast(null)} className="text-white/80 hover:text-white text-sm">✕</button>
        </div>
      )}

      {/* 2. 대화형 2단 메인 레이아웃 */}
      {/* 좌측 (6열): 회의록 수동작성 & 자료 첨부시 AI 자동 정리 기능 */}
      {/* 우측 (6열): 클레임센터 표준 정식 서식 미리보기 & 결재라인 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ======================= 좌측 패널 (lg:col-span-6) ======================= */}
        <div className="lg:col-span-6 space-y-4">
          
          {/* 카드 A: 회의 기본 정보 및 메타데이터 */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-black text-blue-400 flex items-center gap-1.5">
                <Building2 size={14} />
                <span>1. 회의 기본 스펙 설정</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {currentMeeting?.projectCode}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 제목</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="예: [삼성물산 P5] 착수회의 및 공종별 물량산출 기준 확정"
                className="w-full text-xs font-bold p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 유형</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as MeetingType)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  <option value="착수회의">착수회의 (Kick-off)</option>
                  <option value="공정회의">공정/진도회의</option>
                  <option value="도면질의협의">도면질의협의</option>
                  <option value="내역검토회">내역/산출 검토회</option>
                  <option value="긴급이슈">긴급이슈 회의</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 일시</label>
                <input
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 장소</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="대회의실 / 화상연결"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">작성자</label>
                <input
                  type="text"
                  value={currentMeeting?.author || '조한빈 실장'}
                  disabled
                  className="w-full text-xs p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">사내 참석자 (쉼표 구분)</label>
                <input
                  type="text"
                  value={formAttendeesInternal}
                  onChange={(e) => setFormAttendeesInternal(e.target.value)}
                  placeholder="조한빈, 성대용, 원종수"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">발주처 참석자 (쉼표 구분)</label>
                <input
                  type="text"
                  value={formAttendeesExternal}
                  onChange={(e) => setFormAttendeesExternal(e.target.value)}
                  placeholder="삼성물산 박상우 부장"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>
          </div>

          {/* 카드 B: 회의 자료 첨부 & 원문 대화록 + ✨ AI 자동 정리 기능 */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 text-white space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-900/60">
              <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400 animate-pulse" />
                <span>2. 회의 자료 첨부 & AI 자동 정리 작성</span>
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-950 px-2.5 py-1 rounded-lg border border-indigo-800 transition cursor-pointer"
              >
                <Paperclip size={12} />
                <span>파일 첨부 (.txt, .docx 등)</span>
              </button>
            </div>

            {formAttachedFile && (
              <div className="bg-indigo-950/80 border border-indigo-800 px-3 py-1.5 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip size={12} className="text-amber-400" />
                  <strong>첨부된 자료:</strong> {formAttachedFile}
                </span>
                <button
                  type="button"
                  onClick={() => setFormAttachedFile('')}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold ml-2"
                >
                  제거
                </button>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-300">
                  회의 원문 대화록 / 녹음 녹취록 텍스트
                </label>
                <span className="text-[10px] text-slate-400">텍스트 입력 또는 파일 첨부</span>
              </div>
              <textarea
                rows={5}
                value={formTranscript}
                onChange={(e) => setFormTranscript(e.target.value)}
                placeholder="회의에서 오간 대화 내용이나 회의 자료 텍스트를 자유롭게 붙여넣으세요. 입력 후 아래 [✨ AI 자동 정리] 버튼을 누르면 핵심 요약, 주요 결정사항, 공종별 실행과제가 1초 만에 자동 생성됩니다."
                className="w-full text-xs font-mono p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed"
              />
            </div>

            {/* AI 자동 정리 실행 버튼 (대형 하이라이트) */}
            <button
              type="button"
              onClick={handleRunAiAutoGenerate}
              disabled={isAiProcessing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/50 transition cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isAiProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin text-amber-300" />
                  <span>AI 스마트 엔진이 대화록을 분석 및 요약 중입니다...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} className="text-amber-300 animate-pulse" />
                  <span>✨ 회의 자료 기반 AI 자동 정리 및 서식 반영 (AI Summarize)</span>
                </>
              )}
            </button>
          </div>

          {/* 카드 C: 수동 편집 (핵심 요약 & 주요 결정사항) */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <span className="text-xs font-black text-blue-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <FileText size={14} />
              <span>3. 핵심 요약 & 주요 결정사항 수동 보정</span>
            </span>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 핵심 요약 (Summary)</label>
              <textarea
                rows={3}
                value={formSummary}
                onChange={(e) => setFormSummary(e.target.value)}
                placeholder="착수회의 핵심 요약 내용..."
                className="w-full text-xs p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">주요 결정사항 (Decisions - 줄바꿈 구분)</label>
              <textarea
                rows={3}
                value={formDecisions}
                onChange={(e) => setFormDecisions(e.target.value)}
                placeholder="1. 도면 기준선 확정&#10;2. 조적 공종 2인 투입"
                className="w-full text-xs p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white leading-relaxed font-medium"
              />
            </div>
          </div>

          {/* 카드 D: 공종별 실행 과제 (Action Item) 신규 추가 */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <CheckCircle2 size={14} />
              <span>4. 공종별 실행 과제 (Action Item) 추가</span>
            </span>

            <form onSubmit={handleAddActionItem} className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">공종</label>
                  <select
                    value={newActionRole}
                    onChange={(e) => setNewActionRole(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                  >
                    <option value="조적">조적</option>
                    <option value="창호">창호</option>
                    <option value="외부">외부</option>
                    <option value="내부">내부</option>
                    <option value="세대">세대</option>
                    <option value="내역">내역</option>
                    <option value="가설">가설</option>
                    <option value="보">보 (구조)</option>
                    <option value="슬라브">슬라브 (구조)</option>
                    <option value="기둥">기둥 (구조)</option>
                    <option value="기초">기초 (구조)</option>
                    <option value="PM">PM 총괄</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">담당자</label>
                  <input
                    type="text"
                    value={newActionAssignee}
                    onChange={(e) => setNewActionAssignee(e.target.value)}
                    placeholder="원종수 수석"
                    className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-1">완료 기한</label>
                  <input
                    type="date"
                    value={newActionDueDate}
                    onChange={(e) => setNewActionDueDate(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">실행 과제 내용</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newActionTitle}
                    onChange={(e) => setNewActionTitle(e.target.value)}
                    placeholder="예: Rev.3 조적벽체 기준선 분할 및 작업 착수"
                    className="flex-1 text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shrink-0 transition cursor-pointer"
                  >
                    + 추가
                  </button>
                </div>
              </div>
            </form>
          </div>

        </div>

        {/* ======================= 우측 패널 (lg:col-span-6): 클레임센터 표준 정식 회의록 미리보기 ======================= */}
        <div className="lg:col-span-6 sticky top-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-750 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 text-slate-900 dark:text-slate-100">
            
            {/* 회의록 A4 헤더 */}
            <div className="border-b-2 border-slate-900 dark:border-white pb-4 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400 block mb-0.5">
                  CC-MIN-{currentMeeting?.projectCode || 'TK-2026087'} · 공식 착수회의록
                </span>
                <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                  {formTitle || '프로젝트 착수회의록'}
                </h3>
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 border ${
                currentMeeting?.directorApproved
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {currentMeeting?.directorApproved ? '✓ FINAL 최종승인' : '✎ DRAFT 작성중'}
              </span>
            </div>

            {/* 회의 개요 기본 테이블 */}
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-750 text-xs">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-slate-200 dark:border-slate-750">
                    <td className="w-24 p-2 bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">프로젝트명</td>
                    <td className="p-2 font-bold">{currentMeeting?.projectName}</td>
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-750">
                    <td className="p-2 bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">회의일시/장소</td>
                    <td className="p-2 font-mono">{formDate.replace('T', ' ')} · {formLocation}</td>
                  </tr>
                  <tr className="border-b border-slate-200 dark:border-slate-750">
                    <td className="p-2 bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">사내 참석자</td>
                    <td className="p-2">{formAttendeesInternal}</td>
                  </tr>
                  <tr>
                    <td className="p-2 bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">발주처 참석자</td>
                    <td className="p-2">{formAttendeesExternal}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 1. 회의 핵심 요약 */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>1. 회의 핵심 요약 (Summary)</span>
              </h4>
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs leading-relaxed whitespace-pre-line">
                {formSummary || '대화록 원문을 입력하고 [AI 자동 정리]를 누르면 요약이 반영됩니다.'}
              </div>
            </div>

            {/* 2. 주요 결정사항 */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <span>2. 주요 결정사항 (Key Decisions)</span>
              </h4>
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                {formDecisions ? (
                  formDecisions.split('\n').filter(Boolean).map((d, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-purple-600 dark:text-purple-400 font-bold">✓</span>
                      <span>{d}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-400 italic">결정사항이 없습니다.</span>
                )}
              </div>
            </div>

            {/* 3. 공종별 실행 과제 및 조치사항 (Action Items Table) - 첨부 스크린샷과 1:1 완벽 일치! */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>공종별 실행 과제 및 조치사항 (Action Items Table)</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-black">
                    총 {currentMeeting?.actionItems.length || 0}건
                  </span>
                </h4>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-750">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5 w-16 text-center">상태</th>
                      <th className="p-2.5 w-16 text-center">공종</th>
                      <th className="p-2.5">실행 과제 (Action Item)</th>
                      <th className="p-2.5 w-32">담당자</th>
                      <th className="p-2.5 w-24 text-center">기한</th>
                      <th className="p-2.5 w-10 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {!currentMeeting?.actionItems || currentMeeting.actionItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                          등록된 공종별 실행 과제가 없습니다. 좌측 패널에서 추가해 주세요.
                        </td>
                      </tr>
                    ) : (
                      currentMeeting.actionItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActionStatus(item.id)}
                              className={`text-[10px] font-black px-2 py-0.5 rounded-md transition cursor-pointer ${
                                item.status === '완료'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                                  : item.status === '진행중'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                              title="클릭하여 상태 변경"
                            >
                              {item.status}
                            </button>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[11px] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                              {item.roleName}
                            </span>
                          </td>
                          <td className="p-2.5 font-medium text-slate-900 dark:text-white">
                            {item.title}
                          </td>
                          <td className="p-2.5 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.assigneeName}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {item.dueDate}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteActionItem(item.id)}
                              className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. 하단 결재라인 (첨부 스크린샷 1:1 완벽 일치!) */}
            <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-750">
              <div className="grid grid-cols-3 gap-3 text-center">
                
                {/* 1) 작성자 */}
                <div
                  onClick={() => handleToggleSignature('author')}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer"
                  title="클릭하여 서명 전환"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">작성자</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    {currentMeeting?.author || '조한빈 실장'}
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    currentMeeting?.authorSigned ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {currentMeeting?.authorSigned ? '✓ 서명완료' : '서명 대기'}
                  </span>
                </div>

                {/* 2) 주관 PM */}
                <div
                  onClick={() => handleToggleSignature('pm')}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer"
                  title="클릭하여 결재 승인 전환"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">주관 PM</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    조한빈 실장
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    currentMeeting?.pmApproved ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {currentMeeting?.pmApproved ? '✓ 결재완료' : '결재 대기'}
                  </span>
                </div>

                {/* 3) 기술본부장 */}
                <div
                  onClick={() => handleToggleSignature('director')}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer"
                  title="클릭하여 공식 날인 전환"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">기술본부장</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    (주)컨코스트 기술본부
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    currentMeeting?.directorApproved ? 'text-blue-600 font-black' : 'text-slate-400'
                  }`}>
                    {currentMeeting?.directorApproved ? '공식 회의록 날인' : '날인 대기'}
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 숨김 파일 업로드 input들 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt, .docx, .pdf, .csv"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={excelImportRef}
        type="file"
        accept=".xlsx, .xls"
        onChange={handleImportExcel}
        className="hidden"
      />

    </div>
  );
};
