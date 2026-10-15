import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime');
const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const serviceCode=compile('../src/services/googleDriveService.ts'),componentCode=compile('../src/components/DriveView.tsx');
const text=node=>Array.isArray(node)?node.map(text).join(''):node==null||typeof node==='boolean'?'':typeof node==='object'?text(node.props?.children):String(node);
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fixture={id:'qa-drive-file',project_code:'QA-DRIVE-A',project_name:'합성 프로젝트 A',main_folder:'02.마감자료',team_name:'마감팀',role_name:'조적',category:'1.납품자료',original_name:'합성 원본.pdf',mime_type:'application/pdf',byte_size:15_000_000_000,uploaded_by:'합성 회원',uploaded_at:'2026-10-15T03:00:00Z',drive_url:'https://drive.google.com/file/d/untrusted-link/view',storage_path:'기술본부 자료실/[QA-DRIVE-A] 합성 프로젝트 A/02.마감자료/1.납품자료/합성 회원_2026.10.15'};
function screen(options={}){
 const calls=[],anchors=[],appended=[],timers=[],hooks=[],effects=[],auth={currentUser:{id:'qa-user',name:'합성 회원',email:'member@example.invalid'}},projects=[{id:'a',code:'QA-DRIVE-A',name:'합성 프로젝트 A',department:'마감팀'},{id:'b',code:'QA-DRIVE-B',name:'합성 프로젝트 B',department:'구조팀'}];
 let cursor=0,pendingEffects=[],tree,renderNeeded=false,downloadGate,uploadGate;
 const fetch=async(url,init={})=>{calls.push({url,init});
  if(url==='/api/google/status')return options.statusFailure?new Response(null,{status:503}):Response.json({connected:true,status:'CONNECTED',companyEmail:'actual-owner@example.invalid'});
  if(url.startsWith('/api/drive/files/download')){if(options.holdDownload){downloadGate??=deferred();return downloadGate.promise;}return new Response(null,{status:options.downloadStatus||200});}
  if(url.startsWith('/api/drive/files?'))return Response.json({files:url.includes('QA-DRIVE-A')?[fixture]:[]});
  if(url==='/api/drive/folders/ensure')return Response.json({success:true,folderPath:fixture.storage_path});
  throw Error('Unexpected fetch '+url);
 };
 const service={};runInNewContext(serviceCode,{exports:service,fetch,AbortSignal,console,URL,Error,document:{createElement:tag=>{assert.equal(tag,'a');const anchor={click(){anchors.push({href:anchor.href,download:anchor.download});},remove(){}};return anchor;},body:{appendChild:anchor=>appended.push(anchor)}},require:path=>{assert.equal(path,'./resumableUpload');return {};}});
 const state=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;renderNeeded=true;}];};
 const ref=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
 const memo=(factory,deps)=>{const index=cursor++,old=hooks[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))hooks[index]={value:factory(),deps};return hooks[index].value;};
 const effect=(create,deps)=>{const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i])))pendingEffects.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:create()};});};
 const uiService={...service,uploadVaultFile:async params=>{calls.push({upload:params});uploadGate=deferred();return uploadGate.promise;}};
 const exported={};runInNewContext(componentCode,{exports:exported,fetch,AbortSignal,AbortController,console,Error,setTimeout:callback=>{timers.push(callback);},setInterval:()=>0,clearInterval(){},require:path=>{
  if(path==='react')return {useState:state,useRef:ref,useMemo:memo,useEffect:effect};
  if(path==='react/jsx-runtime')return jsx;
  if(path==='../store/useAuthStore')return {useAuthStore:()=>auth};
  if(path==='../store/useProjectStore')return {useProjectStore:()=>({projects}),TEAM_ROLES:{'마감팀':['PM','조적'],'구조팀':['PM','기둥']}};
  if(path==='../services/googleDriveService')return uiService;
  if(path==='lucide-react')return new Proxy({},{get:()=>()=>null});
  throw Error('Unexpected import '+path);
 }});
 const render=()=>{cursor=0;renderNeeded=false;tree=exported.DriveView();};
 const flush=async()=>{for(let i=0;i<8;i++){const work=pendingEffects;pendingEffects=[];for(const run of work)run();await new Promise(resolve=>setImmediate(resolve));if(renderNeeded)render();if(!pendingEffects.length&&!renderNeeded)break;}};
 const button=label=>{const found=nodes(tree).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(found,'button '+label);return found;};
 render();return {flush,render,button,calls,anchors,appended,service,get tree(){return tree;},releaseDownload:status=>downloadGate.resolve(new Response(null,{status})),releaseUpload:()=>uploadGate.resolve({...fixture,id:fixture.id,projectCode:fixture.project_code,storagePath:fixture.storage_path}),selectProject:async code=>{nodes(tree).find(node=>node.type==='select'&&node.props.value?.startsWith('QA-DRIVE')).props.onChange({target:{value:code}});render();await flush();}};
}
const results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.stack});console.error('FAIL '+name,error);}}
await check('actual download: HEAD permission preflight then same-origin browser download without fetching 15GB into memory',async()=>{
 const s=screen();await s.flush();await s.service.downloadVaultFile({id:'id/with ? special',originalName:'원본.pdf',driveUrl:'https://drive.google.com/ignored',downloadUrl:'https://untrusted.invalid'});
 const head=s.calls.find(call=>call.init.method==='HEAD');assert.equal(head.url,'/api/drive/files/download?id=id%2Fwith%20%3F%20special');assert.equal(head.init.credentials,'same-origin');assert.equal(head.init.redirect,'error');assert.equal(head.init.cache,'no-store');assert.equal(s.anchors.length,1);assert.equal(s.anchors[0].href,head.url);assert.equal(s.anchors[0].download,'원본.pdf');assert.equal(s.calls.filter(call=>call.url.includes('/download')).length,1);
});
await check('actual download: expired/forbidden/missing/changed originals do not start browser downloads',async()=>{
 for(const [status,message]of [[401,/로그인/],[403,/권한/],[404,/찾을 수/],[409,/원본이 변경/],[503,/Drive 연결/]]){const s=screen({downloadStatus:status});await s.flush();await assert.rejects(()=>s.service.downloadVaultFile({id:'qa',originalName:'a.pdf'}),message);assert.equal(s.anchors.length,0);}
});
await check('vault UI: actual company account and returned physical path; no direct Drive links',async()=>{
 const s=screen();await s.flush();assert.match(text(s.tree),/actual-owner@example.invalid/);assert.match(text(s.tree),/회원은 Google 계정 없이 스튜디오/);assert.match(text(s.tree),/공종은 파일 분류/);assert.match(text(s.tree),/합성 회원_2026.10.15/);assert.ok(!nodes(s.tree).some(node=>node.type==='a'&&String(node.props.href).includes('drive.google.com')));assert.equal(s.button('스튜디오 권한으로 다운로드').props.disabled,false);
});
await check('vault UI: connection failure never looks connected and blocks actual upload',async()=>{
 const s=screen({statusFailure:true});await s.flush();assert.match(text(s.tree),/연결 확인 실패/);assert.ok(!text(s.tree).includes('저장 계정:'));assert.ok(!text(s.tree).includes('계층 폴더 실연동'));
 nodes(s.tree).find(node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files:[new File(['qa'],'qa.pdf')]}});s.render();await s.flush();assert.match(text(s.tree),/연결을 확인하지 못했습니다/);assert.ok(!s.calls.some(call=>call.upload));
});
await check('vault UI: pending preflight disables duplicate download and reports failure without external navigation',async()=>{
 const s=screen({holdDownload:true});await s.flush();s.button('스튜디오 권한으로 다운로드').props.onClick();s.render();await s.flush();assert.equal(s.button('다운로드 준비 중…').props.disabled,true);s.button('다운로드 준비 중…').props.onClick();assert.equal(s.calls.filter(call=>call.init.method==='HEAD').length,1);s.releaseDownload(403);await s.flush();assert.match(nodes(s.tree).find(node=>node.props.role==='alert')&&text(nodes(s.tree).find(node=>node.props.role==='alert')),/스튜디오 권한/);assert.equal(s.anchors.length,0);assert.equal(s.button('스튜디오 권한으로 다운로드').props.disabled,false);
});
await check('vault folders: selected main/subtitle are sent while legacy two-argument caller remains valid',async()=>{
 const s=screen();await s.flush();await s.button('Drive 폴더 즉시생성/확인').props.onClick();s.render();await s.flush();const request=s.calls.find(call=>call.url==='/api/drive/folders/ensure');assert.deepEqual(JSON.parse(request.init.body),{projectCode:'QA-DRIVE-A',projectName:'합성 프로젝트 A',mainFolder:'02.마감자료',subtitle:'1.납품자료'});assert.match(text(s.tree),/저장 폴더를 확인했습니다/);await s.service.ensureProjectFolders('QA-LEGACY','기존 호출');assert.deepEqual(JSON.parse(s.calls.at(-1).init.body),{projectCode:'QA-LEGACY',projectName:'기존 호출'});
});
await check('vault upload: switching project mid-transfer preserves original target and server-reported storage path',async()=>{
 const s=screen();await s.flush();nodes(s.tree).find(node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files:[new File(['qa'],'qa.pdf')]}});await s.flush();assert.equal(s.calls.find(call=>call.upload).upload.projectCode,'QA-DRIVE-A');await s.selectProject('QA-DRIVE-B');s.releaseUpload();await s.flush();assert.match(text(s.tree),/저장 폴더: 기술본부 자료실\/\[QA-DRIVE-A\]/);assert.ok(!text(s.tree).includes('합성 원본.pdf'));assert.ok(!s.calls.some(call=>call.upload?.projectCode==='QA-DRIVE-B'));
});
await check('actual settings status: real storage account retained only after successful server verification',async()=>{
 const source=readFileSync(new URL('../src/store/useAuthStore.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('auth.ts',source,ts.ScriptTarget.Latest,true);let initializer;
 function visit(node){if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='testGoogleDriveConnection')initializer=node.initializer;ts.forEachChild(node,visit);}visit(ast);assert.ok(initializer);
 const code=ts.transpileModule('exports.check = '+initializer.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [status,body,expected]of [[200,{connected:true,companyEmail:'real-owner@example.invalid'},true],[503,{connected:true,companyEmail:'stale-owner@example.invalid'},false],[200,{connected:false,companyEmail:'stale-owner@example.invalid'},false]]){
  let config={connected:true,companyEmail:'old@example.invalid',clientSecret:'never-retain-this',clientId:'unchanged-public-id'};const exported={},stored=[];
  runInNewContext(code,{exports:exported,fetch:async()=>Response.json(body,{status}),get:()=>({googleDriveConfig:config}),set:value=>{config=value.googleDriveConfig;},localStorage:{setItem:(key,value)=>stored.push(JSON.parse(value))},GDRIVE_STORAGE_KEY:'qa-drive-config',Date});
  assert.equal(await exported.check(),expected);assert.equal(config.companyEmail,expected?'real-owner@example.invalid':'');assert.equal(config.clientSecret,'');assert.equal(config.clientId,'unchanged-public-id');assert.equal(stored.at(-1).connected,expected);
 }
});
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
