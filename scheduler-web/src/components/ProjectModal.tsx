import {usePersonalStore} from '../store/usePersonalStore';
import {ProjectDetailPrint} from './ProjectDetailPrint';
import {PostDeliverySchedule} from './PostDeliverySchedule';
import {leavesFor,assignedTasksForAliases,assignmentAliases,taskAssignedTo,memberIds,assignmentSegments,nextDay} from '../utils/personalWork';
import { projectProgress, percentLabel, plannedWorkDays, validDateRange, localDate } from '../utils/scheduleProgress';
import {taskWithProjectDates,type ProjectPeriod} from '../utils/projectScheduleDates';
import { withAllocationBounds, updateAssignmentMembers } from '../utils/scheduleAllocations';
import { resolveVietTeams, vietIndividuals } from '../utils/vietPersonnel';
import { rebaseProject } from '../utils/rebaseProject';
import { canManageSchedule } from '../utils/schedulePermissions';
import { projectPMId } from '../utils/pendingAssignment';
import { useState, useEffect, useRef } from 'react';
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
  type Project,
  type SubTaskSchedule,
  type ScheduleAllocation,
  type SubTaskStatus
} from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { VIET_TEAMS_DATA } from '../data/vietTeams';

interface ProjectModalProps {
  projectId: string;
  onClose: () => void;
  onOpenInquiries?: (projectId:string,role:string)=>void;
}

type AvailabilityPeriod = {startDate: string; endDate: string};
type AvailabilityEntry = AvailabilityPeriod & {id: string; projectName: string; roleName: string; kind: 'project' | 'leave'};
type AvailabilityGroup = {id: string; projectName: string; kind: 'project' | 'leave'; periods: AvailabilityPeriod[]; roles: Array<{name: string; periods: AvailabilityPeriod[]}>};

// Fold display rows only. Disjoint assignment periods and original schedule records stay separate.
export function groupAvailability(entries: AvailabilityEntry[]): AvailabilityGroup[] {
  const mergePeriods = (periods: AvailabilityPeriod[]) => {
    const merged: AvailabilityPeriod[] = [];
    for (const period of [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))) {
      const last = merged.at(-1);
      if (last && period.startDate <= nextDay(last.endDate)) last.endDate = last.endDate > period.endDate ? last.endDate : period.endDate;
      else merged.push({startDate: period.startDate, endDate: period.endDate});
    }
    return merged;
  };
  const groups = new Map<string, AvailabilityGroup>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`;
    let group = groups.get(key);
    if (!group) { group = {id: key, projectName: entry.projectName, kind: entry.kind, periods: [], roles: []}; groups.set(key, group); }
    group.periods.push(entry);
    let role = group.roles.find(role => role.name === entry.roleName);
    if (!role) { role = {name: entry.roleName, periods: []}; group.roles.push(role); }
    role.periods.push(entry);
  }
  return [...groups.values()].map(group => ({...group, periods: mergePeriods(group.periods), roles: group.roles.map(role => ({...role, periods: mergePeriods(role.periods)}))}));
}

const availabilityDates = (periods: AvailabilityPeriod[]) => periods.map(({startDate, endDate}) => startDate === endDate ? startDate : `${startDate} ~ ${startDate.slice(0, 4) === endDate.slice(0, 4) ? endDate.slice(5) : endDate}`).join(', ');
const availabilityLabel = (groups: AvailabilityGroup[]) => {
  const projects = groups.filter(group => group.kind === 'project').length;
  const leaves = groups.filter(group => group.kind === 'leave').length;
  return [projects ? `겹치는 프로젝트 ${projects}개` : '', leaves ? `휴가 ${leaves}건` : ''].filter(Boolean).join(' · ');
};

export default function ProjectModal({ projectId, onClose, onOpenInquiries }: ProjectModalProps) {
  const leaves=usePersonalStore(s=>s.leaves);
  const {
    projects,
    updateProjectSubTasks
  } = useProjectStore();

  const { users, currentUser } = useAuthStore();

  const project = projects.find((p) => p.id === projectId);

  // 로컬 편집 상태
  const [localSubTasks, setLocalSubTasks] = useState<Record<string, SubTaskSchedule>>(project?.subTasks || {});
  const [localPeriod,setLocalPeriod]=useState<ProjectPeriod>({startDate:project?.startDate||'',endDate:project?.endDate||''});
  const editBase = useRef<Project | undefined>(undefined);
  const remoteMerge = useRef<{blocked:boolean;pending?:{tasks:Record<string,SubTaskSchedule>;period:ProjectPeriod}}>({blocked:false});
  const [syncError, setSyncError] = useState('');

  // 현재 좌측에서 포커스/선택된 공종 (우측 팀원 클릭 시 이 공종에 즉시 배정됨)
  const [selectedRole, setSelectedRole] = useState<string>('');

  // 우측 패널 필터: ALL, AVAILABLE, KOREA, VIETNAM
  const [rightFilter, setRightFilter] = useState<'ALL' | 'AVAILABLE' | 'KOREA' | 'VIETNAM'>('ALL');
  const [vietSelection, setVietSelection] = useState<'TEAM' | 'INDIVIDUAL'>('TEAM');
  // 우측 팀원 검색어
  const [searchQuery, setSearchQuery] = useState('');

  // 배정 피드백 토스트
  const [assignToast, setAssignToast] = useState<{ role: string; name: string } | null>(null);

  // 그룹웨어 수주 세부 스펙 아코디언 토글 (기본 펼침)
  const [isSpecExpanded, setIsSpecExpanded] = useState(true);
  const [printPreview, setPrintPreview] = useState(false);

  const canSaveTaskDates = (tasks: Record<string, SubTaskSchedule>) => {
    if (!project) return false;
    const original = {...project.roles, ...project.subTasks};
    return Object.entries(tasks).every(([role, task]) => {
      if (task.allocations?.some(period => !period.personIds.length || !validDateRange(period.startDate, period.endDate))) return false;
      if (task.allocations !== undefined) return true;
      const start = task.startDate || localPeriod.startDate, end = task.endDate || localPeriod.endDate;
      if (!start && !end) return true;
      if (validDateRange(start, end)) return true;
      const old = original[role];
      // Match the server's preservation rule; only unchanged legacy periods may remain unconfirmed.
      return !!old && project.subTasks[role]?.allocations === undefined
        && start === (old.startDate || project.startDate) && end === (old.endDate || project.endDate);
    });
  };
  const canSavePeriod=()=>!!project&&(!localPeriod.startDate&&!localPeriod.endDate&&!project.startDate&&!project.endDate||validDateRange(localPeriod.startDate,localPeriod.endDate));

  useEffect(() => {
    if (project) {
      const previous = editBase.current;
      try {
        const draft = previous?.id === project.id && (JSON.stringify(localSubTasks)!==JSON.stringify(previous.subTasks||{})||localPeriod.startDate!==previous.startDate||localPeriod.endDate!==previous.endDate)
          ? rebaseProject(project, previous, {...previous,...localPeriod,subTasks:localSubTasks}, true) : project;
        const tasks = draft.subTasks || {},period={startDate:draft.startDate,endDate:draft.endDate};
        editBase.current = project;
        remoteMerge.current = {blocked:false,...(tasks!==localSubTasks||period.startDate!==localPeriod.startDate||period.endDate!==localPeriod.endDate?{pending:{tasks,period}}:{})};
        setLocalSubTasks(tasks);
        setLocalPeriod(previous=>previous.startDate===period.startDate&&previous.endDate===period.endDate?previous:period);
        setSyncError('');
      } catch (error) {
        remoteMerge.current = {blocked:true};
        setSyncError(error instanceof Error ? error.message : '다른 화면의 변경을 확인해 주세요. 입력은 유지됩니다.');
      }
      const roles = [...new Set([...(TEAM_ROLES[project.department] || TEAM_ROLES.마감팀), ...Object.keys(project.subTasks || {}), ...Object.keys(project.roles || {})])];
      setSelectedRole(previous => roles.includes(previous) ? previous : roles[0]);
    }
    // Editor input is merged only when the shared project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(()=>{
    if(remoteMerge.current.blocked||syncError||!project||!canManageSchedule(currentUser,project.department))return;
    if(remoteMerge.current.pending){const pending=remoteMerge.current.pending;if(localSubTasks!==pending.tasks||localPeriod.startDate!==pending.period.startDate||localPeriod.endDate!==pending.period.endDate)return;delete remoteMerge.current.pending;}
    if(JSON.stringify(localSubTasks)===JSON.stringify(project.subTasks)&&localPeriod.startDate===project.startDate&&localPeriod.endDate===project.endDate)return;
    if(!canSavePeriod()||!canSaveTaskDates(localSubTasks))return;
    try{updateProjectSubTasks(project.id,localSubTasks,localPeriod);}catch{setAssignToast({role:'저장 실패',name:'입력 유지 · 저장 공간 확인 필요'});}
    // Trigger only on editor input; remote updates are merged by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[localSubTasks,localPeriod]);

  if (!project) return null;
  if (printPreview) return <ProjectDetailPrint project={{...project,subTasks:localSubTasks}} people={[...useProjectStore.getState().personnel,...users,...VIET_TEAMS_DATA.flatMap(t=>[{id:t.id,name:t.displayName},{id:t.code,name:t.displayName}])]} leaves={leaves} onClose={()=>setPrintPreview(false)} />;
  const canEdit = canManageSchedule(currentUser, project.department);
  const progress = projectProgress(project);
  // Read legacy assignments without creating tasks merely by opening the editor.
  const getSubTask = (tasks: Record<string, SubTaskSchedule>, roleName: string): SubTaskSchedule => {
    const task = tasks[roleName] || {
      roleName,
      personId: project.roles?.[roleName]?.personId || (roleName === 'PM' ? project.pmId : '') || '',
      startDate: project.roles?.[roleName]?.startDate || project.startDate,
      endDate: project.roles?.[roleName]?.endDate || project.endDate,
      status: '예정' as const, memo: '', version: 'v1',dateMode:project.roles?.[roleName]?'CUSTOM' as const:'PROJECT' as const
    };
    return taskWithProjectDates({ ...task, startDate: task.startDate || localPeriod.startDate, endDate: task.endDate || localPeriod.endDate },localPeriod);
  };

  // 프로젝트 팀에 해당하는 공종 목록
  const rolesForTeam = [...new Set([...(TEAM_ROLES[project.department] || TEAM_ROLES.마감팀), ...Object.keys(localSubTasks), ...Object.keys(project.roles || {})])];

  // 해당 부서 한국 본사 인원
  const deptKoreaUsers = users.filter((u) => {
    if (u.company !== '컨코스트' || u.active === false) return false;
    if (project.department === '마감팀') return u.department.includes('마감');
    if (project.department === '구조팀') return u.department.includes('구조');
    if (project.department === '토목&조경팀') return u.department.includes('토목') || u.department.includes('조경');
    return false;
  });

  // 해당 부서 베트남 팀 목록
  const deptVietTeams = resolveVietTeams(users, project.department);
  const deptVietUsers = vietIndividuals(users, project.department);
  const getUnitAliases = (unitId: string, unitName: string) => {
    const person = users.find(person => person.id === unitId);
    return person ? assignmentAliases(person, users) : [unitId, unitName];
  };
  const explicitlyAssigned = (task: SubTaskSchedule, unitId: string, unitName: string) => {
    const group = deptVietTeams.find(team => team.id === unitId);
    return group ? !!group.members.length && group.members.every(member => memberIds(task).some(id => getUnitAliases(member.id, member.name).includes(id)))
      : deptVietUsers.some(person => person.id === unitId) ? memberIds(task).some(id => getUnitAliases(unitId, unitName).includes(id))
      : taskAssignedTo(task, unitId, getUnitAliases(unitId, unitName));
  };

  // 개별 공종 필드 업데이트
  const handleFieldChange = (
    roleName: string,
    field: keyof SubTaskSchedule,
    value: any
  ) => {
    if (!canEdit) return;
    setLocalSubTasks((prev) => {
      const current = getSubTask(prev, roleName);
      return {
        ...prev,
        [roleName]: {
          ...current,
          ...(['startDate','endDate'].includes(field)?{dateMode:'CUSTOM' as const}:{}),
          [field]: value
        }
      };
    });
  };

  // Aggregate dates describe the whole role; each employee keeps their own periods.
  const replaceAllocations = (roleName: string, change: (periods: ScheduleAllocation[]) => ScheduleAllocation[]) => {
    if (!canEdit) return;
    setLocalSubTasks(previous => {
      const task = getSubTask(previous, roleName);
      if (task.scopeExcluded) return previous;
      const allocations = change(task.allocations || []);
      const assigned = [...new Set([...(roleName==='PM'&&task.personId?[task.personId]:[]),...allocations.flatMap(period => period.personIds)])];
      return {...previous, [roleName]: withAllocationBounds({...task, allocations, personIds: assigned, personId: assigned.includes(task.personId) ? task.personId : assigned[0] || ''})};
    });
  };
  const changeAllocation = (roleName: string, id: string, patch: Partial<ScheduleAllocation>) => replaceAllocations(roleName, periods => periods.map(period => period.id === id ? {...period, ...patch,...(('startDate'in patch||'endDate'in patch)&&!('dateMode'in patch)?{dateMode:'CUSTOM' as const}:{})} : period));
  const changeProjectPeriod=(field:keyof ProjectPeriod,value:string)=>{
    const period={...localPeriod,[field]:value};setLocalPeriod(period);
    setLocalSubTasks(previous=>Object.fromEntries(Object.entries(previous).map(([name,task])=>[name,taskWithProjectDates(task,period)])));
  };
  const changeTaskDateMode=(roleName:string,dateMode:'PROJECT'|'CUSTOM')=>setLocalSubTasks(previous=>({...previous,[roleName]:taskWithProjectDates({...getSubTask(previous,roleName),dateMode},localPeriod)}));
  const applyCommonPeriod=()=>{
    if(!canEdit||!validDateRange(localPeriod.startDate,localPeriod.endDate))return;
    setLocalSubTasks(previous=>Object.fromEntries(Object.entries(previous).map(([role,task])=>[role,task.allocations===undefined&&task.dateMode!=='CUSTOM'&&!task.scopeExcluded?taskWithProjectDates({...task,dateMode:'PROJECT'},localPeriod):task])));
  };

  const handleScopeChange = (roleName: string, scopeExcluded: boolean) => {
    if (!canEdit || roleName === 'PM') return;
    setLocalSubTasks(previous => ({...previous, [roleName]: {
      ...getSubTask(previous, roleName), scopeExcluded, personId: '', personIds: [], allocations: []
    }}));
  };

  // 원클릭 인원 배정 핸들러 (다중 인원 지원: 이미 배정되어 있으면 해제, 없으면 추가)
  const handleTogglePerson = (roleName: string, unitId: string, unitName: string, restoreScope = false) => {
    const targetRole = roleName || selectedRole || rolesForTeam[0];
    if (!canEdit) return;
    const group = deptVietTeams.find(team => team.id === unitId);
    if (group || deptVietUsers.some(person => person.id === unitId)) {
      setLocalSubTasks(previous => {
        const current = getSubTask(previous, targetRole);
        if (current.scopeExcluded && !restoreScope) return previous;
        const people = group?.members || [{id: unitId, name: unitName}];
        if (!people.length) return previous;
        const remove = explicitlyAssigned(current, unitId, unitName);
        try {
          const updated = updateAssignmentMembers(current, {
            ...(remove ? {removeIds: people.flatMap(person => getUnitAliases(person.id, person.name))} : {addIds: people.map(person => person.id)}), restoreScope
          });
          const inherited = !group && taskAssignedTo({...updated,personIds:memberIds(updated)}, unitId, getUnitAliases(unitId, unitName));
          setAssignToast({role:targetRole,name:`${unitName} (${remove ? `개인 배정 해제${inherited ? ' · 기존 팀 배정 유지' : ''}` : group ? '팀 전체 인원 배정' : '개인 배정'})`});
          return {...previous, [targetRole]: updated};
        } catch (error) {
          setAssignToast({role:'배정 확인',name:error instanceof Error ? error.message : '배정 기간과 담당자를 확인해 주세요.'});
          return previous;
        }
      });
      setTimeout(() => setAssignToast(null), 3000);
      return;
    }
    setLocalSubTasks((prev) => {
      const current = getSubTask(prev, targetRole);
      if (current.scopeExcluded && !restoreScope) return prev;

      const existingIds = memberIds(current);
      const aliases = getUnitAliases(unitId, unitName);

      let updatedIds: string[];
      if (taskAssignedTo(current, unitId, aliases)) {
        updatedIds = existingIds.filter((id) => !aliases.includes(id));
      } else {
        updatedIds = [...existingIds, unitId];
      }

      const primaryPersonId = updatedIds[0] || '';
      if (current.allocations) {
        const remove = taskAssignedTo(current, unitId, aliases);
        const allocations = remove
          ? current.allocations.map(period => ({...period, personIds: period.personIds.filter(id => !aliases.includes(id))})).filter(period => period.personIds.length)
          : [...current.allocations, {id: `manual-${crypto.randomUUID()}`, personIds: [unitId], startDate: current.startDate, endDate: current.endDate}];
        return {...prev, [targetRole]: withAllocationBounds({...current, ...(current.scopeExcluded ? {scopeExcluded: false} : {}), allocations, personId: primaryPersonId, personIds: updatedIds})};
      }
      return {
        ...prev,
        [targetRole]: {
          ...current,
          ...(current.scopeExcluded ? {scopeExcluded: false} : {}),
          personId: primaryPersonId,
          personIds: updatedIds
        }
      };
    });

    const currentSub = getSubTask(localSubTasks, targetRole);
    const isRemovedAction = explicitlyAssigned(currentSub, unitId, unitName);

    setAssignToast({
      role: targetRole,
      name: isRemovedAction ? `${unitName} (배정 해제)` : `${unitName} (투입 배정)`
    });
    setTimeout(() => setAssignToast(null), 3000);
  };

  // 개별 인원 칩 X 클릭시 제거
  const handleRemovePerson = (roleName: string, unitId: string) => {
    if (!canEdit) return;
    setLocalSubTasks((prev) => {
      const current = getSubTask(prev, roleName);
      const existing = memberIds(current), unit = getAvailabilityForReference(unitId);
      const aliases = [unitId, ...(unit ? getUnitAliases(unit.id, unit.name) : [])];
      if (deptVietUsers.some(person => person.id === unitId)) {
        return {...prev, [roleName]: updateAssignmentMembers(current, {removeIds: aliases})};
      }
      const updated = existing.filter((id) => !aliases.includes(id));
      if (current.allocations) {
        const allocations = current.allocations.map(period => ({...period, personIds: period.personIds.filter(id => !aliases.includes(id))})).filter(period => period.personIds.length);
        return {...prev, [roleName]: withAllocationBounds({...current, allocations, personId: updated[0] || '', personIds: updated})};
      }
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

  // 전체 공종 일괄 원자적 저장 (PM, 공종별 산출인원, roles 100% 동기화 및 localStorage 영구 보존)
  const handleSaveAll = () => {
    if (!canEdit) return;
    if (remoteMerge.current.blocked||syncError) { setAssignToast({role: '일정 확인', name: syncError||'다른 화면의 변경을 확인한 뒤 다시 저장해 주세요.'}); return; }
    if (!canSavePeriod()||!canSaveTaskDates(localSubTasks)) {
      setAssignToast({role: '입력 확인', name: '공종 시작일과 종료일을 확인해 주세요.'}); return;
    }
    try { updateProjectSubTasks(project.id, localSubTasks,localPeriod); }
    catch { setAssignToast({role: '저장 실패', name: '입력은 유지됩니다. 저장 공간을 확인해 주세요.'}); return; }
    setAssignToast({
      role: '전체 공종',
      name: '일정표에 반영했습니다. 중앙 전송 상태는 상단에서 확인하세요.'
    });
    setTimeout(() => {
      onClose();
    }, 400);
  };

  // 타 프로젝트와의 날짜 중복(Overlap) 검사 로직
  const openInquiries=()=>{
    if(!onOpenInquiries)return;
    if(remoteMerge.current.blocked||syncError||canEdit&&(!canSavePeriod()||!canSaveTaskDates(localSubTasks))){setAssignToast({role:'입력 확인',name:'기간 입력과 중앙 변경 확인을 완료한 뒤 질의사항을 열어 주세요.'});return;}
    if(canEdit&&(JSON.stringify(localSubTasks)!==JSON.stringify(project.subTasks)||localPeriod.startDate!==project.startDate||localPeriod.endDate!==project.endDate)){
      try{updateProjectSubTasks(project.id,localSubTasks,localPeriod);}catch{setAssignToast({role:'저장 실패',name:'입력은 유지됩니다. 일정을 저장한 뒤 다시 열어 주세요.'});return;}
    }
    const role=selectedRole==='PM'?rolesForTeam.find(name=>name!=='PM')||'':selectedRole;
    onClose();onOpenInquiries(project.id,role);
  };
  const getOverlappingTasks = (unitId: string, unitName: string, isViet: boolean) => {
    const overlaps: AvailabilityEntry[] = [];
    const focusedTask=getSubTask(localSubTasks, selectedRole);
    const pStart=focusedTask.startDate,pEnd=focusedTask.endDate;

    const otherProjects = projects.filter((p) => p.id !== project.id);

    const person=users.find(person=>person.id===unitId),team=deptVietTeams.find(team=>team.id===unitId);
    const aliases=isViet&&team?[unitId,unitName,...team.members.flatMap(member=>getUnitAliases(member.id,member.name))]:assignmentAliases(person||{id:unitId},users);
    const ownPeriods=assignmentSegments(focusedTask).filter(period=>aliases.some(id=>taskAssignedTo(period,id)));
    const today=localDate(new Date());
    const checkedPeriods=(ownPeriods.length?ownPeriods:[{startDate:pStart,endDate:pEnd}]).map(period=>focusedTask.allocations===undefined&&focusedTask.dateMode!=='CUSTOM'&&validDateRange(localPeriod.startDate,localPeriod.endDate)?{...period,startDate:period.startDate<localPeriod.startDate?localPeriod.startDate:period.startDate,endDate:period.endDate>localPeriod.endDate?localPeriod.endDate:period.endDate}:period).filter(period=>validDateRange(period.startDate,period.endDate)&&period.endDate>=today).map(period=>({...period,startDate:period.startDate<today?today:period.startDate}));
    for(const task of assignedTasksForAliases(aliases,otherProjects)){
      const owner=otherProjects.find(other=>other.id===task.projectId);
      const followup=owner?.postDeliveryTasks?.some(follow=>task.id===`gen-${owner.id}-followup-${follow.id}`);
      const source=owner?.subTasks?.[task.roleName];
      const bound=owner&&!followup&&source?.allocations===undefined&&source?.dateMode!=='CUSTOM'&&validDateRange(owner.startDate,owner.endDate);
      const startDate=bound&&task.startDate<owner.startDate?owner.startDate:task.startDate,endDate=bound&&task.endDate>owner.endDate?owner.endDate:task.endDate;
      if(task.status==='완료'||task.progress>=100||!followup&&(owner?.status==='납품'||(owner?.progress??0)>=100)||!validDateRange(startDate,endDate)||endDate<today||!checkedPeriods.some(period=>endDate>=period.startDate&&startDate<=period.endDate))continue;
      overlaps.push({id:task.projectId,kind:'project',projectName:task.projectName,roleName:task.roleName,startDate,endDate});
    }

    if(!team)for(const l of leavesFor(leaves,unitId,pStart,pEnd).filter(leave=>checkedPeriods.some(period=>leave.end_date>=period.startDate&&leave.start_date<=period.endDate)))overlaps.push({id:l.id,kind:'leave',projectName:`휴가 · ${l.kind} (본인 등록)`,roleName:'휴가',startDate:l.start_date,endDate:l.end_date});
    return groupAvailability(overlaps);
  };

  // 팀원 유닛 목록 (한국 본사 + 베트남 팀) 가용성 분석 데이터
  const availabilityList = (() => {
    const list: Array<{
      id: string;
      name: string;
      subTitle: string;
      badge: string;
      isVietnam: boolean;
      overlaps: AvailabilityGroup[];
      isAssignedToCurrent: boolean;
      assignedRoleInCurrent?: string;
    }> = [];

    // 1. 한국 본사 개인
    deptKoreaUsers.forEach((u) => {
      const overlaps = getOverlappingTasks(u.id, u.name, false);
      // 현재 프로젝트에서 배정된 공종이 있는지 확인
      const currentAssigned = Object.entries(localSubTasks).find(([_, st]) => taskAssignedTo(st, u.id, assignmentAliases(u, users)));

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
    if (vietSelection === 'TEAM') deptVietTeams.forEach((vt) => {
      const overlaps = getOverlappingTasks(vt.id, vt.displayName, true);
      const currentAssigned = Object.entries(localSubTasks).find(([_, st]) => explicitlyAssigned(st, vt.id, vt.displayName));

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
    else deptVietUsers.forEach(person => {
      const group = deptVietTeams.find(team => team.members.some(member => member.id === person.id));
      const currentAssigned = Object.entries(localSubTasks).find(([, task]) => taskAssignedTo(task, person.id, getUnitAliases(person.id, person.name)));
      list.push({id: person.id, name: person.name, subTitle: `${person.position} · ${group?.name || '그룹 미지정'} · ${person.idPrefix}`, badge: '베트남 개인', isVietnam: true,
        overlaps: getOverlappingTasks(person.id, person.name, true), isAssignedToCurrent: !!currentAssigned, assignedRoleInCurrent: currentAssigned?.[0]});
    });

    return list;
  })();
  const getAvailabilityForReference = (reference: string) => {
    const canonical = availabilityList.find(unit => unit.id === reference);
    if (canonical) return canonical;
    const matches = availabilityList.filter(unit => getUnitAliases(unit.id, unit.name).includes(reference));
    if (matches.length === 1) return matches[0];
    const person = users.find(user => user.id === reference);
    const group = [...deptVietTeams, ...VIET_TEAMS_DATA].find(team => [team.id,team.code,team.displayName].includes(reference));
    return person ? {id:person.id,name:person.name,isVietnam:person.company==='VIETQS',badge:person.position,overlaps:getOverlappingTasks(person.id,person.name,person.company==='VIETQS')}
      : group ? {id:group.id,name:group.displayName,isVietnam:true,badge:'기존 팀 배정',overlaps:[]} : undefined;
  };

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
      'bg-amber-500 text-slate-950',
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
        <div className="relative p-5 pr-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-start justify-between gap-4">
          <button type="button" onClick={onClose} aria-label="프로젝트 일정 편집 닫기" className="absolute top-3 right-3 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={22} /></button>
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
              <span data-no-translate>{project.name}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              좌측에서 공종을 선택하고, 우측의 실시간 가용성 및 중복 일정 간트를 확인하여 원클릭으로 최적의 인원을 배정합니다.
            </p>
            <div className="mt-3 grid max-w-xl grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">프로젝트 시작일<input aria-label="프로젝트 시작일" type="date" disabled={!canEdit} value={localPeriod.startDate} onChange={event=>changeProjectPeriod('startDate',event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"/></label>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">프로젝트 완료일<input aria-label="프로젝트 완료일" type="date" disabled={!canEdit} min={localPeriod.startDate||undefined} value={localPeriod.endDate} onChange={event=>changeProjectPeriod('endDate',event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"/></label>
              <p className="col-span-2 text-[11px] text-slate-600 dark:text-slate-300">기본 공종은 공통 기간을 따릅니다. 기존 별도·개인별 기간은 유지되며 필요한 공종만 별도 설정하세요.</p>
              <div className="col-span-2 flex flex-wrap items-center gap-2"><button type="button" onClick={applyCommonPeriod} disabled={!canEdit||!validDateRange(localPeriod.startDate,localPeriod.endDate)||!Object.values(localSubTasks).some(task=>task.allocations===undefined&&task.dateMode!=='CUSTOM'&&!task.scopeExcluded)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-bold text-blue-800 disabled:opacity-50 dark:border-blue-700 dark:text-blue-200">공종에 공통 기간 적용</button><span className="text-[11px] text-slate-600 dark:text-slate-300">개인 투입 기간·별도 설정 공종은 유지합니다.</span></div>
              {!canSavePeriod()&&<p role="alert" className="col-span-2 text-xs text-rose-700 dark:text-rose-300">프로젝트 시작일과 완료일을 확인하세요. 입력을 완료하면 저장됩니다.</p>}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right bg-slate-50 dark:bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                실제 공정률 <span className="text-[#00338d] dark:text-blue-400 font-extrabold text-sm">{percentLabel(progress.actual)}</span><span className="ml-2 text-xs">계획 {percentLabel(progress.planned)}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-1 justify-end">
                <Calendar size={12} /> {project.startDate} ~ {project.endDate}
              </div>
            </div>
          </div>
        </div>

        {/* 원클릭 배정 토스트 알림 */}
        {assignToast && (
          <div className="bg-emerald-600 text-white px-5 py-2.5 flex items-center justify-between text-xs font-bold animate-fadeIn shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>[{assignToast.role}] {assignToast.name}</span>
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
                  <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
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
                  {project.usage || '미기재'}
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
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
                  {project.client || '미기재'}
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 font-medium line-clamp-1" title={project.contacts?.join(', ')}>
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
                  {project.notes || project.request || '미기재'}
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
              <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                👉 우측 팀원 [배정] 클릭 시 즉시 지정
              </span>
            </div>

            {/* 공종 카드 그리드 (뭉개짐 없이 정돈된 모던 카드) */}
            {syncError&&<p role="alert" className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 p-3 text-xs font-bold">{syncError}</p>}
            {!projectPMId(project)&&<p role="status" className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 p-3 text-xs font-bold">신규 프로젝트 · PM 및 담당 인원 배정 필요. 해당 팀 실장·팀장이 아래 공종과 날짜를 확인하고 배정해 주세요.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <p className="md:col-span-2 text-xs text-slate-600 dark:text-slate-300">{canEdit ? '일정 조정 권한 있음' : '조회 전용 · 관리자 또는 해당 팀 실장/팀장만 조정 가능'} · 한국 공휴일 확인 범위(2026~2027) · 시작/종료일 포함, 오늘 종료 기준 계획률 · PM 제외 · 실제 진척률은 승인 업무일지 기준</p>
              {rolesForTeam.map((roleName, idx) => {
                const subTask = getSubTask(localSubTasks, roleName);
                const assignedIds = memberIds(subTask);

                const isSelected = selectedRole === roleName;
                const duration = plannedWorkDays(subTask);

                return (
                  <div
                    key={roleName}
                    onClick={() => setSelectedRole(roleName)}
                    className={`rounded-xl border p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-950/40 border-[#00338d] dark:border-blue-500 shadow-md ring-2 ring-[#00338d]/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`text-xs ${subTask.scopeExcluded ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>{subTask.scopeExcluded ? '용역 범위 없음' : <>작업일 {duration === undefined ? '미산정' : `${duration}일`} · 실제 {percentLabel(subTask.progress)}</>}</div>
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
                          <span className="text-[10px] text-slate-600 font-mono shrink-0 whitespace-nowrap dark:text-slate-400">
                            · {subTask.version || 'v1'}
                          </span>
                        </div>
                      </div>

                      {/* 상태 선택 셀렉트 */}
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <select disabled={!canEdit || !!subTask.scopeExcluded}
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
                          <UserCheck size={14} className={assignedIds.length > 0 ? "text-emerald-600 dark:text-emerald-400 shrink-0" : "text-slate-400 shrink-0"} />
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            투입 인원 {assignedIds.length}명
                          </span>
                        </div>

                        {/* 가용성 현황 요약 */}
                        {assignedIds.length > 0 && (
                          <div className="shrink-0 flex items-center gap-1">
                            {assignedIds.map((pId) => {
                              const avail = getAvailabilityForReference(pId);
                              const hasOverlap = (avail?.overlaps.length || 0) > 0;
                              return (
                                <span
                                  key={pId}
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    hasOverlap
                                      ? 'text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300'
                                      : 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300'
                                  }`}
                                  title={hasOverlap ? `${avail?.name || pId}: ${availabilityLabel(avail?.overlaps || [])}` : `${avail?.name || pId}: 여유`}
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
                        const currentIds = assignedIds;

                        if (currentIds.length === 0) {
                          return (
                            <div className={`text-xs py-0.5 ${subTask.scopeExcluded ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}>
                              {subTask.scopeExcluded ? '용역 범위 없음 · 담당자를 선택하면 범위에 다시 포함됩니다.' : '담당자 미배정 (우측 목록에서 [배정] 클릭)'}
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {currentIds.map((pId) => {
                              const avail = getAvailabilityForReference(pId);
                              const kUser = avail && !avail.isVietnam ? deptKoreaUsers.find(person => person.id === avail.id) : undefined;
                              const vTeam = deptVietTeams.find(vt => vt.id === (avail?.isVietnam ? avail.id : pId) || vt.code === pId || vt.displayName === pId);
                              const displayName = kUser?.name || vTeam?.displayName || avail?.name || users.find(user=>user.id===pId)?.name || pId;
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
                      <select disabled={!canEdit}
                        aria-label={`${roleName} 담당자 배정`}
                        value={subTask.scopeExcluded ? 'scope-excluded' : ''}
                        onChange={(e) => {
                          if (e.target.value === 'scope-excluded') {
                            handleScopeChange(roleName, true);
                          } else if (e.target.value) {
                            const unitName = users.find(k => k.id === e.target.value)?.name || deptVietTeams.find(v => v.id === e.target.value)?.displayName || e.target.value;
                            handleTogglePerson(roleName, e.target.value, unitName, true);
                          } else if (subTask.scopeExcluded) {
                            handleScopeChange(roleName, false);
                          }
                        }}
                        className="w-full text-xs font-medium px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                      >
                        {roleName !== 'PM' && <option value="scope-excluded">용역 범위 없음</option>}
                        <option value="">+ 인원 추가 투입 선택...</option>
                        <optgroup label="🇰🇷 한국 본사 인원">
                          {deptKoreaUsers.map((u) => {
                            const isAssigned = taskAssignedTo(subTask, u.id, assignmentAliases(u, users));
                            return (
                              <option key={u.id} value={u.id}>
                                {isAssigned ? '✓ ' : ''}{u.name} ({u.position}) {isAssigned ? '(배정됨)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🇻🇳 베트남 팀 전체 인원">
                          {deptVietTeams.map((vt) => {
                            const isAssigned = explicitlyAssigned(subTask, vt.id, vt.displayName);
                            return (
                              <option key={vt.id} value={vt.id} disabled={!vt.members.length}>
                                {isAssigned ? '✓ ' : ''}{vt.displayName} ({vt.members.length}명) {isAssigned ? '(개인 배정됨)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🇻🇳 베트남 개인">
                          {deptVietUsers.map(person => <option key={person.id} value={person.id}>{person.name} ({person.position} · {deptVietTeams.find(team => team.members.some(member => member.id === person.id))?.name || '그룹 미지정'} · {person.idPrefix}) {explicitlyAssigned(subTask,person.id,person.name) ? '(개인 배정됨)' : ''}</option>)}
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

                    {subTask.allocations && !subTask.scopeExcluded && (
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" onClick={event=>event.stopPropagation()}>
                        <summary className="cursor-pointer text-xs font-bold">인원별 투입 기간 ({subTask.allocations.length}개)</summary>
                        <div className="mt-2 space-y-2">
                          {subTask.allocations.map((period,index)=><div key={period.id} className="space-y-1 rounded border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-900">
                            <div className="flex items-center justify-between gap-2 text-xs font-bold"><span>{period.personIds.map(id=>getAvailabilityForReference(id)?.name||users.find(user=>user.id===id)?.name||id).join(', ')}</span><button type="button" disabled={!canEdit} aria-label={`${roleName} 투입 기간 ${index+1} 삭제`} onClick={()=>replaceAllocations(roleName,periods=>periods.filter(item=>item.id!==period.id))} className="rounded p-1 text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950"><X size={12}/></button></div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[10px]">시작일<input aria-label={`${roleName} 투입 기간 ${index+1} 시작일`} type="date" disabled={!canEdit} value={period.startDate} onChange={event=>changeAllocation(roleName,period.id,{startDate:event.target.value})} className="block w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"/></label>
                              <label className="text-[10px]">종료일<input aria-label={`${roleName} 투입 기간 ${index+1} 종료일`} type="date" disabled={!canEdit} value={period.endDate} onChange={event=>changeAllocation(roleName,period.id,{endDate:event.target.value})} className="block w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"/></label>
                            </div>
                            <label className="flex items-center gap-2 text-[10px] text-slate-700 dark:text-slate-200"><input type="checkbox" aria-label={`${roleName} 투입 기간 ${index+1} 공통 기간 사용`} disabled={!canEdit} checked={period.dateMode==='PROJECT'} onChange={event=>changeAllocation(roleName,period.id,event.target.checked?{...localPeriod,dateMode:'PROJECT'}:{dateMode:'CUSTOM'})}/>프로젝트 공통 기간 사용</label>
                            {!validDateRange(period.startDate,period.endDate)&&<p role="alert" className="text-[10px] text-rose-600 dark:text-rose-300">시작일과 종료일을 확인해 주세요. 입력을 완료하면 저장됩니다.</p>}
                            <input aria-label={`${roleName} 투입 기간 ${index+1} 메모`} disabled={!canEdit} value={period.memo||''} placeholder="담당 작업 메모" onChange={event=>changeAllocation(roleName,period.id,{memo:event.target.value})} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"/>
                            <button type="button" disabled={!canEdit} onClick={()=>replaceAllocations(roleName,periods=>[...periods,{id:`manual-${crypto.randomUUID()}`,personIds:[...period.personIds],startDate:period.endDate,endDate:period.endDate}])} className="text-[10px] font-bold text-blue-700 dark:text-blue-300">이 인원 투입 기간 추가</button>
                          </div>)}
                          <p className="text-[10px] text-slate-600 dark:text-slate-300">인원별 기간은 개인 일정표·할 일·업무일지에 함께 반영됩니다. 아래 공종 기간은 전체 투입 기간으로 자동 표시됩니다.</p>
                        </div>
                      </details>
                    )}
                    {/* 일정 입력 행: 시작일 ~ 종료일 (컴팩트 인라인) */}
                    {subTask.allocations===undefined&&<label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200" onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`${roleName} 별도 기간 사용`} disabled={!canEdit||!!subTask.scopeExcluded} checked={subTask.dateMode!=='PROJECT'} onChange={event=>changeTaskDateMode(roleName,event.target.checked?'CUSTOM':'PROJECT')}/>공종 기간 별도 설정{subTask.dateMode==='CUSTOM'&&validDateRange(localPeriod.startDate,localPeriod.endDate)&&(subTask.startDate<localPeriod.startDate||subTask.endDate>localPeriod.endDate)&&' · 프로젝트 공통 기간 밖 투입'}</label>}
                    <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-600 mb-0.5 dark:text-slate-400">시작일</span>
                        <input
                          type="date" disabled={!canEdit || !!subTask.allocations || subTask.dateMode==='PROJECT'}
                          value={subTask.startDate}
                          onChange={(e) => handleFieldChange(roleName, 'startDate', e.target.value)}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-600 mb-0.5 dark:text-slate-400">종료일</span>
                        <input
                          type="date" disabled={!canEdit || !!subTask.allocations || subTask.dateMode==='PROJECT'}
                          value={subTask.endDate}
                          onChange={(e) => handleFieldChange(roleName, 'endDate', e.target.value)}
                          className="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 슬림한 비고/메모 입력란 (더 이상 불필요하게 길고 뚱뚱하지 않음) */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text" disabled={!canEdit}
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
            <PostDeliverySchedule project={project}/>
          </div>

          {/* ======================= 우측 패널: 팀원 실시간 가용성 & 투입 현황판 (5 cols, ~42%, 좌측과 완전한 시각적 대비) ======================= */}
          <div className="lg:col-span-5 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-3.5 bg-slate-50/90 dark:bg-slate-950 border-t-2 lg:border-t-0 lg:border-l-2 border-indigo-500/40 dark:border-indigo-500/40 shadow-inner">
            
            {/* 우측 패널 헤더: 눈에 확 띄는 인디고/앰버 테마 박스 */}
            <div className="bg-indigo-50 dark:bg-slate-900 border border-indigo-500/30 dark:border-indigo-500/40 p-3.5 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-indigo-600 text-white shadow-xs">
                    <Users size={15} />
                  </span>
                  <span>팀원 실시간 가용성 & 투입 현황판</span>
                </h3>
                <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/40">
                  {getSubTask(localSubTasks, selectedRole).startDate} ~ {getSubTask(localSubTasks, selectedRole).endDate}
                </span>
              </div>
              <div className="text-xs bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 px-3 py-1.5 rounded-xl font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>{getSubTask(localSubTasks, selectedRole).scopeExcluded ? '용역 범위 없음 · 좌측 담당자 선택으로 범위를 다시 포함하세요.' : '[+ 배정] 클릭 시 포커스된 공종에 실시간 투입'}</span>
                </span>
                <span className="bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-[11px] shadow-xs">
                  [{selectedRole || rolesForTeam[0]}] 공종
                </span>
              </div>
            </div>

            {/* 필터 및 컴팩트 검색 바 (검색창 너비 적정화) */}
            <div className="flex flex-wrap items-center gap-1.5 justify-between bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-indigo-500/20 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRightFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                    rightFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-2xs'
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
                      ? 'bg-indigo-600 text-white shadow-2xs'
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
                      ? 'bg-indigo-600 text-white shadow-2xs'
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
                  className="w-full text-xs pl-6 pr-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
              <span>베트남 배정:</span>
              {(['TEAM', 'INDIVIDUAL'] as const).map(mode => <button key={mode} type="button" aria-label={`베트남 배정 ${mode === 'TEAM' ? '팀 전체' : '개인 선택'}`} aria-pressed={vietSelection === mode} onClick={() => setVietSelection(mode)} className={`rounded-lg border px-2.5 py-1 font-bold ${vietSelection === mode ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{mode === 'TEAM' ? '팀 전체' : '개인 선택'}</button>)}
              <span className="text-[11px]">팀 전체 배정은 현재 소속 직원의 개인 ID로 저장됩니다.</span>
            </div>

            {/* 인원/팀 가용성 카드 목록 */}
            <div className="space-y-2.5">
              {filteredAvailability.map((unit) => {
                const overlapCount = unit.overlaps.length;
                const isAvailable = overlapCount === 0;

                const targetRole = selectedRole || rolesForTeam[0];
                const targetSub = getSubTask(localSubTasks, targetRole);
                const isAssignedToFocusedRole = explicitlyAssigned(targetSub, unit.id, unit.name);
                const inheritedAssignment = deptVietUsers.some(person => person.id === unit.id) && taskAssignedTo(targetSub, unit.id, getUnitAliases(unit.id, unit.name));
                const emptyGroup = deptVietTeams.some(team => team.id === unit.id && !team.members.length);

                return (
                  <div
                    key={unit.id}
                    className={`p-3.5 rounded-2xl border-2 transition-all ${
                      isAssignedToFocusedRole
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-500 shadow-lg shadow-indigo-950/20 ring-2 ring-indigo-500/40'
                        : isAvailable
                        ? 'bg-white dark:bg-slate-900/95 border-emerald-500/30 hover:border-emerald-400 shadow-xs'
                        : overlapCount === 1
                        ? 'bg-white dark:bg-slate-900/95 border-amber-500/40 hover:border-amber-400 shadow-xs'
                        : 'bg-white dark:bg-slate-900/95 border-rose-500/40 hover:border-rose-400 shadow-xs'
                    }`}
                  >
                    {/* 상단 프로필 & 배정 버튼 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-xs ${
                            unit.isVietnam
                              ? 'bg-rose-600 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {unit.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className={unit.isVietnam ? 'space-y-0.5' : 'flex items-center gap-2 truncate'}>
                            <span title={unit.name} className={`font-black text-slate-900 dark:text-white text-xs ${unit.isVietnam ? 'block whitespace-normal break-words' : 'truncate'}`}>
                              {unit.name}
                            </span>
                            <span className={`text-[11px] text-slate-500 dark:text-slate-400 font-medium ${unit.isVietnam ? 'block whitespace-normal' : 'truncate'}`}>
                              {unit.subTitle}
                            </span>
                          </div>

                          {/* 가용성 상태 배지 */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {isAvailable ? (
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                🟢 투입 가능 (여유)
                              </span>
                            ) : overlapCount === 1 ? (
                              <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                {availabilityLabel(unit.overlaps)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80 border border-rose-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                {availabilityLabel(unit.overlaps)}
                              </span>
                            )}

                            {unit.assignedRoleInCurrent && (
                              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-full border border-blue-500/30">
                                현재 [{unit.assignedRoleInCurrent}]
                              </span>
                            )}
                            {inheritedAssignment && !isAssignedToFocusedRole && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">기존 팀 배정 상속 · 개인 해제 후에도 유지</span>}

                            {isAssignedToFocusedRole && (
                              <span className="text-[10px] font-black text-white bg-indigo-600 px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 animate-pulse">
                                ★ 포커스 [{targetRole}] 배정중
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 원클릭 배정/해제 토글 액션 버튼 */}
                      <button
                        type="button"
                        disabled={!canEdit || !!targetSub.scopeExcluded || emptyGroup}
                        onClick={() => handleTogglePerson(targetRole, unit.id, unit.name)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1 shrink-0 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          isAssignedToFocusedRole
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
                        }`}
                        title={isAssignedToFocusedRole ? `현재 [${targetRole}] 공종에서 ${unit.name} 투입 해제` : `현재 [${targetRole}] 공종에 ${unit.name} 즉시 추가 배정`}
                      >
                        {isAssignedToFocusedRole ? (
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
                    </div>

                    {/* 프로젝트별로 기간을 모아 표시하고 공종별 구간은 펼쳐서 확인 */}
                    {overlapCount > 0 ? (
                      <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1">
                        {unit.overlaps.map((group) => (
                          <details key={group.id} data-availability-project={group.kind === 'project' ? group.id.slice(8) : undefined} className="border-b border-slate-200 py-1.5 last:border-b-0 dark:border-slate-700">
                            <summary className="cursor-pointer rounded text-xs text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-200">
                              <span data-no-translate={group.kind==='project'?'':undefined} className="font-bold break-words">{group.projectName}</span>
                              <span className="mt-0.5 block pl-4 text-[11px] tabular-nums text-slate-600 dark:text-slate-300">{availabilityDates(group.periods)}</span>
                              {group.kind === 'project' && <span className="block pl-4 text-[11px] text-slate-600 dark:text-slate-300">{group.roles.map(role => role.name).join(' · ')} · 공종별 기간 보기</span>}
                            </summary>
                            <ul className="mt-1 space-y-1 pl-4 text-[11px] text-slate-600 dark:text-slate-300">
                              {group.roles.map(role => <li key={role.name}><span className="font-semibold">{role.name}</span> · <span className="tabular-nums">{availabilityDates(role.periods)}</span></li>)}
                            </ul>
                          </details>
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
              onClick={() => setPrintPreview(true)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Printer size={14} /> 이 프로젝트 상세 일정 출력
            </button>
            <button
              type="button"
              onClick={() => {
                if (project) { editBase.current = project; remoteMerge.current={blocked:false}; setLocalSubTasks(project.subTasks || {}); setLocalPeriod({startDate:project.startDate,endDate:project.endDate}); setSyncError(''); }
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <RefreshCw size={14} /> 최신 일정 다시 불러오기
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canEdit||!!syncError} onClick={handleSaveAll}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition active:scale-95"
            >
              <Save size={14} /> 전체 일정 저장
            </button>
            {onOpenInquiries&&<button type="button" onClick={openInquiries} disabled={!!syncError} className="rounded-xl border border-blue-300 px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-950">프로젝트 질의사항</button>}
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
