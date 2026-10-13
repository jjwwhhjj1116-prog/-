import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {database} from './d1.mjs';
import {passwordHash} from '../../functions/lib/collaboration.ts';

const {DB,db}=database(),results=[],cookies=new Map(),token='synthetic-intake-collector-at-least-32-characters';
const before=process.argv.includes('--before');
const server=await createServer({plugins:before?[{name:'intake-original-server',enforce:'pre',load(id){for(const path of ['functions/lib/collaboration.ts','functions/api/[[route]].ts'])if(id.replaceAll('\\','/').endsWith('/'+path))return readFileSync(new URL('../../private-provisioning/qa-intake-server100-20261013/originals/'+path,import.meta.url),'utf8');}}]:[],server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const teams=['마감팀','구조팀','토목&조경팀'];
const user={id:'chief',name:'합성 실장',email:'chief@example.invalid',department:'마감팀',position:'실장',role:'MEMBER'};
const employee={...user,id:'employee',name:'합성 직원',email:'employee@example.invalid',position:'선임'};
const rows=()=>db.prepare('SELECT * FROM studio_projects ORDER BY id').all();
const projectVersion=()=>db.prepare("SELECT revision FROM studio_sync_versions WHERE key='projects'").get().revision;
const item=(no,scope=teams)=>({id:`intake_${no}`,no,code:`TK-2026${String(no).padStart(3,'0')}`,name:'합성 자동 등록 '+no,client:'합성 발주처',scopeVerified:true,targetDepartments:scope,startDate:'2026-10-13',endDate:'2026-10-20',rawTitle:'합성 원 제목',area:'100평',contacts:['합성 연락처'],notes:'수주 원문',request:'요청',pmByDepartment:{마감팀:'자동 배정 금지'}});
const storeIntake=(record,stamp='2026-10-13T00:00:00.000Z')=>db.prepare('INSERT INTO studio_intake_documents VALUES (?,?,?,?)').run(record.id,record.no,JSON.stringify(record),stamp);
const manual=(record,department,id)=>({id,code:record.code,name:'원본 일정명',client:'원본 발주처',department,startDate:'2026-09-01',endDate:'2026-10-31',pmId:'chief',progress:73,status:'진행중',roles:{PM:{personId:'chief',startDate:'2026-09-01',endDate:'2026-10-31'}},subTasks:{PM:{roleName:'PM',personId:'chief',personIds:['chief'],startDate:'2026-09-01',endDate:'2026-10-31',status:'진행중',memo:'원본 PM 메모',progress:40}},revisions:[{id:'keep-revision',round:2}],scheduleExtensions:[{id:'keep-extension',status:'PENDING'}]});
const insertProject=(project,revision=7)=>db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run(project.id,JSON.stringify(project),revision,'original-time','original-actor');
let onRequest;
async function request(actor,path,method='GET',body,settings={}){
 const headers={...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{}),...(body?{'Content-Type':'application/json'}:{})};
 if(path==='intake/sync')headers.Authorization='Bearer '+(settings.token??token);
 const response=await onRequest({request:new Request('https://example.invalid/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env:{DB,INTAKE_SYNC_TOKEN:token,...settings.env}});
 return {status:response.status,data:await response.json(),headers:response.headers};
}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);process.exitCode=1;}}
try{
 ({onRequest}=await server.ssrLoadModule('../functions/api/[[route]].ts'));
 const hash=await passwordHash('synthetic-password','synthetic-salt');
 for(const profile of [user,employee]){
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(profile.id,profile.id,profile.email,profile.name,profile.department,profile.position,JSON.stringify(profile),'synthetic-salt',hash);
  const response=await request(profile.id,'collaboration/login','POST',{login:profile.id,password:'synthetic-password'});assert.equal(response.status,200);cookies.set(profile.id,response.headers.get('set-cookie').split(';')[0]);
 }
 await check('인증되지 않은 수주·일정 읽기와 수집 쓰기는 중앙 자동 등록을 실행하지 않음',async()=>{
  storeIntake(item(901));
  assert.equal((await request('none','collaboration/changes')).status,401);
  assert.equal((await request('none','collaboration/projects')).status,401);
  assert.equal((await request('none','intake/sync','POST',{items:[item(902)]},{token:'wrong'})).status,401);
  assert.equal(rows().length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM studio_intake_documents').get().n,1);
 });
 await check('실제 수집 API는 원수주와 체크된 세 부서의 빈 PM·공종 일정을 같은 저장에서 자동 등록',async()=>{
  const record=item(902),response=await request('none','intake/sync','POST',{items:[record]});assert.equal(response.status,200);
  const generated=rows().map(row=>JSON.parse(row.body)).filter(project=>project.code===record.code);assert.equal(generated.length,3);assert.deepEqual(generated.map(project=>project.department).sort(),[...teams].sort());
  for(const project of generated){assert.equal(project.pmId,'');assert.deepEqual(project.subTasks,{});assert.deepEqual(project.roles,{});assert.equal(project.progress,0);assert.equal(project.status,'착수예정');assert.equal(project.name,record.name);assert.equal(project.startDate,record.startDate);assert.equal(project.endDate,record.endDate);assert.deepEqual(project.contacts,record.contacts);assert.equal(project.request,record.request);}
  assert.equal(db.prepare('SELECT document_no FROM studio_intake_documents WHERE id=?').get(record.id).document_no,record.no);
 });
 await check('동일 수주 재수집은 배정 일정 원문·버전·저장자·프로젝트 버전을 변경하지 않음',async()=>{
  const before=rows(),version=projectVersion();assert.equal((await request('none','intake/sync','POST',{items:[{...item(902),name:'수주에서 바뀐 이름',startDate:'2026-11-01',pmByDepartment:{마감팀:'다른 사람'}}]})).status,200);
  assert.deepEqual(rows(),before);assert.equal(projectVersion(),version);
 });
 await check('직접 SQL fallback·과거 누락은 직원의 changes 조회 직전에 중앙 등록되고 두 PC 동일 목록으로 조회',async()=>{
  const before=projectVersion(),first=await request('employee','collaboration/changes');assert.equal(first.status,200);assert.equal(first.data.versions.projects,before+3);assert.equal(typeof first.data.versions.intake,'string');
  const one=await request('employee','collaboration/projects'),two=await request('chief','collaboration/projects');assert.deepEqual(one.data,two.data);assert.equal(one.data.projects.filter(row=>row.project.code===item(901).code).length,3);
  const snapshot=rows(),version=projectVersion();await request('employee','collaboration/changes');await request('employee','collaboration/projects');assert.deepEqual(rows(),snapshot);assert.equal(projectVersion(),version);
 });
 await check('다른 ID의 기존 배정·실적·결재 연결은 보존하고 빠진 체크 부서만 추가',async()=>{
  const record=item(903),existing=manual(record,'마감팀','manual-different-id');insertProject(existing);const original=db.prepare('SELECT * FROM studio_projects WHERE id=?').get(existing.id);
  storeIntake(record);const response=await request('employee','collaboration/projects');assert.equal(response.status,200);assert.equal(response.data.projects.filter(row=>row.project.code===record.code).length,3);assert.deepEqual(db.prepare('SELECT * FROM studio_projects WHERE id=?').get(existing.id),original);
  assert.equal(response.data.projects.find(row=>row.project.code===record.code&&row.project.department==='마감팀').project.id,existing.id);
 });
 await check('보관된 팀 일정은 자동 복원·중복 생성 없이 미배정 목록에서 보관 확인 사유 제공',async()=>{
  const record=item(904),archived=manual(record,'구조팀','archived-original');insertProject(archived);db.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').run(archived.id,'original-archive-time','original-actor');storeIntake(record);
  const original=db.prepare('SELECT * FROM studio_projects WHERE id=?').get(archived.id),response=await request('employee','collaboration/projects');assert.equal(response.status,200);assert.equal(response.data.projects.filter(row=>row.project.code===record.code).length,2);
  assert.deepEqual(response.data.pendingIntake.find(entry=>entry.code===record.code).missingDepartments,['구조팀']);assert.equal(response.data.pendingIntake.find(entry=>entry.code===record.code).reason,'archived');assert.deepEqual(db.prepare('SELECT * FROM studio_projects WHERE id=?').get(archived.id),original);assert.equal(rows().filter(row=>JSON.parse(row.body).code===record.code).length,3);
 });
 await check('담당 부서 미확정 수주는 신규·미배정 목록에 항상 표시하고 임의 팀·PM을 생성하지 않음',async()=>{
  const record=item(905,[]);assert.equal((await request('none','intake/sync','POST',{items:[record]})).status,200);const one=await request('employee','collaboration/projects');assert.equal(one.data.projects.some(row=>row.project.code===record.code),false);
  const pending=one.data.pendingIntake.find(entry=>entry.code===record.code);assert.ok(pending);assert.equal(pending.reason,'department-unconfirmed');assert.deepEqual(pending.missingDepartments,[]);
  const before=(await request('employee','collaboration/changes')).data.versions.intake;db.prepare('UPDATE studio_intake_documents SET data=?,updated_at=? WHERE id=?').run(JSON.stringify({...record,name:'수주명 수정'}),'2999-10-13T00:00:00.000Z',record.id);assert.notEqual((await request('employee','collaboration/changes')).data.versions.intake,before);
  const chosen=manual(record,'마감팀','manager-chosen');assert.equal((await request('chief','collaboration/projects','POST',{project:chosen})).status,200);const two=await request('employee','collaboration/projects');assert.equal(two.data.pendingIntake.some(entry=>entry.code===record.code),false);assert.equal(two.data.projects.find(row=>row.project.id===chosen.id).project.department,'마감팀');
 });
 await check('새로 확인된 작업 범위만 추가하고 잘못된·누락된 날짜는 미확정으로 유지',async()=>{
  const record={...item(906,['마감팀']),startDate:'2026-02-30',endDate:'2026-02-31'};assert.equal((await request('none','intake/sync','POST',{items:[record]})).status,200);let response=await request('employee','collaboration/projects');const first=response.data.projects.find(row=>row.project.code===record.code).project;assert.equal(first.startDate,'');assert.equal(first.endDate,'');const original=rows().find(row=>row.id===first.id);
  assert.equal((await request('none','intake/sync','POST',{items:[{...record,targetDepartments:teams,startDate:'2026-10-13',endDate:'2026-10-20'}]})).status,200);response=await request('employee','collaboration/projects');assert.equal(response.data.projects.filter(row=>row.project.code===record.code).length,3);assert.deepEqual(rows().find(row=>row.id===first.id),original);
 });
 await check('확인되지 않은 작업 범위는 기존 유효 수주 코드라도 자동 부서 배정하지 않음',async()=>{
  const record={...item(907),scopeVerified:false};storeIntake(record);const response=await request('employee','collaboration/projects');assert.equal(response.data.projects.some(row=>row.project.code===record.code),false);assert.equal(response.data.pendingIntake.find(entry=>entry.code===record.code).reason,'department-unconfirmed');
 });
 await check('오래 열린 브라우저의 신규 ID 등록은 수주 코드·부서가 같은 중앙 일정의 중복을 차단',async()=>{
  const record=item(902),before=rows();const response=await request('chief','collaboration/projects','POST',{project:manual(record,'마감팀','stale-new-id')});assert.equal(response.status,409);assert.equal(response.data.current.code,record.code);assert.deepEqual(rows(),before);
  assert.equal((await request('employee','collaboration/projects','POST',{project:manual(record,'마감팀','staff-new-id')})).status,403);
 });
 await check('수주 생성 경합 중 실제 INSERT 시점에서도 중복 ID를 만들지 않고 기존 중앙 일정 반환',async()=>{
  const record=item(908,['마감팀']);storeIntake(record);const originalPrepare=DB.prepare;let collided=false;
  DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.startsWith('INSERT OR IGNORE INTO studio_projects SELECT')){const run=statement.run;statement.run=async()=>{if(!collided){collided=true;insertProject(manual(record,'마감팀','concurrent-central'));}return run();};}return statement;};
  try{const response=await request('chief','collaboration/projects','POST',{project:manual(record,'마감팀','concurrent-new-id')});assert.equal(response.status,409);assert.equal(response.data.current.id,'concurrent-central');assert.equal(rows().filter(row=>JSON.parse(row.body).code===record.code).length,1);}finally{DB.prepare=originalPrepare;}
 });
 await check('자동 일정 저장 실패 시 수주와 모든 부서 일정·수집 성공 이력이 원자적으로 되돌아감',async()=>{
  const record=item(909),before=rows(),intakes=db.prepare('SELECT * FROM studio_intake_documents ORDER BY id').all(),sync=db.prepare('SELECT * FROM studio_intake_sync').all(),version=projectVersion(),originalBatch=DB.batch;
  DB.batch=statements=>originalBatch([...statements.slice(0,2),DB.prepare('INSERT INTO studio_write_assertions SELECT 0'),...statements.slice(2)]);
  try{assert.equal((await request('none','intake/sync','POST',{items:[record]})).status,500);}finally{DB.batch=originalBatch;}
  assert.deepEqual(rows(),before);assert.deepEqual(db.prepare('SELECT * FROM studio_intake_documents ORDER BY id').all(),intakes);assert.deepEqual(db.prepare('SELECT * FROM studio_intake_sync').all(),sync);assert.equal(projectVersion(),version);
 });
 await check('오류·인증·잘못된 수집 자료는 기존 자동 일정과 미배정 자료를 지우지 않음',async()=>{
  const before=rows();assert.equal((await request('none','intake/sync','POST',{lastError:'합성 수집 연결 오류'})).status,200);
  for(const invalid of [{...item(910),scopeVerified:false},{...item(910),targetDepartments:['개발 TF']},{...item(910),code:'invalid'}])assert.equal((await request('none','intake/sync','POST',{items:[invalid]})).status,400);
  assert.deepEqual(rows(),before);assert.ok((await request('employee','collaboration/projects')).data.pendingIntake.some(entry=>entry.code===item(907).code));
 });
}finally{
 await server.close();db.close();mkdirSync('../private-provisioning/qa-intake-server100-20261013',{recursive:true});writeFileSync(`../private-provisioning/qa-intake-server100-20261013/${before?'before':'result'}.json`,JSON.stringify({kind:'ACTUAL_SQLITE_WORKER_LOGIN_SYNC_RECONCILIATION',before,operatingWrites:0,externalRequests:0,PASS:results.filter(result=>result.status==='PASS').length,FAIL:results.filter(result=>result.status==='FAIL').length,results},null,2));
}
