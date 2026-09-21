import { useState, useMemo, useRef } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  differenceInDays,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isWeekend
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Printer, Info } from 'lucide-react';
import { useProjectStore, type Department } from '../store/useProjectStore';
import { exportProjectsToExcel, importProjectsFromExcel } from '../services/excelService';

import { HOLIDAYS_2026 } from '../constants/holidays';

interface ProjectCalendarProps {
  onOpenPrintModal?: () => void;
  onExportExcel?: () => void;
  onImportExcel?: () => void;
  onSelectProject?: (projectCode: string) => void;
  lang?: 'ko' | 'vi';
}

export default function ProjectCalendar({
  onOpenPrintModal,
  onExportExcel,
  onImportExcel,
  onSelectProject,
  lang = 'ko',
}: ProjectCalendarProps) {
  const {
    projects,
    personnel,
    filterDepartment,
    setSelectedProjectId,
    setProjects,
  } = useProjectStore();

  // 실시간 오늘 기준일 (2026-09-21)
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  // 다국어 라벨 사전
  const t = {
    titleDate: lang === 'vi' ? format(currentDate, 'Tháng M năm yyyy') : format(currentDate, 'yyyy년 M월', { locale: ko }),
    activeCount: lang === 'vi' ? 'Dự án đang tiến hành' : '진행 프로젝트',
    hiddenCount: (count: number) => lang === 'vi' ? `(Ẩn ${count} dự án không có lịch)` : `(일정 없는 ${count}개 프로젝트 숨김됨)`,
    guideNotice: lang === 'vi' ? 'Lịch trình kỹ thuật CONCOST Trụ sở chính & VIETQS' : '한국 본사 · VIETQS 정밀 캘린더 (날짜 칸의 무늬와 마우스 오버로 어느 지사의 휴일인지 확인하세요.)',
    btnMonthOnly: (m: string) => lang === 'vi' ? `Chỉ lịch tháng ${m}` : `${m}월 일정만 표시`,
    btnAllProjects: lang === 'vi' ? 'Hiện toàn bộ dự án' : '전체 프로젝트 표시',
    btnPrintA4: lang === 'vi' ? 'In toàn bộ tiến độ (A4)' : '전체 일정표 출력 (A4 가로)',
    btnExportExcel: lang === 'vi' ? 'Xuất Excel (.xlsx)' : '엑셀 내보내기 (.xlsx)',
    btnImportExcel: lang === 'vi' ? 'Nhập Excel (.xlsx)' : '엑셀 가져오기 (.xlsx)',
    btn30Days: lang === 'vi' ? '30 ngày' : '30일',
    btnMonthly: lang === 'vi' ? 'Xem theo tháng' : '월별 보기',
    btnToday: lang === 'vi' ? 'Hôm nay' : '오늘',
    legendKr: lang === 'vi' ? 'Nghỉ lễ Hàn Quốc' : '한국 공휴일',
    legendVn: lang === 'vi' ? 'Nghỉ lễ Việt Nam' : '베트남 휴일',
    legendUk: lang === 'vi' ? 'Nghỉ tài chính UK' : '영국 금융 휴일',
    colProject: lang === 'vi' ? 'Thông tin dự án' : '프로젝트 정보',
    colProgress: lang === 'vi' ? 'Tiến độ' : '공정률',
    colPm: lang === 'vi' ? 'Chủ trì PM' : '담당 PM',
  };

  const [viewMode, setViewMode] = useState<'30일' | '월별'>('월별');
  // 사용자의 요구사항: "일정표에서 9월에 일정이 없는 프로젝트는 표현안해야지" -> 기본값 true
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(true);

  // 파일 입력 ref (자체 지원)
  const internalFileInputRef = useRef<HTMLInputElement>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  // 1차: 부서(팀) 필터링
  const deptProjects = filterDepartment === 'ALL'
    ? projects
    : projects.filter(p => p.department === filterDepartment);

  // 2차: 현재 조회 월(예: 9월)에 실제로 진행 중인 프로젝트만 필터링 (사용자 요구: 9월 실제 진행 15개 정합성 확보)
  const filteredProjects = useMemo(() => {
    if (!onlyCurrentMonth) return deptProjects;

    return deptProjects.filter((project) => {
      // 1) 메인 일정이 당월과 겹치는지 여부
      const hasMainOverlap = !(project.endDate < monthStartStr || project.startDate > monthEndStr);
      if (!hasMainOverlap) return false;

      // 2) 이미 납품 완료된 프로젝트(100% 완료)는 9월 진행 중 목록에서 제외
      if (project.status === '납품' || project.progress >= 100) return false;

      // 3) 당월 초순(9월 5일 이전)에 이미 종결된 구 프로젝트 제외
      if (project.endDate < '2026-09-05') return false;

      return true;
    });
  }, [deptProjects, onlyCurrentMonth, monthStartStr, monthEndStr]);

  // 3차: 사용자 요청 핵심 반영 - "프로젝트하나에서 2갈래로 나뉘어져서 구조 마감팀 일정이 같이 보이게 통합"
  const groupedProjects = useMemo(() => {
    const groupMap: Record<string, {
      code: string;
      name: string;
      client: string;
      area?: string;
      usage?: string;
      buildings?: string;
      floors?: string;
      departments: Department[];
      lanes: {
        projectId: string;
        department: Department;
        pmPerson?: (typeof personnel)[0];
        startDate: string;
        endDate: string;
        progress: number;
        status: string;
      }[];
    }> = {};

    filteredProjects.forEach((p) => {
      const code = p.code || p.id;
      if (!groupMap[code]) {
        groupMap[code] = {
          code: p.code,
          name: p.name,
          client: (p as any).client || '',
          area: (p as any).area || '',
          usage: (p as any).usage || '',
          buildings: (p as any).buildings || '',
          floors: (p as any).floors || '',
          departments: [],
          lanes: [],
        };
      }

      if (!groupMap[code].departments.includes(p.department)) {
        groupMap[code].departments.push(p.department);
      }

      const pmPerson = personnel.find((pe) => pe.id === p.pmId);

      groupMap[code].lanes.push({
        projectId: p.id,
        department: p.department,
        pmPerson,
        startDate: p.startDate,
        endDate: p.endDate,
        progress: p.progress,
        status: p.status,
      });
    });

    const deptOrder: Record<Department, number> = {
      '마감팀': 1,
      '구조팀': 2,
      '토목&조경팀': 3,
    };

    return Object.values(groupMap).map((grp) => {
      grp.lanes.sort((a, b) => (deptOrder[a.department] || 99) - (deptOrder[b.department] || 99));
      return grp;
    });
  }, [filteredProjects, personnel]);

  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // 오늘 기준일 (2026-09-21 등 실제 현재 날짜 실시간 연동)
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const cellWidth = 36; // 1일당 가로 너비 (px)

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  // 엑셀 내보내기 안전 실행
  const handleSafeExportExcel = () => {
    if (onExportExcel) {
      onExportExcel();
    } else {
      exportProjectsToExcel(projects, personnel);
    }
  };

  // 엑셀 가져오기 클릭 트리거
  const handleSafeImportClick = () => {
    if (onImportExcel) {
      onImportExcel();
    } else {
      internalFileInputRef.current?.click();
    }
  };

  // 내부 엑셀 파일 파싱 핸들러
  const handleInternalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importProjectsFromExcel(file, personnel);
      if (imported.length > 0) {
        setProjects(imported);
        alert(`성공: 엑셀에서 ${imported.length}개 프로젝트 일정을 동기화하였습니다.`);
      } else {
        alert('엑셀 파일에서 유효한 프로젝트 데이터를 찾지 못했습니다.');
      }
    } catch (err: any) {
      alert('엑셀 파싱 오류: ' + (err?.message || err));
    } finally {
      if (internalFileInputRef.current) internalFileInputRef.current.value = '';
    }
  };

  // 인쇄 안전 실행
  const handleSafePrint = () => {
    if (onOpenPrintModal) {
      onOpenPrintModal();
    } else {
      window.print();
    }
  };

  // 레인별 간트 바 위치 계산 (2갈래 타임라인 대응)
  const getLaneBarStyle = (startDateStr: string, endDateStr: string) => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    const effStart = start < monthStart ? monthStart : start;
    const effEnd = end > monthEnd ? monthEnd : end;

    if (effStart > monthEnd || effEnd < monthStart) return null;

    const left = differenceInDays(effStart, monthStart) * cellWidth;
    const width = (differenceInDays(effEnd, effStart) + 1) * cellWidth;

    return {
      left: `${left + 2}px`,
      width: `${Math.max(width - 4, 30)}px`,
    };
  };

  // 프로젝트 명칭 정제 함수
  const getCleanProjectName = (name: string) => {
    return name.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() || name;
  };

  return (
    <div className="corporate-card overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      {/* 숨김 엑셀 파일 입력 필드 (자체 fallback) */}
      <input
        ref={internalFileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={handleInternalFileChange}
        className="hidden"
      />

      {/* 1. 상단 컨트롤 헤더 (다크모드 단일 톤 적용) */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">
              {lang === 'vi' ? format(currentDate, 'Tháng M năm yyyy') : format(currentDate, 'yyyy년 M월', { locale: ko })}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              {format(currentDate, 'M')}월 {t.activeCount}: 실 진행 {groupedProjects.length}개 프로젝트
            </span>
            {onlyCurrentMonth && (
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                (마감·구조·토목 협업 통합 표현, 완료·타월 {projects.length - filteredProjects.length}건 숨김)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5 font-medium">
            <Info size={13} className="text-[#00338d] dark:text-blue-400" />
            {t.guideNotice}
          </p>
        </div>

        {/* 상단 액션 버튼 그룹 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 당월 일정만 보기 토글 버튼 */}
          <button
            onClick={() => setOnlyCurrentMonth(!onlyCurrentMonth)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition ${
              onlyCurrentMonth
                ? 'bg-blue-50 dark:bg-blue-950/60 text-[#00338d] dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title="현재 조회 중인 월에 일정이 있는 프로젝트만 필터링합니다."
          >
            <span className={`w-2 h-2 rounded-full ${onlyCurrentMonth ? 'bg-[#00338d] dark:bg-blue-400' : 'bg-slate-400'}`} />
            {onlyCurrentMonth ? t.btnMonthOnly(format(currentDate, 'M')) : t.btnAllProjects}
          </button>

          <button
            onClick={handleSafePrint}
            className="btn-stitch-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Printer size={14} /> {t.btnPrintA4}
          </button>

          <button
            onClick={handleSafeExportExcel}
            className="btn-stitch-secondary text-xs flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 dark:border-slate-700"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {t.btnExportExcel}
          </button>

          <button
            onClick={handleSafeImportClick}
            className="btn-stitch-secondary text-xs flex items-center gap-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 hover:border-blue-300 dark:border-slate-700"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {t.btnImportExcel}
          </button>

          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs ml-2">
            <button
              onClick={() => setViewMode('30일')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === '30일' ? 'bg-[#00338d] text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.btn30Days}
            </button>
            <button
              onClick={() => setViewMode('월별')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === '월별' ? 'bg-[#00338d] text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.btnMonthly}
            </button>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            >
              {t.btnToday}
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 범례 및 공종 표시 툴바 */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-300">
          물량산출 프로젝트 공정 타임라인
        </span>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm border border-red-300 pattern-holiday-kr"></span>
            한국 공휴일
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm border border-teal-300 pattern-holiday-vn"></span>
            베트남 휴일
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm border border-slate-300 pattern-holiday-uk"></span>
            영국 금융 휴일
          </span>
        </div>
      </div>

      {/* 3. 간트 그리드 본체 (수평 스크롤) */}
      <div className="overflow-x-auto custom-scrollbar">
        <div style={{ minWidth: `${410 + daysInMonth.length * cellWidth}px` }}>
          {/* 3-1. 날짜 헤더 행 */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-850 text-xs font-semibold text-slate-700 dark:text-slate-200 select-none">
            {/* 고정 열 1: 프로젝트 정보 (본문 w-[230px]와 1:1 일치) */}
            <div className="w-[230px] flex-shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-extrabold text-slate-900 dark:text-white">{t.colProject}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">클릭시 세부일정</span>
            </div>
            {/* 고정 열 2: 공정률 (본문 w-[85px]와 1:1 일치) */}
            <div className="w-[85px] flex-shrink-0 px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-extrabold text-slate-900 dark:text-white">
              {t.colProgress}
            </div>
            {/* 고정 열 3: 담당 PM (본문 w-[95px]와 1:1 일치) */}
            <div className="w-[95px] flex-shrink-0 px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-extrabold text-slate-900 dark:text-white">
              {t.colPm}
            </div>
            {/* 날짜 그리드 열 (헤더와 본문 그리드 픽셀 1:1 고정) */}
            <div className="flex shrink-0" style={{ width: `${daysInMonth.length * cellWidth}px` }}>
              {daysInMonth.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const holiday = HOLIDAYS_2026[dateKey];
                const dayNum = getDay(day);
                const isSun = dayNum === 0;
                const isSat = dayNum === 6;
                const isCurrent = isSameDay(day, today);

                let patternClass = '';
                if (holiday?.country === 'KR') patternClass = 'pattern-holiday-kr';
                else if (holiday?.country === 'VN') patternClass = 'pattern-holiday-vn';
                else if (holiday?.country === 'UK') patternClass = 'pattern-holiday-uk';

                return (
                  <div
                    key={dateKey}
                    style={{ width: `${cellWidth}px` }}
                    className={`flex-shrink-0 flex flex-col items-center justify-center py-1.5 border-r border-slate-200 dark:border-slate-700 relative ${patternClass} ${
                      isCurrent ? 'bg-sky-100/70 dark:bg-blue-950/60 font-bold' : ''
                    }`}
                    title={holiday ? `${holiday.name} (${holiday.country})` : undefined}
                  >
                    <span
                      className={`text-[11px] leading-tight ${
                        isSun ? 'text-red-500 font-bold' : isSat ? 'text-blue-500 font-bold' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500">
                      {format(day, 'E', { locale: ko })}
                    </span>
                    {holiday && (
                      <span
                        className={`text-[8px] font-extrabold px-0.5 rounded leading-none mt-0.5 ${
                          holiday.country === 'KR'
                            ? 'text-red-600 bg-red-100 dark:bg-red-950/80 dark:text-red-300'
                            : 'text-teal-700 bg-teal-100 dark:bg-teal-950/80 dark:text-teal-300'
                        }`}
                      >
                        {holiday.country}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3-2. 통합 프로젝트별 간트 행 목록 (마감+구조+토목 2~3갈래 통합 렌더링, 단일 다크톤 통일) */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {groupedProjects.map((group) => {
              const laneCount = group.lanes.length;
              const isMultiLane = laneCount > 1;
              // 1단: 50px, 2단: 76px, 3단: 108px, N단: laneCount * 32 + 12px
              const rowMinHeight = laneCount <= 1 ? 50 : laneCount === 2 ? 76 : laneCount * 32 + 14;
              const rowBgClass = 'bg-white dark:bg-slate-900';

              const handleRowClick = () => {
                if (onSelectProject) {
                  onSelectProject(group.code);
                } else if (group.lanes[0]?.projectId) {
                  setSelectedProjectId(group.lanes[0]?.projectId);
                }
              };

              return (
                <div
                  key={group.code}
                  style={{ minHeight: `${rowMinHeight}px` }}
                  className={`flex items-stretch ${rowBgClass} hover:bg-blue-50/30 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer text-xs`}
                >
                  {/* 고정 열 1: 프로젝트 통합 정보 (클릭 시 프로젝트 통합 공종 투입 현황 팝업 열림) */}
                  <div
                    onClick={handleRowClick}
                    className="w-[230px] flex-shrink-0 p-3 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/70 transition-colors"
                    title="클릭하여 프로젝트 통합 공종 투입 현황 열기"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[10px] text-slate-700 dark:text-slate-200 font-mono font-black bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                        {group.code}
                      </span>
                      {group.departments.map((dept) => {
                        const badgeStyle =
                          dept === '마감팀'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700'
                            : dept === '구조팀'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700';

                        return (
                          <span
                            key={dept}
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${badgeStyle}`}
                          >
                            {dept}
                          </span>
                        );
                      })}
                    </div>
                    <div className="font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 leading-tight">
                      {group.name}
                    </div>
                    {(group as any).area && (
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                          연면적 {(group as any).area}
                        </span>
                        {(group as any).usage && (
                          <span className="text-[9px] text-slate-600 dark:text-slate-300 font-medium">
                            · {(group as any).usage}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 고정 열 2: 공정률 (마감/구조/토목 상하 분할, 클릭 시 세부 모달 열림) */}
                  <div
                    onClick={handleRowClick}
                    className="w-[85px] flex-shrink-0 p-2 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    title="클릭하여 프로젝트 통합 공종 투입 현황 열기"
                  >
                    {group.lanes.map((lane) => {
                      const colorText =
                        lane.department === '마감팀'
                          ? 'text-blue-600 dark:text-blue-300'
                          : lane.department === '구조팀'
                          ? 'text-purple-600 dark:text-purple-300'
                          : 'text-emerald-600 dark:text-emerald-300';
                      const colorBg =
                        lane.department === '마감팀'
                          ? 'bg-blue-600'
                          : lane.department === '구조팀'
                          ? 'bg-purple-600'
                          : 'bg-emerald-600';

                      return (
                        <div key={lane.projectId} className="my-0.5">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-slate-600 dark:text-slate-300 font-semibold">{lane.department.slice(0, 2)}</span>
                            <span className={`${colorText} font-black`}>{lane.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                            <div
                              className={`h-full rounded-full ${colorBg}`}
                              style={{ width: `${lane.progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 고정 열 3: 담당 PM (마감/구조/토목 상하 분할, 클릭 시 세부 모달 열림) */}
                  <div
                    onClick={handleRowClick}
                    className="w-[95px] flex-shrink-0 p-2 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center text-center cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                    title="클릭하여 프로젝트 통합 공종 투입 현황 열기"
                  >
                    {group.lanes.map((lane) => {
                      const badgeColor =
                        lane.department === '마감팀'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : lane.department === '구조팀'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';

                      return (
                        <div key={lane.projectId} className="my-0.5 flex items-center justify-center gap-1">
                          <span className={`text-[9px] font-black px-1 rounded ${badgeColor}`}>
                            {lane.department.slice(0, 2)}
                          </span>
                          <span className="font-black text-slate-900 dark:text-white text-xs">
                            {lane.pmPerson ? lane.pmPerson.name.split(' ')[0] : 'PM'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* 일자별 간트 타임라인 영역 (행 전체 높이에 100% 맞춰 휴일 빗금 끊김 원천 차단) */}
                  <div
                    className="flex shrink-0 relative self-stretch"
                    style={{
                      width: `${daysInMonth.length * cellWidth}px`,
                      minHeight: `${rowMinHeight}px`,
                    }}
                  >
                    {/* 배경 그리드 컬럼 (행의 위부터 아래 끝까지 100% 완전 채움) */}
                    <div className="absolute inset-0 flex pointer-events-none h-full">
                      {daysInMonth.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const holiday = HOLIDAYS_2026[dateKey];
                        const weekend = isWeekend(day);
                        let bgPattern = '';

                        // 1순위: 공휴일 (주말과 겹치더라도 빗금 패턴 반드시 렌더링하여 끊김 원천 차단)
                        if (holiday?.country === 'KR') {
                          bgPattern = 'pattern-holiday-kr';
                        } else if (holiday?.country === 'VN') {
                          bgPattern = 'pattern-holiday-vn';
                        } else if (holiday?.country === 'UK') {
                          bgPattern = 'pattern-holiday-uk';
                        } else if (weekend) {
                          // 2순위: 일반 주말 음영
                          bgPattern = 'bg-slate-100/90 dark:bg-slate-800/80';
                        }

                        return (
                          <div
                            key={dateKey}
                            style={{ width: `${cellWidth}px` }}
                            className={`flex-shrink-0 border-r border-slate-200/80 dark:border-slate-800 h-full ${bgPattern}`}
                          />
                        );
                      })}
                    </div>

                    {/* 오늘 기준선 */}
                    {daysInMonth.some((d) => isSameDay(d, today)) && (
                      <div
                        className="absolute top-0 bottom-0 z-10 border-l-2 border-red-500 pointer-events-none"
                        style={{
                          left: `${
                            differenceInDays(today, monthStart) * cellWidth + cellWidth / 2
                          }px`,
                        }}
                      />
                    )}

                    {/* 부서별 간트 바 렌더링 (마감 1단 / 구조 2단 / 토목 3단 완전 분리) */}
                    {group.lanes.map((lane, laneIdx) => {
                      const barStyle = getLaneBarStyle(lane.startDate, lane.endDate);
                      if (!barStyle) return null;

                      // 동적 레인 수직 위치 계산: 1개면 11px 중앙, 다중 레인이면 각 32px 간격으로 1단(8px), 2단(40px), 3단(72px) 완벽 분리
                      const topPos = isMultiLane ? (laneIdx * 32 + 8) : 11;
                      const laneGradient =
                        lane.department === '마감팀'
                          ? 'bg-gradient-to-r from-blue-600 via-blue-650 to-blue-700 border-blue-400'
                          : lane.department === '구조팀'
                          ? 'bg-gradient-to-r from-purple-600 via-indigo-650 to-purple-700 border-purple-400'
                          : 'bg-gradient-to-r from-emerald-600 via-teal-650 to-emerald-700 border-emerald-400';

                      return (
                        <div
                          key={lane.projectId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick();
                          }}
                          style={{
                            ...barStyle,
                            top: `${topPos}px`,
                            height: '26px',
                          }}
                          title={`[${lane.department}] ${group.name}\n기간: ${lane.startDate} ~ ${lane.endDate}\n진척률: ${lane.progress}%\n담당: ${lane.pmPerson?.name || 'PM'}\n상태: ${lane.status}\n클릭하여 프로젝트 통합 공종 투입 현황 확인`}
                          className={`absolute rounded-lg border text-white flex items-center px-2.5 text-[11px] font-bold shadow-md hover:scale-[1.01] hover:brightness-110 transition-all z-20 cursor-pointer overflow-hidden ${laneGradient}`}
                        >
                          <span className="text-[9px] font-black bg-white/25 px-1 py-0.2 rounded mr-1.5 shrink-0">
                            {lane.department.slice(0, 2)}
                          </span>
                          <span className="truncate drop-shadow-xs font-semibold">
                            {getCleanProjectName(group.name)}
                          </span>
                          <span className="ml-auto text-[9px] bg-black/25 px-1 py-0.2 rounded font-mono shrink-0 pl-1">
                            {lane.pmPerson ? lane.pmPerson.name.split(' ')[0] : 'PM'} · {lane.progress}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. 하단 상태 안내 범례 바 */}
      <div className="p-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-2.5 rounded bg-blue-600 border border-blue-400"></span> 마감팀 일정
          </span>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-2.5 rounded bg-purple-600 border border-purple-400"></span> 구조팀 일정
          </span>
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="w-3 h-2.5 rounded bg-emerald-600 border border-emerald-400"></span> 토목&조경팀 일정
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            💡 하나의 프로젝트 행 안에 마감팀(파란색), 구조팀(보라색), 토목&조경팀(초록색) 일정이 공종별 층으로 동시 표현됩니다.
          </span>
        </div>
        <div>
          통합 <strong className="text-slate-800 dark:text-white">{groupedProjects.length}</strong>개 프로젝트 조회 중
        </div>
      </div>
    </div>
  );
}
