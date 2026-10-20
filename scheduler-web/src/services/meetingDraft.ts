import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export interface MeetingDraft {
 title:string;meetingDate:string;location:string;clientName:string;
 attendeesInternal:string[];attendeesExternal:string[];
 notesAndInstructions:string;summary:string;decisions:string[];transcript:string;
}
const textLimit=300_000;
const wordNs='http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export async function meetingSource(file:File):Promise<{text?:string;file?:File}>{
 const ext=file.name.split('.').at(-1)?.toLowerCase()||'';
 if(['txt','csv'].includes(ext)){
  if(file.size>1_000_000)throw new Error('텍스트 녹취록은 1MB 이하로 나눠 첨부해 주세요.');
  const text=(await file.text()).replace(/^\uFEFF/,'');
  if(!text.trim()||text.length>textLimit)throw new Error('텍스트 내용이 없거나 너무 깁니다. 나눠 첨부해 주세요.');
  return{text};
 }
 if(ext==='docx'){
  if(file.size>10_000_000)throw new Error('워드 녹취록은 10MB 이하로 나눠 첨부해 주세요.');
  const zip=await JSZip.loadAsync(file);
  const xml=await zip.file('word/document.xml')?.async('text');
  if(!xml)throw new Error('워드 본문을 찾을 수 없습니다.');
  const document=new DOMParser().parseFromString(xml,'application/xml');
  if(document.querySelector('parsererror'))throw new Error('워드 본문을 읽지 못했습니다.');
  const text=[...document.getElementsByTagNameNS(wordNs,'p')].map(p=>[...p.getElementsByTagNameNS(wordNs,'t')].map(t=>t.textContent||'').join('')).filter(Boolean).join('\n');
  if(!text.trim()||text.length>textLimit)throw new Error('워드 본문이 없거나 너무 깁니다. 나눠 첨부해 주세요.');
  return{text};
 }
 if(['xlsx','xls'].includes(ext)){
  if(file.size>10_000_000)throw new Error('엑셀 회의자료는 10MB 이하로 나눠 첨부해 주세요.');
  const book=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const text=book.SheetNames.map(name=>`[시트: ${name}]\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`).join('\n');
  if(!text.trim()||text.length>textLimit)throw new Error('엑셀 내용이 없거나 너무 깁니다. 나눠 첨부해 주세요.');
  return{text};
 }
 if(['pdf','mp3','wav','m4a','webm','ogg','aac','flac'].includes(ext)){
  if(file.size>30_000_000)throw new Error('녹음·PDF는 30MB 이하로 나눠 첨부해 주세요.');
  return{file};
 }
 throw new Error('TXT·CSV·DOCX·XLSX·PDF 또는 MP3·WAV·M4A·WEBM·OGG·AAC·FLAC를 선택해 주세요.');
}

export async function requestMeetingDraft(projectCode:string,projectName:string,source:{text?:string;file?:File}){
 const form=new FormData();form.set('projectCode',projectCode);form.set('projectName',projectName);
 if(source.file)form.set('file',source.file);
 else form.set('text',source.text||'');
 const response=await fetch('/api/meetings/draft',{method:'POST',credentials:'same-origin',body:form,signal:AbortSignal.timeout(150000)});
 const result=await response.json() as {error?:string;draft?:MeetingDraft;model?:string;sourceKind?:string};
 if(!response.ok||!result.draft)throw new Error(result.error||'Gemini 초안 작성에 실패했습니다.');
 return{draft:result.draft,model:result.model||'',sourceKind:result.sourceKind||''};
}
