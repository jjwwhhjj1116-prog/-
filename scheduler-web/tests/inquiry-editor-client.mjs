import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime');
const sourceFile=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||new URL('../src/components/ProjectInquiries.tsx',import.meta.url);
const source=readFileSync(sourceFile,'utf8'),ast=ts.createSourceFile('ProjectInquiries.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProjectInquiries');
const mainReturn=fn.body.statements.find(n=>ts.isReturnStatement(n));
assert.ok(mainReturn,'Actual component JSX return');
const capturedSource=source.slice(0,mainReturn.getStart(ast))+`capture({draft,remote,cap,ready,busy,error,notice,setDraft,setPreview,apply,travel,persist,selection,setSelection,key,history:history.current});\n`+source.slice(mainReturn.getStart(ast));
const compiled=ts.transpileModule(capturedSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const actualHelpers={};
let helperServer;
for(const n of ast.statements)if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text.startsWith('../utils/')&&!n.importClause?.isTypeOnly&&n.moduleSpecifier.text!=='../utils/inquiryDrafts'){
 const path=n.moduleSpecifier.text;
 try{actualHelpers[path]=await import(new URL('../src/'+path.slice(3)+'.ts',import.meta.url));}
 catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;helperServer??=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});actualHelpers[path]=await helperServer.ssrLoadModule('/src/'+path.slice(3)+'.ts');}
}
const text=n=>Array.isArray(n)?n.map(text).join(''):n==null||typeof n==='boolean'?'':typeof n==='object'?text(n.props?.children):String(n);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'&&n.props?[n,...nodes(n.props.children)]:[];
const actor=(id='qa-actor-a')=>({id,name:'합성 검수자',position:'실장',department:'마감팀',role:'ADMIN',company:'CONCOST'});
const row=(id='qa-row103',department='마감팀')=>({id,projectId:'qa-project103',department,trade:'조적',no:'1',classification:'합성',group:'1차',drawingNumbers:[],question:'중앙 원문',answer:'',review:'',notes:'',images:[],status:'DRAFT',authorId:'qa-actor-a',authorName:'합성 검수자',createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',revision:1});
const photo={id:'qa-photo103',name:'합성.png',mimeType:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Vn1cAAAAASUVORK5CYII=',field:'question'};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function screen(config={}){
 const hooks=[],effects=[],intervals=[],writes=[],calls=[],auth={currentUser:actor(),users:[actor(),actor('qa-actor-b')]},studio={ready:true},server={rows:structuredClone(config.rows||[row()])};
 const projectState={personnel:auth.users,projects:[{id:'qa-project103',code:'QA103',name:'합성 프로젝트',department:'마감팀',subTasks:{PM:{personIds:['qa-actor-a','qa-actor-b'],startDate:'2026-10-13',endDate:'2026-10-14'}}}]};
 let cursor=0,pendingEffects=[],tree,handlers,holdPoll=false,pollGate,writeGate,renderNeeded=false;
 const local=new Map(config.local?[[`qa-actor-a:마감팀:qa-project103`,structuredClone(config.local)]]:[]);
 const state=(initial)=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return[hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;renderNeeded=true;}];};
 const ref=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
 const memo=(factory,deps)=>{const index=cursor++,old=hooks[index];if(!old||!deps||deps.some((d,i)=>!Object.is(d,old.deps?.[i]))||deps.length!==old.deps?.length)hooks[index]={value:factory(),deps};return hooks[index].value;};
 const effect=(create,deps)=>{const index=cursor++,old=effects[index];if(!old||deps?.some((d,i)=>!Object.is(d,old.deps?.[i]))||deps?.length!==old.deps?.length){pendingEffects.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:create()};});}};
 async function api(path,method='GET',body){calls.push({path,method,body:body&&structuredClone(body)});if(method==='GET'){const response={inquiries:structuredClone(server.rows),capabilities:{canCreate:true,canManage:true}};if(holdPoll){pollGate=deferred();return pollGate.promise;}return response;}
  if(method==='PUT'){const saved={...structuredClone(body.inquiry),revision:body.revision+1,updatedAt:'2026-10-13T01:00:00Z'};server.rows=server.rows.filter(r=>r.id!==saved.id).concat(saved);if(config.holdWrite){writeGate=deferred();return writeGate.promise;}return {inquiry:saved};}
  if(method==='POST'){if(config.registerFailure)throw Error('합성 등록 실패');const saved={...server.rows.find(r=>path.includes(r.id)),status:'REGISTERED',revision:body.revision+1};server.rows=server.rows.filter(r=>r.id!==saved.id).concat(saved);return {inquiry:saved};}throw Error('Unexpected API');}
 const exported={};
 runInNewContext(compiled,{exports:exported,capture:obj=>{handlers=obj;},Date,JSON,Map,Set,Promise,Error,crypto:{randomUUID},structuredClone,File,Blob,URL,
  HTMLTextAreaElement:class{},HTMLInputElement:class{},window:{addEventListener(){},removeEventListener(){}},setTimeout(){},
  setInterval:callback=>{const record={callback,active:true};intervals.push(record);return record;},clearInterval:record=>{record.active=false;},require:path=>{
   if(path==='react')return {useState:state,useRef:ref,useEffect:effect,useMemo:memo,useCallback:(callback,deps)=>memo(()=>callback,deps)};if(path==='react/jsx-runtime')return jsx;if(path==='lucide-react')return new Proxy({},{get:()=>()=>null});
   if(path==='../store/useAuthStore')return {useAuthStore:Object.assign(selector=>selector(auth),{getState:()=>auth})};
   if(path==='../store/useStudioStore')return {useStudioStore:()=>studio};
   if(path==='../store/useProjectStore')return {TEAM_ROLES:{마감팀:['PM','조적','창호'],구조팀:['PM','기둥'],['토목&조경팀']:['PM','토목']},useProjectStore:selector=>selector(projectState)};
   if(path==='../services/studioApi')return {studioApi:api};if(path==='../services/inquiryExcel')return {readInquiryExcel(){throw Error('Import service is independently tested');},downloadInquiryExcel(){}};
   if(path==='../utils/inquiryDrafts')return {readInquiryDraft:async key=>structuredClone(local.get(key)),writeInquiryDraft:async(key,data)=>{writes.push({key,data:structuredClone(data)});local.set(key,structuredClone(data));}};
   if(actualHelpers[path])return actualHelpers[path];throw Error('Unexpected dependency '+path);
  }});
 const render=()=>{cursor=0;renderNeeded=false;tree=exported.ProjectInquiries({department:'마감팀',initialProjectId:'qa-project103',initialTrade:'조적',visible:true});};
 const flush=async()=>{for(let turn=0;turn<6;turn++){const work=pendingEffects;pendingEffects=[];for(const execute of work)execute();await new Promise(resolve=>setImmediate(resolve));if(renderNeeded)render();if(!pendingEffects.length&&!renderNeeded)break;}};
 const button=label=>{const found=nodes(tree).find(n=>n.type==='button'&&(text(n).trim()===label||n.props['aria-label']===label));assert.ok(found,'button '+label);return found;};
 render();
 return {flush,render,button,get h(){return handlers;},get tree(){return tree;},writes,calls,server,auth,edit:async transform=>{handlers.apply({...handlers.draft,rows:handlers.draft.rows.map(transform)});render();await flush();},switchActor:async()=>{auth.currentUser=actor('qa-actor-b');render();await flush();},startPoll:()=>{holdPoll=true;intervals.findLast(r=>r.active).callback();},releasePoll:response=>pollGate.resolve(response),releaseWrite:()=>writeGate.resolve({inquiry:structuredClone(server.rows[0])})};
}
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.log('FAIL '+name+' '+error.message);}}
await check('질의 편집: 일반 임시저장은 실제 PUT handler로 revision 갱신',async()=>{
 const s=screen();await s.flush();await s.edit(r=>({...r,question:'합성 편집'}));await s.h.persist(false);s.render();await s.flush();assert.equal(s.h.draft.rows[0].revision,2);assert.equal(s.h.remote[0].revision,2);assert.match(s.h.notice,/1개/);
});
await check('질의 편집: 계정 전환시 이전 사진·본문을 다른 actor IDB키에 기록 금지',async()=>{
 const s=screen();await s.flush();s.h.apply({...s.h.draft,unassignedImages:[{...photo,sourceSheet:'개인 원문',sourceRow:1}]});s.render();await s.flush();s.writes.length=0;await s.switchActor();
 assert.ok(!s.writes.some(w=>w.key.startsWith('qa-actor-b:')&&w.data.unassignedImages.length),'새 actor키에 이전actor사진 기록됨');
});
await check('질의 편집: Excel preview 다른 팀 행은 현재 프로젝트에 추가 금지',async()=>{
 const s=screen({rows:[]});await s.flush();s.h.setPreview({inquiries:[row('qa-finish'),{...row('qa-structure','구조팀'),trade:'기둥'}],warnings:[],unassignedImages:[]});s.render();await s.button('현재 프로젝트에 불러오기').props.onClick();s.render();await s.flush();assert.ok(s.h.draft.rows.every(r=>r.department==='마감팀'),'구조팀행이 마감projectId로 로컬추가됨');
});
await check('질의 편집: 늦은8초 조회가 성공 PUT의 revision·본문을 덮지 않음',async()=>{
 const s=screen();await s.flush();s.startPoll();await s.edit(r=>({...r,question:'저장 확정 본문'}));await s.h.persist(false);s.render();await s.flush();assert.equal(s.h.remote[0].revision,2);
 s.releasePoll({inquiries:[row()],capabilities:{canCreate:true,canManage:true}});await s.flush();assert.equal(s.h.remote[0].revision,2);assert.equal(s.h.draft.rows[0].question,'저장 확정 본문');
});
await check('질의 편집: 저장중 사진 제거·CtrlZ가 현재 입력을 바꾸지 않음',async()=>{
 const s=screen({rows:[{...row(),images:[photo]}],holdWrite:true});await s.flush();await s.edit(r=>({...r,question:'저장중 유지 본문'}));const pending=s.h.persist(false);s.render();await s.flush();
 const before=JSON.stringify(s.h.draft),remove=s.button('합성.png 사진 제거');if(!remove.props.disabled)remove.props.onClick();s.render();assert.equal(JSON.stringify(s.h.draft),before,'저장중사진삭제로입력변경');const region=nodes(s.tree).find(n=>n.props.role==='region'&&n.props.onKeyDown);region.props.onKeyDown({ctrlKey:true,key:'z',preventDefault(){}});s.render();assert.equal(JSON.stringify(s.h.draft),before);s.releaseWrite();await pending;
});
await check('질의 편집: PUT성공·등록실패시 확정revision 유지해 재시도 가능',async()=>{
 const s=screen({registerFailure:true});await s.flush();await s.edit(r=>({...r,question:'상신 전 저장'}));await s.h.persist(true);s.render();await s.flush();assert.equal(s.server.rows[0].revision,2);assert.equal(s.h.draft.rows[0].revision,2);assert.equal(s.h.remote[0].revision,2);assert.match(s.h.error,/등록 실패/);
});
await check('질의 편집: 저장 응답 대기중 계정전환은 새 context busy를 해제',async()=>{
 const s=screen({holdWrite:true});await s.flush();await s.edit(r=>({...r,question:'이전 계정 저장'}));const pending=s.h.persist(false);s.render();await s.flush();assert.equal(s.h.busy,true);
 await s.switchActor();assert.equal(s.h.ready,true);assert.equal(s.h.busy,false);s.releaseWrite();await pending;s.render();assert.equal(s.h.busy,false);
});
await check('질의 편집: 미수정 보관본은 중앙최신 채택·실제미저장 입력은 보존',async()=>{
 const latest={...row(),question:'동료가 갱신한 중앙 본문',revision:2},local={rows:[row()],baseRows:[row()],unassignedImages:[],updatedAt:1};
 const cached=screen({rows:[latest],local});await cached.flush();assert.equal(cached.h.draft.rows[0].question,latest.question);assert.equal(cached.h.draft.rows[0].revision,2);
 const edited=screen({rows:[latest],local:{...local,rows:[{...row(),question:'실제 미저장 보관 입력'}]}});await edited.flush();assert.equal(edited.h.draft.rows[0].question,'실제 미저장 보관 입력');assert.equal(edited.h.draft.rows[0].revision,1);assert.equal(edited.h.remote[0].revision,2);
});
const report={kind:'ACTUAL_PROJECT_INQUIRIES_COMPONENT_HOOK_EFFECT_HANDLER_MEMORY',sourceSHA256:createHash('sha256').update(source).digest('hex').toUpperCase(),PASS:results.filter(r=>r.status==='PASS').length,FAIL:results.filter(r=>r.status==='FAIL').length,results,operatingWrites:0,networkRequests:0,limits:['React hook/effect scheduling and store/IDB/API are isolated in memory; complete source component and its real handlers execute.','Native clipboard/canvas/browser interactions are covered separately by root browser QA.']};
const out=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(out)writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.FAIL)process.exitCode=1;
await helperServer?.close();
