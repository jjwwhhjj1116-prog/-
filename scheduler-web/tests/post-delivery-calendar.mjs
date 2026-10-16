import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';

const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),jsx=require('react/jsx-runtime');
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
let requests=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error('검수 외부 요청 금지');};
const server=await createServer({ssr:{noExternal:[/^(react|react-dom|zustand|xlsx|date-fns|lucide-react)(\/|$)/]},plugins:[nativeSsrPackages()],server:{middlewareMode:true,hmr:false},appType:'custom'}),results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}};
try{
 const modules=await Promise.all(['/src/components/ProjectCalendar.tsx','/src/store/useProjectStore.ts','/src/store/useAuthStore.ts','/src/store/usePersonalStore.ts','/src/store/useLanguageStore.ts','/src/utils/personalWork.ts','/src/utils/postDeliveryVisibility.ts','/src/utils/scheduleProgress.ts','/src/utils/staffOrder.ts','/src/utils/vietPersonnel.ts','/src/constants/holidays.ts','/src/services/excelService.ts','/src/data/vietTeams.ts'].map(path=>server.ssrLoadModule(path)));
 const [{default:ProjectCalendar},{useProjectStore:projectStore},{useAuthStore:auth},{usePersonalStore:personal},{useLanguageStore:language},work,visibility,progress,staff,vietPersonnel,holidays,excel,vietTeams]=modules;
 const extensionPeriods=await server.ssrLoadModule('/src/utils/scheduleExtensionPeriods.ts');
 const {PostDeliverySchedule}=await server.ssrLoadModule('/src/components/PostDeliverySchedule.tsx');
 const departments=['마감팀','구조팀','토목&조경팀'];
 const users=departments.map((department,index)=>({id:'qa-person-'+index,name:'합성 담당 '+index,company:'컨코스트',department,position:'프로',active:true,role:'MEMBER',no:90000+index,email:'qa'+index+'@example.invalid'}));
 const follow=(id,person,department,extra={})=>({id,kind:'수정',startDate:'2026-11-02',endDate:'2026-11-04',memo:'합성 보완 '+id,personIds:[person.id],status:'예정',...(department?{department}:{}),...extra});
 const original={id:'qa-finished',code:'QA-FINISHED',name:'[합성] 원 납품 프로젝트',department:'마감팀',pmId:users[0].id,startDate:'2026-10-01',endDate:'2026-10-20',progress:100,status:'납품',roles:{},subTasks:{내부:{roleName:'내부',personId:users[0].id,personIds:[users[0].id],startDate:'2026-10-01',endDate:'2026-10-20',progress:100,status:'완료',memo:'원 납품 공종',allocations:[{id:'main',personIds:[users[0].id],startDate:'2026-10-01',endDate:'2026-10-20'}]}},postDeliveryTasks:[follow('legacy',users[0]),follow('structure',users[1],'구조팀',{submissionStatus:'REPORTED',createdBy:users[1].id}),follow('civil',users[2],'토목&조경팀',{submissionStatus:'REPORTED',createdBy:users[2].id}),follow('cancelled',users[1],'구조팀',{submissionStatus:'CANCELLED',createdBy:users[1].id})]};
 const live={id:'qa-live',code:'QA-LIVE',name:'[합성] 진행 프로젝트',department:'구조팀',pmId:users[1].id,startDate:'2026-11-02',endDate:'2026-11-04',progress:20,status:'진행중',roles:{},subTasks:{보:{roleName:'보',personId:users[1].id,personIds:[users[1].id],startDate:'2026-11-02',endDate:'2026-11-04',progress:20,status:'진행중',memo:'진행 본공종'}}};
 const source=[original,live],saved=JSON.stringify(source),date=new Date(2026,10,1);
 const state=(store,patch)=>{Object.assign(store.getInitialState(),patch);store.setState(patch);};
 const reset=department=>{state(projectStore,{projects:source,personnel:users.map(user=>({id:user.id,name:user.name,region:'KOREA',team:user.department,avatar:''})),filterDepartment:department,selectedProjectId:null});state(auth,{users,currentUser:users[0],isAuthenticated:true});state(personal,{leaves:[],checks:[]});state(language,{lang:'ko'});};
 const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
 const hook=store=>Object.assign(selector=>typeof selector==='function'?selector(store.getState()):store.getState(),{getState:store.getState});
 const personalSourcePath=process.argv.find(arg=>arg.startsWith('--personal-source='))?.slice('--personal-source='.length);
 const personalSource=readFileSync(personalSourcePath||new URL('../src/components/PersonalScheduleView.tsx',import.meta.url),'utf8');
 function personalCalendar(department,onOpenPostDelivery){
  let cursor=0,tree;const hooks=[];
  const mockReact={...React,useState(initial){const index=cursor++;if(!hooks[index])hooks[index]={value:index===1?date:typeof initial==='function'?initial():initial};return [hooks[index].value,value=>{hooks[index].value=typeof value==='function'?value(hooks[index].value):value;}];},useMemo:fn=>fn()};
  const dependencies={react:mockReact,'react/jsx-runtime':jsx,'date-fns':require('date-fns'),'date-fns/locale':require('date-fns/locale'),'lucide-react':require('lucide-react'),'../store/useProjectStore':{useProjectStore:hook(projectStore)},'../store/useAuthStore':{useAuthStore:hook(auth)},'../store/usePersonalStore':{usePersonalStore:hook(personal)},'../store/useLanguageStore':{useLanguageStore:hook(language)},'../utils/personalWork':work,'../utils/staffOrder':staff,'../utils/vietPersonnel':vietPersonnel,'../data/vietTeams':vietTeams,'../constants/holidays':holidays,'./VietTeamModal':{VietTeamModal:()=>null},'./ProjectCalendar':{default:ProjectCalendar},'../services/excelService':excel};
  dependencies['../utils/scheduleExtensionPeriods']=extensionPeriods;
  dependencies['../utils/postDeliveryVisibility']=visibility;
  dependencies['./ProjectCalendar']={__esModule:true,default:ProjectCalendar};
  const exports={};runInNewContext(ts.transpileModule(personalSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,Date,console,require(id){assert.ok(id in dependencies,id);return dependencies[id];}});
  const render=()=>{cursor=0;tree=exports.PersonalScheduleView({department,onOpenPostDelivery});};render();
  const teamHtml=onOpenPostDelivery?renderToStaticMarkup(tree):undefined;
  nodes(tree).find(node=>node.type==='button'&&String(node.props.children).includes('개인/팀별 캘린더')).props.onClick();render();return {tree,html:renderToStaticMarkup(tree),teamHtml};
 }
 await check('legacy·즉시 보고 확정, 취소 제외 및 원 팀 fallback',()=>{assert.deepEqual(visibility.visiblePostDeliveryTasks(original).map(task=>task.id),['legacy','structure','civil']);assert.equal(visibility.postDeliveryDepartment(original,original.postDeliveryTasks[0]),'마감팀');assert.equal(visibility.visiblePostDeliveryTasks(original,'구조팀')[0].id,'structure');});
 await check('보완은 원 납기·공종 범위·공정률을 늘리지 않음',()=>{assert.deepEqual(progress.projectScheduleRange(original),{start:'2026-10-01',end:'2026-10-20'});assert.equal(progress.projectProgress(original).actual,100);assert.equal(JSON.stringify(source),saved);});
 await check('타팀 원본에도 실제 보완팀으로 할일·업무일지 합산 및 취소 제외',()=>{for(const [index,id] of ['legacy','structure','civil'].entries()){const items=work.assignedItems(users[index].id,'2026-11-03',source);const followup=items.filter(item=>item.projectId===original.id);assert.equal(followup.length,1);assert.equal(followup[0].id,`gen-${original.id}-followup-${id}`);assert.equal(followup[0].department,departments[index]);assert.ok(work.automaticWorkLogItems(followup,'2026-11-03')[0].progress>0);}assert.ok(!work.assignedTasks(users[1].id,source).some(item=>item.id.includes('cancelled')));});
 await check('통합 프로젝트는 보완 전공종을 독립 바에 표시하고 원 납품 바 부활 없음',()=>{reset('ALL');const html=renderToStaticMarkup(createElement(ProjectCalendar,{date}));for(const id of ['legacy','structure','civil'])assert.ok(html.includes(`data-post-delivery-id="${id}"`));assert.ok(!html.includes('data-post-delivery-id="cancelled"'));assert.ok(!html.includes('data-main-project-id="qa-finished"'));assert.ok(html.includes('data-main-project-id="qa-live"'));});
 await check('구조·토목 팀에서 원본 마감 프로젝트의 자기 보완만 합산',()=>{for(const [department,id] of [['구조팀','structure'],['토목&조경팀','civil']]){reset(department);const html=renderToStaticMarkup(createElement(ProjectCalendar,{date}));assert.ok(html.includes(`data-post-delivery-id="${id}"`));assert.ok(html.includes(`data-post-delivery-department="${department.replaceAll('&','&amp;')}"`));assert.ok(!html.includes('data-post-delivery-id="legacy"'));assert.ok(!html.includes('data-main-project-id="qa-finished"'));assert.ok(!html.includes('data-post-delivery-id="cancelled"'));}});
 await check('세 팀 개인 캘린더는 진행 업무와 보완을 함께 배정하며 취소는 제외',()=>{for(const [index,id] of ['legacy','structure','civil'].entries()){reset(departments[index]);const {html}=personalCalendar(departments[index]);assert.ok(html.includes(`data-schedule-unit="${users[index].id}"`));assert.ok(html.includes(`data-post-delivery-id="${id}"`));assert.ok(!html.includes('data-post-delivery-id="cancelled"'));assert.ok(html.includes('보완 · 자동 보고'));if(index===1)assert.ok(html.includes('공종: 보'));}assert.equal(JSON.stringify(source),saved);});
 await check('타팀 원본 보완의 휴가·승인 야근·연장 표시도 본인 팀으로 연결',()=>{reset('구조팀');const enriched=structuredClone(source),taskId=`gen-${original.id}-followup-structure`;enriched[0].scheduleExtensions=[{id:'qa-ot',taskId,userId:users[1].id,userName:users[1].name,roleName:'납품 후 수정',type:'OVERTIME',status:'APPROVED',workDate:'2026-11-03',startTime:'17:00',endTime:'18:00',hours:1},{id:'qa-extension',taskId,userId:users[1].id,type:'DEADLINE',status:'APPROVED',previousEnd:'2026-11-03',requestedEnd:'2026-11-04'}];state(projectStore,{projects:enriched});state(personal,{leaves:[{id:'qa-leave',user_id:users[1].id,start_date:'2026-11-03',end_date:'2026-11-03',kind:'연차',revision:1}]});const {html}=personalCalendar('구조팀');assert.ok(html.includes('data-overtime-day="2026-11-03"'));assert.ok(html.includes('data-leave-day="2026-11-03"'));assert.ok(html.includes('data-extension-start="2026-11-04"'));assert.ok(html.includes('data-extension-end="2026-11-04"'));assert.equal(JSON.stringify(source),saved);});
 await check('등록 버튼은 팀·개인 모드마다 우측 오렌지 버튼 하나이며 지정 handler로 연결',()=>{reset('구조팀');let opened=0;const {tree,html,teamHtml}=personalCalendar('구조팀',()=>opened++);for(const markup of [teamHtml,html]){assert.equal((markup.match(/프로젝트 보완 일정 등록<\/button>/g)||[]).length,1);const button=markup.match(/<button[^>]*data-post-delivery-register[^>]*>/)?.[0];assert.ok(button);assert.ok(button.includes('ml-auto'));assert.ok(button.includes('bg-orange-700'));}assert.ok(teamHtml.indexOf('data-post-delivery-register')>teamHtml.indexOf('title="다음 달"'));nodes(tree).find(node=>node.type==='button'&&String(node.props.children).includes('프로젝트 보완 일정 등록')).props.onClick();assert.equal(opened,1);});
 await check('세 팀 통합·개인 캘린더의 보완 바는 상태·공종과 관계없이 오렌지 고정',()=>{for(const [index,id] of ['legacy','structure','civil'].entries()){reset(departments[index]);const team=renderToStaticMarkup(createElement(ProjectCalendar,{date})),person=personalCalendar(departments[index]).html;for(const html of [team,person]){const bar=html.match(new RegExp(`<[^>]*data-post-delivery-id="${id}"[^>]*>`))?.[0];assert.ok(bar);assert.ok(bar.includes('bg-orange-700'));assert.ok(!bar.includes('bg-violet-700'));}}});
 await check('기존 관리자 편집은 legacy만 유지하고 본인 보고 항목은 전용화면 안내',()=>{reset('마감팀');state(auth,{currentUser:{...users[0],id:'u_12',position:'실장'}});const html=renderToStaticMarkup(createElement(PostDeliverySchedule,{project:original}));assert.equal((html.match(/>편집<\/button>/g)||[]).length,1);assert.ok(html.includes('본인 등록 · 팀장·실장 자동 보고'));assert.ok(!html.includes('합성 보완 cancelled'));});
 await check('승인 주말 출근은 세 팀 개인 달력에 별도 표시하고 야근·보완·휴가와 함께 보존',()=>{
  for(const [index,department] of departments.entries()){
   reset(department);const enriched=structuredClone(source),host=enriched[0],owner=users[index],taskId=`gen-${host.id}-followup-${['legacy','structure','civil'][index]}`;
   const weekend={id:'weekend-'+index,taskId,department,userId:owner.id,userName:owner.name,roleName:'납품 후 수정',type:'WEEKEND',status:'APPROVED',workDate:'2026-11-07',startTime:'09:00',endTime:'17:00',hours:8};
   host.scheduleExtensions=[weekend,{...weekend,id:'pending',workDate:'2026-11-08',status:'PENDING'},{...weekend,id:'rejected',workDate:'2026-11-14',status:'REJECTED'},{...weekend,id:'invalid-weekday',workDate:'2026-11-06'},{...weekend,id:'overtime',type:'OVERTIME',startTime:'17:00',endTime:'18:00',hours:1}];
   state(projectStore,{projects:enriched});state(personal,{leaves:[{id:'weekend-leave',user_id:owner.id,start_date:'2026-11-07',end_date:'2026-11-07',kind:'오전 반차',revision:1}]});
   const {tree,html}=personalCalendar(department),row=nodes(tree).find(node=>node.props['data-schedule-unit']===owner.id),days=nodes(row).filter(node=>node.props['data-weekend-work-day']);
   assert.deepEqual(days.map(node=>node.props['data-weekend-work-day']),['2026-11-07']);assert.match(days[0].props.title,/09:00~17:00/);assert.match(days[0].props.title,/8시간/);assert.ok(html.includes('주말 출근 1일'));assert.ok(html.includes('data-overtime-day="2026-11-07"'));assert.ok(html.includes('data-leave-day="2026-11-07"'));
   assert.ok(html.includes(`data-post-delivery-id="${['legacy','structure','civil'][index]}"`));assert.equal(host.endDate,original.endDate);assert.equal(host.progress,100);
  }
 });
 await check('납품 후 다른 달의 승인 주말 출근만 있어도 통합 프로젝트 달력에서 자기 팀 날짜 표시',()=>{
  reset('구조팀');const enriched=structuredClone(source),host=enriched[0],owner=users[1];
  const request={id:'weekend-later',taskId:`gen-${host.id}-followup-structure`,department:'구조팀',userId:owner.id,userName:owner.name,roleName:'납품 후 수정',type:'WEEKEND',status:'APPROVED',workDate:'2026-12-05',startTime:'09:00',endTime:'17:00',hours:8};
  host.scheduleExtensions=[request,{...request,id:'weekend-pending',workDate:'2026-12-06',status:'PENDING'},{...request,id:'weekend-weekday',workDate:'2026-12-04'}];state(projectStore,{projects:enriched});
  const html=renderToStaticMarkup(createElement(ProjectCalendar,{date:new Date(2026,11,1)}));assert.ok(html.includes('data-project-weekend-day="2026-12-05"'));assert.ok(html.includes('data-weekend-department="구조팀"'));assert.ok(!html.includes('data-project-weekend-day="2026-12-06"'));assert.ok(!html.includes('data-project-weekend-day="2026-12-04"'));assert.ok(html.includes('09:00~17:00'));assert.ok(!html.includes('data-main-project-id="qa-finished"'));
  state(projectStore,{filterDepartment:'토목&조경팀'});assert.ok(!renderToStaticMarkup(createElement(ProjectCalendar,{date:new Date(2026,11,1)})).includes('data-project-weekend-day="2026-12-05"'));assert.equal(JSON.stringify(source),saved);
 });
 await check('개인 일정표는 국내·VN 통합 직급순이며 같은 직급 명부순·퇴사자 제외·원문 보존',()=>{
  reset('마감팀');
  const positions=['프로','책임','실장','팀장','본부장','수석','실장','미정'];
  const ranked=positions.map((position,index)=>({...users[0],id:'rank-'+index,name:'직원 '+index,position}));
  const retired={...users[0],active:false};
  const vietLead={...ranked[0],id:'rank-vn-lead',company:'VIETQS',position:'팀장',vietTeamId:'vt_in1'};
  state(auth,{users:[...ranked,retired,vietLead],currentUser:ranked[0]});
  const before=JSON.stringify(projectStore.getState().projects),{tree}=personalCalendar('마감팀');
  assert.deepEqual(nodes(tree).filter(node=>node.props['data-schedule-unit']).map(node=>node.props['data-schedule-unit']),['rank-4','rank-2','rank-6','rank-3','rank-vn-lead','rank-5','rank-1','rank-0','rank-7']);
  assert.equal(JSON.stringify(projectStore.getState().projects),before);
  assert.equal(JSON.stringify(source),saved);
 });
 assert.equal(requests,0);assert.equal(JSON.stringify(source),saved);
}finally{globalThis.fetch=originalFetch;await server.close();}
const report={kind:'POST_DELIVERY_CALENDAR_ACTUAL_COMPONENT_SYNTHETIC',requests,productWrites:0,results};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
if(results.some(result=>result.status==='FAIL'))process.exitCode=1;
