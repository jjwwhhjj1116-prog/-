const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function meetingHtml(meeting:Record<string,any>,revision:number) {
 const fields=[['프로젝트',`${meeting.projectCode} ${meeting.projectName}`],['작성자',meeting.author],['회의일',meeting.meetingDate],['장소',meeting.location],['참석자',[...(meeting.attendeesInternal||[]),...(meeting.attendeesExternal||[])].join(', ')],['회의내용',meeting.notesAndInstructions],['요약',meeting.summary],['결정사항',(meeting.decisions||[]).join('\n')],['원문',meeting.rawTranscript]];
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escape(meeting.title)}</title><style>body{font:16px sans-serif;color:#172033;background:#fff;max-width:960px;margin:40px auto;padding:20px}section{border-bottom:1px solid #ccd3df}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}h2{font-size:16px}</style><h1>${escape(meeting.title)}</h1><p>보관 버전 ${revision}</p>${fields.map(([name,value])=>`<section><h2>${escape(name)}</h2><pre>${escape(value)}</pre></section>`).join('')}<h2>결재 기록</h2><pre>${escape((meeting.reviews||[]).map((r:any)=>`${r.recipient_id}: 열람 ${r.read_at||'미열람'} / ${r.decision||'대기'} ${r.decided_at||''}`).join('\n'))}</pre><script type="application/json" id="meeting-source">${JSON.stringify({revision,meeting}).replace(/</g,'\\u003c')}</script></html>`;
}
export async function archiveMeeting(env:{DB:D1Database},meeting:Record<string,any>,revision:number,accessToken:string|null,findFolder:(name:string,parent:string,token:string)=>Promise<string>) {
 if(!accessToken)throw new Error('Google Drive 연결이 필요합니다.');
 const html=meetingHtml(meeting,revision);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html)));
 const snapshot=[...digest].map(value=>value.toString(16).padStart(2,'0')).join('');
 const headers={Authorization:`Bearer ${accessToken}`};
 const root=await findFolder('기술본부 자료실','root',accessToken);
 const folderName=meeting.projectName?.includes(meeting.projectCode)?meeting.projectName:`[${meeting.projectCode}] ${meeting.projectName}`;
 const project=await findFolder(folderName.trim(),root,accessToken);
 const folder=await findFolder('회의록',project,accessToken);
 // Older keys/files remain intact. Different receipt snapshots never share a mutable file.
 const key=`${meeting.id}:${revision}:${snapshot}`;
 let row=await env.DB.prepare('SELECT file_id FROM studio_archive_files WHERE id=?').bind(key).first<{file_id:string}>();
 if(!row) {
  const response=await fetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive',{headers});
  if(!response.ok)throw new Error('Drive ID 발급 실패');
  const data=await response.json() as {ids:string[]};
  await env.DB.prepare('INSERT OR IGNORE INTO studio_archive_files (id,file_id) VALUES (?,?)').bind(key,data.ids[0]).run();
  row=await env.DB.prepare('SELECT file_id FROM studio_archive_files WHERE id=?').bind(key).first<{file_id:string}>();
 }
 const fileId=row!.file_id;
 const exists=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,trashed`,{headers});
 if(!exists.ok&&exists.status!==404)throw new Error('Drive 파일 확인 실패');
 const present=exists.ok;
 if(present && (await exists.json() as {trashed?:boolean}).trashed)throw new Error('Drive 보관 파일이 휴지통에 있습니다. 복원 후 재시도하세요.');
 const boundary=`studio_${crypto.randomUUID()}`;
 const metadata=present?{name:`${meeting.meetingDate}_${meeting.title}_v${revision}.html`}:{id:fileId,name:`${meeting.meetingDate}_${meeting.title}_v${revision}.html`,parents:[folder]};
 const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
 const response=await fetch(`https://www.googleapis.com/upload/drive/v3/files${present?'/'+encodeURIComponent(fileId):''}?uploadType=multipart&fields=id`,{method:present?'PATCH':'POST',headers:{...headers,'Content-Type':`multipart/related; boundary=${boundary}`},body});
 if(!response.ok)throw new Error('Drive 회의록 보관 실패');
 return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
