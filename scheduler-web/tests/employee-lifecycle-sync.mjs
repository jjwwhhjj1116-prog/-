import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {database} from './d1.mjs';
import {buildWeeklyReport} from '../../functions/lib/weeklyReports.ts';

// Local SQLite supplies directory versions; the real polling store consumes synthetic HTTP responses.
const saved={fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,localStorage:globalThis.localStorage,window:globalThis.window};
const storage=new Map(),results=[],calls=[];
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window={localStorage};
let repeat,stop;
globalThis.setInterval=fn=>{repeat=fn;return 143;};globalThis.clearInterval=()=>{};
const {db,DB}=database();
db.exec(readFileSync(new URL('../../migrations/0009_weekly_reports.sql',import.meta.url),'utf8'));
const actor={id:'qa-lifecycle-admin',no:9140,name:'합성 관리자',company:'컨코스트',department:'개발 TF',originalDept:'개발 TF',position:'실장',email:'yjw@con-cost.com',idPrefix:'qa-lifecycle-admin',role:'ADMIN',active:true};
const old={id:'qa-lifecycle-existing',no:9141,name:'NGUYỄN EXISTING',engName:'NGUYEN EXISTING',company:'VIETQS',department:'마감팀',originalDept:'Internal1',position:'책임',email:'old@example.invalid',idPrefix:'qa-lifecycle-existing',role:'MEMBER',active:true,vietTeamId:'vt_in1'};
const fresh={...old,id:'qa-lifecycle-new',no:9142,name:'TRẦN NEW EMPLOYEE',idPrefix:'qa-lifecycle-new',email:'new@example.invalid',position:'프로'};
const project={id:'qa-lifecycle-finish',code:'QA-LIFECYCLE-F',name:'합성 기존 실제 ID 배정',department:'마감팀',pmId:'',startDate:'2026-10-12',endDate:'2026-10-30',progress:35,status:'진행중',roles:{},subTasks:{내부:{roleName:'내부',personId:old.id,personIds:[old.id],startDate:'2026-10-12',endDate:'2026-10-30',progress:35,status:'진행중',memo:'기존 담당 원문',allocations:[{id:'retained-allocation',personIds:[old.id],startDate:'2026-10-12',endDate:'2026-10-30',memo:'원 투입 구간'}]}}};
const structure={...structuredClone(project),id:'qa-lifecycle-structure',code:'QA-LIFECYCLE-S',name:'합성 구조 신규 배정',department:'구조팀',subTasks:{슬라브:{...structuredClone(project.subTasks.내부),roleName:'슬라브',personId:'',personIds:[],allocations:[]}}};
const putUser=person=>db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,department=excluded.department,position=excluded.position,profile=excluded.profile,active=excluded.active').run(person.id,person.id,person.email,person.name,person.department,person.position,JSON.stringify(person),'synthetic-unused','synthetic-unused',person.active===false?0:1);
for(const person of [actor,old])putUser(person);
for(const p of [project,structure])db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run(p.id,JSON.stringify(p),1,'synthetic',actor.id);
const directory=()=>db.prepare('SELECT id,name,department,position,profile,active FROM studio_users').all().map(row=>({...JSON.parse(row.profile),id:row.id,name:row.name,department:row.department,position:row.position,active:row.active===1}));
globalThis.fetch=async(url,options={})=>{
 const parsed=new URL(String(url),'https://synthetic.invalid'),path=parsed.pathname.split('/').at(-1);calls.push({path,method:options.method||'GET'});
 assert.ok(parsed.pathname.startsWith('/api/collaboration/'),'Only synthetic studio transport is supported');assert.equal(options.method||'GET','GET','Directory polling must not write projects or accounts');
 const response={session:{user:actor},changes:{versions:Object.fromEntries(db.prepare('SELECT key,revision FROM studio_sync_versions').all().map(row=>[row.key,row.revision]))},directory:{users:directory()},projects:{projects:db.prepare('SELECT body FROM studio_projects').all().map(row=>({project:JSON.parse(row.body)})),archived:[],pendingIntake:[]},meetings:{meetings:[]},notifications:{notifications:[],unreadCount:0},personal:{leaves:[],checks:[],worklogs:[]}}[path];
 assert.ok(response,'Unexpected synthetic route '+path);return Response.json(response);
};
const settle=async()=>{for(let n=0;n<20;n++)await new Promise(resolve=>setTimeout(resolve,0));};
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages()],optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
async function check(name,fn){try{results.push({name,status:'PASS',observed:await fn()});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}
try{
 const {useAuthStore:auth}=await server.ssrLoadModule('/src/store/useAuthStore.ts');
 const {useProjectStore:projects}=await server.ssrLoadModule('/src/store/useProjectStore.ts');
 const {startStudioSync,useStudioStore:studio}=await server.ssrLoadModule('/src/store/useStudioStore.ts');
 const viet=await server.ssrLoadModule('/src/utils/vietPersonnel.ts'),work=await server.ssrLoadModule('/src/utils/personalWork.ts'),{updateAssignmentMembers}=await server.ssrLoadModule('/src/utils/scheduleAllocations.ts');
 const {default:ProjectModal}=await server.ssrLoadModule('/src/components/ProjectModal.tsx');
 const legacyPerson={id:'legacy-retained-team',name:'기존 팀 원문',region:'VIETNAM',team:'마감팀',avatar:''};
 const baselineProject=structuredClone(project);
 storage.set('studio-legacy-import-v1:'+actor.id,'1');auth.setState({currentUser:actor,users:[actor,old],isAuthenticated:true});projects.setState({projects:[],personnel:[legacyPerson]});
 const pulse=async()=>{assert.equal(typeof repeat,'function');repeat();await settle();assert.ok(studio.getState().ready,studio.getState().status);};
 const people=()=>auth.getState().users;
 const renderModal=id=>{for(const store of [auth,projects])Object.assign(store.getInitialState(),store.getState());return renderToStaticMarkup(createElement(ProjectModal,{projectId:id,onClose(){}}));};
 const option=(html,id)=>new RegExp('<option[^>]*value="'+id+'"[^>]*>(.*?)</option>','s').exec(html)?.[1];
 const assertOriginal=()=>{assert.deepEqual(projects.getState().projects.find(p=>p.id===project.id),baselineProject);assert.deepEqual(JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(project.id).body),baselineProject);assert.deepEqual(projects.getState().personnel.find(person=>person.id===legacyPerson.id),legacyPerson);};

 await check('실제 startStudioSync: 초기 명부 수신 및 버전 불변 시 directory 재조회·쓰기 없음',async()=>{
  stop=startStudioSync(actor.id);await settle();assert.ok(studio.getState().ready,studio.getState().status);assert.deepEqual(people(),directory());assert.equal(projects.getState().personnel.find(person=>person.id===old.id)?.name,old.name);
  const reads=calls.filter(call=>call.path==='directory').length;await pulse();assert.equal(calls.filter(call=>call.path==='directory').length,reads);assertOriginal();return {directoryReads:reads,projectWrites:0};
 });
 await check('신규 VN 등록 버전: actual users/personnel·동적 그룹·개인 선택 즉시 갱신, 기존 배정 승계 없음',async()=>{
  putUser(fresh);assert.ok(!people().some(person=>person.id===fresh.id),'Server-only mutation must not bypass the real polling store');assert.equal(option(renderModal(project.id),fresh.id),undefined);await pulse();assert.deepEqual(people().find(person=>person.id===fresh.id),fresh);assert.equal(projects.getState().personnel.find(person=>person.id===fresh.id)?.name,fresh.name);assert.equal(projects.getState().personnel.find(person=>person.id===fresh.id)?.region,'VIETNAM');
  const group=viet.resolveVietTeams(people(),'마감팀').find(team=>team.id==='vt_in1');assert.deepEqual(group.members.map(member=>member.id),[old.id,fresh.id]);assert.ok(viet.vietIndividuals(people(),'마감팀').some(person=>person.id===fresh.id));assert.ok(option(renderModal(project.id),fresh.id)?.includes(fresh.name));assert.equal(work.assignedTasks(fresh.id,projects.getState().projects).length,0);assert.equal(work.assignedTasks(old.id,projects.getState().projects).length,1);assertOriginal();return {groupIds:group.members.map(member=>member.id),newEmployeeExistingTasks:0};
 });
 await check('부서·그룹 이동 버전: 새 부서 그룹/개인 선택으로 이동, 이전 소속 선택 제거·일정 원문 유지',async()=>{
  putUser({...fresh,name:'TRẦN MOVED EMPLOYEE',department:'구조팀',originalDept:'수평팀(일반)',vietTeamId:'vt_horiz_general',position:'책임'});await pulse();const person=people().find(person=>person.id===fresh.id),member=projects.getState().personnel.find(person=>person.id===fresh.id);assert.equal(person.department,'구조팀');assert.equal(member.team,'구조팀');assert.equal(member.name,person.name);
  assert.ok(!viet.vietIndividuals(people(),'마감팀').some(person=>person.id===fresh.id));assert.ok(!viet.resolveVietTeams(people(),'마감팀').some(team=>team.members.some(person=>person.id===fresh.id)));assert.deepEqual(viet.resolveVietTeams(people(),'구조팀').find(team=>team.id==='vt_horiz_general').members.map(member=>member.id),[fresh.id]);assert.equal(option(renderModal(project.id),fresh.id),undefined);assert.ok(option(renderModal(structure.id),fresh.id)?.includes(person.name));assertOriginal();return {department:member.team,group:person.vietTeamId};
 });
 await check('실제 ID 명시 배정 후: 공유 일정 갱신 → 당일 할일·업무일지 항목, 그룹 변경으로 다른 직원 추가 없음',async()=>{
  const p=structuredClone(structure),task=updateAssignmentMembers(p.subTasks.슬라브,{addIds:[fresh.id],startDate:'2026-10-16',endDate:'2026-10-20'});p.subTasks.슬라브=task;db.prepare('UPDATE studio_projects SET body=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),p.id);await pulse();
  const current=people().find(person=>person.id===fresh.id),aliases=work.assignmentAliases(current,people()),todo=work.assignedItems(fresh.id,'2026-10-16',projects.getState().projects,aliases),items=work.reconcileWorkLogItems([],fresh.id,'2026-10-16',projects.getState().projects,aliases);assert.equal(todo.length,1);assert.equal(items.length,1);assert.equal(todo[0].projectId,p.id);assert.equal(items[0].allocationId,task.allocations[0].id);assert.deepEqual(task.allocations[0].personIds,[fresh.id]);assert.equal(work.assignedItems(old.id,'2026-10-16',[p]).length,0);assertOriginal();
  const log={id:'qa-lifecycle-daily',userId:fresh.id,userName:current.name,userPosition:current.position,date:'2026-10-16',department:'구조팀',approvalStatus:'DRAFT',items};db.prepare('INSERT INTO studio_worklogs VALUES (?,?,?,?,?,?,?)').run(log.id,log.userId,log.date,log.department,JSON.stringify(log),1,0);return {todoItems:todo.length,worklogItems:items.length,assignmentIds:task.allocations[0].personIds};
 });
 await check('SQLite 현재 명부 주간 보고: 신규·이동 직원 소속과 직급 반영, 실제 배정 일지와 ID 연결',async()=>{
  const report=await buildWeeklyReport({DB},db.prepare('SELECT * FROM studio_users WHERE id=?').get(actor.id),'2026-10-12',new Date('2026-10-16T03:00:00Z')),team=report.teams.find(team=>team.department==='구조팀'),person=team.employees.find(person=>person.id===fresh.id);assert.equal(person.name,'TRẦN MOVED EMPLOYEE');assert.equal(person.position,'책임');assert.equal(person.reportCount,1);assert.equal(person.days.find(day=>day.date==='2026-10-16').items[0].projectCode,structure.code);assert.ok(!report.teams.find(team=>team.department==='마감팀').employees.some(person=>person.id===fresh.id));assertOriginal();return {department:team.department,employeeId:person.id,reportCount:person.reportCount};
 });
 await check('퇴사 버전: 선택·활성 그룹·무기록 주간 명부 제외, 기존 담당 ID·표시명·일지 원문 보존',async()=>{
  const logBody=db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('qa-lifecycle-daily').body,beforePeople=structuredClone(projects.getState().personnel),beforeProjects=structuredClone(projects.getState().projects);putUser({...people().find(person=>person.id===old.id),active:false});putUser({...people().find(person=>person.id===fresh.id),active:false});await pulse();
  for(const id of [old.id,fresh.id]){assert.equal(people().find(person=>person.id===id).active,false);assert.ok(!viet.vietIndividuals(people()).some(person=>person.id===id));assert.ok(!viet.resolveVietTeams(people()).some(team=>team.members.some(person=>person.id===id)));assert.deepEqual(projects.getState().personnel.find(person=>person.id===id),beforePeople.find(person=>person.id===id),'Historical personnel labels must remain exact');}assert.deepEqual(projects.getState().projects,beforeProjects);
  assert.equal(option(renderModal(project.id),old.id),undefined);assert.equal(option(renderModal(structure.id),fresh.id),undefined);const report=await buildWeeklyReport({DB},db.prepare('SELECT * FROM studio_users WHERE id=?').get(actor.id),'2026-10-12',new Date('2026-10-16T03:00:00Z'));assert.ok(!report.teams.flatMap(team=>team.employees).some(person=>person.id===old.id));const retained=report.teams.flatMap(team=>team.employees).find(person=>person.id===fresh.id);assert.equal(retained.reportCount,1,'Retirement must not erase a recorded weekly history');assert.equal(db.prepare('SELECT body FROM studio_worklogs WHERE id=?').get('qa-lifecycle-daily').body,logBody);assertOriginal();return {inactiveSelections:0,historicalWorklogPreserved:true,retainedRecordedEmployee:retained.id};
 });
}finally{
 stop?.();await server.close();db.close();Object.assign(globalThis,saved);
}
const output=process.argv.find(value=>value.startsWith('--output='))?.slice(9);
if(output)writeFileSync(output,JSON.stringify({kind:'ACTUAL_STUDIO_STORE_DIRECTORY_LIFECYCLE_SYNTHETIC_SQLITE',externalRequests:0,operatingWrites:0,transportWrites:calls.filter(call=>call.method!=='GET').length,results,limits:['실제 Zustand 동기화 store·프로젝트 배정 UI SSR·배정/할일/일지 함수와 SQLite 주간보고 함수를 사용한다. 합성 directory HTTP와 메모리 SQLite이며 운영 로그인·다른 PC·계정 생성은 수행하지 않는다.']},null,2)+'\n');
if(results.some(result=>result.status!=='PASS'))process.exitCode=1;
