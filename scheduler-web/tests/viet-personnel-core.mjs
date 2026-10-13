import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {VIET_ASSIGNMENT_GROUPS,resolveVietTeams,vietIndividuals} from '../src/utils/vietPersonnel.ts';
import {updateAssignmentMembers} from '../src/utils/scheduleAllocations.ts';
import * as work from '../src/utils/personalWork.ts';
import {VIET_TEAMS_DATA} from '../src/data/vietTeams.ts';

const beforeDirectory=process.argv.includes('--before-directory');
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length)||'test-results/viet-personnel-core.json';
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};globalThis.window={localStorage};
const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('External requests are forbidden in this synthetic test');};
// Execute the actual pure directory function without initializing browser stores or loading staff files.
const directoryPath=beforeDirectory?'../private-provisioning/qa-vn-personal-teams-20261008/core-originals/C/scheduler-web/src/store/useProjectStore.ts':'src/store/useProjectStore.ts';
const source=ts.createSourceFile(directoryPath,readFileSync(directoryPath,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const declarations=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='mergeDirectoryPersonnel'||ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>['validTechDepts','DEPARTMENTS'].includes(declaration.name.getText(source))));
assert.equal(declarations.length,3,'The actual directory function and its two existing constants must be present');
const moduleExports={},compiled=ts.transpileModule(declarations.map(node=>node.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
runInNewContext(compiled,{exports:moduleExports});const {mergeDirectoryPersonnel}=moduleExports;
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.error('FAIL',name,error.message);}}
try{
 const legacyTeams=structuredClone(VIET_TEAMS_DATA);
 const vn={id:'synthetic-vn-A',no:901,employeeNo:'4901',name:'NGUYỄN ĐẦY ĐỦ TÊN',engName:'NGUYEN DAY DU TEN',company:'VIETQS',department:'구조팀',originalDept:'원본 구조 부서',position:'팀장',idPrefix:'synthetic-vn-a',active:true,vietTeamId:'vt_horiz_apartment'};
 const other={...vn,id:'synthetic-vn-B',no:902,employeeNo:'4902',name:'TRẦN NHÂN VIÊN',position:'사원'};
 const unassigned={...vn,id:'synthetic-vn-unassigned',name:'미지정 실명',vietTeamId:undefined};
 const unknown={...vn,id:'synthetic-vn-unknown',name:'알 수 없는 그룹',vietTeamId:'unverified-group'};
 const wrongDepartment={...vn,id:'synthetic-vn-wrong-dept',department:'마감팀'};
 const wrongCompany={...vn,id:'synthetic-kr',company:'컨코스트'};
 const inactive={...vn,id:'synthetic-vn-inactive',active:false};
 const directory=[vn,other,unassigned,unknown,wrongDepartment,wrongCompany,inactive];
 const legacy={roleName:'내부',personId:'old-owner',personIds:['old-owner','old-other'],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',progress:35,memo:'기존 업무 원문',reportingMode:'TASK',reportingModes:{'old-owner':'DAILY'}};
 const project=task=>({id:'synthetic-vn-project',code:'QA-VN',name:'합성 개인 배정',department:'마감팀',pmId:'',startDate:'2026-10-06',endDate:'2026-10-30',status:'진행중',progress:35,roles:{},subTasks:{내부:task}});
 await check('명시 그룹 11개: 마감6/구조4/토목1 및 기존 정적 팀 명부 보존',()=>{
  assert.equal(VIET_ASSIGNMENT_GROUPS.filter(group=>group.department==='마감팀').length,6);assert.equal(VIET_ASSIGNMENT_GROUPS.filter(group=>group.department==='구조팀').length,4);assert.equal(VIET_ASSIGNMENT_GROUPS.filter(group=>group.department==='토목&조경팀').length,1);
  assert.deepEqual(VIET_ASSIGNMENT_GROUPS.filter(group=>group.department==='구조팀').map(group=>group.id),['vt_horiz_apartment','vt_horiz_general','vt_vert_apartment','vt_vert_general']);assert.equal(new Set(VIET_ASSIGNMENT_GROUPS.map(group=>group.id)).size,11);assert.deepEqual(VIET_TEAMS_DATA,legacyTeams);
 });
 await check('실제 directory ID만 그룹 연결하며 미지정 개인·실명 보존',()=>{
  const snapshot=structuredClone(directory),teams=resolveVietTeams(directory,'구조팀'),team=teams.find(group=>group.id===vn.vietTeamId);
  assert.deepEqual(team.members.map(member=>member.id),[vn.id,other.id]);assert.equal(team.members[0].name,vn.name);assert.equal(team.members[0].no,4901);assert.equal(team.leaderName,vn.name);
  assert.deepEqual(vietIndividuals(directory,'구조팀').map(user=>user.id),[vn.id,other.id,unassigned.id,unknown.id]);assert.ok(!teams.some(group=>group.members.some(member=>member.id===inactive.id||member.id===wrongDepartment.id)));assert.deepEqual(directory,snapshot);
 });
 await check('VN 활성 명부는 전체 실명·VIETNAM으로 병합하고 기존 KR/팀/비활성 과거 명부 보존',()=>{
  const personnel=[{id:'legacy-unit',name:'이전 팀명',avatar:'',region:'VIETNAM',team:'마감팀'},{id:inactive.id,name:'비활성 과거 실명',avatar:'',region:'VIETNAM',team:'구조팀'}];
  const original=structuredClone(personnel),people=mergeDirectoryPersonnel(personnel,directory);
  assert.equal(people.find(person=>person.id===vn.id)?.name,vn.name);assert.equal(people.find(person=>person.id===vn.id)?.region,'VIETNAM');assert.equal(people.find(person=>person.id===wrongCompany.id)?.name,wrongCompany.name+' '+wrongCompany.position);assert.equal(people.find(person=>person.id===wrongCompany.id)?.region,'KOREA');assert.equal(people.find(person=>person.id===inactive.id)?.name,'비활성 과거 실명');assert.deepEqual(people.find(person=>person.id==='legacy-unit'),original[0]);assert.deepEqual(personnel,original);
 });
 await check('구형 담당자의 기간·메모/gen ID는 유지하며 새 개인만 다른 기간 구간 생성',()=>{
  const original=structuredClone(legacy),p=project(legacy),old=work.assignedTasks('old-owner',[p])[0];
  const next=updateAssignmentMembers(legacy,{addIds:[vn.id,other.id,vn.id],startDate:'2026-10-12',endDate:'2026-10-15'}),rows=work.assignedTasks('old-owner',[project(next)]),fresh=work.assignedTasks(vn.id,[project(next)]);
  assert.equal(next.allocations.length,2);assert.equal(next.allocations[0].id,next.legacyAllocationId);assert.deepEqual(next.allocations[0].personIds,legacy.personIds);assert.deepEqual(next.allocations[1].personIds,[vn.id,other.id]);assert.notEqual(next.allocations[1].id,next.legacyAllocationId);assert.equal(rows[0].id,old.id);assert.equal(rows[0].startDate,old.startDate);assert.equal(rows[0].endDate,old.endDate);assert.equal(rows[0].scheduleMemo,old.scheduleMemo);assert.notEqual(fresh[0].id,old.id);assert.equal(fresh[0].startDate,'2026-10-12');assert.equal(fresh[0].endDate,'2026-10-15');assert.equal(next.progress,legacy.progress);assert.deepEqual(next.reportingModes,legacy.reportingModes);assert.deepEqual(legacy,original);
  const manual={...old,todayTask:'작성한 수행 원문',progress:70,notes:'직접 메모',manualFields:['todayTask','progress','notes']},draft=work.reconcileWorkLogItems([manual],'old-owner','2026-10-06',[project(next)]);
  assert.equal(draft[0].id,old.id);assert.equal(draft[0].todayTask,manual.todayTask);assert.equal(draft[0].progress,70);assert.equal(draft[0].scheduleRemoved,false);assert.equal(draft[0].allocationId,next.legacyAllocationId);assert.equal(work.assignedItems(vn.id,'2026-10-06',[project(next)]).length,0);assert.equal(work.assignedItems(vn.id,'2026-10-12',[project(next)]).length,1);
  assert.equal(updateAssignmentMembers(next,{addIds:[vn.id,other.id],startDate:'2026-10-20',endDate:'2026-10-22'}),next,'Already-assigned bulk selection must be a no-op');
 });
 await check('구간 일부 해제/추가가 원본 source·marker·다른 인원·보고 방식·공정률을 보존',()=>{
  const source={workbookHash:'a'.repeat(64),sheet:'합성',ownerRange:'B6:D6',roleRange:'B7:D7',projectRange:'B8:D8',projectText:'원 현장',roleText:'내부'};
  const task={...legacy,legacyAllocationId:'retained-fixed',allocations:[{id:'retained-fixed',personIds:['old-owner','old-other'],startDate:legacy.startDate,endDate:legacy.endDate,memo:'구간 원문',source},{id:'other-period',personIds:['untouched'],startDate:'2026-10-20',endDate:'2026-10-21',memo:'타인 원문'}]},snapshot=structuredClone(task);
  const next=updateAssignmentMembers(task,{removeIds:['old-owner'],addIds:[vn.id],startDate:'2026-10-12',endDate:'2026-10-15'});
  assert.deepEqual(next.allocations[0],{...snapshot.allocations[0],personIds:['old-other']});assert.deepEqual(next.allocations[1],snapshot.allocations[1]);assert.equal(next.legacyAllocationId,'retained-fixed');assert.equal(next.personId,'old-other');assert.equal(next.progress,task.progress);assert.deepEqual(next.reportingModes,task.reportingModes);assert.equal(work.assignedTasks('old-owner',[project(next)]).length,0);assert.equal(work.assignedTasks('old-other',[project(next)])[0].id,'gen-synthetic-vn-project-내부');assert.deepEqual(task,snapshot);
 });
 await check('명시 빈 구간 및 범위없음에서 옛 담당자를 복원하지 않고 원 marker 예약 보존',()=>{
  const empty={...legacy,allocations:[],legacyAllocationId:'removed-original'},next=updateAssignmentMembers(empty,{addIds:[vn.id],startDate:'2026-10-12',endDate:'2026-10-15'});
  assert.deepEqual(next.personIds,[vn.id]);assert.equal(next.allocations.length,1);assert.equal(next.legacyAllocationId,'removed-original');assert.notEqual(next.allocations[0].id,next.legacyAllocationId);assert.equal(work.assignedTasks('old-owner',[project(next)]).length,0);
  const excluded={...legacy,scopeExcluded:true};assert.throws(()=>updateAssignmentMembers(excluded,{addIds:[vn.id]}),/용역 범위 없음/);
  const restored=updateAssignmentMembers(excluded,{addIds:[vn.id],restoreScope:true});assert.equal(restored.scopeExcluded,false);assert.deepEqual(restored.personIds,[vn.id]);assert.equal(restored.allocations.length,1);assert.equal(restored.legacyAllocationId,undefined);
 });
 await check('투입 날짜와 ID 오류는 원문을 수정하지 않고 거부',()=>{
  const snapshot=structuredClone(legacy);for(const [startDate,endDate]of [['2026-02-30','2026-03-01'],['2026-10-20','2026-10-01'],['','']])assert.throws(()=>updateAssignmentMembers(legacy,{addIds:[vn.id],startDate,endDate}),/시작일/);
  assert.throws(()=>updateAssignmentMembers({...legacy,startDate:'2026-02-30'},{addIds:[vn.id],startDate:'2026-10-12',endDate:'2026-10-15'}),/기존 담당자/);assert.throws(()=>updateAssignmentMembers(legacy,{addIds:[' ']}),/담당자 ID/);assert.deepEqual(legacy,snapshot);
 });
 await check('PM 총괄은 전체 팀 추가로 바뀌지 않으며 기존 빈 구간은 실제 투입으로 복원되지 않음',()=>{
  const pm={...legacy,roleName:'PM',personId:'master-pm',personIds:['master-pm'],allocations:[]},next=updateAssignmentMembers(pm,{addIds:[vn.id,other.id]});
  assert.equal(next.personId,'master-pm');assert.deepEqual(next.personIds,['master-pm',vn.id,other.id]);assert.deepEqual(next.allocations[0].personIds,[vn.id,other.id]);assert.equal(work.assignedTasks('master-pm',[{...project(next),subTasks:{PM:next}}]).length,0);
 });
 await check('새 전체 배정은 실제 ID 스냅샷이며 그룹 변경이 기존 배정 또는 legacy 팀 상속을 변경하지 않음',()=>{
  const members=resolveVietTeams(directory,'구조팀').find(team=>team.id===vn.vietTeamId).members,task=updateAssignmentMembers({...legacy,personId:'',personIds:[],allocations:[]},{addIds:members.map(member=>member.id)}),snapshot=structuredClone(task);
  resolveVietTeams(directory.map(user=>user.id===vn.id?{...user,vietTeamId:'vt_vert_general'}:user),'구조팀');assert.deepEqual(task,snapshot);assert.deepEqual(task.allocations[0].personIds,[vn.id,other.id]);assert.ok(task.allocations[0].personIds.every(id=>!id.startsWith('vt_')));
  const legacyTeam=VIET_TEAMS_DATA.find(team=>team.id==='vt_in1'),existing={...legacy,personId:legacyTeam.id,personIds:[legacyTeam.id]},before=work.assignedTasks(legacyTeam.members[0].id,[project(existing)]),after=updateAssignmentMembers(existing,{addIds:[vn.id]});
  assert.equal(work.assignedTasks(legacyTeam.members[0].id,[project(after)])[0].id,before[0].id);assert.equal(after.allocations[0].personIds[0],legacyTeam.id);assert.equal(work.assignedTasks(legacyTeam.members[0].id,[project(after)])[0].endDate,before[0].endDate);assert.deepEqual(VIET_TEAMS_DATA,legacyTeams);
 });
}finally{globalThis.fetch=originalFetch;}
writeFileSync(output,JSON.stringify({kind:'SYNTHETIC_ACTUAL_VN_CORE_HELPERS',beforeDirectory,externalRequests:requests,operatingWrites:0,results},null,2));
if(requests||results.some(result=>result.status!=='PASS'))process.exitCode=1;
