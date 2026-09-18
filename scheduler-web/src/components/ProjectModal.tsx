import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Printer,
  RefreshCw,
  CheckCircle2,
  Users,
  Calendar,
  AlertTriangle,
  UserCheck,
  Sparkles
} from 'lucide-react';
import {
  useProjectStore,
  TEAM_ROLES,
  type SubTaskSchedule,
  type SubTaskStatus
} from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { VIET_TEAMS_DATA } from '../data/vietTeams';

interface ProjectModalProps {
  projectId: string;
  onClose: () => void;
}

export default function ProjectModal({ projectId, onClose }: ProjectModalProps) {
  const {
    projects,
    updateSubTask
  } = useProjectStore();

  const { users } = useAuthStore();

  const project = projects.find((p) => p.id === projectId);

  // 로컬 편집 상태
  const [localSubTasks, setLocalSubTasks] = useState<Record<string, SubTaskSchedule>>({});
  const [savedSuccessKey, setSavedSuccessKey] = useState<string | null>(null);

  // 현재 좌측에서 포커스/선택된 공종 (우측 팀원 클릭 시 이 공종에 즉시 배정됨)
  const [selectedRole, setSelectedRole] = useState<string>('');

  // 우측 패널 필터: ALL, AVAILABLE, KOREA, VIETNAM
  const [rightFilter, setRightFilter] = useState<'ALL' | 'AVAILABLE' | 'KOREA' | 'VIETNAM'>('ALL');

  // 배정 피드백 토스트
  const [assignToast, setAssignToast] = useState<{ role: string; name: string } | null>(null);

  useEffect(() => {
    if (project) {
      setLocalSubTasks(project.subTasks || {});
      const roles = TEAM_ROLES[project.department] || TEAM_ROLES.마감팀;
      if (roles.length > 0 && !selectedRole) {
        setSelectedRole(roles[0]);
      }
    }
  }, [project]);

  if (!project) return null;

  // 프로젝트 팀에 해당하는 공종 목록
  const rolesForTeam = TEAM_ROLES[project.department] || TEAM_ROLES.마감팀;

  // 해당 부서 한국 본사 인원
  const deptKoreaUsers = users.filter((u) => {
    if (u.company !== '컨코스트') return false;
    if (project.department === '마감팀') return u.department.includes('마감');
    if (project.department === '구조팀') return u.department.includes('구조');
    if (project.department === '토목&조경팀') return u.department.includes('토목') || u.department.includes('조경');
    return false;
  });

  // 해당 부서 베트남 팀 목록
  const deptVietTeams = VIET_TEAMS_DATA.filter((vt) => vt.department === project.department);

  // 개별 공종 필드 업데이트
  const handleFieldChange = (
    roleName: string,
    field: keyof SubTaskSchedule,
    value: any
  ) => {
    setLocalSubTasks((prev) => {
      const current = prev[roleName] || {
        roleName,
        personId: '',
        startDate: project.startDate,
        endDate: project.endDate,
        status: '예정' as SubTaskStatus,
        memo: '',
        version: 'v1'
      };
      return {
        ...prev,
        [roleName]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  // 원클릭 인원 배정 핸들러 (우측 가용 팀원 카드 클릭 시 좌측의 선택된 공종에 자동 배정)
  const handleQuickAssign = (unitId: string, unitName: string) => {
    const targetRole = selectedRole || rolesForTeam[0];
    handleFieldChange(targetRole, 'personId', unitId);
    setAssignToast({ role: targetRole, name: unitName });
    setTimeout(() => setAssignToast(null), 3000);
  };

  // 단일 공종 카드 저장
  const handleSaveCard = (roleName: string) => {
    const item = localSubTasks[roleName];
    if (item) {
      updateSubTask(project.id, roleName, item);
      setSavedSuccessKey(roleName);
      setTimeout(() => setSavedSuccessKey(null), 2000);
    }
  };

  // 전체 공종 일괄 저장
  const handleSaveAll = () => {
    Object.entries(localSubTasks).forEach(([roleName, item]) => {
      updateSubTask(project.id, roleName, item);
    });
    alert('전체 공종 일정이 성공적으로 저장되었습니다. 개인별 캘린더에 실시간 동기화되었습니다.');
    onClose();
  };

  // 타 프로젝트와의 날짜 중복(Overlap) 검사 로직
  const getOverlappingTasks = (unitId: string, unitName: string, isViet: boolean) => {
    const overlaps: { projectName: string; roleName: string; startDate: string; endDate: string; status: string }[] = [];
    const pStart = project.startDate;
    const pEnd = project.endDate;

    const otherProjects = projects.filter((p) => p.id !== project.id);

    otherProjects.forEach((op) => {
      if (op.subTasks) {
        Object.values(op.subTasks).forEach((st) => {
          const isMatched = isViet
            ? (st.personId === unitId || st.roleName.includes(unitName) || (unitId === 'IN1' && (st.roleName === '내부' || st.roleName === '세대')))
            : (st.personId === unitId || st.personId === unitName || st.personId === String(deptKoreaUsers.find(k => k.id === unitId)?.no));

          if (isMatched && st.startDate && st.endDate) {
            // 날짜 겹침 조건: !(endA < startB || startA > endB)
            if (!(st.endDate < pStart || st.startDate > pEnd)) {
              overlaps.push({
                projectName: op.name,
                roleName: st.roleName,
                startDate: st.startDate,
                endDate: st.endDate,
                status: st.status
              });
            }
          }
        });
      }

      if (op.roles) {
        Object.entries(op.roles).forEach(([rName, rInfo]) => {
          if (!rInfo) return;
          const isMatched = isViet
            ? (rInfo.personId === unitId)
            : (rInfo.personId === unitId || rInfo.personId === unitName);

          if (isMatched && !(op.endDate < pStart || op.startDate > pEnd)) {
            const exists = overlaps.some((o) => o.projectName === op.name && o.roleName === rName);
            if (!exists) {
              overlaps.push({
                projectName: op.name,
                roleName: rName,
                startDate: op.startDate,
                endDate: op.endDate,
                status: '진행중'
              });
            }
          }
        });
      }
    });

    return overlaps;
  };

  // 팀원 유닛 목록 (한국 본사 + 베트남 팀) 가용성 분석 데이터
  const availabilityList = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      subTitle: string;
      badge: string;
      isVietnam: boolean;
      overlaps: Array<{ projectName: string; roleName: string; startDate: string; endDate: string; status: string }>;
      isAssignedToCurrent: boolean;
      assignedRoleInCurrent?: string;
    }> = [];

    // 1. 한국 본사 개인
    deptKoreaUsers.forEach((u) => {
      const overlaps = getOverlappingTasks(u.id, u.name, false);
      // 현재 프로젝트에서 배정된 공종이 있는지 확인
      const currentAssigned = Object.entries(localSubTasks).find(([_, st]) => st.personId === u.id || st.personId === u.name);

      list.push({
        id: u.id,
        name: u.name,
        subTitle: `${u.position} · ${u.department}`,
        badge: '한국 본사',
        isVietnam: false,
        overlaps,
        isAssignedToCurrent: !!currentAssigned,
        assignedRoleInCurrent: currentAssigned ? currentAssigned[0] : undefined
      });
    });

    // 2. 베트남 팀
    deptVietTeams.forEach((vt) => {
      const overlaps = getOverlappingTasks(vt.id, vt.displayName, true);
      const currentAssigned = Object.entries(localSubTasks).find(([_, st]) => st.personId === vt.id || st.personId === vt.displayName);

      list.push({
        id: vt.id,
        name: vt.displayName,
        subTitle: `팀장: ${vt.leaderName} (${vt.members.length}명)`,
        badge: '베트남 팀',
        isVietnam: true,
        overlaps,
        isAssignedToCurrent: !!currentAssigned,
        assignedRoleInCurrent: currentAssigned ? currentAssigned[0] : undefined
      });
    });

    return list;
  }, [deptKoreaUsers, deptVietTeams, localSubTasks, project.startDate, project.endDate, projects]);

  // 필터링된 가용성 목록
  const filteredAvailability = availabilityList.filter((item) => {
    if (rightFilter === 'AVAILABLE') return item.overlaps.length === 0;
    if (rightFilter === 'KOREA') return !item.isVietnam;
    if (rightFilter === 'VIETNAM') return item.isVietnam;
    return true;
  });

  // 색상 팔레트
  const getBadgeColor = (idx: number) => {
    const colors = [
      'bg-amber-500 text-white',
      'bg-rose-500 text-white',
      'bg-blue-600 text-white',
      'bg-emerald-600 text-white',
      'bg-purple-600 text-white',
      'bg-sky-600 text-white',
      'bg-orange-600 text-white',
      'bg-indigo-600 text-white',
    ];
    return colors[idx % colors.length];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      {/* 2-Column Split 와이드 모달 컨테이너 (스크린샷 5번 완벽 구현) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* 1. 모달 헤더 */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black tracking-wider text-[#00338d] dark:text-blue-400 uppercase">
                SELECTED PROJECT · {project.department} 공종별 성과물일정 & 인력배분
              </span>
              <span className="bg-blue-50 dark:bg-blue-950/60 text-[#00338d] dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full">
                {project.department}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span className="font-mono text-[#00338d] dark:text-blue-400">{project.code}</span>
              <span className="text-slate-300">·</span>
              <span>{project.name}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              좌측에서 공종을 선택하고, 우측의 실시간 가용성 및 중복 일정 간트를 확인하여 원클릭으로 최적의 인원을 배정합니다.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right bg-slate-50 dark:bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                산출 공정률 <span className="text-[#00338d] dark:text-blue-400 font-extrabold text-sm">{project.progress}%</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1 justify-end">
                <Calendar size={12} /> {project.startDate} ~ {project.endDate}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* 원클릭 배정 토스트 알림 */}
        {assignToast && (
          <div className="bg-emerald-600 text-white px-5 py-2.5 flex items-center justify-between text-xs font-bold animate-fadeIn shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>[{assignToast.role}] 공종 담당자로 '{assignToast.name}' 인원이 즉시 지정되었습니다!</span>
            </div>
            <span className="text-[11px] bg-emerald-700 px-2 py-0.5 rounded">실시간 반영</span>
          </div>
        )}

        {/* 2. 메인 바디: 와이드 2-Column Split 레이아웃 */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-slate-100/60 dark:bg-slate-950">
          
          {/* ======================= 좌측 패널: 공종별 배정 및 일정 폼 (7 cols, ~58%) ======================= */}
          <div className="lg:col-span-7 p-5 overflow-y-auto border-r border-slate-200 dark:border-slate-800 custom-scrollbar space-y-4">
            
            {/* 포커스 안내 바 */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00338d] dark:bg-blue-400 animate-ping" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  현재 선택된 공종: <strong className="text-[#00338d] dark:text-blue-400 font-extrabold text-sm">[{selectedRole || '선택 없음'}]</strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                우측 팀원 클릭 시 이 공종에 즉시 배정됩니다
              </span>
            </div>

            {/* 공종 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {rolesForTeam.map((roleName, idx) => {
                const subTask = localSubTasks[roleName] || {
                  roleName,
                  personId: project.roles[roleName]?.personId || '',
                  startDate: project.startDate,
                  endDate: project.endDate,
                  status: '예정',
                  memo: '',
                  version: 'v1'
                };

                const isSelected = selectedRole === roleName;
                const isSaved = savedSuccessKey === roleName;

                // 담당자 이름 표시
                const assignedPerson = availabilityList.find(
                  (a) => a.id === subTask.personId || a.name === subTask.personId
                );

                return (
                  <div
                    key={roleName}
                    onClick={() => setSelectedRole(roleName)}
                    className={`rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/40 dark:bg-blue-950/30 border-[#00338d] dark:border-blue-500 shadow-md ring-2 ring-[#00338d]/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* 카드 상단 */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-2xs ${getBadgeColor(
                            idx
                          )}`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">{roleName}</h4>
                            {isSelected && (
                              <span className="text-[10px] bg-[#00338d] text-white px-1.5 py-0.2 rounded font-bold">
                                포커스
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            기준 일정 · {subTask.version || 'v1'}
                          </span>
                        </div>
                      </div>

                      {/* 담당자 드롭다운 */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          value={subTask.personId}
                          onChange={(e) => handleFieldChange(roleName, 'personId', e.target.value)}
                          className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:border-[#00338d] focus:outline-none"
                        >
                          <option value="">담당자 미지정</option>
                          <optgroup label="🇰🇷 한국 본사 인원">
                            {deptKoreaUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.position})
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="🇻🇳 베트남 팀 유닛">
                            {deptVietTeams.map((vt) => (
                              <option key={vt.id} value={vt.id}>
                                {vt.displayName} (팀장: {vt.leaderName})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>

                    {/* 담당자 상태 표시 칩 */}
                    {assignedPerson ? (
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-xs">
                        <div className="flex items-center gap-1.5">
                          <UserCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">
                            {assignedPerson.name}
                          </span>
                          <span className="text-[10px] text-slate-400">({assignedPerson.badge})</span>
                        </div>
                        {assignedPerson.overlaps.length > 0 ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                            <AlertTriangle size={11} /> 중복 {assignedPerson.overlaps.length}건
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                            🟢 여유
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic px-2">
                        담당자가 지정되지 않았습니다 (우측에서 선택 가능)
                      </div>
                    )}

                    {/* 일정 및 상태 입력 행 */}
                    <div className="grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">시작일</label>
                        <input
                          type="date"
                          value={subTask.startDate}
                          onChange={(e) => handleFieldChange(roleName, 'startDate', e.target.value)}
                          className="w-full text-[11px] px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">종료일</label>
                        <input
                          type="date"
                          value={subTask.endDate}
                          onChange={(e) => handleFieldChange(roleName, 'endDate', e.target.value)}
                          className="w-full text-[11px] px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">상태</label>
                        <select
                          value={subTask.status}
                          onChange={(e) => handleFieldChange(roleName, 'status', e.target.value as SubTaskStatus)}
                          className={`w-full text-[11px] font-bold px-1.5 py-1 rounded-md border focus:outline-none ${
                            subTask.status === '완료'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                              : subTask.status === '진행중'
                              ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                              : subTask.status === '지연'
                              ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <option value="예정">예정</option>
                          <option value="진행중">진행중</option>
                          <option value="완료">완료</option>
                          <option value="지연">지연</option>
                        </select>
                      </div>
                    </div>

                    {/* 메모 입력창 */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={subTask.memo}
                        onChange={(e) => handleFieldChange(roleName, 'memo', e.target.value)}
                        placeholder="공종별 산출 특이사항 및 요청사항 입력"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                      />
                    </div>

                    {/* 카드 개별 저장 버튼 */}
                    <div className="flex justify-end pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleSaveCard(roleName)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          isSaved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#00338d] hover:bg-[#002366] text-white shadow-2xs active:scale-95'
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <CheckCircle2 size={13} /> 저장 완료!
                          </>
                        ) : (
                          <>
                            <Save size={13} /> 공종 저장
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================= 우측 패널: 팀원 실시간 가용성 & 스케줄 확인 간트 (5 cols, ~42%) ======================= */}
          <div className="lg:col-span-5 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4 bg-white dark:bg-slate-900">
            
            {/* 우측 패널 헤더 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users size={16} className="text-[#00338d] dark:text-blue-400" />
                  팀원 실시간 가용성 & 투입 현황
                </h3>
                <span className="text-[10px] font-bold text-slate-400">
                  기간: {project.startDate} ~ {project.endDate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                타 프로젝트 중복 건수를 확인하고, 인원을 클릭하면 <strong className="text-[#00338d] dark:text-blue-400">[{selectedRole}]</strong> 공종에 자동 배정됩니다.
              </p>
            </div>

            {/* 필터 탭 바 */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setRightFilter('ALL')}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  rightFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                전체 ({availabilityList.length})
              </button>
              <button
                onClick={() => setRightFilter('AVAILABLE')}
                className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${
                  rightFilter === 'AVAILABLE'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                배정 가능 ({availabilityList.filter((a) => a.overlaps.length === 0).length})
              </button>
              <button
                onClick={() => setRightFilter('KOREA')}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  rightFilter === 'KOREA'
                    ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                본사 ({deptKoreaUsers.length})
              </button>
              <button
                onClick={() => setRightFilter('VIETNAM')}
                className={`flex-1 py-1.5 rounded-lg transition ${
                  rightFilter === 'VIETNAM'
                    ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                베트남 ({deptVietTeams.length})
              </button>
            </div>

            {/* 인원/팀 가용성 카드 목록 */}
            <div className="space-y-2.5">
              {filteredAvailability.map((unit) => {
                const overlapCount = unit.overlaps.length;
                const isAvailable = overlapCount === 0;

                return (
                  <div
                    key={unit.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isAvailable
                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400'
                        : overlapCount === 1
                        ? 'bg-amber-50/20 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/60 hover:border-amber-400'
                        : 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-200 dark:border-rose-800/60 hover:border-rose-400'
                    }`}
                  >
                    {/* 상단 프로필 & 배정 버튼 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            unit.isVietnam
                              ? 'bg-rose-500 text-white'
                              : 'bg-[#00338d] text-white'
                          }`}
                        >
                          {unit.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                              {unit.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {unit.subTitle}
                            </span>
                          </div>

                          {/* 가용성 상태 배지 */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isAvailable ? (
                              <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.2 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                🟢 배정 가능 (여유)
                              </span>
                            ) : overlapCount === 1 ? (
                              <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.2 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                🟡 타 프로젝트 1건 겹침 (주의)
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.2 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                🔴 중복 {overlapCount}건 (과부하 위험)
                              </span>
                            )}

                            {unit.assignedRoleInCurrent && (
                              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.2 rounded-full">
                                현재 [{unit.assignedRoleInCurrent}] 배정됨
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 원클릭 배정 액션 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleQuickAssign(unit.id, unit.name)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#00338d] hover:bg-[#002266] text-white text-[11px] font-bold shadow-2xs flex items-center gap-1 shrink-0 transition active:scale-95"
                        title={`현재 선택된 [${selectedRole}] 공종에 ${unit.name} 배정`}
                      >
                        <UserCheck size={12} />
                        <span>배정</span>
                      </button>
                    </div>

                    {/* 중복 일정 타임라인 바 (Overlapping Tasks Timeline) */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      {overlapCount > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 block">
                            동일 기간 진행 중인 타 프로젝트 ({overlapCount}건):
                          </span>
                          {unit.overlaps.map((ov, oIdx) => (
                            <div
                              key={oIdx}
                              className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                  [{ov.projectName}]
                                </span>
                                <span className="bg-slate-100 dark:bg-slate-700 text-[#00338d] dark:text-blue-300 px-1.5 py-0.2 rounded font-bold text-[10px]">
                                  {ov.roleName}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                                {ov.startDate} ~ {ov.endDate}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Sparkles size={12} />
                          <span>해당 프로젝트 기간 동안 겹치는 타 공종 일정이 없습니다. 투입 추천!</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. 모달 하단 푸터 액션 바 */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Printer size={14} /> 이 프로젝트 상세 일정 출력
            </button>
            <button
              type="button"
              onClick={() => {
                if (project) setLocalSubTasks(project.subTasks || {});
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <RefreshCw size={14} /> 최신 일정 다시 불러오기
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <Save size={14} /> 전체 일정 저장 완료
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition"
            >
              확인하고 닫기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
