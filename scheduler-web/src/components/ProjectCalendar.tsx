import {printTranslated,translatedAlert} from '../services/translationService';
import { projectProgress, percentLabel,projectScheduleRange } from '../utils/scheduleProgress';
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
import { ko, vi } from 'date-fns/locale';
import { CalendarPlus, ChevronLeft, ChevronRight, Printer, Info } from 'lucide-react';
import { useProjectStore, type Department, type PostDeliveryTask, type Project, type ScheduleExtension } from '../store/useProjectStore';
import {postDeliveryDepartment,visiblePostDeliveryTasks,scheduleExtensionDepartment} from '../utils/postDeliveryVisibility';
import {isWeekendDay,validDay} from '../utils/personalWork';
import { exportProjectsToExcel, importProjectsFromExcel } from '../services/excelService';

import { projectHasNoPM, projectPMId, type PendingIntakeProject } from '../utils/pendingAssignment';
import {useAuthStore} from '../store/useAuthStore';
import {usePersonalStore} from '../store/usePersonalStore';
import {workDayInfo,calendarHoliday} from '../utils/workCalendar';
import {matchesScheduleProject,projectDisplayRanges} from '../utils/workCalendarDisplay';

const attendanceRequests=(project:Project,department:Department|'ALL',type:'WEEKEND'|'OVERTIME')=>(project.scheduleExtensions||[]).filter(request=>request.type===type&&request.status==='APPROVED'&&(type==='WEEKEND'?isWeekendDay(request.workDate||''):validDay(request.workDate||''))&&(department==='ALL'||scheduleExtensionDepartment(project,request)===department));

interface ProjectCalendarProps {
  date?: Date;
  onDateChange?: (date: Date) => void;
  onOpenPrintModal?: (date?: Date) => void;
  onOpenPostDelivery?: () => void;
  onOpenWorkCalendar?: () => void;
  onExportExcel?: (date?: Date) => void;
  onImportExcel?: () => void;
  onSelectProject?: (projectCode: string) => void;
  pendingIntake?: PendingIntakeProject[];
  onSelectIntake?: (item: PendingIntakeProject) => void;
  lang?: 'ko' | 'vi';
}

export default function ProjectCalendar({
  date,
  onDateChange,
  onOpenPrintModal,
  onOpenPostDelivery,
  onOpenWorkCalendar,
  onExportExcel,
  onImportExcel,
  onSelectProject,
  pendingIntake = [],
  onSelectIntake,
  lang = 'ko',
}: ProjectCalendarProps) {
  const {
    projects,
    personnel,
    filterDepartment,
    setSelectedProjectId,
    importProjects,
  } = useProjectStore();
  const users=useAuthStore(state=>state.users);
  const workCalendars=usePersonalStore(state=>state.workCalendars);

  // 실시간 오늘 기준일 (2026-09-21)
  const [localDate, setLocalDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const currentDate = date ?? localDate;
  const setCurrentDate = onDateChange ?? setLocalDate;

  // 다국어 라벨 사전
  const t = {
    titleDate: lang === 'vi' ? format(currentDate, "'Tháng' M 'năm' yyyy") : format(currentDate, 'yyyy년 M월', { locale: ko }),
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
  const [projectSearch,setProjectSearch]=useState('');

  // 파일 입력 ref (자체 지원)
  const internalFileInputRef = useRef<HTMLInputElement>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  // 1차: 부서(팀) 필터링
  const deptProjects = filterDepartment === 'ALL'
    ? projects
    : projects.filter(p => p.department === filterDepartment || visiblePostDeliveryTasks(p,filterDepartment).length || attendanceRequests(p,filterDepartment,'WEEKEND').length || attendanceRequests(p,filterDepartment,'OVERTIME').length);

  // 2차: 현재 조회 월(예: 9월)에 실제로 진행 중인 프로젝트만 필터링 (사용자 요구: 9월 실제 진행 15개 정합성 확보)
  const filteredProjects = useMemo(() => {
    const matching=deptProjects.filter(project=>matchesScheduleProject(project,projectSearch));
    if (!onlyCurrentMonth) return matching;

    return matching.filter((project) => {
      // 접수된 미배정 프로젝트는 기간이 과거/다음 달이어도 배정될 때까지 숨기지 않는다.
      const includesMain=filterDepartment==='ALL'||project.department===filterDepartment;
      if (includesMain&&(projectHasNoPM(project) || pendingIntake.some(item => item.code === project.code))) return true;
      // 1) 메인 일정이 당월과 겹치는지 여부
      const range=projectScheduleRange(project);
      const hasMainOverlap = includesMain&&Boolean(range.start&&range.end) && !(range.end < monthStartStr || range.start > monthEndStr);
      if(includesMain&&(!project.startDate||!project.endDate))return true;
      const hasFollowUp=visiblePostDeliveryTasks(project,filterDepartment).some(task=>task.startDate<=monthEndStr&&task.endDate>=monthStartStr);
      const hasWeekend=attendanceRequests(project,filterDepartment,'WEEKEND').some(request=>request.workDate!>=monthStartStr&&request.workDate!<=monthEndStr);
      const hasOvertime=attendanceRequests(project,filterDepartment,'OVERTIME').some(request=>request.workDate!>=monthStartStr&&request.workDate!<=monthEndStr);
      if (!hasMainOverlap&&!hasFollowUp&&!hasWeekend&&!hasOvertime) return false;

      // 2) 이미 납품 완료된 프로젝트(100% 완료)는 9월 진행 중 목록에서 제외
      if (!hasFollowUp&&!hasWeekend&&!hasOvertime&&(project.status === '납품' || project.progress >= 100)) return false;

      // 3) 당월 초순(9월 5일 이전)에 이미 종결된 구 프로젝트 제외


      return true;
    });
  }, [deptProjects, onlyCurrentMonth, monthStartStr, monthEndStr, pendingIntake, filterDepartment,projectSearch]);

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
        pmId:string;
        unassigned: boolean;
        startDate: string;
        endDate: string;
        progress: number;
        planned?: number;
        actual?: number;
        status: string;
        postDeliveryTasks: PostDeliveryTask[];
        weekendWork: ScheduleExtension[];
        overtime: ScheduleExtension[];
        postOnly: boolean;
        displayRanges:{startDate:string;endDate:string}[];
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

      const pmId = projectPMId(p);
      const pmPerson = personnel.find((pe) => pe.id === pmId);
      const includesMain=filterDepartment==='ALL'||p.department===filterDepartment;
      const weekends=attendanceRequests(p,filterDepartment,'WEEKEND').filter(request=>request.workDate!>=monthStartStr&&request.workDate!<=monthEndStr);
      const overtime=attendanceRequests(p,filterDepartment,'OVERTIME').filter(request=>request.workDate!>=monthStartStr&&request.workDate!<=monthEndStr);
      const followUps=visiblePostDeliveryTasks(p,filterDepartment).filter(task=>task.startDate<=monthEndStr&&task.endDate>=monthStartStr||[...weekends,...overtime].some(request=>request.taskId===`gen-${p.id}-followup-${task.id}`));
      const departments=[...new Set([...(includesMain?[p.department]:[]),...followUps.map(task=>postDeliveryDepartment(p,task)),...[...weekends,...overtime].map(request=>scheduleExtensionDepartment(p,request))])];
      for(const department of departments){
      const postOnly=department!==p.department;
      if(!groupMap[code].departments.includes(department))groupMap[code].departments.push(department);
      groupMap[code].lanes.push({
        projectId: p.id,
        department,
        pmPerson:postOnly?undefined:pmPerson,
        pmId:postOnly?'':pmId,
        unassigned: !postOnly&&projectHasNoPM(p),
        startDate:postOnly?'':projectScheduleRange(p).start,
        endDate:postOnly?'':projectScheduleRange(p).end,
        progress: p.progress,
        planned:postOnly?undefined:projectProgress(p).planned,
        actual:postOnly?undefined:projectProgress(p).actual,
        status: p.status,
        postDeliveryTasks:followUps.filter(task=>postDeliveryDepartment(p,task)===department),
        weekendWork:weekends.filter(request=>scheduleExtensionDepartment(p,request)===department),
        overtime:overtime.filter(request=>scheduleExtensionDepartment(p,request)===department),
        postOnly,
        displayRanges:postOnly?[]:projectDisplayRanges(p,department,monthStartStr,monthEndStr,users,workCalendars),
      });
      }
    });

    const deptOrder: Record<Department, number> = {
      '마감팀': 1,
      '구조팀': 2,
      '토목&조경팀': 3,
    };

    return Object.values(groupMap).map((grp) => {
      grp.lanes.sort((a, b) => (deptOrder[a.department] || 99) - (deptOrder[b.department] || 99));
      return grp;
    }).sort((a, b) => Number(b.lanes.some(lane => lane.unassigned)) - Number(a.lanes.some(lane => lane.unassigned)));
  }, [filteredProjects, personnel, monthStartStr, monthEndStr, filterDepartment,users,workCalendars]);

  const waitingIntake = filterDepartment === 'ALL'
    ? pendingIntake.filter((item, index, all) => matchesScheduleProject(item,projectSearch)&&all.findIndex(other => other.code === item.code) === index && !groupedProjects.some(group => group.code === item.code))
    : [];
  const pendingProjectCount = new Set([
    ...groupedProjects.filter(group => group.lanes.some(lane => lane.unassigned)).map(group => group.code),
    ...pendingIntake.filter(item => filterDepartment === 'ALL' || item.missingDepartments?.includes(filterDepartment)).map(item => item.code),
  ]).size;

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
      onExportExcel(currentDate);
    } else {
      exportProjectsToExcel(projects, personnel, currentDate, 1, filterDepartment);
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
        importProjects(imported);
        void translatedAlert(`성공: 엑셀에서 ${imported.length}개 프로젝트 일정을 동기화하였습니다.`);
      } else {
        void translatedAlert('엑셀 파일에서 유효한 프로젝트 데이터를 찾지 못했습니다.');
      }
    } catch (err: any) {
      void translatedAlert('엑셀 파싱 오류: ' + (err?.message || err));
    } finally {
      if (internalFileInputRef.current) internalFileInputRef.current.value = '';
    }
  };

  // 인쇄 안전 실행
  const handleSafePrint = () => {
    if (onOpenPrintModal) {
      onOpenPrintModal(currentDate);
    } else {
      void printTranslated();
    }
  };

  // 레인별 간트 바 위치 계산 (2갈래 타임라인 대응)
  const getLaneBarStyle = (startDateStr: string, endDateStr: string) => {
    if(!startDateStr||!endDateStr)return null;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    const effStart = start < monthStart ? monthStart : start;
    const effEnd = end > monthEnd ? monthEnd : end;

    if (effStart > monthEnd || effEnd < monthStart) return null;

    const left = differenceInDays(effStart, monthStart) / daysInMonth.length * 100;
    const width = (differenceInDays(effEnd, effStart) + 1) / daysInMonth.length * 100;

    return {
      left: `calc(${left}% + 2px)`,
      width: `calc(${width}% - 4px)`,
    };
  };

  // 프로젝트 명칭 정제 함수
  const getCleanProjectName = (name: string) => {
    return name.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim() || name;
  };

  return (
    <div className="corporate-card min-w-0 w-full overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">
              {lang === 'vi' ? format(currentDate, "'Tháng' M 'năm' yyyy") : format(currentDate, 'yyyy년 M월', { locale: ko })}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/70 dark:text-emerald-300 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              {lang === 'vi' ? `Hiển thị ${groupedProjects.length + waitingIntake.length} dự án` : `${format(currentDate, 'M')}월 프로젝트: ${groupedProjects.length + waitingIntake.length}개 표시`}
            </span>
            {pendingProjectCount > 0 && <span className="text-xs font-bold text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/70 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
              {lang === 'vi' ? `Mới · chưa phân công ${pendingProjectCount} dự án` : `신규 · 미배정 ${pendingProjectCount}개`}
            </span>}
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
        <div data-registration-toolbar="project" className="flex w-full items-center gap-2 flex-wrap">
          {/* 당월 일정만 보기 토글 버튼 */}
          <button
            onClick={() => setOnlyCurrentMonth(!onlyCurrentMonth)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition ${
              onlyCurrentMonth
                ? 'bg-blue-50 dark:bg-blue-950/60 text-[#00338d] dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title="현재 월의 일정을 표시합니다. 신규·미배정 프로젝트는 월과 관계없이 표시합니다."
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
          {onOpenPostDelivery&&<button data-post-delivery-register type="button" onClick={onOpenPostDelivery} className="ml-auto flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-xs font-bold text-white hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"><CalendarPlus size={15}/>프로젝트 보완 일정 등록</button>}
          {onOpenWorkCalendar&&<button type="button" onClick={onOpenWorkCalendar} className="flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><CalendarPlus size={15}/>VIET QS 근무일 등록</button>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 text-xs">
          <label className="flex min-w-0 flex-1 items-center gap-2 font-bold text-slate-700 dark:text-slate-200">프로젝트 찾기<input type="search" aria-label="프로젝트 일정표 프로젝트 찾기" value={projectSearch} onChange={event=>setProjectSearch(event.target.value)} placeholder="프로젝트 번호 또는 이름" className="min-w-0 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 placeholder:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"/></label>
          {projectSearch&&<button type="button" onClick={()=>setProjectSearch('')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100">검색 지우기</button>}
          <span role="status" className="font-semibold text-slate-700 dark:text-slate-200">{onlyCurrentMonth?'현재 월·팀 (신규 미배정 포함)':'전체 기간·선택 팀'} · {projectSearch?'검색 결과':'표시'} {groupedProjects.length+waitingIntake.length}개 프로젝트</span>
        </div>
      </div>

      {/* 2. 범례 및 공종 표시 툴바 */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-300">
          물량산출 프로젝트 공정 타임라인
        </span>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
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
      <div className="schedule-calendar-scrollport overflow-auto custom-scrollbar" role="region" aria-label={`${t.titleDate} 프로젝트 캘린더`} tabIndex={0}>
        <div data-calendar-month={format(monthStart, 'yyyy-MM')} style={{ width: '100%', minWidth: `${410 + daysInMonth.length * cellWidth}px` }}>
          {/* 3-1. 날짜 헤더 행 */}
          <div className="sticky top-0 z-40 flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 select-none">
            {/* 고정 열 1: 프로젝트 정보 (본문 w-[230px]와 1:1 일치) */}
            <div className="sticky left-0 z-50 bg-slate-100 dark:bg-slate-800 w-[230px] flex-shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between">
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
            <div className="flex flex-1 min-w-0">
              {daysInMonth.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const holiday = calendarHoliday(dateKey,workCalendars);
                const dayNum = getDay(day);
                const isSun = dayNum === 0;
                const isSat = dayNum === 6;
                const isCurrent = isSameDay(day, today);
                const vnDay=workDayInfo(dateKey,{company:'VIETQS',calendars:workCalendars});

                let patternClass = '';
                if (holiday?.country.includes('KR')) patternClass = 'pattern-holiday-kr';
                else if (holiday?.country.includes('VN')) patternClass = 'pattern-holiday-vn';
                else if (holiday?.country.includes('UK')) patternClass = 'pattern-holiday-uk';

                return (
                  <div
                    key={dateKey}
                    data-calendar-day={dateKey}
                    style={{ minWidth: `${cellWidth}px` }}
                    className={`flex-1 flex flex-col items-center justify-center py-1.5 border-r border-slate-200 dark:border-slate-700 relative ${patternClass} ${
                      isCurrent ? 'bg-sky-100/70 dark:bg-blue-950/60 font-bold' : ''
                    }`}
                    title={[holiday?`${holiday.name} (${holiday.country})`:'',isSat?vnDay.name:''].filter(Boolean).join(' · ')||undefined}
                  >
                    <span
                      className={`text-[11px] leading-tight ${
                        isSun ? 'text-red-500 font-bold' : isSat ? 'text-blue-500 font-bold' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="text-[9px] text-slate-600 dark:text-slate-300">
                      {format(day, 'E', { locale: lang==='vi'?vi:ko })}
                    </span>
                    {isSat?<span data-viet-saturday={vnDay.configured?vnDay.working?'WORK':'OFF':'UNCONFIGURED'} className={`mt-0.5 text-[8px] font-bold ${vnDay.working?'bg-teal-100 text-teal-900':'bg-red-50 text-red-700'}`}>{vnDay.configured?vnDay.working?'VN 근무':'VN 휴무':'VN 미등록'}</span>:holiday && (
                      <span
                        className={`text-[8px] font-extrabold px-0.5 rounded leading-none mt-0.5 ${
                          holiday.country.includes('KR')
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
            {waitingIntake.map(item => <div key={item.code} data-pending-intake={item.code} className="flex items-stretch bg-amber-50/60 dark:bg-amber-950/20 text-xs">
              <div className="sticky left-0 z-30 w-[230px] flex-shrink-0 p-3 border-r border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-slate-900">
                <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">{item.code}</span>
                <button data-no-translate type="button" onClick={() => onSelectIntake?.(item)} title={item.name} className="w-full text-left font-bold text-slate-900 dark:text-white break-words focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                  {item.name}
                </button>
                <span className="block mt-1 font-bold text-amber-900 dark:text-amber-200">{lang === 'vi' ? 'Mới · chưa phân công' : '신규 · 미배정'}</span>
              </div>
              <div className="w-[85px] flex-shrink-0 p-2 border-r border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">{lang === 'vi' ? 'Chưa xác định' : '미산정'}</div>
              <div className="w-[95px] flex-shrink-0 p-2 border-r border-slate-200 dark:border-slate-800 flex items-center justify-center font-bold text-amber-900 dark:text-amber-200">{lang === 'vi' ? 'Chưa phân công' : '미배정'}</div>
              <div className="flex-1 min-w-0 p-3 flex flex-col items-start justify-center gap-1 text-amber-900 dark:text-amber-200">
                <p>{item.reason === 'archived' ? (lang === 'vi' ? 'Cần kiểm tra lịch đã lưu trữ' : '보관된 일정 확인 필요') : (lang === 'vi' ? 'Cần xác nhận bộ phận phụ trách' : '담당 팀 확인 필요')}{item.missingDepartments?.length ? ` · ${item.missingDepartments.join(', ')}` : ''}</p>
                <button type="button" onClick={() => onSelectIntake?.(item)} className="font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">{lang === 'vi' ? 'Mở thông tin tiếp nhận để phân công' : '접수 내용 확인하고 배정하기'}</button>
              </div>
            </div>)}
            {projectSearch.trim()&&!groupedProjects.length&&!waitingIntake.length&&<p role="status" className="p-8 text-center text-sm text-slate-700 dark:text-slate-200">선택한 월·팀에 일치하는 프로젝트가 없습니다. 번호·이름 또는 월 표시 범위를 확인하세요.</p>}
            {groupedProjects.map((group) => {
              const laneCount = group.lanes.length;
              const isMultiLane = laneCount > 1;
              const laneHeight=(lane:typeof group.lanes[number])=>32+lane.postDeliveryTasks.length*22+(lane.weekendWork.length?32:0)+(lane.overtime.length?24:0);
              const laneOffsets=group.lanes.map((_,index)=>group.lanes.slice(0,index).reduce((height,lane)=>height+laneHeight(lane),0));
              const rowMinHeight=Math.max(50,14+group.lanes.reduce((height,lane)=>height+laneHeight(lane),0));
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
                    className="sticky left-0 z-30 bg-white dark:bg-slate-900 w-[230px] flex-shrink-0 p-3 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/70 transition-colors"
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
                      <span data-no-translate>{group.name}</span>
                    </div>
                    {group.lanes.some(lane=>lane.unassigned)&&<button type="button" onClick={event=>{event.stopPropagation();handleRowClick();}} className="mt-1 text-left text-[11px] font-bold text-amber-900 dark:text-amber-200 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">{lang==='vi'?'Mới · chưa phân công: phân công PM và nhân viên':'신규 · 미배정: PM·담당 인원 배정 필요'}</button>}
                    {pendingIntake.some(item=>item.code===group.code)&&<button type="button" onClick={event=>{event.stopPropagation();const item=pendingIntake.find(item=>item.code===group.code);if(item)onSelectIntake?.(item);}} className="mt-1 text-left text-[11px] font-bold text-amber-900 dark:text-amber-200 underline underline-offset-2">{lang==='vi'?'Cần xác nhận bộ phận còn thiếu':'참여 팀 확인 필요'}</button>}
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
                        <div key={`${lane.projectId}-${lane.department}`} className="my-0.5">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-slate-600 dark:text-slate-300 font-semibold">{lane.department.slice(0, 2)}</span>
                            <span className={`${colorText} font-black`}>{lane.postOnly?'보완 일정':<>실제 {percentLabel(lane.actual)}<br />계획 {percentLabel(lane.planned)}</>}</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                            <div
                              className={`h-full rounded-full ${colorBg}`}
                              style={{ width: lane.postOnly?'0%':percentLabel(lane.actual) }}
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
                        <div key={`${lane.projectId}-${lane.department}`} className="my-0.5 flex items-center justify-center gap-1">
                          <span className={`text-[9px] font-black px-1 rounded ${badgeColor}`}>
                            {lane.department.slice(0, 2)}
                          </span>
                          <span className="font-black text-slate-900 dark:text-white text-xs">
                            {lane.postOnly?'보완':lane.pmPerson ? lane.pmPerson.name : '미배정'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* 일자별 간트 타임라인 영역 (행 전체 높이에 100% 맞춰 휴일 빗금 끊김 원천 차단) */}
                  <div
                    className="flex-1 min-w-0 overflow-hidden relative self-stretch"
                    style={{
                      minHeight: `${rowMinHeight}px`,
                    }}
                  >
                    {/* 배경 그리드 컬럼 (행의 위부터 아래 끝까지 100% 완전 채움) */}
                    <div className="absolute inset-0 flex pointer-events-none h-full">
                      {daysInMonth.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const holiday = calendarHoliday(dateKey,workCalendars);
                        const weekend = isWeekend(day);
                        let bgPattern = '';

                        // 1순위: 공휴일 (주말과 겹치더라도 빗금 패턴 반드시 렌더링하여 끊김 원천 차단)
                        if (holiday?.country.includes('KR')) {
                          bgPattern = 'pattern-holiday-kr';
                        } else if (holiday?.country.includes('VN')) {
                          bgPattern = 'pattern-holiday-vn';
                        } else if (holiday?.country.includes('UK')) {
                          bgPattern = 'pattern-holiday-uk';
                        } else if (weekend) {
                          // 2순위: 일반 주말 음영
                          bgPattern = 'bg-slate-100/90 dark:bg-slate-800/80';
                        }

                        return (
                          <div
                            key={dateKey}
                            style={{ minWidth: `${cellWidth}px` }}
                            className={`flex-1 border-r border-slate-200/80 dark:border-slate-800 h-full ${bgPattern}`}
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
                            (differenceInDays(today, monthStart) + 0.5) / daysInMonth.length * 100
                          }%`,
                        }}
                      />
                    )}

                    {/* 부서별 간트 바 렌더링 (마감 1단 / 구조 2단 / 토목 3단 완전 분리) */}
                    {group.lanes.map((lane, laneIdx) => {
                      const barStyle = getLaneBarStyle(lane.startDate, lane.endDate);
                      if (!barStyle&&!lane.displayRanges.length) return lane.unassigned ? <button key={lane.projectId} type="button" onClick={handleRowClick} style={{top:`${laneOffsets[laneIdx]+8}px`}} className="absolute left-3 z-20 text-xs font-bold text-amber-900 dark:text-amber-200 underline underline-offset-2">{lane.department} · {lang==='vi'?'Chưa phân công PM · cần lập lịch':'PM 미배정 · 일정 배정 필요'}</button> : null;

                      // 동적 레인 수직 위치 계산: 1개면 11px 중앙, 다중 레인이면 각 32px 간격으로 1단(8px), 2단(40px), 3단(72px) 완벽 분리
                      const topPos = laneOffsets[laneIdx]+(isMultiLane||lane.postDeliveryTasks.length||lane.weekendWork.length||lane.overtime.length?8:11);
                      const laneGradient =
                        lane.department === '마감팀'
                          ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 border-blue-400'
                          : lane.department === '구조팀'
                          ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 border-purple-400'
                          : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 border-emerald-400';

                      return lane.displayRanges.map(range=>(
                        <div
                          key={`${lane.projectId}:${range.startDate}`}
                          data-main-project-id={lane.projectId}
                          data-main-department={lane.department}
                          data-work-start={range.startDate}
                          data-work-end={range.endDate}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick();
                          }}
                          style={{
                            ...getLaneBarStyle(range.startDate,range.endDate),
                            top: `${topPos}px`,
                            height: '26px',
                          }}
                          data-no-translate-attrs="title"
                          title={`[${lane.department}] ${group.name}\n기간: ${lane.startDate} ~ ${lane.endDate}\n진척률: ${percentLabel(lane.actual)}\n담당: ${lane.pmPerson?.name || 'PM 미배정'}\n상태: ${lane.status}\n클릭하여 프로젝트 통합 공종 투입 현황 확인`}
                          className={`absolute rounded-lg border text-white flex items-center px-2.5 text-[11px] font-bold shadow-md hover:scale-[1.01] hover:brightness-110 transition-all z-20 cursor-pointer overflow-hidden ${laneGradient}`}
                        >
                          <span className="text-[9px] font-black bg-white/25 px-1 py-0.2 rounded mr-1.5 shrink-0">
                            {lane.department.slice(0, 2)}
                          </span>
                          <span className="truncate drop-shadow-xs font-semibold">
                            <span data-no-translate>{getCleanProjectName(group.name)}</span>
                          </span>
                          <span className="ml-auto text-[9px] bg-black/25 px-1 py-0.2 rounded font-mono shrink-0 pl-1">
                            {lane.pmPerson ? lane.pmPerson.name : 'PM 미배정'} · {percentLabel(lane.actual)}
                          </span>
                        </div>
                      ));
                    })}
                    {group.lanes.flatMap((lane,laneIdx)=>lane.postDeliveryTasks.flatMap((task,index)=>{
                      const project=projects.find(project=>project.id===lane.projectId);
                      const ranges=project?projectDisplayRanges(project,lane.department,monthStartStr,monthEndStr,users,workCalendars,task.id):[];
                      return ranges.map(range=><button key={`${lane.projectId}-${task.id}-${range.startDate}`} type="button" onClick={handleRowClick} data-post-delivery-id={task.id} data-post-delivery-department={lane.department} data-work-start={range.startDate} data-work-end={range.endDate} style={{...getLaneBarStyle(range.startDate,range.endDate),top:`${laneOffsets[laneIdx]+35+index*22}px`,height:19}} title={`${group.name}\n${lane.department} · 보완 · 자동 보고 · ${task.kind}\n${task.startDate} ~ ${task.endDate}\n${task.memo}`} className="absolute z-20 overflow-hidden rounded border border-orange-300 bg-orange-700 text-white text-[10px] font-bold text-left px-1.5 truncate">{lane.department.slice(0,2)} · 보완: {task.memo}</button>);
                    }))}
                    {group.lanes.flatMap((lane,laneIdx)=>[...new Set(lane.weekendWork.map(request=>request.workDate!))].map(day=>{
                      const barStyle=getLaneBarStyle(day,day),requests=lane.weekendWork.filter(request=>request.workDate===day);
                      return barStyle?<span key={`${lane.projectId}-${lane.department}-${day}`} data-project-weekend-day={day} data-weekend-department={lane.department} title={`${group.name}\n${lane.department} · 주말 출근 승인 · ${day}\n${requests.map(request=>`${request.userName} · ${request.roleName} · ${request.startTime}~${request.endTime} (${Number(request.hours?.toFixed(2))}시간)`).join('\n')}`} style={{...barStyle,top:laneOffsets[laneIdx]+35+lane.postDeliveryTasks.length*22,height:26}} className="absolute z-20 rounded bg-teal-700 py-0.5 text-center text-[9px] leading-[11px] font-bold text-white">주말<br/>출근</span>:null;
                    }))}
                    {group.lanes.flatMap((lane,laneIdx)=>[...new Set(lane.overtime.map(request=>request.workDate!))].map(day=>{
                      const barStyle=getLaneBarStyle(day,day),requests=lane.overtime.filter(request=>request.workDate===day);
                      return barStyle?<span key={`overtime-${lane.projectId}-${lane.department}-${day}`} data-project-overtime-day={day} data-overtime-department={lane.department} title={`${group.name}\n${lane.department} · 야근 승인 · ${day}\n${requests.map(request=>`${request.userName} · ${request.roleName} · ${request.startTime}~${request.endTime} (${Number(request.hours?.toFixed(2))}시간)`).join('\n')}`} style={{...barStyle,top:laneOffsets[laneIdx]+35+lane.postDeliveryTasks.length*22+(lane.weekendWork.length?32:0),height:20}} className="absolute z-20 rounded bg-indigo-700 px-0.5 text-center text-[10px] font-bold text-white">야근</span>:null;
                    }))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. 하단 상태 안내 범례 바 */}
      <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
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
          <span className="flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-3 rounded bg-orange-700"/>보완 · 자동 보고</span>
          <span className="flex items-center gap-1.5 font-semibold"><span className="h-2.5 w-3 rounded bg-indigo-700"/>야근 · 승인된 근무일</span>
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
