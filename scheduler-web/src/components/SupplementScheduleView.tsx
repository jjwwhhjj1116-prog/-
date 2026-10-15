import {useEffect, useId, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, RefreshCw, X} from 'lucide-react';
import {DEPARTMENTS, useProjectStore, type Department} from '../store/useProjectStore';
import {useAuthStore} from '../store/useAuthStore';
import {refreshStudioMeetings, refreshStudioProjects} from '../store/useStudioStore';
import {localDate, validDateRange} from '../utils/scheduleProgress';
import {HOLIDAYS} from '../constants/holidays';
import {StudioError} from '../services/studioApi';
import {cancelSupplementSchedule, listSupplementSchedules, registerSupplementSchedule, updateSupplementSchedule, type SupplementScheduleDraft, type SupplementScheduleList, type SupplementScheduleProject, type SupplementScheduleTask} from '../services/postDeliveryScheduleService';

const field='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-orange-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400';
const secondary='rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800';
type Selection={project:SupplementScheduleProject; task:SupplementScheduleTask};
const blank=(day:string):SupplementScheduleDraft=>({kind:'수정',startDate:day,endDate:day,memo:''});
const monthDays=(month:string)=>{const first=new Date(`${month}-01T12:00:00`);return Array.from({length:42},(_,index)=>localDate(new Date(first.getFullYear(),first.getMonth(),1-first.getDay()+index,12)));};

export function SupplementScheduleView({department,onClose,initialProjectId,initialTaskId}:{department?:Department;onClose:()=>void;initialProjectId?:string;initialTaskId?:string}){
 const user=useAuthStore(s=>s.currentUser),users=useAuthStore(s=>s.users),sourceProjects=useProjectStore(s=>s.projects),today=localDate(),titleId=useId();
 const [data,setData]=useState<SupplementScheduleList|null>(null),[projectId,setProjectId]=useState(initialProjectId||'');
 const [draft,setDraft]=useState<SupplementScheduleDraft>(()=>blank(today)),[editing,setEditing]=useState<Selection|null>(null),[baseRevision,setBaseRevision]=useState<number|null>(null);
 const [month,setMonth]=useState(today.slice(0,7)),[rangeStart,setRangeStart]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cancelConfirm,setCancelConfirm]=useState(false);
 const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),mounted=useRef(false),requestId=useRef(0),busyRef=useRef(false),registrationId=useRef(''),initialApplied=useRef(false),sessionEpoch=useRef(0),previousProjects=useRef(sourceProjects);
 const current=(actor:typeof user,session:number)=>mounted.current&&!!actor&&actor===useAuthStore.getState().currentUser&&session===sessionEpoch.current;
 const selectedProject=data?.projects.find(p=>p.projectId===projectId),canRegister=!!data?.capabilities.canRegister&&data.capabilities.userId===user?.id,ownTeam=data?.capabilities.department&&DEPARTMENTS.includes(data.capabilities.department)?data.capabilities.department:department;
 const projectTasks=selectedProject?.tasks||[];
 const availableProjects=(data?.projects||[]).filter(project=>project.delivered||editing?.project.projectId===project.projectId);
 const readOnly=!!editing&&!editing.task.canEdit,canWrite=!busy&&!loading&&(editing?editing.task.canEdit:canRegister);
 const deliveryDate=editing?.task.deliveryDate||selectedProject?.deliveryDate||'';
 const names=(ids:string[])=>ids.map(id=>users.find(person=>person.id===id)?.name||id).join(', ');
 const ownerName=(task:SupplementScheduleTask)=>task.createdByName||names(task.personIds);
 const selectTask=({project,task}:Selection)=>{if(busyRef.current)return;setEditing({project,task});setProjectId(project.projectId);setBaseRevision(task.projectRevision);setDraft({kind:task.kind,startDate:task.startDate,endDate:task.endDate,memo:task.memo});setMonth(task.startDate.slice(0,7));setRangeStart(null);setCancelConfirm(false);setError('');setNotice('');};
 const newDraft=(day=today,nextProject=selectedProject)=>{if(!canRegister||busyRef.current)return;nextProject=nextProject?.delivered?nextProject:data?.projects.find(project=>project.delivered);setProjectId(nextProject?.projectId||'');const start=nextProject?.deliveryDate&&nextProject.deliveryDate>day?nextProject.deliveryDate:day;setEditing(null);setBaseRevision(nextProject?.projectRevision??null);setDraft(blank(start));setMonth(start.slice(0,7));setRangeStart(null);setCancelConfirm(false);registrationId.current='';setError('');setNotice('');};
 const load=async(actor:typeof user,initial=false)=>{
  const request=++requestId.current,session=sessionEpoch.current;
  try{
   const result=await listSupplementSchedules();if(!current(actor,session)||request!==requestId.current)return false;setData(result);
   if(!initial&&!editing){const latest=result.projects.find(project=>project.projectId===projectId);if(latest)setBaseRevision(latest.projectRevision);}
   if(initial&&!initialApplied.current){initialApplied.current=true;const match=result.projects.flatMap(project=>project.tasks.map(task=>({project,task}))).find(({project,task})=>task.id===initialTaskId&&(!initialProjectId||task.projectId===initialProjectId||project.projectId===initialProjectId));
    if(match)selectTask(match);else{const project=result.projects.find(p=>p.projectId===initialProjectId&&p.delivered)||result.projects.find(p=>p.delivered);if(project){setProjectId(project.projectId);setBaseRevision(project.projectRevision);const day=project.deliveryDate>today?project.deliveryDate:today;setDraft(blank(day));setMonth(day.slice(0,7));}else{setProjectId('');setBaseRevision(null);}if(initialTaskId)setError('알림의 보완 일정을 찾을 수 없습니다. 최신 보고 목록을 확인해 주세요.');}
   }return true;
  }catch(failure){if(current(actor,session)&&request===requestId.current)setError(failure instanceof Error?failure.message:'보완 일정을 불러오지 못했습니다. 다시 조회해 주세요.');return false;}
  finally{if(current(actor,session)&&request===requestId.current)setLoading(false);}
 };
 useEffect(()=>{const lifecycle=mounted,requests=requestId,epoch=sessionEpoch;lifecycle.current=true;epoch.current++;initialApplied.current=false;busyRef.current=false;registrationId.current='';setData(null);setEditing(null);setDraft(blank(today));setProjectId(initialProjectId||'');setBaseRevision(null);setLoading(true);setBusy(false);setError('');setNotice('');setRangeStart(null);setCancelConfirm(false);void load(user,true);return()=>{lifecycle.current=false;requests.current++;epoch.current++;};
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
  if(!editing&&!selectedProject.delivered){setError('납품 완료된 프로젝트를 선택해 주세요.');return;}
  if(!cancel&&(!validDateRange(draft.startDate,draft.endDate)||!draft.memo.trim())){setError('시작일·종료일과 보완 사유를 입력해 주세요. 종료일은 시작일보다 빠를 수 없습니다.');return;}
  if(!cancel&&draft.memo.trim().length>500){setError('보완 사유는 500자 이내로 입력해 주세요.');return;}
  if(!cancel&&(!deliveryDate||draft.startDate<deliveryDate)){setError(deliveryDate?`원 납품일 ${deliveryDate} 이후의 보완 일정만 등록할 수 있습니다.`:'원 납품일이 미설정입니다. 먼저 원 납품일을 확인해 주세요.');return;}
  busyRef.current=true;setBusy(true);const actor=user,session=sessionEpoch.current,body={...draft,memo:draft.memo.trim()};
  try{
   if(editing){if(cancel)await cancelSupplementSchedule(editing.task.projectId,editing.task.id,editing.task.projectRevision,editing.task.revision||0);else await updateSupplementSchedule(editing.task.projectId,editing.task.id,editing.task.projectRevision,editing.task.revision||0,body);}
   else{registrationId.current||=crypto.randomUUID();await registerSupplementSchedule(selectedProject.projectId,registrationId.current,baseRevision??selectedProject.projectRevision,body);}
   if(!current(actor,session))return;
   // The mutation is committed before refresh: never invite duplicate registration on a refresh error.
   setEditing(null);setDraft(blank(selectedProject.deliveryDate>today?selectedProject.deliveryDate:today));setBaseRevision(null);setRangeStart(null);setCancelConfirm(false);registrationId.current='';
   setNotice(cancel?'보완 일정을 취소하고 팀장·실장에게 보고했습니다. 취소 이력은 보존됩니다.':'보완 일정이 확정되었습니다. 개인·팀 캘린더에 반영하고 팀장·실장에게 보고했습니다.');
   const refreshed=await Promise.allSettled([refreshStudioProjects(),refreshStudioMeetings(),load(actor)]);if(!current(actor,session))return;
   if(refreshed.some(r=>r.status==='rejected')||refreshed[2].status==='fulfilled'&&!refreshed[2].value)setError('중앙 저장과 보고는 완료했습니다. 화면 갱신에 실패했으니 최신 목록을 다시 조회해 주세요.');
  }catch(failure){if(!current(actor,session))return;setError(failure instanceof StudioError&&failure.status===409?'다른 화면에서 일정이 변경되었습니다. 입력은 유지했습니다. 최신 목록을 조회한 뒤 해당 일정을 다시 선택해 변경 내용을 대조해 주세요.':failure instanceof Error?failure.message:'저장을 확인하지 못했습니다. 입력을 유지했습니다. 최신 목록을 먼저 확인해 주세요.');}
  finally{if(current(actor,session)){busyRef.current=false;setBusy(false);}}
 };
 const changeMonth=(offset:number)=>{const value=new Date(`${month}-01T12:00:00`);value.setMonth(value.getMonth()+offset);setMonth(localDate(value).slice(0,7));};
 const reportState=(task:SupplementScheduleTask)=>task.submissionStatus==='CANCELLED'?'취소됨':task.submissionStatus==='REPORTED'?'자동 보고 완료':'기존 일정';
 const selectDate=(day:string)=>{if(!canWrite||busyRef.current||deliveryDate&&day<deliveryDate)return;setDraft({...draft,startDate:rangeStart&&rangeStart<day?rangeStart:day,endDate:rangeStart&&rangeStart>day?rangeStart:day});setRangeStart(rangeStart?null:day);};
 return <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] mx-auto w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" onKeyDown={event=>{
  if(event.key==='Escape'&&!busyRef.current){event.stopPropagation();onClose();}
  if(event.key==='Tab'){const all=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')||[]),first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
 }}>
  <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><h2 id={titleId} className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="text-orange-700 dark:text-orange-300" size={22}/>{editing?'프로젝트 보완 일정 수정':'프로젝트 보완 일정 등록'}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">프로젝트와 보완 사유·기간을 입력하세요. 등록 즉시 확정되고 팀장·실장에게 자동 보고됩니다.</p></div><button ref={closeButton} type="button" aria-label="보완 일정 닫기" disabled={busy} className={secondary} onClick={onClose}><X size={18}/></button></header>
  <div className="space-y-4 p-5">
   {loading&&<p role="status" className="text-sm">프로젝트를 불러오는 중입니다…</p>}
   {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">{error}</p>}
   {notice&&<p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">{notice}</p>}
   <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();void save();}}>
     {!canRegister&&!editing&&<p className="text-sm text-slate-600 dark:text-slate-300">국내 마감팀·구조팀·토목&amp;조경팀 직원이 본인의 보완 일정을 등록할 수 있습니다.</p>}
     <fieldset disabled={!canWrite} className="space-y-4 disabled:opacity-80">
      <label className="block text-sm font-semibold">납품 프로젝트<select aria-label="보완 프로젝트" required disabled={!!editing||!canWrite} className={field} value={projectId} onChange={event=>{const project=data?.projects.find(p=>p.projectId===event.target.value);setProjectId(event.target.value);setBaseRevision(project?.projectRevision??null);setRangeStart(null);registrationId.current='';if(project?.deliveryDate&&draft.startDate<project.deliveryDate)setDraft({...draft,startDate:project.deliveryDate,endDate:draft.endDate<project.deliveryDate?project.deliveryDate:draft.endDate});}}><option value="">프로젝트 선택</option>{availableProjects.map(project=><option key={project.projectId} value={project.projectId} data-no-translate>{project.projectCode} · {project.projectName}</option>)}</select></label>
      <p className="text-xs text-slate-600 dark:text-slate-300">원 납품일: {deliveryDate||'미설정'} · 원 납품 일정과 완료율은 유지됩니다.</p>
      <label className="block text-sm font-semibold">보완 사유<textarea aria-label="보완 사유" required maxLength={500} rows={4} className={field+' resize-y'} placeholder="예: 변경 도면에 따른 창호 수량 재검토" value={draft.memo} onChange={event=>setDraft({...draft,memo:event.target.value})}/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">시작일<input aria-label="보완 시작일" required type="date" className={field} min={deliveryDate||undefined} value={draft.startDate} onChange={event=>{setRangeStart(null);setDraft({...draft,startDate:event.target.value,endDate:draft.endDate<event.target.value?event.target.value:draft.endDate});setMonth(event.target.value.slice(0,7)||month);}}/></label><label className="text-sm font-semibold">종료일<input aria-label="보완 종료일" required type="date" className={field} min={draft.startDate} value={draft.endDate} onChange={event=>{setRangeStart(null);setDraft({...draft,endDate:event.target.value});}}/></label></div>
      <label className="block text-sm font-semibold">보완 구분<select aria-label="보완 구분" className={field} value={draft.kind} onChange={event=>setDraft({...draft,kind:event.target.value as '검토'|'수정'})}><option>수정</option><option>검토</option></select></label>
     </fieldset>
     <p className="text-sm">담당: <strong>{editing?ownerName(editing.task):user?.name||'로그인 필요'}</strong> · {editing?.task.department||ownTeam||'소속 확인 중'}</p>
     {editing&&<p className="text-xs text-slate-600 dark:text-slate-300">{reportState(editing.task)}{names(editing.task.reviewerIds||[])&&` · 보고: ${names(editing.task.reviewerIds||[])}`}</p>}
     <div className="flex flex-wrap gap-2">{!readOnly&&(canRegister||editing)&&<button type="submit" disabled={!canWrite||!selectedProject||!editing&&!selectedProject.delivered} className="flex-1 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50">{busy?'중앙 저장 중…':editing?'수정하고 재보고':'등록하고 자동 보고'}</button>}<button type="button" disabled={busy} className={secondary} onClick={onClose}>닫기</button></div>
     {editing&&canRegister&&<button type="button" disabled={busy||loading} className={secondary} onClick={()=>newDraft()}>새 보완 일정 입력</button>}
     {editing?.task.canCancel&&<div className="border-t border-slate-200 pt-3 dark:border-slate-700">{cancelConfirm?<><p className="mb-2 text-sm text-red-900 dark:text-red-200">이 보완 일정을 취소하고 팀장·실장에게 보고할까요? 등록 이력은 보존됩니다.</p><div className="flex gap-2"><button type="button" disabled={busy} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={()=>void save(true)}>보완 일정 취소 확정</button><button type="button" disabled={busy} className={secondary} onClick={()=>setCancelConfirm(false)}>계속 편집</button></div></>:<button type="button" disabled={busy} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950" onClick={()=>setCancelConfirm(true)}>이 보완 일정 취소</button>}</div>}
    </form>
    <aside aria-label="보완 기간 날짜 선택" className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
     <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{month.replace('-','년 ')}월</h3><div className="flex gap-1"><button type="button" aria-label="이전 달 보완 일정" className={secondary} onClick={()=>changeMonth(-1)}><ChevronLeft size={16}/></button><button type="button" aria-label="다음 달 보완 일정" className={secondary} onClick={()=>changeMonth(1)}><ChevronRight size={16}/></button></div></div>
     <div className="grid grid-cols-7 text-center text-xs font-bold">{['일','월','화','수','목','금','토'].map((day,index)=><span className={'py-2 '+(index===0?'text-red-700 dark:text-red-300':index===6?'text-blue-700 dark:text-blue-300':'')} key={day}>{day}</span>)}</div>
     <div className="grid grid-cols-7">{monthDays(month).map(day=>{const weekday=new Date(day+'T12:00:00').getDay(),holiday=HOLIDAYS[day],selected=day>=draft.startDate&&day<=draft.endDate,weekend=weekday===0||weekday===6,country=holiday?{KR:'한국',VN:'베트남',UK:'영국'}[holiday.country]:'';return <button type="button" key={day} data-supplement-date={day} data-holiday-country={holiday?.country} aria-label={`${day} 보완 날짜 선택${weekend?weekday===0?' 일요일':' 토요일':''}${holiday?` ${country} ${holiday.name}`:''}`} aria-pressed={selected} title={holiday?`${country} ${holiday.name}`:weekend?weekday===0?'일요일':'토요일':undefined} disabled={!canWrite||!!deliveryDate&&day<deliveryDate} onClick={()=>selectDate(day)} className={'min-h-14 min-w-0 rounded border border-transparent p-1 text-center text-xs focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-50 '+(selected?'border-orange-500 bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-100':holiday?.country==='KR'?'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200':holiday?.country==='VN'?'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200':holiday?.country==='UK'?'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100':weekend?'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-100':'hover:bg-orange-50 dark:hover:bg-orange-950/30')+(!day.startsWith(month)?' opacity-50':'')}><span className={'font-semibold '+(weekday===0?'text-red-700 dark:text-red-300':weekday===6?'text-blue-700 dark:text-blue-300':'')}>{Number(day.slice(-2))}</span>{holiday&&<span className="mt-1 block break-words text-[9px] leading-tight">{country} {holiday.name}</span>}</button>;})}</div>
     <p className="mt-3 text-xs font-semibold text-orange-800 dark:text-orange-200">선택 기간 {draft.startDate} ~ {draft.endDate}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{rangeStart?'종료일을 선택하세요.':'시작일과 종료일을 차례로 선택할 수 있습니다.'} 토·일과 국가별 휴일을 표시합니다.</p>
    </aside>
   </div>
   {projectTasks.length>0&&<details className="border-t border-slate-200 pt-3 dark:border-slate-700"><summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">선택 프로젝트의 기존 보완 일정 {projectTasks.length}건 · 수정·취소 이력</summary><ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">{projectTasks.map(task=><li key={`${task.projectId}-${task.id}`} className="py-2"><button type="button" disabled={busy} onClick={()=>selectedProject&&selectTask({project:selectedProject,task})} className="w-full rounded p-2 text-left text-xs hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-600 dark:hover:bg-orange-950"><strong>{task.startDate} ~ {task.endDate} · {task.kind} · {ownerName(task)} · {reportState(task)}</strong><p className="mt-1 whitespace-pre-wrap break-words">{task.memo}</p></button></li>)}</ul></details>}
   <button type="button" disabled={busy||loading} className="flex items-center gap-1 text-xs text-slate-600 underline dark:text-slate-300" onClick={()=>{setLoading(true);void load(user);}}><RefreshCw size={13}/>최신 목록 조회</button>
  </div>
 </section>;
}
