import {useEffect, useId, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, X} from 'lucide-react';
import {useProjectStore, type Department} from '../store/useProjectStore';
import {useAuthStore} from '../store/useAuthStore';
import {refreshStudioMeetings, refreshStudioProjects} from '../store/useStudioStore';
import {localDate, validDateRange} from '../utils/scheduleProgress';
import {assignmentAliases, taskAssignedTo} from '../utils/personalWork';
import {StudioError} from '../services/studioApi';
import {cancelSupplementSchedule, listSupplementSchedules, registerSupplementSchedule, updateSupplementSchedule, type SupplementScheduleDraft, type SupplementScheduleList, type SupplementScheduleProject, type SupplementScheduleTask} from '../services/postDeliveryScheduleService';

const field='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-violet-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400';
const secondary='rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800';
type Selection={project:SupplementScheduleProject; task:SupplementScheduleTask};
const blank=(day:string):SupplementScheduleDraft=>({kind:'수정',startDate:day,endDate:day,memo:''});
const monthDays=(month:string)=>{const first=new Date(`${month}-01T12:00:00`);return Array.from({length:42},(_,index)=>localDate(new Date(first.getFullYear(),first.getMonth(),1-first.getDay()+index,12)));};

export function SupplementScheduleView({department,onClose,initialProjectId,initialTaskId}:{department?:Department;onClose:()=>void;initialProjectId?:string;initialTaskId?:string}){
 const user=useAuthStore(s=>s.currentUser),users=useAuthStore(s=>s.users),sourceProjects=useProjectStore(s=>s.projects),today=localDate(),titleId=useId();
 const [data,setData]=useState<SupplementScheduleList|null>(null),[projectId,setProjectId]=useState(initialProjectId||'');
 const [draft,setDraft]=useState<SupplementScheduleDraft>(()=>blank(today)),[editing,setEditing]=useState<Selection|null>(null),[baseRevision,setBaseRevision]=useState<number|null>(null);
 const [month,setMonth]=useState(today.slice(0,7)),[tab,setTab]=useState<'MINE'|'TEAM'>(initialTaskId?'TEAM':'MINE');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cancelConfirm,setCancelConfirm]=useState(false);
 const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),mounted=useRef(false),requestId=useRef(0),busyRef=useRef(false),registrationId=useRef(''),initialApplied=useRef(false),sessionEpoch=useRef(0),previousProjects=useRef(sourceProjects);
 const current=(actor:typeof user,session:number)=>mounted.current&&!!actor&&actor===useAuthStore.getState().currentUser&&session===sessionEpoch.current;
 const selectedProject=data?.projects.find(p=>p.projectId===projectId),canRegister=!!data?.capabilities.canRegister&&data.capabilities.userId===user?.id,ownTeam=data?.capabilities.department||department;
 const rows=(data?.projects||[]).flatMap(project=>project.tasks.map(task=>({project,task})));
 const aliases=assignmentAliases(user,users);
 const mine=rows.filter(({task})=>!!user&&(taskAssignedTo(task,user.id,aliases)||task.createdBy===user.id)&&task.submissionStatus!=='CANCELLED');
 const teamRows=rows.filter(({project,task})=>(task.department||project.department)===ownTeam).sort((a,b)=>b.task.startDate.localeCompare(a.task.startDate)||b.task.id.localeCompare(a.task.id));
 const readOnly=!!editing&&!editing.task.canEdit,canWrite=!busy&&!loading&&(editing?editing.task.canEdit:canRegister);
 const deliveryDate=editing?.task.deliveryDate||selectedProject?.deliveryDate||'';
 const names=(ids:string[])=>ids.map(id=>users.find(person=>person.id===id)?.name||id).join(', ');
 const ownerName=(task:SupplementScheduleTask)=>task.createdByName||names(task.personIds);
 const selectTask=({project,task}:Selection)=>{if(busyRef.current)return;setEditing({project,task});setProjectId(project.projectId);setBaseRevision(task.projectRevision);setDraft({kind:task.kind,startDate:task.startDate,endDate:task.endDate,memo:task.memo});setMonth(task.startDate.slice(0,7));setCancelConfirm(false);setError('');setNotice('');};
 const newDraft=(day=today,nextProject=selectedProject)=>{if(!canRegister||busyRef.current)return;const start=nextProject?.deliveryDate&&nextProject.deliveryDate>day?nextProject.deliveryDate:day;setEditing(null);setBaseRevision(nextProject?.projectRevision??null);setDraft(blank(start));setMonth(start.slice(0,7));setCancelConfirm(false);registrationId.current='';setError('');setNotice('');};
 const load=async(actor:typeof user,initial=false)=>{
  const request=++requestId.current,session=sessionEpoch.current;
  try{
   const result=await listSupplementSchedules();if(!current(actor,session)||request!==requestId.current)return false;setData(result);
   if(!initial&&!editing){const latest=result.projects.find(project=>project.projectId===projectId);if(latest)setBaseRevision(latest.projectRevision);}
   if(initial&&!initialApplied.current){initialApplied.current=true;const match=result.projects.flatMap(project=>project.tasks.map(task=>({project,task}))).find(({project,task})=>task.id===initialTaskId&&(!initialProjectId||task.projectId===initialProjectId||project.projectId===initialProjectId));
    if(match)selectTask(match);else{const project=result.projects.find(p=>p.projectId===initialProjectId)||result.projects[0];if(project){setProjectId(project.projectId);setBaseRevision(project.projectRevision);const day=project.deliveryDate>today?project.deliveryDate:today;setDraft(blank(day));setMonth(day.slice(0,7));}if(initialTaskId)setError('알림의 보완 일정을 찾을 수 없습니다. 최신 보고 목록을 확인해 주세요.');}
   }return true;
  }catch(failure){if(current(actor,session)&&request===requestId.current)setError(failure instanceof Error?failure.message:'보완 일정을 불러오지 못했습니다. 다시 조회해 주세요.');return false;}
  finally{if(current(actor,session)&&request===requestId.current)setLoading(false);}
 };
 useEffect(()=>{const lifecycle=mounted,requests=requestId,epoch=sessionEpoch;lifecycle.current=true;epoch.current++;initialApplied.current=false;busyRef.current=false;registrationId.current='';setData(null);setEditing(null);setDraft(blank(today));setProjectId(initialProjectId||'');setBaseRevision(null);setLoading(true);setBusy(false);setError('');setNotice('');setCancelConfirm(false);void load(user,true);return()=>{lifecycle.current=false;requests.current++;epoch.current++;};
 // Session identity invalidates any response from the previous account.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[user]);
 useEffect(()=>{const before=previousProjects.current;previousProjects.current=sourceProjects;if(before!==sourceProjects&&mounted.current&&!busyRef.current)void load(user);
 // Shared project sync is the refresh signal; no extra polling is added.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[sourceProjects,user]);
 useEffect(()=>{const previous=document.activeElement;closeButton.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const save=async(cancel=false)=>{
  if(!user||!data||busyRef.current||!selectedProject||!canWrite||(cancel&&!editing?.task.canCancel))return;
  setError('');setNotice('');
  if(!cancel&&(!validDateRange(draft.startDate,draft.endDate)||!draft.memo.trim())){setError('시작일·종료일과 보완 내용을 입력해 주세요. 종료일은 시작일보다 빠를 수 없습니다.');return;}
  if(!cancel&&draft.memo.trim().length>500){setError('보완 내용은 500자 이내로 입력해 주세요.');return;}
  if(!cancel&&(!deliveryDate||draft.startDate<deliveryDate)){setError(deliveryDate?`원 납품일 ${deliveryDate} 이후의 보완 일정만 등록할 수 있습니다.`:'원 납품일이 미설정입니다. 먼저 원 납품일을 확인해 주세요.');return;}
  busyRef.current=true;setBusy(true);const actor=user,session=sessionEpoch.current,body={...draft,memo:draft.memo.trim()};
  try{
   if(editing){if(cancel)await cancelSupplementSchedule(editing.task.projectId,editing.task.id,editing.task.projectRevision,editing.task.revision||0);else await updateSupplementSchedule(editing.task.projectId,editing.task.id,editing.task.projectRevision,editing.task.revision||0,body);}
   else{registrationId.current||=crypto.randomUUID();await registerSupplementSchedule(selectedProject.projectId,registrationId.current,baseRevision??selectedProject.projectRevision,body);}
   if(!current(actor,session))return;
   // The mutation is committed before refresh: never invite duplicate registration on a refresh error.
   setEditing(null);setDraft(blank(selectedProject.deliveryDate>today?selectedProject.deliveryDate:today));setBaseRevision(null);setCancelConfirm(false);registrationId.current='';
   setNotice(cancel?'보완 일정을 취소하고 팀장·실장에게 보고했습니다. 취소 이력은 보존됩니다.':'보완 일정이 확정되었습니다. 개인·팀 캘린더에 반영하고 팀장·실장에게 보고했습니다.');
   const refreshed=await Promise.allSettled([refreshStudioProjects(),refreshStudioMeetings(),load(actor)]);if(!current(actor,session))return;
   if(refreshed.some(r=>r.status==='rejected')||refreshed[2].status==='fulfilled'&&!refreshed[2].value)setError('중앙 저장과 보고는 완료했습니다. 화면 갱신에 실패했으니 최신 목록을 다시 조회해 주세요.');
  }catch(failure){if(!current(actor,session))return;setError(failure instanceof StudioError&&failure.status===409?'다른 화면에서 일정이 변경되었습니다. 입력은 유지했습니다. 최신 목록을 조회한 뒤 해당 일정을 다시 선택해 변경 내용을 대조해 주세요.':failure instanceof Error?failure.message:'저장을 확인하지 못했습니다. 입력을 유지했습니다. 최신 목록을 먼저 확인해 주세요.');}
  finally{if(current(actor,session)){busyRef.current=false;setBusy(false);}}
 };
 const changeMonth=(offset:number)=>{const value=new Date(`${month}-01T12:00:00`);value.setMonth(value.getMonth()+offset);setMonth(localDate(value).slice(0,7));};
 const reportState=(task:SupplementScheduleTask)=>task.submissionStatus==='CANCELLED'?'취소됨':task.submissionStatus==='REPORTED'?'확정 · 자동 보고 완료':'기존 보완 일정';
 return <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" onKeyDown={event=>{
  if(event.key==='Escape'&&!busyRef.current){event.stopPropagation();onClose();}
  if(event.key==='Tab'){const all=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')||[]),first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><h2 id={titleId} className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="text-violet-700 dark:text-violet-300" size={22}/>프로젝트 보완 일정 등록</h2><p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-300">납품 후 검토·수정 일정을 본인에게 배정합니다. 등록 즉시 확정되며 팀장·실장에게 자동 보고됩니다.</p></div><button ref={closeButton} type="button" aria-label="보완 일정 닫기" disabled={busy} className={secondary} onClick={onClose}><X size={18}/></button></header>
  <div className="space-y-4 p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2" role="tablist" aria-label="보완 일정 보기" onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'MINE':event.key==='End'?'TEAM':tab==='MINE'?'TEAM':'MINE';setTab(next);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next==='MINE'?0:1]?.focus();}}}>{([['MINE','내 보완 일정'],['TEAM','우리 팀 보고 목록']]as const).map(([value,label])=><button type="button" key={value} role="tab" aria-selected={tab===value} className={tab===value?'rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600':secondary} onClick={()=>setTab(value)}>{label}</button>)}</div><button type="button" disabled={busy||loading} className={secondary+' flex items-center gap-1.5'} onClick={()=>{setLoading(true);void load(user);}}><RefreshCw size={15}/>최신 목록 조회</button></div>
   <p className="text-sm text-slate-600 dark:text-slate-300">{user?.name||'로그인 필요'} · {ownTeam||'소속 확인 중'} · 보완 일정은 보라색으로 표시됩니다.</p>
   {loading&&<p role="status" className="text-sm">중앙 보완 일정을 불러오는 중입니다…</p>}
   {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">{error}</p>}
   {notice&&<p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">{notice}</p>}
   <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
    <div className="min-w-0">{tab==='MINE'?<>
     <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{month.replace('-','년 ')}월 · 개인별 보완 캘린더</h3><div className="flex gap-1"><button type="button" aria-label="이전 달 보완 일정" className={secondary} onClick={()=>changeMonth(-1)}><ChevronLeft size={16}/></button><button type="button" className={secondary} onClick={()=>setMonth(today.slice(0,7))}>이번 달</button><button type="button" aria-label="다음 달 보완 일정" className={secondary} onClick={()=>changeMonth(1)}><ChevronRight size={16}/></button></div></div>
     <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"><div className="grid grid-cols-7 bg-slate-100 text-center text-xs font-bold dark:bg-slate-800">{['일','월','화','수','목','금','토'].map(day=><span className="py-2" key={day}>{day}</span>)}</div><div className="grid grid-cols-7">{monthDays(month).map(day=>{const tasks=mine.filter(({task})=>task.startDate<=day&&task.endDate>=day);return <div key={day} className={'min-h-24 min-w-0 border-t border-r border-slate-200 p-1 dark:border-slate-700 '+(day.startsWith(month)?'':'bg-slate-50 dark:bg-slate-950')}><button type="button" aria-label={`${day} 보완 일정 등록`} disabled={!canRegister||busy||loading} onClick={()=>newDraft(day)} className={'mb-1 rounded px-1.5 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-violet-600 disabled:cursor-default '+(day===today?'bg-blue-700 text-white':day.startsWith(month)?'text-slate-800 hover:bg-violet-100 dark:text-slate-100 dark:hover:bg-violet-950':'text-slate-500 dark:text-slate-400')}>{Number(day.slice(-2))}</button>{tasks.map(row=><button key={`${row.task.projectId}-${row.task.id}`} type="button" title={`${row.project.projectName} · ${row.task.memo}`} data-no-translate onClick={()=>selectTask(row)} className="mb-1 block w-full break-words rounded bg-violet-100 px-1.5 py-1 text-left text-[11px] font-semibold leading-snug text-violet-950 hover:bg-violet-200 focus-visible:outline-2 focus-visible:outline-violet-600 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900">{row.task.kind} · {row.project.projectCode}</button>)}</div>;})}</div></div>
     {!mine.length&&!loading&&<p className="mt-3 text-sm text-slate-600 dark:text-slate-300">등록된 내 보완 일정이 없습니다.{canRegister?' 날짜를 선택하고 오른쪽에서 등록하세요.':''}</p>}
    </>:<><h3 className="mb-3 font-bold">{ownTeam||'소속 팀'} 보완 일정 보고 · 취소 이력 포함</h3>{!teamRows.length&&!loading&&<p className="text-sm text-slate-600 dark:text-slate-300">공유된 팀 보완 일정이 없습니다.</p>}<ul className="divide-y divide-slate-200 dark:divide-slate-700">{teamRows.map(row=><li key={`${row.task.projectId}-${row.task.id}`} className="py-3"><button type="button" onClick={()=>selectTask(row)} className="w-full rounded px-2 py-1 text-left hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 dark:hover:bg-violet-950"><span className="block text-sm font-bold" data-no-translate>{row.project.projectCode} · {row.project.projectName}</span><span className="mt-1 block text-xs text-slate-700 dark:text-slate-300">{row.task.startDate} ~ {row.task.endDate} · {row.task.kind} · {ownerName(row.task)} · {reportState(row.task)}</span><span className="mt-1 block whitespace-pre-wrap break-words text-sm">{row.task.memo}</span></button></li>)}</ul></>}
    </div>
    <form className="space-y-4 border-t border-slate-200 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0 dark:border-slate-700" onSubmit={event=>{event.preventDefault();void save();}}>
     <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{editing?readOnly?'보완 일정 상세':'내 보완 일정 수정':'새 보완 일정'}</h3>{canRegister&&<button type="button" disabled={busy||loading} className={secondary+' flex items-center gap-1'} onClick={()=>newDraft()}><Plus size={15}/>새 일정</button>}</div>
     {!canRegister&&!editing&&<p className="text-sm text-slate-600 dark:text-slate-300">국내 마감팀·구조팀·토목&amp;조경팀 직원이 본인의 보완 일정을 등록할 수 있습니다.</p>}
     <fieldset disabled={!canWrite} className="space-y-4 disabled:opacity-80"><label className="block text-sm font-semibold">프로젝트<select aria-label="보완 프로젝트" required disabled={!!editing||!canWrite} className={field} value={projectId} onChange={event=>{const project=data?.projects.find(p=>p.projectId===event.target.value);setProjectId(event.target.value);setBaseRevision(project?.projectRevision??null);registrationId.current='';if(project?.deliveryDate&&draft.startDate<project.deliveryDate)setDraft({...draft,startDate:project.deliveryDate,endDate:draft.endDate<project.deliveryDate?project.deliveryDate:draft.endDate});}}><option value="">프로젝트 선택</option>{data?.projects.map(project=><option key={project.projectId} value={project.projectId} data-no-translate>{project.projectCode} · {project.projectName}</option>)}</select></label>
      <p className="text-xs text-slate-600 dark:text-slate-300">원 납품일: {deliveryDate||'미설정'} · 원 납품 일정과 완료율은 유지됩니다.</p>
      <label className="block text-sm font-semibold">구분<select aria-label="보완 구분" className={field} value={draft.kind} onChange={event=>setDraft({...draft,kind:event.target.value as '검토'|'수정'})}><option>수정</option><option>검토</option></select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">시작일<input aria-label="보완 시작일" required type="date" className={field} min={deliveryDate||undefined} value={draft.startDate} onChange={event=>setDraft({...draft,startDate:event.target.value,endDate:draft.endDate<event.target.value?event.target.value:draft.endDate})}/></label><label className="text-sm font-semibold">종료일<input aria-label="보완 종료일" required type="date" className={field} min={draft.startDate} value={draft.endDate} onChange={event=>setDraft({...draft,endDate:event.target.value})}/></label></div>
      <label className="block text-sm font-semibold">보완 내용<textarea aria-label="보완 내용" required maxLength={500} rows={4} className={field+' resize-y'} placeholder="예: 변경 도면에 따른 창호 수량 재검토" value={draft.memo} onChange={event=>setDraft({...draft,memo:event.target.value})}/></label>
     </fieldset>
     <p className="text-sm">담당: <strong>{editing?ownerName(editing.task):user?.name||'로그인 필요'}</strong> · {editing?.task.department||ownTeam||'소속 확인 중'}</p>
     {editing&&<p className="text-xs text-slate-600 dark:text-slate-300">{reportState(editing.task)}{names(editing.task.reviewerIds||[])&&` · 보고: ${names(editing.task.reviewerIds||[])}`}</p>}
     {!readOnly&&(canRegister||editing)&&<button type="submit" disabled={!canWrite||!selectedProject} className="w-full rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50">{busy?'중앙 저장 중…':editing?'수정하고 재보고':'등록하고 자동 보고'}</button>}
     {editing?.task.canCancel&&<div className="border-t border-slate-200 pt-3 dark:border-slate-700">{cancelConfirm?<><p className="mb-2 text-sm text-red-900 dark:text-red-200">이 보완 일정을 취소하고 팀장·실장에게 보고할까요? 등록 이력은 보존됩니다.</p><div className="flex gap-2"><button type="button" disabled={busy} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={()=>void save(true)}>보완 일정 취소 확정</button><button type="button" disabled={busy} className={secondary} onClick={()=>setCancelConfirm(false)}>계속 편집</button></div></>:<button type="button" disabled={busy} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950" onClick={()=>setCancelConfirm(true)}>이 보완 일정 취소</button>}</div>}
    </form>
   </div>
  </div>
 </section>;
}
