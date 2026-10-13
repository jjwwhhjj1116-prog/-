import {useState} from 'react';
import {studioApi} from '../services/studioApi';
import {useStudioStore,refreshStudioMeetings,publishLocalTeam,resolveScheduleConflict} from '../store/useStudioStore';
import {usePersonalStore,refreshPersonal} from '../store/usePersonalStore';
import {useAuthStore} from '../store/useAuthStore';
export function StudioCollaboration({onOpenMeeting,onOpenWorkLog}:{onOpenMeeting:()=>void;onOpenWorkLog?:()=>void}) {
 const {ready,status,pending,conflict,notifications,unreadCount}=useStudioStore();
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const unread=unreadCount;
 const run=async(fn:()=>Promise<unknown>)=>{try{setError('');await fn();}catch(e){setError(e instanceof Error?e.message:'요청 실패');}};
 return <section className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs" aria-label="공유 및 결재 알림">
  <div className="flex items-center gap-3 flex-wrap"><span role="status">{status}{pending>0?` · 미전송 ${pending}건`:''}</span>
   {ready&&<button onClick={()=>void run(publishLocalTeam)} className="underline">현재 팀의 미공유 일정 등록</button>}
   <button onClick={()=>setOpen(!open)} className="font-bold px-3 py-1 rounded border border-blue-400" aria-expanded={open}>결재 알림 {unread}건</button>
   {unread>0&&<span role="alert" className="text-blue-700 dark:text-blue-300">확인하지 않은 결재·열람 알림이 있습니다.</span>}
  </div>
  {conflict&&<div className="my-2 p-3 border border-amber-500 rounded"><p>다른 사람이 같은 항목을 변경했습니다. 내 입력은 로컬에 보존되어 있습니다.</p><div className="flex gap-4 mt-2"><button onClick={()=>void run(()=>resolveScheduleConflict(false))}>서버 변경 채택 (내 변경 취소)</button><button onClick={()=>void run(()=>resolveScheduleConflict(true))}>내 변경 적용 (충돌 항목 덮어쓰기)</button></div></div>}
  {error&&<p role="alert">{error}</p>}
  {open&&<div className="max-h-64 overflow-auto mt-2 space-y-2">{notifications.length===0?<p>알림이 없습니다.</p>:notifications.map(n=><div key={n.id} className="p-2 border rounded flex justify-between gap-2"><button className="text-left" onClick={()=>void run(async()=>{if(n.meeting_id.startsWith('worklog:')){const actor=useAuthStore.getState().currentUser;try{await refreshPersonal();}catch(error){if(actor!==useAuthStore.getState().currentUser)return;throw error;}if(!actor||actor!==useAuthStore.getState().currentUser)return;usePersonalStore.setState({openWorkLogId:n.meeting_id.slice(8)});onOpenWorkLog?.();}else if(n.meeting_id.startsWith('extension:')){usePersonalStore.setState({openExtension:n.meeting_id.slice(10)});onOpenWorkLog?.();}else{useStudioStore.setState({openMeetingId:n.meeting_id});onOpenMeeting();}setOpen(false);})}>{!n.read_at?'● ':''}{n.message}<small className="block">{new Date(n.created_at).toLocaleString('ko-KR')}</small></button>{!n.read_at&&<button onClick={()=>void run(async()=>{await studioApi('notifications/read','POST',{id:n.id});await refreshStudioMeetings();})}>알림 읽음</button>}</div>)}</div>}
 </section>;
}
