import {useState,useEffect} from 'react';
import {CalendarDays,CheckSquare,ArrowRight} from 'lucide-react';
import {useAuthStore} from '../store/useAuthStore';
import {useProjectStore} from '../store/useProjectStore';
import {usePersonalStore,refreshPersonal} from '../store/usePersonalStore';
import {studioApi} from '../services/studioApi';
import {assignedItems,assignmentAliases,dayOff,nextDay,leavesFor} from '../utils/personalWork';
import {localDate} from '../utils/scheduleProgress';
export function PersonalWorkView({leaveMode=false,onWorklog}:{leaveMode?:boolean;onWorklog:(date:string)=>void}){
 const user=useAuthStore(s=>s.currentUser),users=useAuthStore(s=>s.users),projects=useProjectStore(s=>s.projects);
 const {leaves,checks,loaded}=usePersonalStore();
 const [today,setToday]=useState(localDate()),[start,setStart]=useState(localDate()),[end,setEnd]=useState(localDate()),[kind,setKind]=useState('연차');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setToday(localDate()),30000);return()=>clearInterval(timer);},[]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await action();await refreshPersonal();}catch(e){setMessage(e instanceof Error?e.message:'저장 실패. 입력을 유지하고 다시 시도하세요.');}finally{setBusy(false);}}
 if(!user)return null;
 const panel='rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5';
 const field='w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2';
 return <section className="space-y-5 text-slate-900 dark:text-slate-100">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold flex items-center gap-2">{leaveMode?<CalendarDays/>:<CheckSquare/>}{leaveMode?'내 휴가 일정':'오늘·내일 할 일'}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{leaveMode?'연차·휴가를 등록하면 할 일과 팀 배정 화면에 함께 표시됩니다.':'본인에게 배정된 오늘과 내일 업무입니다. 실장·팀장의 일정 변경은 자동 반영됩니다.'}</p></div><span className="text-sm">{user.name} · {user.department}</span></header>
  {!loaded&&<p role="status">개인 일정 연결 확인 중…</p>}
  {message&&<p role="status" className="rounded-lg bg-amber-100 text-amber-950 p-3">{message}</p>}
  {leaveMode?<>
   <form className={panel+' space-y-4'} onSubmit={e=>{e.preventDefault();void run(async()=>{await studioApi('leaves','POST',{startDate:start,endDate:end,kind});setMessage('휴가 일정이 등록되었습니다. 본인 등록 표시이며 인사 승인·잔여 연차 차감과는 별개입니다.');});}}>
    <h3 className="font-bold">휴가 등록</h3><p className="text-sm text-slate-600 dark:text-slate-300">등록한 휴가 종류와 날짜는 업무 배정을 위해 팀원에게 공유됩니다. 개인 사유는 입력하지 않습니다.</p>
    <div className="grid sm:grid-cols-3 gap-4"><label className="text-sm space-y-2 block">휴가 종류<select className={field} value={kind} onChange={e=>{setKind(e.target.value);if(e.target.value.includes('반차'))setEnd(start);}}>{['연차','오전 반차','오후 반차','휴가'].map(k=><option key={k}>{k}</option>)}</select></label>
    <label className="text-sm space-y-2 block">시작일<input className={field} required type="date" value={start} onChange={e=>{setStart(e.target.value);if(end<e.target.value||kind.includes('반차'))setEnd(e.target.value);}}/></label>
    <label className="text-sm space-y-2 block">종료일<input className={field} required type="date" min={start} value={end} disabled={kind.includes('반차')} onChange={e=>setEnd(e.target.value)}/></label></div>
    <button type="submit" disabled={busy||!loaded} className="px-4 py-2 rounded-lg bg-blue-700 text-white disabled:opacity-50">{busy?'저장 중…':'휴가 일정 등록'}</button>
   </form>
   <div className={panel}><h3 className="font-bold mb-3">내 등록 내역</h3>{!leaves.some(l=>l.user_id===user.id)?<p className="text-sm text-slate-600 dark:text-slate-300">등록한 휴가가 없습니다.</p>:<ul className="divide-y divide-slate-200 dark:divide-slate-700">{leaves.filter(l=>l.user_id===user.id).sort((a,b)=>b.start_date.localeCompare(a.start_date)).map(l=><li key={l.id} className="py-3 flex flex-wrap justify-between gap-3"><div><strong>{l.kind}</strong><p className="text-sm">{l.start_date} ~ {l.end_date} · 본인 등록</p></div><button disabled={busy} className="underline text-sm" onClick={()=>void run(async()=>{await studioApi(`leaves/${l.id}`,'DELETE',{revision:l.revision});setMessage('휴가 등록을 취소했습니다.');})}>등록 취소</button></li>)}</ul>}</div>
  </>:<>
   <div className="grid lg:grid-cols-2 gap-5">{[today,nextDay(today)].map((day,index)=>{
    const tasks=assignedItems(user.id,day,projects,assignmentAliases(user,users)),vacations=leavesFor(leaves,user.id,day),off=dayOff(day);
    return <article key={day} className={panel}><div className="flex justify-between gap-3 items-center"><h3 className="text-lg font-bold">{index===0?'오늘':'내일'} <span className="text-sm font-normal">{day}</span></h3><span className="text-sm">{tasks.length}건</span></div>
    {off&&<p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{off} · 정규 배정 업무를 표시하지 않는 날입니다.</p>}
    {vacations.length>0&&<p className="mt-3 rounded-lg bg-amber-100 text-amber-950 p-3 text-sm">{vacations.map(l=>l.kind).join(' · ')} 등록일{tasks.length>0?' · 배정 업무와 겹칩니다. 팀장·실장과 일정을 조정하세요.':''}</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700 mt-3">{tasks.map(t=>{const done=checks.some(c=>c.day===day&&c.task_id===t.id&&c.done===1);return <li key={t.id} className="py-4 flex gap-3"><input className="mt-1 w-5 h-5 accent-blue-700 shrink-0" type="checkbox" aria-label={`${day} ${t.projectCode} ${t.roleName} 완료`} checked={done} disabled={busy||!loaded} onChange={e=>void run(async()=>{await studioApi('task-checks','POST',{day,taskId:t.id,done:e.target.checked});})}/><div className="min-w-0"><div className="text-xs text-slate-600 dark:text-slate-300">{t.projectCode} · {t.roleName}</div><p data-no-translate className={'font-semibold break-words '+(done?'line-through opacity-60':'')}>{t.projectName}</p><p className="text-sm mt-1 whitespace-pre-wrap">{t.todayTask}</p><p className="text-xs mt-2 text-slate-600 dark:text-slate-300">{t.notes}</p></div></li>;})}</ul>
    {!tasks.length&&!off&&<p className="py-6 text-sm text-slate-600 dark:text-slate-300">배정된 업무가 없습니다. 새 배정은 자동으로 표시됩니다.</p>}
    <button className="mt-3 flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm" onClick={()=>onWorklog(day)}>이 날짜 업무일지 열기 <ArrowRight size={16}/></button>
   </article>;})}</div><p className="text-xs text-slate-600 dark:text-slate-300">완료 체크는 개인 확인용입니다. 공종 실제 진척률은 업무일지 결재를 통해 반영됩니다. 주말·등록 공휴일은 배정 목록에서 제외됩니다.</p>
  </>}
 </section>;
}
