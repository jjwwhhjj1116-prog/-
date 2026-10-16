import {usePersonalStore} from '../store/usePersonalStore';
import {useLanguageStore} from '../store/useLanguageStore';
import {assignedTasksForAliases,assignmentAliases,validDay,isWeekendDay} from '../utils/personalWork';
import {scheduleExtensionDepartment} from '../utils/postDeliveryVisibility';
import {scheduleExtensionPeriods} from '../utils/scheduleExtensionPeriods';
import { compareStaff } from '../utils/staffOrder';
import React, { useState, useMemo } from 'react';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  differenceInDays,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ko, vi } from 'date-fns/locale';
import {
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  Settings2,
  Printer,
  FileSpreadsheet,
  CalendarPlus,
} from 'lucide-react';
import { useProjectStore, type Department } from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { type VietTeam } from '../data/vietTeams';
import { resolveVietTeams } from '../utils/vietPersonnel';
import { VietTeamModal } from './VietTeamModal';
import ProjectCalendar from './ProjectCalendar';
import { exportProjectsToExcel } from '../services/excelService';

import { HOLIDAYS } from '../constants/holidays';

interface PersonalScheduleViewProps {
  department: Department;
  onOpenPrintModal?: (date?: Date) => void;
  onOpenPostDelivery?: () => void;
}

interface AssignedTask {
  id: string;
  allocationId?:string;
  projectId: string;
  projectName: string;
  projectShortName: string;
  projectDisplayName: string;
  roleName: string;
  startDate: string;
  endDate: string;
  status: string;
  memo: string;
  version?: string;
  lane?: number; // 겹침 방지 서브 레인 번호
  postDeliveryId?: string;
}

// 캘린더에 표시할 행 유닛: 한국 본사 개인 또는 베트남 팀 유닛
interface ScheduleRowUnit {
  id: string;
  type: 'KOREA_PERSON' | 'VIET_TEAM' | 'VIET_PERSON';
  name: string;
  subTitle: string;
  badge: string;
  vietTeamData?: VietTeam;
  isVietnam: boolean;
}

export const PersonalScheduleView: React.FC<PersonalScheduleViewProps> = ({ department, onOpenPrintModal, onOpenPostDelivery }) => {
  const lang=useLanguageStore(state=>state.lang);
  const { projects, setSelectedProjectId, personnel } = useProjectStore();
  const { users } = useAuthStore();
  const leaves=usePersonalStore(s=>s.leaves);
  const [viewMode, setViewMode] = useState<'PERSONAL' | 'TEAM'>('TEAM');
  // 실시간 오늘 기준일 (2026-09-21)
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  // 지역 필터 (전체 / 한국 본사 / 베트남 팀)
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'KOREA' | 'VIETNAM'>('ALL');
  const [vietView, setVietView] = useState<'INDIVIDUAL' | 'TEAM'>('INDIVIDUAL');

  // 베트남 팀원 관리 모달 상태
  const [activeVietTeamModal, setActiveVietTeamModal] = useState<VietTeam | null>(null);

  // 달력 범위 계산 (선택된 월)
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // 오늘 날짜 구하기 (2026-09-21 등 실제 현재 날짜 실시간 연동)
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const cellWidth = 38; // 좁은 화면에서 유지할 1일당 최소 가로 픽셀

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  const deptOvertime = useMemo(() => projects.flatMap(project => (project.scheduleExtensions || [])
    .filter(request => {
      if(request.type!=='OVERTIME'||request.status!=='APPROVED')return false;
      return scheduleExtensionDepartment(project,request)===department;
    }).map(request=>({...request,projectCode:project.code}))),[projects,department]);
  const deptWeekendWork = useMemo(() => projects.flatMap(project => (project.scheduleExtensions || [])
    .filter(request => request.type==='WEEKEND'&&request.status==='APPROVED'&&isWeekendDay(request.workDate||'')&&scheduleExtensionDepartment(project,request)===department)
    .map(request=>({...request,projectCode:project.code}))),[projects,department]);
  // 소속과 다른 팀의 PM/공종을 맡은 직원도 해당 배정팀에서 휴가를 확인할 수 있다.
  const monthAssignedUserIds = useMemo(() => new Set(users.filter(person =>
    assignedTasksForAliases(assignmentAliases(person, users), projects)
      .some(task => task.department === department && task.startDate <= monthEndStr && task.endDate >= monthStartStr)
      || deptOvertime.some(request => request.userId === person.id && typeof request.workDate === 'string' && validDay(request.workDate) && request.workDate >= monthStartStr && request.workDate <= monthEndStr)
      || deptWeekendWork.some(request => request.userId === person.id && typeof request.workDate === 'string' && request.workDate >= monthStartStr && request.workDate <= monthEndStr)
  ).map(person => person.id)), [users, projects, deptOvertime, deptWeekendWork, department, monthStartStr, monthEndStr]);

  // 해당 부서 한국 본사 인원과 당월 실제 배정 인원 (개인별)
  const koreaUsers = useMemo(() => {
    return users.filter((u) => {
      const isKorea = u.company === '컨코스트';
      if (!isKorea || u.active === false) return false;
      if (monthAssignedUserIds.has(u.id)) return true;
      if (department === '마감팀') return u.department.includes('마감');
      if (department === '구조팀') return u.department.includes('구조');
      if (department === '토목&조경팀') return u.department.includes('토목') || u.department.includes('조경');
      return false;
    }).sort(compareStaff);
  }, [users, department, monthAssignedUserIds]);

  const vietTeams = useMemo(() => resolveVietTeams(users, department), [users, department]);
  const vietUsers = useMemo(() => users.filter(person => person.company === 'VIETQS' && person.active !== false
    && (person.department === department || monthAssignedUserIds.has(person.id))).sort(compareStaff), [users, department, monthAssignedUserIds]);
  const ungroupedVietUsers = useMemo(() => vietUsers.filter(person => !vietTeams.some(team => team.members.some(member => member.id === person.id))), [vietUsers,vietTeams]);

  // 통합 행 유닛 목록 생성 (한국 본사 개인 + 베트남 팀 유닛)
  const scheduleRowUnits = useMemo<ScheduleRowUnit[]>(() => {
    const units: ScheduleRowUnit[] = [];

    // 1. 한국 본사 개인별 추가
    if (regionFilter === 'ALL' || regionFilter === 'KOREA') {
      koreaUsers.forEach((u) => {
        units.push({
          id: u.id,
          type: 'KOREA_PERSON',
          name: u.name,
          subTitle: `${u.position} · ${u.department}`,
          badge: '한국 본사',
          isVietnam: false,
        });
      });
    }

    // 2. 베트남 팀별 추가 (마감: 내부1, 내부2, 내부3, 외부, 조적, 창호 / 구조: 수직, 수평)
    if (regionFilter === 'ALL' || regionFilter === 'VIETNAM') {
      if (vietView === 'TEAM') vietTeams.forEach((vt) => {
        units.push({
          id: vt.id,
          type: 'VIET_TEAM',
          name: vt.displayName,
          subTitle: `팀장: ${vt.leaderName} (${vt.members.length}명)`,
          badge: '베트남 팀',
          vietTeamData: vt,
          isVietnam: true,
        });
      });
      (vietView === 'TEAM' ? ungroupedVietUsers : vietUsers).forEach(person => {
        const group = vietTeams.find(team => team.members.some(member => member.id === person.id));
        units.push({id:person.id,type:'VIET_PERSON',name:person.name,subTitle:`${person.position} · ${group?.name || (person.department !== department ? `${person.department} · 타팀 배정` : '그룹 미지정')} · ${person.idPrefix}`,badge:'베트남 개인',isVietnam:true});
      });
    }

    if (vietView === 'INDIVIDUAL') units.sort((a, b) => compareStaff(
      users.find(person => person.id === a.id) || {},
      users.find(person => person.id === b.id) || {},
    ));
    return units;
  }, [koreaUsers, vietTeams, vietUsers, ungroupedVietUsers, vietView, regionFilter, department, users]);

  // 프로젝트 이름 약칭 추출 함수 (발주처 태그용)
  const getProjectShortName = (name: string) => {
    const match = name.match(/\[(.*?)\]/);
    if (match && match[1]) {
      return match[1].replace(/재개발|오피스텔|단지|복합시설/g, '').trim();
    }
    return name.slice(0, 7);
  };

  // 실제 프로젝트 핵심 명칭 추출 함수 (사용자 요청: 프로젝트 이름을 정확하게 표기)
  // 예: "[삼성물산(주)] P5 FAB2 신축공사 견적용역" -> "P5 FAB2 신축공사"
  const getProjectDisplayName = (name: string) => {
    let cleaned = name.replace(/^\[.*?\]\s*/, '').trim();
    cleaned = cleaned.replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim();
    return cleaned || name;
  };

  // 행 유닛별 배정 작업 수집 및 겹치는 구간 스마트 스택(Greedy Interval Coloring)
  const unitTasksMap = useMemo(() => {
    const rawMap: Record<string, AssignedTask[]> = {};

    scheduleRowUnits.forEach((u) => {
      rawMap[u.id] = [];
    });

    projects.forEach((p) => {
      const shortName = getProjectShortName(p.name);
      const displayName = getProjectDisplayName(p.name);

      scheduleRowUnits.forEach(unit=>{
        const person=users.find(person=>person.id===unit.id),team=unit.vietTeamData;
        const aliases=team?[team.id,team.code,team.displayName,...team.members.flatMap(member=>assignmentAliases(users.find(user=>user.id===member.id)||{id:member.id},users))]:assignmentAliases(person||{id:unit.id},users);
        for(const task of assignedTasksForAliases(aliases,[p])){
          if(task.department!==department)continue;
          const source=p.subTasks?.[task.roleName];
          const follow=p.postDeliveryTasks?.find(item=>task.id===`gen-${p.id}-followup-${item.id}`);
          rawMap[unit.id].push({id:task.id,allocationId:task.allocationId,projectId:p.id,projectName:p.name,projectShortName:shortName,projectDisplayName:displayName,roleName:task.roleName+(source?.subType?` (${source.subType})`:''),startDate:task.startDate,endDate:task.endDate,status:task.status==='대기'?'예정':task.status,memo:task.scheduleMemo||'',version:source?.version,...(follow?{postDeliveryId:follow.id}:{})});
        }
      });
    });

    // 겹치는 작업 레인 번호(lane) 자동 배정
    const packedMap: Record<string, { tasks: (AssignedTask & { lane: number })[]; maxLane: number }> = {};

    scheduleRowUnits.forEach((u) => {
      const tasks = rawMap[u.id] || [];
      const sorted = [...tasks].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );

      const lanes: { endDate: Date }[] = [];
      const assignedTasks = sorted.map((task) => {
        const start = new Date(task.startDate);
        const end = new Date(task.endDate);
        let laneIndex = -1;

        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i].endDate < start) {
            laneIndex = i;
            lanes[i].endDate = end;
            break;
          }
        }

        if (laneIndex === -1) {
          laneIndex = lanes.length;
          lanes.push({ endDate: end });
        }

        return { ...task, lane: laneIndex };
      });

      packedMap[u.id] = {
        tasks: assignedTasks,
        maxLane: Math.max(0, lanes.length - 1),
      };
    });

    return packedMap;
  }, [scheduleRowUnits, projects, users, department]);

  // 간트 바 스타일 위치 계산
  const getGanttBarStyle = (task: AssignedTask, lane: number) => {
    const start = new Date(task.startDate);
    const end = new Date(task.endDate);

    const effStart = start < monthStart ? monthStart : start;
    const effEnd = end > monthEnd ? monthEnd : end;

    if (effStart > monthEnd || effEnd < monthStart) return null;

    const left = differenceInDays(effStart, monthStart) / daysInMonth.length * 100;
    const width = (differenceInDays(effEnd, effStart) + 1) / daysInMonth.length * 100;
    const top = lane * 30 + 5;

    return {
      left: `calc(${left}% + 2px)`,
      width: `max(30px, calc(${width}% - 4px))`,
      top: `${top}px`,
      height: '24px',
    };
  };

  // 공종/상태별 색상 스타일
  const getTaskColorClass = (roleName: string, status: string) => {
    if (status === '완료') {
      return 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700';
    }
    if (roleName.includes('내역')) {
      return 'bg-amber-700 text-white border-amber-800 hover:bg-amber-800';
    }
    if (roleName === 'PM') {
      return 'bg-slate-900 text-white border-slate-950 hover:bg-black shadow-xs';
    }
    if (roleName === '창호' || roleName === '보') {
      return 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700';
    }
    if (roleName === '조적' || roleName === '슬라브') {
      return 'bg-orange-700 text-white border-orange-800 hover:bg-orange-800';
    }
    if (roleName === '외부' || roleName === '옹벽') {
      return 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700';
    }
    if (roleName === '내부' || roleName === '기둥') {
      return 'bg-cyan-700 text-white border-cyan-800 hover:bg-cyan-800';
    }
    return 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700';
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. 상단 컨트롤 패널 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#00338d]" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {department} 캘린더 일정표
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-[#00338d] font-bold border border-blue-200">
              한국 본사 {koreaUsers.length}명 · 베트남 {vietTeams.length}개 팀 유닛
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            한국 본사와 베트남 직원의 개인 일정, 베트남 팀별 일정을 전환하여 날짜별 프로젝트를 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {viewMode==='PERSONAL'&&onOpenPostDelivery && <button data-post-delivery-register type="button" onClick={onOpenPostDelivery} className="order-last ml-auto flex items-center gap-1.5 rounded-xl bg-orange-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"><CalendarPlus size={16}/>프로젝트 보완 일정 등록</button>}
          {/* 엑셀 다운로드 버튼 */}
          <button
            onClick={() => exportProjectsToExcel(projects, personnel, currentDate, 1, department)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition active:scale-95 cursor-pointer"
            title="현재 월 실시간 타임라인 간트 일정표 엑셀 다운로드"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>엑셀 (.xlsx)</span>
          </button>

          {/* 인쇄 / PDF 저장 버튼 */}
          {onOpenPrintModal && (
            <button
              onClick={() => onOpenPrintModal?.(currentDate)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-sm transition active:scale-95 cursor-pointer"
              title="A4 가로 규격 완벽 핏 인쇄 및 PDF 저장"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>인쇄 / PDF 저장</span>
            </button>
          )}

          {/* 팀 전체 프로젝트 간트 (좌측) ↔ 개인/팀별 캘린더 (우측) */}
          <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setViewMode('TEAM')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'TEAM'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              팀 프로젝트 일정표
            </button>
            <button
              onClick={() => setViewMode('PERSONAL')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'PERSONAL'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" />
              개인/팀별 캘린더
            </button>
          </div>

          {/* 캘린더 월 이동 */}
          {viewMode === 'PERSONAL' && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-slate-200 rounded text-slate-600"
                title="이전 달"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleToday}
                className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded"
              >
                오늘
              </button>
              <span className="text-xs font-black px-2 text-slate-900">
                {format(currentDate, 'yyyy년 M월', { locale: ko })}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-slate-200 rounded text-slate-600"
                title="다음 달"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. 메인 캘린더 렌더링 */}
      {viewMode === 'TEAM' ? (
        <div className="space-y-4">
          <ProjectCalendar date={currentDate} onDateChange={setCurrentDate} onOpenPrintModal={onOpenPrintModal} onOpenPostDelivery={onOpenPostDelivery} />
        </div>
      ) : (
        <div className="corporate-card overflow-hidden">
          {/* 상단 퀵 필터 탭 (전체 / 한국 개인 / 베트남 팀 유닛) */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                표시 구분:
              </span>
              <div className="flex flex-wrap items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setRegionFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    regionFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  전체 ({koreaUsers.length + (vietView === 'TEAM' ? vietTeams.length + ungroupedVietUsers.length : vietUsers.length)})
                </button>
                <button
                  onClick={() => setRegionFilter('KOREA')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    regionFilter === 'KOREA'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🇰🇷 한국 본사 개인별 ({koreaUsers.length}명)
                </button>
                <button
                  onClick={() => setRegionFilter('VIETNAM')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    regionFilter === 'VIETNAM'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  🇻🇳 베트남 ({vietUsers.length}명)
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                {(['INDIVIDUAL','TEAM'] as const).map(mode=><button key={mode} type="button" aria-label={`베트남 일정 ${mode==='TEAM'?'팀별':'개인별'}`} aria-pressed={vietView===mode} onClick={()=>setVietView(mode)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${vietView===mode?'bg-slate-900 text-white':'text-slate-700 hover:bg-slate-100'}`}>{mode==='TEAM'?`팀별 (${vietTeams.length})${ungroupedVietUsers.length?` · 미지정 ${ungroupedVietUsers.length}명`:''}`:`개인별 (${vietUsers.length})`}</button>)}
              </div>
            </div>

            {/* 범례 */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-900" /> PM
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-orange-500" /> 조적/슬라브
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-600" /> 창호/보
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-purple-600" /> 외부/옹벽
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-cyan-600" /> 내부/기둥
              </span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-700" /> 승인된 연장 기간</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-orange-700" /> 보완 · 자동 보고</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-700" /> 야근 · 승인된 근무일</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded border border-amber-600 bg-amber-100" /> 휴가 · 본인 등록
              </span>
            </div>
          </div>

          {/* 간트 타임라인 스크롤 영역 */}
          <div className="schedule-calendar-scrollport overflow-auto custom-scrollbar" role="region" aria-label={`${department} 개인 및 팀별 월간 일정표`} tabIndex={0}>
            <div
              data-calendar-month={format(monthStart, 'yyyy-MM')}
              style={{ width: '100%', minWidth: `${280 + daysInMonth.length * cellWidth}px` }}
            >
              {/* 타임라인 헤더 (좌측 유닛명 + 우측 날짜 셀) */}
              <div className="flex border-b border-slate-200 bg-slate-100 sticky top-0 z-30">
                <div className="w-[280px] p-3 border-r border-slate-200 font-bold text-xs text-slate-700 flex items-center justify-between shrink-0 bg-slate-100">
                  <span>투입 인원 / 팀 구분</span>
                  <span className="text-[10px] text-slate-600 font-mono">ASSIGNMENT</span>
                </div>

                <div className="flex flex-1 min-w-0">
                  {daysInMonth.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isSat = getDay(day) === 6;
                    const isSun = getDay(day) === 0;
                    const isCurrentToday = isSameDay(day, today);
                    const holiday = HOLIDAYS[dateStr];

                    return (
                      <div
                        key={dateStr}
                        data-calendar-day={dateStr}
                        style={{ flex: 1, minWidth: 0 }}
                        className={`text-center py-2 border-r border-slate-200 shrink-0 select-none flex flex-col justify-between ${
                          isSun || isSat || holiday
                            ? 'bg-slate-50/70'
                            : isCurrentToday
                            ? 'bg-blue-50/60'
                            : 'bg-white'
                        }`}
                      >
                        <div className="text-[10px] font-medium text-slate-600">
                          {format(day, 'E', { locale: lang==='vi'?vi:ko })}
                        </div>
                        <div
                          className={`text-xs font-bold leading-none my-0.5 ${
                            isCurrentToday
                              ? 'text-white bg-blue-600 rounded-full w-5 h-5 flex items-center justify-center mx-auto'
                              : holiday
                              ? 'text-red-600 font-black'
                              : isSun
                              ? 'text-red-500'
                              : isSat
                              ? 'text-blue-500'
                              : 'text-slate-700'
                          }`}
                        >
                          {format(day, 'd')}
                        </div>
                        <div className="h-3 flex items-center justify-center">
                          {holiday && (
                            <span className="text-[8px] font-black text-red-500 px-0.5">
                              {holiday.country}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 타임라인 바디 (한국 개인 행 + 베트남 팀 유닛 행) */}
              <div className="divide-y divide-slate-200">
                {scheduleRowUnits.map((unit) => {
                  const { tasks, maxLane } = unitTasksMap[unit.id] || { tasks: [], maxLane: 0 };

                  // 당월(조회 중인 월)에 실제 진행되는 작업만 필터링
                  const monthTasks = tasks.filter(
                    (t) => !(t.endDate < monthStartStr || t.startDate > monthEndStr)
                  );

                  // 당월 실제 일정 겹침(충돌) 계산: 두 작업의 날짜 구간이 겹치는 경우
                  const overlappingTasks = new Set<number>();
                  for (let i = 0; i < monthTasks.length; i++) {
                    for (let j = i + 1; j < monthTasks.length; j++) {
                      const a = monthTasks[i];
                      const b = monthTasks[j];
                      if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
                        overlappingTasks.add(i);
                        overlappingTasks.add(j);
                      }
                    }
                  }
                  const overlapCount = overlappingTasks.size;

                  const leaveMemberIds = unit.vietTeamData?.members.map(member => member.id) || [unit.id];
                  const monthLeaves = leaves.filter(leave => leaveMemberIds.includes(leave.user_id)
                    && leave.start_date <= monthEndStr && leave.end_date >= monthStartStr);
                  const monthOvertime = deptOvertime.filter(request => leaveMemberIds.includes(request.userId)
                      && typeof request.workDate === 'string' && validDay(request.workDate) && request.workDate >= monthStartStr && request.workDate <= monthEndStr);
                  const monthWeekendWork = deptWeekendWork.filter(request => leaveMemberIds.includes(request.userId)
                      && typeof request.workDate === 'string' && request.workDate >= monthStartStr && request.workDate <= monthEndStr);
                  const leaveLabel = (leave: typeof monthLeaves[number]) => `${unit.vietTeamData ? `${users.find(person => person.id === leave.user_id)?.name || leave.name || leave.user_id} · ` : ''}${leave.kind}`;
                  const rowHeight = Math.max(52+monthLeaves.length*14, (maxLane + 1) * 32 + 12)+monthLeaves.length*24+(monthOvertime.length?24:0)+(monthWeekendWork.length?32:0);

                  return (
                    <div
                      key={unit.id}
                      data-schedule-unit={unit.id}
                      className={`flex hover:bg-slate-50/40 transition relative group ${
                        unit.isVietnam ? 'bg-red-50' : 'bg-white'
                      }`}
                      style={{ minHeight: `${rowHeight}px` }}
                    >
                      {/* 좌측 유닛 카드 (너비 280px) */}
                      <div
                        className={`w-[280px] p-2.5 border-r border-slate-200 shrink-0 flex items-start justify-between ${
                          unit.isVietnam ? 'bg-red-50' : 'bg-white'
                        } group-hover:bg-slate-50/80`}
                        style={{ minHeight: `${rowHeight}px` }}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${
                              unit.isVietnam
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {unit.isVietnam ? '🇻🇳' : unit.name.slice(0, 1)}
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span title={unit.name} className={`font-bold text-xs text-slate-900 ${unit.type==='VIET_PERSON'?'whitespace-normal break-words':'truncate'}`}>
                                {unit.name}
                              </span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-semibold shrink-0 ${
                                  unit.isVietnam
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {unit.badge}
                              </span>
                            </div>
                            <span className={`text-[10px] text-slate-600 block ${unit.type==='VIET_PERSON'?'whitespace-normal break-words':'truncate'}`}>
                              {unit.subTitle}
                              {monthLeaves.map(l=><span key={l.id} className="block text-amber-800 dark:text-amber-300 whitespace-normal">{l.start_date.slice(5)}~{l.end_date.slice(5)} {leaveLabel(l)}</span>)}
                              {monthOvertime.length > 0 && <span className="block text-indigo-800 whitespace-normal">야근 {new Set(monthOvertime.map(request => request.workDate)).size}일</span>}
                              {monthWeekendWork.length > 0 && <span className="block text-teal-800 whitespace-normal">주말 출근 {new Set(monthWeekendWork.map(request => request.workDate)).size}일</span>}
                            </span>
                          </div>
                        </div>

                        {/* 우측 액션: 베트남 팀일 경우 '팀원 배치/관리' 버튼 제공 */}
                        <div className="shrink-0 flex items-center gap-1 pl-1">
                          {unit.vietTeamData ? (
                            <button
                              onClick={() => setActiveVietTeamModal(unit.vietTeamData!)}
                              title="베트남 프로젝트별 인원 배치"
                              className="px-2 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-md text-[10px] font-bold flex items-center gap-1 transition shadow-2xs"
                            >
                              <Settings2 size={12} />
                              팀원배치
                            </button>
                          ) : (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                overlapCount > 0
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                  : monthTasks.length > 0
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                              title={
                                overlapCount > 0
                                  ? `당월 ${monthTasks.length}건 배정 중 ${overlapCount}개 일정이 동시 중복 진행 중입니다.`
                                  : monthTasks.length > 0
                                  ? `당월 ${monthTasks.length}건 정상 배정 진행 중`
                                  : '당월 배정된 일정 없음'
                              }
                            >
                              {overlapCount > 0
                                ? `중복 ${overlapCount}건`
                                : monthTasks.length > 0
                                ? `${monthTasks.length}건 배정`
                                : '일정없음'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 우측 간트 그리드 배경 */}
                      <div
                        className="flex flex-1 min-w-0 overflow-hidden relative"
                        style={{
                          minHeight: `${rowHeight}px`,
                        }}
                      >
                        {/* 일자별 배경 격자선 */}
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const isSat = getDay(day) === 6;
                          const isSun = getDay(day) === 0;
                          const isCurrentToday = isSameDay(day, today);
                          const holiday = HOLIDAYS[dateStr];
                          const dayLeaves = monthLeaves.filter(leave => leave.start_date <= dateStr && leave.end_date >= dateStr);
                          const dayLeaveLabel = dayLeaves.length ? `${unit.name} ${dateStr} · ${dayLeaves.map(leaveLabel).join(' / ')} · 본인 등록` : undefined;
                          const dayOvertime = monthOvertime.filter(request => request.workDate === dateStr);
                          const dayOvertimeLabel = dayOvertime.length ? `${unit.name} ${dateStr} 야근 · ${dayOvertime.map(request => `${request.userName} · ${request.projectCode} ${request.roleName} · ${request.startTime}~${request.endTime} (${Number(request.hours?.toFixed(2))}시간)`).join(' / ')} · 승인됨` : undefined;
                          const dayWeekendWork = monthWeekendWork.filter(request => request.workDate === dateStr);
                          const dayWeekendWorkLabel = dayWeekendWork.length ? `${unit.name} ${dateStr} 주말 출근 · ${dayWeekendWork.map(request => `${request.userName} · ${request.projectCode} ${request.roleName} · ${request.startTime}~${request.endTime} (${Number(request.hours?.toFixed(2))}시간)`).join(' / ')} · 승인됨` : undefined;

                          return (
                            <div
                              key={dateStr}
                              data-calendar-person-day={dateStr}
                              data-leave-day={dayLeaves.length ? dateStr : undefined}
                              data-overtime-day={dayOvertime.length ? dateStr : undefined}
                              data-weekend-work-day={dayWeekendWork.length ? dateStr : undefined}
                              title={[dayLeaveLabel,dayOvertimeLabel,dayWeekendWorkLabel].filter(Boolean).join('\n') || undefined}
                              style={{ flex: 1, minWidth: 0, minHeight: rowHeight }}
                              className={`relative border-r border-slate-100 shrink-0 ${
                                dayLeaves.length
                                  ? 'bg-amber-50 dark:bg-amber-950/40'
                                  : isCurrentToday
                                  ? 'bg-blue-50/25'
                                  : isSun || isSat || holiday
                                  ? 'bg-slate-50/50 striped-bg'
                                  : ''
                              }`}
                            >
                              {dayLeaves.length > 0 && <span aria-label={dayLeaveLabel} className="absolute inset-x-0 text-center text-[10px] font-bold text-amber-900 dark:text-amber-200 pointer-events-none" style={{ bottom: monthLeaves.length * 24 + (monthOvertime.length?24:0)+(monthWeekendWork.length?32:0)+4 }}>휴</span>}
                              {dayOvertime.length > 0 && <span aria-label={dayOvertimeLabel} className="absolute inset-x-0 mx-0.5 rounded bg-indigo-700 px-0.5 text-center text-[10px] font-bold text-white pointer-events-none" style={{ bottom: monthLeaves.length * 24 +(monthWeekendWork.length?32:0)+4 }}>야근</span>}
                              {dayWeekendWork.length > 0 && <span aria-label={dayWeekendWorkLabel} className="absolute inset-x-0 mx-0.5 rounded bg-teal-700 px-0.5 py-0.5 text-center text-[9px] leading-[11px] font-bold text-white pointer-events-none" style={{bottom:monthLeaves.length*24+4}}>주말<br/>출근</span>}
                            </div>
                          );
                        })}

                        {monthLeaves.map((leave,leaveIndex)=>{const start=parseISO(leave.start_date<monthStartStr?monthStartStr:leave.start_date),end=parseISO(leave.end_date>monthEndStr?monthEndStr:leave.end_date);return <div key={leave.id} data-leave-id={leave.id} title={`${unit.name} ${leaveLabel(leave)} · ${leave.start_date} ~ ${leave.end_date} · 본인 등록`} className="absolute bottom-1 rounded border border-amber-600 bg-amber-100 text-amber-950 text-[10px] font-bold truncate px-1 z-20" style={{bottom:4+leaveIndex*24,left:`${differenceInDays(start,monthStart)/daysInMonth.length*100}%`,width:`calc(${(differenceInDays(end,start)+1)/daysInMonth.length*100}% - 2px)`,height:20}}>{leaveLabel(leave)}</div>;})}
                        {/* 오늘(TODAY) 표시선 */}
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

                        {/* 간트 타임라인 바 렌더링 */}
                        {tasks.map((task) => {
                          const style = getGanttBarStyle(task, task.lane);
                          if (!style) return null;
                          const visibleStart=task.startDate>monthStartStr?task.startDate:monthStartStr,visibleEnd=task.endDate<monthEndStr?task.endDate:monthEndStr;
                          const visibleDays=differenceInDays(parseISO(visibleEnd),parseISO(visibleStart))+1;
                          const extensions=scheduleExtensionPeriods(projects.find(project=>project.id===task.projectId),task).map(period=>({start:period.start>visibleStart?period.start:visibleStart,end:period.end<visibleEnd?period.end:visibleEnd})).filter(period=>period.start<=period.end);

                          return (
                            <div
                              key={task.id}
                              data-allocation-id={task.allocationId}
                              data-post-delivery-id={task.postDeliveryId}
                              onClick={() => setSelectedProjectId(task.projectId)}
                              style={style}
                              data-no-translate-attrs="title"
                              title={`${task.projectName}\n공종: ${task.roleName}\n기간: ${task.startDate} ~ ${task.endDate}\n상태: ${task.status}${task.postDeliveryId?' · 보완 · 자동 보고':''}\n메모: ${task.memo}`}
                              className={`absolute rounded-md border text-xs font-bold cursor-pointer transition-all duration-150 flex items-center px-2 z-10 shadow-2xs hover:shadow-md hover:scale-[1.01] ${getTaskColorClass(
                                task.roleName,
                                task.status
                              )} ${task.postDeliveryId?'!bg-orange-700 !border-orange-800 !text-white':''}`}
                            >
                              {extensions.map(period=><span key={period.start} data-extension-start={period.start} data-extension-end={period.end} title={`승인된 연장 기간: ${period.start} ~ ${period.end}`} className="absolute inset-y-0 rounded-sm bg-red-700" style={{left:`${differenceInDays(parseISO(period.start),parseISO(visibleStart))/visibleDays*100}%`,width:`${(differenceInDays(parseISO(period.end),parseISO(period.start))+1)/visibleDays*100}%`}}><span className="sr-only">승인된 연장 기간 {period.start} ~ {period.end}</span></span>)}
                              <span className="relative truncate text-[11px] tracking-tight leading-tight drop-shadow-xs flex items-center gap-1.5 w-full">
                                <span data-no-translate className="font-extrabold truncate text-white">
                                  {task.projectDisplayName}
                                </span>
                                <span className="font-black px-1.5 py-0.5 rounded text-[10px] shrink-0 bg-black/20 text-white">
                                  {task.postDeliveryId?'보완 · 자동 보고':task.roleName}
                                </span>
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
        </div>
      )}

      {/* 베트남 팀원 세부 인원 배치 관리 모달 */}
      <VietTeamModal key={activeVietTeamModal?.id}
        team={activeVietTeamModal}
        isOpen={!!activeVietTeamModal}
        onClose={() => setActiveVietTeamModal(null)}
      />
    </div>
  );
};
