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
import { useProjectStore, type Project } from '../store/useProjectStore';
import { exportProjectsToExcel, importProjectsFromExcel } from '../services/excelService';

// 한국 및 베트남 주요 공휴일 (2026년 기준 맵)
const HOLIDAYS_2026: Record<string, { country: 'KR' | 'VN' | 'UK'; name: string }> = {
  // 9월
  '2026-09-02': { country: 'VN', name: '베트남 독립기념일' },
  '2026-09-03': { country: 'VN', name: '베트남 국경일 연휴' },
  '2026-09-24': { country: 'KR', name: '추석 연휴' },
  '2026-09-25': { country: 'KR', name: '추석' },
  '2026-09-26': { country: 'KR', name: '추석 연휴' },
  // 10월
  '2026-10-03': { country: 'KR', name: '개천절' },
  '2026-10-09': { country: 'KR', name: '한글날' },
};

interface ProjectCalendarProps {
  onOpenPrintModal?: () => void;
  onExportExcel?: () => void;
  onImportExcel?: () => void;
}

export default function ProjectCalendar({
  onOpenPrintModal,
  onExportExcel,
  onImportExcel,
}: ProjectCalendarProps) {
  const {
    projects,
    personnel,
    filterDepartment,
    setSelectedProjectId,
    setProjects,
  } = useProjectStore();

  // 2026년 9월 기본 기준일
  const [currentDate, setCurrentDate] = useState(new Date('2026-09-17'));
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

  // 2차: 현재 조회 월(예: 9월)에 일정이 있는 프로젝트만 필터링 (사용자 요청 핵심 반영)
  const filteredProjects = useMemo(() => {
    if (!onlyCurrentMonth) return deptProjects;

    return deptProjects.filter((project) => {
      // 1) 메인 일정과 당월 겹침 여부
      const hasMainOverlap = !(project.endDate < monthStartStr || project.startDate > monthEndStr);
      // 2) 세부 공종 일정과 당월 겹침 여부
      const hasSubOverlap = Object.values(project.subTasks || {}).some((st) => {
        if (!st.startDate || !st.endDate) return false;
        return !(st.endDate < monthStartStr || st.startDate > monthEndStr);
      });
      return hasMainOverlap || hasSubOverlap;
    });
  }, [deptProjects, onlyCurrentMonth, monthStartStr, monthEndStr]);

  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const today = new Date('2026-09-17'); // 현재 작업 기준일

  const cellWidth = 36; // 1일당 가로 너비 (px)

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date('2026-09-17'));

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

  // 간트 바 위치 계산
  const getGanttBarStyle = (project: Project) => {
    const start = new Date(project.startDate);
    const end = new Date(project.endDate);

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

  return (
    <div className="corporate-card overflow-hidden">
      {/* 숨김 엑셀 파일 입력 필드 (자체 fallback) */}
      <input
        ref={internalFileInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={handleInternalFileChange}
        className="hidden"
      />

      {/* 1. 상단 컨트롤 헤더 (스크린샷 1 구현) */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-800">
              {format(currentDate, 'yyyy년 M월', { locale: ko })}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {format(currentDate, 'M월')} 진행 프로젝트: {filteredProjects.length}건
            </span>
            {onlyCurrentMonth && (
              <span className="text-xs text-slate-500 font-medium">
                (일정 없는 {deptProjects.length - filteredProjects.length}개 프로젝트 숨김됨)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Info size={13} className="text-[#00338d]" />
            한국 본사 · VIETQS 정밀 캘린더 (날짜 칸의 무늬와 마우스 오버로 어느 지사의 휴일인지 확인하세요.)
          </p>
        </div>

        {/* 상단 액션 버튼 그룹 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 당월 일정만 보기 토글 버튼 */}
          <button
            onClick={() => setOnlyCurrentMonth(!onlyCurrentMonth)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition ${
              onlyCurrentMonth
                ? 'bg-blue-50 text-[#00338d] border-blue-200 hover:bg-blue-100'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title="현재 조회 중인 월에 일정이 있는 프로젝트만 필터링합니다."
          >
            <span className={`w-2 h-2 rounded-full ${onlyCurrentMonth ? 'bg-[#00338d]' : 'bg-slate-400'}`} />
            {onlyCurrentMonth ? `${format(currentDate, 'M월')} 일정만 표시` : '전체 프로젝트 표시'}
          </button>

          <button
            onClick={handleSafePrint}
            className="btn-stitch-primary text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Printer size={14} /> 전체 일정표 출력 (A4 가로)
          </button>

          <button
            onClick={handleSafeExportExcel}
            className="btn-stitch-secondary text-xs flex items-center gap-1.5 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            엑셀 내보내기 (.xlsx)
          </button>

          <button
            onClick={handleSafeImportClick}
            className="btn-stitch-secondary text-xs flex items-center gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            엑셀 가져오기 (.xlsx)
          </button>

          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs ml-2">
            <button
              onClick={() => setViewMode('30일')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === '30일' ? 'bg-[#00338d] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30일
            </button>
            <button
              onClick={() => setViewMode('월별')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === '월별' ? 'bg-[#00338d] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              월별 보기
            </button>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
              title="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            >
              오늘
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
              title="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 공휴일 범례 안내 바 */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <span className="font-semibold text-slate-700">물량산출 프로젝트 공정 타임라인</span>
        <div className="flex items-center gap-4">
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
        <div style={{ minWidth: `${360 + daysInMonth.length * cellWidth}px` }}>
          {/* 3-1. 날짜 헤더 행 */}
          <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600 select-none">
            {/* 고정 열 1: 프로젝트 정보 */}
            <div className="w-[200px] flex-shrink-0 px-3 py-2.5 border-r border-slate-200 flex items-center">
              프로젝트 정보
            </div>
            {/* 고정 열 2: 공정률 */}
            <div className="w-[80px] flex-shrink-0 px-2 py-2.5 border-r border-slate-200 text-center">
              공정률
            </div>
            {/* 고정 열 3: 담당 PM */}
            <div className="w-[80px] flex-shrink-0 px-2 py-2.5 border-r border-slate-200 text-center">
              담당 PM
            </div>
            {/* 날짜 그리드 열 */}
            <div className="flex-1 flex">
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
                    className={`flex-shrink-0 flex flex-col items-center justify-center py-1.5 border-r border-slate-200 relative ${patternClass} ${
                      isCurrent ? 'bg-sky-100/70 font-bold' : ''
                    }`}
                    title={holiday ? `${holiday.name} (${holiday.country})` : undefined}
                  >
                    <span
                      className={`text-[11px] leading-tight ${
                        isSun ? 'text-red-500 font-bold' : isSat ? 'text-blue-500 font-bold' : 'text-slate-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {format(day, 'E', { locale: ko })}
                    </span>
                    {holiday && (
                      <span
                        className={`text-[8px] font-extrabold px-0.5 rounded leading-none mt-0.5 ${
                          holiday.country === 'KR'
                            ? 'text-red-600 bg-red-100'
                            : 'text-teal-700 bg-teal-100'
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

          {/* 3-2. 프로젝트별 간트 행 목록 */}
          <div className="divide-y divide-slate-100 bg-white">
            {filteredProjects.map((project) => {
              const pmPerson = personnel.find((p) => p.id === project.pmId);
              const barStyle = getGanttBarStyle(project);

              // 부서별 태그 색상
              const deptBadgeClass =
                project.department === '마감팀'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : project.department === '구조팀'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <div
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className="flex items-center hover:bg-slate-50/80 transition-colors group cursor-pointer text-xs"
                >
                  {/* 프로젝트 정보 */}
                  <div className="w-[200px] flex-shrink-0 px-3 py-3 border-r border-slate-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${deptBadgeClass}`}>
                        {project.department}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {project.code}
                      </span>
                    </div>
                    <div className="font-bold text-slate-800 group-hover:text-[#00338d] transition-colors line-clamp-1">
                      {project.name}
                    </div>
                  </div>

                  {/* 공정률 */}
                  <div className="w-[80px] flex-shrink-0 px-2 py-3 border-r border-slate-200 text-center">
                    <span className="font-extrabold text-[#00338d] block text-xs">
                      {project.progress}%
                    </span>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className="bg-[#00338d] h-full rounded-full"
                        style={{ width: `${project.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 담당 PM */}
                  <div className="w-[80px] flex-shrink-0 px-2 py-3 border-r border-slate-200 text-center">
                    <span className="font-bold text-slate-700">
                      {pmPerson ? pmPerson.name.split(' ')[0] : '미지정'}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {pmPerson?.team || 'PM'}
                    </span>
                  </div>

                  {/* 일자별 간트 타임라인 영역 */}
                  <div className="flex-1 relative h-14 flex items-center">
                    {/* 배경 그리드 컬럼 */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {daysInMonth.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const holiday = HOLIDAYS_2026[dateKey];
                        const weekend = isWeekend(day);
                        let bgPattern = '';
                        if (holiday?.country === 'KR') bgPattern = 'pattern-holiday-kr';
                        else if (holiday?.country === 'VN') bgPattern = 'pattern-holiday-vn';
                        else if (weekend) bgPattern = 'bg-slate-50/60';

                        return (
                          <div
                            key={dateKey}
                            style={{ width: `${cellWidth}px` }}
                            className={`flex-shrink-0 border-r border-slate-100 h-full ${bgPattern}`}
                          ></div>
                        );
                      })}
                    </div>

                    {/* 프로젝트 간트 바 */}
                    {barStyle && (
                      <div
                        style={barStyle}
                        className="absolute h-8 rounded-lg gantt-bar-primary text-white flex items-center px-3 text-[11px] font-bold shadow-md hover:scale-[1.01] transition-transform z-10 overflow-hidden"
                      >
                        <span className="truncate drop-shadow-sm">
                          {project.name}
                        </span>
                        <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">
                          {project.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. 하단 상태 안내 범례 바 */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00338d]"></span> 프로젝트 기간
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span> 오늘
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> 주말
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-600 font-medium">
            💡 프로젝트를 클릭하면 공종별 상세 성과물 일정 팝업이 열립니다.
          </span>
        </div>
        <div>
          총 <strong className="text-slate-800">{filteredProjects.length}</strong>개 프로젝트 조회 중
        </div>
      </div>
    </div>
  );
}
