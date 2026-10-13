import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import * as vietPersonnel from '../src/utils/vietPersonnel.ts';
const require=createRequire(import.meta.url),jsx=require('react/jsx-runtime');
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
const before=process.argv.includes('--before'),results=[];
const nativeFetch=globalThis.fetch;let externalRequests=0;globalThis.fetch=()=>{externalRequests++;throw Error('External requests are forbidden in modal memory tests');};
const beforePMGuard=process.argv.includes('--before-pm');
const beforePending=process.argv.includes('--before-pending'),onlyPending=process.argv.includes('--only-pending'),beforeStrict=process.argv.includes('--before-strict'),onlyStrict=process.argv.includes('--only-strict');
const beforeScope=process.argv.includes('--before-scope'),onlyScope=process.argv.includes('--only-scope');
const path=beforeScope?'../../private-provisioning/qa-september-scope-20261008/ui-originals/scheduler-web/src/components/ProjectModal.tsx':before?'../../private-provisioning/original-before-personal-alias-20261006/scheduler-web/src/components/ProjectModal.tsx':beforePending?'../../private-provisioning/qa-completion-audit-20261007/original-before-78/scheduler-web/src/components/ProjectModal.tsx':beforeStrict?'../../private-provisioning/qa-completion-audit-20261007/original-before-strict/scheduler-web/src/components/ProjectModal.tsx':'../src/components/ProjectModal.tsx';
const modalSource=process.argv.find(arg=>arg.startsWith('--modal-source='))?.slice('--modal-source='.length),onlyCanonicalPM=process.argv.includes('--only-canonical-pm');
const compiled=ts.transpileModule(readFileSync(modalSource||new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const server=await createServer({plugins:beforePMGuard?[{name:'protected-pm-progress-guard',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/utils/scheduleProgress.ts'))return readFileSync(new URL('../../private-provisioning/qa-integration-errors-20261007/original-before-73/scheduler-web/src/utils/scheduleProgress.ts',import.meta.url),'utf8');}}]:[],server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const actor={id:'modal-actor',name:'합성 직원',no:7001,company:'컨코스트',department:'마감팀',position:'선임',active:true},other={id:'modal-other',name:'다른 합성 직원',no:7002,company:'컨코스트',department:'마감팀',position:'책임',active:true};
const task={roleName:'내부',personId:'',personIds:[],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'보존할 보고 메모',progress:42,actualProgressDate:'2026-10-06',reportingModes:{'modal-actor':'TASK'}};
const project={id:'modal-qa',code:'QA-MODAL',name:'합성 배정 검수',department:'마감팀',pmId:'u_12',startDate:'2026-10-06',endDate:'2026-10-08',progress:42,status:'진행중',roles:{},subTasks:{내부:task}};
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'&&node.props?[node,...nodes(node.props.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'&&node.props?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
async function test(name,fn){if(onlyCanonicalPM&&!name.startsWith('PM 표시:')||onlyPending&&!name.startsWith('대기 입력:')||onlyStrict&&!name.startsWith('대기 입력: StrictMode')||onlyScope&&!name.startsWith('용역 범위:'))return;try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);process.exitCode=1;}}
try{
 const work=await server.ssrLoadModule('/src/utils/personalWork.ts'),progress=await server.ssrLoadModule('/src/utils/scheduleProgress.ts'),permissions=await server.ssrLoadModule('/src/utils/schedulePermissions.ts'),{VIET_TEAMS_DATA:teams}=await server.ssrLoadModule('/src/data/vietTeams.ts'),allocationBounds=await server.ssrLoadModule('/src/utils/scheduleAllocations.ts'),rebase=await server.ssrLoadModule('/src/utils/rebaseProject.ts'),pendingAssignment=await server.ssrLoadModule('/src/utils/pendingAssignment.ts'),projectDates=await server.ssrLoadModule('/src/utils/projectScheduleDates.ts');
 const storeSource=ts.createSourceFile('useProjectStore.ts',readFileSync(new URL('../src/store/useProjectStore.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),storeDeclarations=storeSource.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='syncProjectTasks'||ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(storeSource)==='TEAM_ROLES'));
 assert.equal(storeDeclarations.length,2,'Actual store contract must be present');const storeExports={};runInNewContext(ts.transpileModule(storeDeclarations.map(node=>node.getText(storeSource)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:storeExports,projectProgress:progress.projectProgress,allocationScheduleOnly:progress.allocationScheduleOnly});const {TEAM_ROLES,syncProjectTasks}=storeExports;
 function editor(ids,options={}){
  const role=options.role||'내부',directory=options.users||[actor,other],original=options.project?structuredClone(options.project):{...structuredClone(project),subTasks:{내부:{...structuredClone(task),personIds:ids,personId:options.personId??ids?.[0]??'',...(options.reportingModes?{reportingModes:options.reportingModes}:{}),...(options.allocations?{allocations:structuredClone(options.allocations)}:{})}}};
  if(options.pm){original.subTasks.PM={...structuredClone(task),roleName:'PM',personId:actor.id,personIds:[actor.id,other.id],allocations:structuredClone(options.pm)};original.pmId=actor.id;}
  const state={projects:[original,...(options.others||[])],personnel:directory.map(person=>({id:person.id,name:person.name}))},writes=[],hooks=[],navigation=[];let cursor=0,pending=[],dirty=false,tree,mounted=false,closed=0;
  state.updateProjectSubTasks=(id,tasks,period)=>{writes.push(structuredClone(tasks));state.projects=state.projects.map(p=>p.id===id?(options.realStore?syncProjectTasks({...p,...period},tasks):{...p,...period,subTasks:structuredClone(tasks)}):p);dirty=true;};
  const projectHook=selector=>typeof selector==='function'?selector(state):state;projectHook.getState=()=>state;
  const useState=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=typeof initial==='function'?initial():initial;return [hooks[index],value=>{const next=typeof value==='function'?value(hooks[index]):value;if(next!==hooks[index]){hooks[index]=next;dirty=true;}}];};
  const useRef=initial=>{const index=cursor++;if(!(index in hooks))hooks[index]={current:initial};return hooks[index];};
  const useEffect=(fn,deps)=>{const index=cursor++,previous=hooks[index];if(!previous||deps.some((value,index)=>value!==previous[index])){hooks[index]=deps;pending.push(fn);}};
  const currentUser=options.readonly?actor:{id:'u_12',name:'합성 실장',department:original.department,position:'실장'};
  const values={'react':{useState,useEffect,useRef},'react/jsx-runtime':jsx,'lucide-react':require('lucide-react'),'../store/useProjectStore':{useProjectStore:projectHook,TEAM_ROLES},'../store/useAuthStore':{useAuthStore:()=>({users:directory,currentUser})},'../store/usePersonalStore':{usePersonalStore:selector=>selector({leaves:options.leaves||[]})},'../utils/personalWork':work,'../utils/scheduleProgress':progress,'../utils/pendingAssignment':pendingAssignment,'../utils/scheduleAllocations':allocationBounds,'../utils/schedulePermissions':permissions,'../utils/rebaseProject':rebase,'../utils/vietPersonnel':vietPersonnel,'../data/vietTeams':{VIET_TEAMS_DATA:teams},'./ProjectDetailPrint':{ProjectDetailPrint:()=>null},'./PostDeliverySchedule':{PostDeliverySchedule:()=>null}};
  values['../utils/projectScheduleDates']=projectDates;
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[(options.today||'2026-10-06')+'T12:00:00Z']));}}
  const exports={};runInNewContext(compiled,{exports,Date:FixedDate,Error,structuredClone,crypto:webcrypto,console,setTimeout:()=>1,require:path=>{assert.ok(path in values,'Unexpected modal dependency '+path);return values[path];}});
  const render=()=>{for(let cycle=0;cycle<12;cycle++){cursor=0;pending=[];dirty=false;tree=exports.default({projectId:original.id,onClose:()=>{closed++;},...(options.inquiries?{onOpenInquiries:(id,role)=>navigation.push({id,role})}:{})});const repetitions=options.strictMount&&!mounted?2:1;mounted=true;for(let pass=0;pass<repetitions;pass++)for(const effect of pending)effect();if(!dirty)return;}throw Error('Modal fixture effects did not settle');};
  const roleCard=()=>nodes(tree).find(node=>node.type==='div'&&node.key===role&&node.props.onClick);
  render();roleCard().props.onClick();render();
  const unit=id=>nodes(tree).find(node=>node.type==='div'&&node.key===id&&node.props.className?.includes('rounded-2xl border-2'));
  const mode=reference=>nodes(roleCard()).find(node=>node.type==='select'&&node.props['aria-label']===role+' '+reference+' 보고 방식');
  const periodField=(index,suffix)=>nodes(roleCard()).find(node=>node.props?.['aria-label']===`${role} 투입 기간 ${index} ${suffix}`);
  const assignPM=id=>{const card=nodes(tree).find(node=>node.type==='div'&&node.key==='PM'&&node.props.onClick),select=nodes(card).find(node=>node.type==='select'&&node.props.value==='');assert.ok(select);select.props.onChange({target:{value:id}});render();};
  const assignmentSelect=(name=role)=>{const card=nodes(tree).find(node=>node.type==='div'&&node.key===name&&node.props.onClick);return nodes(card).find(node=>node.type==='select'&&(node.props['aria-label']===`${name} 담당자 배정`||node.props.value===''));};
  const dateField=side=>nodes(roleCard()).filter(node=>node.type==='input'&&node.props.type==='date')[side==='start'?0:1],saveButton=()=>nodes(tree).find(node=>node.type==='button'&&text(node).trim()==='전체 일정 저장');
  const remoteControls={selectRole:name=>{const card=nodes(tree).find(node=>node.type==='div'&&node.key===name&&node.props.onClick);assert.ok(card);card.props.onClick();render();},injectRemote:(modify,id=original.id)=>{state.projects=state.projects.map(p=>{if(p.id!==id)return p;const next=structuredClone(p);modify(next);return next;});render();},batchDateRemote:(side,value,modify)=>{assert.ok(dateField(side));dateField(side).props.onChange({target:{value}});remoteControls.injectRemote(modify);},writtenTasks:()=>structuredClone(writes),date:side=>dateField(side)?.props.value,changeDate:(side,value)=>{assert.ok(dateField(side));dateField(side).props.onChange({target:{value}});render();},alerts:()=>nodes(tree).filter(node=>node.props.role==='alert').map(text).join('\n'),saveDisabled:()=>saveButton()?.props.disabled,save:()=>{assert.ok(saveButton());saveButton().props.onClick();render();},reload:()=>{const button=nodes(tree).find(node=>node.type==='button'&&text(node).trim()==='최신 일정 다시 불러오기');assert.ok(button);button.props.onClick();render();}};
  remoteControls.assignmentOptions=(name=role)=>nodes(assignmentSelect(name)).filter(node=>node.type==='option').map(node=>({value:node.props.value,label:text(node)}));
  remoteControls.roleHTML=()=>renderToStaticMarkup(roleCard());
  remoteControls.applyCommonPeriod=()=>{const button=nodes(tree).find(node=>node.type==='button'&&text(node)==='공종에 공통 기간 적용');assert.ok(button);button.props.onClick();render();};
  remoteControls.openInquiries=()=>{const button=nodes(tree).find(node=>node.type==='button'&&text(node)==='프로젝트 질의사항');assert.ok(button);button.props.onClick();render();};
  remoteControls.navigation=()=>structuredClone(navigation);remoteControls.closed=()=>closed;
  remoteControls.changeProjectDate=(field,value)=>{const input=nodes(tree).find(node=>node.props?.['aria-label']===`프로젝트 ${field==='start'?'시작일':'완료일'}`);assert.ok(input);input.props.onChange({target:{value}});render();};
  remoteControls.projectDate=field=>nodes(tree).find(node=>node.props?.['aria-label']===`프로젝트 ${field==='start'?'시작일':'완료일'}`)?.props.value;
  remoteControls.batchProjectDateRemote=(field,value,modify)=>{const input=nodes(tree).find(node=>node.props?.['aria-label']===`프로젝트 ${field==='start'?'시작일':'완료일'}`);assert.ok(input);input.props.onChange({target:{value}});remoteControls.injectRemote(modify);};
  remoteControls.changeDateMode=custom=>{const input=nodes(roleCard()).find(node=>node.props?.['aria-label']===`${role} 별도 기간 사용`);assert.ok(input);input.props.onChange({target:{checked:custom}});render();};
  remoteControls.chooseAssignment=(value,name=role)=>{const select=assignmentSelect(name);assert.ok(select);select.props.onChange({target:{value}});render();};
  return {...remoteControls,groupAvailability:entries=>exports.groupAvailability(entries),unitSummaries:id=>nodes(unit(id)).filter(node=>node.type==='summary').map(text),unitProjectIds:id=>nodes(unit(id)).filter(node=>node.props['data-availability-project']).map(node=>node.props['data-availability-project']),assignPM,project:()=>structuredClone(state.projects[0]),readPM:()=>structuredClone(state.projects[0].subTasks.PM),removePMPeriod:index=>{const button=nodes(tree).find(node=>node.props?.['aria-label']===`PM 투입 기간 ${index} 삭제`);assert.ok(button);button.props.onClick();render();},unlinkPM:name=>{const card=nodes(tree).find(node=>node.key==='PM'&&node.type==='div'&&node.props.onClick);const button=nodes(card).find(node=>node.props?.title===name+' 투입 해제');assert.ok(button);button.props.onClick();render();},changePeriod:(index,suffix,value)=>{const field=periodField(index,suffix);assert.ok(field);field.props.onChange({target:{value}});render();},removePeriod:index=>{periodField(index,'삭제').props.onClick();render();},addPeriod:()=>{const button=nodes(roleCard()).find(node=>node.type==='button'&&text(node)==='이 인원 투입 기간 추가');assert.ok(button);button.props.onClick();render();},unitText:id=>text(unit(id)),button:id=>nodes(unit(id)).find(node=>node.type==='button'),click:id=>{const button=nodes(unit(id)).find(node=>node.type==='button');assert.ok(button);button.props.onClick();render();},chipRemove:name=>{const button=nodes(roleCard()).find(node=>node.type==='button'&&node.props.title===name+' 투입 해제');assert.ok(button);button.props.onClick();render();},mode:reference=>mode(reference)?.props.value,changeMode:(reference,value)=>{assert.ok(mode(reference));mode(reference).props.onChange({target:{value}});render();},roleText:()=>text(roleCard()),html:()=>renderToStaticMarkup(tree),read:()=>structuredClone(state.projects[0].subTasks.내부),writes:()=>writes.length,toast:()=>text(tree),original:structuredClone(original.subTasks.내부)};
 }
 const pendingFixture=allocated=>{const p=structuredClone(project);p.subTasks.창호={...structuredClone(task),roleName:'창호',personId:other.id,personIds:[other.id],memo:'원 창호 메모'};p.subTasks.내부.personId=actor.id;p.subTasks.내부.personIds=[actor.id];if(allocated)p.subTasks.내부.allocations=[{id:'pending-one',personIds:[actor.id],startDate:task.startDate,endDate:task.endDate,memo:'원 투입 메모',source:{workbookHash:'a'.repeat(64),sheet:'합성',ownerRange:'A1',roleRange:'B1',projectRange:'B2',projectText:'합성 프로젝트',roleText:'내부'}}];return p;};
 await test('대기 입력: StrictMode mount effects2회는 원2공종/할당/본문UI 보존·쓰기0',()=>{
  const p=pendingFixture(true),e=editor([actor.id],{project:p,strictMount:true,realStore:true});assert.equal(e.writes(),0);assert.ok(e.roleText().includes('인원별 투입 기간 (1개)'));assert.ok(e.html().includes(p.subTasks.내부.memo));assert.ok(e.html().includes('원 투입 메모'));assert.equal(e.date('start'),p.subTasks.내부.allocations[0].startDate);assert.equal(e.date('end'),p.subTasks.내부.allocations[0].endDate);e.selectRole('창호');assert.ok(e.html().includes('원 창호 메모'));assert.equal(e.writes(),0);assert.deepEqual(e.project(),p);
 });
 for(const allocated of [false,true])for(const remoteField of ['project','trade'])await test(`대기 입력: ${allocated?'allocation':'noalloc'} 역전중 ${remoteField} 원격변경·새 승인70 병합 및 날짜완성1저장`,()=>{
  const p=pendingFixture(allocated),e=editor([actor.id],{project:p,realStore:true});e.changeDate('start','2026-10-09');assert.equal(e.date('start'),'2026-10-09');assert.equal(e.writes(),0);
  e.injectRemote(remote=>{if(remoteField==='project')remote.notes='다른 PC 프로젝트 메모';else remote.subTasks.창호.memo='다른 PC 창호 메모';remote.subTasks.내부.progress=70;remote.subTasks.내부.actualProgressDate='2026-10-07';remote.progress=56;});
  const latest=e.project();assert.equal(e.date('start'),'2026-10-09');assert.equal(e.date('end'),'2026-10-08');assert.equal(e.writes(),0);assert.equal(e.saveDisabled(),false);e.changeDate('end','2026-10-10');assert.equal(e.writes(),1);assert.deepEqual(e.project().subTasks.창호,latest.subTasks.창호);assert.equal(e.project().notes,latest.notes);assert.equal(e.read().progress,70);assert.equal(e.read().actualProgressDate,'2026-10-07');assert.equal(e.project().progress,56);
  const saved=allocated?e.read().allocations[0]:e.read();assert.equal(saved.startDate,'2026-10-09');assert.equal(saved.endDate,'2026-10-10');if(allocated){assert.equal(saved.id,'pending-one');assert.deepEqual(saved.source,p.subTasks.내부.allocations[0].source);assert.equal(saved.memo,'원 투입 메모');}
 });
 for(const allocated of [false,true])await test(`대기 입력: ${allocated?'allocation':'noalloc'} 동일날짜 양측변경 경고·자동/수동저장차단·명시reload해소`,()=>{
  const e=editor([actor.id],{project:pendingFixture(allocated),realStore:true});e.changeDate('start','2026-10-09');e.injectRemote(remote=>{const row=remote.subTasks.내부;row.startDate='2026-10-07';row.endDate='2026-10-16';if(allocated){row.allocations[0].startDate=row.startDate;row.allocations[0].endDate=row.endDate;}});const latest=e.project();
  assert.equal(e.date('start'),'2026-10-09');assert.match(e.alerts(),/같은 일정 항목/);assert.equal(e.saveDisabled(),true);e.changeDate('end','2026-10-10');e.save();assert.equal(e.writes(),0);assert.deepEqual(e.project(),latest);e.reload();assert.equal(e.alerts(),'');assert.equal(e.date('start'),'2026-10-07');assert.equal(e.date('end'),'2026-10-16');assert.equal(e.writes(),0);assert.equal(e.saveDisabled(),false);e.changeDate('end','2026-10-17');assert.equal(e.writes(),1);
 });
 await test('대기 입력: 원격구간삭제 경고·입력보존·저장차단·명시reload후삭제부활없음',()=>{
  const e=editor([actor.id],{project:pendingFixture(true),realStore:true});e.changeDate('start','2026-10-09');e.injectRemote(remote=>{remote.subTasks.내부.allocations=[];remote.subTasks.내부.personIds=[];remote.subTasks.내부.personId='';});const latest=e.project();assert.equal(e.date('start'),'2026-10-09');assert.match(e.alerts(),/삭제된 할당 구간/);assert.equal(e.saveDisabled(),true);e.changeDate('end','2026-10-10');e.save();assert.equal(e.writes(),0);assert.deepEqual(e.project(),latest);e.reload();assert.equal(e.alerts(),'');assert.equal(e.writes(),0);assert.deepEqual(e.read().allocations,[]);assert.equal(work.assignedTasks(actor.id,[e.project()]).filter(row=>row.roleName==='내부').length,0);
 });
 await test('대기 입력: 다른프로젝트 원격변경은 현재 입력을초기화하지 않음',()=>{
  const p=pendingFixture(true),otherProject={...structuredClone(p),id:'pending-other'},e=editor([actor.id],{project:p,others:[otherProject],realStore:true});e.changeDate('start','2026-10-09');e.injectRemote(remote=>{remote.notes='무관 프로젝트 메모';},otherProject.id);assert.equal(e.date('start'),'2026-10-09');assert.equal(e.writes(),0);assert.equal(e.saveDisabled(),false);e.changeDate('end','2026-10-10');assert.equal(e.writes(),1);
 });
 for(const allocated of [false,true])await test(`대기 입력: ${allocated?'allocation':'noalloc'} 같은batch 날짜완성/원격동일필드충돌은 상태rerender전에자동저장차단`,()=>{
  const e=editor([actor.id],{project:pendingFixture(allocated),realStore:true});e.changeDate('start','2026-10-09');assert.equal(e.writes(),0);
  e.batchDateRemote('end','2026-10-10',remote=>{const row=remote.subTasks.내부;row.startDate='2026-10-07';row.endDate='2026-10-16';if(allocated){row.allocations[0].startDate=row.startDate;row.allocations[0].endDate=row.endDate;}});
  assert.equal(e.writes(),0);assert.equal(e.date('start'),'2026-10-09');assert.equal(e.date('end'),'2026-10-10');assert.equal(e.read().startDate,'2026-10-07');assert.equal(e.read().endDate,'2026-10-16');assert.match(e.alerts(),/같은 일정 항목/);assert.equal(e.saveDisabled(),true);e.save();assert.equal(e.writes(),0);e.reload();assert.equal(e.alerts(),'');assert.equal(e.date('start'),'2026-10-07');assert.equal(e.date('end'),'2026-10-16');assert.equal(e.writes(),0);
 });
 for(const allocated of [false,true])await test(`대기 입력: ${allocated?'allocation':'noalloc'} 같은batch 날짜완성/다른공종원격메모는 최초저장payload부터병합`,()=>{
  const e=editor([actor.id],{project:pendingFixture(allocated),realStore:true});e.changeDate('start','2026-10-09');assert.equal(e.writes(),0);
  e.batchDateRemote('end','2026-10-10',remote=>{remote.subTasks.창호.memo='같은 batch 원격 창호 메모';remote.subTasks.내부.progress=70;remote.subTasks.내부.actualProgressDate='2026-10-07';remote.progress=56;});
  assert.equal(e.writes(),1);assert.equal(e.writtenTasks()[0].창호.memo,'같은 batch 원격 창호 메모');assert.equal(e.writtenTasks()[0].내부.progress,70);assert.equal(e.writtenTasks()[0].내부.actualProgressDate,'2026-10-07');assert.equal(e.project().subTasks.창호.memo,'같은 batch 원격 창호 메모');assert.equal(e.project().progress,56);assert.equal(e.date('start'),'2026-10-09');assert.equal(e.date('end'),'2026-10-10');assert.equal(e.saveDisabled(),false);
  const saved=allocated?e.read().allocations[0]:e.read();assert.equal(saved.startDate,'2026-10-09');assert.equal(saved.endDate,'2026-10-10');if(allocated)assert.equal(saved.id,'pending-one');
 });
 const preserved=(edited,original)=>{for(const key of ['startDate','endDate','progress','actualProgressDate','memo','reportingModes'])assert.deepEqual(edited[key],original[key],key+' must remain unchanged');};
 await test('용역 범위: 실제 선택→빈배정·구간차단·PM/타공종/anchor 보존→실제 담당자 복구',()=>{
  const p=pendingFixture(true);p.subTasks.내부.legacyAllocationId='scope-original-anchor';p.subTasks.내부.version='v3';p.subTasks.내부.subType='원본 업무 유형';
  p.subTasks.PM={...structuredClone(task),roleName:'PM',personId:actor.id,personIds:[actor.id]};p.pmId=actor.id;
  const original=structuredClone(p),e=editor([actor.id],{project:p,realStore:true});assert.equal(e.writes(),0);
  assert.deepEqual(e.assignmentOptions()[0],{value:'scope-excluded',label:'용역 범위 없음'});assert.ok(e.assignmentOptions('PM').every(option=>option.value!=='scope-excluded'));
  e.chooseAssignment('scope-excluded');const excluded=e.read();assert.equal(excluded.scopeExcluded,true);assert.equal(excluded.personId,'');assert.deepEqual(excluded.personIds,[]);assert.deepEqual(excluded.allocations,[]);
  preserved(excluded,original.subTasks.내부);for(const key of ['legacyAllocationId','version','subType'])assert.equal(excluded[key],original.subTasks.내부[key]);
  assert.deepEqual(e.project().subTasks.창호,original.subTasks.창호);assert.deepEqual(e.readPM(),original.subTasks.PM);assert.equal(e.project().pmId,actor.id);
  assert.equal(e.button(actor.id).props.disabled,true);assert.ok(!e.roleText().includes('인원별 투입 기간'));const writes=e.writes();e.click(actor.id);assert.equal(e.writes(),writes);assert.deepEqual(e.read(),excluded);
  assert.equal(work.assignedTasks(actor.id,[e.project()]).filter(row=>row.roleName==='내부').length,0);assert.ok(!JSON.stringify(e.project()).includes('scope-excluded'));
  e.chooseAssignment(other.id);const restored=e.read();assert.equal(restored.scopeExcluded,false);assert.equal(restored.personId,other.id);assert.deepEqual(restored.personIds,[other.id]);assert.equal(restored.allocations.length,1);
  assert.deepEqual(restored.allocations[0].personIds,[other.id]);assert.notEqual(restored.allocations[0].id,original.subTasks.내부.allocations[0].id);assert.equal(restored.legacyAllocationId,excluded.legacyAllocationId);preserved(restored,original.subTasks.내부);
  assert.equal(e.button(other.id).props.disabled,false);assert.equal(work.assignedTasks(other.id,[e.project()]).filter(row=>row.roleName==='내부').length,1);assert.deepEqual(e.project().subTasks.창호,original.subTasks.창호);assert.deepEqual(e.readPM(),original.subTasks.PM);
 });
 await test('용역 범위: 일반 미배정으로 해제→정상 배정·원메타 보존 및 조회전용 선택 쓰기0',()=>{
  const p=pendingFixture(true);p.subTasks.내부.legacyAllocationId='scope-unassigned-anchor';const original=structuredClone(p),e=editor([actor.id],{project:p,realStore:true});
  e.chooseAssignment('scope-excluded');assert.equal(e.read().scopeExcluded,true);e.chooseAssignment('');const unassigned=e.read();assert.equal(unassigned.scopeExcluded,false);assert.equal(unassigned.personId,'');assert.deepEqual(unassigned.personIds,[]);assert.deepEqual(unassigned.allocations,[]);assert.equal(unassigned.legacyAllocationId,original.subTasks.내부.legacyAllocationId);preserved(unassigned,original.subTasks.내부);
  assert.ok(e.roleText().includes('담당자 미배정'));assert.equal(e.button(actor.id).props.disabled,false);assert.equal(work.assignedTasks(actor.id,[e.project()]).filter(row=>row.roleName==='내부').length,0);
  e.click(actor.id);assert.equal(e.read().scopeExcluded,false);assert.deepEqual(e.read().personIds,[actor.id]);assert.equal(e.read().allocations.length,1);assert.equal(e.read().legacyAllocationId,original.subTasks.내부.legacyAllocationId);preserved(e.read(),original.subTasks.내부);assert.deepEqual(e.project().subTasks.창호,original.subTasks.창호);
  const readonly=editor([actor.id],{project:original,readonly:true,realStore:true});readonly.chooseAssignment('scope-excluded');assert.equal(readonly.writes(),0);assert.deepEqual(readonly.project(),original);
 });
 await test('이름 배정: 열기 쓰기0·해제 표시·실제 handler 해제·다른 담당과 실적 보존',()=>{const e=editor([actor.name,other.id]);assert.equal(e.writes(),0);assert.match(e.button(actor.id).props.title,/투입 해제/);e.click(actor.id);assert.deepEqual(e.read().personIds,[other.id]);preserved(e.read(),e.original);assert.ok(e.toast().includes('배정 해제'));});
 await test('번호 배정: 해제 표시·caption/가용성 이름 연결·실제 handler 해제',()=>{const e=editor([String(actor.no),other.id]);assert.match(e.button(actor.id).props.title,/투입 해제/);assert.ok(e.roleText().includes(actor.name+'✓'));e.click(actor.id);assert.deepEqual(e.read().personIds,[other.id]);preserved(e.read(),e.original);});
 await test('혼합 별칭: 사용자가 해제한 한 직원의 id/이름/번호만 모두 제거',()=>{const e=editor([actor.name,String(actor.no),actor.id,other.id]);e.click(actor.id);assert.deepEqual(e.read().personIds,[other.id]);assert.equal(e.read().personId,other.id);preserved(e.read(),e.original);});
 await test('명시[]: stale personId를 표시·토글·보고 목록에 복원하지 않음',()=>{const e=editor([],{personId:actor.name});assert.match(e.button(actor.id).props.title,/즉시 추가 배정/);assert.ok(e.roleText().includes('투입 인원 0명'));assert.ok(!e.html().includes('내부 '+actor.name+' 보고 방식'));e.click(actor.id);assert.deepEqual(e.read().personIds,[actor.id]);});
 await test('canonical ID 충돌: 타인의 ID를 이름 별칭으로 해제하지 않음',()=>{const collision={...actor,name:other.id},e=editor([other.id],{users:[collision,other]});assert.match(e.button(actor.id).props.title,/즉시 추가 배정/);assert.match(e.button(other.id).props.title,/투입 해제/);e.click(actor.id);assert.deepEqual(e.read().personIds,[other.id,actor.id]);});
 await test('모호한 이름: 첫 행 caption/겹침/해제 판정 없이 원문을 보존',()=>{const duplicate={...other,name:actor.name},p={...structuredClone(project),id:'other-project',subTasks:{내부:{...structuredClone(task),personIds:[actor.name],personId:actor.name}}},e=editor([actor.name],{users:[actor,duplicate],others:[p]});assert.match(e.button(actor.id).props.title,/즉시 추가 배정/);assert.ok(e.unitText(actor.id).includes('투입 가능'));assert.ok(e.roleText().includes('(배정)'));e.click(actor.id);assert.deepEqual(e.read().personIds,[actor.name,actor.id]);});
 await test('칩X와 기존 팀 직접이름: 같은 확정 별칭만 직접 해제, 팀코드를 개인으로 확장하지 않음',()=>{const e=editor([actor.name,String(actor.no),other.id]);e.chipRemove(actor.name);assert.deepEqual(e.read().personIds,[other.id]);const team=teams.find(team=>team.department==='마감팀');for(const token of [team.id,team.displayName]){const group=editor([token,other.id]);group.chipRemove(team.displayName);assert.deepEqual(group.read().personIds,[other.id]);}const codeNamed={...actor,name:team.code},code=editor([team.code],{users:[codeNamed,other]});assert.match(code.button(actor.id).props.title,/즉시 추가 배정/);});
 await test('기존 팀 코드 칩X: 정확한 원참조 해제·남은 개인 구간과 일지/실적/권한 보존',()=>{
  for(const team of teams)for(const allocated of [false,true]){
   const member=team.members[0].id,unassignedMember=team.members[1].id,ids=[team.code,member,other.id];
   const periods=[{id:'team-anchor',personIds:[team.code,member],startDate:'2026-10-06',endDate:'2026-10-08',memo:'팀 원문'},{id:'other-anchor',personIds:[other.id],startDate:'2026-10-12',endDate:'2026-10-13',memo:'다른 담당 원문'}];
   const fixture={...structuredClone(project),department:team.department,subTasks:{내부:{...structuredClone(task),personId:team.code,personIds:ids,...(allocated?{allocations:periods,legacyAllocationId:'team-anchor'}:{})}}};
   const e=editor(ids,{project:fixture,realStore:true}),before=e.project(),manual={...work.assignedTasks(unassignedMember,[before])[0],todayTask:'기존 수행 본문',progress:70,manualFields:['todayTask','progress']};
   assert.equal(e.writes(),0);e.chipRemove(team.displayName);const after=e.project(),taskAfter=e.read();
   assert.deepEqual(taskAfter.personIds,[member,other.id],team.code+' raw reference must be removed');assert.equal(taskAfter.personId,member);assert.equal(work.assignedTasks(unassignedMember,[after]).length,0);assert.equal(work.assignedTasks(member,[after]).length,1);
   assert.deepEqual(work.assignedTasks(other.id,[after]),work.assignedTasks(other.id,[before]));for(const key of ['memo','progress','actualProgressDate','reportingModes'])assert.deepEqual(taskAfter[key],fixture.subTasks.내부[key]);
   const retained=work.reconcileWorkLogItems([manual],unassignedMember,'2026-10-06',[after]);assert.equal(retained.length,1);assert.equal(retained[0].scheduleRemoved,true);assert.equal(retained[0].todayTask,manual.todayTask);assert.equal(retained[0].progress,70);
   if(allocated){assert.deepEqual(taskAfter.allocations,[{...periods[0],personIds:[member]},periods[1]]);assert.equal(taskAfter.legacyAllocationId,'team-anchor');}
   const readonly=editor(ids,{project:fixture,readonly:true});readonly.chipRemove(team.displayName);assert.equal(readonly.writes(),0);assert.deepEqual(readonly.read(),fixture.subTasks.내부);
  }
 });
 await test('조회 전용: 실제 배정/해제 handler 호출해도 원배정·실적·메모 쓰기 없음',()=>{const e=editor([actor.name,other.id],{readonly:true});e.click(actor.id);assert.equal(e.writes(),0);assert.deepEqual(e.read(),e.original);});
 await test('보고 방식 UI 제거: 같은/다른 부서 canonical TASK와 이름 alias DAILY 원문 보존',()=>{for(const person of [actor,{...actor,department:'구조팀'}]){const directory=[person,other],e=editor([person.name],{users:directory,reportingModes:{[person.id]:'TASK',[person.name]:'DAILY'}});assert.equal(e.writes(),0);assert.equal(work.assignedReportingMode(e.read(),person.id,work.assignmentAliases(person,directory)),'TASK');assert.ok(!e.html().includes('직원별 업무 보고 방식'));assert.ok(!e.html().includes('aria-label="내부 '+person.name+' 보고 방식"'));}});
 await test('보고 방식 UI 제거 후 인원 추가는 기존 canonical/helper와 보고·실적 원문 유지',()=>{for(const person of [actor,{...actor,department:'구조팀'}]){const directory=[person,other],e=editor([person.name],{users:directory,reportingModes:{[person.id]:'TASK',[person.name]:'DAILY'}});e.click(other.id);assert.equal(e.read().reportingModes[person.id],'TASK');assert.equal(work.assignedReportingMode(e.read(),person.id,work.assignmentAliases(person,directory)),'TASK');assert.deepEqual(e.read().personIds,[person.name,other.id]);for(const key of ['memo','startDate','endDate','progress','actualProgressDate'])assert.deepEqual(e.read()[key],e.original[key]);}});

 const periods=[{id:'first',personIds:[actor.id],startDate:'2026-10-06',endDate:'2026-10-07',memo:'첫 투입'},{id:'second',personIds:[other.id],startDate:'2026-10-12',endDate:'2026-10-13',memo:'둘째 투입'}];
 await test('개별 기간: 열기 쓰기0·공종 집계 날짜 수정 차단',()=>{const e=editor([actor.id,other.id],{allocations:periods});assert.equal(e.writes(),0);assert.ok(e.roleText().includes('인원별 투입 기간 (2개)'));const dates=e.roleHTML().match(/type="date"[^>]*disabled/g)||[];assert.equal(dates.length,2);});
 await test('개별 기간 실제 변경: 대상 하나만 변경·실적과 원문 보존',()=>{const e=editor([actor.id,other.id],{allocations:periods});e.changePeriod(2,'종료일','2026-10-15');assert.equal(e.read().endDate,'2026-10-15');assert.deepEqual(e.read().allocations[0],periods[0]);assert.equal(e.read().progress,42);assert.equal(e.read().memo,task.memo);assert.equal(e.read().actualProgressDate,task.actualProgressDate);});
 await test('개별 기간 잘못된 입력: 중앙 전송0·수정 후 정상 저장',()=>{const e=editor([actor.id,other.id],{allocations:periods});e.changePeriod(1,'시작일','2026-10-09');assert.equal(e.writes(),0);assert.ok(e.roleText().includes('시작일과 종료일을 확인'));e.changePeriod(1,'종료일','2026-10-10');assert.equal(e.read().allocations[0].startDate,'2026-10-09');assert.ok(e.writes()>0);});
 await test('개별 기간 제거: 해당 구간만 제거·남은 담당자와 집계 날짜 일치',()=>{const e=editor([actor.id,other.id],{allocations:periods});e.removePeriod(1);assert.deepEqual(e.read().personIds,[other.id]);assert.equal(e.read().personId,other.id);assert.deepEqual(e.read().allocations,[periods[1]]);assert.equal(e.read().startDate,'2026-10-12');});
 await test('개별 기간 담당 해제: 해당 담당 모든 구간만 제거',()=>{const e=editor([actor.id,other.id],{allocations:[...periods,{...periods[0],id:'third',startDate:'2026-10-20',endDate:'2026-10-20'}]});e.click(actor.id);assert.deepEqual(e.read().allocations,[periods[1]]);assert.deepEqual(e.read().personIds,[other.id]);});
 await test('개별 기간 담당 추가: 정확한 새 담당 ID·기존 구간 보존',()=>{const e=editor([other.id],{allocations:[periods[1]]});e.click(actor.id);assert.equal(e.read().allocations.length,2);assert.deepEqual(e.read().allocations[0],periods[1]);assert.deepEqual(e.read().allocations[1].personIds,[actor.id]);});
 await test('동일 담당 추가 투입: 원본 구간 복사 없이 별도 ID/메모',()=>{const e=editor([actor.id,other.id],{allocations:periods});e.addPeriod();assert.equal(e.read().allocations.length,3);assert.notEqual(e.read().allocations[2].id,'first');assert.equal(e.read().allocations[2].memo,undefined);assert.equal(e.read().allocations[2].source,undefined);assert.equal(e.read().allocations[2].startDate,'2026-10-07');});
 await test('개별 기간 조회 전용: 날짜·삭제·추가 모두 쓰기0',()=>{const e=editor([actor.id,other.id],{allocations:periods,readonly:true});e.changePeriod(1,'종료일','2026-10-22');e.removePeriod(1);e.addPeriod();assert.equal(e.writes(),0);assert.deepEqual(e.read(),e.original);});
 await test('투입 사이 빈 날짜: 다른 프로젝트가 있어도 잘못된 중복 표시 없음',()=>{const p={...structuredClone(project),id:'gap-project',subTasks:{내부:{...structuredClone(task),personIds:[actor.id],personId:actor.id,startDate:'2026-10-08',endDate:'2026-10-09'}}},e=editor([actor.id,other.id],{allocations:periods,others:[p]});assert.ok(e.unitText(actor.id).includes('투입 가능'));});
 const overlapProject=(id,name,roles)=>({...structuredClone(project),id,name,subTasks:Object.fromEntries(Object.entries(roles).map(([role,periods])=>[role,{...structuredClone(task),roleName:role,personId:actor.id,personIds:[actor.id],allocations:periods.map(([startDate,endDate],index)=>({id:role+index,personIds:[actor.id],startDate,endDate}))}]))});
 const broadProject=structuredClone(project);broadProject.subTasks.내부.endDate='2026-10-31';broadProject.subTasks.내부.dateMode='CUSTOM';
 await test('프로젝트 공통 기간: 신규 공종은 한 번 설정·하루 일정 허용·필요 공종만 별도 유지',()=>{
  const empty={...structuredClone(project),startDate:'',endDate:'',pmId:'',roles:{},subTasks:{}};
  const e=editor([],{project:empty,realStore:true});assert.equal(e.writes(),0);
  e.changeProjectDate('start','2026-10-13');assert.equal(e.writes(),0);
  e.changeProjectDate('end','2026-10-13');assert.equal(e.project().startDate,'2026-10-13');assert.equal(e.project().endDate,'2026-10-13');
  e.click(actor.id);assert.equal(e.read().dateMode,'PROJECT');assert.equal(e.read().startDate,'2026-10-13');assert.equal(e.read().endDate,'2026-10-13');
  e.changeProjectDate('end','2026-10-15');assert.equal(e.read().endDate,'2026-10-15');
  e.changeDateMode(true);e.changeDate('start','2026-10-14');const custom=e.read();
  e.changeProjectDate('end','2026-10-20');assert.equal(e.read().dateMode,'CUSTOM');assert.equal(e.read().startDate,custom.startDate);assert.equal(e.read().endDate,custom.endDate);
 });
 await test('프로젝트 공통 기간: 기존 수기 기간·실적·보고 방식은 명시 상속 선택 전 그대로',()=>{
  const original={...structuredClone(project),progress:55,subTasks:{내부:{...structuredClone(task),personIds:[actor.id],personId:actor.id}}};
  const e=editor([actor.id],{project:original,realStore:true}),before=e.read();e.changeProjectDate('end','2026-10-20');
  assert.deepEqual(e.read(),before);e.changeDateMode(false);assert.equal(e.read().dateMode,'PROJECT');assert.equal(e.read().endDate,'2026-10-20');
  for(const field of ['personIds','progress','actualProgressDate','reportingModes','memo'])assert.deepEqual(e.read()[field],before[field]);
  assert.equal(e.project().progress,55);e.changeProjectDate('end','2026-10-23');assert.equal(e.project().progress,55);assert.equal(e.read().progress,42);
 });
 await test('프로젝트 공통 기간: 다른 PC와 같은 날짜 충돌은 입력 유지·최신 재조회로 해소·덮어쓰기0',()=>{
  const e=editor([actor.id]);e.batchProjectDateRemote('end','2026-10-20',p=>{p.endDate='2026-10-22';});
  assert.equal(e.projectDate('end'),'2026-10-20');assert.equal(e.project().endDate,'2026-10-22');assert.ok(e.alerts());assert.equal(e.writes(),0);
  e.reload();assert.equal(e.projectDate('end'),'2026-10-22');assert.equal(e.alerts(),'');assert.equal(e.writes(),0);
 });
 await test('프로젝트 공통 기간: 한 번 적용은 기본 공종만 전환·CUSTOM/Excel 개인 구간·실적 유지',()=>{
  const original={...structuredClone(project),progress:55,subTasks:{내부:structuredClone(task),창호:{...structuredClone(task),roleName:'창호',dateMode:'CUSTOM',endDate:'2026-10-15'},외부:{...structuredClone(task),roleName:'외부',allocations:[{id:'excel-original',personIds:[actor.id],startDate:'2026-10-14',endDate:'2026-10-15',source:{sheet:'원본'}}]}}};
  const e=editor([],{project:original,realStore:true});e.changeProjectDate('end','2026-10-20');e.applyCommonPeriod();
  assert.equal(e.read().dateMode,'PROJECT');assert.equal(e.read().endDate,'2026-10-20');assert.equal(e.project().progress,55);assert.equal(e.read().progress,42);assert.deepEqual(e.project().subTasks.창호,original.subTasks.창호);assert.deepEqual(e.project().subTasks.외부,original.subTasks.외부);
 });
 await test('질의사항 이동: 연결 prop 없으면 버튼 없음·PM 선택은 실공종 연결·저장 입력 보존',()=>{
  assert.ok(!editor([]).html().includes('프로젝트 질의사항'));
  const e=editor([actor.id],{inquiries:true});e.changeProjectDate('end','2026-10-20');e.selectRole('PM');e.openInquiries();assert.deepEqual(e.navigation(),[{id:project.id,role:'조적'}]);assert.equal(e.closed(),1);assert.equal(e.project().endDate,'2026-10-20');assert.equal(e.read().memo,task.memo);
 });
 await test('질의사항 이동: 미완성 기간 입력은 닫거나 덮어쓰지 않고 수정 후 이동 허용',()=>{
  const e=editor([actor.id],{inquiries:true});e.changeProjectDate('start','');e.openInquiries();assert.equal(e.closed(),0);assert.deepEqual(e.navigation(),[]);assert.equal(e.projectDate('start'),'');assert.equal(e.project().startDate,project.startDate);assert.equal(e.writes(),0);
  e.changeProjectDate('start',project.startDate);e.openInquiries();assert.equal(e.closed(),1);assert.equal(e.navigation()[0].role,'내부');
 });
 await test('현재 겹침: 끝난 구간·완료 현장은 제외하고 미래 실제 투입·납품 후 수정은 보존',()=>{
  const current={...structuredClone(broadProject),startDate:'2026-10-13',endDate:'2026-10-31',subTasks:{내부:{...structuredClone(task),personId:actor.id,personIds:[actor.id],startDate:'2026-10-13',endDate:'2026-10-31'}}};
  const expired=overlapProject('expired','기한 종료 현장',{내부:[['2026-10-06','2026-10-12']]}),done=overlapProject('done','완료 현장',{내부:[['2026-10-15','2026-10-20']]}),future=overlapProject('future','미래 투입 현장',{내부:[['2026-10-15','2026-10-16']]});
  done.status='납품';done.progress=100;
  const follow={...structuredClone(done),id:'follow',name:'납품 후 수정 현장',postDeliveryTasks:[{id:'review-next',kind:'수정',startDate:'2026-10-20',endDate:'2026-10-21',personIds:[actor.id],memo:'후속 수정',status:'예정'}]};
  const e=editor([actor.id],{project:current,others:[expired,done,future,follow],today:'2026-10-13'});
  assert.deepEqual(e.unitProjectIds(actor.id),['future','follow']);assert.match(e.unitText(actor.id),/겹치는 프로젝트 2개/);assert.ok(!e.unitText(actor.id).includes('기한 종료 현장'));assert.ok(!e.unitText(actor.id).includes('완료 현장'));
 });
 await test('현재 겹침: 종료 프로젝트의 기본 고정기간 제외·명시 CUSTOM/실제 미래 구간 보존',()=>{
  const plain={...structuredClone(project),id:'ended-default',startDate:'2026-09-01',endDate:'2026-10-12',subTasks:{내부:{...structuredClone(task),personId:actor.id,personIds:[actor.id],startDate:'2026-09-25',endDate:'2026-10-20'}}};
  const custom={...structuredClone(plain),id:'ended-custom',subTasks:{내부:{...plain.subTasks.내부,dateMode:'CUSTOM'}}},allocation=overlapProject('ended-actual','실제 미래 투입',{내부:[['2026-10-14','2026-10-16']]});allocation.endDate='2026-10-12';
  const snapshot=structuredClone(plain),e=editor([actor.id],{project:{...structuredClone(broadProject),startDate:'2026-10-13',endDate:'2026-10-31'},others:[plain,custom,allocation],today:'2026-10-13'});assert.deepEqual(e.unitProjectIds(actor.id),['ended-custom','ended-actual']);assert.equal(e.writes(),0);assert.deepEqual(plain,snapshot);
 });
 await test('가용성 프로젝트 묶음: 같은 현장 공종/분할기간은 한 줄·실제 공종별 날짜 보존',()=>{
  const p=overlapProject('one-project','반복 현장',{PM:[['2026-10-06','2026-10-09'],['2026-10-10','2026-10-12']],내부:[['2026-10-08','2026-10-11'],['2026-10-20','2026-10-21']]});
  const original=structuredClone(p),e=editor([actor.id],{project:broadProject,others:[p]});
  assert.deepEqual(e.unitProjectIds(actor.id),['one-project']);assert.equal(e.unitSummaries(actor.id).length,1);
  assert.match(e.unitText(actor.id),/겹치는 프로젝트 1개/);assert.doesNotMatch(e.unitText(actor.id),/과부하|중복 4건/);
  assert.match(e.unitSummaries(actor.id)[0],/2026-10-06 ~ 10-12, 2026-10-20 ~ 10-21/);assert.match(e.unitSummaries(actor.id)[0],/PM · 내부/);
  assert.ok(e.unitText(actor.id).includes('2026-10-08 ~ 10-11'));assert.deepEqual(p,original);assert.equal(e.writes(),0);
 });
 await test('가용성 프로젝트 묶음: 이름이 같아도 프로젝트 ID가 다르면 별도 2개',()=>{
  const first=overlapProject('one','같은 표시명',{내부:[['2026-10-06','2026-10-08']]}),second=overlapProject('two','같은 표시명',{창호:[['2026-10-06','2026-10-08']]});
  const e=editor([actor.id],{others:[first,second]});assert.deepEqual(e.unitProjectIds(actor.id),['one','two']);assert.match(e.unitText(actor.id),/겹치는 프로젝트 2개/);assert.equal(e.unitSummaries(actor.id).length,2);
 });
 await test('가용성 프로젝트 묶음: 휴가는 별도 건수·여유 필터 판정 유지',()=>{
  const p=overlapProject('one','휴가와 겹친 현장',{내부:[['2026-10-06','2026-10-08']]}),leave={id:'leave-one',user_id:actor.id,kind:'연차',start_date:'2026-10-07',end_date:'2026-10-07',revision:1};
  const e=editor([actor.id],{others:[p],leaves:[leave]});assert.deepEqual(e.unitProjectIds(actor.id),['one']);assert.match(e.unitText(actor.id),/겹치는 프로젝트 1개 · 휴가 1건/);assert.ok(e.unitSummaries(actor.id).some(row=>row.includes('휴가 · 연차')&&row.includes('2026-10-07')));
  const onlyLeave=editor([actor.id],{leaves:[leave]});assert.equal(onlyLeave.unitProjectIds(actor.id).length,0);assert.match(onlyLeave.unitText(actor.id),/휴가 1건/);assert.doesNotMatch(onlyLeave.unitText(actor.id),/투입 가능|겹치는 프로젝트/);
 });
 await test('가용성 프로젝트 묶음: 월·연도 경계 연속구간만 병합·원본 불변',()=>{
  const e=editor([]),entry=(startDate,endDate)=>({id:'same',kind:'project',projectName:'경계 현장',roleName:'내부',startDate,endDate});
  const input=[entry('2027-01-01','2027-01-02'),entry('2026-12-30','2026-12-31'),entry('2027-01-04','2027-01-04'),entry('2026-12-30','2026-12-31')],original=structuredClone(input),groups=e.groupAvailability(input);
  assert.equal(groups.length,1);assert.deepEqual(JSON.parse(JSON.stringify(groups[0].periods)),[{startDate:'2026-12-30',endDate:'2027-01-02'},{startDate:'2027-01-04',endDate:'2027-01-04'}]);assert.deepEqual(input,original);
 });
 await test('PM 표시: global pmId 공백·실제 PM 개인 2구간이면 신규 미배정 오표시 없이 원문·개인 할일 유지',()=>{
  const p={...structuredClone(project),pmId:'',startDate:'2026-09-07',endDate:'2026-09-11',subTasks:{PM:{...structuredClone(task),roleName:'PM',personId:actor.id,personIds:[actor.id],startDate:'2026-09-07',endDate:'2026-09-11',allocations:[{id:'pm-seven',personIds:[actor.id],startDate:'2026-09-07',endDate:'2026-09-08',memo:'첫 PM 업무'},{id:'pm-ten',personIds:[actor.id],startDate:'2026-09-10',endDate:'2026-09-11',memo:'둘째 PM 업무'}]},내부:structuredClone(task)}};
  const original=structuredClone(p),e=editor([],{project:p});assert.ok(!e.html().includes('신규 프로젝트 · PM 및 담당 인원 배정 필요'));assert.ok(e.html().includes(actor.name));assert.equal(e.writes(),0);assert.deepEqual(e.project(),original);
  assert.equal(work.assignedItems(actor.id,'2026-09-08',[e.project()]).length,1);assert.equal(work.assignedItems(actor.id,'2026-09-09',[e.project()]).length,0);assert.equal(work.assignedItems(actor.id,'2026-09-10',[e.project()]).length,1);
 });
 await test('PM 기간 삭제: master 책임자 유지·남은 구간 담당만 실제 투입',()=>{const e=editor([actor.id,other.id],{pm:periods});e.removePMPeriod(1);assert.equal(e.readPM().personId,actor.id);assert.deepEqual(e.readPM().personIds,[actor.id,other.id]);assert.deepEqual(e.readPM().allocations,[periods[1]]);assert.equal(work.assignedTasks(actor.id,[{...project,subTasks:{PM:e.readPM()}}]).length,0);});
 await test('PM 마지막 기간 삭제: master 유지·유령 할 일 생성0',()=>{const e=editor([actor.id],{pm:[periods[0]]});e.removePMPeriod(1);assert.equal(e.readPM().personId,actor.id);assert.deepEqual(e.readPM().allocations,[]);assert.deepEqual(e.readPM().personIds,[actor.id]);assert.equal(work.assignedTasks(actor.id,[{...project,subTasks:{PM:e.readPM()}}]).length,0);});
 await test('PM 명시 배정 해제: master를 남은 PM으로 변경·대상 구간 제거',()=>{const e=editor([actor.id,other.id],{pm:periods});e.unlinkPM(actor.name);assert.equal(e.readPM().personId,other.id);assert.deepEqual(e.readPM().personIds,[other.id]);assert.deepEqual(e.readPM().allocations,[periods[1]]);});
 await test('custom 공종5의 첫 PM 실제 배정→실제 저장 함수·서버 병합: 전체55와 승인35 보존',async()=>{
  const custom={...structuredClone(project),id:'pm-first-modal',pmId:'',progress:55,subTasks:Object.fromEntries(['RC','도장','방수','전공정','코킹'].map(role=>[role,{...structuredClone(task),roleName:role,personId:actor.id,personIds:[actor.id],progress:35,allocations:[{id:role+'-first',personIds:[actor.id],startDate:task.startDate,endDate:task.endDate,memo:role+' 원본 구간'}]}]))};
  const original=structuredClone(custom),e=editor([],{project:custom,role:'RC',realStore:true});assert.equal(e.writes(),0);assert.equal(e.project().progress,55);e.assignPM(actor.id);const local=e.project();assert.equal(local.pmId,actor.id);assert.equal(local.progress,55);for(const role of Object.keys(custom.subTasks))assert.deepEqual(local.subTasks[role],original.subTasks[role]);
  const {mergeProject}=await server.ssrLoadModule('../functions/lib/collaboration.ts'),remote=mergeProject(original,original,local);assert.equal(remote.progress,55);assert.equal(remote.pmId,actor.id);for(const role of Object.keys(custom.subTasks))assert.deepEqual(remote.subTasks[role],original.subTasks[role]);assert.equal(e.writes(),1);
 });
}finally{await server.close();globalThis.fetch=nativeFetch;if(externalRequests)process.exitCode=1;if(process.argv[2]&&process.argv[2]!=='--before')writeFileSync(process.argv[2],JSON.stringify({kind:'ACTUAL_MODAL_HANDLERS_STATE_AND_SSR_SYNTHETIC',protectedOriginal:before,protectedPMGuard:beforePMGuard,protectedScope:beforeScope,externalRequests,results},null,2)+'\n');}
