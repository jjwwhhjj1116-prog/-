import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash,tokenHash} from '../../functions/lib/collaboration.ts';
import {VIET_ASSIGNMENT_GROUPS} from '../src/utils/vietPersonnel.ts';

const results=[],output=process.argv[2]||'test-results/employee-lifecycle143.json';
const secret=()=>crypto.randomUUID().replaceAll('-','');
async function fixture(){
 const {db,DB}=database(),cookies=new Map(),passwords=new Map();
 for(const record of [{id:'qa-admin',name:'합성 관리자',email:'yjw@con-cost.com',department:'개발 TF',position:'실장',company:'컨코스트'},{id:'qa-member',name:'합성 국내 직원',email:'member@example.invalid',department:'마감팀',position:'프로',company:'컨코스트'},{id:'qa-vn',name:'NGUYEN QA',email:'vn@example.invalid',department:'구조팀',position:'프로',company:'VIETQS',vietTeamId:'vt_horiz_apartment'}]){
  const profile={...record,idPrefix:record.id,no:9000+passwords.size,originalDept:record.department,phone:'',extra:'원본 metadata'},salt=secret(),password=secret();passwords.set(record.id,password);
  db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(record.id,record.id,record.email,record.name,record.department,record.position,JSON.stringify(profile),salt,await passwordHash(password,salt));
  for(let n=0;n<2;n++){const token=secret();db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),record.id,Date.now()+3600000);if(!n)cookies.set(record.id,'studio_session='+token);}
 }
 const worklog={id:'qa-signed',date:'2026-10-14',userId:'qa-member',userName:'원본 이름',department:'마감팀',items:[{id:'source-item',todayTask:'서명된 원본 업무',progress:42}],approvalStatus:'APPROVED_FINAL',authorSignature:{signed:true,name:'원본 이름'},overallNotes:'보존'};
 db.prepare('INSERT INTO studio_worklogs (id,user_id,day,department,body) VALUES (?,?,?,?,?)').run(worklog.id,worklog.userId,worklog.date,worklog.department,JSON.stringify(worklog));
 db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run('qa-project',JSON.stringify({id:'qa-project',name:'기존 프로젝트',pmId:'qa-member',subTasks:{PM:{personId:'qa-member',personIds:['qa-member']}},scheduleExtensions:[{id:'old-approval',userId:'qa-member',type:'OVERTIME',status:'APPROVED'}]}),3,'2026-10-14','qa-admin');
 db.prepare('INSERT INTO studio_notifications VALUES (?,?,?,?,?,NULL)').run('qa-notice','qa-member','worklog:qa-signed','기존 승인 알림','2026-10-14');
 const request=async(actor,path='admin/users',body,method=body?'POST':'GET')=>{const response=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+path,{method,headers:{...(actor?{Cookie:cookies.get(actor)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB},async()=>{throw Error('외부 경로 금지');});return {status:response.status,data:await response.json(),response};};
 const user=id=>db.prepare('SELECT * FROM studio_users WHERE id=?').get(id),sessions=id=>db.prepare('SELECT count(*) n FROM studio_sessions WHERE user_id=?').get(id).n;
 const snapshot=()=>({users:db.prepare('SELECT * FROM studio_users ORDER BY id').all(),sessions:db.prepare('SELECT * FROM studio_sessions ORDER BY token_hash').all(),version:db.prepare("SELECT revision FROM studio_sync_versions WHERE key='directory'").get().revision});
 const history=()=>({logs:db.prepare('SELECT * FROM studio_worklogs ORDER BY id').all(),projects:db.prepare('SELECT * FROM studio_projects ORDER BY id').all(),notifications:db.prepare('SELECT * FROM studio_notifications ORDER BY id').all()});
 return {db,DB,user,sessions,request,snapshot,history,passwords};
}
const status=(result,expected)=>{assert.equal(result.status,expected);return result;};
async function check(name,fn){const f=await fixture();try{await fn(f);results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.error('FAIL',name,error.message);}finally{f.db.close();}}
await check('신규 VN: 미지정·잘못된부서·교차그룹을 거부하고 계정/세션/명부버전 불변',async f=>{
 const before=f.snapshot(),record={idPrefix:'qa-new',name:'가상 입사자',email:'new@example.invalid',company:'VIETQS',department:'마감팀',position:'프로'};
 for(const patch of [{},{vietTeamId:''},{vietTeamId:null},{vietTeamId:'unknown'},{vietTeamId:'vt_horiz_apartment'},{department:'개발 TF',vietTeamId:'vt_in1'}])status(await f.request('qa-admin','admin/users',{action:'create',record:{...record,...patch},password:secret()}),400);
 assert.deepEqual(f.snapshot(),before);
});
await check('VN 11개 정식그룹 등록: 부서·개인ID·그룹을 명부에 보존하고 directory버전 증가',async f=>{
 const before=f.snapshot().version;
 for(const group of VIET_ASSIGNMENT_GROUPS){const record={idPrefix:'qa-new-'+group.id,name:'가상 입사자 '+group.name,email:group.id+'@example.invalid',company:'VIETQS',department:group.department,position:'프로',vietTeamId:group.id,role:'ADMIN'};status(await f.request('qa-admin','admin/users',{action:'create',record,password:secret()}),200);const row=f.db.prepare('SELECT * FROM studio_users WHERE login=?').get(record.idPrefix),person=JSON.parse(row.profile);assert.equal(person.id,row.id);assert.equal(person.vietTeamId,group.id);assert.equal(person.department,group.department);assert.equal(person.role,'MEMBER');assert.equal(row.active,1);}
 const directory=status(await f.request('qa-admin','directory'),200).data.users;assert.equal(directory.filter(person=>person.idPrefix.startsWith('qa-new-')&&person.active).length,11);assert.equal(f.snapshot().version,before+11);
});
await check('부서이동은 맞는 VN그룹 필수, 유효이동은 같은ID·기존이력 보존',async f=>{
 const before=f.snapshot(),history=f.history();for(const record of [{department:'마감팀'},{department:'마감팀',vietTeamId:'vt_horiz_apartment'},{vietTeamId:''},{vietTeamId:null}])status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record}),400);assert.deepEqual(f.snapshot(),before);
 status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record:{department:'마감팀',vietTeamId:'vt_in1',position:'팀장'}}),200);const person=JSON.parse(f.user('qa-vn').profile);assert.equal(person.id,'qa-vn');assert.equal(person.department,'마감팀');assert.equal(person.vietTeamId,'vt_in1');assert.equal(person.position,'팀장');assert.equal(person.extra,'원본 metadata');assert.equal(f.sessions('qa-vn'),0);assert.deepEqual(f.history(),history);
});
await check('기존 VN그룹누락: 무관한 직급수정/비번리셋은 허용, 새배치 누락만 거부',async f=>{
 const person=JSON.parse(f.user('qa-vn').profile);delete person.vietTeamId;f.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(person),'qa-vn');
 status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record:{position:'책임'}}),200);assert.equal(JSON.parse(f.user('qa-vn').profile).vietTeamId,undefined);
 status(await f.request('qa-admin','admin/users',{action:'reset',id:'qa-vn',resetMode:'temporary',password:secret()}),200);
 const before=f.snapshot();status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record:{department:'마감팀'}}),400);assert.deepEqual(f.snapshot(),before);
});
await check('VN에서 한국 전환: 기존 VN그룹을 제거하고 같은ID·직급·원문 유지',async f=>{
 const history=f.history();status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record:{company:'컨코스트',department:'구조팀',position:'수석'}}),200);const person=JSON.parse(f.user('qa-vn').profile);assert.equal(person.company,'컨코스트');assert.equal(Object.hasOwn(person,'vietTeamId'),false);assert.equal(person.id,'qa-vn');assert.equal(person.extra,'원본 metadata');assert.deepEqual(f.history(),history);
});
await check('퇴사: active0·대상세션폐기·로그인거부, 원본일정/서명일지/야근승인/알림 보존',async f=>{
 const before=f.user('qa-member'),history=f.history(),version=f.snapshot().version;status(await f.request('qa-admin','admin/users',{action:'deactivate',id:'qa-member'}),200);assert.deepEqual({...f.user('qa-member'),active:1},{...before});assert.equal(f.user('qa-member').active,0);assert.equal(f.sessions('qa-member'),0);assert.equal(f.sessions('qa-admin'),2);assert.equal(f.snapshot().version,version+1);assert.deepEqual(f.history(),history);status(await f.request('qa-member','session'),401);status(await f.request(null,'login',{login:'qa-member',password:f.passwords.get('qa-member')}),401);const directory=status(await f.request('qa-admin','directory'),200).data.users;assert.equal(directory.find(person=>person.id==='qa-member').active,false);
});
await check('재입사: 같은ID·기존암호해시·이력 복구, 폐기한세션은 복원하지않고 새로그인만 허용',async f=>{
 status(await f.request('qa-admin','admin/users',{action:'deactivate',id:'qa-member'}),200);const before=f.user('qa-member'),history=f.history();status(await f.request('qa-admin','admin/users',{action:'activate',id:'qa-member'}),200);assert.deepEqual({...f.user('qa-member'),active:0},{...before});assert.equal(f.sessions('qa-member'),0);assert.deepEqual(f.history(),history);status(await f.request('qa-member','session'),401);status(await f.request(null,'login',{login:'qa-member',password:f.passwords.get('qa-member')}),200);
});
await check('VN 재입사: 누락배치면 거부, 퇴사상태 정보수정 후 같은ID로 활성화',async f=>{
 const person=JSON.parse(f.user('qa-vn').profile);delete person.vietTeamId;f.db.prepare('UPDATE studio_users SET active=0,profile=? WHERE id=?').run(JSON.stringify(person),'qa-vn');const before=f.snapshot();const denied=status(await f.request('qa-admin','admin/users',{action:'activate',id:'qa-vn'}),400);assert.match(denied.data.error,/직원정보 수정/);assert.deepEqual(f.snapshot(),before);status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-vn',record:{vietTeamId:'vt_horiz_apartment'}}),200);assert.equal(f.user('qa-vn').active,0);status(await f.request('qa-admin','admin/users',{action:'activate',id:'qa-vn'}),200);assert.equal(f.user('qa-vn').active,1);assert.equal(f.sessions('qa-vn'),0);
});
await check('익명·일반직원의 직원변경/퇴사/재입사는 거부, 관리자본인 퇴사도 거부',async f=>{
 const before=f.snapshot();for(const actor of [null,'qa-member'])for(const action of ['create','update','deactivate','activate'])status(await f.request(actor,'admin/users',{action,id:'qa-vn',record:{position:'실장'},password:secret()}),actor?403:401);status(await f.request('qa-admin','admin/users',{action:'deactivate',id:'qa-admin'}),409);assert.deepEqual(f.snapshot(),before);
});
await check('퇴사/재입사 batch 실패: active·세션·directory버전 전체rollback',async f=>{
 const batch=f.DB.batch;f.DB.batch=statements=>batch([...statements,f.DB.prepare('INSERT INTO studio_write_assertions VALUES (0)')]);for(const action of ['deactivate','activate']){const before=f.snapshot();status(await f.request('qa-admin','admin/users',{action,id:'qa-member'}),503);assert.deepEqual(f.snapshot(),before);}
});
await check('본인 직원정보수정은 세션폐기 ack·쿠키만료를 알려 후속명부401 방지',async f=>{
 const result=status(await f.request('qa-admin','admin/users',{action:'update',id:'qa-admin',record:{position:'본부장'}}),200);assert.equal(result.data.sessionRevoked,true);assert.match(result.response.headers.get('set-cookie'),/Max-Age=0/);assert.equal(f.sessions('qa-admin'),0);
});
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_API_MEMORY_SQLITE_SYNTHETIC_EMPLOYEES',externalRequests:0,operationalEmployeeWrites:0,passed:results.filter(row=>row.status==='PASS').length,failed:results.filter(row=>row.status==='FAIL').length,results},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
