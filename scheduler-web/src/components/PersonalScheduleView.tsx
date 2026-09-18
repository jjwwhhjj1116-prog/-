import React, { useState, useMemo } from 'react';
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
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  Settings2,
} from 'lucide-react';
import { useProjectStore, type Department } from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { VIET_TEAMS_DATA, type VietTeam } from '../data/vietTeams';
import { VietTeamModal } from './VietTeamModal';
import ProjectCalendar from './ProjectCalendar';

// 2026년 한/베 공휴일 정의
const HOLIDAYS_2026: Record<string, { country: 'KR' | 'VN'; name: string }> = {
  '2026-09-02': { country: 'VN', name: '베트남 독립기념일' },
  '2026-09-03': { country: 'VN', name: '베트남 국경일' },
  '2026-09-24': { country: 'KR', name: '추석 연휴' },
  '2026-09-25': { country: 'KR', name: '추석' },
  '2026-09-26': { country: 'KR', name: '추석 연휴' },
  '2026-10-03': { country: 'KR', name: '개천절' },
  '2026-10-09': { country: 'KR', name: '한글날' },
};

interface PersonalScheduleViewProps {
  department: Department;
}

interface AssignedTask {
  projectId: string;
  projectName: string;
  projectShortName: string;
  roleName: string;
  startDate: string;
  endDate: string;
  status: string;
  memo: string;
  version?: string;
  lane?: number; // 겹침 방지 서브 레인 번호
}

// 캘린더에 표시할 행 유닛: 한국 본사 개인 또는 베트남 팀 유닛
interface ScheduleRowUnit {
  id: string;
  type: 'KOREA_PERSON' | 'VIET_TEAM';
  name: string;
  subTitle: string;
  badge: string;
  vietTeamData?: VietTeam;
  isVietnam: boolean;
}

export const PersonalScheduleView: React.FC<PersonalScheduleViewProps> = ({ department }) => {
  const { projects, setSelectedProjectId } = useProjectStore();
  const { users } = useAuthStore();
  const [viewMode, setViewMode] = useState<'PERSONAL' | 'TEAM'>('PERSONAL');
  const [currentDate, setCurrentDate] = useState(new Date('2026-09-17'));

  // 지역 필터 (전체 / 한국 본사 / 베트남 팀)
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'KOREA' | 'VIETNAM'>('ALL');

  // 베트남 팀원 관리 모달 상태
  const [activeVietTeamModal, setActiveVietTeamModal] = useState<VietTeam | null>(null);

  // 달력 범위 계산 (선택된 월)
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const today = new Date('2026-09-17');
  const cellWidth = 38; // 1일당 가로 픽셀

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date('2026-09-17'));

  // 해당 부서 한국 본사 인원 (개인별)
  const koreaUsers = useMemo(() => {
    return users.filter((u) => {
      const isKorea = u.company === '컨코스트';
      if (!isKorea) return false;
      if (department === '마감팀') return u.department.includes('마감');
      if (department === '구조팀') return u.department.includes('구조');
      if (department === '토목&조경팀') return u.department.includes('토목') || u.department.includes('조경');
      return false;
    });
  }, [users, department]);

  // 해당 부서 베트남 팀 목록 (사용자 요청: 마감 6개팀, 구조 2개팀, 토목 1개팀)
  const vietTeams = useMemo(() => {
    return VIET_TEAMS_DATA.filter((vt) => vt.department === department);
  }, [department]);

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
      vietTeams.forEach((vt) => {
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
    }

    return units;
  }, [koreaUsers, vietTeams, regionFilter]);

  // 해당 부서 프로젝트 필터링
  const deptProjects = useMemo(() => {
    return projects.filter((p) => p.department === department);
  }, [projects, department]);

  // 프로젝트 이름 약칭 추출 함수
  const getProjectShortName = (name: string) => {
    const match = name.match(/\[(.*?)\]/);
    if (match && match[1]) {
      return match[1].replace(/재개발|오피스텔|단지|복합시설/g, '').trim();
    }
    return name.slice(0, 7);
  };

  // 행 유닛별 배정 작업 수집 및 겹치는 구간 스마트 스택(Greedy Interval Coloring)
  const unitTasksMap = useMemo(() => {
    const rawMap: Record<string, AssignedTask[]> = {};

    scheduleRowUnits.forEach((u) => {
      rawMap[u.id] = [];
    });

    deptProjects.forEach((p) => {
      const shortName = getProjectShortName(p.name);

      if (p.subTasks) {
        Object.values(p.subTasks).forEach((st) => {
          // 1. 한국 개인 매칭
          const matchedKoreaUser = koreaUsers.find(
            (ku) => ku.id === st.personId || String(ku.no) === st.personId || ku.name === st.personId
          );
          if (matchedKoreaUser && rawMap[matchedKoreaUser.id]) {
            rawMap[matchedKoreaUser.id].push({
              projectId: p.id,
              projectName: p.name,
              projectShortName: shortName,
              roleName: st.roleName,
              startDate: st.startDate,
              endDate: st.endDate,
              status: st.status,
              memo: st.memo,
              version: st.version,
            });
          }

          // 2. 베트남 팀 매칭 (공종명 또는 베트남 인원 번호로 해당 팀 매핑)
          vietTeams.forEach((vt) => {
            const isMemberInTeam = vt.members.some(
              (m) => m.id === st.personId || String(m.no) === st.personId || m.name === st.personId
            );
            // 공종명 기반 매핑 (예: 내부 -> 내부팀, 창호 -> 창호팀, 조적 -> 조적팀, 외부 -> 외부팀, 슬라브/보 -> 수평팀, 기둥/옹벽 -> 수직팀)
            const isRoleMapped =
              (vt.code === 'IN1' && (st.roleName === '내부' || st.roleName === '세대')) ||
              (vt.code === 'EXT' && st.roleName === '외부') ||
              (vt.code === 'BRICK' && st.roleName === '조적') ||
              (vt.code === 'WIN' && st.roleName === '창호') ||
              (vt.code === 'VERT' && (st.roleName === '기둥' || st.roleName === '옹벽' || st.roleName === '기초')) ||
              (vt.code === 'HORIZ' && (st.roleName === '보' || st.roleName === '슬라브' || st.roleName === '아파트슬라브')) ||
              (vt.code === 'CIVIL' && (st.roleName === '토목' || st.roleName === '부대토목'));

            if ((isMemberInTeam || isRoleMapped) && rawMap[vt.id]) {
              const alreadyExists = rawMap[vt.id].some(
                (t) => t.projectId === p.id && t.roleName === st.roleName
              );
              if (!alreadyExists) {
                rawMap[vt.id].push({
                  projectId: p.id,
                  projectName: p.name,
                  projectShortName: shortName,
                  roleName: st.roleName,
                  startDate: st.startDate,
                  endDate: st.endDate,
                  status: st.status,
                  memo: st.memo,
                  version: st.version,
                });
              }
            }
          });
        });
      }
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
  }, [scheduleRowUnits, deptProjects, koreaUsers, vietTeams]);

  // 간트 바 스타일 위치 계산
  const getGanttBarStyle = (task: AssignedTask, lane: number) => {
    const start = new Date(task.startDate);
    const end = new Date(task.endDate);

    const effStart = start < monthStart ? monthStart : start;
    const effEnd = end > monthEnd ? monthEnd : end;

    if (effStart > monthEnd || effEnd < monthStart) return null;

    const left = differenceInDays(effStart, monthStart) * cellWidth;
    const width = (differenceInDays(effEnd, effStart) + 1) * cellWidth;
    const top = lane * 30 + 5;

    return {
      left: `${left + 2}px`,
      width: `${Math.max(width - 4, 30)}px`,
      top: `${top}px`,
      height: '24px',
    };
  };

  // 공종/상태별 색상 스타일
  const getTaskColorClass = (roleName: string, status: string) => {
    if (status === '완료') {
      return 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700';
    }
    if (roleName === 'PM') {
      return 'bg-slate-900 text-white border-slate-950 hover:bg-black shadow-xs';
    }
    if (roleName === '창호' || roleName === '보') {
      return 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700';
    }
    if (roleName === '조적' || roleName === '슬라브') {
      return 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600';
    }
    if (roleName === '외부' || roleName === '옹벽') {
      return 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700';
    }
    if (roleName === '내부' || roleName === '기둥') {
      return 'bg-cyan-600 text-white border-cyan-700 hover:bg-cyan-700';
    }
    return 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700';
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. 상단 컨트롤 패널 */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-[#00338d]" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {department} 캘린더 일정표
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-[#00338d] font-bold border border-blue-200">
              한국 본사 {koreaUsers.length}명 · 베트남 {vietTeams.length}개 팀 유닛
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            한국 본사는 개인별, 베트남은 팀별(마감 6개팀 / 구조 2개팀)로 날짜별 겹치는 프로젝트를 한눈에 식별합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 팀별 캘린더 ↔ 개인별 캘린더 토글 */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('PERSONAL')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'PERSONAL'
                  ? 'bg-white text-[#00338d] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" />
              개인/팀별 캘린더
            </button>
            <button
              onClick={() => setViewMode('TEAM')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'TEAM'
                  ? 'bg-white text-[#00338d] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              팀 전체 프로젝트 간트
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
          <ProjectCalendar />
        </div>
      ) : (
        <div className="corporate-card overflow-hidden">
          {/* 상단 퀵 필터 탭 (전체 / 한국 개인 / 베트남 팀 유닛) */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                표시 구분:
              </span>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setRegionFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    regionFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  전체 ({koreaUsers.length + vietTeams.length})
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
                  🇻🇳 베트남 팀별 ({vietTeams.length}개 팀)
                </button>
              </div>
            </div>

            {/* 범례 */}
            <div className="flex items-center gap-3 text-[11px] font-semibold">
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
            </div>
          </div>

          {/* 간트 타임라인 스크롤 영역 */}
          <div className="overflow-x-auto">
            <div
              className="inline-block min-w-full"
              style={{ width: `${280 + daysInMonth.length * cellWidth}px` }}
            >
              {/* 타임라인 헤더 (좌측 유닛명 + 우측 날짜 셀) */}
              <div className="flex border-b border-slate-200 bg-slate-100/90 sticky top-0 z-20">
                <div className="w-[280px] p-3 border-r border-slate-200 font-bold text-xs text-slate-700 flex items-center justify-between shrink-0 bg-slate-100">
                  <span>투입 인원 / 팀 구분</span>
                  <span className="text-[10px] text-slate-400 font-mono">ASSIGNMENT</span>
                </div>

                <div className="flex">
                  {daysInMonth.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isSat = getDay(day) === 6;
                    const isSun = getDay(day) === 0;
                    const isCurrentToday = isSameDay(day, today);
                    const holiday = HOLIDAYS_2026[dateStr];

                    return (
                      <div
                        key={dateStr}
                        style={{ width: `${cellWidth}px` }}
                        className={`text-center py-2 border-r border-slate-200 shrink-0 select-none flex flex-col justify-between ${
                          isSun || isSat || holiday
                            ? 'bg-slate-50/70'
                            : isCurrentToday
                            ? 'bg-blue-50/60'
                            : 'bg-white'
                        }`}
                      >
                        <div className="text-[10px] font-medium text-slate-400">
                          {format(day, 'E', { locale: ko })}
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
                  const rowHeight = Math.max(52, (maxLane + 1) * 32 + 12);

                  return (
                    <div
                      key={unit.id}
                      className={`flex hover:bg-slate-50/40 transition relative group ${
                        unit.isVietnam ? 'bg-red-50/15' : 'bg-white'
                      }`}
                      style={{ minHeight: `${rowHeight}px` }}
                    >
                      {/* 좌측 유닛 카드 (너비 280px) */}
                      <div
                        className={`w-[280px] p-2.5 border-r border-slate-200 shrink-0 flex items-center justify-between ${
                          unit.isVietnam ? 'bg-red-50/20' : 'bg-white'
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
                              <span className="font-bold text-xs text-slate-900 truncate">
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
                            <span className="text-[10px] text-slate-400 block truncate">
                              {unit.subTitle}
                            </span>
                          </div>
                        </div>

                        {/* 우측 액션: 베트남 팀일 경우 '팀원 배치/관리' 버튼 제공 */}
                        <div className="shrink-0 flex items-center gap-1 pl-1">
                          {unit.vietTeamData ? (
                            <button
                              onClick={() => setActiveVietTeamModal(unit.vietTeamData!)}
                              title="베트남 팀원 세부 인원 배치 관리"
                              className="px-2 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-md text-[10px] font-bold flex items-center gap-1 transition shadow-2xs"
                            >
                              <Settings2 size={12} />
                              팀원배치
                            </button>
                          ) : (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                tasks.length > 1
                                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                  : tasks.length === 1
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {tasks.length > 1 ? `중복 ${tasks.length}건` : `${tasks.length}건`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 우측 간트 그리드 배경 */}
                      <div
                        className="flex relative shrink-0"
                        style={{
                          width: `${daysInMonth.length * cellWidth}px`,
                          minHeight: `${rowHeight}px`,
                        }}
                      >
                        {/* 일자별 배경 격자선 */}
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const isSat = getDay(day) === 6;
                          const isSun = getDay(day) === 0;
                          const isCurrentToday = isSameDay(day, today);
                          const holiday = HOLIDAYS_2026[dateStr];

                          return (
                            <div
                              key={dateStr}
                              style={{ width: `${cellWidth}px` }}
                              className={`border-r border-slate-100 shrink-0 h-full ${
                                isCurrentToday
                                  ? 'bg-blue-50/25'
                                  : isSun || isSat || holiday
                                  ? 'bg-slate-50/50 striped-bg'
                                  : ''
                              }`}
                            />
                          );
                        })}

                        {/* 오늘(TODAY) 표시선 */}
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

                        {/* 간트 타임라인 바 렌더링 */}
                        {tasks.map((task, idx) => {
                          const style = getGanttBarStyle(task, task.lane);
                          if (!style) return null;

                          return (
                            <div
                              key={`${task.projectId}-${task.roleName}-${idx}`}
                              onClick={() => setSelectedProjectId(task.projectId)}
                              style={style}
                              title={`${task.projectName}\n공종: ${task.roleName}\n기간: ${task.startDate} ~ ${task.endDate}\n상태: ${task.status}\n메모: ${task.memo}`}
                              className={`absolute rounded-md border text-xs font-bold cursor-pointer transition-all duration-150 flex items-center px-2 z-10 shadow-2xs hover:shadow-md hover:scale-[1.01] ${getTaskColorClass(
                                task.roleName,
                                task.status
                              )}`}
                            >
                              <span className="truncate text-[11px] tracking-tight leading-tight drop-shadow-xs flex items-center gap-1">
                                <span className="font-extrabold text-white/95">
                                  [{task.projectShortName}]
                                </span>
                                <span className="font-black bg-white/20 px-1 rounded text-white text-[10px]">
                                  {task.roleName}
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
      <VietTeamModal
        team={activeVietTeamModal}
        isOpen={!!activeVietTeamModal}
        onClose={() => setActiveVietTeamModal(null)}
      />
    </div>
  );
};
