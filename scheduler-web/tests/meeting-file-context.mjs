import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {database} from './d1.mjs';

// Actual Excel import handler with delayed FileReader, parser and save API;
// this is an isolated fixture, not a full component/browser or a real Drive upload.
export async function checkMeetingFileContext({sourcePath,outputPath}={}){
 const source=readFileSync(sourcePath||new URL('../src/components/MinutesView.tsx',import.meta.url),'utf8'),require=createRequire(import.meta.url),ts=require('typescript'),XLSX=require('xlsx');
 const {handleCollaboration,tokenHash}=await import('../../functions/lib/collaboration.ts'),{readMeetingBody,extractAiMeetingSummary,buildMeetingWorkbook}=await import('../src/services/meetingExcel.ts');
 const body=name=>{const found=source.match(new RegExp('const '+name+' = [^\\n]*=> \\{([\\s\\S]*?)\\n  \\};'));assert.ok(found,'Actual '+name+' handler');return found[1];};
 const guard=source.match(/  const fileReadMounted=[\s\S]*?(?=  \/\/ 회의록 변경 시 폼 동기화)/)?.[0]||'';
 const code=ts.transpileModule(`${guard}\nexports.renderHandlers=(currentMeeting:any)=>({handleImportExcel:(e:any)=>{${body('handleImportExcel')}},handleSaveCurrentMeeting:async(goToList:boolean=false)=>{${body('handleSaveCurrentMeeting')}}});`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const capture=source.match(/onChangeCapture=\{\(\) => \{([^}]*)\}\}/)?.[1]||'';
 const refresh=guard.match(/  if\(fileEditor\.current[^\n]*\n  fileEditor\.current=[^;]*;/)?.[0]||'';
 const results=[],author={id:'qa-file-author',name:'합성 작성자',department:'마감팀',position:'프로',active:true};
 const record=label=>({id:'qa-file-'+label,projectId:'qa-project',projectCode:'QA-MEETING',projectName:'합성 회의 현장',type:'착수회의',title:label+' 회의 제목',meetingDate:'2026-10-07',startTime:'10:00',endTime:'11:00',location:'합성 회의실',department:'마감팀',author:author.name,attendeesInternal:[],attendeesExternal:[],rawTranscript:label+' 원 대화록',notesAndInstructions:label+' 지시 본문',attachedFileName:label+'-original.txt',summary:label+' 요약',decisions:[],actionItems:[],status:'DRAFT',version:1,updatedAt:'2026-10-07',authorSigned:false,pmApproved:false,directorApproved:false});
 async function fixture(){
  const {db,DB}=database(),token=crypto.randomUUID(),calls=[];
  db.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,?,?,?,?,1)').run(author.id,author.id,'author@example.invalid',author.name,author.department,author.position,JSON.stringify(author),'unused','unused');db.prepare('INSERT INTO studio_sessions VALUES(?,?,?)').run(await tokenHash(token),author.id,Date.now()+3600000);
  const api=async(path,method,body)=>{const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{Cookie:'studio_session='+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB},async()=> 'https://example.invalid/synthetic-archive');const result=await response.json();calls.push({path,method,status:response.status});assert.equal(response.status,200,JSON.stringify(result));return result;};
  const a=(await api('meetings/qa-file-A','PUT',{meeting:record('A')})).meeting,b=(await api('meetings/qa-file-B','PUT',{meeting:record('B')})).meeting,readers=[],cleanups=[];
  const ctx={exports:{},currentUser:author,currentMeeting:a,currentMeetingId:a.id,canEditMeeting:true,activeSubTab:'write',saving:false,ready:true,meetings:[a,b],shared:[a,b],actor:author,toast:null,setTimeout:()=>0,console,XLSX,readMeetingBody,extractAiMeetingSummary,useRef:value=>({current:value}),useEffect:fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);},useAuthStore:{getState:()=>({currentUser:ctx.actor})},useStudioStore:{getState:()=>({meetings:ctx.shared})},FileReader:class{constructor(){readers.push(this);}readAsText(file){this.file=file;}readAsArrayBuffer(file){this.file=file;}},studioApi:api,refreshStudioMeetings:async()=>{},setAiToast:value=>{ctx.toast=value;},setSaving:value=>{ctx.saving=value;},setActiveSubTab:value=>{ctx.activeSubTab=value;},setMeetings:fn=>{ctx.meetings=fn(ctx.meetings);}};
  ctx.runGeminiDraft=async()=>{};
  const fields={formTitle:'title',formType:'type',formDate:'meetingDate',formStartTime:'startTime',formEndTime:'endTime',formLocation:'location',formClientName:'clientName',formReportingDept:'reportingDept',formReferenceDept:'referenceDept',formAuthorPosition:'authorPosition',formAuthorAffiliation:'authorAffiliation',formTranscript:'rawTranscript',formNotesAndInstructions:'notesAndInstructions',formAttachedFile:'attachedFileName',formSummary:'summary'};
  for(const name of [...Object.keys(fields),'formAttendeesInternal','formAttendeesExternal','formDecisions'])ctx['set'+name[0].toUpperCase()+name.slice(1)]=value=>{ctx[name]=value;};
  let initialized=false;
  function select(meeting){ctx.currentMeeting=meeting;ctx.currentMeetingId=meeting?.id||'';for(const [form,field]of Object.entries(fields))ctx[form]=meeting?.[field]||'';ctx.formAttendeesInternal=meeting?.attendeesInternal.join(',')||'';ctx.formAttendeesExternal=meeting?.attendeesExternal.join(',')||'';ctx.formDecisions=meeting?.decisions.join('\n')||'';if(initialized){if(refresh)runInNewContext(refresh,ctx);ctx.handlers=ctx.exports.renderHandlers(meeting);}}
  select(a);runInNewContext(code,ctx);initialized=true;ctx.handlers=ctx.exports.renderHandlers(a);
  const snapshot=()=>JSON.stringify({form:Object.fromEntries([...Object.keys(fields),'formAttendeesInternal','formAttendeesExternal','formDecisions'].map(k=>[k,ctx[k]])),meetings:ctx.meetings,toast:ctx.toast});
  const input=()=>{if(capture)runInNewContext(capture,ctx);};
  const begin=(_kind,name='source',text='파일에서 읽힌 원문')=>{input();const previous=readers.length,file={name:name+'.xlsx'};ctx.handlers.handleImportExcel({target:{files:[file]}});const reader=readers[previous],wb=buildMeetingWorkbook({...record('Excel'),title:name+' 엑셀 제목',notesAndInstructions:text,rawTranscript:text,attachedFileName:file.name});const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'});return {reader,file,complete:()=>reader?.onload({target:{result:bytes}})};};
  return {ctx,a,b,db,calls,select,snapshot,input,begin,close:()=>{ctx.activeSubTab='list';if(refresh)runInNewContext(refresh,ctx);},unmount:()=>cleanups.forEach(fn=>fn()),save:async()=>{await ctx.handlers.handleSaveCurrentMeeting();return JSON.parse(db.prepare('SELECT body FROM studio_meetings WHERE id=?').get(ctx.currentMeeting.id).body);}};
 }
 async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message.split('\n')[0]);}}
 async function both(fn){for(const kind of ['excel']){const f=await fixture();try{await fn(f,kind);}finally{f.db.close();}}}
 await check('회의록 Excel 원문 가져오기: 같은 문서 본문·첨부 일치 및 실제 저장',()=>both(async(f,kind)=>{const pending=f.begin(kind);pending.complete();assert.equal(f.ctx.formTranscript,'파일에서 읽힌 원문');assert.equal(f.ctx.formAttachedFile,pending.file.name);const saved=await f.save();assert.equal(saved.rawTranscript,'파일에서 읽힌 원문');assert.equal(saved.attachedFileName,pending.file.name);assert.equal(saved.id,f.a.id);}));
 await check('회의록 파일 지연: 다른 문서 이동·원문서 복귀 후 원문·첨부·실제 저장 보존',()=>both(async(f,kind)=>{const pending=f.begin(kind);f.select(f.b);const frozen=f.snapshot(),original=f.db.prepare('SELECT body,revision FROM studio_meetings WHERE id=?').get(f.a.id);pending.complete();assert.equal(f.snapshot(),frozen);const saved=await f.save();assert.equal(saved.rawTranscript,f.b.rawTranscript);assert.equal(saved.attachedFileName,f.b.attachedFileName);assert.deepEqual(f.db.prepare('SELECT body,revision FROM studio_meetings WHERE id=?').get(f.a.id),original);f.select(f.a);const returning=f.begin(kind);f.select(f.b);f.select(f.a);const returned=f.snapshot();returning.complete();assert.equal(f.snapshot(),returned);}));
 await check('회의록 파일 지연: 같은 ID 새 로그인 actor객체와 다른 계정 모두 보존',()=>both(async(f,kind)=>{for(const id of [author.id,'other-author']){f.ctx.actor=author;const pending=f.begin(kind);f.ctx.actor={...author,id};const frozen=f.snapshot();pending.complete();assert.equal(f.snapshot(),frozen);}}));
 await check('회의록 파일 지연: 같은revision 상신권한 변경·최신revision 변경 보존',()=>both(async(f,kind)=>{for(const change of [{reviews:[{recipient_id:'chief',stage:'chief',read_at:null,decision:null}]},{serverRevision:2}]){f.ctx.shared=[f.a,f.b];const pending=f.begin(kind);f.ctx.shared=[{...f.a,...change},f.b];const frozen=f.snapshot();pending.complete();assert.equal(f.snapshot(),frozen);}}));
 await check('회의록 파일 지연: 작성탭 닫힘과 언마운트 후 입력 보존',()=>both(async(f,kind)=>{const pending=f.begin(kind);f.close();const frozen=f.snapshot();pending.complete();assert.equal(f.snapshot(),frozen);f.ctx.activeSubTab='write';f.select(f.a);const unmounted=f.begin(kind);f.unmount();const closed=f.snapshot();unmounted.complete();assert.equal(f.snapshot(),closed);}));
 await check('회의록 파일 지연: 대기중 새 본문·제목 입력을 덮어쓰지 않음',()=>both(async(f,kind)=>{const pending=f.begin(kind);f.input();f.ctx.setFormTranscript('사용자가 새로 입력한 원문');f.ctx.setFormTitle('사용자가 새로 입력한 제목');const frozen=f.snapshot();pending.complete();assert.equal(f.snapshot(),frozen);}));
 await check('회의록 파일 지연: 더 최근 파일 읽기 완료 후 이전파일 결과 차단',()=>both(async(f,kind)=>{const old=f.begin(kind,'old','이전 파일 원문'),latest=f.begin(kind,'latest','최신 파일 원문');latest.complete();const frozen=f.snapshot();old.complete();assert.equal(f.snapshot(),frozen);assert.equal(f.ctx.formTranscript,'최신 파일 원문');assert.equal(f.ctx.formAttachedFile,latest.file.name);}));
 await check('회의록 파일 시작: 열람전용·선택문서없음은 읽기와 입력 변경 없음',()=>both(async(f,kind)=>{f.ctx.canEditMeeting=false;f.select(f.a);let frozen=f.snapshot(),pending=f.begin(kind);assert.equal(pending.reader,undefined);assert.equal(f.snapshot(),frozen);f.ctx.canEditMeeting=true;f.select(undefined);frozen=f.snapshot();pending=f.begin(kind);assert.equal(pending.reader,undefined);assert.equal(f.snapshot(),frozen);}));
 const result={kind:'ACTUAL_MINUTES_HANDLERS_EXCEL_AND_SAVE_API_MEMORY',sourceSHA:createHash('sha256').update(source).digest('hex'),results,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,productWrites:0,EFileWrites:0,operationalWrites:0,DriveWrites:0,externalRequests:0,limits:['Actual source handler/ref/cleanup/capture bodies with delayed synthetic FileReader and selection-form synchronization.','Actual Excel serializer/parser and collaboration save API on SQLite memory; not a full component/browser or real Drive upload.']};
 if(outputPath)writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3),result=await checkMeetingFileContext({sourcePath:option('source'),outputPath:option('output')});
 if(result.failed)process.exitCode=1;
}
