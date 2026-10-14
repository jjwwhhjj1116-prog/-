import {printTranslated} from '../services/translationService';
import {X} from 'lucide-react';
import {HOLIDAYS} from '../constants/holidays';
import type {Project,SubTaskSchedule} from '../store/useProjectStore';
import {TEAM_ROLES} from '../store/useProjectStore';
import {assignmentSegments,assignmentPersonId,type AssignmentPerson,type Leave} from '../utils/personalWork';
import {projectProgress,percentLabel} from '../utils/scheduleProgress';
import {projectPMId} from '../utils/pendingAssignment';

export function ProjectDetailPrint({project,people,leaves,onClose}:{project:Project;people:(AssignmentPerson&{name:string})[];leaves:Leave[];onClose:()=>void}) {
  const names=new Map(people.map(p=>[p.id,p.name]));
  const directory=[...new Map(people.map(person=>[person.id,person])).values()];
  const pmId=projectPMId(project);
  const roles=[...new Set([...(TEAM_ROLES[project.department]||[]),...Object.keys(project.roles||{}),...Object.keys(project.subTasks||{})])];
  const rows=roles.flatMap<{role:string;allocationId?:string;task?:SubTaskSchedule;hasSchedule:boolean;ids:string[];start:string;end:string}>(role=>{
    const task=project.subTasks?.[role],legacy=project.roles?.[role];
    const hasSchedule=Boolean(task||legacy);
    const responsibility=role==='PM'&&pmId?[pmId]:[];
    if(!hasSchedule)return [{role,task,hasSchedule:false,ids:responsibility,start:'',end:''}];
    const segments=assignmentSegments(task||legacy||{},project.startDate,project.endDate);
    if(!segments.length)return [{role,task,hasSchedule:false,ids:responsibility,start:'',end:''}];
    return segments.map(segment=>({role,allocationId:segment.id,task:task?{...task,memo:segment.memo??''}:task,hasSchedule:true,ids:segment.personIds.filter(Boolean),start:segment.startDate,end:segment.endDate}));
  });
  (project.postDeliveryTasks||[]).forEach((item,index)=>rows.push({role:`납품 후 ${item.kind} ${index+1}`,task:{roleName:`납품 후 ${item.kind}`,personId:item.personIds[0]||'',personIds:item.personIds,startDate:item.startDate,endDate:item.endDate,status:item.status,memo:item.memo},hasSchedule:true,ids:item.personIds,start:item.startDate,end:item.endDate}));
  const identities=new Map([...new Set([...(pmId?[pmId]:[]),...rows.flatMap(row=>row.ids)])].map(id=>[id,assignmentPersonId(id,directory)||id]));
  const personName=(id:string)=>names.get(identities.get(id)||id)||id;
  const absences=leaves.filter(l=>rows.some(r=>r.ids.some(id=>identities.get(id)===l.user_id)&&l.start_date<=r.end&&l.end_date>=r.start));
  const progress=projectProgress(project);
  const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const dates=[project.startDate,project.endDate,...rows.flatMap(r=>[r.start,r.end])].filter(validDate).sort();
  const months:string[]=[];
  if(dates.length){
    const cursor=new Date(`${dates[0].slice(0,7)}-01T00:00:00Z`);
    const last=dates[dates.length-1].slice(0,7);
    while(cursor.toISOString().slice(0,7)<=last){months.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);}
  }
  const palette=['#334155','#2563eb','#059669','#7c3aed','#b45309','#0e7490'];
  return <div id="printable-schedule-modal" className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/80 p-5 print:p-0 text-slate-900">
    <div className="relative max-w-6xl mx-auto flex flex-wrap justify-end gap-3 mb-4 pr-12 print:hidden">
      <button type="button" onClick={onClose} aria-label="프로젝트 상세 출력 미리보기 닫기" className="absolute top-0 right-0 rounded-lg bg-white p-2 text-slate-700 hover:bg-slate-100"><X size={20}/></button>
      <button type="button" onClick={()=>void printTranslated()} className="bg-blue-700 text-white rounded-lg px-4 py-2">인쇄 / PDF 저장</button>
      <button type="button" onClick={onClose} className="bg-white text-slate-900 rounded-lg px-4 py-2">편집 화면으로 돌아가기</button>
    </div>
    <article className="print-container bg-white text-slate-900 max-w-6xl mx-auto p-6 print:p-0">
      <h1 className="text-xl font-bold">프로젝트 상세 일정표</h1>
      <h2 className="text-lg font-bold mt-2">[{project.code||project.id}] <span data-no-translate>{project.name}</span></h2>
      <p className="mt-2">{project.department} · {project.startDate} ~ {project.endDate} · {project.status}</p>
      <p>담당 PM: {pmId?personName(pmId):'미배정'}</p>
      <p>계획 {percentLabel(progress.planned)} · 실제 {percentLabel(progress.actual)}</p>
      <p className="text-xs text-slate-600 my-3">현재 편집 화면 기준입니다. 공유 완료 여부는 편집 화면의 중앙 공유 상태를 확인하세요.</p>
      <p className="text-xs text-slate-600 mb-3">가로축: 날짜 · 세로축: 공종 및 담당자 · 색 막대: 배정 기간 · 휴: 담당자 휴가 (상세는 하단)</p>
      {!months.length&&<p>유효한 일정 날짜가 없어 캘린더를 표시할 수 없습니다.</p>}
      {months.map(month=>{
        const [year,m]=month.split('-').map(Number);
        const days=Array.from({length:new Date(Date.UTC(year,m,0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
        return <section key={month} className="detail-calendar-month mb-6" data-calendar-month={month}>
          <h3 className="font-bold text-base mb-2">{year}년 {m}월 · <span data-no-translate>{project.name}</span></h3>
          <table className="w-full border-collapse table-fixed text-[10px]" aria-label={`${month} 공종별 일정 캘린더`}>
            <colgroup><col style={{width:'19%'}}/>{days.map(day=><col key={day}/>)}</colgroup>
            <thead><tr><th className="border border-slate-300 p-2 text-left bg-slate-100">공종 / 담당자 / 실제 진척률</th>{days.map(day=>{
              const weekday=new Date(`${day}T00:00:00Z`).getUTCDay();
              const holiday=HOLIDAYS[day];
              return <th key={day} title={holiday?`${holiday.country} ${holiday.name}`:day} className="border border-slate-300 py-2" style={{background:weekday===0||weekday===6||holiday?'#f1f5f9':'#fff',color:weekday===0||holiday?'#b91c1c':weekday===6?'#1d4ed8':'#334155'}}>{Number(day.slice(-2))}<br/>{'일월화수목금토'[weekday]}{holiday&&<small className="block">{holiday.country}</small>}</th>;
            })}</tr></thead>
            <tbody>{rows.map((r,index)=><tr key={`${r.role}|${r.allocationId||''}`} data-allocation-id={r.allocationId}>
              <th className="border border-slate-300 p-2 text-left font-normal bg-white text-slate-900"><strong>{r.role}{r.task?.subType?` / ${r.task.subType}`:''}</strong><br/>{r.task?.scopeExcluded?'용역 범위 없음':r.ids.map(personName).join(', ')||'미배정'}<br/>{!r.task?.scopeExcluded&&<span className="text-slate-600">{r.hasSchedule?`${r.start} ~ ${r.end}`:r.role==='PM'&&r.ids.length?'기간 미설정':'일정 미입력'}<br/>{r.task?.status||'미입력'} · {percentLabel(r.task?.progress)}</span>}</th>
              {days.map(day=>{
                const active=validDate(r.start)&&validDate(r.end)&&day>=r.start&&day<=r.end;
                const off=absences.filter(l=>r.ids.some(id=>identities.get(id)===l.user_id)&&day>=l.start_date&&day<=l.end_date);
                const weekend=[0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
                return <td key={day} data-schedule-date={active?day:undefined} data-trade={active?r.role:undefined} title={`${r.role} · ${day}${off.length?' · '+off.map(l=>`${personName(l.user_id)} ${l.kind}`).join(', '):''}`} className="border border-slate-300 p-0 text-center" style={{background:weekend||HOLIDAYS[day]?'#f1f5f9':'#fff'}}>
                  {active&&<div className="py-2 font-bold" style={{background:palette[index%palette.length],color:'#fff',minHeight:30}}>{off.length?'휴':' '}</div>}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </section>;
      })}
      {rows.some(r=>r.task?.memo)&&<section className="detail-notes mt-5"><h3 className="font-bold mb-2">공종별 업무 내용</h3>{rows.filter(r=>r.task?.memo).map(r=><div key={`${r.role}|${r.allocationId||''}`} className="mb-3"><h4 className="font-bold text-sm">{r.role}{r.allocationId?` · ${r.start} ~ ${r.end}`:''}</h4><p className="text-xs whitespace-pre-wrap break-words">{r.task?.memo}</p></div>)}</section>}
      <h3 className="font-bold mt-5 mb-2">배정 기간과 겹치는 담당자 휴가 · 본인 등록</h3>
      {absences.length?<ul>{absences.map(l=><li key={l.id}>{names.get(l.user_id)||l.name||l.user_id} · {l.kind} · {l.start_date} ~ {l.end_date}</li>)}</ul>:<p>등록된 휴가 없음</p>}
      {(project.notes||project.request)&&<section className="mt-5 whitespace-pre-wrap break-words"><h3 className="font-bold">견적조건 및 요청사항</h3><p>{project.notes}</p><p>{project.request}</p></section>}
    </article>
    <style>{`@media print { #printable-schedule-modal { print-color-adjust: exact; -webkit-print-color-adjust: exact; } #printable-schedule-modal .detail-calendar-month + .detail-calendar-month { break-before: page; } #printable-schedule-modal .detail-calendar-month { margin-bottom: 10px; } #printable-schedule-modal table { table-layout: fixed; font-size: 9px; line-height: 1.15; } #printable-schedule-modal th { padding: 1px 3px; } #printable-schedule-modal th, #printable-schedule-modal td { overflow-wrap: anywhere; } #printable-schedule-modal thead { display: table-header-group; } #printable-schedule-modal tr { break-inside: avoid; } #printable-schedule-modal .detail-notes > div { margin-bottom: 2px; } }`}</style>
  </div>;
}
