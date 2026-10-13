import type {Inquiry,InquiryImage} from '../../scheduler-web/src/types/inquiries.ts';
import {assignmentAliases,assignmentSegments,taskAssignedTo} from '../../scheduler-web/src/utils/personalWork.ts';
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
 const match=route.match(/^inquiries\/([^/]+)(?:\/(register))?$/),method=request.method,db=env.DB;
 if(route!=='inquiries'&&!match)return fail('지원하지 않는 요청입니다.',404);
 if(route==='inquiries'?method!=='GET':match?.[2]?method!=='POST':method!=='PUT')return fail('지원하지 않는 요청입니다.',405);
 let body:any,id:string|undefined;
 try{if(method!=='GET')body=await input(request);if(match){id=decodeURIComponent(match[1]);if(!smallId(id))invalid('질의사항 ID를 확인하세요.');}}catch(error){return fail((error as Error).message,(error as any).status||400);}
 if(method!=='GET'&&(!body||typeof body!=='object'||Array.isArray(body)))return fail('저장 요청의 내용을 확인하세요.');
 if(body&&body.actorId!==user.id)return fail('로그인 사용자가 변경되었습니다. 입력을 보존하고 다시 확인하세요.',403);
 const row=id?await db.prepare('SELECT * FROM studio_project_inquiries WHERE id=?').bind(id).first():null;
 if(match?.[2]&&!row)return fail('저장된 질의사항을 찾을 수 없습니다.',404);
 const projectId=method==='GET'?new URL(request.url).searchParams.get('projectId'):row?.project_id||body?.inquiry?.projectId;
 if(!smallId(projectId))return fail('프로젝트를 선택하세요.');
 const projectRow=await db.prepare('SELECT * FROM studio_projects WHERE id=?').bind(projectId).first();if(!projectRow)return fail('중앙 저장된 프로젝트를 찾을 수 없습니다.',404);
 const project=JSON.parse(projectRow.body),storedProfile=JSON.parse(user.profile),profile={...storedProfile,id:user.id,department:user.department,position:user.position};
 const admin=storedProfile.id===user.id&&isScheduleAdmin(profile),manage=admin||canManageSchedule(profile,project.department,false);
 if(!admin&&user.department!==project.department)return fail('해당 팀의 질의사항만 열람할 수 있습니다.',403);
 const archived=Boolean(await db.prepare('SELECT project_id FROM studio_project_archive WHERE project_id=?').bind(projectId).first());
 const directoryRows=manage?[]:(await db.prepare('SELECT id,profile,active FROM studio_users').all()).results;
 const directory=directoryRows.map((record:any)=>{const person=JSON.parse(record.profile);return {...(person.id===record.id?person:{}),id:record.id,active:record.active===1};});
 const aliases=assignmentAliases({id:user.id},directory);
 const assigned=manage||Object.values({...project.roles,...project.subTasks}).some((task:any)=>task&&assignmentSegments(task).some(segment=>taskAssignedTo(segment,user.id,aliases)));
 if(!assigned)return fail('현재 프로젝트에 배정된 직원만 질의사항을 이용할 수 있습니다.',403);
 const capabilities={projectId,actorId:user.id,canCreate:!archived,canManage:manage&&!archived};
 if(method==='GET'){
  const rows=await db.prepare('SELECT * FROM studio_project_inquiries WHERE project_id=? ORDER BY updated_at DESC,id').bind(projectId).all();
  return json({inquiries:rows.results.filter((record:any)=>manage||record.author_id===user.id||record.status==='REGISTERED').map((record:any)=>({...JSON.parse(record.body),revision:record.revision})),capabilities});
 }
 if(archived)return fail('보관된 프로젝트의 질의사항은 변경할 수 없습니다.',409);
 if(row&&!manage&&row.author_id!==user.id)return fail('본인이 작성한 질의사항만 변경할 수 있습니다.',403);
 if(row&&body.revision!==row.revision)return fail('다른 화면에서 질의사항이 변경되었습니다. 입력을 보존하고 다시 확인하세요.',409);
 if(!row&&body.revision!==undefined&&body.revision!==0)return fail('새 질의사항의 버전을 확인하세요.',409);
 const old=row?JSON.parse(row.body):null,now=new Date().toISOString();let inquiry:any;
 try{
  if(match?.[2]){if(row.status!=='DRAFT')return fail('이미 등록된 질의사항입니다. 목록을 갱신하세요.',409);inquiry={...old,status:'REGISTERED',registeredAt:now};}
  else{const source=body.inquiry;if(!source||source.id!==id||source.projectId!==projectId||source.department!==project.department)invalid('프로젝트·팀·질의사항 연결을 변경할 수 없습니다.');if(source.authorId&&source.authorId!==(old?.authorId||user.id))invalid('질의사항 작성자를 변경할 수 없습니다.');inquiry={...contents(source),id,projectId,department:project.department,status:row?.status||'DRAFT',authorId:old?.authorId||user.id,authorName:old?.authorName||user.name,createdAt:old?.createdAt||now,updatedAt:now,...(old?.registeredAt?{registeredAt:old.registeredAt}:{})};}
  inquiry.updatedAt=now;delete inquiry.revision;
  if(inquiry.status==='REGISTERED'&&(!inquiry.trade.trim()||!inquiry.question.trim()&&!inquiry.images.some((image:InquiryImage)=>image.field==='question')))invalid('공종과 질의 내용 또는 질의 이미지를 입력하세요.');
 }catch(error){return fail((error as Error).message,(error as any).status||400);}
 const serialized=JSON.stringify(inquiry),byteLength=new TextEncoder().encode(serialized).byteLength;
 if(byteLength>bodyLimit)return fail('질의사항 저장 용량을 초과했습니다. 이미지를 줄여 주세요.',413);
 const guard='EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM studio_project_archive WHERE project_id=?) AND EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND profile=? AND department=? AND position=?) AND (SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) FROM studio_project_inquiries WHERE project_id=? AND id<>?)+?<=?';
 const params=[projectId,projectRow.revision,projectId,user.id,user.profile,user.department,user.position,projectId,id,byteLength,projectLimit];
 const saved=row?await db.prepare(`UPDATE studio_project_inquiries SET body=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND ${guard}`).bind(serialized,inquiry.status,now,id,row.revision,...params).run():await db.prepare(`INSERT OR IGNORE INTO studio_project_inquiries(id,project_id,department,author_id,status,body,revision,updated_at) SELECT ?,?,?,?,?,?,1,? WHERE ${guard}`).bind(id,projectId,project.department,user.id,'DRAFT',serialized,now,...params).run();
 if(!saved.meta.changes)return fail('동시 변경 또는 저장 용량 초과입니다. 입력을 보존하고 최신 배정·내용을 확인하세요.',409);
 return json({inquiry:{...inquiry,revision:(row?.revision||0)+1}});
}
