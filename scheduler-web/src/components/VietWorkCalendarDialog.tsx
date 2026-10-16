import {useEffect,useId,useRef,useState} from 'react';
import {CalendarDays,Plus,RefreshCw,Save,Trash2,X} from 'lucide-react';
import {studioApi} from '../services/studioApi';
import {useAuthStore} from '../store/useAuthStore';
import {usePersonalStore} from '../store/usePersonalStore';
import {vietCalendarPreset,workDayInfo,type CompanyWorkCalendar,type WorkCalendarException} from '../utils/workCalendar';

const field='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const secondary='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800';
const saturdays=(year:number,month:number)=>Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>`${year}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`).filter(day=>new Date(day+'T12:00:00Z').getUTCDay()===6);
function mergeCalendar(calendar:CompanyWorkCalendar){usePersonalStore.setState(state=>({workCalendars:[...state.workCalendars.filter(row=>row.company!==calendar.company||row.year!==calendar.year),state.workCalendars.find(row=>row.company===calendar.company&&row.year===calendar.year&&row.revision>calendar.revision)||calendar].sort((a,b)=>a.year-b.year)}));}

export function VietWorkCalendarDialog({onClose}:{onClose:()=>void}){
 const user=useAuthStore(state=>state.currentUser),titleId=useId();
 const [year,setYear]=useState(new Date().getFullYear()),[calendars,setCalendars]=useState<CompanyWorkCalendar[]>([]),[draft,setDraft]=useState<CompanyWorkCalendar|null>(null),[canManage,setCanManage]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [exception,setException]=useState<Omit<WorkCalendarException,'id'>>({kind:'HOLIDAY',startDate:'',endDate:'',name:''});
 const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),mounted=useRef(false),requestId=useRef(0),savingRef=useRef(false);
 const saved=calendars.find(row=>row.year===year),dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved||vietCalendarPreset(year));
 const pendingException=!!(exception.startDate||exception.endDate||exception.name.trim());
 const active=(actor:typeof user,id:number)=>mounted.current&&actor===useAuthStore.getState().currentUser&&id===requestId.current;
 const load=async(reset=false)=>{
  if(!user||savingRef.current)return;if(!reset&&(dirty||pendingException)){setError('먼저 변경 내용을 등록하거나 변경 취소를 눌러 주세요. 입력한 내용을 보존하고 있습니다.');return;}const actor=user,id=++requestId.current;setLoading(true);setError('');setNotice('');
  try{const result=await studioApi<{workCalendars:CompanyWorkCalendar[];canManage:boolean}>('work-calendars');if(!active(actor,id))return;setCalendars(result.workCalendars);setCanManage(result.canManage);setDraft(result.workCalendars.find(row=>row.year===year)||vietCalendarPreset(year));for(const calendar of result.workCalendars)mergeCalendar(calendar);}
  catch(failure){if(active(actor,id))setError(failure instanceof Error?failure.message:'근무일을 불러오지 못했습니다. 다시 조회해 주세요.');}
  finally{if(active(actor,id))setLoading(false);}
 };
 useEffect(()=>{const lifecycle=mounted,requests=requestId;lifecycle.current=true;savingRef.current=false;setSaving(false);setDraft(null);setCanManage(false);setCalendars([]);setException({kind:'HOLIDAY',startDate:'',endDate:'',name:''});void load(true);return()=>{lifecycle.current=false;requests.current++;};
 // Account changes invalidate pending responses.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[user]);
 useEffect(()=>{const previous=document.activeElement;closeButton.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const selectYear=(next:number)=>{if(savingRef.current||loading||!Number.isInteger(next)||next<2000||next>2100)return;if(dirty||pendingException){setError('연도를 바꾸기 전에 변경 내용을 등록하거나 변경 취소를 눌러 주세요.');return;}setYear(next);setDraft(calendars.find(row=>row.year===next)||vietCalendarPreset(next));setError('');setNotice('');setException({kind:'HOLIDAY',startDate:'',endDate:'',name:''});};
 const toggle=(day:string)=>{if(!draft||!canManage||loading||savingRef.current)return;setDraft({...draft,saturdayOffDates:draft.saturdayOffDates.includes(day)?draft.saturdayOffDates.filter(value=>value!==day):[...draft.saturdayOffDates,day].sort()});setNotice('');};
 const addException=()=>{
  if(!draft||!canManage)return;setError('');
  const valid=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number(day.slice(0,4))===year&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
  if(!valid(exception.startDate)||!valid(exception.endDate)||exception.startDate>exception.endDate||!exception.name.trim()){setError(`${year}년 안의 시작일·종료일과 휴일 또는 근무 사유를 입력해 주세요.`);return;}
  if(draft.exceptions.some(row=>row.kind===exception.kind&&row.startDate<=exception.endDate&&row.endDate>=exception.startDate)){setError('같은 종류의 기간이 겹칩니다. 기존 기간을 삭제한 뒤 변경한 기간을 추가해 주세요.');return;}
  setDraft({...draft,exceptions:[...draft.exceptions,{...exception,name:exception.name.trim(),id:crypto.randomUUID()}].sort((a,b)=>a.startDate.localeCompare(b.startDate))});setException({...exception,startDate:'',endDate:'',name:''});setNotice('');
 };
 const save=async()=>{
  if(!user||!draft||!canManage||loading||savingRef.current)return;
  if(pendingException){setError('입력 중인 휴일·근무 기간의 ‘기간 추가’를 먼저 눌러 주세요. 목록에 추가된 기간을 함께 등록합니다.');return;}
  const actor=user,id=requestId.current;setError('');setNotice('');savingRef.current=true;setSaving(true);
  try{const result=await studioApi<{calendar:CompanyWorkCalendar}>('work-calendars','POST',{calendar:draft,baseRevision:draft.revision});if(!active(actor,id))return;mergeCalendar(result.calendar);setCalendars(old=>[...old.filter(row=>row.year!==result.calendar.year),result.calendar]);setDraft(result.calendar);setNotice(`${result.calendar.year}년 VIET QS 근무일을 등록했습니다. 프로젝트·팀·개인 일정표와 할 일·업무보고에 반영됩니다.`);}
  catch(failure){if(active(actor,id))setError(failure instanceof Error?failure.message:'저장하지 못했습니다. 최신 근무일을 조회한 뒤 다시 등록해 주세요.');}
  finally{if(active(actor,id)){savingRef.current=false;setSaving(false);}}
 };
 const keyDown=(event:React.KeyboardEvent)=>{
  if(event.key==='Escape'){event.stopPropagation();if(!savingRef.current)onClose();}
  if(event.key==='Tab'){const controls=panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 };
 return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3" onKeyDown={keyDown}>
  <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={loading||saving} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
   <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><h2 id={titleId} className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={21} className="text-blue-700"/>VIET QS 근무일 등록</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">연간 토요 근무·휴무와 회사 추가 휴일을 설정합니다. 일요일은 기본 휴무입니다.</p></div><button ref={closeButton} type="button" aria-label="근무일 등록 닫기" onClick={onClose} disabled={saving} className={secondary}><X size={18}/></button></header>
   <div className="overflow-y-auto p-5">
    <div className="mb-4 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm font-semibold">등록 연도<input type="number" aria-label="등록 연도" min={2000} max={2100} value={year} disabled={loading||saving} onChange={event=>selectYear(Number(event.target.value))} className={`${field} w-28`}/></label><span className="text-sm text-slate-600 dark:text-slate-300">{saved?`등록됨 · 변경 ${saved.revision}회`:'미등록 · 아래 내용을 검토하고 등록해 주세요'}</span><button type="button" onClick={()=>void load()} disabled={loading||saving} className={`${secondary} ml-auto`}><RefreshCw size={15}/>최신 근무일 조회</button></div>
    {loading&&<p role="status" className="py-8 text-center">등록된 근무일을 불러오는 중입니다.</p>}
    {error&&<p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {notice&&<p role="status" className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
    {!loading&&draft&&<>
     {!canManage&&<p className="mb-4 text-sm text-slate-700 dark:text-slate-200">근무일을 조회하고 있습니다. 등록·변경은 관리자 또는 국내 팀장·실장이 할 수 있습니다.</p>}
     <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">토요일 근무·휴무</h3><span className="text-sm text-slate-600 dark:text-slate-300">초록: 근무 · 회색: 휴무 · 클릭하여 변경</span></div>
     <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{year===2026?'2026년 회사 확정표를 기준으로 토요 휴무 26일과 회사 휴일을 준비했습니다. 구정 2월 13~23일은 모두 휴무입니다.':'새 연도는 모든 토요일이 휴무로 준비됩니다. 확정된 근무 토요일과 회사 휴일을 지정한 뒤 등록해 주세요.'}</p>
     <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:12},(_,index)=><div key={index} className="flex items-center gap-2 border-b border-slate-200 py-3 dark:border-slate-700"><strong className="w-9 shrink-0 text-sm">{index+1}월</strong><div className="flex flex-wrap gap-1">{saturdays(year,index+1).map(day=>{const info=workDayInfo(day,{company:'VIETQS',calendars:[draft]}),override=draft.exceptions.some(row=>row.startDate<=day&&row.endDate>=day);return <button key={day} type="button" aria-label={`${day} 토요 ${info.working?'근무':'휴무'}`} aria-pressed={info.working} title={`${day} · ${info.name}${override?' · 아래 회사 휴일·예외 근무일에서 변경':''}`} disabled={!canManage||saving||override} onClick={()=>toggle(day)} className={`rounded-md border px-2 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-blue-700 disabled:cursor-default ${!info.working?'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200':'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'}`}>{Number(day.slice(-2))}일 {info.working?'근무':'휴무'}</button>;})}</div></div>)}</div>
     <h3 className="mt-6 font-bold">회사 추가 휴일·예외 근무일</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">회사 휴일은 평일·토요 근무일보다 우선합니다. 별도로 등록한 예외 근무일은 해당 날짜에 우선 적용됩니다.</p>
     {draft.exceptions.length?<ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">{draft.exceptions.map(row=><li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><span className={row.kind==='HOLIDAY'?'font-semibold text-red-700 dark:text-red-300':'font-semibold text-emerald-800 dark:text-emerald-300'}>{row.kind==='HOLIDAY'?'휴무':'근무'}</span> <span className="tabular-nums">{row.startDate}{row.endDate!==row.startDate?` ~ ${row.endDate}`:''}</span><span className="ml-3 break-words">{row.name}</span></div>{canManage&&<button type="button" disabled={saving} aria-label={`${row.name} 기간 삭제`} onClick={()=>setDraft({...draft,exceptions:draft.exceptions.filter(item=>item.id!==row.id)})} className={`${secondary} shrink-0 text-red-700`}><Trash2 size={15}/>삭제</button>}</li>)}</ul>:<p className="py-4 text-sm text-slate-600 dark:text-slate-300">등록할 회사 휴일이 없습니다. 아래에서 추가해 주세요.</p>}
     {canManage&&<fieldset disabled={saving} className="mt-4 grid grid-cols-1 items-end gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-800"><legend className="text-sm font-semibold">기간 추가</legend><label className="grid gap-1 text-sm">구분<select aria-label="추가 기간 구분" value={exception.kind} onChange={event=>setException({...exception,kind:event.target.value as WorkCalendarException['kind']})} className={field}><option value="HOLIDAY">회사 휴일</option><option value="WORKDAY">예외 근무일</option></select></label><label className="grid gap-1 text-sm">시작일<input type="date" value={exception.startDate} min={`${year}-01-01`} max={`${year}-12-31`} onChange={event=>setException({...exception,startDate:event.target.value,endDate:exception.endDate||event.target.value})} className={field}/></label><label className="grid gap-1 text-sm">종료일<input type="date" value={exception.endDate} min={`${year}-01-01`} max={`${year}-12-31`} onChange={event=>setException({...exception,endDate:event.target.value})} className={field}/></label><label className="grid gap-1 text-sm">휴일 이름·근무 사유<input value={exception.name} maxLength={120} placeholder="예: 회사 추가 휴무" onChange={event=>setException({...exception,name:event.target.value})} className={`${field} placeholder:text-slate-600`}/></label><button type="button" onClick={addException} className={`${secondary} justify-self-start`}><Plus size={15}/>기간 추가</button></fieldset>}
    </>}
   </div>
   <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 p-4 dark:border-slate-700">{(dirty||pendingException)&&<><span className="mr-auto text-sm text-orange-800 dark:text-orange-300">변경 내용을 등록해야 공유됩니다.</span><button type="button" disabled={saving} onClick={()=>{setDraft(saved||vietCalendarPreset(year));setException({kind:'HOLIDAY',startDate:'',endDate:'',name:''});setError('');setNotice('');}} className={secondary}>변경 취소</button></>}<button type="button" onClick={onClose} disabled={saving} className={secondary}>닫기</button>{canManage&&<button type="button" onClick={()=>void save()} disabled={loading||saving||!draft} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700 focus-visible:outline-offset-2 disabled:opacity-50"><Save size={16}/>{saving?'등록 중…':'근무일 등록'}</button>}</footer>
  </section>
 </div>;
}
