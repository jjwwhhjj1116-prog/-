import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {database} from './d1.mjs';
import {VIET_ASSIGNMENT_GROUPS} from '../src/utils/vietPersonnel.ts';

const vnBefore=process.argv.includes('--vn-before');
const before=process.argv.includes('--before');
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'test-results/account-reset.json';
const source=new URL('../../'+(vnBefore?'private-provisioning/qa-vn-personal-teams-20261008/api-originals/':before?'private-provisioning/original-before-account-reset-20261006/':'')+'functions/lib/collaboration.ts',import.meta.url);
if(before||vnBefore)registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);return url===new URL('../../functions/lib/collaboration.ts',import.meta.url).href?{...loaded,source:readFileSync(source,'utf8')}:loaded;}});
const {handleCollaboration,passwordHash,tokenHash}=await import('../../functions/lib/collaboration.ts');
const results=[],secret=()=>crypto.randomUUID().replaceAll('-',''),digits=()=>String(crypto.getRandomValues(new Uint16Array(1))[0]%10000).padStart(4,'0');
async function fixture(){
 const {db,DB}=database(),cookies=new Map(),credentials=new Map(),profiles=[{id:'qa-admin',name:'합성 관리자',email:'yjw@con-cost.com',department:'관리',position:'관리자'},{id:'qa-member',name:'합성 회원',email:'member@example.invalid',department:'마감팀',position:'프로'},{id:'qa-other',name:'다른 합성 회원',email:'other@example.invalid',department:'구조팀',position:'프로'}];
 for(const person of profiles){const profile={...person,idPrefix:person.id,phone:'010-0000-0000',extension:digits()},password=secret(),salt=secret();credentials.set(person.id,password);db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(person.id,person.id,person.email,person.name,person.department,person.position,JSON.stringify(profile),salt,await passwordHash(password,salt));for(let i=0;i<2;i++){const token=secret();db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),person.id,Date.now()+3600000);if(i===0)cookies.set(person.id,'studio_session='+token);}}
 async function request(actor,path,method='GET',body){const response=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+path,{method,headers:{...(actor?{Cookie:cookies.get(actor)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB},async()=>{throw Error('Archive path is outside this test');});return {status:response.status,data:await response.json(),response};}
 const reset=(actor='qa-admin',body={})=>request(actor,'admin/users','POST',{action:'reset',id:'qa-member',...body});
 const user=id=>db.prepare('SELECT * FROM studio_users WHERE id=?').get(id);
 const sessions=id=>db.prepare('SELECT count(*) n FROM studio_sessions WHERE user_id=?').get(id).n;
 const matches=async(id,password)=>{const row=user(id);return await passwordHash(password,row.salt)===row.password_hash;};
 return {db,DB,request,reset,user,sessions,matches,credentials};
}
function status(result,expected){assert.equal(result.status,expected,'API 상태 대조');return result;}
function safeAck(result){assert.ok(Object.keys(result.data).every(key=>['ok','sessionRevoked'].includes(key)),'암호 값 없이 처리 결과만 반환');assert.equal(result.data.ok,true);}
const snapshot=f=>({users:f.db.prepare('SELECT * FROM studio_users ORDER BY id').all(),sessions:f.db.prepare('SELECT * FROM studio_sessions ORDER BY token_hash').all(),versions:f.db.prepare('SELECT * FROM studio_sync_versions ORDER BY key').all()});
function vietProfile(f,id='qa-other'){
 const profile={...JSON.parse(f.user(id).profile),company:'VIETQS',employeeNo:'0094',vietTeamId:'vt_horiz_apartment'};
 f.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(profile),id);return profile;
}
const vietRecord={idPrefix:'qa-viet-new',name:'가상 VN 회원',email:'viet-new@example.invalid',department:'구조팀',position:'프로',company:'VIETQS',employeeNo:'0007',vietTeamId:'vt_horiz_apartment',role:'ADMIN'};
async function check(name,fn){const f=await fixture();try{await fn(f);results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){let reason=error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:error.name;if(typeof error.actual==='number'&&typeof error.expected==='number')reason+=` (actual=${error.actual}, expected=${error.expected})`;results.push({name,status:'FAIL',reason});console.log('FAIL',name,reason);}finally{f.db.close();}}
await check('내선 모드: 확인한4자리·앞자리0 보존, profile/전화번호 유지·PBKDF2 저장·대상세션만 전체폐기',async f=>{
 const extension='0'+digits().slice(1),previous=f.user('qa-member'),profile=JSON.parse(previous.profile),result=status(await f.reset('qa-admin',{resetMode:'extension',password:extension,extension}),200);safeAck(result);assert.equal(result.data.sessionRevoked,false);assert.equal(result.response.headers.get('set-cookie'),null);const saved=JSON.parse(f.user('qa-member').profile);assert.ok(saved.extension===extension,'정확한 내선 저장');delete saved.extension;delete profile.extension;assert.deepEqual(saved,profile);assert.ok(await f.matches('qa-member',extension),'새 값의 PBKDF2 일치');assert.ok(!await f.matches('qa-member',f.credentials.get('qa-member')),'이전 암호 폐기');assert.equal(f.sessions('qa-member'),0);assert.equal(f.sessions('qa-admin'),2);assert.equal(f.sessions('qa-other'),2);assert.equal((await f.request('qa-member','session')).status,401);assert.equal((await f.request('qa-admin','session')).status,200);status(await f.request(null,'login','POST',{login:'qa-member',password:extension}),200);
});
await check('내선 미등록은 전화번호에서 추측하지 않으며 정확한ASCII4자리·일치metadata만 허용',async f=>{
 const original=JSON.parse(f.user('qa-member').profile);delete original.extension;f.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(original),'qa-member');const beforeUser=f.user('qa-member');
 for(const password of [undefined,'',digits().slice(1),digits()+digits()[0],'abcd','１２３４',' '+digits(),digits()+' ',1234,'010-0000-0000'])status(await f.reset('qa-admin',{resetMode:'extension',password}),400);
 const password=digits();status(await f.reset('qa-admin',{resetMode:'extension',password,extension:password+'x'}),400);assert.deepEqual(f.user('qa-member'),beforeUser);assert.equal(f.sessions('qa-member'),2);
});
await check('임시 모드:8자이상 발급값의해시만 저장·profile기존내선 유지·새로그인 성공·암호응답 없음',async f=>{
 const password=secret(),profile=f.user('qa-member').profile;safeAck(status(await f.reset('qa-admin',{resetMode:'temporary',password}),200));assert.ok(await f.matches('qa-member',password),'임시 암호 해시 일치');assert.equal(f.user('qa-member').profile,profile);assert.equal(f.sessions('qa-member'),0);status(await f.request(null,'login','POST',{login:'qa-member',password:f.credentials.get('qa-member')}),401);status(await f.request(null,'login','POST',{login:'qa-member',password}),200);
});
await check('mode미지정 기존8자reset 역호환, 기본값·임시모드4자리 및초과길이는 계속거부',async f=>{
 const password=secret(),profile=f.user('qa-member').profile;safeAck(status(await f.reset('qa-admin',{password}),200));assert.ok(await f.matches('qa-member',password),'구형 요청의 해시 일치');assert.equal(f.user('qa-member').profile,profile);const beforeUser=f.user('qa-member');for(const resetMode of [undefined,'temporary'])for(const value of [digits(),'x'.repeat(257)])status(await f.reset('qa-admin',{resetMode,password:value}),400);assert.deepEqual(f.user('qa-member'),beforeUser);
});
await check('개인 비밀번호변경·신규회원 생성은 기존8자규칙 유지',async f=>{
 const beforeUser=f.user('qa-member');status(await f.request('qa-member','password','POST',{oldPassword:f.credentials.get('qa-member'),newPassword:digits()}),400);assert.deepEqual(f.user('qa-member'),beforeUser);status(await f.request('qa-admin','admin/users','POST',{action:'create',record:{idPrefix:'qa-new',name:'합성 신규',email:'new@example.invalid',department:'마감팀',position:'프로'},password:digits()}),400);assert.equal(f.db.prepare('SELECT count(*) n FROM studio_users').get().n,3);
});
await check('익명401·일반회원403·없는대상404: 관리자기존경로만 허용하며계정/세션 불변',async f=>{
 const beforeUser=f.user('qa-member'),password=digits();status(await f.reset(null,{resetMode:'extension',password}),401);status(await f.reset('qa-member',{resetMode:'extension',password}),403);status(await f.reset('qa-admin',{id:'qa-missing',resetMode:'extension',password}),404);assert.deepEqual(f.user('qa-member'),beforeUser);assert.equal(f.sessions('qa-member'),2);assert.equal(f.sessions('qa-admin'),2);
});
await check('자기내선reset 성공은sessionRevoked=true와쿠키만료, 본인전체세션폐기·타회원세션 유지',async f=>{
 const password=digits(),result=status(await f.reset('qa-admin',{id:'qa-admin',resetMode:'extension',password,extension:password}),200);safeAck(result);assert.equal(result.data.sessionRevoked,true);assert.match(result.response.headers.get('set-cookie')||'',/^studio_session=;.*Max-Age=0/);assert.equal(f.sessions('qa-admin'),0);assert.equal(f.sessions('qa-member'),2);assert.equal((await f.request('qa-admin','directory')).status,401);assert.ok(await f.matches('qa-admin',password),'자기 초기화 해시 일치');
});
await check('자기임시reset도성공ack/쿠키만료: directory401보다앞서정상처리 결과를 반환',async f=>{
 const result=status(await f.reset('qa-admin',{id:'qa-admin',resetMode:'temporary',password:secret()}),200);safeAck(result);assert.equal(result.data.sessionRevoked,true);assert.match(result.response.headers.get('set-cookie')||'',/Max-Age=0/);assert.equal(f.sessions('qa-admin'),0);assert.equal((await f.request('qa-admin','directory')).status,401);
});
await check('알수없는resetMode는400이며기존계정/암호/세션을변경하지않음',async f=>{
 const beforeUser=f.user('qa-member');status(await f.reset('qa-admin',{resetMode:'unknown-mode',password:secret()}),400);assert.deepEqual(f.user('qa-member'),beforeUser);assert.equal(f.sessions('qa-member'),2);
});
await check('reset batch후반실패는내선·암호해시·세션폐기·directory버전까지원자적rollback',async f=>{
 const beforeUser=f.user('qa-member'),beforeVersion=f.db.prepare("SELECT revision FROM studio_sync_versions WHERE key='directory'").get().revision,batch=f.DB.batch;f.DB.batch=statements=>batch([...statements,f.DB.prepare('INSERT INTO studio_write_assertions VALUES (0)')]);status(await f.reset('qa-admin',{resetMode:'extension',password:digits()}),503);assert.deepEqual(f.user('qa-member'),beforeUser);assert.equal(f.sessions('qa-member'),2);assert.equal(f.db.prepare("SELECT revision FROM studio_sync_versions WHERE key='directory'").get().revision,beforeVersion);
});
await check('동시회원정보변경은json_set 내선업데이트에서이름·나머지profile을되돌리지않음',async f=>{
 const password=digits(),batch=f.DB.batch;f.DB.batch=statements=>{const profile=JSON.parse(f.user('qa-member').profile);profile.name='동시 갱신된 합성 이름';profile.extra='동시 갱신 metadata';f.db.prepare('UPDATE studio_users SET name=?,profile=? WHERE id=?').run(profile.name,JSON.stringify(profile),'qa-member');return batch(statements);};status(await f.reset('qa-admin',{resetMode:'extension',password}),200);const saved=f.user('qa-member'),profile=JSON.parse(saved.profile);assert.equal(saved.name,'동시 갱신된 합성 이름');assert.equal(profile.name,saved.name);assert.equal(profile.extra,'동시 갱신 metadata');assert.ok(profile.extension===password,'내선 값 정확 반영');
});
await check('기존비활성대상reset은활성화하지않고권한·profile·이력을보존',async f=>{
 f.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('qa-member');const profile=f.user('qa-member').profile,password=secret();safeAck(status(await f.reset('qa-admin',{resetMode:'temporary',password}),200));assert.equal(f.user('qa-member').active,0);assert.equal(f.user('qa-member').profile,profile);status(await f.request(null,'login','POST',{login:'qa-member',password}),401);
});
await check('VN 생성:숫자4자리·앞자리0 및8~256 허용,KR4자리·VN비숫자4자리 거부·메일기준권한 유지',async f=>{
 const password='0'+digits().slice(1);status(await f.request('qa-admin','admin/users','POST',{action:'create',record:vietRecord,password}),200);
 const row=f.db.prepare('SELECT * FROM studio_users WHERE login=?').get(vietRecord.idPrefix),profile=JSON.parse(row.profile);
 assert.equal(profile.employeeNo,'0007');assert.equal(profile.vietTeamId,vietRecord.vietTeamId);assert.equal(profile.role,'MEMBER');assert.ok(await f.matches(row.id,password),'생성 비밀번호 PBKDF2 저장');
 const login=status(await f.request(null,'login','POST',{login:vietRecord.idPrefix,password}),200);assert.equal(login.data.user.id,row.id);assert.equal(login.data.user.role,'MEMBER');
 const saved=snapshot(f);for(const [company,value] of [['CONCOST',digits()],['VIETQS','abcd'],['VIETQS','１２３４'],['VIETQS','12345'],['VIETQS','x'.repeat(257)]]){
  const record={...vietRecord,idPrefix:'qa-invalid-'+secret(),email:secret()+'@example.invalid',company};if(company!=='VIETQS')delete record.vietTeamId;
  status(await f.request('qa-admin','admin/users','POST',{action:'create',record,password:value}),400);
 }assert.deepEqual(snapshot(f),saved);
 const record={...vietRecord,idPrefix:'qa-viet-long',email:'viet-long@example.invalid'};status(await f.request('qa-admin','admin/users','POST',{action:'create',record,password:secret()}),200);
});
await check('VN 임시4자리reset:동일ID·profile·내선 보존,PBKDF2·새로그인 성공 및대상옛세션만 폐기',async f=>{
 vietProfile(f);const id='qa-other',previous=f.user(id),password='0'+digits().slice(1);
 const result=status(await f.reset('qa-admin',{id,resetMode:'temporary',password}),200);safeAck(result);assert.equal(result.data.sessionRevoked,false);assert.equal(result.response.headers.get('set-cookie'),null);
 const saved=f.user(id);assert.equal(saved.id,previous.id);assert.equal(saved.login,previous.login);assert.equal(saved.profile,previous.profile);assert.notEqual(saved.salt,previous.salt);assert.ok(await f.matches(id,password),'임시4자리 PBKDF2 저장');assert.ok(!await f.matches(id,f.credentials.get(id)),'기존 암호 폐기');
 assert.equal(f.sessions(id),0);assert.equal(f.sessions('qa-admin'),2);assert.equal(f.sessions('qa-member'),2);status(await f.request(id,'session'),401);status(await f.request(null,'login','POST',{login:id,password:f.credentials.get(id)}),401);
 const login=status(await f.request(null,'login','POST',{login:id,password}),200);assert.deepEqual(login.data.user,JSON.parse(previous.profile));assert.match(login.response.headers.get('set-cookie')||'',/^studio_session=/);
 const beforeInvalid=snapshot(f);for(const value of ['abcd','１２３４','12345','x'.repeat(257)])status(await f.reset('qa-admin',{id,resetMode:'temporary',password:value}),400);
 status(await f.reset('qa-admin',{resetMode:'temporary',password:digits(),company:'VIETQS'}),400);assert.deepEqual(snapshot(f),beforeInvalid);
});
await check('VN 그룹metadata:등록11그룹은동일부서만 허용,다른부서·한국회사·미등록값은계정/세션 불변',async f=>{
 vietProfile(f);assert.equal(VIET_ASSIGNMENT_GROUPS.length,11);
 for(const group of VIET_ASSIGNMENT_GROUPS){status(await f.request('qa-admin','admin/users','POST',{action:'update',id:'qa-other',record:{department:group.department,vietTeamId:group.id}}),200);const profile=JSON.parse(f.user('qa-other').profile);assert.equal(profile.vietTeamId,group.id);assert.equal(profile.department,group.department);assert.equal(f.user('qa-other').department,group.department);}
 const saved=snapshot(f),group=VIET_ASSIGNMENT_GROUPS[0];for(const record of [{department:'구조팀',vietTeamId:group.id},{department:group.department,company:'CONCOST',vietTeamId:group.id},{vietTeamId:'qa-unknown-group'},{vietTeamId:123},{vietTeamId:[]}])status(await f.request('qa-admin','admin/users','POST',{action:'update',id:'qa-other',record}),400);
 assert.deepEqual(snapshot(f),saved);
});
await check('VN 필수배치:빈문자열/null 그룹해제 거부,선택사번은문자열·앞자리0 보존하고공백/비문자열 거부',async f=>{
 vietProfile(f);for(const value of ['',null]){
  status(await f.request('qa-admin','admin/users','POST',{action:'update',id:'qa-other',record:{vietTeamId:'vt_horiz_apartment',employeeNo:'0007'}}),200);
  const before=snapshot(f);status(await f.request('qa-admin','admin/users','POST',{action:'update',id:'qa-other',record:{vietTeamId:value}}),400);assert.deepEqual(snapshot(f),before);const profile=JSON.parse(f.user('qa-other').profile);assert.equal(profile.vietTeamId,'vt_horiz_apartment');assert.equal(profile.employeeNo,'0007');
 }
 const saved=snapshot(f);for(const employeeNo of ['', ' ',123,null,false,[]])status(await f.request('qa-admin','admin/users','POST',{action:'update',id:'qa-other',record:{employeeNo}}),400);assert.deepEqual(snapshot(f),saved);
});
await check('VN 계정관리권한:위조ADMIN metadata의일반회원/익명은생성·reset·그룹수정 불가·DB변경0',async f=>{
 vietProfile(f);const member={...JSON.parse(f.user('qa-member').profile),role:'ADMIN'};f.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(member),'qa-member');const saved=snapshot(f);
 for(const actor of ['qa-member',null])for(const body of [{action:'create',record:vietRecord,password:digits()},{action:'reset',id:'qa-other',resetMode:'temporary',password:digits()},{action:'update',id:'qa-other',record:{vietTeamId:'vt_vert_general'}}])status(await f.request(actor,'admin/users','POST',body),actor?403:401);
 assert.deepEqual(snapshot(f),saved);
});
const report={kind:'ACTUAL_COLLABORATION_API_MEMORY_DB_SYNTHETIC_USERS',mode:vnBefore?'protected-vn-before':before?'protected-before':'current',sourceSHA256:createHash('sha256').update(readFileSync(source)).digest('hex'),externalRequests:0,operationalUserResets:0,passwordValuesRecorded:false,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode:report.mode,passed:report.passed,failed:report.failed,output}));if(report.failed)process.exitCode=1;
