import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime');
const source=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const app=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='App');
const loginGate=app.body.statements.find(node=>ts.isIfStatement(node));
assert.ok(loginGate,'Actual App login gate');
const instrumented=source.slice(0,loginGate.getStart(ast))+'capture({setSessionChecked,activeMenu,inquiryDepartment,inquiryVisited,inquiryContext});\n'+source.slice(loginGate.getStart(ast));
const compiled=ts.transpileModule(instrumented,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const text=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children);
const nodes=node=>node==null||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const project=(id,department,code)=>({id,department,code,name:'[합성] 메뉴 연결 검수',status:'진행중',progress:0,roles:{},subTasks:{},startDate:'',endDate:'',pmId:''});
function screen(department='마감팀',lang='ko'){
 const actor={id:'qa-nav-actor104',department,name:'[합성] 메뉴 검수자',position:'실장',role:'ADMIN'};
 const auth={currentUser:actor},hooks=[];let cursor=0,tree,handlers;
 const records=[project('qa-structure-other104','구조팀','QA-OTHER'),project('qa-finish-same104','마감팀','QA-SAME'),project('qa-structure-same104','구조팀','QA-SAME'),project('qa-civil-other104','토목&조경팀','QA-OTHER')];
 const state={projects:records,personnel:[],filterDepartment:'ALL',selectedProjectId:null,setFilterDepartment(value){this.filterDepartment=value;},setSelectedProjectId(value){state.selectedProjectId=value;},addProject(){throw Error('Unexpected project write');},importProjects(){throw Error('Unexpected project import');}};
 state.setFilterDepartment=value=>{state.filterDepartment=value;};
 const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return[hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;}];};
 const useRef=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
 const react={useState,useRef,useEffect(){cursor++;},useMemo(factory){cursor++;return factory();}};
 const exported={};
 runInNewContext(compiled,{exports:exported,localStorage:{getItem:()=>null},Date,Set,Map,URL,URLSearchParams,setTimeout(){},fetch(){throw Error('Unexpected external request');},capture:value=>{handlers=value;},require:name=>{
  if(name==='react')return{...react,default:react};if(name==='react/jsx-runtime')return jsx;
  if(name==='lucide-react')return new Proxy({},{get:(_,key)=>String(key)});
  if(name==='./store/useProjectStore')return{useProjectStore:Object.assign(()=>state,{getState:()=>state})};
  if(name==='./store/useAuthStore')return{useAuthStore:()=>({...auth,logout(){auth.currentUser=null;}}),isUserAdmin:user=>user?.role==='ADMIN'};
  if(name==='./store/useStudioStore')return{useStudioStore:()=>({actorId:auth.currentUser?.id,ready:true,hasLoaded:true,pendingIntake:[],pending:0,intakeProjects:[{id:'intake-same104',code:'QA-SAME'},{id:'intake-other104',code:'QA-OTHER'}]}),restoreStudioSession:async()=>{},startStudioSync(){},waitForSchedulePublished:async()=>{}};
  if(name==='./store/useLanguageStore')return{useLanguageStore:()=>({lang,setLang(){}})};
  if(name==='./store/usePersonalStore')return{usePersonalStore:{setState(){}}};
  if(name==='./utils/schedulePermissions')return{canManageSchedule:()=>true};
  if(name==='xlsx')return{};if(name.startsWith('./services/'))return new Proxy({},{get:()=>()=>{throw Error('Unexpected service request');}});
  if(name.startsWith('./components/')){const basename=name.split('/').pop();return new Proxy({},{get:(_,key)=>key==='default'?basename:String(key)});}
  throw Error('Unexpected App dependency '+name);
 }});
 const render=()=>{cursor=0;tree=exported.default();return tree;};
 const button=label=>{const match=nodes(tree).find(node=>node.type==='button'&&(node.props['aria-label']===label||text(node).trim()===label));assert.ok(match,'Actual App button '+label);return match;};
 const panels=()=>nodes(tree).filter(node=>node.type==='div'&&node.props.children?.type==='ProjectInquiries');
 const visible=()=>panels().filter(node=>!node.props.hidden);
 render();handlers.setSessionChecked(true);render();
 return{render,button,panels,visible,records,auth,state,get tree(){return tree;},get h(){return handlers;},openModal(id,trade){state.selectedProjectId=id;render();const modal=nodes(tree).find(node=>node.type==='ProjectModal');assert.ok(modal);modal.props.onOpenInquiries(id,trade);render();}};
}
const results=[];
function check(name,fn){try{fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.log('FAIL '+name+' '+error.message);}}
check('질의 메뉴: 협업 자료실 독립 버튼 1개·팀 일정표 하위 중복 제거',()=>{
 const s=screen(),buttons=nodes(s.tree).filter(node=>node.type==='button'&&text(node).trim()==='프로젝트 질의사항');assert.equal(buttons.length,1);
 const section=nodes(s.tree).find(node=>node.type==='div'&&node.props.children?.[0]?.props?.children==='협업 및 산출 자료실');assert.ok(section);assert.ok(nodes(section).includes(buttons[0]));
 assert.ok(!nodes(s.tree).some(node=>node.props?.['aria-label']?.match(/^(마감팀|구조팀|토목&조경팀) 프로젝트 질의사항$/)));
});
check('질의 연결: 실제 ProjectModal callback이 프로젝트·팀·공종 전달',()=>{
 const s=screen();s.openModal('qa-finish-same104','창호');const pane=s.visible()[0].props.children;
 assert.equal(s.h.activeMenu,'프로젝트 질의사항');assert.equal(pane.props.department,'마감팀');assert.equal(pane.props.initialProjectId,'qa-finish-same104');assert.equal(pane.props.initialProjectCode,'QA-SAME');assert.equal(pane.props.initialTrade,'창호');assert.equal(s.state.selectedProjectId,null);
});
check('질의 팀 전환: 먼저 나온 다른 현장 대신 같은 수주code 연결·기존 패널 유지',()=>{
 const s=screen();s.openModal('qa-finish-same104','창호');const originalKey=s.visible()[0].key;
 s.visible()[0].props.children.props.onDepartmentChange('구조팀','QA-SAME');s.render();const current=s.visible()[0].props.children;
 assert.equal(current.props.department,'구조팀');assert.equal(current.props.initialProjectId,'qa-structure-same104');assert.equal(current.props.initialProjectCode,'QA-SAME');assert.equal(s.panels().length,2);assert.ok(s.panels().some(pane=>pane.key===originalKey&&pane.props.hidden));
});
check('질의 공통 현장: 해당 팀 일정이 없으면 다른 팀 일정 대신 접수 원본 연결',()=>{
 const s=screen();s.openModal('qa-finish-same104','조적');s.visible()[0].props.children.props.onDepartmentChange('토목&조경팀','QA-SAME');s.render();const pane=s.visible()[0].props.children;
 assert.equal(pane.props.initialProjectId,'intake-same104');assert.equal(pane.props.initialProjectCode,'QA-SAME');assert.notEqual(pane.props.initialProjectId,'qa-civil-other104');
});
check('질의 반복 연결: 같은 팀·수주code 요청도 context version 증가',()=>{
 const s=screen();s.openModal('qa-finish-same104','창호');const first=s.visible()[0].props.children.props;
 assert.equal(first.initialContextVersion,1);
 first.onDepartmentChange('구조팀','QA-SAME');s.render();s.visible()[0].props.children.props.onDepartmentChange('마감팀','QA-SAME');s.render();const returned=s.visible()[0].props.children.props;
 assert.equal(returned.initialProjectId,first.initialProjectId);assert.equal(returned.initialProjectCode,first.initialProjectCode);assert.equal(returned.initialContextVersion,2);
 returned.onDepartmentChange('마감팀','QA-SAME');s.render();assert.equal(s.visible()[0].props.children.props.initialContextVersion,3);
});
check('질의 메뉴 왕복: 마지막 팀·프로젝트·공종 context와 actor key 보존',()=>{
 const s=screen();s.openModal('qa-finish-same104','창호');const before=s.visible()[0];const meeting=nodes(s.tree).find(node=>node.type==='button'&&text(node).includes('회의록 작성'));assert.ok(meeting);meeting.props.onClick();s.render();assert.equal(s.visible().length,0);
 s.button('프로젝트 질의사항').props.onClick();s.render();const after=s.visible()[0];assert.equal(after.key,before.key);assert.equal(after.props.children.props.initialProjectId,'qa-finish-same104');assert.equal(after.props.children.props.initialTrade,'창호');assert.equal(after.props.children.props.initialContextVersion,before.props.children.props.initialContextVersion);
});
check('질의 첫 진입: 소속팀 기본값·베트남 메뉴·계정별 패널 분리',()=>{
 const s=screen('구조팀','vi');s.button('Câu hỏi dự án').props.onClick();s.render();assert.equal(s.visible()[0].props.children.props.department,'구조팀');const key=s.visible()[0].key;
 s.auth.currentUser={...s.auth.currentUser,id:'qa-nav-actor-other104'};s.render();assert.notEqual(s.visible()[0].key,key);assert.match(s.visible()[0].key,/qa-nav-actor-other104/);
 const tf=screen('개발 TF');tf.button('프로젝트 질의사항').props.onClick();tf.render();assert.equal(tf.visible()[0].props.children.props.department,'마감팀');
});
const report={kind:'ACTUAL_APP_NAVIGATION_HANDLERS_IN_MEMORY',sourceSHA256:createHash('sha256').update(source).digest('hex').toUpperCase(),PASS:results.filter(result=>result.status==='PASS').length,FAIL:results.filter(result=>result.status==='FAIL').length,results,operatingWrites:0,externalCalls:0,limits:['App navigation and emitted real component props execute; nested editor rendering and IDB behavior are verified separately.','React effects and store/API behavior are isolated stubs; this is not browser visual evidence.']};
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify(report,null,2));
if(report.FAIL)process.exitCode=1;
