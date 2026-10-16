import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {dirname} from 'node:path';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {database} from './d1.mjs';

const before=process.argv.includes('--before'),output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'test-results/schedule-admin.json';
if(before)registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);for(const path of ['scheduler-web/src/utils/schedulePermissions.ts','functions/lib/collaboration.ts'])if(url===new URL('../../'+path,import.meta.url).href)return {...result,source:readFileSync(new URL('../../private-provisioning/qa-schedule-admin-20261013/originals/'+path,import.meta.url),'utf8')};return result;}});
const {canManageSchedule}=await import('../src/utils/schedulePermissions.ts');
const {handleCollaboration,passwordHash,tokenHash}=await import('../../functions/lib/collaboration.ts');
const {assignedTasks}=await import('../src/utils/personalWork.ts');
const {db,DB}=database(),results=[],cookies=new Map();
const admin={id:'admin',name:'합성 관리자',department:'개발 TF',position:'실장',email:'yjw@con-cost.com',role:'ADMIN',active:true};
const staff={id:'staff',name:'합성 직원',department:'마감팀',position:'프로',email:'staff@example.invalid',role:'MEMBER',active:true};
const chief={...staff,id:'chief',name:'합성 실장',position:'실장'};
const foreign={...chief,id:'foreign',department:'구조팀'};
const roles=['마감팀','구조팀','토목&조경팀'];
const profiles=[admin,staff,chief,foreign,{...admin,id:'fake-role',email:'unknown@example.invalid'},{...admin,id:'unregistered-admin',role:'MEMBER'},{...admin,id:'mismatched-profile',profileId:'other'}];
const hash=await passwordHash('synthetic-admin-password','synthetic-salt');
for(const user of profiles){const profile={...user,id:user.profileId||user.id,idPrefix:user.id};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(user.id,user.id,user.email,user.name,user.department,user.position,JSON.stringify(profile),'synthetic-salt',hash);}
async function request(actor,path,method='GET',body){const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{...(cookies.has(actor)?{Cookie:cookies.get(actor)}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB},async()=>{throw Error('No archive writes in this test');});return {status:response.status,data:await response.json(),headers:response.headers};}
for(const user of profiles){const response=await request(user.id,'login','POST',{login:user.id,password:'synthetic-admin-password'});assert.equal(response.status,200);cookies.set(user.id,response.headers.get('set-cookie').split(';')[0]);}
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);process.exitCode=1;}}
const task=(role,id)=>({roleName:role,personId:id,personIds:[id],startDate:'2026-10-13',endDate:'2026-10-20',status:'예정',memo:'원본 메모'});
const project=(department,id)=>({id,code:'QA-'+id,name:'합성 관리자 배정',department,startDate:'2026-10-13',endDate:'2026-10-20',pmId:'chief',progress:0,roles:{},subTasks:{PM:task('PM','chief'),내부:task('내부','chief')}});
await check('등록 관리자 두 계정은 소속과 무관하게 일정 편집, 팀 전용 결재 권한은 유지',()=>{
 for(const email of ['yjw@con-cost.com','yjpark@con-cost.com'])for(const department of roles){assert.equal(canManageSchedule({...admin,email},department),true);assert.equal(canManageSchedule({...admin,email},department,false),false);}
 assert.equal(canManageSchedule({...admin,active:false},'마감팀'),false);
 assert.equal(canManageSchedule({...admin,email:'unknown@example.invalid'},'마감팀'),false);
 assert.equal(canManageSchedule({...admin,role:'MEMBER'},'마감팀'),false);
 assert.equal(canManageSchedule(chief,'마감팀'),true);assert.equal(canManageSchedule(foreign,'마감팀'),false);assert.equal(canManageSchedule(staff,'마감팀'),false);
});
await check('관리자 실제 로그인·API로 세 팀 PM/공종 배정 저장 후 재조회와 개인 업무 연결',async()=>{
 for(const department of roles){
  const initial=project(department,'admin-'+department),created=await request('admin','projects','POST',{project:initial});assert.equal(created.status,200,department+' create');
  const next=structuredClone(created.data.project);next.subTasks.PM=task('PM','staff');next.subTasks.내부=task('내부','staff');next.subTasks.내부.startDate='2026-10-15';next.subTasks.내부.endDate='2026-10-16';
  const saved=await request('admin','projects','POST',{base:created.data.project,project:next});assert.equal(saved.status,200,department+' update');assert.equal(saved.data.revision,2);
  const reread=(await request('staff','projects')).data.projects.find(row=>row.project.id===initial.id).project;assert.equal(reread.pmId,'staff');assert.equal(reread.roles.PM.personId,'staff');assert.deepEqual(reread.subTasks.내부,next.subTasks.내부);
  const personal=assignedTasks('staff',[reread]);assert.equal(personal.length,2);assert.equal(personal.find(item=>item.roleName==='내부').startDate,'2026-10-15');assert.equal(assignedTasks('chief',[reread]).length,0);
 }
});
await check('직원·타팀 실장·위조 role/프로필/요청 body는 서버 권한 우회 불가',async()=>{
 for(const id of ['staff','foreign','fake-role','unregistered-admin','mismatched-profile']){const p=project('마감팀','denied-'+id);const response=await request(id,'projects','POST',{project:p,user:admin,profile:admin,role:'ADMIN'});assert.equal(response.status,403,id);assert.equal(db.prepare('SELECT id FROM studio_projects WHERE id=?').get(p.id),undefined);}
 assert.equal((await request('chief','projects','POST',{project:project('마감팀','chief-allowed')})).status,200);
});
await check('관리자 일정 편집 허용으로 부서 변조·정리·연장 승인 권한은 추가되지 않음',async()=>{
 const p=project('마감팀','scope-boundary');assert.equal((await request('chief','projects','POST',{project:p})).status,200);
 assert.equal((await request('admin','projects','POST',{base:p,project:{...p,department:'구조팀'}})).status,403);
 assert.equal((await request('admin','projects/'+p.id+'/archive','POST',{base:p})).status,403);
 const changed=structuredClone(p);changed.scheduleExtensions=[{id:'pending',taskId:'unused',userId:'staff',previousEnd:'2026-10-20',requestedEnd:'2026-10-21',reason:'합성 요청',status:'PENDING'}];db.prepare('UPDATE studio_projects SET body=? WHERE id=?').run(JSON.stringify(changed),p.id);
 assert.equal((await request('admin','projects/'+p.id+'/extensions/pending/approve','POST',{revision:1})).status,403);
 assert.equal(JSON.parse(db.prepare('SELECT body FROM studio_projects WHERE id=?').get(p.id).body).scheduleExtensions[0].status,'PENDING');
});
await check('관리자 비활성화·로그아웃된 세션은 일정 편집 불가',async()=>{
 const token='synthetic-inactive-admin';db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),'admin',Date.now()+10000);cookies.set('admin','studio_session='+token);db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('admin');
 assert.equal((await request('admin','projects','POST',{project:project('마감팀','inactive')})).status,401);
 db.prepare('UPDATE studio_users SET active=1 WHERE id=?').run('admin');assert.equal((await request('admin','logout','POST',{})).status,200);assert.equal((await request('admin','projects','POST',{project:project('마감팀','logged-out')})).status,401);
});
await check('관리자 첫 연결은 과거 PC 일정 자동 이관 없이 중앙 수신, 명시한 배정 수정은 동기화',async()=>{
 const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage,originalWindow=globalThis.window;
 const cache=new Map(),outgoing=[],remote=project('구조팀','central-admin');
 cache.set('studio-legacy-project-backup-v1',JSON.stringify([project('마감팀','old-local-admin')]));
 globalThis.localStorage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,String(value)),removeItem:key=>cache.delete(key)};globalThis.window={localStorage:globalThis.localStorage};
 globalThis.fetch=async(url,options={})=>{const route=String(url).split('/').at(-1);if(route==='projects'&&options.method==='POST'){outgoing.push(JSON.parse(options.body));return Response.json({project:outgoing.at(-1).project,revision:2});}const data={session:{user:admin},changes:{versions:{projects:1,meetings:1,inbox:1,directory:1,personal:1}},projects:{projects:[{project:remote,revision:1}],archived:[]},directory:{users:[admin,staff]},meetings:{meetings:[]},notifications:{notifications:[],unreadCount:0},personal:{leaves:[],checks:[],worklogs:[]}}[route];assert.ok(data,route);return Response.json(data);};
 const server=await createServer({configFile:false,plugins:[nativeSsrPackages()],server:{middlewareMode:true,hmr:false,ws:false},ssr:{noExternal:[/^(react|react-dom|zustand)(\/|$)/]},appType:'custom'});let stop;
 const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.ok(predicate(),'Sync did not settle');};
 try{
  const {useAuthStore}=await server.ssrLoadModule('/src/store/useAuthStore.ts'),{useProjectStore}=await server.ssrLoadModule('/src/store/useProjectStore.ts'),{startStudioSync,useStudioStore}=await server.ssrLoadModule('/src/store/useStudioStore.ts');
  useAuthStore.setState({currentUser:admin});useProjectStore.setState({projects:[project('마감팀','old-local-admin')]});stop=startStudioSync(admin.id);await until(()=>useStudioStore.getState().ready);
  assert.equal(outgoing.length,0);assert.deepEqual(useProjectStore.getState().projects.map(p=>p.id),[remote.id]);assert.ok(cache.get('studio-legacy-project-backup-v1').includes('old-local-admin'));
  const next=structuredClone(remote.subTasks);next.PM=task('PM','staff');next.내부=task('내부','staff');useProjectStore.getState().updateProjectSubTasks(remote.id,next);await until(()=>outgoing.length===1&&useStudioStore.getState().pending===0);
  assert.equal(outgoing[0].project.pmId,'staff');assert.deepEqual(outgoing[0].project.subTasks.내부.personIds,['staff']);assert.equal(useProjectStore.getState().projects[0].pmId,'staff');
 }finally{stop?.();await server.close();globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;globalThis.window=originalWindow;}
});
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({kind:'ACTUAL_API_LOGIN_SQLITE_MEMORY_AND_CLIENT_PERMISSION',before,networkRequests:0,operatingWrites:0,PASS:results.filter(r=>r.status==='PASS').length,FAIL:results.filter(r=>r.status==='FAIL').length,results},null,2));db.close();
