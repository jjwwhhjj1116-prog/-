import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {database} from './d1.mjs';

const before=process.argv.includes('--before'),protectedRoot=new URL('../../private-provisioning/qa-drive-archive86-20261007/original-before-86/',import.meta.url);
if(before)registerHooks({load(url,context,next){const loaded=next(url,context);for(const path of ['functions/lib/collaboration.ts','functions/lib/meetingArchive.ts'])if(url===new URL('../../'+path,import.meta.url).href)return {...loaded,source:readFileSync(new URL(path,protectedRoot),'utf8')};return loaded;}});
const {handleCollaboration,passwordHash}=await import('../../functions/lib/collaboration.ts');
const {archiveMeeting,meetingHtml}=await import('../../functions/lib/meetingArchive.ts');
const results=[];
const fixture=id=>({id,title:'Synthetic archive '+id,projectCode:'QA86',projectName:'Synthetic project',attendeesInternal:[],attendeesExternal:[],notesAndInstructions:'Preserved original body',summary:'Summary',decisions:[],meetingDate:'2026-10-07'});
const decode=html=>JSON.parse(html.match(/id="meeting-source">([\s\S]*?)<\/script>/)[1]);
async function harness(registrationFailure=false){
  const {db,DB}=database(),files=new Map(),cookies={},oldFetch=globalThis.fetch;let ids=0,uploads=0,failNext=false,holdNext=false,readyResolve,ready,release,failRegistration=registrationFailure;
  const env={DB:{...DB,prepare(sql){const statement=DB.prepare(sql);if(sql.startsWith('UPDATE studio_meetings SET archive_revision=')){const run=statement.run;statement.run=async()=>{if(failRegistration){failRegistration=false;throw Error('synthetic registration failure');}return run();};}return statement;}}};
  globalThis.fetch=async(url,init={})=>{
    const parsed=new URL(String(url));assert.equal(parsed.hostname,'www.googleapis.com');assert.ok(!parsed.pathname.includes('/about'));
    if(parsed.pathname.endsWith('/generateIds'))return Response.json({ids:['qa86-file-'+(++ids)]});
    if(parsed.pathname.startsWith('/upload/')){
      uploads++;const html=String(init.body).match(/<!doctype html>[\s\S]*?<\/html>/)[0],metadata=JSON.parse(String(init.body).match(/Content-Type: application\/json; charset=UTF-8\r\n\r\n([\s\S]*?)\r\n--/)[1]),id=init.method==='PATCH'?parsed.pathname.split('/').at(-1):metadata.id;
      let status=failNext?500:200;failNext=false;if(holdNext){holdNext=false;readyResolve();status=await new Promise(resolve=>{release=resolve;});}
      if(status!==200)return new Response(null,{status});if(init.method==='POST'&&files.has(id))return new Response(null,{status:409});files.set(id,html);return Response.json({id});
    }
    const id=parsed.pathname.split('/').at(-1);return files.has(id)?Response.json({id,trashed:false}):new Response(null,{status:404});
  };
  const archive=(meeting,revision)=>archiveMeeting(env,meeting,revision,'synthetic-token-not-logged',async()=> 'qa86-folder');
  const request=async(user,path,method='GET',body)=>{const response=await handleCollaboration(new Request('https://example.invalid/api/collaboration/'+path,{method,headers:{...(cookies[user]?{Cookie:cookies[user]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,archive);return {status:response.status,data:await response.json()};};
  for(const [id,department,position]of [['author','마감팀','선임'],['chief','마감팀','실장'],['director','기술본부','본부장']]){const profile={id,name:'Synthetic '+id,department,position,email:id+'@example.invalid'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,profile.email,profile.name,department,position,JSON.stringify(profile),'qa86',await passwordHash('synthetic-password','qa86'));const login=await handleCollaboration(new Request('https://example.invalid/api/collaboration/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:id,password:'synthetic-password'})}),env,archive);assert.equal(login.status,200);cookies[id]=login.headers.get('set-cookie').split(';')[0];}
  return {db,files,archive,request,stats:()=>({ids,uploads}),failUpload:()=>{failNext=true;},hold:()=>{holdNext=true;ready=new Promise(resolve=>{readyResolve=resolve;});},wait:()=>ready,release:status=>{release?.(status||200);},row:id=>({...db.prepare('SELECT * FROM studio_meetings WHERE id=?').get(id)}),urlContent:url=>files.get(url.split('/').at(-2)),close(){release?.(200);globalThis.fetch=oldFetch;db.close();}};
}
async function check(name,run){try{await run();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.error('FAIL '+name+': '+error.message);}}
await check('meeting archive: same snapshot ID, failure retry and legacy files stay intact',async()=>{const h=await harness();try{
  const m=fixture('cache'),first=await h.archive(m,1),stats=h.stats();assert.equal(await h.archive(m,1),first);assert.equal(h.stats().ids,stats.ids);
  const retry=fixture('retry');h.failUpload();await assert.rejects(()=>h.archive(retry,1),/보관 실패/);const afterFailure=h.stats().ids;await h.archive(retry,1);assert.equal(h.stats().ids,afterFailure);
  const legacy=fixture('legacy'),oldHTML=meetingHtml({...legacy,reviews:[{recipient_id:'chief',decision:null}]},1);h.db.prepare('INSERT INTO studio_archive_files VALUES (?,?)').run('legacy:1','legacy-file');h.files.set('legacy-file',oldHTML);const link=await h.archive({...legacy,reviews:[{recipient_id:'chief',decision:'approve'}]},1);assert.notEqual(link,'https://drive.google.com/file/d/legacy-file/view');assert.equal(h.files.get('legacy-file'),oldHTML);assert.equal(h.db.prepare('SELECT file_id FROM studio_archive_files WHERE id=?').get('legacy:1').file_id,'legacy-file');
}finally{h.close();}});
await check('meeting archive: delayed pending snapshot cannot overwrite final archive after list cleanup',async()=>{const h=await harness(true),m=fixture('race');let pending;try{
  const saved=await h.request('author','meetings/race','PUT',{meeting:m});assert.equal(saved.status,200);assert.ok(saved.data.meeting.archiveError);assert.equal(h.row(m.id).archive_revision,0);
  assert.equal((await h.request('author','meetings/race/submit','POST',{revision:1})).status,200);h.hold();pending=h.request('author','meetings/race/archive','POST',{revision:1});await h.wait();
  for(const user of ['chief','director'])assert.equal((await h.request(user,'meetings/race/approve','POST',{revision:1})).status,200);
  assert.equal((await h.request('author','meetings/race/archive','POST',{revision:1})).status,200);const current=h.row(m.id).archive_url,deleted=await h.request('author','meetings/race','DELETE',{revision:1});assert.equal(deleted.status,200);assert.equal(deleted.data.archiveUrl,current);const row=structuredClone(h.row(m.id)),final=h.urlContent(row.archive_url);assert.equal(decode(final).meeting.reviews.filter(r=>r.decision==='approve').length,2);assert.equal(row.removed,1);assert.equal(row.body,null);
  h.release();assert.equal((await pending).status,409);assert.deepEqual(h.row(m.id),row);assert.equal(h.urlContent(row.archive_url),final);assert.equal((await h.request('author','meetings')).data.meetings.length,0);
}finally{h.release?.();await pending?.catch(()=>{});h.close();}});
await check('meeting archive: changed receipt snapshot rejects late pointer without replacing current data',async()=>{const h=await harness(),m=fixture('receipts');let pending;try{
  await h.request('author','meetings/receipts','PUT',{meeting:m});await h.request('author','meetings/receipts/submit','POST',{revision:1});h.hold();pending=h.request('author','meetings/receipts/archive','POST',{revision:1});await h.wait();await h.request('chief','meetings/receipts/approve','POST',{revision:1});const row=structuredClone(h.row(m.id));h.release();assert.equal((await pending).status,409);assert.deepEqual(h.row(m.id),row);
}finally{h.release?.();await pending?.catch(()=>{});h.close();}});
await check('meeting archive: submit during cleanup preserves body and existing pointer',async()=>{const h=await harness(),m=fixture('submit');let pending;try{
  await h.request('author','meetings/submit','PUT',{meeting:m});h.hold();pending=h.request('author','meetings/submit','DELETE',{revision:1});await h.wait();await h.request('author','meetings/submit/submit','POST',{revision:1});const row=structuredClone(h.row(m.id));h.release();assert.equal((await pending).status,409);assert.deepEqual(h.row(m.id),row);assert.equal(h.row(m.id).removed,0);
}finally{h.release?.();await pending?.catch(()=>{});h.close();}});
await check('meeting archive: delayed save completion rejects an obsolete revision and preserves latest data',async()=>{const h=await harness(),m=fixture('save');let pending;try{
  await h.request('author','meetings/save','PUT',{meeting:m});h.hold();pending=h.request('author','meetings/save','PUT',{meeting:{...m,title:'Older save'},revision:1});await h.wait();assert.equal((await h.request('author','meetings/save','PUT',{meeting:{...m,title:'Current save'},revision:2})).status,200);const row=structuredClone(h.row(m.id));h.release();assert.equal((await pending).status,409);assert.deepEqual(h.row(m.id),row);
}finally{h.release?.();await pending?.catch(()=>{});h.close();}});
await check('meeting archive: delayed failed save cannot replace a cleaned-up archive error or URL',async()=>{const h=await harness(),m=fixture('failed');let pending;try{
  await h.request('author','meetings/failed','PUT',{meeting:m});h.hold();pending=h.request('author','meetings/failed','PUT',{meeting:{...m,title:'Saved body'},revision:1});await h.wait();assert.equal((await h.request('author','meetings/failed/archive','POST',{revision:2})).status,200);assert.equal((await h.request('author','meetings/failed','DELETE',{revision:2})).status,200);const row=structuredClone(h.row(m.id));h.release(500);assert.equal((await pending).status,409);assert.deepEqual(h.row(m.id),row);assert.equal(row.archive_error,null);
}finally{h.release?.();await pending?.catch(()=>{});h.close();}});
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);if(output)writeFileSync(output,JSON.stringify({kind:'ACTUAL_API_ARCHIVE_HELPER_SQLITE_MEMORY_SYNTHETIC_PROVIDER',protectedBefore:before,results,pass:results.filter(row=>row.status==='PASS').length,fail:results.filter(row=>row.status==='FAIL').length,externalRequests:0,operationalWrites:0,EFileWrites:0,companyDriveWrites:0,nativeAppsStarted:0,physicalPrints:0},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
