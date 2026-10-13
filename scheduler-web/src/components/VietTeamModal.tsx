import {useState} from 'react';
import {X} from 'lucide-react';
import {type VietTeam} from '../data/vietTeams';
import {useProjectStore} from '../store/useProjectStore';
import {useAuthStore} from '../store/useAuthStore';
import {useStudioStore} from '../store/useStudioStore';
import {canManageSchedule} from '../utils/schedulePermissions';
import {resolveVietTeams} from '../utils/vietPersonnel';
import {updateAssignmentMembers} from '../utils/scheduleAllocations';
import {assignmentAliases,memberIds,taskAssignedTo} from '../utils/personalWork';

export const VietTeamModal=({team:selectedTeam,isOpen,onClose}:{team:VietTeam|null;isOpen:boolean;onClose:()=>void})=>{
  const projects=useProjectStore(s=>s.projects);
  const user=useAuthStore(s=>s.currentUser);
  const users=useAuthStore(s=>s.users);
  const shared=useStudioStore();
  const [projectId,setProjectId]=useState('');
  const [role,setRole]=useState('');
  const [error,setError]=useState('');
  const [period,setPeriod]=useState<{startDate?:string;endDate?:string}>({});
  const team=selectedTeam&&resolveVietTeams(users,selectedTeam.department).find(group=>group.id===selectedTeam.id);
  if(!isOpen||!team)return null;
  const project=projects.find(p=>p.id===projectId&&p.department===team.department);
  const task=project?.subTasks?.[role];
  const ids=task?memberIds(task):[];
  const allowed=canManageSchedule(user,team.department);
  const disabled=!allowed||!shared.ready||shared.conflict||!task||!!task.scopeExcluded;
  const aliasesFor=(id:string)=>assignmentAliases(users.find(person=>person.id===id)||{id},users);
  const isSelected=(id:string)=>ids.some(reference=>aliasesFor(id).includes(reference));
  const isInherited=(id:string)=>!!task&&taskAssignedTo({...task,personIds:ids.filter(reference=>!aliasesFor(id).includes(reference))},id,aliasesFor(id));
  const changeMembers=(selectedIds:string[],checked:boolean)=>{
    setError('');
    try{
      if(!allowed||!shared.ready||shared.conflict||!project||!task)throw new Error('중앙 연결 및 프로젝트·공종 선택을 확인하세요.');
      if(!selectedIds.length||selectedIds.some(id=>!team.members.some(member=>member.id===id)))throw new Error('팀 소속 인원을 확인하세요.');
      const current=useProjectStore.getState().projects.find(item=>item.id===project.id)?.subTasks?.[role];
      if(!current||JSON.stringify(current)!==JSON.stringify(task))throw new Error('다른 화면에서 일정이 변경되었습니다. 최신 일정 확인 후 다시 선택하세요.');
      const updated=updateAssignmentMembers(current,checked?{addIds:selectedIds,startDate:period.startDate,endDate:period.endDate}:{removeIds:selectedIds.flatMap(aliasesFor)});
      useProjectStore.getState().updateSubTask(project.id,role,updated);
    }catch(e){setError(e instanceof Error?e.message:'배정 변경 실패');}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <section role="dialog" aria-modal="true" aria-label={`${team.displayName} 인원 배치`} className="bg-white text-slate-900 [color-scheme:light] rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div className="relative bg-slate-900 text-white px-6 py-4 pr-16"><button type="button" onClick={onClose} aria-label="베트남 팀 인원 배치 닫기" className="absolute top-3 right-3 rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><X size={20}/></button><h2 className="font-bold">{team.displayName} · 프로젝트 인원 배치</h2><p className="text-xs text-slate-300 mt-1">팀장: {team.leaderName} · {team.department} · {team.members.length}명</p></div>
      <div className="p-6 space-y-4">
        <label className="block text-sm font-semibold">프로젝트<select aria-label="배치할 프로젝트" value={projectId} onChange={e=>{setProjectId(e.target.value);setRole('');setPeriod({});setError('');}} className="block w-full mt-1 border border-slate-300 rounded p-2 bg-white text-slate-900"><option value="">프로젝트 선택</option>{projects.filter(p=>p.department===team.department).map(p=><option key={p.id} value={p.id}>[{p.code||p.id}] {p.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">공종<select aria-label="배치할 공종" value={role} onChange={e=>{setRole(e.target.value);setPeriod({});setError('');}} disabled={!project} className="block w-full mt-1 border border-slate-300 rounded p-2 bg-white text-slate-900 disabled:bg-slate-100"><option value="">공종 선택</option>{Object.entries(project?.subTasks||{}).map(([name,t])=><option key={name} value={name}>{name} · {t.scopeExcluded?'용역 범위 없음':`${t.startDate} ~ ${t.endDate}`}</option>)}</select></label>
        {project&&!Object.keys(project.subTasks||{}).length&&<p className="text-sm text-amber-800">프로젝트 상세 일정에서 공종과 기간을 먼저 입력하세요.</p>}
        {task&&<p className="text-sm text-slate-700">배정 기간: {task.startDate} ~ {task.endDate}<br/>{task.memo||'등록된 업무 내용 없음'}</p>}
        {task&&<div className="grid grid-cols-2 gap-3">{(['startDate','endDate'] as const).map(field=><label key={field} className="text-sm font-semibold">{field==='startDate'?'개인 투입 시작일':'개인 투입 종료일'}<input type="date" aria-label={field==='startDate'?'베트남 인원 투입 시작일':'베트남 인원 투입 종료일'} disabled={disabled} value={period[field]??task[field]} onChange={event=>setPeriod(previous=>({...previous,[field]:event.target.value}))} className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-slate-900 disabled:bg-slate-100"/></label>)}</div>}
        {task?.scopeExcluded&&<p className="text-sm text-amber-800">용역 범위 없음 공종은 프로젝트 상세에서 범위에 다시 포함한 뒤 배정하세요.</p>}
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold"><input type="checkbox" aria-label="베트남 팀 전체 인원 배정" checked={!!team.members.length&&team.members.every(member=>isSelected(member.id))} disabled={disabled||!team.members.length} onChange={event=>changeMembers(team.members.map(member=>member.id),event.target.checked)}/>현재 소속 인원 모두 선택 ({team.members.length}명)</label>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">{team.members.map(member=><label key={member.id} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" aria-label={`${member.name} 배정`} checked={isSelected(member.id)} disabled={disabled} onChange={e=>changeMembers([member.id],e.target.checked)}/><span><strong>{member.name}</strong><span className="text-slate-600"> · {member.position}</span><small className="block text-slate-600">{member.role} · {users.find(person=>person.id===member.id)?.idPrefix}</small>{isInherited(member.id)&&<small className="block text-amber-800">기존 팀 배정 상속 · 개인 선택을 해제해도 해당 팀 배정은 유지됩니다.</small>}</span></label>)}</div>
        {!allowed&&<p className="text-sm text-amber-800">소속 팀 실장·팀장만 인원 배정을 변경할 수 있습니다.</p>}
        <p className="text-xs text-slate-600">선택한 공종의 담당자에 추가하거나 해제합니다. 다른 담당자와 기존 팀 단위 배정은 유지됩니다. 개인 할 일과 작성 중 업무일지는 공종 일정에 맞춰 자동 반영됩니다.</p>
        <p role="status" className="text-sm text-blue-800">{shared.status}{shared.pending?` · 전송 대기 ${shared.pending}건`:''}</p>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <div className="p-3 border-t border-slate-200 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-slate-200 text-slate-800 px-4 py-2">닫기</button></div>
    </section>
  </div>;
};
