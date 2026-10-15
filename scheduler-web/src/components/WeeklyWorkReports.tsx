import {useEffect,useRef,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,RefreshCw,Save,Users} from 'lucide-react';
import {studioApi} from '../services/studioApi';
import {useAuthStore} from '../store/useAuthStore';
import {localDate} from '../utils/scheduleProgress';
import {WeeklyReportApproval} from './WeeklyReportApproval';

type WeeklyItem={projectCode:string;projectName:string;roleName:string;progress:number;status:string;todayTask:string;autoScheduleDate?:string;manualFields?:string[]};
type WeeklyOvertime={projectCode:string;projectName:string;roleName:string;startTime:string;endTime:string;hours:number;status:string};
type WeeklySupplementReport=WeeklyItem&{id?:string;projectId?:string;department?:string;startDate?:string;endDate?:string;submittedAt?:string;submissionRevision?:number;scheduleMemo?:string};
type WeeklyDay={supplementReports?:WeeklySupplementReport[];date:string;future?:boolean;logStatus:string;reportSource:string;plannedProgress?:number;reportedProgress?:number;notes:string;items:WeeklyItem[];overtime:WeeklyOvertime[]};
type WeeklyEmployee={id:string;name:string;position:string;days:WeeklyDay[];reportCount:number;approvedReportCount:number;overtimeDays:number;overtimeHours:number};
type WeeklyReport={weekStart:string;weekEnd:string;teams:{department:string;employees:WeeklyEmployee[]}[];delivery:{status:'SENT'|'NOT_SENT'|'RECIPIENTS_REQUIRED';sentAt?:string;recipients:{id:string;name:string}[]};canConfigure:boolean;config:{recipientIds:string[]};directory?:{id:string;name:string;department:string;position:string}[]};
const panel='rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
const button='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';
const field='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800';
const shiftDay=(day:string,offset:number)=>{const date=new Date(`${day}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
const weekOf=(day:string):string=>{const date=new Date(`${day}T00:00:00Z`);return Number.isNaN(date.valueOf())?weekOf(localDate()):shiftDay(day,-((date.getUTCDay()+6)%7));};
const hoursLabel=(hours:number)=>Number(hours||0).toLocaleString('ko-KR',{maximumFractionDigits:2});
const percent=(value:number|undefined)=>value==null?'미산정':`${Math.round(value*100)/100}%`;
const statusLabel=(status:string)=>({DRAFT:'작성 중',SUBMITTED_LEADER:'팀장 검토 대기',SUBMITTED_PM:'PM 검토 대기',APPROVED_FINAL:'최종 승인',APPROVED_PM:'PM 승인',APPROVED:'승인',REJECTED:'반려',NONE:'보고 없음'}[status]||status||'보고 없음');
const automaticSource=(source:string)=>source==='AUTO_SCHEDULE';

export function WeeklyWorkReports({initialWeek}:{initialWeek?:string}={}){
 const actor=useAuthStore(state=>state.currentUser);
 const [week,setWeek]=useState(()=>weekOf(initialWeek||localDate())),[department,setDepartment]=useState('ALL');
 const [report,setReport]=useState<WeeklyReport|null>(null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [recipientIds,setRecipientIds]=useState<string[]>([]),[configDirty,setConfigDirty]=useState(false),[reload,setReload]=useState(0);
 const requestId=useRef(0),dirtyRef=useRef(false),reportActor=useRef<typeof actor>(null);dirtyRef.current=configDirty;
 useEffect(()=>{if(initialWeek)setWeek(weekOf(initialWeek));},[initialWeek]);
 useEffect(()=>{
  setReport(null);setMessage('');setDepartment('ALL');
 },[actor,week]);
 useEffect(()=>{setConfigDirty(false);setRecipientIds([]);setSaving(false);},[actor]);
 useEffect(()=>{
  if(!actor)return;
  let active=true;
  const load=async()=>{
   const id=++requestId.current;setBusy(true);
   try{
    const result=await studioApi<WeeklyReport>(`weekly-reports?week=${week}`);
    if(!active||id!==requestId.current||actor!==useAuthStore.getState().currentUser)return;
    reportActor.current=actor;setReport(result);setMessage('');if(!dirtyRef.current)setRecipientIds(result.config.recipientIds);
   }catch(error){if(active&&id===requestId.current&&actor===useAuthStore.getState().currentUser)setMessage(error instanceof Error?error.message:'주간 보고를 불러오지 못했습니다.');}
   finally{if(active&&id===requestId.current&&actor===useAuthStore.getState().currentUser)setBusy(false);}
  };
  void load();const timer=setInterval(()=>void load(),30000);
  return()=>{active=false;clearInterval(timer);};
 },[actor,week,reload]);
 async function saveSettings(){
  if(!actor||saving)return;
  setSaving(true);setMessage('');
  try{
   await studioApi('weekly-reports/settings','POST',{recipientIds});
   if(actor!==useAuthStore.getState().currentUser)return;
   setConfigDirty(false);dirtyRef.current=false;setMessage('주간 보고 수신 임원을 저장했습니다.');setReload(value=>value+1);
  }catch(error){if(actor===useAuthStore.getState().currentUser)setMessage(error instanceof Error?error.message:'수신 임원 저장 실패. 선택을 유지하고 다시 시도하세요.');}
  finally{if(actor===useAuthStore.getState().currentUser)setSaving(false);}
 }
 if(!actor)return null;
 const current=report?.weekStart===week&&reportActor.current===actor?report:null,dates=Array.from({length:7},(_,index)=>shiftDay(week,index));
 const teams=current?.teams.filter(team=>department==='ALL'||team.department===department)||[];
 const employees=teams.flatMap(team=>team.employees),reportCount=employees.reduce((sum,employee)=>sum+employee.reportCount,0),overtimeHours=employees.reduce((sum,employee)=>sum+employee.overtimeHours,0);
 return <section className="space-y-5 text-slate-900 dark:text-slate-100">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays/>팀별 주간 업무일지·야근 기록</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">개인별 업무 보고와 승인된 야근을 한 주 단위로 확인합니다.</p></div><div className="flex flex-wrap items-center gap-2"><button className={button} aria-label="이전 주" onClick={()=>setWeek(shiftDay(week,-7))}><ChevronLeft size={17}/></button><label className="text-sm">조회 주 <input aria-label="주간 보고 조회 날짜" type="date" value={week} className={field+' ml-2'} onChange={event=>{if(event.target.value)setWeek(weekOf(event.target.value));}}/></label><button className={button} aria-label="다음 주" onClick={()=>setWeek(shiftDay(week,7))}><ChevronRight size={17}/></button><button className={button} onClick={()=>setWeek(weekOf(localDate()))}>이번 주</button><button className={button} disabled={busy} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/>새로고침</button></div></header>
  {message&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
  {!current&&<p role="status" className={panel+' p-5'}>{busy?'주간 업무 기록을 불러오는 중…':'해당 주의 기록을 확인해 주세요.'}</p>}
  {current&&<>
   <div className={panel+' p-4'}><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{current.weekStart} ~ {current.weekEnd}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">매주 금요일 오후 5시 10분(한국시간), 해당 주의 기록을 지정한 경영지원 임원에게 자동 보고합니다.</p></div><span className={'rounded-full px-3 py-1 text-sm font-semibold '+(current.delivery.status==='SENT'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>{current.delivery.status==='SENT'?'임원 보고 완료':current.delivery.status==='RECIPIENTS_REQUIRED'?'보고 수신 임원 설정 필요':'주간 자동 보고 대기'}</span></div><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">수신 임원: {current.delivery.recipients.length?current.delivery.recipients.map(person=>person.name).join(', '):'아직 지정되지 않았습니다.'}{current.delivery.sentAt&&` · 보고 시각 ${new Date(current.delivery.sentAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`}</p></div>
   <div className="flex flex-wrap gap-2" aria-label="주간 보고 팀 선택">{[{department:'ALL',label:'전체 팀'},...current.teams.map(team=>({department:team.department,label:team.department}))].map(team=><button key={team.department} aria-pressed={department===team.department} className={'rounded-lg px-4 py-2 text-sm font-semibold '+(department===team.department?'bg-blue-700 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200')} onClick={()=>setDepartment(team.department)}>{team.label}</button>)}</div>
   <div className="grid grid-cols-3 gap-3">{[['직원',`${employees.length}명`],['업무일지',`${reportCount}건`],['승인 야근',`${hoursLabel(overtimeHours)}시간`]].map(([label,value])=><div className={panel+' p-4'} key={label}><span className="text-xs text-slate-600 dark:text-slate-300">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div>)}</div>
   {!employees.length?<div className={panel+' p-8 text-center text-sm text-slate-600 dark:text-slate-300'}>이 주에 확인할 개인별 업무·야근 기록이 없습니다.</div>:teams.map(team=><article className={panel+' overflow-hidden'} key={team.department}><h3 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-bold dark:border-slate-700"><Users size={18}/>{team.department} · {team.employees.length}명</h3><div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-sm"><caption className="sr-only">{team.department} 개인별 주간 업무일지와 승인 야근</caption><thead className="bg-slate-50 dark:bg-slate-800"><tr><th scope="col" className="w-44 px-4 py-3 text-left">직원 / 주간 합계</th>{dates.map((date,index)=><th scope="col" key={date} className={'min-w-36 border-l border-slate-200 px-3 py-3 text-left dark:border-slate-700 '+(index>4?'text-slate-500':'')}><span>{date.slice(5)} ({['월','화','수','목','금','토','일'][index]})</span></th>)}</tr></thead><tbody>{team.employees.map(employee=><tr key={employee.id} data-weekly-employee={employee.id} className="border-t border-slate-200 align-top dark:border-slate-700"><th scope="row" className="px-4 py-4 text-left font-normal"><strong className="block">{employee.name}</strong><span className="block text-xs text-slate-600 dark:text-slate-300">{employee.position}</span><p className="mt-3 text-xs">업무일지 {employee.reportCount}건<br/>승인 완료 {employee.approvedReportCount}건</p><p className="mt-2 text-xs font-semibold text-orange-700 dark:text-orange-300" data-weekly-overtime-summary>승인 야근 {employee.overtimeDays}일 · {hoursLabel(employee.overtimeHours)}시간</p></th>{dates.map(date=>{
    const day=employee.days.find(entry=>entry.date===date),overtime=(day?.overtime||[]).filter(entry=>entry.status==='APPROVED');
    return <td key={date} data-weekly-day={date} className="border-l border-slate-200 px-3 py-4 dark:border-slate-700">{day&&day.items.length>0?<><span className={'inline-block rounded px-2 py-1 text-[11px] font-semibold '+(['APPROVED_FINAL','APPROVED_PM','APPROVED'].includes(day.logStatus)?'bg-emerald-50 text-emerald-800':'bg-blue-50 text-blue-800')}>{statusLabel(day.logStatus)}</span><p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{automaticSource(day.reportSource)?'일정 기준 자동 보고':'직원 작성 보고'} · {day.items.length}개 업무</p>{day.plannedProgress!=null&&<p className="mt-2 text-xs">계획 {percent(day.plannedProgress)}</p>}{day.reportedProgress!=null&&<p className="text-xs">보고 {percent(day.reportedProgress)}</p>}<details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-blue-700 dark:text-blue-300">업무 내용 보기</summary><ul className="mt-2 space-y-3 text-xs">{day.items.map((item,index)=><li key={`${item.projectCode}-${item.roleName}-${index}`}><strong data-no-translate className="block break-words">{item.projectName}</strong><span className="block mt-1 text-slate-600 dark:text-slate-300">{item.projectCode} · {item.roleName}</span><span className="block mt-1">{item.autoScheduleDate&&!item.manualFields?.includes('progress')?'일정 기준':'보고 진행률'} {percent(item.progress)} · {item.status}</span>{item.todayTask&&<p className="mt-1 whitespace-pre-wrap break-words">{item.todayTask}</p>}</li>)}</ul>{day.notes&&<p className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200 pt-2 dark:border-slate-700">{day.notes}</p>}</details></>:<span className="text-xs text-slate-500">업무일지 없음</span>}{day?.supplementReports&&day.supplementReports.length>0&&<div data-weekly-supplement-reports className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100"><strong className="block">상신 후 보완 보고 · 결재 본문 외</strong><p className="mt-1">등록 즉시 자동 보고 · 기존 서명·승인 실적과 구분</p><ul className="mt-2 space-y-3">{day.supplementReports.map((item,index)=><li key={item.id||`${item.projectCode}-${index}`} data-weekly-supplement-task={item.id}><strong data-no-translate className="block break-words">{item.projectName}</strong><span className="mt-1 block">{item.projectCode} · {item.department||team.department} · {item.roleName}</span><span className="mt-1 block">{item.startDate} ~ {item.endDate} · 일정 기준 {percent(item.progress)}</span>{(item.scheduleMemo||item.todayTask)&&<p className="mt-1 whitespace-pre-wrap break-words">{item.scheduleMemo||item.todayTask}</p>}</li>)}</ul></div>}{overtime.map((entry,index)=><div key={`${entry.projectCode}-${entry.startTime}-${index}`} data-weekly-approved-overtime className="mt-3 rounded-lg bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-100"><strong>{day?.future?'승인 야근(예정)':'야근 승인'} · {hoursLabel(entry.hours)}시간</strong><span className="mt-1 block">{entry.startTime} ~ {entry.endTime}</span><span data-no-translate className="mt-1 block break-words">{entry.projectName}</span><span className="block">{entry.roleName}</span></div>)}</td>;
   })}</tr>)}</tbody></table></div></article>)}
   <p className="text-xs text-slate-600 dark:text-slate-300">일정 기준 자동 보고는 계획 진행률입니다. 실제 완료·승인 실적과 구분하며, 야근은 승인된 신청만 집계합니다. 표는 최신 공유 기록이며 발송 시각은 마지막 주간 보고 기준입니다.</p>
   {current.canConfigure&&<details className={panel+' p-4'}><summary className="cursor-pointer font-semibold">정기 보고 기본 수신자</summary><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">금요일 정기 자동 보고를 받을 기본 수신자를 지정합니다. 아래 결재 상신에서는 보고할 때마다 수신자를 별도로 선택할 수 있습니다.</p><form className="mt-4 space-y-4" onSubmit={event=>{event.preventDefault();void saveSettings();}}><div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{(current.directory||[]).map(person=><label className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700" key={person.id}><input aria-label={`주간 보고 수신 ${person.name}`} type="checkbox" checked={recipientIds.includes(person.id)} disabled={saving} onChange={event=>{setRecipientIds(previous=>event.target.checked?[...previous,person.id]:previous.filter(id=>id!==person.id));setConfigDirty(true);}}/><span><strong>{person.name}</strong><span className="block text-xs text-slate-600 dark:text-slate-300">{person.department} · {person.position}</span></span></label>)}</div>{!current.directory?.length&&<p className="text-sm text-amber-800">지정할 수 있는 직원 목록이 없습니다.</p>}<button className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50" type="submit" disabled={saving||!configDirty}><Save size={16}/>{saving?'저장 중…':'수신 임원 저장'}</button></form></details>}
  </>}
  <WeeklyReportApproval week={week} onChanged={()=>setReload(value=>value+1)}/>
 </section>;
}
