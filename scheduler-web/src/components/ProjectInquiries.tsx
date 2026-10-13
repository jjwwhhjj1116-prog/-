import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {FileQuestion,Plus,Save,Upload,Download,Undo2,Redo2,ImagePlus,Copy,X,Search,Send} from 'lucide-react';
import {useAuthStore} from '../store/useAuthStore';
import {useProjectStore,TEAM_ROLES,type Department} from '../store/useProjectStore';
import {useStudioStore} from '../store/useStudioStore';
import {studioApi} from '../services/studioApi';
import {readInquiryExcel,downloadInquiryExcel} from '../services/inquiryExcel';
import type {Inquiry,InquiryImage,InquiryImportResult} from '../types/inquiries';
import {readInquiryDraft,writeInquiryDraft,type InquiryDraft} from '../utils/inquiryDrafts';
import {canManageSchedule} from '../utils/schedulePermissions';
import {assignmentAliases,assignmentSegments,taskAssignedTo} from '../utils/personalWork';
import {decodeTsv,encodeTsv,inquiryClipboardMime,parseCopiedInquiryRows} from '../utils/inquiryClipboard';

const columns=[['no','No'],['classification','구분'],['drawingNumbers','관련 도면'],['question','질의사항'],['answer','산출사항 / 답변'],['review','검토사항'],['notes','비고']] as const;
type Field=typeof columns[number][0];
type Position={row:number;column:number};
type Response={inquiries:Inquiry[];capabilities:{canCreate:boolean;canManage:boolean}};
const styles='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const valueOf=(row:Inquiry,field:Field)=>field==='drawingNumbers'?row.drawingNumbers.join('\n'):row[field];
const emptyRow=(projectId:string,department:Department,trade:string,no:string,actorId:string,name:string):Inquiry=>({id:crypto.randomUUID(),projectId,department,trade,no,classification:'',group:'1차 질의사항',drawingNumbers:[],question:'',answer:'',review:'',notes:'',images:[],status:'DRAFT',authorId:actorId,authorName:name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:0});
const imageField=(field:Field):InquiryImage['field']=>field==='answer'||field==='review'?field:'question';
const contentFields=['no','trade','classification','group','drawingNumbers','question','answer','review','notes','images','sourceSheet','sourceRow','excelLayout'] as const;
const changed=(row:Inquiry,base:Inquiry|undefined)=>!base||contentFields.some(field=>JSON.stringify(row[field])!==JSON.stringify(base[field]));

async function prepareImage(file:File):Promise<InquiryImage>{
 if(!['image/png','image/jpeg'].includes(file.type))throw new Error('PNG 또는 JPG 사진을 사용하세요.');
 if(file.size>20*1024*1024)throw new Error('사진 한 장은 20MB 이하로 선택하세요.');
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,3200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('사진 편집을 시작하지 못했습니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const lossless=canvas.toDataURL('image/png');
  const name=(file.name||'붙여넣은 도면').replace(/\.[^.]*$/,'');
  if(lossless.length<=700000)return {id:crypto.randomUUID(),name:name+'.png',mimeType:'image/png',dataUrl:lossless,field:'question'};
  let dataUrl=canvas.toDataURL('image/jpeg',.9);
  for(let quality=.8;dataUrl.length>700000&&quality>=.4;quality-=.1)dataUrl=canvas.toDataURL('image/jpeg',quality);
  if(dataUrl.length>700000)throw new Error('사진의 필요한 영역만 잘라 다시 붙여넣어 주세요.');
  return {id:crypto.randomUUID(),name:name+'.jpg',mimeType:'image/jpeg',dataUrl,field:'question'};
 }finally{bitmap.close();}
}
async function copyImage(image:InquiryImage){
 const blob=await(await fetch(image.dataUrl)).blob();const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
 try{canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진 복사 실패')),'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);}finally{bitmap.close();}
}

export function ProjectInquiries({department,initialProjectId,initialTrade,visible=true}:{department:Department;initialProjectId?:string;initialTrade?:string;visible?:boolean}){
 const projects=useProjectStore(s=>s.projects),actor=useAuthStore(s=>s.currentUser),users=useAuthStore(s=>s.users),studio=useStudioStore();
 const actorId=actor?.id||'';
 const teamProjects=useMemo(()=>{const aliases=assignmentAliases(actor,users||[]);return projects.filter(p=>p.department===department&&(canManageSchedule(actor,department)||Object.values({...p.roles,...p.subTasks}).some(task=>task&&assignmentSegments(task,p.startDate,p.endDate).some(segment=>taskAssignedTo(segment,actorId,aliases)))));},[projects,department,actor,actorId,users]);
 const [projectId,setProjectId]=useState(initialProjectId||teamProjects[0]?.id||'');
 const project=teamProjects.find(p=>p.id===projectId);
 const [trade,setTrade]=useState(initialTrade&&initialTrade!=='PM'?initialTrade:TEAM_ROLES[department].find(x=>x!=='PM')||'기타');
 const [search,setSearch]=useState(''),[draft,setDraft]=useState<InquiryDraft>({rows:[],unassignedImages:[],updatedAt:0});
 const [remote,setRemote]=useState<Inquiry[]>([]),[capabilities,setCap]=useState({canCreate:false,canManage:false});
 const [loadedKey,setLoadedKey]=useState('');
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<InquiryImportResult|null>(null),[lightbox,setLightbox]=useState<InquiryImage|null>(null);
 const [selection,setSelection]=useState<{start:Position;end:Position}>({start:{row:0,column:3},end:{row:0,column:3}});
 const [historyVersion,setHistoryVersion]=useState(0);
 const history=useRef<{past:InquiryDraft[];future:InquiryDraft[];lastKey:string;lastAt:number}>({past:[],future:[],lastKey:'',lastAt:0});
 const value=useRef(draft),base=useRef(remote),keyRef=useRef(''),busyRef=useRef(false),saveEpoch=useRef(0);
 const upload=useRef<HTMLInputElement>(null),photoUpload=useRef<HTMLInputElement>(null),grid=useRef<HTMLDivElement>(null);
 const key=`${actorId}:${department}:${projectId}`,contextReady=ready&&loadedKey===key;
 const activeDraft=loadedKey===key?draft:{rows:[],unassignedImages:[],updatedAt:0};
 const cap=loadedKey===key?capabilities:{canCreate:false,canManage:false};
 keyRef.current=key;value.current=activeDraft;base.current=loadedKey===key?remote:[];busyRef.current=busy;
 const current=useCallback((captured:string)=>keyRef.current===captured&&useAuthStore.getState().currentUser?.id===actorId,[actorId]);
 const editable=(row:Inquiry)=>cap.canManage||cap.canCreate&&row.authorId===actorId;
 const shown=activeDraft.rows.filter(row=>row.department===department&&row.trade===trade);
 const dirty=activeDraft.rows.filter(row=>editable(row)&&changed(row,remote.find(old=>old.id===row.id)));
 const trades=[...new Set([...TEAM_ROLES[department].filter(x=>x!=='PM'),...activeDraft.rows.filter(x=>x.department===department).map(x=>x.trade)])];
 const apply=(next:InquiryDraft,editKey='',internal=false)=>{
  if(loadedKey!==key||busyRef.current&&!internal)return;saveEpoch.current++;
  const h=history.current,now=Date.now();if(!editKey||h.lastKey!==editKey||now-h.lastAt>900){h.past.push(value.current);if(h.past.length>50)h.past.shift();}
  h.future=[];h.lastKey=editKey;h.lastAt=now;value.current={...next,updatedAt:now};setDraft(value.current);setHistoryVersion(x=>x+1);setError('');
 };
 const changeCell=(id:string,field:Field,text:string)=>apply({...value.current,rows:value.current.rows.map(row=>row.id===id?{...row,[field]:field==='drawingNumbers'?text.split(/\r?\n/).filter(Boolean):text}:row)},`${id}:${field}`);
 const travel=(undo:boolean)=>{
  if(busyRef.current||loadedKey!==key)return;saveEpoch.current++;
  const h=history.current,from=undo?h.past:h.future,to=undo?h.future:h.past,next=from.pop();if(!next)return;
  to.push(value.current);h.lastKey='';
  const rows=next.rows.map(row=>{const saved=base.current.find(x=>x.id===row.id);return saved?{...row,revision:saved.revision,status:saved.status,authorId:saved.authorId,authorName:saved.authorName,createdAt:saved.createdAt,updatedAt:saved.updatedAt,registeredAt:saved.registeredAt}:row;});
  for(const saved of base.current)if(!rows.some(row=>row.id===saved.id))rows.push(saved);
  value.current={...next,rows,updatedAt:Date.now()};setDraft(value.current);setHistoryVersion(x=>x+1);
 };
 useEffect(()=>{
  const captured=key;let cancelled=false;saveEpoch.current++;busyRef.current=false;setBusy(false);setReady(false);setLoadedKey('');setCap({canCreate:false,canManage:false});setDraft({rows:[],unassignedImages:[],updatedAt:0});setRemote([]);setPreview(null);setLightbox(null);setError('');setNotice('');history.current={past:[],future:[],lastKey:'',lastAt:0};
  if(!actorId||!projectId||!studio.ready)return;
  void Promise.all([studioApi<Response>(`inquiries?projectId=${encodeURIComponent(projectId)}`),readInquiryDraft(captured).catch(()=>undefined)]).then(([response,local])=>{
   if(!current(captured)||cancelled)return;
   const localRows=local?.rows.filter(row=>row.projectId===projectId&&row.department===department&&(row.authorId===actorId||response.capabilities.canManage))||[];
   const rows=response.inquiries.map(row=>{const localRow=localRows.find(x=>x.id===row.id),localBase=local?.baseRows?.find(x=>x.id===row.id);return localRow&&changed(localRow,localBase||row)?localRow:row;});
   for(const row of localRows)if(!rows.some(x=>x.id===row.id))rows.push(row);
   setRemote(response.inquiries);setCap(response.capabilities);setDraft({rows,unassignedImages:local?.unassignedImages||[],retainedRows:local?.retainedRows?.filter(row=>row.projectId===projectId&&row.department===department&&(row.authorId===actorId||response.capabilities.canManage)),updatedAt:Date.now()});setLoadedKey(captured);setReady(true);
  }).catch(e=>{if(current(captured)&&!cancelled)setError(e.message);});
  return()=>{cancelled=true;};
 },[key,studio.ready,actorId,projectId,department,current]);
 useEffect(()=>{if(contextReady&&actorId){const captured=key;void writeInquiryDraft(captured,{...draft,baseRows:remote}).catch(()=>{if(current(captured))setError('이 브라우저에 임시 보관하지 못했습니다. 중앙 임시 저장 또는 엑셀 내보내기로 보관하세요.');});}},[draft,remote,contextReady,key,loadedKey,actorId,current]);
 useEffect(()=>{
  if(!visible||!contextReady)return;const captured=key;
  const timer=setInterval(()=>{if(busyRef.current||!current(captured))return;const epoch=saveEpoch.current;void studioApi<Response>(`inquiries?projectId=${encodeURIComponent(projectId)}`).then(response=>{
   if(!current(captured)||busyRef.current||epoch!==saveEpoch.current)return;const old=base.current;
   setDraft(state=>({...state,rows:[...state.rows.map(row=>{const previous=old.find(x=>x.id===row.id),next=response.inquiries.find(x=>x.id===row.id);return next&&!changed(row,previous)?next:row;}),...response.inquiries.filter(row=>!state.rows.some(x=>x.id===row.id))]}));
   setRemote(response.inquiries);setCap(response.capabilities);
  }).catch(e=>{if(current(captured))setError(e.message);});},8000);return()=>clearInterval(timer);
 },[visible,contextReady,key,projectId,current]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty.length]);
 useEffect(()=>{if(initialProjectId)setProjectId(initialProjectId);if(initialTrade&&initialTrade!=='PM')setTrade(initialTrade);},[initialProjectId,initialTrade]);
 useEffect(()=>{if(!teamProjects.some(p=>p.id===projectId))setProjectId(teamProjects[0]?.id||'');},[projectId,teamProjects]);

 const selectImport=(result:InquiryImportResult):InquiryImportResult=>{
  const inquiries=result.inquiries.filter(row=>row.department===department&&row.projectId===projectId),sheets=new Set(inquiries.map(row=>row.sourceSheet));
  const skipped=result.inquiries.length-inquiries.length;
  return {...result,inquiries,unassignedImages:result.unassignedImages.filter(image=>sheets.has(image.sourceSheet)||image.sourceSheet.includes(department.replace('팀',''))),warnings:[...result.warnings,...(skipped?[`다른 팀 질의 ${skipped}개는 해당 팀에서 별도로 불러오세요.`]:[])]};
 };
 const latest=()=>{
  const retainedRows=value.current.rows.filter(row=>editable(row)&&row.revision>0&&changed(row,base.current.find(old=>old.id===row.id)));
  apply({...value.current,retainedRows:[...(value.current.retainedRows||[]),...retainedRows],rows:[...base.current,...value.current.rows.filter(row=>!row.revision)]});setNotice('중앙 최신본으로 표시했습니다. 수정 중이던 입력은 보관 입력에서 다시 볼 수 있습니다.');
 };

 async function persist(register:boolean){
  const captured=key;if(!contextReady||busy||!current(captured))return;saveEpoch.current++;
  const targets=register?value.current.rows.filter(row=>row.department===department&&row.projectId===projectId&&row.trade===trade&&editable(row)&&(changed(row,base.current.find(x=>x.id===row.id))||row.status==='DRAFT')):dirty.filter(row=>row.department===department&&row.projectId===projectId);
  if(!targets.length){setNotice('저장할 변경이 없습니다.');return;}
  if(register&&targets.some(row=>!row.question.trim()&&!row.images.some(image=>image.field==='question'))){setError('등록할 항목의 질의사항 또는 질의 사진을 입력하세요.');return;}
  busyRef.current=true;setBusy(true);setError('');let completed=0,stored=0;
  try{for(const row of targets){
   if(!current(captured))throw new Error('계정이나 프로젝트가 변경되어 저장을 중단했습니다.');
   if(row.images.length>4||row.images.reduce((sum,image)=>sum+(image.dataUrl.split(',')[1]?.length||0)*.75,0)>1024*1024)throw new Error(`${row.no}번 사진이 저장 한도를 초과합니다. 필요한 영역만 잘라 다시 첨부하세요.`);
   let saved=row;
   const accept=(saved:Inquiry)=>{if(!current(captured))return;base.current=[...base.current.filter(old=>old.id!==saved.id),saved];setRemote(base.current);value.current={...value.current,rows:value.current.rows.map(old=>old.id===saved.id?saved:old),updatedAt:Date.now()};setDraft(value.current);};
   if(changed(row,base.current.find(x=>x.id===row.id))){const response=await studioApi<{inquiry:Inquiry}>(`inquiries/${encodeURIComponent(row.id)}`,'PUT',{inquiry:row,revision:row.revision,actorId});saved=response.inquiry;accept(saved);stored++;}
   if(register&&saved.status==='DRAFT'){const response=await studioApi<{inquiry:Inquiry}>(`inquiries/${encodeURIComponent(saved.id)}/register`,'POST',{revision:saved.revision,actorId});saved=response.inquiry;}
   if(!current(captured))return;
   accept(saved);completed++;
  }setNotice(`${completed}개 질의사항 ${register?'등록':'임시 저장'} 완료`);}catch(e){if(current(captured))setError(`${stored?`${stored}개 임시 저장 완료. `:''}${completed&&register?`${completed}개 등록 완료. `:''}${e instanceof Error?e.message:'저장 실패'} 입력은 유지됩니다.`);}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 async function addPhotos(files:File[],rowId:string,field:Field){
  const captured=key,row=value.current.rows.find(x=>x.id===rowId);if(!row||!editable(row)||busy||!contextReady)return;saveEpoch.current++;
  if(row.images.length+files.length>4){setError('한 질의사항에는 사진을 4장까지 첨부할 수 있습니다.');return;}
  busyRef.current=true;setBusy(true);try{const images=await Promise.all(files.map(prepareImage));if(current(captured))apply({...value.current,rows:value.current.rows.map(x=>x.id===rowId?{...x,images:[...x.images,...images.map(image=>({...image,field:imageField(field)}))]}:x)},'',true);}
  catch(e){if(current(captured))setError(e instanceof Error?e.message:'사진 추가 실패');}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 const addRow=()=>{const row=emptyRow(projectId,department,trade,String(shown.length+1),actorId,actor?.name||'');apply({...value.current,rows:[...value.current.rows,row]});setSelection({start:{row:shown.length,column:3},end:{row:shown.length,column:3}});};
 const selectedRows=()=>shown.slice(Math.min(selection.start.row,selection.end.row),Math.max(selection.start.row,selection.end.row)+1);
 const copyCells=(event:React.ClipboardEvent)=>{
  const target=event.target;if(target instanceof HTMLTextAreaElement&&target.selectionStart!==target.selectionEnd)return;
  const from=Math.min(selection.start.column,selection.end.column),to=Math.max(selection.start.column,selection.end.column);
  const rows=selectedRows();if(!rows.length)return;event.preventDefault();const cells=rows.map(row=>columns.slice(from,to+1).map(([field])=>valueOf(row,field)));
  event.clipboardData.setData('text/plain',rows.length===1&&from===to?cells[0][0]:encodeTsv(cells));
  if(rows.length>1||from!==to)event.clipboardData.setData('application/x-concost-inquiry-cells','table');
  if(from===0&&to===columns.length-1)event.clipboardData.setData(inquiryClipboardMime,JSON.stringify(rows));
 };
 const paste=(event:React.ClipboardEvent)=>{
  if(!cap.canCreate||busy||!contextReady)return;
  const copied=event.clipboardData.getData(inquiryClipboardMime);
  if(copied){event.preventDefault();try{const rows=parseCopiedInquiryRows(copied,{projectId,department,trade,authorId:actorId,authorName:actor?.name||''});apply({...value.current,rows:[...value.current.rows,...rows]});setNotice(`사진을 포함한 ${rows.length}개 행을 새 초안으로 붙여넣었습니다.`);}catch(e){setError(e instanceof Error?e.message:'질의 붙여넣기 실패');}return;}
  const row=shown[selection.end.row],field=columns[selection.end.column]?.[0]||'question';if(!row||!editable(row))return;
  const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();void addPhotos(files,row.id,field);return;}
  const text=event.clipboardData.getData('text/plain');if(!text.includes('\t')&&!event.clipboardData.getData('application/x-concost-inquiry-cells'))return;
  event.preventDefault();let cells:string[][];try{cells=decodeTsv(text);}catch(e){setError(e instanceof Error?e.message:'표 붙여넣기 실패');return;}
  let next=[...value.current.rows];const local=[...shown];
  for(let r=0;r<cells.length;r++){let target=local[selection.end.row+r];if(!target){target=emptyRow(projectId,department,trade,String(local.length+1),actorId,actor?.name||'');local.push(target);next.push(target);}if(!editable(target))continue;
   const changed={...target};for(let c=0;c<cells[r].length&&selection.end.column+c<columns.length;c++){const field=columns[selection.end.column+c][0];if(field==='drawingNumbers')changed.drawingNumbers=cells[r][c].split(/\r?\n/).filter(Boolean);else changed[field]=cells[r][c];}next=next.map(x=>x.id===target.id?changed:x);
  }apply({...value.current,rows:next});
 };
 if(!actor||!studio.ready)return <p role="status" className="p-6">중앙 서버에 로그인한 뒤 프로젝트 질의사항을 확인하세요.</p>;
 return <div className="text-slate-900 dark:text-slate-100">
  <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><FileQuestion size={24}/>{department} 프로젝트 질의사항</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">프로젝트와 공종을 선택하고 도면 질의·답변·검토 내용을 작성합니다.</p></div><span className="text-sm text-slate-600 dark:text-slate-300">{dirty.length?`미저장 ${dirty.length}개`:'중앙 자료 확인'} · 등록 후 팀 공유</span></header>
  <div className="grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
   <aside className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><label className="mb-3 flex items-center gap-2"><Search size={16}/><input className={`${styles} min-w-0 w-full`} aria-label="질의 프로젝트 검색" placeholder="프로젝트 검색" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="max-h-[65vh] space-y-1 overflow-y-auto">{teamProjects.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())).map(p=><button key={p.id} disabled={busy} aria-pressed={projectId===p.id} onClick={()=>setProjectId(p.id)} className={`w-full rounded-lg p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${projectId===p.id?'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100':'hover:bg-slate-50 dark:hover:bg-slate-800'}`}><span className="block text-xs text-slate-600 dark:text-slate-300">{p.code}</span><span className="mt-1 block font-semibold">{p.name}</span></button>)}</div>{!teamProjects.length&&<p className="p-3 text-sm">등록된 팀 프로젝트가 없습니다.</p>}</aside>
   <section className="min-w-0 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <div className="border-b border-slate-200 p-4 dark:border-slate-700"><h3 className="text-base font-bold">{project?.name||'프로젝트를 선택하세요'}</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{project?.code} · {department}</p></div>
    <div role="tablist" aria-label="질의사항 공종" className="flex overflow-x-auto border-b border-slate-200 px-3 dark:border-slate-700">{trades.map(name=><button key={name} role="tab" disabled={busy} aria-selected={trade===name} onClick={()=>{setTrade(name);setSelection({start:{row:0,column:3},end:{row:0,column:3}});}} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${trade===name?'border-blue-700 text-blue-800 dark:border-blue-400 dark:text-blue-200':'border-transparent text-slate-600 dark:text-slate-300'}`}>{name} <span className="ml-1 text-xs">{activeDraft.rows.filter(row=>row.trade===name).length}</span></button>)}</div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
     <button className={styles} disabled={!contextReady||!cap.canCreate||busy} onClick={addRow}><Plus size={15} className="mr-1 inline"/>질의 추가</button>
     <button className={styles} disabled={!contextReady||!cap.canCreate||busy} onClick={()=>upload.current?.click()}><Upload size={15} className="mr-1 inline"/>엑셀 불러오기</button>
     <button className={styles} disabled={!contextReady||!activeDraft.rows.length||busy} onClick={()=>{void downloadInquiryExcel(activeDraft.rows,{projectName:project?.name||'',department,unassignedImages:activeDraft.unassignedImages}).catch(e=>setError(e.message));}}><Download size={15} className="mr-1 inline"/>엑셀 내보내기</button>
     <button className={styles} aria-label="되돌리기 Ctrl+Z" disabled={!history.current.past.length||busy} onClick={()=>travel(true)}><Undo2 size={16}/></button><button className={styles} aria-label="다시 실행 Ctrl+Y" disabled={!history.current.future.length||busy} onClick={()=>travel(false)}><Redo2 size={16}/></button>
     <button className={styles} disabled={!contextReady||!cap.canCreate||busy||!shown.length} onClick={()=>photoUpload.current?.click()}><ImagePlus size={15} className="mr-1 inline"/>선택한 칸에 사진</button>
     <div className="ml-auto flex gap-2"><button className={styles} disabled={!dirty.length||busy} onClick={()=>void persist(false)}><Save size={15} className="mr-1 inline"/>임시 저장</button><button className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50" disabled={!cap.canCreate||busy||!shown.length} onClick={()=>void persist(true)}><Send size={15} className="mr-1 inline"/>{busy?'처리 중':'현재 공종 등록'}</button></div>
    </div>
    {!!dirty.some(row=>row.revision>0&&remote.some(old=>old.id===row.id&&old.revision!==row.revision))&&<div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"><span>다른 PC에서 변경된 항목이 있습니다. 입력을 보관한 뒤 최신 자료와 비교하세요.</span><button className={styles} disabled={busy} onClick={latest}>중앙 최신본 보기</button></div>}
    {!!activeDraft.retainedRows?.length&&<details className="border-b border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">보관 입력 {activeDraft.retainedRows.length}개 · 변경 내용 비교</summary>{activeDraft.retainedRows.map((row,index)=><article key={`${row.id}:${index}`} className="my-2 rounded border border-slate-300 p-3 text-sm dark:border-slate-600"><p className="font-semibold">{row.no} · {row.trade} · {row.group}</p><p className="my-2 whitespace-pre-wrap">{row.question}</p>{row.images.map(image=><img key={image.id} src={image.dataUrl} alt={image.caption||image.name} className="max-h-40 object-contain"/>)}<button className={styles} disabled={busy||!cap.canCreate} onClick={()=>{const saved=remote.find(old=>old.id===row.id);if(!saved)return;apply({...value.current,rows:value.current.rows.map(old=>old.id===row.id?{...row,revision:saved.revision,status:saved.status,updatedAt:saved.updatedAt}:old)});setNotice('보관 입력을 최신 항목에 가져왔습니다. 비교 후 저장하세요.');}}>이 입력 가져오기</button></article>)}</details>}
    {error&&<p role="alert" className="m-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}{notice&&<p role="status" className="px-4 py-2 text-sm text-blue-800 dark:text-blue-200">{notice}</p>}
    {!contextReady&&<p role="status" className="p-5">{error?'연결을 확인한 뒤 다시 열어 주세요.':'질의사항 확인 중…'}</p>}
    <p className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">셀을 클릭해 작성 · Shift+클릭으로 범위 선택 · Ctrl+C/V 복사·붙여넣기 · Ctrl+Z 되돌리기 · 도면 사진은 붙여넣거나 끌어 넣으세요.</p>
    <div ref={grid} role="region" aria-label={`${trade} 질의 편집표`} tabIndex={0} className="max-h-[70vh] overflow-auto focus-visible:outline-2 focus-visible:outline-blue-600" onCopy={copyCells} onPaste={paste} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(!event.shiftKey);}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();travel(false);}}}>
     <table className="w-full min-w-[1050px] table-fixed border-collapse text-sm"><colgroup><col className="w-[55px]"/><col className="w-[110px]"/><col className="w-[115px]"/><col/><col/><col/><col className="w-[145px]"/></colgroup><thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800"><tr>{columns.map(([field,label])=><th key={field} className="border border-slate-300 p-2 text-left font-semibold dark:border-slate-600">{label}</th>)}</tr></thead><tbody>
      {shown.map((row,rowIndex)=><tr key={row.id}>{columns.map(([field,label],columnIndex)=>{
       const selected=rowIndex>=Math.min(selection.start.row,selection.end.row)&&rowIndex<=Math.max(selection.start.row,selection.end.row)&&columnIndex>=Math.min(selection.start.column,selection.end.column)&&columnIndex<=Math.max(selection.start.column,selection.end.column);
       const pictures=row.images.filter(image=>image.field===field);
       return <td key={field} className={`align-top border border-slate-300 p-2 dark:border-slate-600 ${selected?'bg-blue-50 dark:bg-blue-950/50':''}`} onMouseDown={event=>{setSelection(previous=>({start:event.shiftKey?previous.start:{row:rowIndex,column:columnIndex},end:{row:rowIndex,column:columnIndex}}));}} onDragOver={e=>{if(editable(row))e.preventDefault();}} onDrop={e=>{if(editable(row)&&e.dataTransfer.files.length){e.preventDefault();void addPhotos(Array.from(e.dataTransfer.files),row.id,field);}}}>
        {field==='no'&&<div className="mb-2 flex flex-col gap-1"><span className={`text-[10px] font-semibold ${row.status==='REGISTERED'?'text-blue-800 dark:text-blue-200':'text-amber-900 dark:text-amber-200'}`}>{row.status==='REGISTERED'?'등록됨':'작성 중'}</span>{!row.revision&&editable(row)&&<button aria-label={`${row.no}번 미등록 행 제거`} disabled={busy} className="self-start text-slate-500 hover:text-rose-600" onClick={()=>apply({...value.current,rows:value.current.rows.filter(x=>x.id!==row.id)})}><X size={13}/></button>}</div>}
        <textarea aria-label={`${row.no}번 ${label}`} readOnly={!editable(row)||busy} value={valueOf(row,field)} rows={field==='no'?1:3} className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400" placeholder={field==='question'?'질의내용을 입력하거나 사진을 붙여넣으세요.':''} onFocus={()=>setSelection(previous=>previous.end.row===rowIndex&&previous.end.column===columnIndex?previous:{start:{row:rowIndex,column:columnIndex},end:{row:rowIndex,column:columnIndex}})} onChange={e=>changeCell(row.id,field,e.target.value)}/>
        {field==='classification'&&<label className="mt-2 block text-[10px] text-slate-600 dark:text-slate-300">질의 차수<input aria-label={`${row.no}번 질의 차수`} readOnly={!editable(row)||busy} value={row.group} className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 text-xs dark:border-slate-600" onChange={e=>apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,group:e.target.value}:x)},`${row.id}:group`)}/></label>}
        {pictures.map(image=><figure key={image.id} tabIndex={0} className="mt-2 rounded border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-800" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();e.stopPropagation();void copyImage(image).then(()=>setNotice('사진을 복사했습니다.')).catch(()=>setError('브라우저의 클립보드 권한을 확인하세요.'));}}}><button className="block w-full" aria-label={`${image.name} 크게 보기`} onClick={()=>setLightbox(image)}><img src={image.dataUrl} alt={image.caption||image.name} className="max-h-[280px] w-full object-contain"/></button><div className="flex gap-1"><button aria-label={`${image.name} 사진 복사`} className="rounded p-1" onClick={()=>{void copyImage(image).then(()=>setNotice('사진을 복사했습니다.')).catch(()=>setError('브라우저의 클립보드 권한을 확인하세요.'));}}><Copy size={13}/></button>{editable(row)&&<button aria-label={`${image.name} 사진 제거`} disabled={busy} className="rounded p-1 text-rose-700 dark:text-rose-300" onClick={()=>apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,images:x.images.filter(i=>i.id!==image.id)}:x)})}><X size={13}/></button>}</div><input aria-label={`${image.name} 사진 설명`} readOnly={!editable(row)||busy} value={image.caption||''} placeholder="사진 설명" className="w-full bg-transparent p-1 text-xs" onChange={e=>apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,images:x.images.map(i=>i.id===image.id?{...i,caption:e.target.value}:i)}:x)},`${row.id}:image:${image.id}`)}/></figure>)}
        {field==='notes'&&<p className="mt-2 text-[10px] text-slate-600 dark:text-slate-300">{row.authorName}{row.sourceSheet?` · ${row.sourceSheet}`:''}</p>}
       </td>;})}</tr>)}
      {!shown.length&&<tr><td colSpan={columns.length} className="p-10 text-center text-slate-600 dark:text-slate-300">{trade} 질의사항이 없습니다. {cap.canCreate?'질의 추가 또는 엑셀 불러오기로 시작하세요.':'이 프로젝트에 배정된 직원이 질의사항을 등록합니다.'}</td></tr>}
     </tbody></table>
    </div>
    {!!activeDraft.unassignedImages.length&&<details className="border-t border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">원본 표 밖의 사진 {activeDraft.unassignedImages.length}개 · 연결 확인</summary><p className="my-2 text-xs text-slate-600 dark:text-slate-300">원본에서 질의 행과 연결되지 않은 사진입니다. 자동 귀속하지 않으며 엑셀 내보내기에 보존합니다. 선택한 셀의 질의사항에 연결할 수 있습니다.</p><div className="grid max-h-[400px] grid-cols-2 gap-3 overflow-auto xl:grid-cols-4">{activeDraft.unassignedImages.map(image=><figure key={image.id} className="rounded border border-slate-300 p-2 dark:border-slate-600"><img src={image.dataUrl} alt={image.name} className="h-28 w-full object-contain"/><figcaption className="my-1 text-xs">{image.sourceSheet} · 원본 {image.sourceRow}행</figcaption><button className={styles} disabled={!shown[selection.end.row]||!cap.canCreate||busy} onClick={()=>{const row=shown[selection.end.row];if(!row||!editable(row)||row.images.length>=4){setError('연결할 질의 행을 선택하고 사진 개수를 확인하세요.');return;}apply({...value.current,unassignedImages:value.current.unassignedImages.filter(x=>x.id!==image.id),rows:value.current.rows.map(x=>x.id===row.id?{...x,images:[...x.images,{...image,field:imageField(columns[selection.end.column][0]),sourceAnchor:undefined}]}:x)});}}>선택한 질의에 연결</button></figure>)}</div></details>}
   </section>
  </div>
  <input ref={upload} type="file" accept=".xlsx" className="hidden" aria-label="질의사항 엑셀 파일" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!contextReady||busy)return;const captured=key;saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');void file.arrayBuffer().then(buffer=>readInquiryExcel(buffer,{projectId,department,authorId:actorId,authorName:actor.name})).then(result=>{if(current(captured))setPreview(selectImport(result));}).catch(e=>{if(current(captured))setError(e.message);}).finally(()=>{if(current(captured)){busyRef.current=false;setBusy(false);}});}}/>
  <input ref={photoUpload} type="file" accept="image/png,image/jpeg" multiple className="hidden" aria-label="질의사항 사진 파일" onChange={event=>{const row=shown[selection.end.row],files=Array.from(event.target.files||[]);event.target.value='';if(row)void addPhotos(files,row.id,columns[selection.end.column][0]);}}/>
  {preview&&contextReady&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="질의사항 엑셀 불러오기 확인" className="relative max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 text-slate-900 dark:bg-slate-900 dark:text-slate-100"><button aria-label="엑셀 불러오기 확인 닫기" className="absolute right-4 top-4 rounded p-2" onClick={()=>setPreview(null)}><X size={20}/></button><h3 className="pr-10 text-lg font-bold">{department} 질의사항 불러오기</h3><p className="mt-3 text-sm">대상: {project?.code} · {project?.name}</p><p className="my-3 text-sm">질의 {preview.inquiries.length}개 · 연결 사진 {preview.inquiries.reduce((n,row)=>n+row.images.length,0)}개 · 표 밖 사진 {preview.unassignedImages.length}개</p><p className="text-sm">이 내용을 선택한 프로젝트에 추가합니다. 원본 파일은 수정하지 않습니다.</p><ul className="my-4 max-h-44 overflow-auto text-sm">{preview.inquiries.slice(0,8).map(row=><li key={row.id} className="border-b border-slate-200 py-2 dark:border-slate-700">{row.no} · {row.trade} · {row.question.slice(0,100)}</li>)}</ul>{preview.warnings.map((warning,index)=><p key={index} className="mt-2 text-sm text-amber-900 dark:text-amber-200">{warning}</p>)}<div className="mt-5 flex justify-end gap-2"><button className={styles} onClick={()=>setPreview(null)}>취소</button><button className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white" onClick={()=>{const selected=selectImport(preview);apply({...value.current,rows:[...value.current.rows,...selected.inquiries],unassignedImages:[...value.current.unassignedImages,...selected.unassignedImages]});setTrade(selected.inquiries[0]?.trade||trade);setPreview(null);setNotice('브라우저에 불러왔습니다. 확인 후 임시 저장 또는 등록하세요.');}}>현재 프로젝트에 불러오기</button></div></section></div>}
  {lightbox&&contextReady&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" onClick={()=>setLightbox(null)}><section role="dialog" aria-modal="true" aria-label="질의 도면 사진" className="relative max-h-[95vh] max-w-[95vw] overflow-auto bg-white p-3" onClick={event=>event.stopPropagation()}><button aria-label="도면 사진 닫기" className="sticky right-0 top-0 ml-auto block rounded bg-white p-2 text-slate-900" onClick={()=>setLightbox(null)}><X size={22}/></button><img src={lightbox.dataUrl} alt={lightbox.caption||lightbox.name} className="max-w-none"/><p className="text-sm text-slate-900">{lightbox.caption||lightbox.name}</p></section></div>}
  <span hidden>{historyVersion}</span>
 </div>;
}
