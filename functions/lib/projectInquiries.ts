import type {Inquiry,InquiryImage,InquiryRound} from '../../scheduler-web/src/types/inquiries.ts';
import {inquiryRoundNumber} from '../../scheduler-web/src/utils/inquiryRounds.ts';
import {translateInquiryTexts} from './inquiryTranslation.ts';
import {assignmentPersonId,assignmentSegments} from '../../scheduler-web/src/utils/personalWork.ts';
import {canManageSchedule,isScheduleAdmin} from '../../scheduler-web/src/utils/schedulePermissions.ts';

const bodyLimit=1800000,imageLimit=1024*1024,projectLimit=8*1024*1024;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(error:string,status=400)=>json({error},status);
const invalid=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
const text=(value:unknown,max:number,label:string)=>{if(typeof value!=='string'||value.length>max)invalid(`${label} 내용을 확인하세요.`);return value as string;};
const smallId=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=200&&![...value].some(char=>char.charCodeAt(0)<32);
const numeric=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max;
function rasterHeader(bytes:Uint8Array,mime:string):boolean{
 if(mime==='image/png'){
  if(bytes.length<57||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,hasData=false;
  while(offset+12<=bytes.length){const size=view.getUint32(offset),kind=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(size>bytes.length-offset-12)return false;
   if(offset===8){if(kind!=='IHDR'||size!==13||!view.getUint32(offset+8)||!view.getUint32(offset+12)||view.getUint32(offset+8)>16384||view.getUint32(offset+12)>16384)return false;}
   if(kind==='IDAT')hasData=hasData||size>0;
   if(kind==='IEND')return size===0&&hasData&&offset+12===bytes.length&&[174,66,96,130].every((value,index)=>bytes[offset+8+index]===value);
   offset+=size+12;
  }return false;
 }
 if(bytes.length<25||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return false;
 let offset=2,frame=false;
 while(offset+4<bytes.length){if(bytes[offset++]!==255)return false;while(bytes[offset]===255)offset++;const marker=bytes[offset++],size=bytes[offset]*256+bytes[offset+1];if(size<2||offset+size>bytes.length-2)return false;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(size<8)return false;const height=bytes[offset+3]*256+bytes[offset+4],width=bytes[offset+5]*256+bytes[offset+6];if(!width||!height||width>16384||height>16384)return false;frame=true;}
  if(marker===218)return frame&&size>=6;offset+=size;
 }return false;
}

async function input(request:Request):Promise<any>{
 const reader=request.body?.getReader();if(!reader)invalid('저장할 내용을 확인하세요.');
 const chunks:Uint8Array[]=[],decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0;
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000){await reader.cancel();invalid('질의사항 저장 용량을 초과했습니다. 이미지를 줄여 주세요.',413);}chunks.push(part.value);}
 const joined=new Uint8Array(bytes);let offset=0;for(const part of chunks){joined.set(part,offset);offset+=part.byteLength;}
 try{return JSON.parse(decoder.decode(joined));}catch{invalid('저장 요청의 내용을 확인하세요.');}
}

function imageBytes(image:InquiryImage):number{
 if(!image||!smallId(image.id)||!['question','answer','review'].includes(image.field)||!['image/png','image/jpeg'].includes(image.mimeType))invalid('질의사항 이미지 형식과 위치를 확인하세요.');
 text(image.name,300,'이미지 이름');
 if(!(image.mimeType==='image/png'?/\.png$/i:/\.jpe?g$/i).test(image.name))invalid('이미지 파일명과 형식이 다릅니다. PNG 또는 JPG 파일을 사용하세요.');
 if(image.caption!==undefined)text(image.caption,1000,'이미지 설명');
 if(typeof image.dataUrl!=='string'||image.dataUrl.length>1500000)invalid('이미지 용량을 줄여 주세요.',413);
 const prefix=`data:${image.mimeType};base64,`;if(!image.dataUrl.startsWith(prefix))invalid('PNG·JPG 이미지 원본만 저장할 수 있습니다.');
 const encoded=image.dataUrl.slice(prefix.length);if(!encoded||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))invalid('이미지 원본이 손상되었습니다.');
 const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));if(bytes.length>imageLimit)invalid('이미지 합계는 1 MiB 이내로 줄여 주세요.',413);
 if(!rasterHeader(bytes,image.mimeType))invalid('이미지의 실제 형식이 PNG·JPG와 일치하지 않습니다.');
 if(image.sourceAnchor!==undefined){const anchor=image.sourceAnchor,point=(point:any)=>point&&numeric(point.col,16384)&&numeric(point.row,1048576)&&([['nativeCol',16383,0],['nativeRow',1048575,0],['nativeColOff',1000000000,-1],['nativeRowOff',1000000000,-1]] as const).every(([key,max,min])=>point[key]===undefined||Number.isInteger(point[key])&&point[key]>=min&&point[key]<=max);if(!anchor||!point(anchor.tl)||anchor.br!==undefined&&!point(anchor.br)||anchor.width!==undefined&&!numeric(anchor.width,100000)||anchor.height!==undefined&&!numeric(anchor.height,100000))invalid('이미지의 Excel 위치를 확인하세요.');}
 return bytes.length;
}

function contents(value:any):Pick<Inquiry,'no'|'trade'|'classification'|'group'|'drawingNumbers'|'question'|'answer'|'review'|'notes'|'images'|'sourceSheet'|'sourceRow'|'excelLayout'>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('질의사항 내용을 확인하세요.');
 const result:any={};for(const [key,label] of [['no','번호'],['trade','공종'],['classification','구분'],['group','분류']])result[key]=text(value[key],200,label);
 for(const [key,label] of [['question','질의'],['answer','답변'],['review','검토·산출 사항'],['notes','비고']])result[key]=text(value[key],20000,label);
 if(!Array.isArray(value.drawingNumbers)||value.drawingNumbers.length>100)invalid('도면 번호를 확인하세요.');result.drawingNumbers=value.drawingNumbers.map((number:unknown)=>text(number,300,'도면 번호'));
 if(!Array.isArray(value.images)||value.images.length>4)invalid('이미지는 질의사항당 최대 4개입니다.');
 if(new Set(value.images.map((image:any)=>image?.id)).size!==value.images.length)invalid('중복된 이미지 ID를 확인하세요.');
 if(value.images.reduce((total:number,image:InquiryImage)=>total+imageBytes(image),0)>imageLimit)invalid('이미지 합계는 1 MiB 이내로 줄여 주세요.',413);
 result.images=value.images.map((image:InquiryImage)=>({id:image.id,name:image.name,mimeType:image.mimeType,dataUrl:image.dataUrl,field:image.field,...(image.caption!==undefined?{caption:image.caption}:{}),...(image.sourceAnchor!==undefined?{sourceAnchor:image.sourceAnchor}:{})}));
 if(value.sourceSheet!==undefined)result.sourceSheet=text(value.sourceSheet,200,'원본 시트');
 if(value.sourceRow!==undefined){if(!Number.isInteger(value.sourceRow)||value.sourceRow<1||value.sourceRow>1048576)invalid('원본 Excel 행을 확인하세요.');result.sourceRow=value.sourceRow;}
 if(value.excelLayout!==undefined){const layout=value.excelLayout;if(!layout||!Number.isInteger(layout.rowSpan)||layout.rowSpan<1||layout.rowSpan>100||!Array.isArray(layout.rowHeights)||layout.rowHeights.length>100||layout.rowHeights.some((height:unknown)=>!numeric(height,500))||!Array.isArray(layout.columnWidths)||layout.columnWidths.length>32||layout.columnWidths.some((width:unknown)=>!numeric(width,500)))invalid('원본 Excel 셀 크기를 확인하세요.');result.excelLayout={rowSpan:layout.rowSpan,rowHeights:layout.rowHeights,columnWidths:layout.columnWidths,reviewHeader:text(layout.reviewHeader,200,'검토 열 제목')};if(layout.headers!==undefined){if(!Array.isArray(layout.headers)||layout.headers.length!==8)invalid('원본 Excel 제목을 확인하세요.');result.excelLayout.headers=layout.headers.map((header:unknown)=>text(header,200,'Excel 제목'));}if(layout.mergedColumns!==undefined){if(!Array.isArray(layout.mergedColumns)||layout.mergedColumns.length>8||new Set(layout.mergedColumns).size!==layout.mergedColumns.length||layout.mergedColumns.some((column:unknown)=>!Number.isInteger(column)||!numeric(column,7)))invalid('원본 Excel 병합 열을 확인하세요.');result.excelLayout.mergedColumns=layout.mergedColumns;}}
 return result;
}

export async function projectInquiryRoute(request:Request,env:any,user:any,route:string):Promise<Response|null>{
 if(route.split('/')[0]!=='inquiries')return null;
 const translate=route==='inquiries/translate-korean',roundMatch=route.match(/^inquiries\/rounds\/([0-9]+)\/(send|reopen)$/),match=translate?null:route.match(/^inquiries\/([^/]+)(?:\/(register|restore))?$/),method=request.method,db=env.DB;
 if(route!=='inquiries'&&!match&&!roundMatch&&!translate)return fail('지원하지 않는 요청입니다.',404);
 if(route==='inquiries'?method!=='GET':translate||roundMatch||match?.[2]?method!=='POST':!['PUT','DELETE'].includes(method))return fail('지원하지 않는 요청입니다.',405);
 let body:any,id:string|undefined;
 try{if(method!=='GET')body=await input(request);if(match){id=decodeURIComponent(match[1]);if(!smallId(id))invalid('질의사항 ID를 확인하세요.');}}catch(error){return fail((error as Error).message,(error as any).status||400);}
 if(method!=='GET'&&(!body||typeof body!=='object'||Array.isArray(body)))return fail('저장 요청의 내용을 확인하세요.');
 if(body&&body.actorId!==user.id)return fail('로그인 사용자가 변경되었습니다. 입력을 보존하고 다시 확인하세요.',403);
 const row=id?await db.prepare('SELECT * FROM studio_project_inquiries WHERE id=?').bind(id).first():null;
 if(match?.[2]&&!row)return fail('저장된 질의사항을 찾을 수 없습니다.',404);
 const projectId=method==='GET'?new URL(request.url).searchParams.get('projectId'):translate||roundMatch?body?.projectId:row?.project_id||body?.inquiry?.projectId;
 if(!smallId(projectId))return fail('프로젝트를 선택하세요.');
 const projectRow=await db.prepare('SELECT * FROM studio_projects WHERE id=?').bind(projectId).first();if(!projectRow)return fail('중앙 저장된 프로젝트를 찾을 수 없습니다.',404);
 const project=JSON.parse(projectRow.body),department=method==='GET'?new URL(request.url).searchParams.get('department')||project.department:body.department||body.inquiry?.department||row?.department||project.department;
 if(!['마감팀','구조팀','토목&조경팀'].includes(department))return fail('질의사항 팀을 확인하세요.');
 if(row&&row.department!==department)return fail('질의사항의 팀 연결을 변경할 수 없습니다.');
 const storedProfile=JSON.parse(user.profile),profile={...storedProfile,id:user.id,department:user.department,position:user.position};
 const admin=storedProfile.id===user.id&&isScheduleAdmin(profile),manage=admin||canManageSchedule(profile,department,false);
 const archived=Boolean(await db.prepare('SELECT project_id FROM studio_project_archive WHERE project_id=?').bind(projectId).first());
 const directoryRows=(await db.prepare('SELECT id,profile,active FROM studio_users').all()).results;
 const directory=directoryRows.map((record:any)=>{const person=JSON.parse(record.profile);return {...(person.id===record.id?person:{}),id:record.id,active:record.active===1};});
 const code=typeof project.code==='string'?project.code.trim().toUpperCase():'';
 const siteReadRows=(await db.prepare('SELECT id,body,revision FROM studio_projects').all()).results.filter((record:any)=>record.id===projectId||code&&JSON.parse(record.body).code?.trim().toUpperCase()===code);
 const siteIds=siteReadRows.map((record:any)=>record.id),siteSql=siteIds.map(()=>'?').join(',');
 const archivedIds=new Set((await db.prepare('SELECT project_id FROM studio_project_archive').all()).results.map((record:any)=>record.project_id));
 const siteRows=siteReadRows.filter((record:any)=>!archivedIds.has(record.id));
 const sitePmRows=siteRows.filter((record:any)=>{const site=JSON.parse(record.body),pm={...site.roles,...site.subTasks}.PM;return assignmentPersonId(site.pmId,directory)===user.id||pm&&assignmentSegments(pm).some(segment=>segment.personIds.some(reference=>assignmentPersonId(reference,directory)===user.id));});
 const sitePm=sitePmRows.length>0;
 const canWrite=admin||user.department===department||sitePm;
 const capabilities={projectId,projectIds:siteIds,writableProjectIds:siteRows.map((record:any)=>record.id),actorId:user.id,canCreate:canWrite&&!archived,canEdit:canWrite&&!archived,canManage:manage&&!archived};
 const decodeRow=(record:any):Inquiry=>{const inquiry=JSON.parse(record.body);return {...inquiry,roundNumber:inquiryRoundNumber(inquiry),revision:record.revision};};
 const roundRows=(await db.prepare(`SELECT * FROM studio_inquiry_rounds WHERE project_id IN (${siteSql}) AND department=? ORDER BY project_id,round_number`).bind(...siteIds,department).all()).results;
 const roundState=(number:number):any=>roundRows.find((record:any)=>record.round_number===number&&record.status==='SENT')||roundRows.find((record:any)=>record.round_number===number&&record.project_id===projectId)||roundRows.find((record:any)=>record.round_number===number);
 const pmGuard=sitePm&&!admin&&user.department!==department?sitePmRows.map(()=> 'EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM studio_project_archive WHERE project_id=?)').join(' AND '):'';
 const siteGuard="(SELECT COALESCE(json_group_array(id),'[]') FROM (SELECT id FROM studio_projects WHERE id=? OR (?<>'' AND upper(trim(json_extract(body,'$.code')))=?) ORDER BY id))=?";
 const accessGuard='EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM studio_project_archive WHERE project_id=?) AND EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND profile=? AND department=? AND position=?)'+(pmGuard?' AND '+pmGuard:'')+' AND '+siteGuard;
 const accessParams=[projectId,projectRow.revision,projectId,user.id,user.profile,user.department,user.position,...(pmGuard?sitePmRows.flatMap((record:any)=>[record.id,record.revision,record.id]):[]),projectId,code,code,JSON.stringify([...siteIds].sort())];
 if(method==='GET'){
  const rows=await db.prepare(`SELECT * FROM studio_project_inquiries WHERE project_id IN (${siteSql}) AND department=? ORDER BY updated_at DESC,id`).bind(...siteIds,department).all();
  const includeDeleted=new URL(request.url).searchParams.get('includeDeleted')==='1';
  const inquiries=rows.results.filter((record:any)=>manage||record.author_id===user.id||record.status==='REGISTERED').map(decodeRow).filter((inquiry:Inquiry)=>inquiry.deletedAt?includeDeleted&&(manage||inquiry.authorId===user.id):true);
  const rounds=new Map<string,InquiryRound>(roundRows.map((record:any)=>[`${record.project_id}:${record.round_number}`,{...JSON.parse(record.body),revision:record.revision}]));
  for(const inquiry of inquiries){const key=`${inquiry.projectId}:${inquiry.roundNumber}`;if(!rounds.has(key))rounds.set(key,{projectId:inquiry.projectId,department,roundNumber:inquiry.roundNumber!,status:'DRAFT',revision:0,createdAt:inquiry.createdAt,updatedAt:inquiry.updatedAt});}
  return json({inquiries,rounds:[...rounds.values()].sort((a,b)=>a.roundNumber-b.roundNumber),capabilities});
 }
 if(!canWrite)return fail('본인 팀 또는 담당 PM 현장의 질의사항만 작성할 수 있습니다.',403);
 if(archived)return fail('보관된 프로젝트의 질의사항은 변경할 수 없습니다.',409);
 if(translate){
  if(body.department!==department)return fail('번역할 프로젝트·팀 연결을 확인하세요.');
  const records=(await db.prepare(`SELECT * FROM studio_project_inquiries WHERE project_id IN (${siteSql}) AND department=?`).bind(...siteIds,department).all()).results;
  if(Array.isArray(body.items)&&body.items.some((item:any)=>{const record=records.find((row:any)=>row.id===item?.id);return record&&!manage&&record.status!=='REGISTERED'&&record.author_id!==user.id;}))return fail('다른 작성자의 비공개 초안은 번역할 수 없습니다.',403);
  // The validator receives the shared read scope; stored row bodies and source project IDs stay intact.
  return translateInquiryTexts(body,env,projectId,records.map((record:any)=>({...record,project_id:projectId})),roundRows,async()=>{
   const {sessionUser}=await import('./collaboration.ts'),currentUser=await sessionUser(request,env);
   if(!currentUser||currentUser.id!==user.id||currentUser.profile!==user.profile||currentUser.department!==user.department||currentUser.position!==user.position)return false;
   const currentProject=await db.prepare('SELECT revision FROM studio_projects WHERE id=?').bind(projectId).first();
   if(currentProject?.revision!==projectRow.revision||await db.prepare('SELECT project_id FROM studio_project_archive WHERE project_id=?').bind(projectId).first())return false;
   const currentRounds=(await db.prepare(`SELECT project_id,round_number,revision,status FROM studio_inquiry_rounds WHERE project_id IN (${siteSql}) AND department=? ORDER BY project_id,round_number`).bind(...siteIds,department).all()).results;
   const roundVersions=(rows:any[])=>JSON.stringify(rows.map(record=>[record.project_id,record.round_number,record.revision,record.status]));
   if(roundVersions(currentRounds)!==roundVersions(roundRows)||currentRounds.some((record:any)=>record.round_number===body.roundNumber&&record.status==='SENT'))return false;
   for(const source of siteReadRows){const latest=await db.prepare('SELECT revision FROM studio_projects WHERE id=?').bind(source.id).first();if(latest?.revision!==source.revision)return false;}
   for(const item of body.items){const previous=records.find((record:any)=>record.id===item.id),latest=await db.prepare('SELECT project_id,revision FROM studio_project_inquiries WHERE id=?').bind(item.id).first();if(previous?latest?.project_id!==previous.project_id||latest.revision!==previous.revision:Boolean(latest))return false;}
   return true;
  });
 }
 if(roundMatch){
  if(!manage)return fail('팀 관리자만 발송 상태를 변경할 수 있습니다.',403);
  const number=Number(roundMatch[1]);if(!Number.isInteger(number)||number<1||number>999)return fail('질의사항 차수를 확인하세요.');
  const currentRows=roundRows.filter((record:any)=>record.round_number===number),current=currentRows.find((record:any)=>record.project_id===projectId);
  const send=roundMatch[2]==='send',sentRows=currentRows.filter((record:any)=>record.status==='SENT');
  if(send?sentRows.length>0:sentRows.length===0)return fail(send?'이미 발송완료로 표시된 차수입니다.':'발송완료인 차수만 표시를 취소할 수 있습니다.',409);
  if(body.revision!==(current?.revision||0))return fail('다른 화면에서 발송 상태가 변경되었습니다. 최신 목록을 확인하세요.',409);
  if(body.roundVersions!==undefined){const versions=body.roundVersions;if(!Array.isArray(versions)||versions.some((value:any)=>!value||!smallId(value.projectId)||!Number.isInteger(value.revision)||value.revision<1)||new Set(versions.map((value:any)=>value.projectId)).size!==versions.length||versions.length!==currentRows.length||currentRows.some((record:any)=>!versions.some((value:any)=>value.projectId===record.project_id&&value.revision===record.revision)))return fail('다른 화면에서 차수 상태가 변경되었습니다. 최신 목록을 확인하세요.',409);}
  else if(!send&&sentRows.length>1)return fail('여러 원본의 발송 상태를 최신 목록에서 함께 확인하세요.',409);
  const records=(await db.prepare(`SELECT * FROM studio_project_inquiries WHERE project_id IN (${siteSql}) AND department=? ORDER BY id`).bind(...siteIds,department).all()).results;
  const inquiries=records.map(decodeRow).filter((inquiry:Inquiry)=>inquiry.roundNumber===number&&!inquiry.deletedAt);
  if(send){
   if(!inquiries.length)return fail('저장된 질의사항이 있는 차수만 발송완료로 표시할 수 있습니다.');
   const versions=body.inquiryVersions;
   if(!Array.isArray(versions)||versions.length>10000||versions.some((value:any)=>!value||!smallId(value.id)||!Number.isInteger(value.revision)||value.revision<1)||new Set(versions.map((value:any)=>value.id)).size!==versions.length)return fail('발송 확인할 질의사항 목록과 버전을 확인하세요.');
   const expected=new Map(versions.map((value:any)=>[value.id,value.revision]));
   if(expected.size!==inquiries.length||inquiries.some((inquiry:Inquiry)=>expected.get(inquiry.id)!==inquiry.revision))return fail('새 질의 또는 수정 내용이 있습니다. 최신 저장 목록을 확인한 뒤 발송완료를 표시하세요.',409);
  }
  const targets=send?[{project_id:projectId,record:current}]:sentRows.map((record:any)=>({project_id:record.project_id,record}));
  if(targets.some((target:any)=>archivedIds.has(target.project_id)))return fail('보관된 원본 프로젝트의 발송 상태는 변경할 수 없습니다.',409);
  const now=new Date().toISOString(),snapshot=JSON.stringify(records.map((record:any)=>[record.id,record.revision]));
  const versionGuard=`(SELECT COALESCE(json_group_array(json_array(id,revision)),'[]') FROM (SELECT id,revision FROM studio_project_inquiries WHERE project_id IN (${siteSql}) AND department=? ORDER BY id))=?`;
  const roundsSnapshot=JSON.stringify(roundRows.map((record:any)=>[record.project_id,record.round_number,record.revision,record.status]));
  const roundsGuard=`(SELECT COALESCE(json_group_array(json_array(project_id,round_number,revision,status)),'[]') FROM (SELECT project_id,round_number,revision,status FROM studio_inquiry_rounds WHERE project_id IN (${siteSql}) AND department=? ORDER BY project_id,round_number))=?`;
  const scopeGuard=`${accessGuard} AND ${versionGuard} AND ${roundsGuard}`,params=[...accessParams,...siteIds,department,snapshot,...siteIds,department,roundsSnapshot];
  const nextRounds:InquiryRound[]=[],writes:any[]=[];
  for(const target of targets){const oldRound=target.record?JSON.parse(target.record.body):null,round:Omit<InquiryRound,'revision'>={projectId:target.project_id,department,roundNumber:number,status:send?'SENT':'DRAFT',createdAt:oldRound?.createdAt||inquiries[0]?.createdAt||now,updatedAt:now,...(send?{sentAt:now,sentBy:user.id,sentByName:user.name}:{})};
   const serialized=JSON.stringify(round),targetGuard=`${accessGuard} AND ${versionGuard} AND NOT EXISTS(SELECT 1 FROM studio_project_archive WHERE project_id=?)`;
   const targetParams=[...accessParams,...siteIds,department,snapshot,target.project_id];
   writes.push(target.record?db.prepare(`UPDATE studio_inquiry_rounds SET body=?,status=?,revision=revision+1,updated_at=? WHERE project_id=? AND department=? AND round_number=? AND revision=? AND ${targetGuard}`).bind(serialized,round.status,now,target.project_id,department,number,target.record.revision,...targetParams):db.prepare(`INSERT OR IGNORE INTO studio_inquiry_rounds(project_id,department,round_number,status,body,revision,updated_at) SELECT ?,?,?,?,?,1,? WHERE ${scopeGuard}`).bind(target.project_id,department,number,round.status,serialized,now,...params));
   writes.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE changes()<>1'));
   nextRounds.push({...round,revision:(target.record?.revision||0)+1});
  }
  try{await db.batch([db.prepare(`INSERT INTO studio_write_assertions SELECT 0 WHERE NOT (${scopeGuard})`).bind(...params),...writes]);}catch{return fail('동시에 질의사항 또는 발송 상태가 변경되었습니다. 최신 내용을 확인하세요.',409);}
  return json({round:nextRounds.find(round=>round.projectId===projectId)||nextRounds[0],rounds:nextRounds});
 }
 if(method==='DELETE'&&!row)return fail('저장된 질의사항을 찾을 수 없습니다.',404);
 if(body.projectId!==undefined&&body.projectId!==projectId)return fail('프로젝트 연결을 변경할 수 없습니다.');
 if(row&&method!=='PUT'&&!manage&&row.author_id!==user.id)return fail('작성자 또는 팀 관리자만 삭제·복구·등록할 수 있습니다.',403);
 if(row&&body.revision!==row.revision)return fail('다른 화면에서 질의사항이 변경되었습니다. 입력을 보존하고 다시 확인하세요.',409);
 if(!row&&body.revision!==undefined&&body.revision!==0)return fail('새 질의사항의 버전을 확인하세요.',409);
 const old=row?JSON.parse(row.body):null,now=new Date().toISOString();let inquiry:any;
 try{
  if(method==='DELETE'){if(old.deletedAt)return fail('이미 삭제된 질의사항입니다. 목록을 갱신하세요.',409);inquiry={...old,deletedAt:now,deletedBy:user.id,deletedByName:user.name};}
  else if(match?.[2]==='restore'){if(!old.deletedAt)return fail('삭제된 질의사항만 복구할 수 있습니다.',409);inquiry={...old};delete inquiry.deletedAt;delete inquiry.deletedBy;delete inquiry.deletedByName;}
  else if(old?.deletedAt)return fail('삭제된 질의사항은 복구한 뒤 수정하세요.',409);
  else if(match?.[2]==='register'){if(row.status!=='DRAFT')return fail('이미 공유 저장된 질의사항입니다. 목록을 갱신하세요.',409);inquiry={...old,status:'REGISTERED',registeredAt:now};}
  else{const source=body.inquiry;if(!source||source.id!==id||source.projectId!==projectId||source.department!==department)invalid('프로젝트·팀·질의사항 연결을 변경할 수 없습니다.');if(source.authorId&&source.authorId!==(old?.authorId||user.id))invalid('질의사항 작성자를 변경할 수 없습니다.');if(source.roundNumber!==undefined&&(!Number.isInteger(source.roundNumber)||source.roundNumber<1||source.roundNumber>999))invalid('질의사항 차수는 1~999로 입력하세요.');inquiry={...contents(source),id,projectId,department,roundNumber:inquiryRoundNumber(source),status:'REGISTERED',authorId:old?.authorId||user.id,authorName:old?.authorName||user.name,createdAt:old?.createdAt||now,updatedAt:now,registeredAt:old?.registeredAt||now};}
  inquiry.updatedAt=now;inquiry.updatedBy=user.id;inquiry.updatedByName=user.name;delete inquiry.revision;
  if(method!=='DELETE'&&match?.[2]!=='restore'&&inquiry.status==='REGISTERED'&&(!inquiry.trade.trim()||!inquiry.question.trim()&&!inquiry.images.some((image:InquiryImage)=>image.field==='question')))invalid('공종과 질의 내용 또는 질의 이미지를 입력하세요.');
 }catch(error){return fail((error as Error).message,(error as any).status||400);}
 const affectedRounds=[...new Set([...(old?[inquiryRoundNumber(old)]:[]),inquiryRoundNumber(inquiry)])];
 if(affectedRounds.some(number=>roundState(number)?.status==='SENT'))return fail('발송완료 차수는 표시를 취소한 뒤 수정·삭제·복구하세요.',409);
 const serialized=JSON.stringify(inquiry),byteLength=new TextEncoder().encode(serialized).byteLength;
 if(byteLength>bodyLimit)return fail('질의사항 저장 용량을 초과했습니다. 이미지를 줄여 주세요.',413);
 const roundGuard=affectedRounds.map(()=>`NOT EXISTS(SELECT 1 FROM studio_inquiry_rounds WHERE project_id IN (${siteSql}) AND department=? AND round_number=? AND status='SENT')`).join(' AND ');
 const guard=`${accessGuard} AND ${roundGuard} AND (SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) FROM studio_project_inquiries WHERE project_id IN (${siteSql}) AND department=? AND id<>?)+?<=?`;
 const params=[...accessParams,...affectedRounds.flatMap(number=>[...siteIds,department,number]),...siteIds,department,id,byteLength,projectLimit];
 const saved=row?await db.prepare(`UPDATE studio_project_inquiries SET body=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND ${guard}`).bind(serialized,inquiry.status,now,id,row.revision,...params).run():await db.prepare(`INSERT OR IGNORE INTO studio_project_inquiries(id,project_id,department,author_id,status,body,revision,updated_at) SELECT ?,?,?,?,?,?,1,? WHERE ${guard}`).bind(id,projectId,department,user.id,inquiry.status,serialized,now,...params).run();
 if(!saved.meta.changes)return fail('동시 변경 또는 저장 용량 초과입니다. 입력을 보존하고 최신 배정·내용을 확인하세요.',409);
 return json({inquiry:{...inquiry,roundNumber:inquiryRoundNumber(inquiry),revision:(row?.revision||0)+1}});
}
