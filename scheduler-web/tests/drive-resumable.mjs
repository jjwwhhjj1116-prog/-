import assert from 'node:assert/strict';
import {database} from './d1.mjs';
import {createRequire,registerHooks} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {resumableVaultUpload} from '../src/services/resumableUpload.ts';
const serverSource=process.argv.find(arg=>arg.startsWith('--server-source='))?.slice('--server-source='.length),onlySourceChange=process.argv.includes('--only-source-change');
if(serverSource)registerHooks({load(url,context,next){const loaded=next(url,context);return url===new URL('../../functions/lib/driveResumable.ts',import.meta.url).href?{...loaded,source:readFileSync(serverSource,'utf8')}:loaded;}});
const {resumableUpload,CHUNK_BYTES,MAX_UPLOAD_BYTES}=await import('../../functions/lib/driveResumable.ts');
const {DB,db}=database();
db.exec(`CREATE TABLE drive_evidence(id TEXT PRIMARY KEY,project_code TEXT,category TEXT,original_name TEXT,mime_type TEXT,byte_size INTEGER,sha256 TEXT,uploaded_by TEXT,uploaded_at TEXT,storage_provider TEXT,drive_url TEXT,file_data TEXT)`);
const savedFetch=globalThis.fetch;
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const bytes=Buffer.alloc(CHUNK_BYTES+17,65);bytes[CHUNK_BYTES]=66;
const hashes=[await hash(bytes.subarray(0,CHUNK_BYTES)),await hash(bytes.subarray(CHUNK_BYTES))];
let received=0,complete=false,expires=false,starts=0,generate=0,failCommit=false,uploadBytes=0;
const wrapper={...DB,async batch(s){if(failCommit){failCommit=false;throw new Error('simulated DB outage');}return DB.batch(s);}};
globalThis.fetch=async(url,init={})=>{
 const u=String(url);if(u.includes('generateIds'))return Response.json({ids:[`google-${++generate}`]});
 if(u.includes('?fields=id,size'))return complete?Response.json({id:'google-1',size:String(bytes.length),sha256Checksum:await hash(bytes)}):new Response(null,{status:404});
 if(u.includes('uploadType=resumable')){starts++;return new Response(null,{headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}});}
 assert.ok(u.includes('upload_id=test'));
 if(expires){expires=false;received=0;return new Response(null,{status:404});}
 const range=init.headers['Content-Range'];
 if(!range.includes('*')){
  const match=/bytes (\d+)-(\d+)\/(\d+)/.exec(range);assert.equal(Number(match[1]),received);assert.equal(Number(match[3]),bytes.length);
  const data=Buffer.from(init.body);assert.deepEqual(data,bytes.subarray(received,received+data.length));uploadBytes+=data.length;received+=data.length;
 }
 if(received===bytes.length){complete=true;return Response.json({id:'google-1'});}
 return new Response(null,{status:308,headers:received?{Range:`bytes=0-${received-1}`}:{}});
};
const metadata={projectCode:'QA',projectName:'검수',mainFolder:'03.구조자료',teamName:'구조팀',roleName:'보',category:'기타',originalName:'대용량.bin',mimeType:'application/octet-stream',byteSize:bytes.length,hashes};
const call=(path,method='POST',data=undefined,user='u1')=>resumableUpload(new Request('https://example.invalid/api/drive/uploads'+path,{method,headers:{'Content-Type':data instanceof Uint8Array?'application/octet-stream':'application/json',...(data instanceof Uint8Array?{'Content-Length':String(data.length)}:{})},body:data===undefined?undefined:data instanceof Uint8Array?data:JSON.stringify(data)}),wrapper,{id:user,name:'검수자'},{token:async()=> 'mock-token',folder:async()=>({folderId:'folder'})});
try{
 if(!onlySourceChange){
 assert.equal((await call('','POST',{...metadata,byteSize:MAX_UPLOAD_BYTES+1})).status,413);
 const virtual=await call('','POST',{...metadata,originalName:'15GB-virtual.bin',byteSize:MAX_UPLOAD_BYTES,hashes:Array(Math.ceil(MAX_UPLOAD_BYTES/CHUNK_BYTES)).fill(hashes[0])});assert.equal(virtual.status,200);
 const r=await call('','POST',metadata);const {id}=await r.json();assert.equal((await (await call('','POST',metadata)).json()).id,id);
 assert.equal((await call('/'+id,'POST',undefined,'other')).status,404);
 assert.equal((await call('/'+id)).status,200);assert.equal(starts,1);
 db.prepare('UPDATE studio_drive_uploads SET lease_until=? WHERE id=?').run(Date.now()+60000,id);assert.equal((await call('/'+id)).status,409);db.prepare('UPDATE studio_drive_uploads SET lease_until=0 WHERE id=?').run(id);
 assert.equal((await call('/'+id+'?offset=0','PUT',Buffer.alloc(CHUNK_BYTES,0))).status,409);assert.equal(received,0);
 let state=await (await call('/'+id+'?offset=0','PUT',bytes.subarray(0,CHUNK_BYTES))).json();assert.equal(state.offset,CHUNK_BYTES);assert.equal(state.completed,false);
 // A fresh client obtains the authoritative received offset.
 state=await (await call('/'+id)).json();assert.equal(state.offset,CHUNK_BYTES);
 failCommit=true;assert.equal((await call('/'+id+`?offset=${CHUNK_BYTES}`,'PUT',bytes.subarray(CHUNK_BYTES))).status,502);assert.equal(complete,true);
 state=await (await call('/'+id)).json();assert.equal(state.completed,true);assert.equal(state.offset,bytes.length);assert.equal(starts,1);
 assert.equal((await (await call('/'+id)).json()).completed,true);
 assert.equal(uploadBytes,bytes.length);assert.equal(db.prepare('SELECT count(*) n FROM drive_evidence').get().n,1);
 assert.equal(db.prepare('SELECT file_data FROM drive_evidence').get().file_data,'');
 // A genuinely expired, unfinished session restarts with the SAME reserved Google ID.
 complete=false;received=0;const retry=await (await call('','POST',{...metadata,originalName:'expired.bin'})).json();await call('/'+retry.id);expires=true;assert.equal((await call('/'+retry.id)).status,410);const stable=db.prepare('SELECT google_id FROM studio_drive_uploads WHERE id=?').get(retry.id).google_id;await call('/'+retry.id);assert.equal(db.prepare('SELECT google_id FROM studio_drive_uploads WHERE id=?').get(retry.id).google_id,stable);
 console.log('PASS resumable: 15GB virtual size boundary, owner isolation, deduplication, lock, chunk hash, resume offset, final DB outage recovery, expired session stable ID');
 }
 // Use the actual public upload service/client/server in one isolated transport loop.
 const original=Buffer.from('same length original bytes'),file=new File([original],'qa-source-change.bin',{type:'application/octet-stream'}),sourceUser={id:'source-user',name:'합성 업로더'};
 let providerBytes=null,providerUppercase=false,providerCreates=0,sentBytes=0,record;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input),'https://example.invalid');
  if(url.pathname.startsWith('/api/drive/uploads')){
   const headers=new Headers(init.headers);if(init.body instanceof Blob)headers.set('Content-Length',String(init.body.size));
   return resumableUpload(new Request(url,{...init,headers}),DB,sourceUser,{token:async()=> 'synthetic-token',folder:async()=>({folderId:'synthetic-folder'})});
  }
  if(url.pathname==='/api/drive/files')return Response.json({files:db.prepare('SELECT e.*,m.project_name,m.team_name,m.role_name,m.main_folder FROM drive_evidence e LEFT JOIN studio_vault_metadata m ON m.file_id=e.id WHERE e.project_code=?').all(url.searchParams.get('projectCode'))});
  assert.equal(url.hostname,'www.googleapis.com');assert.ok(!url.pathname.includes('/about'),'No quota request');
  if(url.pathname.endsWith('/generateIds'))return Response.json({ids:['google-source-change']});
  if(url.searchParams.get('uploadType')==='resumable'){providerCreates++;return new Response(null,{headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=source-change'}});}
  if(url.searchParams.has('upload_id')){const range=new Headers(init.headers).get('Content-Range');if(range.includes('*'))return new Response(null,{status:308});providerBytes=Buffer.from(init.body);sentBytes+=providerBytes.length;assert.deepEqual(providerBytes,original);return Response.json({id:'google-source-change'});}
  assert.equal(url.pathname,'/drive/v3/files/google-source-change');const checksum=providerBytes?await hash(providerBytes):null;
  return providerBytes?Response.json({id:'google-source-change',size:String(providerBytes.length),sha256Checksum:providerUppercase?checksum.toUpperCase():checksum,trashed:false}):new Response(null,{status:404});
 };
 const require=createRequire(import.meta.url),ts=require('typescript'),serviceSource=readFileSync(new URL('../src/services/googleDriveService.ts',import.meta.url),'utf8'),compiled=ts.transpileModule(serviceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},crypto,console,fetch:globalThis.fetch,require:path=>{assert.equal(path,'./resumableUpload');return {resumableVaultUpload};}};runInNewContext(compiled,context);
 const params={projectCode:'QA-SOURCE-CHANGE',projectName:'합성 원본 보존',mainFolder:'03.구조자료',teamName:'구조팀',roleName:'보',subtitle:'1.납품자료',file,uploadedBy:sourceUser.name};
 let changedError=null,sourcePassed=false;
 try{
  record=await context.exports.uploadVaultFile(params);assert.equal(record.sha256,await hash(original));const frozen=db.prepare('SELECT * FROM drive_evidence WHERE id=?').get(record.id),session=db.prepare('SELECT * FROM studio_drive_uploads WHERE id=?').get(record.id);
  assert.equal((await context.exports.uploadVaultFile(params)).id,record.id);assert.equal(providerCreates,1);assert.equal(sentBytes,original.length);
  providerBytes=Buffer.from(original);providerBytes[0]^=1;assert.notEqual(await hash(providerBytes),record.sha256);assert.equal(providerBytes.length,original.length);
  await assert.rejects(()=>context.exports.uploadVaultFile(params),error=>{changedError=error.message;return /기존 Drive 원본/.test(error.message);});
  assert.deepEqual(db.prepare('SELECT * FROM drive_evidence WHERE id=?').get(record.id),frozen);assert.deepEqual(db.prepare('SELECT * FROM studio_drive_uploads WHERE id=?').get(record.id),session);
  providerBytes=Buffer.from(original);providerUppercase=true;assert.equal((await context.exports.uploadVaultFile(params)).id,record.id);assert.deepEqual(db.prepare('SELECT * FROM drive_evidence WHERE id=?').get(record.id),frozen);assert.equal(providerCreates,1);assert.equal(sentBytes,original.length);
  sourcePassed=true;console.log('PASS completed source: actual service/client/server preserve first upload and normal duplicate, reject same-size changed checksum, accept checksum case, keep evidence/session unchanged');
 }finally{
  const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);if(output)writeFileSync(output,JSON.stringify({kind:'ACTUAL_DRIVE_UPLOAD_SERVICE_CLIENT_SERVER_MEMORY_LOOP',status:sourcePassed?'PASS':'FAIL',changedError,providerCreates,sentBytes,originalSize:original.length,sameSizeChangedChecksumRejected:!!changedError,quotaRequests:0,EFileWrites:0,operationalWrites:0,DriveWrites:0,externalRequests:0,limits:['Actual upload service transpiled with actual client/server; SQLite memory and synthetic provider, not a browser or company file change.']},null,2)+'\n');
 }
}finally{globalThis.fetch=savedFetch;db.close();}
