import {useEffect,useRef,useState} from 'react';
import {CalendarDays,CheckCircle2} from 'lucide-react';
import type {Project,ScheduleExtension} from '../store/useProjectStore';
import {useAuthStore} from '../store/useAuthStore';
import {type AssignedTask,sameWorkProject,workProjectOptions,nextDay,assignmentPersonId} from '../utils/personalWork';
import {canManageSchedule} from '../utils/schedulePermissions';
import {studioApi} from '../services/studioApi';
import {refreshStudioMeetings} from '../store/useStudioStore';
import {WorkLogSteps} from './WorkLogReporting';

const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-orange-500';
export function ScheduleExtensionRequests({projects,projectId,tasks,selectedTaskId}:{projects:Project[];projectId:string;tasks:AssignedTask[];selectedTaskId:string}){
 const user=useAuthStore(s=>s.currentUser),users=useAuthStore(s=>s.users);
 const [rows,setRows]=useState<{project:Project;revision:number}[]>([]),[taskId,setTaskId]=useState(selectedTaskId);
 const [requestedEnd,setRequestedEnd]=useState(''),[reason,setReason]=useState(''),[memo,setMemo]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const mounted=useRef(false),refreshId=useRef(0);
 const isCurrent=(actor:typeof user)=>mounted.current&&!!actor&&actor===useAuthStore.getState().currentUser;
 const refreshRows=async()=>{
  const actor=useAuthStore.getState().currentUser,request=++refreshId.current;
  if(!isCurrent(actor))return false;
  try{const data=await studioApi('projects');if(isCurrent(actor)&&request===refreshId.current)setRows(data.projects);return true;}
  catch(error){if(isCurrent(actor)&&request===refreshId.current){setNotice(error instanceof Error?error.message:'요청 조회 실패');return false;}return true;}
 };
 const task=tasks.find(t=>t.id===taskId),project=rows.find(r=>r.project.id===task?.projectId)?.project||projects.find(p=>p.id===(task?.projectId||projectId));
 const canReview=(p:Project,r:ScheduleExtension,action:'approve'|'reject'='approve')=>{
  const manager=canManageSchedule(user,p.department,false)||(p.department==='토목&조경팀'&&user?.id==='u_8');
  if(r.approvalStage){const valid=!!r.pmApproverId&&r.pmApproverId===assignmentPersonId(p.pmId,users);return (r.approvalStage==='PM'?user?.id===r.pmApproverId&&valid:manager&&valid)||action==='reject'&&manager&&!valid;}
  if(!r.approverId)return manager;
  const designated=users.find(person=>person.id===r.approverId&&person.active!==false);
  const valid=designated&&(designated.id===assignmentPersonId(p.pmId,users)||canManageSchedule(designated,p.department,false)||(p.department==='토목&조경팀'&&designated.id==='u_8'));
  return r.approverId===user?.id&&!!valid||action==='reject'&&!valid&&manager;
 };
 const allRequests=rows.filter(r=>projectId==='ALL'||sameWorkProject(projects,r.project.id,projectId)).flatMap(r=>(r.project.scheduleExtensions||[]).filter(req=>req.userId===user?.id||req.pmApproverId===user?.id||canManageSchedule(user,r.project.department,false)||(r.project.department==='토목&조경팀'&&user?.id==='u_8')||canReview(r.project,req)||canReview(r.project,req,'reject')).map(req=>({req,...r}))).sort((a,b)=>b.req.createdAt.localeCompare(a.req.createdAt));
 const pmId=assignmentPersonId(project?.pmId,users);
 useEffect(()=>{const lifecycle=mounted,requests=refreshId;lifecycle.current=true;setRows([]);setBusy(false);setNotice('');return()=>{lifecycle.current=false;requests.current++;};},[user]);
 useEffect(()=>{setTaskId(selectedTaskId);},[selectedTaskId]);
 const taskEnd=task?.endDate;
 useEffect(()=>{setRequestedEnd(taskEnd?nextDay(taskEnd):'');},[task?.id,taskEnd]);
 useEffect(()=>{void refreshRows();},[projects,user]);
 const run=async(action:()=>Promise<unknown>)=>{const actor=useAuthStore.getState().currentUser;if(busy||!isCurrent(actor))return;setBusy(true);setNotice('');try{await action();if(isCurrent(actor)&&await refreshRows()&&isCurrent(actor))await refreshStudioMeetings();}catch(error){if(isCurrent(actor))setNotice(error instanceof Error?error.message:'요청 처리 실패');}finally{if(isCurrent(actor))setBusy(false);}};
 const submit=async()=>{const actor=useAuthStore.getState().currentUser;if(!task||!isCurrent(actor))return;if(!pmId)throw Error('프로젝트 PM 배정을 먼저 확인하세요.');await studioApi(`projects/${encodeURIComponent(task.projectId)}/extensions`,'POST',{taskId:task.id,previousEnd:task.endDate,type:'DEADLINE',requestedEnd,reason});if(!isCurrent(actor))return;setReason('');setNotice('연장 요청을 제출했습니다. PM 검토 후 팀장 또는 실장 한 명의 최종 승인이 필요합니다.');};
 return <section className="space-y-4" aria-label="일정 연장 요청">
  <div className="grid sm:grid-cols-3 gap-3">{[['관련 프로젝트',new Set(tasks.filter(t=>projectId==='ALL'||sameWorkProject(projects,t.projectId,projectId)).map(t=>workProjectOptions(projects).find(p=>sameWorkProject(projects,p.id,t.projectId))?.id||t.projectId)).size],['관련 작업',tasks.filter(t=>projectId==='ALL'||sameWorkProject(projects,t.projectId,projectId)).length],['현재 진행률',task?`${task.progress}%`:'작업 선택']].map(([label,value])=><article key={label} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs text-slate-600 dark:text-slate-300">{label}</p><strong className="text-xl">{value}</strong></article>)}</div>
  <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200">PM 검토 → 팀장 또는 실장 중 한 명 최종 승인 · 실장 참조. 최종 승인 전에는 기존 일정이 유지됩니다.{task&&!pmId&&' 현재 프로젝트 PM 배정을 먼저 확인하세요.'}</p>
  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-700 dark:bg-slate-900">
   <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-lg">작업 일정 연장 신청서</h3><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">프로젝트 업무와 새 완료일, 연장 사유를 입력하세요.</p></div><span className="rounded-lg bg-blue-50 px-4 py-2 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">{busy?'처리 중':'제출 준비'}</span></div>
   <label className="block text-sm font-semibold">연장할 프로젝트 업무<select aria-label="연장할 프로젝트 업무" disabled={busy} className={field+' mt-2'} value={taskId} onChange={event=>setTaskId(event.target.value)}><option value="">배정된 업무를 선택하세요</option>{tasks.filter(t=>projectId==='ALL'||sameWorkProject(projects,t.projectId,projectId)).map(t=><option data-no-translate key={t.id} value={t.id}>{t.projectCode} · {t.projectName} · {t.roleName}</option>)}</select></label>
   {task?<div className="rounded-lg bg-blue-50/60 p-4 dark:bg-blue-950/30"><h4 className="font-semibold text-sm">작업 정보</h4><dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-xs mt-3">{[['작업명',`${task.roleName} · ${task.scheduleMemo||task.projectName}`],['현재 마감일',task.endDate],['프로젝트',`${task.projectCode} · ${task.projectName}`],['진행률',`${task.progress}%`],['담당자',user?.name||''],['요청 횟수',String(allRequests.filter(r=>r.req.taskId===task.id).length)]].map(([label,value])=><div key={label} className="grid grid-cols-[85px_minmax(0,1fr)] gap-2"><dt className="text-slate-600 dark:text-slate-300">{label}</dt><dd data-no-translate={label==='프로젝트'||label==='작업명'&&!task.scheduleMemo?'':undefined} className="font-semibold break-words">{value}</dd></div>)}</dl></div>:<p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm dark:border-slate-600">상단에서 배정된 작업을 선택하세요.</p>}
   <fieldset disabled={busy||!task} className="grid sm:grid-cols-[220px_minmax(0,1fr)] gap-4"><legend className="sr-only">일정 연장 요청 내용</legend><label className="block text-sm font-semibold">요청 완료일 *<input aria-label="요청 완료일" className={field+' mt-2'} type="date" min={task?nextDay(task.endDate):undefined} value={requestedEnd} onChange={e=>setRequestedEnd(e.target.value)}/></label><label className="block text-sm font-semibold">연장 사유 *<textarea aria-label="연장 사유 및 조치 계획" rows={3} maxLength={1000} className={field+' mt-2 font-normal'} value={reason} placeholder="일정 연장이 필요한 사유를 입력하세요." onChange={e=>setReason(e.target.value)}/></label></fieldset>
   <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-950/30"><WorkLogSteps steps={['요청 작성','PM 검토','팀장 또는 실장 승인','일정 반영']} current={1}/></div><div className="flex justify-end"><button disabled={busy||!task||!pmId} className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void run(submit)}><CalendarDays size={15} className="inline mr-1"/>연장 요청 제출</button></div>
  </div>
  {notice&&<p role="status" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">{notice}</p>}
  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
   <h4 className="font-bold">일정 연장 이력 및 승인</h4>
   <ul className="space-y-3 mt-4">{allRequests.map(({req,project,revision})=><li key={req.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{project.code} · {req.roleName} · {req.userName}</strong><span className="text-xs flex items-center gap-1"><CheckCircle2 size={14}/>{req.status==='PENDING'?(req.approvalStage==='PM'?'PM 검토 대기':req.approvalStage==='TEAM'?'팀장 또는 실장 최종 승인 대기':'승인 대기'):req.status==='APPROVED'?'승인됨':'반려됨'}</span></div>
    <p className="text-sm mt-2">{req.type==='OVERTIME'?`당일 추가 시간 · ${req.workDate} ${req.startTime} ~ ${req.endTime} (${Number(req.hours?.toFixed(2))}시간)`:`완료일 연장 · ${req.previousEnd} → ${req.requestedEnd}`}</p>
    <p className="whitespace-pre-wrap text-sm mt-2">{req.reason}</p>
    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">요청: {req.createdAt}{req.pmReview&&` · PM 검토: ${req.pmReview.name} · ${req.pmReview.approvedAt}`}{req.decidedAt&&` · 처리: ${req.decidedName} · ${req.decidedAt}`}</p>
    {req.pmReview?.memo&&<p className="text-sm mt-2">PM 메모: {req.pmReview.memo}</p>}{req.decisionMemo&&<p className="text-sm mt-2">처리 메모: {req.decisionMemo}</p>}
    {req.status==='PENDING'&&(canReview(project,req)||canReview(project,req,'reject'))&&<div className="mt-3 flex flex-wrap gap-2">
     <label className="w-full text-sm">처리 메모<input aria-label={`${req.id} 처리 메모`} className={field+' mt-1'} maxLength={1000} value={memo[req.id]||''} onChange={e=>setMemo({...memo,[req.id]:e.target.value})}/></label>
     {(['approve','reject'] as const).filter(action=>canReview(project,req,action)).map(action=><button key={action} disabled={busy} className={'rounded-lg border px-4 py-2 text-sm '+(action==='approve'?'bg-orange-700 border-orange-700 text-white':'border-slate-300 dark:border-slate-600')} onClick={()=>void run(async()=>{
      const result=await studioApi(`projects/${encodeURIComponent(project.id)}/extensions/${encodeURIComponent(req.id)}/${action}`,'POST',{revision,memo:memo[req.id]||''});
      if(isCurrent(user))setNotice(action==='reject'?'반려했습니다. 기존 일정이 유지됩니다.':result.request.status==='PENDING'?'PM 검토를 완료했습니다. 팀장 또는 실장의 최종 승인을 기다립니다.':req.type==='OVERTIME'?'추가 시간을 승인했습니다. 계획 마감일은 유지됩니다.':'최종 승인했습니다. 요청한 업무 구간의 새 완료일이 공유 일정에 반영됩니다.');
     })}>{action==='reject'?'연장 반려':req.approvalStage==='PM'?'PM 검토 승인':req.approvalStage==='TEAM'?'최종 연장 승인':'연장 승인'}</button>)}
    </div>}
   </li>)}</ul>
   {!allRequests.length&&<p className="text-sm text-slate-600 dark:text-slate-300 mt-3">일정 연장 요청 이력이 없습니다.</p>}
  </div>
 </section>;
}
