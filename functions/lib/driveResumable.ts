// Google resumable sessions stay on the server; browsers receive only an opaque upload ID.
export const MAX_UPLOAD_BYTES=15_000_000_000;
export const CHUNK_BYTES=4*1024*1024;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const googleFetch=(url:string,init:RequestInit={})=>fetch(url,{...init,signal:AbortSignal.timeout(60000)});
const fail=(message:string,status=400)=>json({error:message},status);
const googleError=(status:number)=>fail(status===403?'Google Drive 용량 또는 접근 권한을 확인하세요.':'Drive 연결 오류입니다. 같은 파일을 다시 선택하면 확인된 위치부터 재개합니다.',502);
type Dependencies={token:()=>Promise<string|null>;folder:(data:any)=>Promise<{folderId:string;folderPath?:string}>};
export async function resumableUpload(request:Request,DB:D1Database,user:{id:string;name:string},deps:Dependencies){
 const url=new URL(request.url),path=url.pathname.split('/uploads')[1];
 const token=await deps.token();if(!token)return fail('회사 Google Drive 연결이 필요합니다.',503);
 const auth={Authorization:`Bearer ${token}`};
 if(path===''&&request.method==='POST'){
  if(Number(request.headers.get('Content-Length')||0)>300000)return fail('파일 정보가 너무 큽니다.',413);
  const m:any=await request.json();
  if(!Number.isSafeInteger(m.byteSize)||m.byteSize<=0||m.byteSize>MAX_UPLOAD_BYTES)return fail('파일당 1바이트 이상 15GB 이하만 업로드할 수 있습니다.',413);
  for(const key of ['projectCode','projectName','category','originalName','mainFolder','roleName','teamName'])if(typeof m[key]!=='string'||!m[key].trim()||m[key].length>500)return fail('프로젝트·폴더·파일 정보를 확인하세요.');
  if(!Array.isArray(m.hashes)||m.hashes.length!==Math.ceil(m.byteSize/CHUNK_BYTES)||m.hashes.some((h:unknown)=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))return fail('파일 조각 검증 정보가 올바르지 않습니다.');
  m.mimeType=typeof m.mimeType==='string'&&/^[\w.+-]+\/[\w.+-]+$/.test(m.mimeType)?m.mimeType:'application/octet-stream';
  m.uploadedBy=user.name;
  m.uploadedAt=new Date().toISOString();
  delete m.driveFolderId;delete m.driveFolderPath;
  const key=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([m.projectCode,m.mainFolder,m.roleName,m.category,m.originalName,m.byteSize,m.hashes]))));
  let row=await DB.prepare('SELECT * FROM studio_drive_uploads WHERE user_id=? AND resume_key=?').bind(user.id,key).first<any>();
  if(!row){
   const ids=await googleFetch('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive',{headers:auth});
   if(!ids.ok)return googleError(ids.status);
   const googleId=(await ids.json<any>()).ids?.[0];if(!/^[\w-]+$/.test(googleId||''))return fail('Google 파일 ID 생성 실패',502);
   await DB.prepare('INSERT OR IGNORE INTO studio_drive_uploads (id,user_id,resume_key,metadata,google_id,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,key,JSON.stringify(m),googleId,new Date().toISOString()).run();
   row=await DB.prepare('SELECT * FROM studio_drive_uploads WHERE user_id=? AND resume_key=?').bind(user.id,key).first<any>();
  }
  return json({id:row.id,offset:row.offset,completed:!!row.completed});
 }
 const id=path?.match(/^\/([\w-]+)$/)?.[1];if(!id)return fail('잘못된 업로드 경로',404);
 const row=await DB.prepare('SELECT * FROM studio_drive_uploads WHERE id=? AND user_id=?').bind(id,user.id).first<any>();
 if(!row)return fail('업로드 기록이 없거나 본인 파일이 아닙니다.',404);
 if(!['POST','PUT'].includes(request.method))return fail('허용되지 않은 요청',405);
 const lease=crypto.randomUUID();
 const locked=await DB.prepare('UPDATE studio_drive_uploads SET lease=?,lease_until=? WHERE id=? AND lease_until<?').bind(lease,Date.now()+600000,id,Date.now()).run();
 if(!locked.meta.changes)return fail('다른 화면에서 전송 중입니다. 잠시 후 같은 파일을 다시 선택하세요.',409);
 try{
  const m=JSON.parse(row.metadata);
  const result=()=>json({id,offset:row.offset,completed:!!row.completed});
  async function finish(){
   const response=await googleFetch(`https://www.googleapis.com/drive/v3/files/${row.google_id}?fields=id,size,sha256Checksum,trashed,parents`,{headers:auth});
   if(response.status===404)return null;
   if(!response.ok)throw new Error('Google 파일 확인 실패');
   const f:any=await response.json();
   if(m.driveFolderId&&!f.parents?.includes(m.driveFolderId))return fail('Drive 보관 위치가 변경되었습니다. 원본 위치를 확인하세요.',409);
   const registered=await DB.prepare('SELECT byte_size,sha256 FROM drive_evidence WHERE id=?').bind(id).first<any>();
   if(registered&&(f.trashed||Number(f.size)!==Number(registered.byte_size)||String(f.sha256Checksum||'').toLowerCase()!==String(registered.sha256||'').toLowerCase()))return fail('기존 Drive 원본을 확인하세요.',409);
   if(f.trashed||Number(f.size)!==m.byteSize||!/^[a-f0-9]{64}$/i.test(f.sha256Checksum||''))return null;
   await DB.batch([
    DB.prepare(`INSERT OR IGNORE INTO drive_evidence (id,project_code,category,original_name,mime_type,byte_size,sha256,uploaded_by,uploaded_at,storage_provider,drive_url,file_data) VALUES (?,?,?,?,?,?,?,?,?,'GOOGLE_DRIVE',?,'')`).bind(id,m.projectCode,m.category,m.originalName,m.mimeType,m.byteSize,f.sha256Checksum,m.uploadedBy,row.created_at,`https://drive.google.com/file/d/${row.google_id}/view`),
    DB.prepare('INSERT OR IGNORE INTO studio_vault_metadata VALUES (?,?,?,?,?)').bind(id,m.projectName,m.teamName,m.roleName,m.mainFolder),
    DB.prepare('UPDATE studio_drive_uploads SET completed=1,offset=?,session_url=NULL WHERE id=?').bind(m.byteSize,id)
   ]);row.completed=1;row.offset=m.byteSize;return result();
  }
  if(row.completed)return await finish()||fail('기존 Drive 원본을 확인하세요.',409);
  async function acknowledge(response:Response){
   if(response.status===308){
    const range=response.headers.get('Range');const offset=range?Number(/^bytes=0-(\d+)$/.exec(range)?.[1])+1:0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>m.byteSize)throw new Error('Google 전송 위치 확인 실패');
    row.offset=offset;await DB.prepare('UPDATE studio_drive_uploads SET offset=? WHERE id=?').bind(offset,id).run();return result();
   }
   if(response.ok)return await finish()||fail('원본 확인 중입니다. 같은 파일로 재개하세요.',502);
   if(response.status===404||response.status===410){
    const done=await finish();if(done)return done;
    await DB.prepare('UPDATE studio_drive_uploads SET session_url=NULL,offset=0 WHERE id=?').bind(id).run();
    return fail('전송 세션이 만료되었습니다. 같은 파일을 다시 선택하면 중복 없이 처음부터 전송합니다.',410);
   }
   return googleError(response.status);
  }
  if(!row.session_url){
   const done=await finish();if(done)return done;
   const folder=await deps.folder({...m,uploadedAt:m.uploadedAt||row.created_at});
   if(folder.folderPath){
    m.driveFolderId=folder.folderId;m.driveFolderPath=folder.folderPath;
    await DB.prepare('UPDATE studio_drive_uploads SET metadata=? WHERE id=?').bind(JSON.stringify(m),id).run();
   }
   const start=await googleFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,sha256Checksum',{method:'POST',headers:{...auth,'Content-Type':'application/json','X-Upload-Content-Type':m.mimeType,'X-Upload-Content-Length':String(m.byteSize)},body:JSON.stringify({id:row.google_id,name:m.originalName,parents:[folder.folderId]})});
   if(!start.ok)return googleError(start.status);
   const location=start.headers.get('Location');
   if(!location||!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/.test(location))return fail('Google 전송 주소 확인 실패',502);
   row.session_url=location;row.offset=0;
   await DB.prepare('UPDATE studio_drive_uploads SET session_url=?,offset=0 WHERE id=?').bind(location,id).run();
  }
  if(request.method==='POST')return await acknowledge(await googleFetch(row.session_url,{method:'PUT',redirect:'manual',headers:{...auth,'Content-Length':'0','Content-Range':`bytes */${m.byteSize}`}}));
  const offset=Number(url.searchParams.get('offset'));
  if(!Number.isSafeInteger(offset)||offset<0||offset%CHUNK_BYTES!==0||offset>row.offset||row.offset>=Math.min(offset+CHUNK_BYTES,m.byteSize))return fail('전송 위치가 달라졌습니다. 상태를 다시 확인하세요.',409);
  const expected=Math.min(CHUNK_BYTES,m.byteSize-offset);
  if(Number(request.headers.get('Content-Length'))!==expected)return fail('전송 조각 크기가 올바르지 않습니다.',400);
  const bytes=await request.arrayBuffer();if(bytes.byteLength!==expected)return fail('전송이 중단되었습니다.',400);
  if(hex(await crypto.subtle.digest('SHA-256',bytes))!==m.hashes[offset/CHUNK_BYTES])return fail('다른 파일이거나 전송 내용이 손상되었습니다.',409);
  const remaining=bytes.slice(row.offset-offset);
  return await acknowledge(await googleFetch(row.session_url,{method:'PUT',redirect:'manual',headers:{...auth,'Content-Type':m.mimeType,'Content-Length':String(remaining.byteLength),'Content-Range':`bytes ${row.offset}-${offset+expected-1}/${m.byteSize}`},body:remaining}));
 }catch{return fail('전송 응답을 확인하지 못했습니다. 같은 파일을 다시 선택하면 Drive 수신 위치를 확인해 재개합니다.',502);}
 finally{await DB.prepare('UPDATE studio_drive_uploads SET lease=NULL,lease_until=0 WHERE id=? AND lease=?').bind(id,lease).run();}
}
