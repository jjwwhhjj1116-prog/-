import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createServer} from 'vite';
import {database} from './d1.mjs';
import {tokenHash} from '../../functions/lib/collaboration.ts';

// Real route/resumable functions and memory SQLite; Google is synthetic, never a company file.
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const overrides=[['/functions/api/[[route]].ts',option('route-source')],['/functions/lib/driveResumable.ts',option('resumable-source')]].filter(([,path])=>path);
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'protected-before-source',enforce:'pre',load(id){const source=overrides.find(([suffix])=>id.replaceAll('\\','/').split('?')[0].endsWith(suffix));if(source)return readFileSync(resolve(source[1]),'utf8');}}]});
const {DB,db}=database(),savedFetch=globalThis.fetch;
const checks=[],folderRows=[],files=new Map(),sessions=new Map(),calls=[];
let folderNumber=0,fileNumber=0,mediaCalls=0,folderFailure=null;
const hash=bytes=>crypto.subtle.digest('SHA-256',bytes).then(value=>Buffer.from(value).toString('hex'));
const original=Buffer.from('studio member proxy fixture 133\n'),sha256=await hash(original);
const profile={id:'member133',name:'합성 사용자',email:'studio-member@example.invalid',department:'구조팀',position:'선임'};
const expectedDay=()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10).replaceAll('-','.');
const expectedPath=()=>`기술본부 자료실 > [QA-133] 자료실 검수 > 03.구조자료 > 1.납품자료 > ${profile.name}_${expectedDay()}`;
let failure=null;
try{
 const {onRequest}=await server.ssrLoadModule('../functions/api/[[route]].ts');
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(profile.id,'member133',profile.email,profile.name,profile.department,profile.position,JSON.stringify(profile),'salt','hash');
 db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash('member-session-133'),profile.id,Date.now()+60000);
 db.exec('CREATE TABLE company_google_credentials (id TEXT PRIMARY KEY,refresh_token TEXT,access_token TEXT,expires_at INTEGER,updated_at TEXT)');
 db.prepare('INSERT INTO company_google_credentials VALUES (?,?,?,?,?)').run('company_concost_drive','synthetic-refresh','synthetic-access',Date.now()+3600000,'synthetic');
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method||'GET';calls.push({path:url.pathname,method});
  assert.equal(url.hostname,'www.googleapis.com','Only synthetic Google calls are expected');
  if(url.searchParams.has('q')){
   const match=/^name = '((?:\\.|[^'])*)' and '([^']+)' in parents/.exec(url.searchParams.get('q'));assert.ok(match);
   if(folderFailure?.phase==='lookup')return new Response(null,{status:folderFailure.status});
   const name=match[1].replace(/\\(['\\])/g,'$1'),parent=match[2];
   return Response.json({files:folderRows.filter(row=>row.name===name&&row.parent===parent).map(({id,name})=>({id,name}))});
  }
  if(url.pathname==='/drive/v3/files'&&method==='POST'){
   if(folderFailure?.phase==='create')return new Response(null,{status:folderFailure.status});
   const value=JSON.parse(init.body);assert.equal(value.mimeType,'application/vnd.google-apps.folder');
   const row={id:`folder-${++folderNumber}`,name:value.name,parent:value.parents[0]};folderRows.push(row);return Response.json({id:row.id});
  }
  if(url.pathname.endsWith('/generateIds'))return Response.json({ids:[`file-${++fileNumber}`]});
  if(url.searchParams.get('uploadType')==='resumable'){
   const body=JSON.parse(init.body);assert.ok(folderRows.some(row=>row.id===body.parents[0]));sessions.set(body.id,{parent:body.parents[0],name:body.name});
   return new Response(null,{headers:{Location:`https://www.googleapis.com/upload/drive/v3/files?upload_id=${body.id}`}});
  }
  if(url.searchParams.has('upload_id')){
   const id=url.searchParams.get('upload_id'),session=sessions.get(id);assert.ok(session);const range=new Headers(init.headers).get('Content-Range');
   if(range.includes('*'))return new Response(null,{status:308});
   assert.equal(range,`bytes 0-${original.length-1}/${original.length}`);assert.deepEqual(Buffer.from(init.body),original);
   files.set(id,{bytes:original,sha256Checksum:sha256,parents:[session.parent],trashed:false});return Response.json({id});
  }
  const id=url.pathname.split('/').at(-1),file=files.get(id);
  if(!file)return new Response(null,{status:404});
  if(url.searchParams.get('alt')==='media'){
   mediaCalls++;const range=new Headers(init.headers).get('Range');
   if(range){assert.equal(range,'bytes=2-5');return new Response(file.bytes.subarray(2,6),{status:206,headers:{'Content-Range':`bytes 2-5/${file.bytes.length}`,'Content-Length':'4'}});}
   return new Response(file.bytes,{headers:{'Content-Length':String(file.bytes.length)}});
  }
  return Response.json({id,size:String(file.bytes.length),sha256Checksum:file.sha256Checksum,parents:file.parents,trashed:file.trashed});
 };
 const call=(path,method='GET',body,authenticated=true,extraHeaders={})=>onRequest({request:new Request(`https://studio.invalid/api/${path}`,{method,headers:{...(authenticated?{Cookie:'studio_session=member-session-133'}:{}),...(body!==undefined?{'Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json'}:{}),...(body instanceof Uint8Array?{'Content-Length':String(body.length)}:{}),...extraHeaders},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)}),env:{DB}});
 const ensureData={projectCode:'QA-133',projectName:'자료실 검수',mainFolder:'03.구조자료',subtitle:'1.납품자료',roleName:'보',uploadedBy:'위조 작성자',uploadedAt:'1999-01-01T00:00:00Z',driveFolderId:'attacker-folder',driveFolderPath:'attacker-path'};
 let response=await call('drive/folders/ensure','POST',ensureData);assert.equal(response.status,200);let payload=await response.json();
 assert.equal(payload.folderPath,expectedPath());assert.equal(payload.accessMode,'STUDIO_SESSION_PROXY');assert.equal(payload.folderUrl,undefined);assert.equal(payload.folderId,undefined);assert.ok(!JSON.stringify(payload).includes('drive.google.com'));
 const initialFolder=folderRows.at(-1);assert.equal(folderRows.length,5);assert.equal(initialFolder.name,`${profile.name}_${expectedDay()}`);assert.ok(!folderRows.some(row=>row.name==='보'||row.name==='조적'));
 checks.push('ensure uses category / authenticated uploader_KSTday, never role or forged author/date');
 const metadata={...ensureData,category:ensureData.subtitle,teamName:'구조팀',originalName:'fixture133.txt',mimeType:'text/plain',byteSize:original.length,hashes:[sha256]};
 async function upload(roleName,name){
  const created=await call('drive/uploads','POST',{...metadata,roleName,originalName:name});assert.equal(created.status,200);const state=await created.json();
  const before=JSON.parse(db.prepare('SELECT metadata FROM studio_drive_uploads WHERE id=?').get(state.id).metadata);assert.equal(before.uploadedBy,profile.name);assert.notEqual(before.uploadedAt,metadata.uploadedAt);assert.equal(before.driveFolderId,undefined);assert.equal(before.driveFolderPath,undefined);
  const started=await call(`drive/uploads/${state.id}`,'POST');assert.equal(started.status,200);assert.ok(!JSON.stringify(await started.json()).includes('google.com'));
  const done=await call(`drive/uploads/${state.id}?offset=0`,'PUT',original);assert.equal(done.status,200);const result=await done.json();assert.equal(result.completed,true);assert.equal(result.offset,original.length);assert.ok(!JSON.stringify(result).includes('google.com'));assert.equal(result.driveUrl,undefined);
  const row=db.prepare('SELECT * FROM studio_drive_uploads WHERE id=?').get(state.id),stored=JSON.parse(row.metadata);assert.equal(stored.driveFolderId,initialFolder.id);assert.equal(stored.driveFolderPath,expectedPath());assert.equal(sessions.get(row.google_id).parent,initialFolder.id);assert.equal(stored.uploadedBy,profile.name);assert.equal(stored.roleName,roleName);
  assert.equal(db.prepare('SELECT role_name FROM studio_vault_metadata WHERE file_id=?').get(state.id).role_name,roleName);return {id:state.id,googleId:row.google_id};
 }
 const uploaded=await upload('보','beam133.txt'),masonry=await upload('조적','masonry133.txt');assert.notEqual(uploaded.id,masonry.id);assert.equal(folderRows.length,5);
 checks.push('actual resumable upload and ensure share exact parent ID for 보 / 조적; metadata retains classification and private path');
 response=await call('drive/files?projectCode=QA-133');assert.equal(response.status,200);payload=await response.json();assert.equal(payload.files.length,2);assert.equal(payload.accessMode,'STUDIO_SESSION_PROXY');
 for(const row of payload.files){assert.equal(row.drive_url,undefined);assert.equal(row.file_data,undefined);assert.equal(row.storage_path,expectedPath());assert.equal(row.uploaded_by,profile.name);assert.equal(await hash(original),row.sha256);assert.equal(row.category,'1.납품자료');}
 assert.ok(!JSON.stringify(payload).includes('drive.google.com'));assert.ok(!JSON.stringify(payload).includes('googleapis.com'));checks.push('listing and completion expose no Google URL; studio proxy and confirmed path retained');
 const download=(method='GET',authenticated=true,headers={})=>call(`drive/files/download?id=${uploaded.id}`,method,undefined,authenticated,headers);
 response=await download();assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original);assert.equal(response.headers.get('X-Storage-Source'),'GOOGLE_DRIVE');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Content-Security-Policy'),'sandbox');assert.equal(await hash(original),sha256);
 const beforeHead=mediaCalls;response=await download('HEAD');assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),String(original.length));assert.equal(await response.text(),'');assert.equal(mediaCalls,beforeHead);
 response=await download('GET',true,{Range:'bytes=2-5'});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),`bytes 2-5/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(2,6));checks.push('ordinary active studio member receives original bytes / SHA / HEAD / Range without Google login');
 const beforeUnauthorized=calls.length;assert.equal((await download('GET',false)).status,401);db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run(profile.id);assert.equal((await download()).status,401);assert.equal(calls.length,beforeUnauthorized);db.prepare('UPDATE studio_users SET active=1 WHERE id=?').run(profile.id);checks.push('anonymous and deactivated members rejected before any Google call');
 const googleFile=files.get(uploaded.googleId);googleFile.parents=['wrong-folder'];const beforeWrong=mediaCalls;assert.equal((await download()).status,409);assert.equal((await download('HEAD')).status,409);assert.equal(mediaCalls,beforeWrong);googleFile.parents=[initialFolder.id];
 googleFile.sha256Checksum='0'.repeat(64);assert.equal((await download()).status,409);googleFile.sha256Checksum=sha256;googleFile.trashed=true;assert.equal((await download()).status,409);googleFile.trashed=false;checks.push('changed Drive parent, hash or trash state rejected without serving media');
 // Historical records had no folder metadata. Preserve ID-based access rather than moving originals.
 db.prepare('INSERT INTO drive_evidence VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy133','QA-133','기타','old133.txt','text/plain',original.length,sha256,profile.name,'2026-09-22T00:00:00Z','GOOGLE_DRIVE',`https://drive.google.com/file/d/${uploaded.googleId}/view`,'');
 googleFile.parents=['historical-role-folder'];response=await call('drive/files/download?id=legacy133');assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original);googleFile.parents=[initialFolder.id];checks.push('historical file without upload-folder metadata still downloads by preserved Google ID');
 const registered=db.prepare('SELECT COUNT(*) n FROM drive_evidence').get().n;
 for(const phase of ['lookup','create']){
  folderFailure={phase,status:403};const createsBefore=calls.filter(row=>row.path==='/drive/v3/files'&&row.method==='POST').length,foldersBefore=folderRows.length,sessionsBefore=sessions.size;
  response=await call('drive/folders/ensure','POST',{...ensureData,projectCode:`FAIL-${phase}`});assert.ok(response.status>=400);assert.equal((await response.json()).success,undefined);
  const created=await call('drive/uploads','POST',{...metadata,projectCode:`FAIL-${phase}`,originalName:`failure-${phase}.txt`});assert.equal(created.status,200);const {id}=await created.json();response=await call(`drive/uploads/${id}`,'POST');assert.equal(response.status,502);assert.equal((await response.json()).completed,undefined);
  assert.equal(folderRows.length,foldersBefore);assert.equal(sessions.size,sessionsBefore);assert.equal(db.prepare('SELECT COUNT(*) n FROM drive_evidence').get().n,registered);assert.equal(db.prepare('SELECT completed FROM studio_drive_uploads WHERE id=?').get(id).completed,0);
  if(phase==='lookup')assert.equal(calls.filter(row=>row.path==='/drive/v3/files'&&row.method==='POST').length,createsBefore,'Lookup rejection must never create fallback folders');
  folderFailure=null;
 }
 checks.push('provider folder lookup/create errors fail closed: no success, upload session or evidence registration; lookup error never creates folder');
 for(const check of checks)console.log(`PASS ${check}`);
}catch(error){failure=error;throw error;}
finally{
 const output=option('output');if(output){mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(resolve(output),JSON.stringify({kind:'ACTUAL_ROUTE_RESUMABLE_MEMORY_SQLITE_SYNTHETIC_GOOGLE',status:failure?'FAIL':'PASS',checks,error:failure?.message||null,folderCount:folderRows.length,registeredFiles:db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='drive_evidence'").get().n?db.prepare('SELECT COUNT(*) n FROM drive_evidence').get().n:0,operationalWrites:0,externalRequests:0,limits:['Actual routes and resumable upload functions; memory SQLite and mock Google only. No real Google, browser or deployed-provider assertion.']},null,2)+'\n');}
 globalThis.fetch=savedFetch;db.close();await server.close();
}
