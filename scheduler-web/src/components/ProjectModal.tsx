import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Printer,
  RefreshCw,
  CheckCircle2,
  Users,
  Calendar,
  UserCheck,
  Sparkles,
  Search,
  Building,
  Maximize2,
  FileText,
  PhoneCall,
  ChevronDown,
  ChevronUp,
  Info
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

  // 현재 좌측에서 포커스/선택된 공종 (우측 팀원 클릭 시 이 공종에 즉시 배정됨)
  const [selectedRole, setSelectedRole] = useState<string>('');

  // 우측 패널 필터: ALL, AVAILABLE, KOREA, VIETNAM
  const [rightFilter, setRightFilter] = useState<'ALL' | 'AVAILABLE' | 'KOREA' | 'VIETNAM'>('ALL');
  // 우측 팀원 검색어
  const [searchQuery, setSearchQuery] = useState('');

  // 배정 피드백 토스트
  const [assignToast, setAssignToast] = useState<{ role: string; name: string } | null>(null);

  // 그룹웨어 수주 세부 스펙 아코디언 토글 (기본 펼침)
  const [isSpecExpanded, setIsSpecExpanded] = useState(true);

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

  // 원클릭 인원 배정 핸들러 (다중 인원 지원: 이미 배정되어 있으면 해제, 없으면 추가)
  const handleTogglePerson = (roleName: string, unitId: string, unitName: string) => {
    const targetRole = roleName || selectedRole || rolesForTeam[0];
    setLocalSubTasks((prev) => {
      const current = prev[targetRole] || {
        roleName: targetRole,
        personId: unitId,
        personIds: [unitId],
        startDate: project.startDate,
        endDate: project.endDate,
        status: '예정' as SubTaskStatus,
        memo: '',
        version: 'v1'
      };

      const existingIds = current.personIds && current.personIds.length > 0
        ? [...current.personIds]
        : (current.personId ? [current.personId] : []);

      let updatedIds: string[];
      if (existingIds.includes(unitId)) {
        updatedIds = existingIds.filter((id) => id !== unitId);
      } else {
        updatedIds = [...existingIds, unitId];
      }

      const primaryPersonId = updatedIds[0] || '';
      return {
        ...prev,
        [targetRole]: {
          ...current,
          personId: primaryPersonId,
          personIds: updatedIds
        }
      };
    });

    const isRemovedAction = (localSubTasks[targetRole]?.personIds || []).includes(unitId);
    setAssignToast({
      role: targetRole,
      name: isRemovedAction ? `${unitName} (배정 해제)` : `${unitName} (투입 배정)`
    });
    setTimeout(() => setAssignToast(null), 3000);
  };

  // 개별 인원 칩 X 클릭시 제거
  const handleRemovePerson = (roleName: string, unitId: string) => {
    setLocalSubTasks((prev) => {
      const current = prev[roleName];
      if (!current) return prev;
      const existing = current.personIds && current.personIds.length > 0
        ? current.personIds
        : (current.personId ? [current.personId] : []);
      const updated = existing.filter((id) => id !== unitId);
      return {
        ...prev,
        [roleName]: {
          ...current,
          personId: updated[0] || '',
          personIds: updated
        }
      };
    });
  };

  // 전체 공종 일괄 저장
  const handleSaveAll = () => {
    Object.entries(localSubTasks).forEach(([roleName, item]) => {
      updateSubTask(project.id, roleName, item);
    });
    alert('전체 공종 일정이 성공적으로 저장되었습니다. 다중 배정 인원 및 내역 유형이 실시간 동기화되었습니다.');
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
    if (rightFilter === 'AVAILABLE' && item.overlaps.length > 0) return false;
    if (rightFilter === 'KOREA' && item.isVietnam) return false;
    if (rightFilter === 'VIETNAM' && !item.isVietnam) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchSub = item.subTitle.toLowerCase().includes(q);
      if (!matchName && !matchSub) return false;
    }
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

        {/* 그룹웨어 수주 세부 스펙 & 건축 개요 카드 */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 px-5 py-3 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-[#00338d] dark:text-blue-300">
                <Building size={16} />
              </span>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                그룹웨어 수주 세부 스펙 & 건축 개요
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-[#00338d] dark:text-blue-400 font-bold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  사내 그룹웨어 실시간 연동
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSpecExpanded(!isSpecExpanded)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
            >
              {isSpecExpanded ? (
                <>세부정보 접기 <ChevronUp size={14} /></>
              ) : (
                <>연면적/세부스펙 보기 <ChevronDown size={14} /></>
              )}
            </button>
          </div>

          {isSpecExpanded && (
            <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
              {/* 1. 연면적 */}
              <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Maximize2 size={13} className="text-[#00338d] dark:text-blue-400" />
                  연면적
                </div>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                  {project.area || '미기재'}
                </div>
                {project.buildings && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-medium">
                    동수: {project.buildings}
                  </div>
                )}
              </div>

              {/* 2. 건물용도 및 규모 */}
              <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building size={13} className="text-[#00338d] dark:text-blue-400" />
                  건물 용도 및 층수
                </div>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-1 line-clamp-1">
                  {project.usage || '일반 건축물'}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-medium">
                  {project.floors ? `층수: ${project.floors}` : (project.buildings ? `동수: ${project.buildings}` : '규모: 정보 확인중')}
                </div>
              </div>

              {/* 3. 발주처 및 담당자 */}
              <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <PhoneCall size={13} className="text-[#00338d] dark:text-blue-400" />
                  발주처 / 의뢰처
                </div>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-1 line-clamp-1">
                  {project.client || '삼성물산(주)'}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-medium line-clamp-1" title={project.contacts?.join(', ')}>
                  {project.contacts && project.contacts.length > 0 ? project.contacts.join(' / ') : '담당자 미지정'}
                </div>
              </div>

              {/* 4. 견적조건 및 특기사항 */}
              <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText size={13} className="text-[#00338d] dark:text-blue-400" />
                  견적조건 및 특기사항
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 line-clamp-2" title={project.notes || project.request}>
                  {project.notes || project.request || '공내역서 및 설계도서 기준 산출'}
                </div>
              </div>

              {/* 수주시 요청사항/회의록 전문 (내용이 있을 경우 가로 전체 표시) */}
              {(project.request || project.notes) && (
                <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-blue-50/50 dark:bg-blue-950/20 px-3.5 py-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-2">
                  <Info size={14} className="text-[#00338d] dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="text-[#00338d] dark:text-blue-400 font-bold">수주 세부 요청사항 / 회의록: </strong>
                    <span>{project.request || project.notes}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. 메인 바디: 와이드 2-Column Split 레이아웃 */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-slate-100/60 dark:bg-slate-950">
          
          {/* ======================= 좌측 패널: 공종별 배정 및 일정 폼 (7 cols, ~58%) ======================= */}
          <div className="lg:col-span-7 p-5 overflow-y-auto border-r border-slate-200 dark:border-slate-800 custom-scrollbar space-y-4">
            
            {/* 포커스 안내 바 */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00338d] dark:bg-blue-400 animate-ping shrink-0" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  현재 선택된 공종: <strong className="text-[#00338d] dark:text-blue-400 font-extrabold text-sm">[{selectedRole || '선택 없음'}]</strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                👉 우측 팀원 [배정] 클릭 시 즉시 지정
              </span>
            </div>

            {/* 공종 카드 그리드 (뭉개짐 없이 정돈된 모던 카드) */}
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

                return (
                  <div
                    key={roleName}
                    onClick={() => setSelectedRole(roleName)}
                    className={`rounded-xl border p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-950/40 border-[#00338d] dark:border-blue-500 shadow-md ring-2 ring-[#00338d]/20'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* 카드 상단: 공종 뱃지 + 명칭 + 기준버전 + 상태 셀렉트 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 shadow-2xs ${getBadgeColor(
                            idx
                          )}`}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <h4 className="font-extrabold text-slate-900 dark:text-white text-sm truncate">{roleName}</h4>
                          {isSelected && (
                            <span className="text-[10px] bg-[#00338d] text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                              포커스
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono shrink-0 whitespace-nowrap">
                            · {subTask.version || 'v1'}
                          </span>
                        </div>
                      </div>

                      {/* 상태 선택 셀렉트 */}
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <select
                          value={subTask.status}
                          onChange={(e) => handleFieldChange(roleName, 'status', e.target.value as SubTaskStatus)}
                          className={`text-[11px] font-extrabold px-2 py-1 rounded-md border focus:outline-none transition ${
                            subTask.status === '완료'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                              : subTask.status === '진행중'
                              ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                              : subTask.status === '지연'
                              ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <option value="예정">예정</option>
                          <option value="진행중">진행중</option>
                          <option value="완료">완료</option>
                          <option value="지연">지연</option>
                        </select>
                      </div>
                    </div>

                    {/* 담당자 배정 카드 영역 (다중 인원 지원) */}
                    <div
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <UserCheck size={14} className={((subTask.personIds && subTask.personIds.length > 0) || subTask.personId) ? "text-emerald-600 dark:text-emerald-400 shrink-0" : "text-slate-400 shrink-0"} />
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            투입 인원 {((subTask.personIds && subTask.personIds.length > 0) ? subTask.personIds.length : (subTask.personId ? 1 : 0))}명
                          </span>
                        </div>

                        {/* 가용성 현황 요약 */}
                        {((subTask.personIds && subTask.personIds.length > 0) ? subTask.personIds : (subTask.personId ? [subTask.personId] : [])).length > 0 && (
                          <div className="shrink-0 flex items-center gap-1">
                            {((subTask.personIds && subTask.personIds.length > 0) ? subTask.personIds : (subTask.personId ? [subTask.personId] : [])).map((pId) => {
                              const avail = availabilityList.find(a => a.id === pId || a.name === pId);
                              const hasOverlap = (avail?.overlaps.length || 0) > 0;
                              return (
                                <span
                                  key={pId}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    hasOverlap
                                      ? 'text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300'
                                      : 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300'
                                  }`}
                                  title={hasOverlap ? `${avail?.name || pId}: ⚠ ${avail?.overlaps.length}건 겹침` : `${avail?.name || pId}: 🟢 여유`}
                                >
                                  {avail?.name || pId}{hasOverlap ? '⚠' : '✓'}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 배정된 다중 인원 칩 목록 (X 버튼으로 개별 제외) */}
                      {(() => {
                        const currentIds = subTask.personIds && subTask.personIds.length > 0
                          ? subTask.personIds
                          : (subTask.personId ? [subTask.personId] : []);

                        if (currentIds.length === 0) {
                          return (
                            <div className="text-xs text-slate-400 italic py-0.5">
                              담당자 미배정 (우측 목록에서 [배정] 클릭)
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {currentIds.map((pId) => {
                              const kUser = deptKoreaUsers.find(k => k.id === pId || String(k.no) === pId || k.name === pId);
                              const vTeam = deptVietTeams.find(vt => vt.id === pId || vt.code === pId || vt.displayName.includes(pId));
                              const avail = availabilityList.find(a => a.id === pId || a.name === pId);
                              const displayName = kUser?.name || vTeam?.displayName || avail?.name || pId;
                              const badge = kUser?.position || (vTeam ? '베트남팀' : avail?.badge || '배정');

                              return (
                                <span
                                  key={pId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-200 dark:border-blue-700 shadow-2xs"
                                >
                                  <span>{displayName}</span>
                                  <span className="text-[10px] text-blue-500 dark:text-blue-300 font-normal">
                                    ({badge})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePerson(roleName, pId)}
                                    className="text-blue-400 hover:text-rose-600 transition p-0.5 rounded ml-0.5"
                                    title={`${displayName} 투입 해제`}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* 추가 인원 지정 드롭다운 */}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            const unitName = deptKoreaUsers.find(k => k.id === e.target.value)?.name || deptVietTeams.find(v => v.id === e.target.value)?.displayName || e.target.value;
                            handleTogglePerson(roleName, e.target.value, unitName);
                          }
                        }}
                        className="w-full text-xs font-medium px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                      >
                        <option value="">+ 인원 추가 투입 선택...</option>
                        <optgroup label="🇰🇷 한국 본사 인원">
                          {deptKoreaUsers.map((u) => {
                            const isAssigned = (subTask.personIds || [subTask.personId]).includes(u.id);
                            return (
                              <option key={u.id} value={u.id}>
                                {isAssigned ? '✓ ' : ''}{u.name} ({u.position}) {isAssigned ? '(배정됨)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🇻🇳 베트남 팀 유닛">
                          {deptVietTeams.map((vt) => {
                            const isAssigned = (subTask.personIds || [subTask.personId]).includes(vt.id);
                            return (
                              <option key={vt.id} value={vt.id}>
                                {isAssigned ? '✓ ' : ''}{vt.displayName} (팀장: {vt.leaderName}) {isAssigned ? '(배정됨)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      </select>
                    </div>

                    {/* 내역 공종 전용: 3대 유형 (공내역, 설계예가, 실행가) 선택 버튼 */}
                    {roleName === '내역' && (
                      <div
                        className="p-2.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 space-y-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-[#00338d] dark:text-blue-300 flex items-center gap-1">
                            📊 내역 유형 선택:
                          </span>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#00338d] text-white">
                            {subTask.subType || '공내역'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(['공내역', '설계예가', '실행가'] as const).map((t) => {
                            const isCurrent = (subTask.subType || '공내역') === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => handleFieldChange(roleName, 'subType', t)}
                                className={`py-1 text-xs font-black rounded-md transition ${
                                  isCurrent
                                    ? 'bg-[#00338d] text-white shadow-2xs ring-2 ring-blue-400'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 일정 입력 행: 시작일 ~ 종료일 (컴팩트 인라인) */}
                    <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 mb-0.5">시작일</span>
                        <input
                          type="date"
                          value={subTask.startDate}
                          onChange={(e) => handleFieldChange(roleName, 'startDate', e.target.value)}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 mb-0.5">종료일</span>
                        <input
                          type="date"
                          value={subTask.endDate}
                          onChange={(e) => handleFieldChange(roleName, 'endDate', e.target.value)}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 슬림한 비고/메모 입력란 (더 이상 불필요하게 길고 뚱뚱하지 않음) */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={subTask.memo}
                        onChange={(e) => handleFieldChange(roleName, 'memo', e.target.value)}
                        placeholder="특이사항 및 전달 메모 (선택)"
                        className="w-full text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#00338d]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================= 우측 패널: 팀원 실시간 가용성 & 스케줄 확인 간트 (5 cols, ~42%) ======================= */}
          <div className="lg:col-span-5 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-3.5 bg-white dark:bg-slate-900">
            
            {/* 우측 패널 헤더 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users size={16} className="text-[#00338d] dark:text-blue-400" />
                  팀원 실시간 가용성 & 투입 현황
                </h3>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {project.startDate} ~ {project.endDate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                [배정]을 누르면 포커스된 <strong className="text-[#00338d] dark:text-blue-400">[{selectedRole}]</strong> 공종에 즉시 반영됩니다.
              </p>
            </div>

            {/* 필터 및 컴팩트 검색 바 (검색창 너비 적정화) */}
            <div className="flex flex-wrap items-center gap-1.5 justify-between bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRightFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                    rightFilter === 'ALL'
                      ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  전체 ({availabilityList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightFilter('AVAILABLE')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                    rightFilter === 'AVAILABLE'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  여유 ({availabilityList.filter((a) => a.overlaps.length === 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightFilter('KOREA')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition ${
                    rightFilter === 'KOREA'
                      ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  본사
                </button>
                <button
                  type="button"
                  onClick={() => setRightFilter('VIETNAM')}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition ${
                    rightFilter === 'VIETNAM'
                      ? 'bg-white dark:bg-slate-700 text-[#00338d] dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  베트남
                </button>
              </div>

              {/* 컴팩트 검색창 (적정 너비 130px) */}
              <div className="relative w-32 shrink-0">
                <Search size={12} className="absolute left-2 top-2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="팀원 검색..."
                  className="w-full text-xs pl-6 pr-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                />
              </div>
            </div>

            {/* 인원/팀 가용성 카드 목록 */}
            <div className="space-y-2">
              {filteredAvailability.map((unit) => {
                const overlapCount = unit.overlaps.length;
                const isAvailable = overlapCount === 0;

                return (
                  <div
                    key={unit.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isAvailable
                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400'
                        : overlapCount === 1
                        ? 'bg-amber-50/20 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/60 hover:border-amber-400'
                        : 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-200 dark:border-rose-800/60 hover:border-rose-400'
                    }`}
                  >
                    {/* 상단 프로필 & 배정 버튼 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            unit.isVietnam
                              ? 'bg-rose-500 text-white'
                              : 'bg-[#00338d] text-white'
                          }`}
                        >
                          {unit.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate">
                              {unit.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium truncate">
                              {unit.subTitle}
                            </span>
                          </div>

                          {/* 가용성 상태 배지 */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isAvailable ? (
                              <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.2 rounded-full flex items-center gap-1">
                                🟢 투입 추천 (여유)
                              </span>
                            ) : overlapCount === 1 ? (
                              <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 rounded-full flex items-center gap-1">
                                🟡 1건 겹침 (주의)
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.2 rounded-full flex items-center gap-1">
                                🔴 중복 {overlapCount}건 (과부하)
                              </span>
                            )}

                            {unit.assignedRoleInCurrent && (
                              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 rounded-full">
                                현재 [{unit.assignedRoleInCurrent}]
                              </span>
                            )}

                            {(() => {
                              const targetRole = selectedRole || rolesForTeam[0];
                              const targetSub = localSubTasks[targetRole];
                              const pIds = targetSub?.personIds && targetSub.personIds.length > 0
                                ? targetSub.personIds
                                : (targetSub?.personId ? [targetSub.personId] : []);
                              const isCurrentRoleAssigned = pIds.includes(unit.id) || pIds.includes(unit.name);

                              if (isCurrentRoleAssigned) {
                                return (
                                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.2 rounded-full ring-1 ring-indigo-400">
                                    ★ 포커스 [{targetRole}] 배정중
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* 원클릭 배정/해제 토글 액션 버튼 */}
                      {(() => {
                        const targetRole = selectedRole || rolesForTeam[0];
                        const targetSub = localSubTasks[targetRole];
                        const pIds = targetSub?.personIds && targetSub.personIds.length > 0
                          ? targetSub.personIds
                          : (targetSub?.personId ? [targetSub.personId] : []);
                        const isAssigned = pIds.includes(unit.id) || pIds.includes(unit.name);

                        return (
                          <button
                            type="button"
                            onClick={() => handleTogglePerson(targetRole, unit.id, unit.name)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold shadow-2xs flex items-center gap-1 shrink-0 transition active:scale-95 ${
                              isAssigned
                                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                : 'bg-[#00338d] hover:bg-[#002266] text-white'
                            }`}
                            title={isAssigned ? `현재 [${targetRole}] 공종에서 ${unit.name} 투입 해제` : `현재 [${targetRole}] 공종에 ${unit.name} 추가 배정`}
                          >
                            {isAssigned ? (
                              <>
                                <CheckCircle2 size={13} />
                                <span>배정됨 (해제)</span>
                              </>
                            ) : (
                              <>
                                <UserCheck size={13} />
                                <span>+ 배정</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>

                    {/* 타 프로젝트 중복 표시 (정돈된 뱃지 스타일) */}
                    {overlapCount > 0 ? (
                      <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1">
                        {unit.overlaps.map((ov, oIdx) => (
                          <div
                            key={oIdx}
                            className="bg-white/80 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px]"
                          >
                            <span className="font-bold text-slate-700 dark:text-slate-300 truncate mr-2">
                              {ov.projectName.length > 18 ? ov.projectName.slice(0, 18) + '...' : ov.projectName}
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                              [{ov.roleName}] {ov.startDate.slice(5)}~{ov.endDate.slice(5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Sparkles size={11} />
                        <span>겹치는 타 공종 일정이 없습니다.</span>
                      </div>
                    )}
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
