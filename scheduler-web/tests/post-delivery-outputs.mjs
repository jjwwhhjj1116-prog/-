import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server'),XLSX=require('xlsx');
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages()],server:{middlewareMode:true,hmr:false},appType:'custom'}),results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}};
const follow=(id,department,startDate,memo,extra={})=>({id,department,kind:'수정',startDate,endDate:startDate,memo,personIds:['staff'],status:'예정',submissionStatus:'REPORTED',createdBy:'staff',...extra});
const project={id:'supplement-output',code:'QA-SUPPLEMENT',name:'합성 보완 출력 현장',department:'마감팀',pmId:'staff',status:'납품',progress:100,startDate:'2026-10-01',endDate:'2026-10-10',roles:{},subTasks:{내부:{roleName:'내부',personIds:['staff'],startDate:'2026-10-01',endDate:'2026-10-10',progress:100,status:'완료',allocations:[{id:'a',personIds:['staff'],startDate:'2026-10-01',endDate:'2026-10-10'}]}},postDeliveryTasks:[follow('cross','구조팀','2026-11-18','구조 보완 원문'),follow('cancel','구조팀','2026-11-17','취소된 보완 원문',{submissionStatus:'CANCELLED'}),follow('legacy','마감팀','2026-11-20','기존 보완 원문',{submissionStatus:undefined,department:undefined})]};
const original=JSON.stringify(project),date=new Date(2026,10,1),people=[{id:'staff',name:'합성 직원',region:'KOREA',team:'구조팀',avatar:''}];
try{
 const {buildProjectRangeWorkbook}=await server.ssrLoadModule('/src/services/excelService.ts');
 await check('팀 Excel: 타팀 레코드의 본인팀 보완 포함·취소 제외·원 일정/복원 JSON 불변',()=>{
  const wb=buildProjectRangeWorkbook([project],people,date,1,[],'구조팀'),rows=XLSX.utils.sheet_to_json(wb.Sheets['납품후검토수정']);
  assert.equal(rows.length,1);assert.equal(rows[0]['담당부서'],'구조팀');assert.equal(rows[0]['수정·검토 메모'],'구조 보완 원문');
  const timeline=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});assert.equal(timeline.length,4);assert.equal(timeline[3][6],'');assert.equal(timeline[3][7],'');assert.ok(!timeline[3].some(value=>String(value).includes('■')));assert.equal(timeline[3][9+17],'◆수정');assert.equal(timeline[3][9+16],'');
  const restored=XLSX.utils.sheet_to_json(wb.Sheets['복원데이터']);assert.deepEqual(JSON.parse(restored[0].data),JSON.parse(original));assert.equal(JSON.stringify(project),original);
 });
 await check('전체 Excel: 기존/신규 보완 함께 출력·취소일이 다른 작업으로 칠해지지 않음',()=>{
  const wb=buildProjectRangeWorkbook([project],people,date),rows=XLSX.utils.sheet_to_json(wb.Sheets['납품후검토수정']);assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row['담당부서']),['구조팀','마감팀']);assert.ok(!JSON.stringify(rows).includes('취소된 보완 원문'));assert.equal(JSON.stringify(project),original);
 });
 const {PrintScheduleModal}=await server.ssrLoadModule('/src/components/PrintScheduleModal.tsx');
 const {ProjectDetailPrint}=await server.ssrLoadModule('/src/components/ProjectDetailPrint.tsx');
 await check('실제 출력 컴포넌트: 타팀 보완 레인/상세 포함·취소 제외·부모 납품 상태 보존',()=>{
  const html=renderToStaticMarkup(React.createElement(PrintScheduleModal,{isOpen:true,onClose(){},projects:[project],personnel:people,currentUserName:'합성',departmentFilter:'구조팀',targetDate:date}));assert.ok(html.includes('구조 보완 원문'));assert.ok(!html.includes('취소된 보완 원문'));assert.ok(!html.includes('기존 보완 원문'));
  const detail=renderToStaticMarkup(React.createElement(ProjectDetailPrint,{project,people,leaves:[],onClose(){}}));assert.ok(detail.includes('구조 보완 원문'));assert.ok(detail.includes('기존 보완 원문'));assert.ok(!detail.includes('취소된 보완 원문'));assert.equal(JSON.stringify(project),original);
 });
 await check('실제 알림 클릭: 자동 보고는 승인 팝업 없이 정확한 프로젝트·보완 일정으로 이동',async()=>{
  let cursor=0;const slots=[],auth={currentUser:{id:'reader'}},notice={id:'supplement-report:task-1:r1:reader',meeting_id:'supplement:project:part:task-1',message:'합성 보완 일정 등록 보고',read_at:null,created_at:new Date().toISOString()};
  const store={ready:true,status:'연결',pending:0,conflict:false,notifications:[notice],unreadCount:1,actorId:'reader'},useAuthStore=selector=>selector(auth);useAuthStore.getState=()=>auth;
  const mocked={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];}};
  const modules={'react':mocked,'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../services/studioApi':{studioApi:async()=>({})},'../store/useStudioStore':{useStudioStore:()=>store,refreshStudioMeetings:async()=>{},publishLocalTeam:async()=>{},resolveScheduleConflict:async()=>{}},'../store/usePersonalStore':{usePersonalStore:{setState(){}},refreshPersonal:async()=>{}},'../store/useAuthStore':{useAuthStore}};
  const module={exports:{}},code=ts.transpileModule(readFileSync(new URL('../src/components/StudioCollaboration.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(modules[name],name);return modules[name];},Date});
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node?.props?[node,...nodes(node.props.children)]:[];
  const calls=[],render=()=>{cursor=0;return module.exports.StudioCollaboration({onOpenMeeting(){throw Error('wrong meeting');},onOpenSupplement:(...args)=>calls.push(args)});};
  let tree=render();assert.ok(!nodes(tree).some(node=>node.props.role==='dialog'));nodes(tree).find(node=>node.type==='button'&&node.props['aria-expanded']===false).props.onClick();tree=render();const button=nodes(tree).find(node=>node.type==='button'&&JSON.stringify(node.props.children).includes(notice.message));assert.ok(button);button.props.onClick();await Promise.resolve();assert.deepEqual(calls,[['project:part','task-1']]);
 });
}finally{await server.close();}
const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify({kind:'POST_DELIVERY_ACTUAL_EXPORT_PRINT_NOTIFICATION_MODULES',results,operatingWrites:0},null,2));if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
