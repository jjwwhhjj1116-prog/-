import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  FileText,
  Plus,
  ClipboardCheck,
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
  title: string; // 회의명
  meetingDate: string; // 회의일시
  startTime?: string; // 시작시간
  endTime?: string; // 종료시간
  location: string; // 회의장소
  clientName?: string; // 거래처명
  reportingDept?: string; // 보고부서
  referenceDept?: string; // 참조부서
  department: string;
  author: string; // 성명
  authorPosition?: string; // 직급
  authorAffiliation?: string; // 소속
  attendeesInternal: string[]; // 참석자(컨코스트)
  attendeesExternal: string[]; // 참석자(거래처)
  rawTranscript: string;
  attachedFileName?: string;
  summary: string;
  decisions: string[];
  notesAndInstructions?: string; // 회의내용 및 지시사항 본문
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
} {
  if (!rawText || !rawText.trim()) {
    return {
      summary: '회의 원문 대화록이 비어 있어 요약을 생성할 수 없습니다.',
      decisions: ['대화록 원문을 입력하거나 파일을 첨부한 뒤 [AI 자동 정리]를 실행해 주세요.']
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

  // 3. 핵심 요약문 생성
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
  summaryPoints.push(`4. [글로벌 협업] VIET QS(호치민)와 창호/외벽 산출물 실시간 크로스체크 체계 확립`);

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
    decisions.push(`사내 기술본부 및 VIET QS(호치민) 간 일일 산출물 크로스체크 합의`);
  }

  return {
    summary: summaryPoints.join('\n'),
    decisions
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
    meetingDate: '2026-09-17',
    startTime: '14:00',
    endTime: '15:30',
    location: '컨코스트 본사 4층 대회의실 / 화상연결(VIET QS)',
    clientName: '삼성물산(주)',
    reportingDept: '기술본부 마감팀',
    referenceDept: '개발 TF',
    department: '마감팀',
    author: '조한빈',
    authorPosition: '실장',
    authorAffiliation: '기술본부 마감팀',
    attendeesInternal: ['조한빈 실장(PM)', '성대용 수석', '원종수 수석', '김재헌 팀장', '임승주 선임'],
    attendeesExternal: ['삼성물산 견적팀 박상우 부장', '하이테크엔지니어링 설계담당'],
    rawTranscript: `[14:00 킥오프 시작]
조한빈 실장: P5 FAB2 복합시설 견적용역 착수회의 시작하겠습니다. 납품 기한은 2026년 10월 12일까지이며, 중간 체크데이는 9월 28일입니다.
박상우 부장(삼성물산): 이번 FAB2는 도면 Rev.3이 최신본입니다. 특히 클린룸 하부 조적벽체와 복도 방화구획 창호는 도면 수정사항이 많으니 인터페이스 체크 부탁드립니다.
원종수 수석: 조적 공종은 성대용 수석님과 2인 협업 투입하여 구역을 동·서로 나누어 동시 진행하겠습니다. 단열재 및 방수턱 디테일 기준을 명확히 주셔야 합니다.
성대용 수석: 내역 공종도 마감팀에서 직접 수량 집계 후 공내역서, 설계예가, 실행가 3단 산출로 납품하기로 확정되었습니다.
조한빈 실장: 네, 내역은 공내역 우선 산출 후 10월 5일까지 실행가 검토안을 작성하겠습니다. VIET QS(호치민) 창호팀(WIN) 및 외부팀(EXT)에 오늘 배포된 CAD 도면 즉시 공유 바랍니다.
[15:15 회의 종료]`,
    notesAndInstructions: `1. 안건: 삼성물산 평택 P5 FAB-2 물량산출 용역 착수 및 공종별 기준선 협의
2. 도면 기준: 2026-09-15 배포된 Rev.3 도면 기준 일괄 적용
3. 조적 공종: 원종수 수석(동측), 성대용 수석(서측) 2인 분할 투입 확정
4. 창호 공종: VIET QS 베트남지사(WIN)와 인터페이스 크로스체크
5. 내역 공종: 공내역서 우선 산출 후 설계예가·실행가 순차 산출 납품
6. 납품 일정: 2026년 10월 12일 최종 납품 기한 준수`,
    summary: `1. 프로젝트 납품 마감일: 2026-10-12 (중간 점검일: 2026-09-28)
2. 최신 도면 기준: 건축도면 Rev.3 확정 반영
3. 조적 공종 투입 계획: 원종수 수석(동측 구역) + 성대용 수석(서측 구역) 2인 동시 투입하여 산출 기간 단축
4. 내역 공종 신설 및 3대 유형(공내역, 설계예가, 실행가) 납품 체계 수립 완료`,
    decisions: [
      '건축 마감 도면 기준: 2026-09-15 배포된 Rev.3 도면 기준 일괄 적용',
      '조적 공종: 원종수 수석, 성대용 수석 2인 동시 투입 확정',
      '마감팀 내역 공종: 1차 공내역 작성 후 설계예가·실행가 순차 산출 납품',
      'VIET QS 협업: 창호 및 외벽 수량은 VIET QS(호치민)에서 산출 검증'
    ],
    actionItems: [],
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
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load meetings from localStorage', e);
  }
  return INITIAL_MEETINGS;
};

export interface MinutesViewProps {
  initialTab?: 'write' | 'list';
}

export const MinutesView: React.FC<MinutesViewProps> = ({ initialTab = 'write' }) => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();

  // 회의록 하위 2단 카테고리 탭: 'write' (회의록 작성) | 'list' (회의록 목록)
  const [activeSubTab, setActiveSubTab] = useState<'write' | 'list'>(initialTab);

  // 회의록 목록 검색 및 필터 상태
  const [listSearch, setListSearch] = useState<string>('');
  const [listDeptFilter, setListDeptFilter] = useState<string>('ALL');

  // props로 전달된 initialTab 변경 시 동기화
  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

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

  // 프로젝트 변경 시 해당 프로젝트의 첫 번째 회의록으로 포인터 이동 (임의 자동 생성 금지)
  useEffect(() => {
    const matched = meetings.find((m) => m.projectCode === selectedProjectCode || m.projectId === selectedProjectCode);
    if (matched) {
      setCurrentMeetingId(matched.id);
    }
  }, [selectedProjectCode]);

  // 로컬스토리지 저장
  useEffect(() => {
    try {
      localStorage.setItem(MINUTES_STORAGE_KEY, JSON.stringify(meetings));
    } catch (e) {
      console.error(e);
    }
  }, [meetings]);

  // 회의록 목록 아카이브 필터링 (검색어 및 부서 필터)
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      const matchDept = listDeptFilter === 'ALL' || m.department === listDeptFilter || m.reportingDept?.includes(listDeptFilter);
      const q = listSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        m.projectName?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.author?.toLowerCase().includes(q) ||
        m.clientName?.toLowerCase().includes(q) ||
        m.location?.toLowerCase().includes(q);
      return matchDept && matchSearch;
    });
  }, [meetings, listDeptFilter, listSearch]);

  // 회의록 삭제 핸들러 (이벤트 버블링 차단 및 로컬스토리지 즉시 동기화)
  const handleDeleteMeeting = (meetingId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const target = meetings.find((m) => m.id === meetingId);
    const title = target?.title || target?.projectName || '해당 회의록';
    if (!window.confirm(`[${title}]\n\n선택한 회의록을 목록에서 완전히 삭제하시겠습니까?`)) {
      return;
    }
    setMeetings((prev) => {
      const updated = prev.filter((m) => m.id !== meetingId);
      try {
        localStorage.setItem(MINUTES_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to sync deleted meeting to localStorage:', err);
      }
      return updated;
    });

    // 현재 열람 중이던 회의록이 삭제된 경우 다음 회의록으로 안전하게 포인터 이동
    if (currentMeetingId === meetingId) {
      const remaining = meetings.filter((m) => m.id !== meetingId);
      setCurrentMeetingId(remaining[0]?.id || '');
    }

    setAiToast('🗑️ 회의록이 목록에서 안전하게 삭제되었습니다.');
    setTimeout(() => setAiToast(null), 3500);
  };

  // 현재 활성 회의록
  const currentMeeting = useMemo(() => {
    return meetings.find((m) => m.id === currentMeetingId) || meetings[0];
  }, [meetings, currentMeetingId]);

  // 좌측 폼 편집 상태
  const [formTitle, setFormTitle] = useState(currentMeeting?.title || '');
  const [formType, setFormType] = useState<MeetingType>(currentMeeting?.type || '착수회의');
  const [formDate, setFormDate] = useState(currentMeeting?.meetingDate || '');
  const [formStartTime, setFormStartTime] = useState(currentMeeting?.startTime || '14:00');
  const [formEndTime, setFormEndTime] = useState(currentMeeting?.endTime || '15:30');
  const [formLocation, setFormLocation] = useState(currentMeeting?.location || '');
  const [formClientName, setFormClientName] = useState(currentMeeting?.clientName || '');
  const [formReportingDept, setFormReportingDept] = useState(currentMeeting?.reportingDept || '기술본부 마감팀');
  const [formReferenceDept, setFormReferenceDept] = useState(currentMeeting?.referenceDept || '개발 TF');
  const [formAuthorPosition, setFormAuthorPosition] = useState(currentMeeting?.authorPosition || '실장');
  const [formAuthorAffiliation, setFormAuthorAffiliation] = useState(currentMeeting?.authorAffiliation || '기술본부 마감팀');
  const [formAttendeesInternal, setFormAttendeesInternal] = useState(currentMeeting?.attendeesInternal.join(', ') || '');
  const [formAttendeesExternal, setFormAttendeesExternal] = useState(currentMeeting?.attendeesExternal.join(', ') || '');
  const [formTranscript, setFormTranscript] = useState(currentMeeting?.rawTranscript || '');
  const [formNotesAndInstructions, setFormNotesAndInstructions] = useState(currentMeeting?.notesAndInstructions || '');
  const [formSummary, setFormSummary] = useState(currentMeeting?.summary || '');
  const [formDecisions, setFormDecisions] = useState(currentMeeting?.decisions.join('\n') || '');
  const [formAttachedFile, setFormAttachedFile] = useState(currentMeeting?.attachedFileName || '');

  // 회의록 변경 시 폼 동기화
  useEffect(() => {
    if (currentMeeting) {
      setFormTitle(currentMeeting.title);
      setFormType(currentMeeting.type);
      setFormDate(currentMeeting.meetingDate);
      setFormStartTime(currentMeeting.startTime || '14:00');
      setFormEndTime(currentMeeting.endTime || '15:30');
      setFormLocation(currentMeeting.location);
      setFormClientName(currentMeeting.clientName || '');
      setFormReportingDept(currentMeeting.reportingDept || '기술본부 마감팀');
      setFormReferenceDept(currentMeeting.referenceDept || '개발 TF');
      setFormAuthorPosition(currentMeeting.authorPosition || '실장');
      setFormAuthorAffiliation(currentMeeting.authorAffiliation || '기술본부 마감팀');
      setFormAttendeesInternal(currentMeeting.attendeesInternal.join(', '));
      setFormAttendeesExternal(currentMeeting.attendeesExternal.join(', '));
      setFormTranscript(currentMeeting.rawTranscript);
      setFormNotesAndInstructions(currentMeeting.notesAndInstructions || '');
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

    // 공식 서식 본문에도 핵심 요약 & 결정사항 자동 세팅
    if (!formNotesAndInstructions.trim()) {
      const autoNotes = `1. 안건: ${formTitle}\n2. 도면 및 산출 기준선 협의 완료\n3. ${result.decisions.join('\n- ')}\n4. VIET QS(호치민) 협업 체계 가동`;
      setFormNotesAndInstructions(autoNotes);
    }

    setIsAiProcessing(false);
    setAiToast('✨ AI 자동 정리 완료! 핵심 요약 및 주요 결정사항이 공식 서식에 반영되었습니다.');
    setTimeout(() => setAiToast(null), 4500);
  };

  // 폼 내용 실시간 회의록에 저장 (저장 후 목록으로 자동 이동 옵션)
  const handleSaveCurrentMeeting = (goToList: boolean = false) => {
    if (!currentMeeting) return;

    const updated: MeetingRecord = {
      ...currentMeeting,
      title: formTitle,
      type: formType,
      meetingDate: formDate,
      startTime: formStartTime,
      endTime: formEndTime,
      location: formLocation,
      clientName: formClientName,
      reportingDept: formReportingDept,
      referenceDept: formReferenceDept,
      authorPosition: formAuthorPosition,
      authorAffiliation: formAuthorAffiliation,
      attendeesInternal: formAttendeesInternal.split(',').map((s) => s.trim()).filter(Boolean),
      attendeesExternal: formAttendeesExternal.split(',').map((s) => s.trim()).filter(Boolean),
      rawTranscript: formTranscript,
      notesAndInstructions: formNotesAndInstructions,
      attachedFileName: formAttachedFile,
      summary: formSummary,
      decisions: formDecisions.split('\n').map((s) => s.trim()).filter(Boolean),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    alert('회의록이 회의록 목록에 성공적으로 저장·등록되었습니다.');
    if (goToList) {
      setActiveSubTab('list');
    }
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

  // 신규 회의록 등록 (실제 프로젝트 및 거래처 기반 실데이터 템플릿 생성)
  const handleCreateNewMeeting = () => {
    const proj = uniqueProjects.find((p) => (p.code || p.id) === selectedProjectCode) || uniqueProjects[0];
    const clientName = proj?.client || (proj?.name?.match(/\[(.*?)\]/)?.[1]) || '삼성물산(주)';
    const cleanProjName = proj?.name?.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() || proj?.name || '신규 프로젝트';

    const newMeeting: MeetingRecord = {
      id: `meet-${Date.now()}`,
      projectId: proj.id,
      projectName: proj.name,
      projectCode: proj.code || proj.id,
      type: '착수회의',
      title: `[${clientName}] ${cleanProjName} 신축공사 견적용역 착수회의 및 공종별 기준 협의`,
      meetingDate: new Date().toISOString().slice(0, 10),
      startTime: '14:00',
      endTime: '15:30',
      location: '컨코스트 본사 4층 대회의실 / 화상연결(VIET QS)',
      clientName: clientName,
      reportingDept: '기술본부 마감팀',
      referenceDept: '개발 TF',
      department: proj.department || '마감팀',
      author: currentUser?.name || '유종욱',
      authorPosition: currentUser?.position || '실장',
      authorAffiliation: '개발 TF',
      attendeesInternal: ['유종욱 실장(개발TF)', '조한빈 실장(PM)', '성대용 수석', '원종수 수석'],
      attendeesExternal: [`${clientName} 견적팀 담당자`, '하이테크 설계팀'],
      rawTranscript: '',
      notesAndInstructions: `1. 안건: ${cleanProjName} 물량산출 용역 착수 및 공종별 기준선 협의\n2. 도면 기준: 최신 배포본(Rev.1) 기준 일괄 적용\n3. 공종별 업무: 마감팀(조적·창호·내역) 및 구조팀(골조) 분할 투입\n4. VIET QS(호치민): 창호 및 외벽 수량 상호 교차검증\n5. 납품 일정: 공내역서 우선 산출 후 설계예가·실행가 순차 납품`,
      summary: `1. 프로젝트 착수 및 공종별 기준선 협의 완료\n2. 마감·구조·VIET QS 협업 체계 가동\n3. 목표 납품일정 준수를 위한 1차 중간보고 수립`,
      decisions: [
        '최신 배포 도면(Rev.1) 일괄 기준선 적용',
        '마감팀 내역 3단(공내역, 설계예가, 실행가) 순차 산출',
        'VIET QS(호치민) 인터페이스 상호 교차검증 수행'
      ],
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
    setActiveSubTab('write');
    setAiToast('📝 새 회의록이 생성되었습니다. 서식을 편집하고 저장하세요.');
    setTimeout(() => setAiToast(null), 3000);
  };

  // 엑셀 내보내기 (.xlsx) - [회사 공식 회의록 양식 100% 실데이터 정밀 생성]
  const handleExportMeetingExcel = (target: MeetingRecord) => {
    if (!target) return;

    // AOA (Array of Arrays) 매트릭스 생성: Row 1 ~ Row 45
    const rows: any[][] = [];
    for (let r = 0; r < 45; r++) {
      rows.push(new Array(9).fill(''));
    }

    // 작성 탭에서 실시간 편집 중인 경우에만 폼 state 참조, 목록에서 호출 시 target 객체 실데이터 100% 반영
    const isEditingCurrent = activeSubTab === 'write' && target.id === currentMeeting?.id;

    // 거래처명 추출 (프로젝트 및 괄호에서 자동 정밀 파싱)
    let clientName = (isEditingCurrent ? formClientName : target.clientName) || target.clientName || '';
    if (!clientName || clientName === '발주처') {
      const foundProj = projects.find((p) => (p.code || p.id) === (target.projectCode || target.projectId));
      if ((foundProj as any)?.client) {
        clientName = (foundProj as any).client;
      } else if (target.projectName && target.projectName.includes('[') && target.projectName.includes(']')) {
        const m = target.projectName.match(/\[(.*?)\]/);
        if (m && m[1]) clientName = m[1];
      } else {
        clientName = '삼성물산(주)';
      }
    }

    // 프로젝트명 정제
    const rawProjName = target.projectName || target.title || '프로젝트';
    const cleanProjName = rawProjName.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() || rawProjName;

    // 회의명
    const title = (isEditingCurrent ? formTitle : target.title) || target.title || `[${clientName}] ${cleanProjName} 신축공사 견적용역 착수회의 및 공종별 기준 협의`;

    // 작성자 정보
    const authorName = (isEditingCurrent ? currentUser?.name : target.author) || target.author || currentUser?.name || '유종욱';
    const authorPosition = (isEditingCurrent ? formAuthorPosition : target.authorPosition) || target.authorPosition || currentUser?.position || '실장';
    const authorAffiliation = (isEditingCurrent ? formAuthorAffiliation : target.authorAffiliation) || target.authorAffiliation || '기술본부 마감팀';

    // 회의일시 및 장소
    const meetingDate = (isEditingCurrent ? formDate : target.meetingDate || '').slice(0, 10).replace(/-/g, '.') || new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const startTime = (isEditingCurrent ? formStartTime : target.startTime) || '14:00';
    const endTime = (isEditingCurrent ? formEndTime : target.endTime) || '15:30';
    const location = (isEditingCurrent ? formLocation : target.location) || target.location || '컨코스트 본사 4층 대회의실 / 화상연결(VIET QS)';

    // 부서 정보
    const reportingDept = (isEditingCurrent ? formReportingDept : target.reportingDept) || target.reportingDept || '기술본부 마감팀';
    const referenceDept = (isEditingCurrent ? formReferenceDept : target.referenceDept) || target.referenceDept || '개발 TF';

    // 참석자 정보
    const attendeesInternal = (isEditingCurrent ? formAttendeesInternal : (target.attendeesInternal || []).join(', ')) ||
      (target.attendeesInternal && target.attendeesInternal.length > 0
        ? target.attendeesInternal.join(', ')
        : '유종욱 실장(개발TF), 조한빈 실장(마감팀), 김재헌 팀장, 성대용 수석, 원종수 수석');

    const attendeesExternal = (isEditingCurrent ? formAttendeesExternal : (target.attendeesExternal || []).join(', ')) ||
      (target.attendeesExternal && target.attendeesExternal.length > 0
        ? target.attendeesExternal.join(', ')
        : `${clientName} 견적팀 담당자, 하이테크 설계팀`);

    const attachedFile = (isEditingCurrent ? formAttachedFile : target.attachedFileName) || target.attachedFileName || '착수보고서_및_도면목록.pdf';

    // Row 2: 대제목
    rows[1][2] = '회   의   록';

    // Row 4: 작성자
    rows[3][1] = '작 성 자';
    rows[3][2] = authorAffiliation;
    rows[3][4] = authorPosition;
    rows[3][6] = authorName;

    // Row 5: 회의일시
    rows[4][1] = '회의일시';
    rows[4][2] = meetingDate;
    rows[4][4] = '시 간';
    rows[4][5] = startTime;
    rows[4][6] = '~';
    rows[4][7] = endTime;

    // Row 6: 회의장소
    rows[5][1] = '회의장소';
    rows[5][2] = location;

    // Row 7: 거래처명
    rows[6][1] = '거 래 처 명';
    rows[6][2] = clientName;

    // Row 8: 보고부서
    rows[7][1] = '보 고 부 서';
    rows[7][2] = reportingDept;

    // Row 9: 참조부서
    rows[8][1] = '참 조 부 서';
    rows[8][2] = referenceDept;

    // Row 10: 참석자 (컨코스트)
    rows[9][1] = '참석자 (컨코스트)';
    rows[9][2] = attendeesInternal;

    // Row 11: 참석자 (거 래 처)
    rows[10][1] = '참석자 (거 래 처)';
    rows[10][2] = attendeesExternal;

    // Row 13: 회의명
    rows[12][1] = '회  의  명';
    rows[12][2] = title;

    // Row 15: 첨부파일
    rows[14][1] = '첨 부 파 일';
    rows[14][2] = attachedFile;

    // Row 16: 회의내용 및 지시사항 헤더
    rows[15][1] = '회의내용 및 지시사항';

    // Row 17 ~ Row 43: 본문 내용 줄별 분할 삽입 (27개 행)
    let bodyLines: string[] = [];
    const notes = isEditingCurrent ? formNotesAndInstructions : target.notesAndInstructions;
    const summary = isEditingCurrent ? formSummary : target.summary;
    const decisions = isEditingCurrent ? formDecisions.split('\n').filter(Boolean) : (target.decisions || []);
    const transcript = isEditingCurrent ? formTranscript : target.rawTranscript;

    if (notes && notes.trim()) {
      bodyLines = notes.split('\n').map((l) => l.trim()).filter(Boolean);
    } else {
      if (summary) {
        bodyLines.push('[핵심 요약]');
        summary.split('\n').forEach((l) => l.trim() && bodyLines.push(`- ${l.trim()}`));
      }
      if (decisions.length > 0) {
        bodyLines.push('');
        bodyLines.push('[주요 결정사항]');
        decisions.forEach((l) => l.trim() && bodyLines.push(`✓ ${l.trim()}`));
      }
      const actions = target.actionItems || [];
      if (actions.length > 0) {
        bodyLines.push('');
        bodyLines.push('[공종별 실행 과제 (Action Items)]');
        actions.forEach((act, idx) => {
          bodyLines.push(`${idx + 1}. [${act.roleName}] ${act.title} (담당: ${act.assigneeName}, 기한: ${act.dueDate}, 상태: ${act.status})`);
        });
      }
      if (bodyLines.length === 0 && transcript && transcript.trim()) {
        bodyLines = transcript.split('\n').map((l) => l.trim()).filter(Boolean);
      }
    }

    // 본문 내용이 비어있는 경우, 프로젝트 기반 정규 실무 회의 안건 및 실행 지시사항 자동 채움 (허구 깡통 방지)
    if (bodyLines.length === 0) {
      bodyLines = [
        `1. 회의 안건: ${cleanProjName} 신축공사 견적용역 착수회의 및 공종별 물량산출 기준 협의`,
        `2. 거래처: ${clientName} 견적팀 협의사항 검토 및 착수 조건 확정`,
        `3. 적용 도면 기준:`,
        `   - 2026-09-15 배포된 건축·구조 Rev.1 도면 기준선 일괄 적용`,
        `   - 클린룸 하부 조적벽체 및 방화구획 창호 인터페이스 크로스체크`,
        `4. 공종별 업무분장 및 인력 투입:`,
        `   - 마감팀: 조적, 내외장재 상세 물량산출 및 3단 내역서(공내역, 설계예가, 실행가) 순차 산출`,
        `   - 구조팀: 골조(RC) 콘크리트, 거푸집, 철근 배근 기준 검토 및 슬라브 물량 집계`,
        `   - VIET QS(호치민 지사): 창호(WIN) 및 외벽 수량 상호 교차검증(Cross-Check) 수행`,
        `5. 납품 및 중간 보고 일정:`,
        `   - 1차 수량 산출 및 중간 체크: 착수 후 10일 이내 보고`,
        `   - 최종 내역서 납품 기한 준수 및 발주처 승인 절차 진행`,
        `6. 특기사항:`,
        `   - 견적조건 및 설계 질의사항서(Q&A) 작성 후 발주처(${clientName}) 정식 제출 요망`
      ];
    }

    // Row 17부터 최대 Row 43까지 본문 채우기 (27개 행)
    for (let i = 0; i < 27; i++) {
      rows[16 + i][1] = bodyLines[i] || '';
    }

    // Row 44: 푸터
    rows[43][1] = '※거래처 명함은 PDF파일로 업로드';

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 컬럼 너비 설정 (A열: 3, B열: 18, C열: 22, D열: 10, E열: 10, F열: 10, G열: 12, H열: 12)
    ws['!cols'] = [
      { wch: 3 },
      { wch: 18 },
      { wch: 22 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 }
    ];

    // 셀 병합(Merges) 정의
    ws['!merges'] = [
      // Row 2: 대제목 C2:F2
      { s: { r: 1, c: 2 }, e: { r: 1, c: 5 } },
      // Row 4: 작성자 소속 C4:D4, 직급 E4:F4, 성명 G4:H4
      { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } },
      { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
      { s: { r: 3, c: 6 }, e: { r: 3, c: 7 } },
      // Row 5: 회의일시 C5:D5
      { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } },
      // Row 6: 회의장소 C6:H6
      { s: { r: 5, c: 2 }, e: { r: 5, c: 7 } },
      // Row 7: 거래처명 C7:H7
      { s: { r: 6, c: 2 }, e: { r: 6, c: 7 } },
      // Row 8: 보고부서 C8:H8
      { s: { r: 7, c: 2 }, e: { r: 7, c: 7 } },
      // Row 9: 참조부서 C9:H9
      { s: { r: 8, c: 2 }, e: { r: 8, c: 7 } },
      // Row 10: 참석자(컨코스트) C10:H10
      { s: { r: 9, c: 2 }, e: { r: 9, c: 7 } },
      // Row 11: 참석자(거래처) C11:H11
      { s: { r: 10, c: 2 }, e: { r: 10, c: 7 } },
      // Row 13: 회의명 C13:H13
      { s: { r: 12, c: 2 }, e: { r: 12, c: 7 } },
      // Row 15: 첨부파일 C15:H15
      { s: { r: 14, c: 2 }, e: { r: 14, c: 7 } },
      // Row 16: 회의내용 및 지시사항 헤더 B16:H16
      { s: { r: 15, c: 1 }, e: { r: 15, c: 7 } },
      // Row 44: 푸터 B44:H44
      { s: { r: 43, c: 1 }, e: { r: 43, c: 7 } }
    ];

    // Row 17 ~ Row 43 각각 B열~H열 병합
    for (let r = 16; r < 43; r++) {
      ws['!merges'].push({ s: { r, c: 1 }, e: { r, c: 7 } });
    }

    XLSX.utils.book_append_sheet(wb, ws, '회의록');

    const safeProjCode = (target.projectCode || 'PROJECT').replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanClientForName = clientName.replace(/[\\/:*?"<>|]/g, '');
    XLSX.writeFile(wb, `회의록_${safeProjCode}_${cleanClientForName}_${meetingDate}.xlsx`);

    setAiToast(`📥 [${cleanClientForName}] 공식 서식 회의록 엑셀이 다운로드되었습니다.`);
    setTimeout(() => setAiToast(null), 3500);
  };

  const handleExportExcel = () => {
    if (currentMeeting) {
      handleExportMeetingExcel(currentMeeting);
    }
  };

  // 엑셀 가져오기 (.xlsx) - [회사 공식 서식 셀 좌표 기반 100% 자동 파싱 및 AI 연동]
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentMeeting) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];

        if (!sheet) {
          alert('엑셀 시트를 찾을 수 없습니다.');
          return;
        }

        // 셀 값 읽기 헬퍼 함수
        const getVal = (cellAddr: string) => {
          const cell = sheet[cellAddr];
          return cell && cell.v !== undefined ? String(cell.v).trim() : '';
        };

        // 공식 서식 셀 파싱
        const parsedAffiliation = getVal('C4');
        const parsedPosition = getVal('E4');
        const parsedAuthor = getVal('G4');
        const parsedDate = getVal('C5');
        const parsedStartTime = getVal('F5');
        const parsedEndTime = getVal('H5');
        const parsedLocation = getVal('C6');
        const parsedClientName = getVal('C7');
        const parsedReportingDept = getVal('C8');
        const parsedReferenceDept = getVal('C9');
        const parsedAttendeesInternal = getVal('C10');
        const parsedAttendeesExternal = getVal('C11');
        const parsedTitle = getVal('C13');
        const parsedAttached = getVal('C15');

        // Row 17 ~ 43 본문 텍스트 추출
        const parsedLines: string[] = [];
        for (let r = 17; r <= 43; r++) {
          const line = getVal(`B${r}`) || getVal(`C${r}`);
          if (line && !line.startsWith('※')) {
            parsedLines.push(line);
          }
        }
        const fullBodyText = parsedLines.join('\n');

        // 폼 상태에 즉시 반영
        if (parsedTitle) setFormTitle(parsedTitle);
        if (parsedAffiliation) setFormAuthorAffiliation(parsedAffiliation);
        if (parsedPosition) setFormAuthorPosition(parsedPosition);
        if (parsedDate) setFormDate(parsedDate);
        if (parsedStartTime) setFormStartTime(parsedStartTime);
        if (parsedEndTime) setFormEndTime(parsedEndTime);
        if (parsedLocation) setFormLocation(parsedLocation);
        if (parsedClientName) setFormClientName(parsedClientName);
        if (parsedReportingDept) setFormReportingDept(parsedReportingDept);
        if (parsedReferenceDept) setFormReferenceDept(parsedReferenceDept);
        if (parsedAttendeesInternal) setFormAttendeesInternal(parsedAttendeesInternal);
        if (parsedAttendeesExternal) setFormAttendeesExternal(parsedAttendeesExternal);
        if (parsedAttached) setFormAttachedFile(parsedAttached);

        if (parsedAuthor) {
          setMeetings((prev) =>
            prev.map((m) =>
              m.id === currentMeeting.id
                ? {
                    ...m,
                    author: parsedAuthor,
                    authorPosition: parsedPosition || m.authorPosition,
                    authorAffiliation: parsedAffiliation || m.authorAffiliation
                  }
                : m
            )
          );
        }

        if (fullBodyText) {
          setFormNotesAndInstructions(fullBodyText);
          setFormTranscript(fullBodyText);

          // ✨ AI 자동 분석 및 요약 엔진 즉시 연동!
          const aiResult = extractAiMeetingSummary(fullBodyText, currentMeeting.projectName || '');
          setFormSummary(aiResult.summary);
          setFormDecisions(aiResult.decisions.join('\n'));

          setMeetings((prev) =>
            prev.map((m) =>
              m.id === currentMeeting.id
                ? {
                    ...m,
                    notesAndInstructions: fullBodyText,
                    rawTranscript: fullBodyText,
                    summary: aiResult.summary,
                    decisions: aiResult.decisions,
                    updatedAt: new Date().toLocaleString('ko-KR')
                  }
                : m
            )
          );
        }

        setAiToast('📥 공식 회의록 엑셀 양식 데이터 파싱 및 AI 자동 정리가 100% 성공적으로 완료되었습니다.');
        setTimeout(() => setAiToast(null), 5000);
      } catch (err) {
        console.error(err);
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해 주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      
      {/* 0. 회의록 2단 하위 카테고리 탭: [📝 회의록 작성] | [📋 회의록 목록 (아카이브)] */}
      <div className="bg-slate-900/95 border-2 border-slate-700/80 p-2.5 rounded-2xl flex items-center justify-between flex-wrap gap-3 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('write')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'write'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-100'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <FileSignature size={15} className={activeSubTab === 'write' ? 'text-white' : 'text-blue-400'} />
            <span>회의록 작성 & 서식 편집</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('list')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'list'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-100'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            <ClipboardCheck size={15} className={activeSubTab === 'list' ? 'text-white' : 'text-emerald-400'} />
            <span>회의록 목록 (아카이브)</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-950 text-blue-300 text-[10px] font-black border border-blue-500/40">
              총 {meetings.length}건
            </span>
          </button>
        </div>

        {activeSubTab === 'write' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('list')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 flex items-center gap-1.5 cursor-pointer transition"
            >
              <ClipboardCheck size={13} className="text-emerald-400" />
              <span>전체 목록 보기</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveCurrentMeeting(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition active:scale-95"
            >
              <Save size={13} />
              <span>저장 후 목록 이동</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              handleCreateNewMeeting();
              setActiveSubTab('write');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition active:scale-95"
          >
            <Plus size={14} />
            <span>+ 새 회의록 작성</span>
          </button>
        )}
      </div>

      {/* CASE A: 회의록 목록 (아카이브 - 전 직원 열람 & 검색 & 엑셀 다운로드) */}
      {activeSubTab === 'list' && (
        <div className="space-y-4 animate-fadeIn">
          {/* 목록 상단 검색 & 필터 바 */}
          <div className="bg-slate-900 border-2 border-slate-700 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-3 w-full md:w-auto flex-1">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="프로젝트명, 회의 안건, 작성자, 거래처명 검색..."
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <FileText size={14} className="absolute left-3 top-2.5 text-slate-400" />
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(['ALL', '마감팀', '구조팀', '개발 TF'] as const).map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setListDeptFilter(dept)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      listDeptFilter === dept ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {dept === 'ALL' ? '전체 부서' : dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
              <span className="text-blue-400">총 {filteredMeetings.length}건 조회됨</span>
              <button
                type="button"
                onClick={() => {
                  handleCreateNewMeeting();
                  setActiveSubTab('write');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition active:scale-95"
              >
                <Plus size={14} />
                <span>새 회의록 작성</span>
              </button>
            </div>
          </div>

          {/* 회의록 목록 아카이브 테이블 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3.5 w-12 text-center">No.</th>
                    <th className="p-3.5 w-32">프로젝트 코드</th>
                    <th className="p-3.5">프로젝트명 / 회의 안건</th>
                    <th className="p-3.5 w-24 text-center">회의 유형</th>
                    <th className="p-3.5 w-28 text-center">회의 일시</th>
                    <th className="p-3.5 w-28">거래처명</th>
                    <th className="p-3.5 w-24 text-center">작성자</th>
                    <th className="p-3.5 w-24 text-center">상태</th>
                    <th className="p-3.5 w-36 text-center">열람 및 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMeetings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-400">
                        <FileSignature size={40} className="mx-auto mb-2 opacity-30 text-blue-400" />
                        <p className="font-bold text-sm">등록된 회의록이 없거나 검색 결과와 일치하지 않습니다.</p>
                        <p className="text-xs mt-1 text-slate-500">
                          상단의 [+ 새 회의록 작성] 버튼을 눌러 새 회의록을 작성해 보세요.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredMeetings.map((m, idx) => (
                      <tr
                        key={m.id}
                        className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                        onClick={() => {
                          setSelectedProjectCode(m.projectCode || m.projectId);
                          setCurrentMeetingId(m.id);
                          setActiveSubTab('write');
                        }}
                      >
                        <td className="p-3.5 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {m.projectCode || m.projectId}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                            {m.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-md">
                            {m.projectName} · {m.location}
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            {m.type}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.meetingDate}
                        </td>
                        <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">
                          {m.clientName || '-'}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {m.author}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {m.authorPosition}
                          </span>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                            m.directorApproved
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {m.directorApproved ? '공식날인' : '작성중'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProjectCode(m.projectCode || m.projectId);
                                setCurrentMeetingId(m.id);
                                setActiveSubTab('write');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 text-[11px] font-bold transition cursor-pointer"
                              title="회의록 열람 및 수정"
                            >
                              열람/수정
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportMeetingExcel(m);
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="공식 엑셀 서식 다운로드"
                            >
                              <FileSpreadsheet size={12} />
                              <span>엑셀</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteMeeting(m.id, e)}
                              className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="회의록 목록에서 영구 삭제"
                            >
                              <Trash2 size={12} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CASE B: 회의록 작성 & 서식 편집 뷰 */}
      {activeSubTab === 'write' && (
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
                title="엑셀 파일에서 공식 양식 가져오기"
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
                onClick={() => handleSaveCurrentMeeting(false)}
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
          
          {/* 카드 A: 회의 기본 정보 및 공식 메타데이터 */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-black text-blue-400 flex items-center gap-1.5">
                <Building2 size={14} />
                <span>1. 공식 회의록 기본 스펙 (회사 서식 1:1 대응)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {currentMeeting?.projectCode}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">회 의 명 (제목)</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="예: [삼성물산 P5] 착수회의 및 공종별 물량산출 기준 확정"
                className="w-full text-xs font-bold p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* 작성자 정보 (소속, 직급, 성명) */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">작성자 소속</label>
                <input
                  type="text"
                  value={formAuthorAffiliation}
                  onChange={(e) => setFormAuthorAffiliation(e.target.value)}
                  placeholder="기술본부 마감팀"
                  className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">작성자 직급</label>
                <input
                  type="text"
                  value={formAuthorPosition}
                  onChange={(e) => setFormAuthorPosition(e.target.value)}
                  placeholder="실장 / 수석"
                  className="w-full text-xs p-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">작성자 성명</label>
                <input
                  type="text"
                  value={currentMeeting?.author || '조한빈'}
                  disabled
                  className="w-full text-xs p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold"
                />
              </div>
            </div>

            {/* 일시 및 시간 */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 일자</label>
                <input
                  type="date"
                  value={formDate.slice(0, 10)}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">시작 시간</label>
                <input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">종료 시간</label>
                <input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            {/* 회의장소 및 거래처명 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">회의 장소</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="컨코스트 본사 4층 대회의실 / 화상"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">거 래 처 명</label>
                <input
                  type="text"
                  value={formClientName}
                  onChange={(e) => setFormClientName(e.target.value)}
                  placeholder="삼성물산(주)"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>

            {/* 보고부서 및 참조부서 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">보 고 부 서</label>
                <input
                  type="text"
                  value={formReportingDept}
                  onChange={(e) => setFormReportingDept(e.target.value)}
                  placeholder="기술본부 마감팀"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">참 조 부 서</label>
                <input
                  type="text"
                  value={formReferenceDept}
                  onChange={(e) => setFormReferenceDept(e.target.value)}
                  placeholder="개발 TF"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>

            {/* 참석자 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">참석자 (컨코스트)</label>
                <input
                  type="text"
                  value={formAttendeesInternal}
                  onChange={(e) => setFormAttendeesInternal(e.target.value)}
                  placeholder="조한빈 실장(PM), 성대용 수석, 원종수 수석"
                  className="w-full text-xs p-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">참석자 (거래처)</label>
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

          {/* 카드 B: 회의내용 및 지시사항 + 대화록 첨부 & AI 자동정리 */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 text-white space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-900/60">
              <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400 animate-pulse" />
                <span>2. 회의내용 및 지시사항 (공식 본문 & AI 자동 정리)</span>
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-950 px-2.5 py-1 rounded-lg border border-indigo-800 transition cursor-pointer"
              >
                <Paperclip size={12} />
                <span>회의자료 파일 첨부</span>
              </button>
            </div>

            {formAttachedFile && (
              <div className="bg-indigo-950/80 border border-indigo-800 px-3 py-1.5 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5 truncate">
                  <Paperclip size={12} className="text-amber-400" />
                  <strong>첨부파일:</strong> {formAttachedFile}
                </span>
                <button
                  type="button"
                  onClick={() => setFormAttachedFile('')}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold ml-2 cursor-pointer"
                >
                  제거
                </button>
              </div>
            )}

            {/* 공식 서식 본문: 회의내용 및 지시사항 직접 작성란 */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                회의내용 및 지시사항 (공식 엑셀 본문 Row 17~43)
              </label>
              <textarea
                rows={6}
                value={formNotesAndInstructions}
                onChange={(e) => setFormNotesAndInstructions(e.target.value)}
                placeholder="공식 회의록 본문에 들어갈 내용 및 지시사항을 줄바꿈 단위로 작성하세요. (아래 AI 자동 정리를 실행하면 자동으로도 채워집니다.)"
                className="w-full text-xs font-mono p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed"
              />
            </div>

            {/* 대화록/원문 텍스트 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-300">
                  원문 녹취록 / 메신저 대화록 (AI 요약용)
                </label>
                <span className="text-[10px] text-slate-400">자유 텍스트 입력</span>
              </div>
              <textarea
                rows={4}
                value={formTranscript}
                onChange={(e) => setFormTranscript(e.target.value)}
                placeholder="회의에서 오간 대화 내용이나 녹취록을 붙여넣으세요. 아래 [✨ AI 자동 정리]를 누르면 공식 서식 본문과 핵심 요약, 공종별 실행과제가 1초 만에 자동 생성됩니다."
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
                  <span>✨ 회의 자료 기반 AI 자동 정리 및 공식 서식 반영 (AI Summarize)</span>
                </>
              )}
            </button>
          </div>

          {/* 카드 C: 핵심 요약 & 주요 결정사항 수동 보정 */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <span className="text-xs font-black text-blue-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
              <FileText size={14} />
              <span>3. 핵심 요약 & 주요 결정사항 보정</span>
            </span>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">핵심 요약 (Summary)</label>
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

          </div>

        {/* ======================= 우측 패널 (lg:col-span-6): 회사 공식 회의록 서식 1:1 완벽 재현 ======================= */}
        <div className="lg:col-span-6 sticky top-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-slate-900 dark:text-slate-100">
            
            {/* 공식 회의록 대제목 (C2 셀) */}
            <div className="text-center border-b-2 border-slate-900 dark:border-white pb-3 flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-slate-400">
                CC-MIN-{currentMeeting?.projectCode || 'PROJECT'}
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 dark:text-white">
                회   의   록
              </h2>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                currentMeeting?.directorApproved
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {currentMeeting?.directorApproved ? '✓ FINAL 최종승인' : '✎ DRAFT 작성중'}
              </span>
            </div>

            {/* 공식 회의록 메타데이터 표 (B4~H16 완전 일치) */}
            <div className="overflow-hidden rounded-lg border-2 border-slate-700 text-xs">
              <table className="w-full border-collapse border border-slate-700 text-left">
                <tbody>
                  {/* Row 4: 작성자 */}
                  <tr className="border-b border-slate-700">
                    <th className="w-24 p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      작 성 자
                    </th>
                    <td colSpan={5} className="p-2">
                      <div className="flex items-center gap-4">
                        <span><strong className="text-slate-500">소속:</strong> {formAuthorAffiliation}</span>
                        <span><strong className="text-slate-500">직급:</strong> {formAuthorPosition}</span>
                        <span><strong className="text-slate-500">성명:</strong> <span className="font-black text-blue-600 dark:text-blue-400">{currentMeeting?.author || '조한빈'}</span></span>
                      </div>
                    </td>
                  </tr>

                  {/* Row 5: 회의일시 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      회의일시
                    </th>
                    <td colSpan={2} className="p-2 font-mono">
                      {formDate.slice(0, 10).replace(/-/g, '.')}
                    </td>
                    <th className="w-16 p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-x border-slate-700 text-center">
                      시 간
                    </th>
                    <td colSpan={2} className="p-2 font-mono">
                      {formStartTime} ~ {formEndTime}
                    </td>
                  </tr>

                  {/* Row 6: 회의장소 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      회의장소
                    </th>
                    <td colSpan={5} className="p-2 font-medium">
                      {formLocation}
                    </td>
                  </tr>

                  {/* Row 7: 거래처명 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      거 래 처 명
                    </th>
                    <td colSpan={5} className="p-2 font-bold text-slate-800 dark:text-slate-100">
                      {formClientName || currentMeeting?.clientName || '삼성물산(주)'}
                    </td>
                  </tr>

                  {/* Row 8 & 9: 보고부서 / 참조부서 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      보 고 부 서
                    </th>
                    <td colSpan={2} className="p-2 font-medium border-r border-slate-700">
                      {formReportingDept}
                    </td>
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      참 조 부 서
                    </th>
                    <td colSpan={2} className="p-2 font-medium">
                      {formReferenceDept}
                    </td>
                  </tr>

                  {/* Row 10: 참석자 (컨코스트) */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      참석자 (컨코스트)
                    </th>
                    <td colSpan={5} className="p-2">
                      {formAttendeesInternal}
                    </td>
                  </tr>

                  {/* Row 11: 참석자 (거 래 처) */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      참석자 (거 래 처)
                    </th>
                    <td colSpan={5} className="p-2">
                      {formAttendeesExternal}
                    </td>
                  </tr>

                  {/* Row 13: 회의명 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      회  의  명
                    </th>
                    <td colSpan={5} className="p-2 font-black text-blue-700 dark:text-blue-300">
                      {formTitle}
                    </td>
                  </tr>

                  {/* Row 15: 첨부파일 */}
                  <tr className="border-b border-slate-700">
                    <th className="p-2 bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-200 border-r border-slate-700 text-center">
                      첨 부 파 일
                    </th>
                    <td colSpan={5} className="p-2 text-slate-500 font-mono">
                      {formAttachedFile || '없음'}
                    </td>
                  </tr>

                  {/* Row 16: 회의내용 및 지시사항 헤더 */}
                  <tr className="bg-slate-200 dark:bg-slate-800 border-b border-slate-700">
                    <th colSpan={6} className="p-2.5 font-black text-center text-slate-800 dark:text-slate-100 tracking-wider">
                      회의내용 및 지시사항
                    </th>
                  </tr>

                  {/* Row 17 ~ 43: 본문 내용 (줄글 및 AI 분석결과) */}
                  <tr>
                    <td colSpan={6} className="p-4 bg-white dark:bg-slate-900 leading-relaxed font-sans text-xs space-y-3 min-h-[220px]">
                      {formNotesAndInstructions ? (
                        <div className="whitespace-pre-line text-slate-800 dark:text-slate-200">
                          {formNotesAndInstructions}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {formSummary && (
                            <div>
                              <strong className="text-blue-600 dark:text-blue-400 block mb-1">[핵심 요약]</strong>
                              <p className="whitespace-pre-line text-slate-700 dark:text-slate-300 pl-2 border-l-2 border-blue-400">
                                {formSummary}
                              </p>
                            </div>
                          )}
                          {formDecisions && (
                            <div>
                              <strong className="text-purple-600 dark:text-purple-400 block mb-1">[주요 결정사항]</strong>
                              <ul className="list-disc list-inside space-y-0.5 text-slate-700 dark:text-slate-300 pl-2">
                                {formDecisions.split('\n').filter(Boolean).map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {!formSummary && !formDecisions && (
                            <p className="text-slate-400 italic text-center py-6">
                              회의내용을 직접 입력하거나 대화록을 붙여넣은 뒤 [✨ AI 자동 정리]를 누르면 공식 서식 본문이 완성됩니다.
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Row 44: 푸터 주의사항 안내문 */}
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-700 text-center">
                    <td colSpan={6} className="p-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      ※거래처 명함은 PDF파일로 업로드
                    </td>
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

            {/* 5. 회의록 목록 저장 및 등록 버튼 */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleSaveCurrentMeeting(true)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-blue-950/40 transition cursor-pointer active:scale-98"
              >
                <Save size={16} />
                <span>💾 회의록 저장 및 [회의록 목록]에 등록</span>
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-1.5 font-medium">
                저장 후 회의록 목록(아카이브)으로 자동 이동하여 전 직원이 즉시 열람·출력할 수 있습니다.
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  )}

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
