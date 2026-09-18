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
  Printer,
  FileSpreadsheet,
  Upload,
  Globe,
  Moon,
  Sun,
  CheckCircle2
} from 'lucide-react';
import ProjectCalendar from './components/ProjectCalendar';
import ProjectModal from './components/ProjectModal';
import { MinutesView } from './components/MinutesView';
import { DriveView } from './components/DriveView';
import { QCLinkView } from './components/QCLinkView';
import { PersonalScheduleView } from './components/PersonalScheduleView';
import { SettingsView } from './components/SettingsView';
import { LoginModal } from './components/LoginModal';
import { IntakeListView } from './components/IntakeListView';
import { PrintScheduleModal } from './components/PrintScheduleModal';
import { useProjectStore, type Department } from './store/useProjectStore';
import { useAuthStore } from './store/useAuthStore';
import { exportProjectsToExcel, importProjectsFromExcel } from './services/excelService';

// 좌측 카테고리 정의 (최상단에 '프로젝트 접수목록' 추가)
export type NavCategory =
  | '프로젝트 접수목록'
  | '프로젝트 일정표(전체)'
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

  // 기본 활성 메뉴: 프로젝트 일정표(전체)
  const [activeMenu, setActiveMenu] = useState<NavCategory>('프로젝트 일정표(전체)');
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
    allSchedule: lang === 'vi' ? 'Toàn bộ tiến độ' : '프로젝트 일정표(전체)',
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
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveMenu('프로젝트 일정표(전체)')}>
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

        {/* 우측 글로벌 액션: 엑셀/인쇄/언어토글/다크모드/프로필 */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          {/* 1) 엑셀 내보내기 / 가져오기 */}
          <button
            onClick={handleExportExcel}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 flex items-center gap-1 transition"
            title="현재 프로젝트 일정을 엑셀 파일로 다운로드"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span className="hidden sm:inline">{t.exportExcel}</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 hover:border-blue-300 flex items-center gap-1 transition"
            title="수정된 엑셀 파일을 업로드하여 일정표 동기화"
          >
            <Upload size={14} className="text-blue-600" />
            <span className="hidden sm:inline">{t.importExcel}</span>
          </button>

          {/* 2) A4 가로 전용 일정표 인쇄 모달 열기 */}
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#00338d] hover:bg-[#002266] text-white flex items-center gap-1.5 shadow-xs transition"
          >
            <Printer size={14} />
            <span>{t.printSchedule}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* 3) 베트남어 / 한국어 토글 버튼 */}
          <button
            onClick={() => setLang(lang === 'ko' ? 'vi' : 'ko')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300 transition"
            title="언어 전환 (한국어 / Tiếng Việt)"
          >
            <Globe size={14} className="text-blue-500" />
            <span>{lang === 'ko' ? 'Tiếng Việt' : '한국어'}</span>
          </button>

          {/* 4) 다크모드 토글 스위치 */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title={darkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* 5) 회원 로그인 프로필 칩 */}
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

              {/* 프로젝트 일정표(전체) */}
              <button
                onClick={() => {
                  setActiveMenu('프로젝트 일정표(전체)');
                  setFilterDepartment('ALL');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeMenu === '프로젝트 일정표(전체)'
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
                    activeMenu === '프로젝트 일정표(전체)'
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
                  setActiveMenu('프로젝트 일정표(전체)');
                }
              }}
            />
          )}

          {/* CASE 1: 프로젝트 일정표(전체) */}
          {activeMenu === '프로젝트 일정표(전체)' && (
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

              {/* 4대 핵심 KPI 카드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="stat-card dark:bg-slate-800 dark:border-slate-700">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    전체 프로젝트
                  </span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">{totalCount}</span>
                  </div>
                </div>

                <div className="stat-card border-blue-200 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#00338d] dark:text-blue-300 uppercase tracking-wider">
                      산출 진행중
                    </span>
                    <span className="text-[10px] font-extrabold text-[#00338d] bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded">
                      진행률 통제
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-black text-[#00338d] dark:text-blue-400">{inProgressCount}</span>
                    <span className="text-xs font-bold text-slate-500">납품 공정 준수</span>
                  </div>
                </div>

                <div className="stat-card border-amber-200 dark:border-amber-900 bg-amber-50/20 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                      도면변경 / 수정 (REV)
                    </span>
                    <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded">
                      공종 집중 투입
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{revCount}</span>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">변경점 추적</span>
                  </div>
                </div>

                <div className="stat-card border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 dark:bg-emerald-950/20">
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    착수예정 & 납품
                  </span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{scheduledCount}</span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">품질검수 완료</span>
                  </div>
                </div>
              </div>

              {/* 메인 캘린더 컴포넌트 */}
              <ProjectCalendar
                onOpenPrintModal={() => setIsPrintModalOpen(true)}
                onExportExcel={handleExportExcel}
                onImportExcel={() => fileInputRef.current?.click()}
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
    </div>
  );
}
