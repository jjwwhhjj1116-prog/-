import React, { useState, useRef, useEffect } from 'react';
import {
  FolderKanban,
  Building2,
  Layers,
  Trees,
  Plus,
  FileSignature,
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
  Sparkles
} from 'lucide-react';
import ProjectCalendar from './components/ProjectCalendar';
import ProjectModal from './components/ProjectModal';
import { MinutesView } from './components/MinutesView';
import { DriveView } from './components/DriveView';
import { QCLinkView } from './components/QCLinkView';
import { PersonalScheduleView } from './components/PersonalScheduleView';
import { SettingsView } from './components/SettingsView';
import { LoginModal } from './components/LoginModal';
import { LoginScreen } from './components/LoginScreen';
import { IntakeListView } from './components/IntakeListView';
import { PrintScheduleModal } from './components/PrintScheduleModal';
import { useProjectStore, type Department } from './store/useProjectStore';
import { useAuthStore } from './store/useAuthStore';
import { exportProjectsToExcel, importProjectsFromExcel } from './services/excelService';
import realProjectsData from './data/realProjects.json';

// 좌측 카테고리 정의 (최상단에 '프로젝트 접수목록' 추가)
export type NavCategory =
  | '프로젝트 접수목록'
  | '프로젝트 일정표'
  | '마감팀 일정표'
  | '구조팀 일정표'
  | '토목&조경팀 일정표'
  | '회의록'
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
    setProjects,
  } = useProjectStore();

  const { currentUser, logout } = useAuthStore();

  // 기본 활성 메뉴: 프로젝트 일정표
  const [activeMenu, setActiveMenu] = useState<NavCategory>('프로젝트 일정표');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newDept, setNewDept] = useState<Department>('마감팀');

  // 다국어(한국어 / 베트남어) 및 다크모드 상태
  const [lang, setLang] = useState<'ko' | 'vi'>('ko');
  const [darkMode, setDarkMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 엑셀 파일 업로드 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 다크모드 HTML 클래스 반영
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 구버전 가짜 샘플(수택E구역 등) 감지 시 실제 수주 접수목록 프로젝트(58건)로 전면 자동 갱신
  useEffect(() => {
    const hasFakeSample = projects.some(
      (p) => p.name.includes('수택E구역') || p.name.includes('광양 바이오매스') || p.id === 'p1' || p.id === 'p2'
    );
    if (hasFakeSample || projects.length <= 5) {
      setProjects(realProjectsData as any);
    }
  }, [projects, setProjects]);

  // KPI 지표 계산
  const totalCount = projects.length;
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
      pmId: newDept === '마감팀' ? '4' : newDept === '구조팀' ? '3' : '26', // 양한규(마감), 김재헌(구조), 오승균(토목)
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
  const handleExportExcel = () => {
    exportProjectsToExcel(projects, personnel);
    setToastMessage('프로젝트 일정표가 엑셀(.xlsx)로 다운로드되었습니다.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 엑셀 가져오기 핸들러
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importProjectsFromExcel(file, personnel);
      if (imported.length > 0) {
        setProjects(imported);
        setToastMessage(`성공: 엑셀에서 ${imported.length}개 프로젝트 일정을 동기화하였습니다.`);
      } else {
        setToastMessage('엑셀 파일에서 유효한 프로젝트 데이터를 찾지 못했습니다.');
      }
    } catch (err: any) {
      alert('엑셀 파일 파싱 오류: ' + (err?.message || err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

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
    drive: lang === 'vi' ? 'Kho tài liệu (Google Drive)' : '자료실(google드라이브)',
    qcLink: lang === 'vi' ? 'Hệ thống liên kết (Kiểm tra QC)' : '검토 (QC Studio 연계)',
    settings: lang === 'vi' ? 'Cài đặt hệ thống' : '설정 (Google/회원)',
    exportExcel: lang === 'vi' ? 'Xuất Excel' : '엑셀 내보내기',
    importExcel: lang === 'vi' ? 'Nhập Excel' : '엑셀 가져오기',
    printSchedule: lang === 'vi' ? 'In lịch trình (A4)' : '일정표 출력 (A4)',
  };

  // 로그인하지 않은 상태일 때 클레임센터 스튜디오 1:1 스타일 정식 로그인 게이트웨이 화면 렌더링
  if (!currentUser) {
    return <LoginScreen />;
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
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* 상단 글로벌 헤더 */}
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 flex items-center justify-between shadow-2xs z-30 shrink-0">
        {/* 좌측 로고 영역 */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveMenu('프로젝트 일정표')}>
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
            <p className="text-[10px] font-bold text-slate-400 tracking-wider">
              QUANTITY TAKEOFF & SCHEDULER
            </p>
          </div>
        </div>

        {/* 우측 글로벌 액션: 바로가기/언어 슬라이더 토글/다크모드/프로필 */}
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
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
            <Settings size={14} /> 설정
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* 1) 스크린샷 1번 요청: 직관적인 좌측 [ 한국 | VIET ] 슬라이더 Pill Switch */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/90 p-1 rounded-full border border-slate-200 dark:border-slate-600 shadow-inner">
            <button
              onClick={() => setLang('ko')}
              className={`px-3 py-1 rounded-full text-xs font-black transition-all duration-200 flex items-center gap-1.5 ${
                lang === 'ko'
                  ? 'bg-[#00338d] text-white shadow-xs scale-100'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-sm">🇰🇷</span> 한국
            </button>
            <button
              onClick={() => setLang('vi')}
              className={`px-3 py-1 rounded-full text-xs font-black transition-all duration-200 flex items-center gap-1.5 ${
                lang === 'vi'
                  ? 'bg-[#00338d] text-white shadow-xs scale-100'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                  {currentUser.department}
                </span>
              </div>
              <button
                onClick={logout}
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

      {/* 바디 레이아웃 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 사이드바: 최상단에 '프로젝트 접수목록' 배치 */}
        <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col p-3 gap-5 select-none shrink-0 overflow-y-auto">
          {/* 1) 일정표 관리 섹션 */}
          <div>
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">
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
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {projects.length}
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
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">
              협업 및 산출 자료실
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveMenu('회의록')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '회의록'
                    ? 'bg-[#00338d] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileSignature size={16} />
                  <span>{t.minutes}</span>
                </div>
                <span className="text-[10px] bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded font-semibold">
                  안건
                </span>
              </button>

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
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">
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

          {/* 4) 시스템 환경설정 섹션 */}
          <div>
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2">
              시스템 환경설정
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
                  관리
                </span>
              </button>
            </div>
          </div>

          {/* 사용자 계정 정보 미니 위젯 */}
          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-600/60">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">사내 인증 상태</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                정상 연동
              </span>
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
              {currentUser ? `${currentUser.name} (${currentUser.position})` : '로그인이 필요합니다'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {currentUser?.department || 'CONCOST 기술본부'}
            </div>
          </div>
        </aside>

        {/* 우측 메인 콘텐츠 영역: 선택된 메뉴에 따라 동적 전환 */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* CASE 0: 프로젝트 접수목록 (그룹웨어 수주소식 실시간 연동) */}
          {activeMenu === '프로젝트 접수목록' && (
            <IntakeListView
              lang={lang}
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
                    실시간 프로젝트 - 신규 의뢰 자동 반영
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
                  전체 팀 보기 ({projects.length})
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
                    <span className="text-blue-400 font-bold">100% 가동중</span>
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
                    <span>일정 지연 0건 통제</span>
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

                {/* 4) 착수예정 & 납품 (에메랄드 그린 & 포레스트 블랙 에셋) */}
                <div
                  className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-950/90 via-slate-900 to-zinc-950 text-white border border-emerald-500/40 shadow-xl shadow-emerald-950/30 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all duration-300" />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-emerald-300 uppercase flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      착수예정 & 납품
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-500/50">
                      품질검수 완료
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-4xl font-black tracking-tight text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      {scheduledCount}
                      <span className="text-sm font-bold text-emerald-300/80 ml-1">건</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-0.5">
                      성과물 인도 준비
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-emerald-950/80 flex items-center justify-between text-[11px] text-emerald-300/80">
                    <span>검수 승인 및 차기 프로젝트 연계</span>
                    <span className="text-emerald-400 font-bold">인도 완료</span>
                  </div>
                </div>
              </div>

              {/* 메인 캘린더 컴포넌트 */}
              <ProjectCalendar
                onOpenPrintModal={() => setIsPrintModalOpen(true)}
                onExportExcel={handleExportExcel}
                onImportExcel={() => fileInputRef.current?.click()}
                lang={lang}
              />
            </div>
          )}

          {/* CASE 2: 마감팀 일정표 */}
          {activeMenu === '마감팀 일정표' && (
            <PersonalScheduleView department="마감팀" />
          )}

          {/* CASE 3: 구조팀 일정표 */}
          {activeMenu === '구조팀 일정표' && (
            <PersonalScheduleView department="구조팀" />
          )}

          {/* CASE 4: 토목&조경팀 일정표 */}
          {activeMenu === '토목&조경팀 일정표' && (
            <PersonalScheduleView department="토목&조경팀" />
          )}

          {/* CASE 5: 회의록 */}
          {activeMenu === '회의록' && <MinutesView />}

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
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-700 animate-fadeIn">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">새 물량산출 프로젝트 등록</h3>
            <form onSubmit={handleCreateQuickProject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  프로젝트명
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: [강남역 역세권 청년주택] 건축 마감 수량산출"
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

      {/* 세부 공종 및 변경점(REV) 상세 모달 */}
      {selectedProjectId && (
        <ProjectModal
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}

      {/* 사내 로그인 모달 */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* 클레임센터 스튜디오 스타일 A4 가로 인쇄 모달 (스크린샷 4번) */}
      <PrintScheduleModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        projects={projects}
        personnel={personnel}
        currentUserName={currentUser ? `${currentUser.name} (${currentUser.position})` : '조한빈 (실장)'}
        departmentFilter={filterDepartment}
        lang={lang}
      />

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
