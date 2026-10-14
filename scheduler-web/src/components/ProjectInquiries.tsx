import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {FileQuestion,Plus,Save,Upload,Download,Undo2,Redo2,ImagePlus,Copy,X,Search,Send,Pencil,Trash2,RotateCcw,Languages} from 'lucide-react';
import {useAuthStore} from '../store/useAuthStore';
import {useProjectStore,TEAM_ROLES,type Department} from '../store/useProjectStore';
import {useStudioStore} from '../store/useStudioStore';
import {studioApi} from '../services/studioApi';
import {readInquiryExcel,downloadInquiryExcel} from '../services/inquiryExcel';
import type {Inquiry,InquiryImage,InquiryImportResult,InquiryRound} from '../types/inquiries';
import {inquiryRoundNumber} from '../utils/inquiryRounds';
import {inquiryTranslationPreserves} from '../utils/inquiryTranslationSafety';
import {readInquiryDraft,writeInquiryDraft,type InquiryDraft} from '../utils/inquiryDrafts';
import {sameWorkProject,workProjectOptions} from '../utils/personalWork';
import {decodeTsv,encodeTsv,inquiryClipboardMime,parseCopiedInquiryRows} from '../utils/inquiryClipboard';

const columns=[['no','No'],['classification','구분'],['drawingNumbers','관련 도면'],['question','질의사항'],['answer','산출사항 / 답변'],['review','검토사항'],['notes','비고']] as const;
type Field=typeof columns[number][0];
type Position={row:number;column:number};
type Response={inquiries:Inquiry[];rounds?:InquiryRound[];capabilities:{canCreate:boolean;canManage:boolean;canEdit?:boolean}};
const koreanFields=[['classification','구분'],['question','질의사항'],['answer','산출사항 / 답변'],['review','검토사항'],['notes','비고']] as const;
type KoreanItem={id:string;revision:number;classification:string;question:string;answer:string;review:string;notes:string;imageCaptions:{id:string;caption:string}[]};
type KoreanPreview={key:string;roundNumber:number;trade:string;contextVersion?:number;rows:Inquiry[];baseRows:Inquiry[];items:KoreanItem[];scope:'ROUND'|'TRADE'};
type KoreanPiece={id:string;field:typeof koreanFields[number][0];imageId?:string;index:number;before:string;after:string};
type KoreanPlan={item:KoreanItem;pieces:KoreanPiece[]};
const koreanItem=(row:Inquiry):KoreanItem=>({id:row.id,revision:row.revision,classification:row.classification,question:row.question,answer:row.answer,review:row.review,notes:row.notes,imageCaptions:row.images.map(image=>({id:image.id,caption:image.caption||''}))});
const koreanPairs=(row:Inquiry,item:KoreanItem)=>[...koreanFields.map(([field,label])=>({label,original:row[field],translated:item[field]})),...row.images.map(image=>({label:`사진 설명 · ${image.name}`,original:image.caption||'',translated:item.imageCaptions.find(caption=>caption.id===image.id)!.caption}))].filter(pair=>pair.original!==pair.translated);
const koreanPieceKey=(piece:KoreanPiece)=>JSON.stringify([piece.id,piece.field,piece.imageId]);
const koreanValueSafe=(source:string,translated:string,max:number)=>translated.length<=max&&!/[\uD800-\uDFFF]/u.test(translated)&&(source.trim()?!!translated.trim():source===translated)&&inquiryTranslationPreserves(source,translated)&&source.match(/^\s*/)?.[0]===translated.match(/^\s*/)?.[0]&&source.match(/\s*$/)?.[0]===translated.match(/\s*$/)?.[0]&&JSON.stringify(source.match(/\r\n|\r|\n/g)||[])===JSON.stringify(translated.match(/\r\n|\r|\n/g)||[]);
const koreanItemSafe=(row:Inquiry,item:KoreanItem)=>koreanFields.every(([field])=>koreanValueSafe(row[field],item[field],field==='classification'?200:20000))&&row.images.every(image=>koreanValueSafe(image.caption||'',item.imageCaptions.find(caption=>caption.id===image.id)!.caption,1000));
function koreanRequests(rows:Inquiry[]):KoreanPlan[][]{
 const plans:KoreanPlan[]=[];
 for(const row of rows){
  const blank=():KoreanItem=>({...koreanItem(row),classification:'',question:'',answer:'',review:'',notes:'',imageCaptions:row.images.map(image=>({id:image.id,caption:''}))});
  let plan:KoreanPlan={item:blank(),pieces:[]},characters=0;
  const finish=()=>{if(plan.pieces.length)plans.push(plan);plan={item:blank(),pieces:[]};characters=0;};
  const add=(field:KoreanPiece['field'],text:string,imageId?:string)=>{
   let remaining=text,index=0,pending='',last:KoreanPiece|undefined;
   while(remaining){
    let end=Math.min(4000,remaining.length);
    if(end<remaining.length){const spaces=[...remaining.slice(0,end).matchAll(/\s/g)];if(spaces.length)end=spaces[spaces.length-1].index!+1;else if(/[\uD800-\uDBFF]/.test(remaining[end-1])&&/[\uDC00-\uDFFF]/.test(remaining[end]))end--;}
    const raw=remaining.slice(0,end);remaining=remaining.slice(end);const core=raw.trim();
    if(!core){pending+=raw;continue;}
    const before=pending+raw.slice(0,raw.indexOf(core)),after=raw.slice(raw.indexOf(core)+core.length);pending='';
    const occupied=imageId?plan.item.imageCaptions.find(image=>image.id===imageId)!.caption:plan.item[field];
    if(occupied||characters+core.length>12000)finish();
    if(imageId)plan.item.imageCaptions.find(image=>image.id===imageId)!.caption=core;else plan.item[field]=core;
    last={id:row.id,field,imageId,index:index++,before,after};plan.pieces.push(last);characters+=core.length;
   }
   if(last&&pending)last.after+=pending;
  };
  for(const [field] of koreanFields)add(field,row[field]);
  for(const image of row.images)add('notes',image.caption||'',image.id);
  finish();
 }
 const batches:KoreanPlan[][]=[];let batch:KoreanPlan[]=[],characters=0;
 for(const plan of plans){const count=koreanFields.reduce((sum,[field])=>sum+plan.item[field].length,0)+plan.item.imageCaptions.reduce((sum,image)=>sum+image.caption.length,0);if(batch.length&&(batch.length>=8||characters+count>12000||batch.some(old=>old.item.id===plan.item.id))){batches.push(batch);batch=[];characters=0;}batch.push(plan);characters+=count;}
 if(batch.length)batches.push(batch);return batches;
}
const styles='rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const valueOf=(row:Inquiry,field:Field)=>field==='drawingNumbers'?row.drawingNumbers.join('\n'):row[field];
const emptyRow=(projectId:string,department:Department,trade:string,no:string,actorId:string,name:string,roundNumber=1):Inquiry=>({id:crypto.randomUUID(),projectId,department,trade,no,classification:'',group:`${roundNumber}차 질의사항`,roundNumber,drawingNumbers:[],question:'',answer:'',review:'',notes:'',images:[],status:'DRAFT',authorId:actorId,authorName:name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:0});
const imageField=(field:Field):InquiryImage['field']=>field==='answer'||field==='review'?field:'question';
const contentFields=['no','trade','classification','group','roundNumber','drawingNumbers','question','answer','review','notes','images','sourceSheet','sourceRow','excelLayout'] as const;
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

export function ProjectInquiries({department,initialProjectId,initialProjectCode,initialContextVersion,initialTrade,visible=true,onDepartmentChange}:{department:Department;initialProjectId?:string;initialProjectCode?:string;initialContextVersion?:number;initialTrade?:string;visible?:boolean;onDepartmentChange?:(department:Department,projectCode?:string)=>void}){
 const projects=useProjectStore(s=>s.projects),actor=useAuthStore(s=>s.currentUser),studio=useStudioStore();
 const actorId=actor?.id||'';
 const teamProjects=useMemo(()=>workProjectOptions(projects).map(project=>projects.find(candidate=>candidate.department===department&&sameWorkProject(projects,candidate.id,project.id))||project),[projects,department]);
 const [projectId,setProjectId]=useState(initialProjectId!==undefined?initialProjectId:initialProjectCode?teamProjects.find(project=>project.code===initialProjectCode)?.id||'':teamProjects[0]?.id||'');
 const [requestedCode,setRequestedCode]=useState(initialProjectCode||projects.find(p=>p.id===initialProjectId)?.code||teamProjects[0]?.code||'');
 const project=teamProjects.find(p=>p.id===projectId);
 const headingProject=project||projects.find(p=>p.code===requestedCode);
 const [trade,setTrade]=useState(initialTrade&&initialTrade!=='PM'?initialTrade:TEAM_ROLES[department].find(x=>x!=='PM')||'기타');
 const [search,setSearch]=useState(''),[draft,setDraft]=useState<InquiryDraft>({rows:[],unassignedImages:[],updatedAt:0});
 const [remote,setRemote]=useState<Inquiry[]>([]),[capabilities,setCap]=useState<Response['capabilities']>({canCreate:false,canManage:false});
 const [rounds,setRounds]=useState<InquiryRound[]>([]),[roundNumber,setRoundNumber]=useState(1),[editing,setEditing]=useState(false),[showDeleted,setShowDeleted]=useState(false),[exportAll,setExportAll]=useState(false);
 const [loadedKey,setLoadedKey]=useState('');
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<InquiryImportResult|null>(null),[lightbox,setLightbox]=useState<InquiryImage|null>(null);
 const [translationOpen,setTranslationOpen]=useState(false),[translationScope,setTranslationScope]=useState<'ROUND'|'TRADE'>('ROUND'),[translationPreview,setTranslationPreview]=useState<KoreanPreview|null>(null);
 const [translationProgress,setTranslationProgress]=useState({completed:0,total:0});
 const [selection,setSelection]=useState<{start:Position;end:Position}>({start:{row:0,column:3},end:{row:0,column:3}});
 const [historyVersion,setHistoryVersion]=useState(0);
 const history=useRef<{past:InquiryDraft[];future:InquiryDraft[];lastKey:string;lastAt:number}>({past:[],future:[],lastKey:'',lastAt:0});
 const value=useRef(draft),base=useRef(remote),keyRef=useRef(''),busyRef=useRef(false),saveEpoch=useRef(0);
 const upload=useRef<HTMLInputElement>(null),photoUpload=useRef<HTMLInputElement>(null),grid=useRef<HTMLDivElement>(null);
 const translationButton=useRef<HTMLButtonElement>(null);
 const key=`${actorId}:${department}:${projectId}`,contextReady=ready&&loadedKey===key;
 const activeDraft=loadedKey===key?draft:{rows:[],unassignedImages:[],updatedAt:0};
 const cap=loadedKey===key?capabilities:{canCreate:false,canManage:false};
 keyRef.current=key;value.current=activeDraft;base.current=loadedKey===key?remote:[];busyRef.current=busy;
 const current=useCallback((captured:string)=>keyRef.current===captured&&useAuthStore.getState().currentUser?.id===actorId,[actorId]);
 const editable=(row:Inquiry)=>cap.canEdit||cap.canManage||cap.canCreate&&row.authorId===actorId;
 const canDelete=(row:Inquiry)=>cap.canManage||cap.canCreate&&row.authorId===actorId;
 const sent=(number:number)=>rounds.some(round=>round.roundNumber===number&&round.status==='SENT');
 const writable=(row:Inquiry)=>editing&&editable(row)&&!row.deletedAt&&!sent(inquiryRoundNumber(row));
 const shown=activeDraft.rows.filter(row=>!row.deletedAt&&row.department===department&&row.trade===trade&&inquiryRoundNumber(row)===roundNumber);
 const dirty=activeDraft.rows.filter(row=>!row.deletedAt&&editable(row)&&(changed(row,remote.find(old=>old.id===row.id))||row.status==='DRAFT'&&row.revision>0));
 const roundNumbers=[...new Set([1,roundNumber,...rounds.map(round=>round.roundNumber),...activeDraft.rows.map(inquiryRoundNumber)])].sort((a,b)=>a-b);
 const round=rounds.find(row=>row.roundNumber===roundNumber),roundRows=activeDraft.rows.filter(row=>!row.deletedAt&&inquiryRoundNumber(row)===roundNumber);
 const trades=[...new Set([...TEAM_ROLES[department].filter(x=>x!=='PM'),...activeDraft.rows.filter(x=>x.department===department).map(x=>x.trade)])];
 const translationView=useRef({key,roundNumber,trade,translationScope,visible,initialContextVersion,contextReady,cap,rounds});
 translationView.current={key,roundNumber,trade,translationScope,visible,initialContextVersion,contextReady,cap,rounds};
 const translationTargets=activeDraft.rows.filter(row=>row.projectId===projectId&&row.department===department&&!row.deletedAt&&inquiryRoundNumber(row)===roundNumber&&editable(row)&&(translationScope==='ROUND'||row.trade===trade));
 const apply=(next:InquiryDraft,editKey='',internal=false)=>{
  if(loadedKey!==key||busyRef.current&&!internal)return;saveEpoch.current++;
  const h=history.current,now=Date.now();if(!editKey||h.lastKey!==editKey||now-h.lastAt>900){h.past.push(value.current);if(h.past.length>50)h.past.shift();}
  h.future=[];h.lastKey=editKey;h.lastAt=now;value.current={...next,updatedAt:now};setDraft(value.current);setHistoryVersion(x=>x+1);setError('');
 };
 const changeCell=(id:string,field:Field,text:string)=>apply({...value.current,rows:value.current.rows.map(row=>row.id===id?{...row,[field]:field==='drawingNumbers'?text.split(/\r?\n/).filter(Boolean):text}:row)},`${id}:${field}`);
 const travel=(undo:boolean)=>{
  if(busyRef.current||loadedKey!==key||sent(roundNumber))return;saveEpoch.current++;setEditing(true);
  const h=history.current,from=undo?h.past:h.future,to=undo?h.future:h.past,next=from.pop();if(!next)return;
  to.push(value.current);h.lastKey='';
  const rows=next.rows.map(row=>{const saved=base.current.find(x=>x.id===row.id);return saved?{...row,revision:saved.revision,status:saved.status,authorId:saved.authorId,authorName:saved.authorName,createdAt:saved.createdAt,updatedAt:saved.updatedAt,registeredAt:saved.registeredAt,deletedAt:saved.deletedAt,deletedBy:saved.deletedBy}:row;});
  for(const saved of base.current)if(!rows.some(row=>row.id===saved.id))rows.push(saved);
  value.current={...next,rows,updatedAt:Date.now()};setDraft(value.current);setHistoryVersion(x=>x+1);
 };
 useEffect(()=>{
  const captured=key;let cancelled=false;saveEpoch.current++;busyRef.current=false;setBusy(false);setReady(false);setLoadedKey('');setCap({canCreate:false,canManage:false});setDraft({rows:[],unassignedImages:[],updatedAt:0});setRemote([]);setRounds([]);setRoundNumber(1);setEditing(false);setShowDeleted(false);setPreview(null);setLightbox(null);setError('');setNotice('');history.current={past:[],future:[],lastKey:'',lastAt:0};
  if(!actorId||!projectId||!studio.ready)return;
  void Promise.all([studioApi<Response>(`inquiries?projectId=${encodeURIComponent(projectId)}&department=${encodeURIComponent(department)}&includeDeleted=1`),readInquiryDraft(captured).catch(()=>undefined)]).then(([response,local])=>{
   if(!current(captured)||cancelled)return;
   const localRows=local?.rows.filter(row=>row.projectId===projectId&&row.department===department&&(row.authorId===actorId||response.capabilities.canManage||response.capabilities.canEdit&&row.status==='REGISTERED'))||[];
   const deletedEdits:Inquiry[]=[];
   const rows=response.inquiries.map(row=>{const localRow=localRows.find(x=>x.id===row.id),localBase=local?.baseRows?.find(x=>x.id===row.id);if(row.deletedAt&&localRow&&changed(localRow,localBase||row)){deletedEdits.push(localRow);return row;}return localRow&&changed(localRow,localBase||row)?localRow:row;});
   for(const row of localRows)if(!rows.some(x=>x.id===row.id)){if(!row.revision)rows.push(row);else if(changed(row,local?.baseRows?.find(old=>old.id===row.id)))deletedEdits.push(row);}
   setRemote(response.inquiries);setRounds(response.rounds||[]);setCap(response.capabilities);setDraft({rows,unassignedImages:local?.unassignedImages||[],retainedRows:[...(local?.retainedRows?.filter(row=>row.projectId===projectId&&row.department===department&&(row.authorId===actorId||response.capabilities.canManage||response.capabilities.canEdit&&row.status==='REGISTERED'))||[]),...deletedEdits],updatedAt:Date.now()});setLoadedKey(captured);setReady(true);
  }).catch(e=>{if(current(captured)&&!cancelled)setError(e.message);});
  return()=>{cancelled=true;};
 },[key,studio.ready,actorId,projectId,department,current]);
 useEffect(()=>{if(contextReady&&actorId){const captured=key;void writeInquiryDraft(captured,{...draft,baseRows:remote}).catch(()=>{if(current(captured))setError('이 브라우저에 입력을 보관하지 못했습니다. 저장 또는 엑셀 내보내기로 보관하세요.');});}},[draft,remote,contextReady,key,loadedKey,actorId,current]);
 useEffect(()=>{
  if(!visible||!contextReady)return;const captured=key;
  const timer=setInterval(()=>{if(busyRef.current||!current(captured))return;const epoch=saveEpoch.current;void studioApi<Response>(`inquiries?projectId=${encodeURIComponent(projectId)}&department=${encodeURIComponent(department)}&includeDeleted=1`).then(response=>{
   if(!current(captured)||busyRef.current||epoch!==saveEpoch.current)return;const old=base.current;
   setDraft(state=>{const retained:Inquiry[]=[];const rows=state.rows.flatMap(row=>{const previous=old.find(x=>x.id===row.id),next=response.inquiries.find(x=>x.id===row.id);if(!next&&row.revision>0){if(changed(row,previous))retained.push(row);return [];}if(next?.deletedAt){if(changed(row,previous))retained.push(row);return [next];}return [next&&!changed(row,previous)?next:row];});return {...state,retainedRows:[...(state.retainedRows||[]),...retained],rows:[...rows,...response.inquiries.filter(row=>!state.rows.some(x=>x.id===row.id))]};});
   setRemote(response.inquiries);setRounds(response.rounds||[]);setCap(response.capabilities);
  }).catch(e=>{if(current(captured))setError(e.message);});},2000);return()=>clearInterval(timer);
 },[visible,contextReady,key,projectId,department,current]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty.length]);
 useEffect(()=>{setTranslationOpen(false);setTranslationPreview(null);setTranslationProgress({completed:0,total:0});},[key,roundNumber,trade,visible,initialContextVersion]);
 useEffect(()=>{if(initialProjectId!==undefined)setProjectId(initialProjectId);if(initialProjectCode!==undefined)setRequestedCode(initialProjectCode);if(initialTrade&&initialTrade!=='PM')setTrade(initialTrade);},[initialProjectId,initialProjectCode,initialTrade,initialContextVersion]);
 useEffect(()=>{if(!teamProjects.some(p=>p.id===projectId)){const candidate=requestedCode?teamProjects.find(p=>p.code===requestedCode):teamProjects[0];setProjectId(candidate?.id||'');if(candidate&&!requestedCode)setRequestedCode(candidate.code);}},[projectId,teamProjects,requestedCode]);

 const selectImport=(result:InquiryImportResult):InquiryImportResult=>{
  const inquiries=result.inquiries.filter(row=>row.department===department&&row.projectId===projectId),sheets=new Set(inquiries.map(row=>row.sourceSheet));
  const skipped=result.inquiries.length-inquiries.length;
  return {...result,inquiries,unassignedImages:result.unassignedImages.filter(image=>sheets.has(image.sourceSheet)||image.sourceSheet.includes(department.replace('팀',''))),warnings:[...result.warnings,...(skipped?[`다른 팀 질의 ${skipped}개는 해당 팀에서 별도로 불러오세요.`]:[])]};
 };
 const latest=()=>{
  const retainedRows=value.current.rows.filter(row=>editable(row)&&row.revision>0&&changed(row,base.current.find(old=>old.id===row.id)));
  apply({...value.current,retainedRows:[...(value.current.retainedRows||[]),...retainedRows],rows:[...base.current,...value.current.rows.filter(row=>!row.revision)]});setNotice('중앙 최신본으로 표시했습니다. 수정 중이던 입력은 보관 입력에서 다시 볼 수 있습니다.');
 };
 const retainedTarget=(row:Inquiry)=>remote.find(saved=>saved.id===row.id&&!saved.deletedAt&&!sent(inquiryRoundNumber(saved)));
 const restoreInput=(row:Inquiry)=>{
  if(busy||!contextReady||!cap.canCreate)return;const saved=retainedTarget(row);
  if(saved){apply({...value.current,rows:value.current.rows.map(old=>old.id===row.id?{...row,revision:saved.revision,status:saved.status,authorId:saved.authorId,authorName:saved.authorName,createdAt:saved.createdAt,updatedAt:saved.updatedAt,deletedAt:undefined,deletedBy:undefined}:old)});setRoundNumber(inquiryRoundNumber(saved));setTrade(saved.trade);}
  else{if(sent(roundNumber)){setError('작성 중인 차수를 선택한 뒤 입력을 새 질의로 복사하세요.');return;}try{const rows=parseCopiedInquiryRows(JSON.stringify([row]),{projectId,department,trade:row.trade,authorId:actorId,authorName:actor?.name||''}).map(copy=>({...copy,roundNumber,group:`${roundNumber}차 질의사항`}));apply({...value.current,rows:[...value.current.rows,...rows]});setTrade(row.trade);}catch(e){setError(e instanceof Error?e.message:'보관 입력 복사 실패');return;}}
  setEditing(true);setNotice('보관 입력을 가져왔습니다. 비교 후 저장하세요.');
 };

 const acceptSaved=(saved:Inquiry)=>{base.current=[...base.current.filter(old=>old.id!==saved.id),saved];setRemote(base.current);value.current={...value.current,rows:value.current.rows.map(old=>old.id===saved.id?saved:old),updatedAt:Date.now()};setDraft(value.current);};
 const translationMatchesSource=(snapshot:KoreanPreview)=>{
  const view=translationView.current;
  if(!current(snapshot.key)||!view.contextReady||!view.visible||view.roundNumber!==snapshot.roundNumber||view.trade!==snapshot.trade||view.translationScope!==snapshot.scope||view.initialContextVersion!==snapshot.contextVersion||view.rounds.some(round=>round.roundNumber===snapshot.roundNumber&&round.status==='SENT'))return false;
  return snapshot.rows.every(original=>{const row=value.current.rows.find(row=>row.id===original.id);return row&&!row.deletedAt&&JSON.stringify(row)===JSON.stringify(original)&&(view.cap.canEdit||view.cap.canManage||view.cap.canCreate&&row.authorId===actorId);});
 };
 async function requestKoreanTranslation(){
  if(!contextReady||!visible||!current(key)||busyRef.current||sent(roundNumber))return;
  const rows=translationTargets.filter(row=>koreanFields.some(([field])=>row[field].trim())||row.images.some(image=>image.caption?.trim()));
  if(!rows.length){setError('현재 범위에 번역할 수 있는 텍스트가 없습니다. 읽기 전용 항목과 사진 속 글자는 번역하지 않습니다.');return;}
  if(rows.some(row=>!koreanItemSafe(row,koreanItem(row)))){setError('번역 원문 길이를 확인하세요. 구분 200자, 본문 20,000자, 사진 설명 1,000자까지 지원합니다.');return;}
  const snapshot:KoreanPreview={key,roundNumber,trade,contextVersion:initialContextVersion,scope:translationScope,rows:structuredClone(rows),baseRows:structuredClone(base.current.filter(row=>rows.some(target=>target.id===row.id))),items:[]};
  const batches=koreanRequests(rows),parts=new Map<string,{piece:KoreanPiece;values:string[]}>();
  setTranslationProgress({completed:0,total:batches.length});
  saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');setTranslationPreview(null);
  try{
   for(let index=0;index<batches.length;index++){
    if(!translationMatchesSource(snapshot))throw new Error('계정, 프로젝트, 차수 또는 원문이 변경되었습니다. 원문을 확인한 뒤 다시 번역하세요.');
    const batch=batches[index],response=await studioApi<{items:KoreanItem[]}>('inquiries/translate-korean','POST',{actorId,projectId,department,roundNumber,items:batch.map(plan=>plan.item)});
    if(!translationMatchesSource(snapshot))throw new Error('계정, 프로젝트, 차수 또는 원문이 변경되었습니다. 원문을 확인한 뒤 다시 번역하세요.');
    if(!Array.isArray(response.items)||response.items.length!==batch.length||new Set(response.items.map(item=>item.id)).size!==batch.length)throw new Error('번역 결과가 일부 누락되었습니다. 어떤 원문도 변경하지 않았습니다.');
    for(const plan of batch){const item=response.items.find(item=>item.id===plan.item.id);if(!item||item.revision!==plan.item.revision||koreanFields.some(([field])=>typeof item[field]!=='string'||(plan.item[field]? !item[field].trim():item[field]!==''))||!Array.isArray(item.imageCaptions)||item.imageCaptions.length!==plan.item.imageCaptions.length||new Set(item.imageCaptions.map(caption=>caption.id)).size!==plan.item.imageCaptions.length||plan.item.imageCaptions.some(image=>!item.imageCaptions.some(caption=>caption.id===image.id&&typeof caption.caption==='string'&&(image.caption?caption.caption.trim():caption.caption===''))))throw new Error('번역 결과 형식을 확인하지 못했습니다. 어떤 원문도 변경하지 않았습니다.');
     for(const piece of plan.pieces){const key=koreanPieceKey(piece),entry=parts.get(key)||{piece,values:[]};const translated=piece.imageId?item.imageCaptions.find(caption=>caption.id===piece.imageId)!.caption:item[piece.field];entry.values[piece.index]=piece.before+translated.trim()+piece.after;parts.set(key,entry);}
    }
    setTranslationProgress({completed:index+1,total:batches.length});
   }
   const items=rows.map(koreanItem);
   for(const {piece,values} of parts.values()){const item=items.find(item=>item.id===piece.id)!;if(piece.imageId)item.imageCaptions.find(image=>image.id===piece.imageId)!.caption=values.join('');else item[piece.field]=values.join('');}
   if(rows.some(row=>!koreanItemSafe(row,items.find(item=>item.id===row.id)!)))throw new Error('번역 결과의 길이·줄바꿈·수치·단위·도면 코드가 원문과 다릅니다. 어떤 원문도 변경하지 않았습니다.');
   setTranslationPreview({...snapshot,items});
  }catch(e){if(current(snapshot.key))setError(e instanceof Error?e.message:'AI 한국어 번역에 실패했습니다. 원문은 유지됩니다.');}
  finally{if(current(snapshot.key)){busyRef.current=false;setBusy(false);}}
 }
 async function applyKoreanTranslation(){
  const snapshot=translationPreview;if(!snapshot||busyRef.current)return;
  if(!translationMatchesSource(snapshot)){setError('계정, 프로젝트, 차수 또는 원문이 변경되었습니다. 원문을 확인한 뒤 다시 번역하세요.');return;}
  saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');
  try{
   const latest=await studioApi<Response>(`inquiries?projectId=${encodeURIComponent(projectId)}&department=${encodeURIComponent(department)}&includeDeleted=1`);
   if(!translationMatchesSource(snapshot))throw new Error('원문이나 선택한 프로젝트가 변경되었습니다. 다시 번역하세요.');
   if(latest.rounds?.some(round=>round.roundNumber===snapshot.roundNumber&&round.status==='SENT'))throw new Error('다른 화면에서 이 차수를 발송완료로 표시했습니다. 원문은 변경하지 않았습니다.');
   for(const row of snapshot.rows){
    const previous=snapshot.baseRows.find(old=>old.id===row.id),remote=latest.inquiries.find(saved=>saved.id===row.id);
    if(JSON.stringify(previous)!==JSON.stringify(remote)||remote?.deletedAt||!(latest.capabilities.canEdit||latest.capabilities.canManage||latest.capabilities.canCreate&&row.authorId===actorId))throw new Error('다른 화면에서 원문이나 수정 권한이 변경되었습니다. 최신 자료를 확인한 뒤 다시 번역하세요.');
   }
   const translated=value.current.rows.map(row=>{const item=snapshot.items.find(item=>item.id===row.id);if(!item)return row;return {...row,...Object.fromEntries(koreanFields.map(([field])=>[field,item[field]])),images:row.images.map(image=>{const caption=item.imageCaptions.find(caption=>caption.id===image.id)!.caption;return caption===(image.caption||'')?image:{...image,caption};})};});
   apply({...value.current,rows:translated},'',true);setEditing(true);setTranslationOpen(false);setTranslationPreview(null);setNotice(`${snapshot.rows.length}개 질의사항을 한국어 초안으로 변경했습니다. 확인 후 저장하세요. Ctrl+Z로 원문을 되돌릴 수 있습니다.`);
  }catch(e){if(current(snapshot.key))setError(e instanceof Error?e.message:'원문 확인에 실패했습니다. 한국어로 변경하지 않았습니다.');}
  finally{if(current(snapshot.key)){busyRef.current=false;setBusy(false);}}
 }
 const closeKoreanTranslation=()=>{if(busyRef.current)return;setTranslationOpen(false);setTranslationPreview(null);translationButton.current?.focus();};
 const translationChangeCount=translationPreview?.rows.filter(row=>koreanPairs(row,translationPreview.items.find(item=>item.id===row.id)!).length).length||0;
 async function persist(){
  const captured=key;if(!contextReady||busy||!current(captured))return;saveEpoch.current++;
  const targets=dirty.filter(row=>row.department===department&&row.projectId===projectId);
  if(!targets.length){setNotice('저장할 변경이 없습니다.');return;}
  if(targets.some(row=>sent(inquiryRoundNumber(row)))){setError('발송된 차수는 수정할 수 없습니다. 발송 표시를 취소한 뒤 수정하세요. 입력은 보관됩니다.');return;}
  if(targets.some(row=>!row.question.trim()&&!row.images.some(image=>image.field==='question'))){setError('저장할 항목의 질의사항 또는 질의 사진을 입력하세요.');return;}
  busyRef.current=true;setBusy(true);setError('');let completed=0,stored=0;
  try{for(const row of targets){
   if(!current(captured))throw new Error('계정이나 프로젝트가 변경되어 저장을 중단했습니다.');
   if(row.images.length>4||row.images.reduce((sum,image)=>sum+(image.dataUrl.split(',')[1]?.length||0)*.75,0)>1024*1024)throw new Error(`${row.no}번 사진이 저장 한도를 초과합니다. 필요한 영역만 잘라 다시 첨부하세요.`);
   const response=await studioApi<{inquiry:Inquiry}>(`inquiries/${encodeURIComponent(row.id)}`,'PUT',{inquiry:{...row,roundNumber:inquiryRoundNumber(row)},revision:row.revision,actorId});const saved=response.inquiry;stored++;
   if(!current(captured))return;
   acceptSaved(saved);completed++;
  }setEditing(false);setNotice(`${completed}개 질의사항 저장 완료 · 팀에 공유했습니다.`);}catch(e){if(current(captured))setError(`${stored?`${stored}개 저장 완료. `:''}${e instanceof Error?e.message:'저장 실패'} 입력은 유지됩니다.`);}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 async function removeRow(row:Inquiry){
  if(!contextReady||busy||!canDelete(row)||sent(inquiryRoundNumber(row)))return;
  if(!row.revision){apply({...value.current,rows:value.current.rows.filter(x=>x.id!==row.id)});setNotice(`${row.no}번 질의를 삭제했습니다. 되돌리기로 복구할 수 있습니다.`);return;}
  const captured=key;saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');
  try{const response=await studioApi<{inquiry:Inquiry}>(`inquiries/${encodeURIComponent(row.id)}`,'DELETE',{revision:row.revision,actorId,department});if(current(captured)){if(changed(row,base.current.find(x=>x.id===row.id)))value.current={...value.current,retainedRows:[...(value.current.retainedRows||[]),row]};acceptSaved(response.inquiry);setShowDeleted(true);setNotice(`${row.no}번 질의를 삭제했습니다. 삭제한 질의에서 복구할 수 있습니다.`);}}
  catch(e){if(current(captured))setError(e instanceof Error?e.message:'삭제 실패');}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 async function restoreRow(row:Inquiry){
  if(!contextReady||busy||!canDelete(row)||sent(inquiryRoundNumber(row)))return;const captured=key;saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');
  try{const response=await studioApi<{inquiry:Inquiry}>(`inquiries/${encodeURIComponent(row.id)}/restore`,'POST',{revision:row.revision,actorId,department});if(current(captured)){acceptSaved(response.inquiry);setNotice(`${row.no}번 질의를 복구했습니다.`);}}
  catch(e){if(current(captured))setError(e instanceof Error?e.message:'복구 실패');}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 async function changeRoundStatus(action:'send'|'reopen'){
  const captured=key;if(!contextReady||busy||!cap.canManage||!current(captured))return;
  if(action==='send'&&(dirty.some(row=>inquiryRoundNumber(row)===roundNumber)||roundRows.some(row=>!row.revision))){setError('이 차수의 질의를 먼저 저장하세요.');return;}
  saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');
  try{const response=await studioApi<{round:InquiryRound}>(`inquiries/rounds/${roundNumber}/${action}`,'POST',{actorId,projectId,department,revision:round?.revision||0,inquiryVersions:base.current.filter(row=>!row.deletedAt&&inquiryRoundNumber(row)===roundNumber).map(row=>({id:row.id,revision:row.revision}))});if(current(captured)){setRounds(old=>[...old.filter(row=>row.roundNumber!==roundNumber),response.round]);if(action==='send')setEditing(false);setNotice(`${roundNumber}차 ${action==='send'?'발송완료로 표시했습니다.':'발송 표시를 취소했습니다.'}`);}}
  catch(e){if(current(captured))setError(e instanceof Error?e.message:'발송 상태 변경 실패');}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 async function addPhotos(files:File[],rowId:string,field:Field){
  const captured=key,row=value.current.rows.find(x=>x.id===rowId);if(!row||!writable(row)||busy||!contextReady)return;saveEpoch.current++;
  if(row.images.length+files.length>4){setError('한 질의사항에는 사진을 4장까지 첨부할 수 있습니다.');return;}
  busyRef.current=true;setBusy(true);try{const images=await Promise.all(files.map(prepareImage));if(current(captured))apply({...value.current,rows:value.current.rows.map(x=>x.id===rowId?{...x,images:[...x.images,...images.map(image=>({...image,field:imageField(field)}))]}:x)},'',true);}
  catch(e){if(current(captured))setError(e instanceof Error?e.message:'사진 추가 실패');}finally{if(current(captured)){busyRef.current=false;setBusy(false);}}
 }
 const addRow=()=>{if(sent(roundNumber))return;setEditing(true);const numericNos=roundRows.filter(row=>row.trade===trade).map(row=>Number(row.no)).filter(number=>Number.isInteger(number)&&number>0);const row=emptyRow(projectId,department,trade,String(Math.max(0,...numericNos)+1),actorId,actor?.name||'',roundNumber);apply({...value.current,rows:[...value.current.rows,row]});setSelection({start:{row:shown.length,column:3},end:{row:shown.length,column:3}});};
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
  if(!cap.canCreate||!editing||sent(roundNumber)||busy||!contextReady)return;
  const copied=event.clipboardData.getData(inquiryClipboardMime);
  if(copied){event.preventDefault();try{const rows=parseCopiedInquiryRows(copied,{projectId,department,trade,authorId:actorId,authorName:actor?.name||''}).map(row=>({...row,roundNumber,group:`${roundNumber}차 질의사항`}));apply({...value.current,rows:[...value.current.rows,...rows]});setNotice(`사진을 포함한 ${rows.length}개 행을 현재 차수에 붙여넣었습니다.`);}catch(e){setError(e instanceof Error?e.message:'질의 붙여넣기 실패');}return;}
  const row=shown[selection.end.row],field=columns[selection.end.column]?.[0]||'question';if(!row||!editable(row))return;
  const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();void addPhotos(files,row.id,field);return;}
  const text=event.clipboardData.getData('text/plain');if(!text.includes('\t')&&!event.clipboardData.getData('application/x-concost-inquiry-cells'))return;
  event.preventDefault();let cells:string[][];try{cells=decodeTsv(text);}catch(e){setError(e instanceof Error?e.message:'표 붙여넣기 실패');return;}
  let next=[...value.current.rows];const local=[...shown];
  for(let r=0;r<cells.length;r++){let target=local[selection.end.row+r];if(!target){target=emptyRow(projectId,department,trade,String(local.length+1),actorId,actor?.name||'',roundNumber);local.push(target);next.push(target);}if(!writable(target))continue;
   const changed={...target};for(let c=0;c<cells[r].length&&selection.end.column+c<columns.length;c++){const field=columns[selection.end.column+c][0];if(field==='drawingNumbers')changed.drawingNumbers=cells[r][c].split(/\r?\n/).filter(Boolean);else changed[field]=cells[r][c];}next=next.map(x=>x.id===target.id?changed:x);
  }apply({...value.current,rows:next});
 };
 if(!actor||!studio.ready)return <p role="status" className="p-6">중앙 서버에 로그인한 뒤 프로젝트 질의사항을 확인하세요.</p>;
 return <div className="text-slate-900 dark:text-slate-100">
  <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><FileQuestion size={24}/>프로젝트 질의사항</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">프로젝트의 팀·차수·공종을 선택하고 도면 질의와 답변을 함께 작성합니다.</p></div><span className="text-sm text-slate-600 dark:text-slate-300">{dirty.length?`미저장 ${dirty.length}개`:'팀 공유 연결'} · 저장한 변경 자동 반영</span></header>
  <div className="grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
   <aside className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><label className="mb-3 flex items-center gap-2"><Search size={16}/><input data-no-field-translate className={`${styles} min-w-0 w-full`} aria-label="질의 프로젝트 검색" placeholder="프로젝트 검색" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="max-h-[65vh] space-y-1 overflow-y-auto">{teamProjects.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(search.toLowerCase())).map(p=><button key={p.id} disabled={busy} aria-pressed={projectId===p.id} onClick={()=>{setProjectId(p.id);setRequestedCode(p.code);}} className={`w-full rounded-lg p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${projectId===p.id?'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100':'hover:bg-slate-50 dark:hover:bg-slate-800'}`}><span className="block text-xs text-slate-600 dark:text-slate-300">{p.code}</span><span data-no-translate className="mt-1 block font-semibold">{p.name}</span></button>)}</div>{!teamProjects.length&&<p className="p-3 text-sm">프로젝트가 없습니다.</p>}</aside>
   <section className="min-w-0 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <div className="border-b border-slate-200 p-4 dark:border-slate-700"><h3 data-no-translate={headingProject?'':undefined} className="text-base font-bold">{headingProject?.name||'프로젝트를 선택하세요'}</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{headingProject?.code} · {department}</p></div>
    <div role="tablist" aria-label="질의사항 팀" className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">{(['마감팀','구조팀','토목&조경팀'] as const).map(team=><button key={team} role="tab" aria-selected={department===team} disabled={busy||!onDepartmentChange} className={`rounded-lg px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40 ${department===team?'bg-blue-800 text-white':'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`} onClick={()=>onDepartmentChange?.(team,project?.code||requestedCode||undefined)}>{team}</button>)}</div>
    {!projectId&&<p className="p-5 text-sm text-slate-600 dark:text-slate-300">{requestedCode?`이 프로젝트를 찾을 수 없습니다. 다른 프로젝트를 선택하세요.`:'프로젝트를 선택하세요.'}</p>}
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"><div role="tablist" aria-label="질의 차수" className="flex max-w-full gap-2 overflow-x-auto">{roundNumbers.map(number=><button key={number} role="tab" aria-selected={roundNumber===number} disabled={busy} onClick={()=>{setRoundNumber(number);setEditing(false);setSelection({start:{row:0,column:3},end:{row:0,column:3}});}} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${roundNumber===number?'border-blue-800 bg-blue-50 font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-100':'border-slate-300 dark:border-slate-600'}`}>{number}차 {sent(number)&&<span className="ml-1 text-xs text-emerald-700 dark:text-emerald-300">발송완료</span>}</button>)}</div><button className={styles} disabled={!contextReady||!cap.canCreate||busy||Math.max(...roundNumbers)>=999} onClick={()=>{setRoundNumber(Math.max(...roundNumbers)+1);setEditing(true);}}><Plus size={14} className="mr-1 inline"/>차수 추가</button><div className="ml-auto flex flex-wrap items-center gap-2"><span className={`text-xs font-semibold ${round?.status==='SENT'?'text-emerald-700 dark:text-emerald-300':'text-slate-600 dark:text-slate-300'}`}>{round?.status==='SENT'?`${roundNumber}차 발송완료 · ${round.sentAt?new Date(round.sentAt).toLocaleString('ko-KR'):''} ${round.sentByName||''}`:`${roundNumber}차 작성 중`}</span>{cap.canManage&&<button className={styles} disabled={!contextReady||busy||round?.status!=='SENT'&&(!roundRows.length||dirty.some(row=>inquiryRoundNumber(row)===roundNumber)||roundRows.some(row=>!row.revision))} onClick={()=>void changeRoundStatus(round?.status==='SENT'?'reopen':'send')}><Send size={14} className="mr-1 inline"/>{round?.status==='SENT'?'발송 표시 취소':'발송완료로 표시'}</button>}</div></div>
    <div role="tablist" aria-label="질의사항 공종" className="flex gap-2 overflow-x-auto border-b border-slate-200 px-3 py-3 dark:border-slate-700">{trades.map(name=><button key={name} role="tab" disabled={busy} aria-selected={trade===name} onClick={()=>{setTrade(name);setSelection({start:{row:0,column:3},end:{row:0,column:3}});}} className={`min-h-[44px] shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-50 dark:focus-visible:outline-orange-300 ${trade===name?'border-orange-700 bg-orange-700 font-bold text-white':'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200 dark:hover:bg-orange-900'}`}>{name} <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${trade===name?'bg-orange-800 text-white':'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100'}`}>{activeDraft.rows.filter(row=>!row.deletedAt&&inquiryRoundNumber(row)===roundNumber&&row.trade===name).length}</span></button>)}</div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
     <button className={styles} disabled={!contextReady||!cap.canCreate||busy||sent(roundNumber)} onClick={addRow}><Plus size={15} className="mr-1 inline"/>질의 추가</button>
     <button className={styles} disabled={!contextReady||!cap.canCreate||busy} onClick={()=>upload.current?.click()}><Upload size={15} className="mr-1 inline"/>엑셀 불러오기</button>
     <select className={styles} aria-label="엑셀 내보내기 차수" disabled={busy} value={exportAll?'ALL':'ROUND'} onChange={event=>setExportAll(event.target.value==='ALL')}><option value="ROUND">현재 차수</option><option value="ALL">전체 차수</option></select>
     <button className={styles} title={`${department} · ${exportAll?'전체 차수':'현재 차수'}의 전 공종을 한 파일로 내보냅니다.`} disabled={!contextReady||!(exportAll?activeDraft.rows.filter(row=>!row.deletedAt):roundRows).length||busy} onClick={()=>{void downloadInquiryExcel((exportAll?activeDraft.rows:roundRows).filter(row=>!row.deletedAt),{projectName:project?.name||'',department,rounds:exportAll?rounds:rounds.filter(round=>round.roundNumber===roundNumber),unassignedImages:exportAll?activeDraft.unassignedImages:[]}).catch(e=>setError(e.message));}}><Download size={15} className="mr-1 inline"/>전 공종 엑셀 내보내기</button>
     <button className={styles} aria-label="되돌리기 Ctrl+Z" disabled={!history.current.past.length||busy} onClick={()=>travel(true)}><Undo2 size={16}/></button><button className={styles} aria-label="다시 실행 Ctrl+Y" disabled={!history.current.future.length||busy} onClick={()=>travel(false)}><Redo2 size={16}/></button>
     <button className={styles} disabled={!contextReady||!editing||busy||!shown.length||sent(roundNumber)} onClick={()=>photoUpload.current?.click()}><ImagePlus size={15} className="mr-1 inline"/>선택한 칸에 사진</button>
     <div className="ml-auto flex flex-wrap items-center gap-2"><button ref={translationButton} data-no-translate className="rounded-lg border border-blue-800 bg-blue-800 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-700 dark:enabled:hover:bg-blue-600" disabled={!contextReady||busy||sent(roundNumber)||!translationTargets.length} onClick={()=>{setTranslationScope('ROUND');setTranslationProgress({completed:0,total:0});setTranslationPreview(null);setTranslationOpen(true);setError('');}}><Languages size={15} className="mr-1 inline"/>AI 한국어 번역</button><button className={styles} disabled={!contextReady||!cap.canCreate||busy||editing||sent(roundNumber)} onClick={()=>setEditing(true)}><Pencil size={15} className="mr-1 inline"/>{editing?'수정 중':'수정'}</button><button className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50" disabled={!dirty.length||busy} onClick={()=>void persist()}><Save size={15} className="mr-1 inline"/>{busy?'처리 중':'저장'}</button></div>
    </div>
    {!!dirty.some(row=>sent(inquiryRoundNumber(row))||row.revision>0&&remote.some(old=>old.id===row.id&&old.revision!==row.revision))&&<div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"><span>다른 화면에서 항목이나 발송 상태가 변경되었습니다. 입력을 보관한 뒤 최신 자료와 비교하세요.</span><button className={styles} disabled={busy} onClick={latest}>중앙 최신본 보기</button></div>}
    {!!activeDraft.retainedRows?.length&&<details className="border-b border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">보관 입력 {activeDraft.retainedRows.length}개 · 변경 내용 비교</summary>{activeDraft.retainedRows.map((row,index)=><article key={`${row.id}:${index}`} className="my-2 rounded border border-slate-300 p-3 text-sm dark:border-slate-600"><p className="font-semibold">{row.no} · {row.trade} · {row.group}</p><p className="my-2 whitespace-pre-wrap">{row.question}</p>{row.images.map(image=><img key={image.id} src={image.dataUrl} alt={image.caption||image.name} className="max-h-40 object-contain"/>)}<button className={styles} disabled={busy||!cap.canCreate||!retainedTarget(row)&&sent(roundNumber)} onClick={()=>restoreInput(row)}>{retainedTarget(row)?'이 입력 가져오기':'현재 차수에 새 질의로 복사'}</button></article>)}</details>}
    {error&&<p role="alert" className="m-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}{notice&&<p role="status" className="px-4 py-2 text-sm text-blue-800 dark:text-blue-200">{notice}</p>}
    {!contextReady&&projectId&&<p role="status" className="p-5">{error?'연결을 확인한 뒤 다시 열어 주세요.':'질의사항 확인 중…'}</p>}
    <p className="px-4 pt-2 text-xs text-slate-600 dark:text-slate-300">엑셀은 선택한 팀의 전 공종을 한 파일로 내보냅니다. 발주처에 보낸 차수는 발송완료로 표시하세요. 발송된 차수는 표시를 취소한 뒤 수정할 수 있습니다.</p>
    <p className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">셀을 클릭해 작성 · Shift+클릭으로 범위 선택 · Ctrl+C/V 복사·붙여넣기 · Ctrl+Z 되돌리기 · 도면 사진은 붙여넣거나 끌어 넣으세요.</p>
    <div ref={grid} role="region" aria-label={`${trade} 질의 편집표`} tabIndex={0} className="max-h-[70vh] overflow-auto focus-visible:outline-2 focus-visible:outline-blue-600" onCopy={copyCells} onPaste={paste} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(!event.shiftKey);}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();travel(false);}}}>
     <table className="w-full min-w-[1050px] table-fixed border-collapse text-sm"><colgroup><col className="w-[55px]"/><col className="w-[110px]"/><col className="w-[115px]"/><col/><col/><col/><col className="w-[145px]"/></colgroup><thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800"><tr>{columns.map(([field,label])=><th key={field} className="border border-slate-300 p-2 text-left font-semibold dark:border-slate-600">{label}</th>)}</tr></thead><tbody>
      {shown.map((row,rowIndex)=><tr key={row.id}>{columns.map(([field,label],columnIndex)=>{
       const selected=rowIndex>=Math.min(selection.start.row,selection.end.row)&&rowIndex<=Math.max(selection.start.row,selection.end.row)&&columnIndex>=Math.min(selection.start.column,selection.end.column)&&columnIndex<=Math.max(selection.start.column,selection.end.column);
       const pictures=row.images.filter(image=>image.field===field);
       return <td key={field} className={`align-top border border-slate-300 p-2 dark:border-slate-600 ${selected?'bg-blue-50 dark:bg-blue-950/50':''}`} onMouseDown={event=>{setSelection(previous=>({start:event.shiftKey?previous.start:{row:rowIndex,column:columnIndex},end:{row:rowIndex,column:columnIndex}}));}} onDragOver={e=>{if(writable(row))e.preventDefault();}} onDrop={e=>{if(writable(row)&&e.dataTransfer.files.length){e.preventDefault();void addPhotos(Array.from(e.dataTransfer.files),row.id,field);}}}>
        {field==='no'&&<div className="mb-2 flex flex-col gap-1"><span className={`text-[10px] font-semibold ${row.revision?'text-blue-800 dark:text-blue-200':'text-amber-900 dark:text-amber-200'}`}>{row.revision?'저장됨':'작성 중'}</span>{canDelete(row)&&<button aria-label={`${row.no}번 질의 삭제`} disabled={busy||sent(inquiryRoundNumber(row))} className="self-start rounded p-1 text-rose-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-rose-300 disabled:opacity-40" onClick={()=>void removeRow(row)}><Trash2 size={14}/></button>}</div>}
        <textarea data-no-translate aria-label={`${row.no}번 ${label}`} readOnly={!writable(row)||busy} value={valueOf(row,field)} rows={field==='no'?1:3} className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400" placeholder={field==='question'?'질의내용을 입력하거나 사진을 붙여넣으세요.':''} onFocus={()=>setSelection(previous=>previous.end.row===rowIndex&&previous.end.column===columnIndex?previous:{start:{row:rowIndex,column:columnIndex},end:{row:rowIndex,column:columnIndex}})} onChange={e=>changeCell(row.id,field,e.target.value)}/>
        {field==='classification'&&<label className="mt-2 block text-[10px] text-slate-600 dark:text-slate-300">질의 차수<select aria-label={`${row.no}번 질의 차수`} disabled={!writable(row)||busy} value={inquiryRoundNumber(row)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 text-xs dark:border-slate-600 dark:bg-slate-900" onChange={e=>{const number=Number(e.target.value);apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,roundNumber:number,group:`${number}차 질의사항`}:x)},`${row.id}:group`);}}>{roundNumbers.map(number=><option key={number} value={number} disabled={sent(number)}>{number}차</option>)}</select></label>}
        {pictures.map(image=><figure key={image.id} tabIndex={0} className="mt-2 rounded border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-800" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();e.stopPropagation();void copyImage(image).then(()=>setNotice('사진을 복사했습니다.')).catch(()=>setError('브라우저의 클립보드 권한을 확인하세요.'));}}}><button className="block w-full" aria-label={`${image.name} 크게 보기`} onClick={()=>setLightbox(image)}><img src={image.dataUrl} alt={image.caption||image.name} className="max-h-[280px] w-full object-contain"/></button><div className="flex gap-1"><button aria-label={`${image.name} 사진 복사`} className="rounded p-1" onClick={()=>{void copyImage(image).then(()=>setNotice('사진을 복사했습니다.')).catch(()=>setError('브라우저의 클립보드 권한을 확인하세요.'));}}><Copy size={13}/></button>{writable(row)&&<button aria-label={`${image.name} 사진 제거`} disabled={busy} className="rounded p-1 text-rose-700 dark:text-rose-300" onClick={()=>apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,images:x.images.filter(i=>i.id!==image.id)}:x)})}><X size={13}/></button>}</div><input data-no-translate aria-label={`${image.name} 사진 설명`} readOnly={!writable(row)||busy} value={image.caption||''} placeholder="사진 설명" className="w-full bg-transparent p-1 text-xs" onChange={e=>apply({...value.current,rows:value.current.rows.map(x=>x.id===row.id?{...x,images:x.images.map(i=>i.id===image.id?{...i,caption:e.target.value}:i)}:x)},`${row.id}:image:${image.id}`)}/></figure>)}
        {field==='notes'&&<p className="mt-2 text-[10px] text-slate-600 dark:text-slate-300">작성 {row.authorName}{row.updatedByName?` · 수정 ${row.updatedByName}`:''}{row.sourceSheet?` · ${row.sourceSheet}`:''}</p>}
       </td>;})}</tr>)}
      {!shown.length&&<tr><td colSpan={columns.length} className="p-10 text-center text-slate-600 dark:text-slate-300">{trade} 질의사항이 없습니다. {cap.canCreate?'질의 추가 또는 엑셀 불러오기로 시작하세요.':'선택한 팀의 직원 또는 현장 PM이 질의사항을 등록합니다.'}</td></tr>}
     </tbody></table>
    </div>
    {!!activeDraft.rows.some(row=>row.deletedAt&&inquiryRoundNumber(row)===roundNumber)&&<div className="border-t border-slate-200 p-4 dark:border-slate-700"><button className={styles} aria-expanded={showDeleted} onClick={()=>setShowDeleted(!showDeleted)}><Trash2 size={14} className="mr-1 inline"/>삭제한 질의 {activeDraft.rows.filter(row=>row.deletedAt&&inquiryRoundNumber(row)===roundNumber).length}개</button>{showDeleted&&<div className="mt-3 space-y-2">{activeDraft.rows.filter(row=>row.deletedAt&&inquiryRoundNumber(row)===roundNumber).map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-600"><div><p className="font-semibold">{row.trade} · No {row.no}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{row.question}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">사진 {row.images.length}장 보관 · {row.deletedByName||row.authorName}</p></div><button className={styles} aria-label={`${row.trade} ${row.no}번 질의 복구`} disabled={busy||!canDelete(row)||sent(inquiryRoundNumber(row))} onClick={()=>void restoreRow(row)}><RotateCcw size={14} className="mr-1 inline"/>복구</button></article>)}</div>}</div>}
    {!!activeDraft.unassignedImages.length&&<details className="border-t border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">원본 표 밖의 사진 {activeDraft.unassignedImages.length}개 · 연결 확인</summary><p className="my-2 text-xs text-slate-600 dark:text-slate-300">원본에서 질의 행과 연결되지 않은 사진입니다. 전체 차수 엑셀에 보존됩니다. 현재 차수에 포함하려면 선택한 질의에 연결하세요.</p><div className="grid max-h-[400px] grid-cols-2 gap-3 overflow-auto xl:grid-cols-4">{activeDraft.unassignedImages.map(image=><figure key={image.id} className="rounded border border-slate-300 p-2 dark:border-slate-600"><img src={image.dataUrl} alt={image.name} className="h-28 w-full object-contain"/><figcaption className="my-1 text-xs">{image.sourceSheet} · 원본 {image.sourceRow}행</figcaption><button className={styles} disabled={!shown[selection.end.row]||!editing||sent(roundNumber)||!cap.canCreate||busy} onClick={()=>{const row=shown[selection.end.row];if(!row||!writable(row)||row.images.length>=4){setError('연결할 질의 행을 선택하고 사진 개수를 확인하세요.');return;}apply({...value.current,unassignedImages:value.current.unassignedImages.filter(x=>x.id!==image.id),rows:value.current.rows.map(x=>x.id===row.id?{...x,images:[...x.images,{...image,field:imageField(columns[selection.end.column][0]),sourceAnchor:undefined}]}:x)});}}>선택한 질의에 연결</button></figure>)}</div></details>}
   </section>
  </div>
  <input ref={upload} type="file" accept=".xlsx" className="hidden" aria-label="질의사항 엑셀 파일" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!contextReady||busy)return;const captured=key;saveEpoch.current++;busyRef.current=true;setBusy(true);setError('');void file.arrayBuffer().then(buffer=>readInquiryExcel(buffer,{projectId,department,authorId:actorId,authorName:actor.name})).then(result=>{if(current(captured))setPreview(selectImport(result));}).catch(e=>{if(current(captured))setError(e.message);}).finally(()=>{if(current(captured)){busyRef.current=false;setBusy(false);}});}}/>
  <input ref={photoUpload} type="file" accept="image/png,image/jpeg" multiple className="hidden" aria-label="질의사항 사진 파일" onChange={event=>{const row=shown[selection.end.row],files=Array.from(event.target.files||[]);event.target.value='';if(row)void addPhotos(files,row.id,columns[selection.end.column][0]);}}/>
  {preview&&contextReady&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-label="질의사항 엑셀 불러오기 확인" className="relative max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 text-slate-900 dark:bg-slate-900 dark:text-slate-100"><button aria-label="엑셀 불러오기 확인 닫기" className="absolute right-4 top-4 rounded p-2" onClick={()=>setPreview(null)}><X size={20}/></button><h3 className="pr-10 text-lg font-bold">{department} 질의사항 불러오기</h3><p className="mt-3 text-sm">대상: {project?.code} · <span data-no-translate>{project?.name}</span></p><p className="my-3 text-sm">질의 {preview.inquiries.length}개 · 연결 사진 {preview.inquiries.reduce((n,row)=>n+row.images.length,0)}개 · 표 밖 사진 {preview.unassignedImages.length}개</p><p className="text-sm">이 내용을 선택한 프로젝트에 추가합니다. 원본 파일은 수정하지 않습니다.</p>{!!preview.rounds?.length&&<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">원본의 차수별 발송 기록도 확인할 수 있습니다. 현재 프로젝트의 발송 상태는 관리자가 확인해 표시하세요.</p>}<ul className="my-4 max-h-44 overflow-auto text-sm">{preview.inquiries.slice(0,8).map(row=><li key={row.id} className="border-b border-slate-200 py-2 dark:border-slate-700">{row.no} · {row.trade} · {row.question.slice(0,100)}</li>)}</ul>{preview.warnings.map((warning,index)=><p key={index} className="mt-2 text-sm text-amber-900 dark:text-amber-200">{warning}</p>)}<div className="mt-5 flex justify-end gap-2"><button className={styles} onClick={()=>setPreview(null)}>취소</button><button className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white" onClick={()=>{const selected=selectImport(preview);apply({...value.current,rows:[...value.current.rows,...selected.inquiries],unassignedImages:[...value.current.unassignedImages,...selected.unassignedImages]});setTrade(selected.inquiries[0]?.trade||trade);setRoundNumber(selected.inquiries[0]?inquiryRoundNumber(selected.inquiries[0]):roundNumber);setEditing(true);setPreview(null);setNotice('불러왔습니다. 확인 후 저장하세요.');}}>현재 프로젝트에 불러오기</button></div></section></div>}
  {lightbox&&contextReady&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" onClick={()=>setLightbox(null)}><section role="dialog" aria-modal="true" aria-label="질의 도면 사진" className="relative max-h-[95vh] max-w-[95vw] overflow-auto bg-white p-3" onClick={event=>event.stopPropagation()}><button aria-label="도면 사진 닫기" className="sticky right-0 top-0 ml-auto block rounded bg-white p-2 text-slate-900" onClick={()=>setLightbox(null)}><X size={22}/></button><img src={lightbox.dataUrl} alt={lightbox.caption||lightbox.name} className="max-w-none"/><p className="text-sm text-slate-900">{lightbox.caption||lightbox.name}</p></section></div>}
  {translationOpen&&contextReady&&visible&&<div data-no-translate className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
   <section role="dialog" aria-modal="true" aria-label="AI 한국어 번역 확인" className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 text-slate-900 dark:bg-slate-900 dark:text-slate-100" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();closeKoreanTranslation();}
    if(event.key==='Tab'){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
   }}>
    <button aria-label="AI 번역 확인 닫기" disabled={busy} className="absolute right-4 top-4 rounded p-2 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40" onClick={closeKoreanTranslation}><X size={20}/></button>
    <h3 className="pr-10 text-lg font-bold">AI 한국어 번역</h3>
    <p className="mt-2 text-sm">{project?.code} · {project?.name} · {roundNumber}차 질의사항</p>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">베트남어·영어·한국어가 섞인 구분, 질의, 답변, 검토, 비고와 사진 설명을 한국어로 번역합니다.</p>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">숫자·단위·도면번호·사진은 유지합니다. 사진 속 글자와 읽기 전용 항목은 번역하지 않습니다.</p>
    <div className="my-4 flex flex-wrap items-center gap-3">
     <label className="text-sm font-semibold">번역 범위 <select autoFocus aria-label="AI 한국어 번역 범위" className={`${styles} ml-2`} disabled={busy} value={translationScope} onChange={event=>{setTranslationScope(event.target.value as 'ROUND'|'TRADE');setTranslationPreview(null);setError('');}}><option value="ROUND">현재 차수 · 모든 공종</option><option value="TRADE">현재 공종 · {trade}</option></select></label>
     <span className="text-sm text-slate-600 dark:text-slate-300">수정 가능한 질의 {translationTargets.length}개</span>
     <button className={styles} disabled={busy||!translationTargets.length||sent(roundNumber)} onClick={()=>void requestKoreanTranslation()}>{busy&&!translationPreview?'AI 번역 중…':translationPreview?'다시 번역':'번역 시작'}</button>
     {!!translationProgress.total&&<span role="status" className="text-sm text-slate-600 dark:text-slate-300">번역 요청 {translationProgress.completed} / {translationProgress.total}묶음 · 전체 결과를 확인한 뒤 변경합니다.</span>}
    </div>
    {error&&<p role="alert" className="my-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
    {translationPreview&&<div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
     <p role="status" className="text-sm font-semibold">원문과 비교하세요. 변경되는 질의 {translationChangeCount}개</p>
     {!translationMatchesSource(translationPreview)&&<p role="alert" className="text-sm text-rose-800 dark:text-rose-200">원문이나 선택한 화면이 변경되었습니다. 다시 번역한 뒤 확인하세요.</p>}
     {translationPreview.rows.map(row=>{const item=translationPreview.items.find(item=>item.id===row.id)!,pairs=koreanPairs(row,item);return <article key={row.id} className="border-b border-slate-200 pb-4 dark:border-slate-700">
      <h4 className="mb-2 text-sm font-bold">{row.trade} · No {row.no}</h4>
      {!pairs.length&&<p className="text-sm text-slate-600 dark:text-slate-300">변경 내용이 없습니다.</p>}
      {pairs.map((pair,index)=><div key={index} className="mb-3"><p className="mb-1 text-xs font-semibold">{pair.label}</p><div className="grid gap-3 md:grid-cols-2"><div><p className="mb-1 text-xs text-slate-600 dark:text-slate-300">원문</p><p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm [overflow-wrap:anywhere] dark:bg-slate-800">{pair.original||'—'}</p></div><div><p className="mb-1 text-xs text-blue-800 dark:text-blue-200">한국어</p><p lang="ko" className="whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-sm text-blue-950 [overflow-wrap:anywhere] dark:bg-blue-950 dark:text-blue-100">{pair.translated||'—'}</p></div></div></div>)}
     </article>;})}
    </div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
     <p className="text-xs text-slate-600 dark:text-slate-300">한국어로 변경한 뒤 확인하고 기존 저장 버튼으로 저장하세요. Ctrl+Z로 원문을 되돌릴 수 있습니다.</p>
     <div className="flex gap-2"><button className={styles} disabled={busy} onClick={closeKoreanTranslation}>취소</button><button className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50" disabled={busy||!translationPreview||!translationChangeCount||!translationMatchesSource(translationPreview)} onClick={()=>void applyKoreanTranslation()}>{busy&&translationPreview?'원문 확인 중…':'한국어로 변경'}</button></div>
    </div>
   </section>
  </div>}
  <span hidden>{historyVersion}</span>
 </div>;
}
