import {useState} from 'react';
import {useProjectStore, type PostDeliveryTask, type Project} from '../store/useProjectStore';
import {useAuthStore} from '../store/useAuthStore';
import {canManageSchedule} from '../utils/schedulePermissions';
import {localDate} from '../utils/scheduleProgress';
import {resolveVietTeams} from '../utils/vietPersonnel';

export function PostDeliverySchedule({project}:{project:Project}) {
  const updateProject=useProjectStore(s=>s.updateProject);
  const user=useAuthStore(s=>s.currentUser);
  const users=useAuthStore(s=>s.users);
  const canEdit=canManageSchedule(user,project.department);
  const today=localDate();
  const defaultDate=project.endDate>today?project.endDate:today;
  const blank=():PostDeliveryTask=>({id:'',kind:'수정',startDate:defaultDate,endDate:defaultDate,memo:'',personIds:[],status:'예정'});
  const [draft,setDraft]=useState<PostDeliveryTask>(blank);
  const [editBase,setEditBase]=useState<PostDeliveryTask|null>(null);
  const editing=editBase?.id||null;
  const [message,setMessage]=useState('');
  const assignees=users.filter(person=>person.active!==false && ['컨코스트','VIETQS'].includes(person.company) && person.department===project.department);
  const vietTeams=resolveVietTeams(users,project.department).filter(team=>team.members.length);
  const nameFor=(id:string)=>users.find(person=>person.id===id)?.name||id;
  const field='w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 placeholder:text-slate-600 dark:text-slate-100 dark:placeholder:text-slate-400 px-2.5 py-2 text-xs';
  const write=(next:PostDeliveryTask[])=>updateProject(project.id,{postDeliveryTasks:next});
  const save=()=>{
    if(!canEdit||!editBase)return;
    try{
      const latestProject=useProjectStore.getState().projects.find(item=>item.id===project.id);
      if(!latestProject)throw Error('프로젝트를 찾을 수 없습니다. 초안을 유지하고 최신 일정을 확인하세요.');
      const tasks=latestProject.postDeliveryTasks||[];
      let next={...draft,id:editBase.id,memo:draft.memo.trim()};
      if(editBase){
        const current=tasks.find(item=>item.id===editBase.id);
        if(!current)throw Error('다른 화면에서 이 일정이 삭제되었습니다. 초안을 유지하고 최신 일정을 확인하세요.');
        if(current.submissionStatus!==undefined||editBase.submissionStatus!==undefined)throw Error('본인이 등록한 보완 일정은 ‘프로젝트 보완 일정 등록’ 화면에서 수정해 주세요. 변경 내용은 팀장·실장에게 자동 보고됩니다.');
        // Approved progress stays current; apply only the schedule fields this editor changed.
        next={...current};
        for(const key of ['kind','startDate','endDate','memo','personIds','status','reportingMode','reportingModes'] as const){
          if(JSON.stringify(draft[key])===JSON.stringify(editBase[key]))continue;
          if(JSON.stringify(current[key])!==JSON.stringify(editBase[key]))throw Error('수정하려는 항목이 다른 화면에서 변경되었습니다. 초안을 유지했습니다. 편집을 취소한 뒤 최신 일정을 확인하세요.');
          Object.assign(next,{[key]:key==='memo'?draft.memo.trim():draft[key]});
        }
      }
      if(!latestProject.endDate)throw Error('원 납품일을 먼저 지정해 주세요.');
      if(!next.startDate||!next.endDate||next.startDate>next.endDate||next.startDate<latestProject.endDate)throw Error(`납품일 ${latestProject.endDate} 이후의 시작·종료일을 확인하세요.`);
      if(!next.memo.trim())throw Error('검토·수정 내용을 메모로 입력하세요.');
      if(!next.personIds.length)throw Error('담당자를 한 명 이상 배정하세요.');
      write(tasks.map(item=>item.id===editing?next:item));setEditBase(null);setDraft(blank());setMessage('검토·수정 일정이 반영되었습니다. 중앙 공유 상태를 확인하세요.');
    }catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했습니다. 입력을 유지하고 다시 시도하세요.');}
  };
  return <section className="rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3" aria-label="납품 후 검토 수정 일정">
    <div><h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">납품 후 검토·수정 일정</h3><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">납품 공정률과 별도로 관리합니다. 시작일과 종료일을 같게 두면 하루 일정이며, 새 도면 등으로 기간을 늘릴 수 있습니다. 원 납품일이 미정이면 먼저 지정해 주세요.</p></div>
    <p className="text-xs text-violet-800 dark:text-violet-200">새 보완 일정은 팀 일정표의 ‘프로젝트 보완 일정 등록’에서 등록해 주세요. 등록 즉시 개인·팀 일정에 반영되고 팀장·실장에게 자동 보고됩니다.</p>
    {(project.postDeliveryTasks||[]).length===0&&<p className="text-xs text-slate-600 dark:text-slate-300">등록된 검토·수정 일정이 없습니다.</p>}
    <ul className="space-y-2">{(project.postDeliveryTasks||[]).filter(item=>item.submissionStatus!=='CANCELLED').map(item=><li key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-200">
      <div className="flex flex-wrap justify-between gap-2"><strong>{item.kind} · {item.startDate} ~ {item.endDate} · {item.status}</strong>{canEdit&&item.submissionStatus===undefined&&<button type="button" className="text-blue-700 dark:text-blue-300 underline" onClick={()=>{setEditBase(structuredClone(item));setDraft(structuredClone(item));setMessage('');}}>편집</button>}</div>
      <p className="mt-1 whitespace-pre-wrap break-words">{item.memo}</p><p className="mt-1 text-slate-600 dark:text-slate-300">담당: {item.personIds.map(nameFor).join(', ')||'미배정'}</p>
      {item.submissionStatus==='REPORTED'&&<p className="mt-2 text-violet-800 dark:text-violet-200">본인 등록 · 팀장·실장 자동 보고. 수정·취소는 ‘프로젝트 보완 일정 등록’ 화면에서 진행해 주세요.</p>}
    </li>)}</ul>
    {canEdit&&editing&&<div className="space-y-2 border-t border-violet-200 dark:border-violet-800 pt-3">
      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">검토·수정 일정 편집</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><label className="text-xs text-slate-700 dark:text-slate-200">구분<select className={field} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as PostDeliveryTask['kind']})}><option>검토</option><option>수정</option></select></label>
      <label className="text-xs text-slate-700 dark:text-slate-200">시작일<input className={field} type="date" min={project.endDate} value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value,endDate:e.target.value>draft.endDate?e.target.value:draft.endDate})}/></label>
      <label className="text-xs text-slate-700 dark:text-slate-200">종료일<input className={field} type="date" min={draft.startDate} value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/></label>
      <label className="text-xs text-slate-700 dark:text-slate-200">상태<select className={field} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as PostDeliveryTask['status']})}>{['예정','진행중','완료'].map(status=><option key={status}>{status}</option>)}</select></label></div>
      <label className="block text-xs text-slate-700 dark:text-slate-200">수정·검토 메모<input className={field} maxLength={500} value={draft.memo} onChange={e=>setDraft({...draft,memo:e.target.value})} placeholder="예: 변경 도면 A동 슬라브 물량 재검토"/></label>
      <label className="block text-xs text-slate-700 dark:text-slate-200">담당자<select className={field} value="" onChange={e=>{
        const value=e.target.value;
        const ids=value.startsWith('team:')?vietTeams.find(team=>`team:${team.id}`===value)?.members.map(person=>person.id):assignees.filter(person=>person.id===value).map(person=>person.id);
        if(ids?.length)setDraft({...draft,personIds:[...new Set([...draft.personIds,...ids])]});
      }}><option value="">담당자 추가 선택</option>
        <optgroup label="베트남 팀 전체">{vietTeams.map(team=><option key={team.id} value={`team:${team.id}`}>{team.name} · {team.members.length}명 전체 배정</option>)}</optgroup>
        {(['컨코스트','VIETQS'] as const).map(company=><optgroup key={company} label={company==='VIETQS'?'베트남 개인별':'한국 개인별'}>{assignees.filter(person=>person.company===company&&!draft.personIds.includes(person.id)).map(person=><option key={person.id} value={person.id}>{person.name} · {person.position}{person.idPrefix?` · ${person.idPrefix}`:''}</option>)}</optgroup>)}
      </select></label>
      <div className="flex flex-wrap gap-1">{draft.personIds.map(id=><button key={id} type="button" className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 px-2 py-1 text-xs" onClick={()=>setDraft({...draft,personIds:draft.personIds.filter(value=>value!==id)})}>{nameFor(id)} ×</button>)}</div>
      {draft.personIds.map(id=><label key={id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">{nameFor(id)} 보고 방식<select className={field} value={draft.reportingModes?.[id]||draft.reportingMode||'DAILY'} onChange={e=>setDraft({...draft,reportingModes:{...draft.reportingModes,[id]:e.target.value as 'DAILY'|'TASK'}})}><option value="DAILY">일자 기준</option><option value="TASK">Task 기준</option></select></label>)}
      <div className="flex gap-2"><button type="button" onClick={save} className="rounded-lg bg-violet-700 text-white px-3 py-2 text-xs font-bold">일정 수정 저장</button><button type="button" onClick={()=>{setEditBase(null);setDraft(blank());setMessage('');}} className="text-xs underline">편집 취소</button></div>
    </div>}
    {message&&<p role="status" className="text-xs text-amber-900 dark:text-amber-200">{message}</p>}
  </section>;
}
