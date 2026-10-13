import {translatedConfirm} from '../services/translationService';
import {useEffect,useState} from 'react';
import {studioApi} from '../services/studioApi';
import {useAuthStore} from '../store/useAuthStore';
import {useProjectStore,type Project} from '../store/useProjectStore';
import {useStudioStore,changeProjectLifecycle} from '../store/useStudioStore';
import {canManageSchedule} from '../utils/schedulePermissions';
import type {DailyWorkLog} from '../store/useWorkLogStore';
const statusLabel=(status:string)=>({DRAFT:'작성 중',SUBMITTED_LEADER:'팀장 검토 대기',APPROVED_FINAL:'최종 승인',SUBMITTED_PM:'검토 대기',APPROVED_PM:'검토 완료'}[status]||status);
const panel='rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-4';
export function ProjectArchive(){
 const user=useAuthStore(s=>s.currentUser),projects=useProjectStore(s=>s.projects);
 const {archivedProjects,ready,pending,conflict}=useStudioStore();
 const [selection,setSelection]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const available=projects.filter(p=>canManageSchedule(user,p.department,false));
 const archived=archivedProjects.filter(p=>canManageSchedule(user,p.department,false));
 if(!available.length&&!archived.length)return null;
 async function act(project:Project,restore:boolean){
  if(!restore&&!await translatedConfirm(`${project.name}\n활성 일정·할 일에서 제외하고 기록을 보존할까요? 업무일지·회의록·Drive 자료는 유지되며 복원할 수 있습니다.`))return;
  setBusy(true);setError('');try{await changeProjectLifecycle(project,restore);setSelection('');}catch(e){setError(e instanceof Error?e.message:'처리 실패');}finally{setBusy(false);}
 }
 return <details className={panel}><summary className="cursor-pointer font-bold">프로젝트 정리·복원 · 기록 보존</summary>
  <p className="text-sm my-2">종료된 프로젝트를 활성 일정과 할 일에서 제외합니다. 작성된 일지·회의록·Drive 파일은 보존됩니다.</p>
  <select aria-label="정리할 프로젝트" className="border rounded p-2 bg-white dark:bg-slate-800 max-w-full" value={selection} onChange={e=>setSelection(e.target.value)}><option value="">프로젝트 선택</option>{available.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name} · {p.department}</option>)}</select>
  <button className="border rounded px-3 py-2 ml-2 disabled:opacity-50" disabled={!selection||busy||!ready||!!pending||conflict} onClick={()=>void act(available.find(p=>p.id===selection)!,false)}>정리하여 보관</button>
  <p className="text-sm my-2">보관된 프로젝트 {archived.length}건</p>{archived.map(p=><div key={p.id} className="flex gap-3 items-center py-1"><span>{p.code} · {p.name} · {p.department}</span><button className="border rounded px-2 shrink-0 disabled:opacity-50" disabled={busy||!ready||!!pending||conflict} onClick={()=>void act(p,true)}>복원</button></div>)}
  {!!pending&&<p>변경 전송이 끝난 뒤 정리할 수 있습니다.</p>}{error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
 </details>;
}
export function LegacyWorkLogArchive(){
 const user=useAuthStore(s=>s.currentUser),ready=useStudioStore(s=>s.ready);
 const userId=user?.id;
 const [selected,setSelected]=useState<number[]>([]),[local,setLocal]=useState<DailyWorkLog[]>([]),[records,setRecords]=useState<{id:string;source:DailyWorkLog}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setSelected([]);setRecords([]);setLocal([]);if(!userId||!ready)return;
  try{const raw=JSON.parse(localStorage.getItem('studio-legacy-worklogs-v1')||'[]');setLocal(Array.isArray(raw)?raw.filter(x=>x.userId===userId&&!x.serverRevision):[]);}catch{setError('이 PC의 기존 일지 원본을 읽지 못했습니다. 원본은 유지됩니다.');}
  studioApi('legacy-worklogs').then(r=>{if(active)setRecords(r.records);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[userId,ready]);
 async function save(){setBusy(true);setError('');try{for(const i of selected)await studioApi('legacy-worklogs','POST',{log:local[i]});setRecords((await studioApi('legacy-worklogs')).records);setSelected([]);}catch(e){setError(e instanceof Error?e.message:'보관 실패');}finally{setBusy(false);}}
 return <details className={panel}><summary className="cursor-pointer font-bold">이전 PC 업무일지 보존·조회</summary>
  <p className="text-sm my-2">본인 작성 기록만 선택해 중앙에 보관합니다. 당시 결재 표시는 원본 기록이며 현재 서버에서 재승인된 결과가 아닙니다. 현재 업무일지·공정률은 변경하지 않습니다.</p>
  {local.map((log,i)=><label key={i} className="block"><input type="checkbox" checked={selected.includes(i)} disabled={busy} onChange={e=>setSelected(v=>e.target.checked?[...v,i]:v.filter(x=>x!==i))}/> {log.date} · {log.userName} · 당시 상태 {statusLabel(log.approvalStatus)}</label>)}
  {!local.length&&<p className="text-sm">이 PC에서 보존할 본인 기존 기록이 없습니다.</p>}
  <button className="my-2 border rounded px-3 py-1 disabled:opacity-50" disabled={!ready||busy||!selected.length} onClick={()=>void save()}>선택 {selected.length}건 원본 보관</button>
  <p className="font-bold">중앙 보관 {records.length}건 · 읽기 전용</p>
  {records.map(({id,source})=><details key={id} className="border-t mt-2 pt-2"><summary>{source.date} · {source.userName} · 당시 상태 {statusLabel(source.approvalStatus)}</summary>{source.items.map((item,i)=><div key={i} className="whitespace-pre-wrap my-2"><strong>{item.projectName} · {item.roleName}</strong><p>{item.todayTask}</p><p>진척률 {item.progress}% · 다음 업무 {item.tomorrowPlan}</p><p>{item.notes}</p></div>)}<p className="whitespace-pre-wrap">{source.overallNotes}</p></details>)}
  {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
 </details>;
}
