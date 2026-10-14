import {useState} from 'react';
import {studioApi} from '../services/studioApi';
import {useStudioStore,refreshStudioMeetings,publishLocalTeam,resolveScheduleConflict} from '../store/useStudioStore';
import {usePersonalStore,refreshPersonal} from '../store/usePersonalStore';
import {useAuthStore} from '../store/useAuthStore';
import {X} from 'lucide-react';
export function StudioCollaboration({onOpenMeeting,onOpenWorkLog}:{onOpenMeeting:()=>void;onOpenWorkLog?:()=>void}) {
 const {ready,status,pending,conflict,notifications,unreadCount,actorId}=useStudioStore();
 const userId=useAuthStore(state=>state.currentUser?.id);
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const [dismissed,setDismissed]=useState<{actorId:string|undefined;ids:string[]}>({actorId:undefined,ids:[]});
 const approved=ready&&actorId===userId?notifications.find(n=>!n.read_at&&n.id.startsWith('extension-approved:')&&n.meeting_id.startsWith('extension:')&&!(dismissed.actorId===userId&&dismissed.ids.includes(n.id))):undefined;
 const unread=unreadCount;
 const run=async(fn:()=>Promise<unknown>)=>{try{setError('');await fn();}catch(e){setError(e instanceof Error?e.message:'요청 실패');}};
 const dismissApproval=(id:string)=>{
  const actor=useAuthStore.getState().currentUser;
  if(!actor||actor.id!==actorId)return;
  setDismissed(previous=>({actorId:actor.id,ids:[...(previous.actorId===actor.id?previous.ids:[]),id]}));
  void (async()=>{try{await studioApi('notifications/read','POST',{id});if(actor===useAuthStore.getState().currentUser)await refreshStudioMeetings();}catch(e){if(actor===useAuthStore.getState().currentUser)setError(e instanceof Error?e.message:'알림 확인 실패');}})();
 };
 return <section className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs" aria-label="공유 및 결재 알림">
  <div className="flex items-center gap-3 flex-wrap"><span role="status">{status}{pending>0?` · 미전송 ${pending}건`:''}</span>
   {ready&&<button onClick={()=>void run(publishLocalTeam)} className="underline">현재 팀의 미공유 일정 등록</button>}
   <button onClick={()=>setOpen(!open)} className="font-bold px-3 py-1 rounded border border-blue-400" aria-expanded={open}>결재 알림 {unread}건</button>
   {unread>0&&<span role="alert" className="text-blue-700 dark:text-blue-300">확인하지 않은 결재·열람 알림이 있습니다.</span>}
  </div>
  {conflict&&<div className="my-2 p-3 border border-amber-500 rounded"><p>다른 사람이 같은 항목을 변경했습니다. 내 입력은 로컬에 보존되어 있습니다.</p><div className="flex gap-4 mt-2"><button onClick={()=>void run(()=>resolveScheduleConflict(false))}>서버 변경 채택 (내 변경 취소)</button><button onClick={()=>void run(()=>resolveScheduleConflict(true))}>내 변경 적용 (충돌 항목 덮어쓰기)</button></div></div>}
  {error&&<p role="alert">{error}</p>}
  {approved&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" onKeyDown={event=>{if(event.key==='Escape')dismissApproval(approved.id);if(event.key==='Tab'){const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')),first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&event.target===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&event.target===last){event.preventDefault();first?.focus();}}}}><section role="dialog" aria-modal="true" aria-label="일정 연장 승인 안내" className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><button autoFocus type="button" aria-label="일정 연장 승인 안내 닫기" onClick={()=>dismissApproval(approved.id)} className="absolute right-3 top-3 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><X size={18}/></button><h2 className="pr-8 text-lg font-bold">일정 연장이 승인되었습니다</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6">{approved.message}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">승인된 연장 기간이 공유 일정표에 반영됩니다.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold dark:border-slate-600" onClick={()=>dismissApproval(approved.id)}>확인</button><button type="button" className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white hover:bg-blue-900" onClick={()=>{usePersonalStore.setState({openExtension:approved.meeting_id.slice(10)});onOpenWorkLog?.();dismissApproval(approved.id);}}>연장 요청 확인</button></div></section></div>}
  {open&&<div className="max-h-64 overflow-auto mt-2 space-y-2">{notifications.length===0?<p>알림이 없습니다.</p>:notifications.map(n=><div key={n.id} className="p-2 border rounded flex justify-between gap-2"><button className="text-left" onClick={()=>void run(async()=>{if(n.meeting_id.startsWith('worklog:')){const actor=useAuthStore.getState().currentUser;try{await refreshPersonal();}catch(error){if(actor!==useAuthStore.getState().currentUser)return;throw error;}if(!actor||actor!==useAuthStore.getState().currentUser)return;usePersonalStore.setState({openWorkLogId:n.meeting_id.slice(8)});onOpenWorkLog?.();}else if(n.meeting_id.startsWith('extension:')){usePersonalStore.setState({openExtension:n.meeting_id.slice(10)});onOpenWorkLog?.();}else{useStudioStore.setState({openMeetingId:n.meeting_id});onOpenMeeting();}setOpen(false);})}>{!n.read_at?'● ':''}{n.message}<small className="block">{new Date(n.created_at).toLocaleString('ko-KR')}</small></button>{!n.read_at&&<button onClick={()=>void run(async()=>{await studioApi('notifications/read','POST',{id:n.id});await refreshStudioMeetings();})}>알림 읽음</button>}</div>)}</div>}
 </section>;
}
