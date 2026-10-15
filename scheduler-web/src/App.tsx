import {translatedAlert} from './services/translationService';
import {ProjectArchive} from './components/RetainedRecords';
import {PersonalWorkView} from './components/PersonalWorkView';
import {usePersonalStore} from './store/usePersonalStore';
import {StudioCollaboration} from './components/StudioCollaboration';
import {AutomaticWorklogSync} from './components/AutomaticWorklogSync';
import {restoreStudioSession,startStudioSync,useStudioStore,waitForSchedulePublished} from './store/useStudioStore';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderKanban,
  Building2,
  Layers,
  Trees,
  Plus,
  FileSignature,
  FileQuestion,
  HardDrive,
  FileSearch,
  UserCheck,
  LogOut,
  ChevronRight,
  Settings,
  Inbox,
  Moon,
  Sun,
  CheckCircle2,
  Activity,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
  ClipboardCheck, Menu, X
} from 'lucide-react';
import ProjectCalendar from './components/ProjectCalendar';
import ProjectModal from './components/ProjectModal';
import { ProjectIntegratedModal } from './components/ProjectIntegratedModal';
import { MinutesView } from './components/MinutesView';
import { DailyWorkLogView } from './components/DailyWorkLogView';
import {WeeklyWorkReports} from './components/WeeklyWorkReports';
import { DriveView } from './components/DriveView';
import { QCLinkView } from './components/QCLinkView';
import { PersonalScheduleView } from './components/PersonalScheduleView';
import { SettingsView } from './components/SettingsView';
import { LoginModal } from './components/LoginModal';
import { LoginScreen } from './components/LoginScreen';
import { IntakeListView } from './components/IntakeListView';
import { PrintScheduleModal } from './components/PrintScheduleModal';
import { useProjectStore, type Department } from './store/useProjectStore';
import { useAuthStore, isUserAdmin } from './store/useAuthStore';
import { canManageSchedule } from './utils/schedulePermissions';
import { exportProjectsToExcel, parseProjectsWorkbook, parseLegacyProjectsWorkbook, type LegacyProjectPreview } from './services/excelService';
import * as XLSX from 'xlsx';
import {useLanguageStore} from './store/useLanguageStore';
import {ProjectInquiries} from './components/ProjectInquiries';
import {SupplementScheduleView} from './components/SupplementScheduleView';

// 좌측 카테고리 정의 (최상단에 '프로젝트 접수목록' 추가, 회의록 하위 2단 카테고리 추가)
export type NavCategory =
  | '프로젝트 접수목록'
  | '프로젝트 일정표'
  | '마감팀 일정표'
  | '구조팀 일정표'
  | '토목&조경팀 일정표'
  | '프로젝트 질의사항'
  | '회의록'
  | '회의록 작성'
  | '회의록 목록'
  | '업무일지'
  | '주간 업무·야근 보고'
  | '할 일'
  | '내 휴가 일정'
  | '자료실(google드라이브)'
  | '연계시스템(검토)'
  | '설정';

export default function App() {
  const {
    projects,
    personnel,
    filterDepartment,
    setFilterDepartment,
    selectedProjectId,
    setSelectedProjectId,
    addProject,
    importProjects,
  } = useProjectStore();

  const { currentUser, logout } = useAuthStore();
  const actorId=currentUser?.id;
  const studio=useStudioStore();
  const sharedReady=studio.ready&&studio.actorId===actorId;
  const sharedLoaded=studio.hasLoaded&&studio.actorId===actorId;
  const [sessionChecked,setSessionChecked]=useState(false);
  const [localViewActorId,setLocalViewActorId]=useState<string|null>(null);

  useEffect(()=>{void restoreStudioSession().finally(()=>setSessionChecked(true));},[]);
  useEffect(()=>{if(sessionChecked&&actorId)return startStudioSync(actorId);},[sessionChecked,actorId]);
  const handleLogout=()=>{setLocalViewActorId(null);logout();};

  // 기본 활성 메뉴: 프로젝트 일정표
  const [activeMenu, setActiveMenu] = useState<NavCategory>('프로젝트 일정표');
  const [weeklyReportWeek,setWeeklyReportWeek]=useState<string|undefined>();
  const [supplementContext,setSupplementContext]=useState<{department?:Department;projectId?:string;taskId?:string}|null>(null);
  const openSupplement=(department?:Department,projectId?:string,taskId?:string)=>setSupplementContext({department,projectId,taskId});
  const openSupplementReport=(projectId:string,taskId:string)=>{
    const project=projects.find(item=>item.id===projectId),task=project?.postDeliveryTasks?.find(item=>item.id===taskId);
    openSupplement(task?.department||project?.department,projectId,taskId);
  };
  useEffect(()=>setSupplementContext(null),[actorId]);
  const openWeeklyReport=(week:string)=>{setWeeklyReportWeek(week);setActiveMenu('주간 업무·야근 보고');};
  const [minutesMenuOpen,setMinutesMenuOpen]=useState(true);
  const [todoMenuOpen,setTodoMenuOpen]=useState(true);
  useEffect(()=>{
    if(activeMenu==='회의록'||activeMenu==='회의록 작성'||activeMenu==='회의록 목록')setMinutesMenuOpen(true);
    if(activeMenu==='할 일'||activeMenu==='내 휴가 일정')setTodoMenuOpen(true);
  },[activeMenu]);
  const [inquiryDepartment,setInquiryDepartment]=useState<Department>('마감팀');
  const [inquiryVisited,setInquiryVisited]=useState<Department[]>([]);
  const [inquiryContext,setInquiryContext]=useState<Partial<Record<Department,{projectId?:string;projectCode?:string;trade?:string;version:number}>>>({});
  const selectInquiryDepartment=(department:Department,projectCode?:string)=>{
    if(projectCode){
      const target=projects.find(project=>project.department===department&&project.code===projectCode)||projects.find(project=>project.code===projectCode);
      setInquiryContext(old=>({...old,[department]:{...old[department],projectId:target?.id||'',projectCode,version:(old[department]?.version||0)+1}}));
    }
    setInquiryDepartment(department);
    setInquiryVisited(old=>old.includes(department)?old:[...old,department]);
    setActiveMenu('프로젝트 질의사항');
  };
  const openInquiries=(department:Department,projectId?:string,trade?:string)=>{
    setInquiryContext(old=>({...old,[department]:{projectId,projectCode:projects.find(project=>project.id===projectId)?.code,trade,version:(old[department]?.version||0)+1}}));
    selectInquiryDepartment(department);setFilterDepartment(department);
  };
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  useEffect(()=>setMobileNavOpen(false),[activeMenu,actorId]);
  const [workLogActorId,setWorkLogActorId]=useState<string|null>(null);
  useEffect(()=>{if(activeMenu==='업무일지'&&actorId)setWorkLogActorId(actorId);},[activeMenu,actorId]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedIntegratedProjectCode, setSelectedIntegratedProjectCode] = useState<string | null>(null);
  const [openIntakeCode,setOpenIntakeCode] = useState<string|null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newDept, setNewDept] = useState<Department>('마감팀');

  // 다국어(한국어 / 베트남어) 및 다크모드 상태
  const {lang,setLang} = useLanguageStore();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('concost_dark_mode') === 'true';
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 엑셀 파일 업로드 ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [legacyPreview, setLegacyPreview] = useState<{name:string;rows:LegacyProjectPreview[]} | null>(null);
  const [legacySelected, setLegacySelected] = useState<Set<string>>(() => new Set());
  const [importError, setImportError] = useState('');
  const [legacySaving, setLegacySaving] = useState(false);

  // 다크모드 HTML 클래스 및 로컬스토리지 반영
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('concost_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('concost_dark_mode', 'false');
    }
  }, [darkMode]);

  // Google OAuth 1회 연동 콜백 자동 감지 및 D1 영구 적재 (클레임센터 스튜디오 방식)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      void translatedAlert(`Google OAuth 승인 실패: ${error}`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      fetch('/api/google/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          state: searchParams.get('state'),
          redirectUri: window.location.origin,
        }),
      })
        .then((res) => res.json())
        .then((data: any) => {
          if (data.success) {
            void translatedAlert('회사 Google Drive (concost.dt@gmail.com) 1회 영구 연동이 완료되었습니다!\n이제 자료실에서 업로드하는 모든 파일이 회사 구글 드라이브 5단계 폴더로 즉시 실제 적재됩니다.');
            setActiveMenu('자료실(google드라이브)');
          } else {
            void translatedAlert(`Google Drive 연동 실패: ${data.error || data.message || '알 수 없는 오류'}`);
          }
        })
        .catch((err) => {
          void translatedAlert(`Google Drive 연동 통신 실패: ${err.message}`);
        });
    }
  }, []);

  // KPI 지표 계산 (고유 프로젝트 기준)
  const uniqueProjectCount = useMemo(() => {
    return new Set([...projects.map((p) => p.code || p.id),...studio.pendingIntake.map(item=>item.code)]).size;
  }, [projects,studio.pendingIntake]);
  const totalCount = uniqueProjectCount;
  const inProgressCount = projects.filter((p) => p.status === '진행중').length;
  const revCount = projects.filter((p) => p.status === '수정').length;
  const scheduledCount = projects.filter((p) => p.status === '착수예정').length;

  const handleCreateQuickProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    addProject({
      code: `TK-${new Date().getFullYear()}-${String(projects.length + 1).padStart(5, '0')}`,
      name: newProjectName.trim(),
      department: newDept,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      pmId: '', // 양한규(마감), 김재헌(구조), 오승균(토목)
      progress: 0,
      status: '착수예정',
      roles: {},
      subTasks: {},
    });

    setNewProjectName('');
    setShowAddModal(false);
    setToastMessage(`[${newProjectName}] 프로젝트가 생성되었습니다.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 엑셀 내보내기 핸들러
  const [printDate, setPrintDate] = useState(new Date());
  const handleExportExcel = async (date = new Date()) => {
    if(!await exportProjectsToExcel(projects, personnel, date, 1, filterDepartment))return;
    setToastMessage('프로젝트 일정표가 엑셀(.xlsx)로 다운로드되었습니다.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 엑셀 가져오기 핸들러
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {type:'array'});
      if (!workbook.Sheets['복원데이터']) {
        const rows = parseLegacyProjectsWorkbook(workbook, personnel);
        setLegacySelected(new Set());
        setLegacyPreview({name:file.name,rows});
        return;
      }
      const imported = parseProjectsWorkbook(workbook);
      if (imported.length > 0) {
        if (!sharedReady) throw new Error('중앙 공유 연결 후 일정을 가져오세요.');
        importProjects(imported);
        const current=useProjectStore.getState().projects;
        await waitForSchedulePublished(imported.map(p=>current.find(item=>item.code===p.code&&item.department===p.department)!.id));
        setToastMessage(`성공: 엑셀에서 ${imported.length}개 프로젝트 일정을 동기화하였습니다.`);
      } else {
        setToastMessage('엑셀 파일에서 유효한 프로젝트 데이터를 찾지 못했습니다.');
      }
    } catch (err: any) {
      setImportError('엑셀 파일 확인 실패: ' + (err?.message || err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleApplyLegacyPreview = async () => {
    if (!legacyPreview) return;
    const chosen=legacyPreview.rows.filter(row=>legacySelected.has(row.project.id));
    if (!chosen.length) return;
    try {
      setImportError('');
      if (!sharedReady) throw new Error('중앙 공유 연결 후 일정을 등록하세요.');
      setLegacySaving(true);
      importProjects(chosen.map(row=>row.project),true);
      await waitForSchedulePublished(chosen.map(row=>row.project.id));
      setLegacyPreview(null);
      setLegacySelected(new Set());
      setToastMessage(`구형 Excel에서 선택한 ${chosen.length}개 팀 일정을 등록했습니다.`);
      setTimeout(()=>setToastMessage(null),4000);
    } catch(err:unknown) {
      setImportError(err instanceof Error ? err.message : '구형 Excel 일정을 등록하지 못했습니다.');
    } finally {
      setLegacySaving(false);
    }
  };

  // 관리자 권한 여부 (오직 yjw@con-cost.com, yjpark@con-cost.com 2개 계정만 관리자)
  const isAdmin = isUserAdmin(currentUser);

  // 다국어 텍스트 사전
  const t = {
    appTitle: lang === 'vi' ? 'STUDIO KHỐI KỸ THUẬT' : '기술본부 스튜디오',
    appSub: 'CONCOST TECH HQ · QUANTITY TAKEOFF & SCHEDULER',
    intakeMenu: lang === 'vi' ? 'Tiếp nhận dự án (Mới)' : '프로젝트 접수목록',
    allSchedule: lang === 'vi' ? 'Tiến độ Dự án' : '프로젝트 일정표',
    finishSchedule: lang === 'vi' ? 'Tiến độ Đội Hoàn thiện' : '마감팀 일정표',
    structSchedule: lang === 'vi' ? 'Tiến độ Đội Kết cấu' : '구조팀 일정표',
    civilSchedule: lang === 'vi' ? 'Tiến độ Hạ tầng & Cảnh quan' : '토목&조경팀 일정표',
    minutes: lang === 'vi' ? 'Biên bản họp' : '회의록',
    projectInquiries: lang === 'vi' ? 'Câu hỏi dự án' : '프로젝트 질의사항',
    workLog: lang === 'vi' ? 'Nhật ký công việc' : '업무일지',
    drive: lang === 'vi' ? 'Kho tài liệu (Google Drive)' : '자료실(google드라이브)',
    qcLink: lang === 'vi' ? 'Hệ thống liên kết (Kiểm tra QC)' : '검토 (QC Studio 연계)',
    settings: isAdmin
      ? (lang === 'vi' ? 'Cài đặt hệ thống' : '설정 (Google/회원)')
      : (lang === 'vi' ? 'Cài đặt cá nhân' : '개인 설정 (비밀번호)'),
    exportExcel: lang === 'vi' ? 'Xuất Excel' : '엑셀 내보내기',
    importExcel: lang === 'vi' ? 'Nhập Excel' : '엑셀 가져오기',
    printSchedule: lang === 'vi' ? 'In lịch trình (A4)' : '일정표 출력 (A4)',
  };

  // 로그인하지 않은 상태일 때 클레임센터 스튜디오 1:1 스타일 정식 로그인 게이트웨이 화면 렌더링
  if (!sessionChecked) {
    return <div role="status" className="min-h-screen flex items-center justify-center bg-slate-950 text-white text-sm">서버 로그인 확인 중…</div>;
  }
  if (!currentUser) {
    return <LoginScreen />;
  }
  if (!sharedLoaded && localViewActorId !== actorId) {
    return <div className={`min-h-screen ${darkMode?'dark bg-slate-950 text-slate-100':'bg-slate-50 text-slate-900'}`}>
      {studio.actorId===actorId&&studio.conflict&&<StudioCollaboration onOpenMeeting={()=>setActiveMenu('회의록 작성')} onOpenWorkLog={()=>setActiveMenu('업무일지')} onOpenWeeklyReport={openWeeklyReport} onOpenSupplement={openSupplementReport} />}
      <main className="min-h-screen max-w-lg mx-auto flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">중앙 일정 확인 중</h1>
        <p role="status" className="text-sm">{studio.actorId===actorId?studio.status:'중앙 서버 연결을 시작하고 있습니다.'}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">중앙 확인이 끝나면 최신 프로젝트 일정과 개인 할 일을 표시합니다.{studio.actorId===actorId&&studio.pending>0?` 미전송 변경 ${studio.pending}건은 보존되어 있습니다.`:''}</p>
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={()=>setLocalViewActorId(actorId||null)}>이 PC 저장본 보기</button>
        <p className="text-xs text-slate-600 dark:text-slate-300">연결 전 저장본은 최신 일정이 아닐 수 있습니다. 저장된 변경은 삭제하지 않습니다.</p>
        <button className="text-sm underline" onClick={handleLogout}>로그아웃</button>
      </main>
    </div>;
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      darkMode ? 'bg-slate-900 text-slate-100 dark' : 'bg-slate-50 text-slate-800'
    }`}>
      {/* 엑셀 파일 선택 인풋 (숨김) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        onChange={handleImportExcel}
      />

      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 dark:bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-fade-in">
          <CheckCircle2 size={18} className="text-emerald-400 dark:text-white" />
          <span data-no-translate={projects.some(project=>project.name&&toastMessage.includes(project.name))?'':undefined} className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 상단 글로벌 헤더 */}
      <header className="min-h-16 md:h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 md:px-6 md:py-0 flex flex-wrap md:flex-nowrap gap-3 items-center justify-between shadow-2xs z-30 shrink-0">
        <button type="button" aria-label="메뉴 열기" aria-expanded={mobileNavOpen} aria-controls="studio-navigation" className="md:hidden rounded-lg border border-slate-300 p-2 dark:border-slate-600" onClick={()=>setMobileNavOpen(true)}><Menu size={20}/></button>
        {/* 좌측 로고 영역 */}
        <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => setActiveMenu('프로젝트 일정표')}>
          <div className="w-10 h-10 rounded-xl bg-[#00338d] flex items-center justify-center text-white shadow-md">
            <Building2 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                {t.appTitle}
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-[#00338d] dark:text-blue-300">
                CONCOST TECH HQ
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-600 tracking-wider dark:text-slate-400">
              QUANTITY TAKEOFF & SCHEDULER
            </p>
          </div>
        </div>

        {/* 우측 글로벌 액션: 바로가기/언어 슬라이더 토글/다크모드/프로필 */}
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <button
            onClick={() => setActiveMenu('자료실(google드라이브)')}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 transition text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <HardDrive size={14} className="text-orange-500" />
            자료실 · 드라이브
          </button>

          <button
            onClick={() => setActiveMenu('연계시스템(검토)')}
            className="px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 flex items-center gap-1.5 transition text-xs font-bold"
          >
            <Sparkles size={14} /> QC 검토
          </button>

          <button
            onClick={() => setActiveMenu('설정')}
            className={`px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold ${
              activeMenu === '설정'
                ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Settings size={14} /> {isAdmin ? '설정' : '개인 설정'}
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* 1) 스크린샷 1번 요청: 직관적인 좌측 [ 한국 | VIET ] 슬라이더 Pill Switch */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/90 p-1 rounded-full border border-slate-200 dark:border-slate-600 shadow-inner">
            <button
              onClick={() => setLang('ko')}
              className={`px-3 py-1 rounded-full text-xs font-black transition-all duration-200 flex items-center gap-1.5 ${
                lang === 'ko'
                  ? 'bg-[#00338d] text-white shadow-xs scale-100'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-sm">🇰🇷</span> 한국
            </button>
            <button
              onClick={() => setLang('vi')}
              className={`px-3 py-1 rounded-full text-xs font-black transition-all duration-200 flex items-center gap-1.5 ${
                lang === 'vi'
                  ? 'bg-[#00338d] text-white shadow-xs scale-100'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-sm">🇻🇳</span> VIET
            </button>
          </div>

          {/* 2) 다크모드 전원 스위치 */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition shadow-2xs"
            title={darkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-slate-700" />}
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* 3) 최고 관리자 프로필 칩 & 로그인 제어 */}
          {currentUser ? (
            <div className="flex items-center gap-2 pl-1 bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 py-1 px-2.5 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-[#00338d] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {currentUser.name.slice(0, 1)}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                    {currentUser.name}
                  </span>
                  <span className="text-[10px] text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-900/50 font-semibold px-1 rounded">
                    {currentUser.position}
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 block truncate max-w-[120px] dark:text-slate-400">
                  {currentUser.department}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="로그아웃"
                className="ml-1 p-1 text-slate-400 hover:text-rose-600 rounded-md transition"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="btn-stitch-primary text-xs flex items-center gap-1.5"
            >
              <UserCheck size={14} />
              로그인
            </button>
          )}
        </div>
      </header>
      <AutomaticWorklogSync />
      <StudioCollaboration onOpenMeeting={()=>setActiveMenu('회의록 작성')} onOpenWorkLog={()=>setActiveMenu('업무일지')} onOpenWeeklyReport={openWeeklyReport} onOpenSupplement={openSupplementReport} />
      {!sharedReady&&<p role="status" className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{sharedLoaded?(studio.conflict?'다른 사람이 같은 일정을 변경했습니다. 상단에서 충돌을 해결하세요.':'중앙 서버 연결이 끊겼습니다. 마지막으로 확인한 일정과 이 PC 변경을 표시합니다. 최신 여부를 확인하세요.'):'이 PC 저장본을 보고 있습니다. 중앙 서버 연결 전에는 최신 일정이 아닐 수 있습니다.'}</p>}

      {/* 바디 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 사이드바: 최상단에 '프로젝트 접수목록' 배치 */}
        {mobileNavOpen&&<button type="button" aria-label="메뉴 닫기" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={()=>setMobileNavOpen(false)}/>}
        <aside id="studio-navigation" aria-label="스튜디오 메뉴" className={`${mobileNavOpen?'flex':'hidden'} md:flex fixed inset-y-0 left-0 z-40 md:static w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex-col p-3 gap-5 select-none shrink-0 overflow-y-auto`}>
          <button type="button" aria-label="스튜디오 메뉴 닫기" className="md:hidden self-end rounded-lg border border-slate-300 p-2 dark:border-slate-600" onClick={()=>setMobileNavOpen(false)}><X size={20}/></button>
          {/* 1) 일정표 관리 섹션 */}
          <div>
            <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest px-3 mb-2">
              일정표 관리
            </div>
            <div className="space-y-1">
              {/* 프로젝트 접수목록 (그룹웨어 수주소식 연동) */}
              <button
                onClick={() => setActiveMenu('프로젝트 접수목록')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '프로젝트 접수목록'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Inbox size={16} className={activeMenu === '프로젝트 접수목록' ? 'text-blue-200' : 'text-blue-600 dark:text-blue-400'} />
                  <span>{t.intakeMenu}</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    activeMenu === '프로젝트 접수목록'
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-blue-50 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                  }`}
                >
                  수주연동
                </span>
              </button>

              {/* 프로젝트 일정표 */}
              <button
                onClick={() => {
                  setActiveMenu('프로젝트 일정표');
                  setFilterDepartment('ALL');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '프로젝트 일정표'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderKanban size={16} />
                  <span>{t.allSchedule}</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    activeMenu === '프로젝트 일정표'
                      ? 'bg-blue-800 text-blue-100'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200'
                  }`}
                >
                  {uniqueProjectCount}
                </span>
              </button>

              {/* 마감팀 일정표 */}
              <button
                onClick={() => {
                  setActiveMenu('마감팀 일정표');
                  setFilterDepartment('마감팀');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '마감팀 일정표'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 size={16} />
                  <span>{t.finishSchedule}</span>
                </div>
                <ChevronRight size={14} className="opacity-60" />
              </button>

              {/* 구조팀 일정표 */}
              <button
                onClick={() => {
                  setActiveMenu('구조팀 일정표');
                  setFilterDepartment('구조팀');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '구조팀 일정표'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers size={16} />
                  <span>{t.structSchedule}</span>
                </div>
                <ChevronRight size={14} className="opacity-60" />
              </button>

              {/* 토목&조경팀 일정표 */}
              <button
                onClick={() => {
                  setActiveMenu('토목&조경팀 일정표');
                  setFilterDepartment('토목&조경팀');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '토목&조경팀 일정표'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Trees size={16} />
                  <span>{t.civilSchedule}</span>
                </div>
                <ChevronRight size={14} className="opacity-60" />
              </button>
            </div>
          </div>

          {/* 2) 협업 및 산출 자료실 섹션 */}
          <div>
            <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest px-3 mb-2">
              협업 및 산출 자료실
            </div>
            <div className="space-y-1">
              {/* 회의록 대메뉴 및 2단 하위 카테고리 (- 회의록 작성, - 회의록 목록) */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  aria-expanded={minutesMenuOpen}
                  aria-controls="minutes-submenu"
                  onClick={() => setMinutesMenuOpen(open=>!open)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    activeMenu === '회의록' || activeMenu === '회의록 작성' || activeMenu === '회의록 목록'
                      ? 'bg-slate-100 dark:bg-slate-700/70 text-slate-900 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileSignature size={16} className="text-blue-600 dark:text-blue-400" />
                    <span>{t.minutes}</span>
                  </div>
                  <div className="flex items-center gap-2"><span className="text-[10px] bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded font-semibold">
                    2단분류
                  </span><ChevronRight size={14} aria-hidden="true" className={`opacity-60 transition-transform motion-reduce:transition-none ${minutesMenuOpen?'rotate-90':''}`}/></div>
                </button>

                {/* 하위 2개 서브메뉴 들여쓰기 */}
                <div id="minutes-submenu" hidden={!minutesMenuOpen} className="pl-6 pr-1 space-y-1 pt-0.5 pb-1">
                  <button
                    onClick={() => setActiveMenu('회의록 작성')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMenu === '회의록 작성' || activeMenu === '회의록'
                        ? 'bg-[#00338d] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] opacity-70">-</span>
                      <span>회의록 작성</span>
                    </div>
                    <span className="text-[9px] px-1 rounded font-mono opacity-80">
                      작성·원문
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveMenu('회의록 목록')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMenu === '회의록 목록'
                        ? 'bg-[#00338d] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] opacity-70">-</span>
                      <span>회의록 목록</span>
                    </div>
                    <span className="text-[9px] px-1 rounded font-mono opacity-80">
                      아카이브
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                aria-label={t.projectInquiries}
                aria-current={activeMenu==='프로젝트 질의사항'?'page':undefined}
                onClick={()=>selectInquiryDepartment(inquiryVisited.length?inquiryDepartment:currentUser.department==='구조팀'?'구조팀':currentUser.department==='토목&조경팀'?'토목&조경팀':'마감팀')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${activeMenu==='프로젝트 질의사항'?'bg-[#00338d] text-white shadow-sm':'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
              >
                <FileQuestion size={16}/>
                <span>{t.projectInquiries}</span>
              </button>

              <div className="mt-3 space-y-1">
                <button type="button" aria-expanded={todoMenuOpen} aria-controls="todo-submenu" onClick={()=>setTodoMenuOpen(open=>!open)} className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`}><span className="flex items-center gap-2"><ClipboardCheck size={17}/>할 일 (TO DO)</span><ChevronRight size={14} aria-hidden="true" className={`opacity-60 transition-transform motion-reduce:transition-none ${todoMenuOpen?'rotate-90':''}`}/></button>
                <div id="todo-submenu" hidden={!todoMenuOpen} className="space-y-1">
                <button type="button" aria-current={activeMenu==='할 일'?'page':undefined} onClick={()=>setActiveMenu('할 일')} className={`w-full text-left pl-10 py-2 text-xs rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${activeMenu==='할 일'?'bg-blue-700 text-white font-bold':'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>오늘·내일 할 일</button>
                <button type="button" aria-current={activeMenu==='내 휴가 일정'?'page':undefined} onClick={()=>setActiveMenu('내 휴가 일정')} className={`w-full text-left pl-10 py-2 text-xs rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${activeMenu==='내 휴가 일정'?'bg-blue-700 text-white font-bold':'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>내 휴가 일정</button>
                </div>
              </div>
              {/* ✨ 회의록 하단에 업무일지 (개인별 업무일지 & 결재라인) 신규 추가 */}
              <button
                onClick={() => setActiveMenu('업무일지')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '업무일지'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck size={16} />
                  <span>{t.workLog}</span>
                </div>
                <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                  결재연계
                </span>
              </button>

              <button type="button" aria-current={activeMenu==='주간 업무·야근 보고'?'page':undefined} onClick={()=>{setWeeklyReportWeek(undefined);setActiveMenu('주간 업무·야근 보고');}} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${activeMenu==='주간 업무·야근 보고'?'bg-[#00338d] text-white shadow-sm':'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}><ClipboardCheck size={16}/><span>주간 업무·야근 보고</span></button>
              <button
                onClick={() => setActiveMenu('자료실(google드라이브)')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '자료실(google드라이브)'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HardDrive size={16} />
                  <span>{t.drive}</span>
                </div>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.2 rounded font-semibold">
                  자동생성
                </span>
              </button>
            </div>
          </div>

          {/* 3) 품질 검토 연계시스템 */}
          <div>
            <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest px-3 mb-2">
              품질 검토 연계시스템
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveMenu('연계시스템(검토)')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '연계시스템(검토)'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileSearch size={16} />
                  <span>{t.qcLink}</span>
                </div>
                <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 px-1.5 py-0.2 rounded font-semibold">
                  LIVE
                </span>
              </button>
            </div>
          </div>

          {/* 4) 시스템 환경설정 섹션 (관리자/일반회원 명확한 분기) */}
          <div>
            <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest px-3 mb-2">
              {isAdmin ? '시스템 환경설정' : '계정 보안 설정'}
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveMenu('설정')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '설정'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Settings size={16} />
                  <span>{t.settings}</span>
                </div>
                <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-semibold">
                  {isAdmin ? '관리' : '내 설정'}
                </span>
              </button>
            </div>
          </div>

          {/* 사용자 계정 정보 미니 위젯 */}
          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-600/60">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{sharedReady?'중앙 서버 로그인':'로컬 로그인 상태'}</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {sharedReady?'공유 연결':'로컬 세션'}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
              {currentUser ? `${currentUser.name} (${currentUser.position})` : '로그인이 필요합니다'}
            </div>
            <div className="text-[11px] text-slate-600 truncate dark:text-slate-400">
              {currentUser?.department || 'CONCOST 기술본부'}
            </div>
          </div>
        </aside>

        {/* 우측 메인 콘텐츠 영역: 선택된 메뉴에 따라 동적 전환 */}
        <main className="min-w-0 flex-1 overflow-y-auto p-3 md:p-6 space-y-6">
          {/* CASE 0: 프로젝트 접수목록 (그룹웨어 수주소식 실시간 연동) */}
          {activeMenu === '프로젝트 접수목록' && (
            <IntakeListView
              lang={lang}
              openIntakeCode={openIntakeCode}
              onIntakeOpened={()=>setOpenIntakeCode(null)}
              onNavigateToSchedule={(dept) => {
                if (dept) {
                  setFilterDepartment(dept);
                  setActiveMenu(`${dept} 일정표` as NavCategory);
                } else {
                  setFilterDepartment('ALL');
                  setActiveMenu('프로젝트 일정표');
                }
              }}
            />
          )}

          {/* CASE 1: 프로젝트 일정표 */}
          {activeMenu === '프로젝트 일정표' && (
            <div className="space-y-6 animate-fadeIn">
              <ProjectArchive />
              {/* 타이틀 및 헤더 액션 */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className="text-[11px] font-black text-[#00338d] dark:text-blue-400 tracking-widest uppercase block mb-1">
                    QUANTITY TAKEOFF WORKFLOW
                  </span>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    기술본부 프로젝트 통합 일정표
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    제안서부터 성과물 납품까지 프로젝트별 공종 일정과 투입 인력을 한 화면에서 확인합니다.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {sharedReady?'중앙 공유 연결 · 상세 전송 상태는 상단 확인':'프로젝트 로컬 저장 · 중앙 공유 미연결'}
                  </span>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="btn-stitch-primary text-xs font-bold"
                  >
                    <Plus size={15} /> 새 프로젝트 등록
                  </button>
                </div>
              </div>

              {/* 팀 탭 필터 (심플 타이틀: 마감팀, 구조팀, 토목&조경팀) */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                <button
                  onClick={() => setFilterDepartment('ALL')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    filterDepartment === 'ALL'
                      ? 'bg-[#00338d] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  전체 팀 보기 ({uniqueProjectCount})
                </button>
                <button
                  onClick={() => setFilterDepartment('마감팀')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    filterDepartment === '마감팀'
                      ? 'bg-[#00338d] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Building2 size={14} /> 마감팀
                </button>
                <button
                  onClick={() => setFilterDepartment('구조팀')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    filterDepartment === '구조팀'
                      ? 'bg-[#00338d] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Layers size={14} /> 구조팀
                </button>
                <button
                  onClick={() => setFilterDepartment('토목&조경팀')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    filterDepartment === '토목&조경팀'
                      ? 'bg-[#00338d] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Trees size={14} /> 토목&조경팀
                </button>
              </div>

              {/* 4대 핵심 KPI 프리미엄 카드 에셋 (딥 블랙, 에메랄드 그린, 로열 네이비, 앰버 골드) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1) 전체 프로젝트 (오닉스 블랙 & 메탈릭 실버 에셋) */}
                <div
                  onClick={() => setFilterDepartment('ALL')}
                  className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-slate-800 to-black text-white dark:from-zinc-950 dark:via-zinc-900 dark:to-black border border-slate-700/60 dark:border-zinc-800 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-blue-500/10 blur-2xl group-hover:bg-blue-500/20 transition-all duration-300" />
                  
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                      <FolderKanban size={14} className="text-blue-400" />
                      전체 프로젝트
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700">
                      총 등록 현황
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-4xl font-black tracking-tight text-white group-hover:text-blue-300 transition-colors">
                      {totalCount}
                      <span className="text-sm font-bold text-slate-400 ml-1">건</span>
                    </div>
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors flex items-center gap-0.5">
                      전체 공종 통합 <ArrowUpRight size={13} />
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span>마감 · 구조 · 토목 통합 집계</span>
                    <span className="text-blue-400 font-bold">수주·일정 연결</span>
                  </div>
                </div>

                {/* 2) 산출 진행중 (로열 네이비 & 네온 블루 에셋) */}
                <div
                  className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-[#00338d] via-blue-900 to-indigo-950 text-white border border-blue-400/40 shadow-xl shadow-blue-950/40 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-cyan-400/10 blur-2xl group-hover:bg-cyan-400/20 transition-all duration-300" />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-cyan-200 uppercase flex items-center gap-1.5">
                      <Activity size={14} className="text-cyan-300 animate-pulse" />
                      산출 진행중
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-800/80 text-cyan-300 border border-blue-400/50 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      진행률 통제
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-4xl font-black tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                      {inProgressCount}
                      <span className="text-sm font-bold text-blue-200 ml-1">건</span>
                    </div>
                    <span className="text-xs font-bold text-cyan-200 flex items-center gap-0.5">
                      납품 공정 준수
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-blue-800/60 flex items-center justify-between text-[11px] text-blue-200/80">
                    <span>팀별 일정 확인</span>
                    <span className="text-emerald-300 font-bold">공정률 가속</span>
                  </div>
                </div>

                {/* 3) 도면변경 / 수정 REV (앰버 골드 & 다크 오렌지 에셋) */}
                <div
                  className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-amber-950/90 via-slate-900 to-black text-white border border-amber-500/40 shadow-xl shadow-amber-950/30 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-amber-500/10 blur-2xl group-hover:bg-amber-500/20 transition-all duration-300" />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-amber-300 uppercase flex items-center gap-1.5">
                      <AlertCircle size={14} className="text-amber-400" />
                      도면변경 / 수정 (REV)
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-900/80 text-amber-300 border border-amber-500/50">
                      공종 집중 투입
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-4xl font-black tracking-tight text-amber-400 group-hover:text-amber-300 transition-colors">
                      {revCount}
                      <span className="text-sm font-bold text-amber-300/80 ml-1">건</span>
                    </div>
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-0.5">
                      변경점 정밀 추적
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-amber-950/80 flex items-center justify-between text-[11px] text-amber-300/80">
                    <span>도면 리비전 발생 즉시 대응</span>
                    <span className="text-amber-400 font-bold">집중 배정</span>
                  </div>
                </div>

                {/* 4) 착수예정 (에메랄드 그린 & 포레스트 블랙 에셋) */}
                <div
                  className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-950/90 via-slate-900 to-zinc-950 text-white border border-emerald-500/40 shadow-xl shadow-emerald-950/30 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all duration-300" />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-emerald-300 uppercase flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      착수예정
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-500/50">
                      착수 대기
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-4xl font-black tracking-tight text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      {scheduledCount}
                      <span className="text-sm font-bold text-emerald-300/80 ml-1">건</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-0.5">
                      착수 일정 확인
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-emerald-950/80 flex items-center justify-between text-[11px] text-emerald-300/80">
                    <span>담당자 배정 및 일정 확인</span>
                    <span className="text-emerald-400 font-bold">착수 준비</span>
                  </div>
                </div>
              </div>

              {/* 메인 캘린더 컴포넌트 */}
              <ProjectCalendar
                onOpenPostDelivery={()=>openSupplement(filterDepartment==='ALL'?undefined:filterDepartment)}
                onOpenPrintModal={(date) => { setPrintDate(date || new Date()); setIsPrintModalOpen(true); }}
                onExportExcel={handleExportExcel}
                onImportExcel={() => fileInputRef.current?.click()}
                onSelectProject={(code) => setSelectedIntegratedProjectCode(code)}
                pendingIntake={studio.pendingIntake}
                onSelectIntake={(item)=>{setOpenIntakeCode(item.code);setActiveMenu('프로젝트 접수목록');}}
                lang={lang}
              />
            </div>
          )}

          {/* CASE 2: 마감팀 일정표 */}
          {activeMenu === '마감팀 일정표' && (
            <PersonalScheduleView
              department="마감팀"
              onOpenPostDelivery={()=>openSupplement('마감팀')}
              onOpenPrintModal={(date) => { setPrintDate(date || new Date()); setIsPrintModalOpen(true); }}
            />
          )}

          {/* CASE 3: 구조팀 일정표 */}
          {activeMenu === '구조팀 일정표' && (
            <PersonalScheduleView
              department="구조팀"
              onOpenPostDelivery={()=>openSupplement('구조팀')}
              onOpenPrintModal={(date) => { setPrintDate(date || new Date()); setIsPrintModalOpen(true); }}
            />
          )}

          {/* CASE 4: 토목&조경팀 일정표 */}
          {activeMenu === '토목&조경팀 일정표' && (
            <PersonalScheduleView
              department="토목&조경팀"
              onOpenPostDelivery={()=>openSupplement('토목&조경팀')}
              onOpenPrintModal={(date) => { setPrintDate(date || new Date()); setIsPrintModalOpen(true); }}
            />
          )}

          {/* CASE 5: 회의록 (작성 및 목록 2단 분기) */}
          {inquiryVisited.map(department=><div key={`${actorId}:${department}`} hidden={activeMenu!=='프로젝트 질의사항'||inquiryDepartment!==department}><ProjectInquiries department={department} onDepartmentChange={selectInquiryDepartment} initialProjectId={inquiryContext[department]?.projectId} initialProjectCode={inquiryContext[department]?.projectCode} initialContextVersion={inquiryContext[department]?.version} initialTrade={inquiryContext[department]?.trade} visible={activeMenu==='프로젝트 질의사항'&&inquiryDepartment===department}/></div>)}
          {(activeMenu === '회의록' || activeMenu === '회의록 작성') && (
            <MinutesView initialTab="write" />
          )}
          {activeMenu === '회의록 목록' && (
            <MinutesView initialTab="list" />
          )}

          {/* CASE 5-2: 업무일지 (팀별 일정표 연계 및 3단 결재라인) */}
          {(activeMenu==='업무일지'||workLogActorId===actorId)&&<div key={actorId} hidden={activeMenu!=='업무일지'}><DailyWorkLogView visible={activeMenu==='업무일지'} /></div>}
          {activeMenu==='주간 업무·야근 보고'&&<WeeklyWorkReports initialWeek={weeklyReportWeek}/>}
          {(activeMenu==='할 일'||activeMenu==='내 휴가 일정')&&<PersonalWorkView leaveMode={activeMenu==='내 휴가 일정'} onWorklog={(date,taskId)=>{usePersonalStore.setState({openDate:date,openTaskId:taskId||null});setActiveMenu('업무일지');}}/>}

          {/* CASE 6: 자료실 (Google 드라이브) */}
          {activeMenu === '자료실(google드라이브)' && <DriveView />}

          {/* CASE 7: 연계시스템 (QC 검토) */}
          {activeMenu === '연계시스템(검토)' && <QCLinkView />}

          {/* CASE 8: 설정 (Google 드라이브 / 회원 관리) */}
          {activeMenu === '설정' && <SettingsView />}
        </main>
      </div>

      {/* 새 프로젝트 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-700 animate-fadeIn">
            <button type="button" onClick={()=>setShowAddModal(false)} aria-label="새 프로젝트 등록 닫기" className="absolute top-3 right-3 !m-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"><X size={20}/></button>
            <h3 className="!mt-0 pr-10 text-lg font-black text-slate-900 dark:text-white">새 물량산출 프로젝트 등록</h3>
            <form onSubmit={handleCreateQuickProject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  프로젝트명
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: [강남역 역세권 청년주택] 건축 마감 수량산출"
                  data-no-field-translate
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="input-stitch w-full text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  담당 부서
                </label>
                <select
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value as Department)}
                  className="input-stitch w-full text-xs dark:bg-slate-700 dark:text-white dark:border-slate-600"
                >
                  <option value="마감팀">마감팀</option>
                  <option value="구조팀">구조팀</option>
                  <option value="토목&조경팀">토목&조경팀</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-stitch-secondary text-xs"
                >
                  취소
                </button>
                <button type="submit" className="btn-stitch-primary text-xs font-bold">
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 세부 공종 및 변경점(REV) 상세 모달 (팀별 일정표 등에서 직접 열었을 때) */}
      {selectedProjectId && (
        <ProjectModal
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
          onOpenInquiries={(id,trade)=>{const project=projects.find(project=>project.id===id);if(project){setSelectedProjectId(null);openInquiries(project.department,id,trade);}}}
        />
      )}

      {/* 프로젝트 통합 공종 투입 현황 팝업 (전체 일정표에서 마감팀 조적·창호 / 구조팀 보·슬라브 조회) */}
      {selectedIntegratedProjectCode && (
        <ProjectIntegratedModal
          projectCode={selectedIntegratedProjectCode}
          onClose={() => setSelectedIntegratedProjectCode(null)}
          onNavigateToTeamSchedule={(team) => {
            setSelectedIntegratedProjectCode(null);
            setFilterDepartment(team);
            setActiveMenu(
              team === '마감팀'
                ? '마감팀 일정표'
                : team === '구조팀'
                ? '구조팀 일정표'
                : '토목&조경팀 일정표'
            );
          }}
        />
      )}

      {/* 사내 로그인 모달 */}
      {supplementContext&&<div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/50 p-3"><SupplementScheduleView department={supplementContext.department} initialProjectId={supplementContext.projectId} initialTaskId={supplementContext.taskId} onClose={()=>setSupplementContext(null)}/></div>}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* 클레임센터 스튜디오 스타일 A4 가로 인쇄 모달 (스크린샷 4번) */}
      <PrintScheduleModal
        targetDate={printDate}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        projects={projects}
        personnel={personnel}
        currentUserName={currentUser ? `${currentUser.name} (${currentUser.position})` : '조한빈 (실장)'}
        departmentFilter={filterDepartment}
        lang={lang}
      />

      {legacyPreview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label="구형 Excel 이관 미리보기">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
            <div className="relative border-b border-slate-200 p-5 pr-16 dark:border-slate-700">
              <button type="button" disabled={legacySaving} onClick={()=>{setLegacyPreview(null);setLegacySelected(new Set());}} aria-label="구형 Excel 이관 미리보기 닫기" className="absolute top-3 right-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white disabled:opacity-50"><X size={20}/></button>
              <h2 className="text-lg font-bold">구형 Excel 이관 미리보기</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{legacyPreview.name} · 원본의 프로젝트 기간과 담당자를 확인하세요. 선택한 신규 팀 일정만 등록합니다.</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">공종 종료일은 원본 Excel의 주말 제외 표준일수 수식을 따른 값입니다. 공휴일은 원본 수식에 없으며, 기존 진척률은 승인 업무일지 실적으로 옮기지 않습니다.</p>
            </div>
            <div className="space-y-3 overflow-y-auto p-5">
              {legacyPreview.rows.map(row=>{
                const exists=projects.some(p=>p.code===row.project.code&&p.department===row.project.department);
                const permitted=canManageSchedule(currentUser,row.project.department);
                const available=!exists&&permitted&&row.issues.length===0;
                return <label key={row.project.id} className="block rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={legacySelected.has(row.project.id)} disabled={!available} onChange={event=>setLegacySelected(previous=>{
                      const next=new Set(previous);
                      if(event.target.checked) next.add(row.project.id); else next.delete(row.project.id);
                      return next;
                    })} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{row.project.code} · <span data-no-translate>{row.project.name}</span> <span className="text-blue-700 dark:text-blue-300">[{row.project.department}]</span></div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">원본 {row.row}행 · {row.project.startDate} ~ {row.project.endDate} · 원본 진척률 {row.oldProgress===null?'미입력':`${row.oldProgress}%`}</div>
                      <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{row.assignments.join(' · ')}</div>
                      {(exists||!permitted||row.issues.length>0)&&<div className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">
                        {[exists?'이미 등록된 프로젝트/팀':null,!permitted?'해당 팀 실장·팀장만 등록 가능':null,...row.issues].filter(Boolean).join(' · ')}
                      </div>}
                    </div>
                  </div>
                </label>;
              })}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <span className="text-sm text-slate-600 dark:text-slate-300">선택 {legacySelected.size}건 / 검토 대상 {legacyPreview.rows.length}건</span>
              <div className="flex gap-2">
                <button type="button" disabled={legacySaving} onClick={()=>{setLegacyPreview(null);setLegacySelected(new Set());}} className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100">취소</button>
                <button type="button" disabled={!legacySelected.size||legacySaving} onClick={()=>void handleApplyLegacyPreview()} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{legacySaving?'중앙 저장 확인 중…':'선택한 일정 등록'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importError && <div role="alert" className="fixed bottom-5 left-1/2 z-[90] flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900 shadow-xl dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100">
        <span>{importError}</span><button type="button" aria-label="Excel 오류 닫기" onClick={()=>setImportError('')} className="rounded-md border border-rose-400 px-2 py-1">닫기</button>
      </div>}

      {/* 숨김 엑셀 파일 업로드용 input (엑셀 가져오기 트리거) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={handleImportExcel}
        className="hidden"
      />
    </div>
  );
}
