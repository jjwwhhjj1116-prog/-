import type {Inquiry,InquiryImage} from '../types/inquiries';
import {inquiryImageBytes} from '../services/inquiryExcel.ts';

export const inquiryClipboardMime='application/x-concost-inquiries';
const maxRows=100,maxText=20000,maxImageBytes=1024*1024;

/** Excel quotes cells containing delimiters; doubled quotes are literal quotes. */
export function encodeTsv(rows:readonly (readonly string[])[]):string{
 return rows.map(row=>row.map(cell=>!cell||/[\t\r\n"]/.test(cell)?`"${cell.replaceAll('"','""')}"`:cell).join('\t')).join('\r\n');
}

export function decodeTsv(raw:string):string[][]{
 const rows:string[][]=[],row:string[]=[];let cell='',quoted=false,closed=false;
 const endCell=()=>{if(cell.length>maxText)throw new Error('셀 내용은 20,000자 이하로 붙여넣어 주세요.');row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();rows.push(row.splice(0));if(rows.length>maxRows)throw new Error('한 번에 100행 이하로 붙여넣어 주세요.');};
 for(let i=0;i<raw.length;i++){
  const character=raw[i];
  if(quoted){
   if(character==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=character;
  }else if(character==='\t')endCell();
  else if(character==='\r'||character==='\n'){endRow();if(character==='\r'&&raw[i+1]==='\n')i++;}
  else if(character==='"'&&!cell&&!closed)quoted=true;
  else{if(closed||character==='"')throw new Error('붙여넣은 표의 셀 따옴표를 확인하세요.');cell+=character;}
  if(cell.length>maxText)throw new Error('셀 내용은 20,000자 이하로 붙여넣어 주세요.');
 }
 if(quoted)throw new Error('붙여넣은 표의 셀 따옴표가 닫히지 않았습니다.');
 // The final Excel CRLF terminates a record rather than creating an extra row.
 if(cell||row.length||closed||!rows.length)endRow();
 return rows;
}

type CopyTarget=Pick<Inquiry,'projectId'|'department'|'trade'|'authorId'|'authorName'>;
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('복사한 질의사항 내용을 확인하세요.');return value as Record<string,unknown>;};
const text=(value:unknown,max:number,label:string)=>{if(typeof value!=='string'||value.length>max)throw new Error(`${label} 내용을 확인하세요.`);return value;};
const identifier=(value:unknown,label:string)=>{const result=text(value,200,label);if(!result||[...result].some(character=>character.charCodeAt(0)<32))throw new Error(`${label} 연결을 확인하세요.`);return result;};

/** Copy content into a new draft; source ownership and workbook coordinates never travel. */
export function parseCopiedInquiryRows(raw:string,target:CopyTarget):Inquiry[]{
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('복사한 질의사항 JSON을 확인하세요.');}
 if(!Array.isArray(value)||value.length>maxRows)throw new Error('한 번에 100행 이하의 질의사항을 붙여넣어 주세요.');
 if(!['마감팀','구조팀','토목&조경팀'].includes(target.department))throw new Error('질의사항 대상 팀을 확인하세요.');
 const owner={projectId:identifier(target.projectId,'프로젝트'),department:target.department,trade:text(target.trade,200,'공종'),authorId:identifier(target.authorId,'작성자'),authorName:text(target.authorName,200,'작성자 이름')};
 const now=new Date().toISOString();
 return value.map(value=>{
  const row=object(value),strings:Record<string,string>={};
  for(const field of ['no','classification','group'])strings[field]=text(row[field]??'',200,field);
  for(const field of ['question','answer','review','notes'])strings[field]=text(row[field]??'',maxText,field);
  const drawings=row.drawingNumbers??[],pictures=row.images??[];
  if(!Array.isArray(drawings)||drawings.length>100)throw new Error('도면 번호는 100개 이하로 붙여넣어 주세요.');
  const drawingNumbers=drawings.map(value=>text(value,300,'도면 번호'));
  if(!Array.isArray(pictures)||pictures.length>4)throw new Error('사진은 질의사항당 최대 4개입니다.');
  let totalBytes=0;
  const images:InquiryImage[]=pictures.map(value=>{
   const photo=object(value),dataUrl=text(photo.dataUrl,1500000,'사진'),name=text(photo.name,300,'사진 이름');
   if(!['image/png','image/jpeg'].includes(String(photo.mimeType))||!['question','answer','review'].includes(String(photo.field)))throw new Error('사진 형식과 셀 위치를 확인하세요.');
   const mimeType=photo.mimeType as InquiryImage['mimeType'],field=photo.field as InquiryImage['field'];
   if(!dataUrl.startsWith(`data:${mimeType};base64,`)||!(mimeType==='image/png'?/\.png$/i:/\.jpe?g$/i).test(name))throw new Error('사진 이름과 실제 PNG·JPG 형식이 다릅니다.');
   totalBytes+=inquiryImageBytes(dataUrl).length;
   if(totalBytes>maxImageBytes)throw new Error('사진 합계는 질의사항당 1 MiB 이내로 줄여 주세요.');
   return {id:crypto.randomUUID(),name,mimeType,dataUrl,field,...(photo.caption!==undefined?{caption:text(photo.caption,1000,'사진 설명')}:{})};
  });
  return {...owner,id:crypto.randomUUID(),no:strings.no,classification:strings.classification,group:strings.group,drawingNumbers,question:strings.question,answer:strings.answer,review:strings.review,notes:strings.notes,images,status:'DRAFT',revision:0,createdAt:now,updatedAt:now};
 });
}
