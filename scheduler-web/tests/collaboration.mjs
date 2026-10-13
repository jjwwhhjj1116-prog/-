import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash,mergeProject} from '../../functions/lib/collaboration.ts';
import {meetingHtml,archiveMeeting} from '../../functions/lib/meetingArchive.ts';
import {compareStaff} from '../src/utils/staffOrder.ts';
import {rebaseProject} from '../src/utils/rebaseProject.ts';
const {db,DB}=database(),env={DB};
const results=[];let archiveFail=false;const archives=[];
const archive=async(m,v)=>{if(archiveFail)throw Error('simulated unavailable');archives.push({m:structuredClone(m),v});return 'https://drive.google.com/file/d/qa/view';};
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',reason:e.stack});}}
const profiles=[['author','김작성','마감팀','선임'],['chief','조실장','마감팀','실장'],['director','최본부장','기술본부','본부장'],['manager','장팀장','마감팀','팀장'],['structure','구조실장','구조팀','실장']];
for(const [id,name,department,position]of profiles){const p={id,name,department,position,idPrefix:id,email:id+'@example.invalid'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,p.email,name,department,position,JSON.stringify(p),'test',await passwordHash('test-password','test'));}
const cookies={};
async function request(user,path,method='GET',body){const response=await handleCollaboration(new Request('http://localhost/api/collaboration/'+path,{method,headers:{...(cookies[user]?{Cookie:cookies[user]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env,archive);const data=await response.json();return {status:response.status,data,response};}
for(const [id]of profiles){const r=await request(id,'login','POST',{login:id,password:'test-password'});assert.equal(r.status,200);cookies[id]=r.response.headers.get('set-cookie').split(';')[0];}
const task={roleName:'조적',personIds:[],startDate:'2026-09-01',endDate:'2026-09-30',status:'예정'};
const project={id:'p1',code:'QA',name:'공동 일정',department:'마감팀',subTasks:{조적:task,창호:{...task,roleName:'창호'}},roles:{},pmId:'',progress:0};
const meeting={id:'m1',title:'회의 검수',projectCode:'QA',projectName:'공동 일정',attendeesInternal:['검수'],attendeesExternal:[],department:'마감팀',decisions:['조치'],summary:'요약',notesAndInstructions:'본문',meetingDate:'2026-09-23'};
for(const [label,merge] of [['서버 저장',mergeProject],['충돌 재적용',rebaseProject]]) {
 await check(`${label}: 이전 PM·공종 배정 및 기간 보존`,()=>{
  const base={...structuredClone(project),pmId:'chief',roles:{창호:{personId:'author',startDate:'2026-09-03',endDate:'2026-09-15'}},subTasks:{조적:task}};
  const next=structuredClone(base);next.subTasks.조적.memo='다른 공종 수정';
  const result=merge(base,base,next);assert.equal(result.pmId,'chief');assert.deepEqual(result.roles.창호,base.roles.창호);
 });
 await check(`${label}: 명시한 PM 해제·공종 삭제 유지`,()=>{
  const base={...structuredClone(project),pmId:'chief',subTasks:{PM:{...task,roleName:'PM',personId:'chief',personIds:['chief']},조적:task},roles:{PM:{personId:'chief'},조적:{personId:'author'},창호:{personId:'author'}}};
  const next=structuredClone(base);delete next.subTasks.PM;delete next.subTasks.조적;
  const result=merge(base,base,next);assert.equal(result.pmId,'');assert.equal(result.roles.PM,undefined);assert.equal(result.roles.조적,undefined);assert.deepEqual(result.roles.창호,base.roles.창호);
  const cleared=structuredClone(base);cleared.subTasks.PM.personIds=[];cleared.subTasks.PM.personId='';assert.equal(merge(base,base,cleared).pmId,'');
 });
 await check(`${label}: 새 PM 배정과 최신 원격 역할 보존`,()=>{
  const base={...structuredClone(project),pmId:'chief',subTasks:{조적:task},roles:{창호:{personId:'author'}}};
  const remote=structuredClone(base);remote.roles.창호.personId='manager';
  const next=structuredClone(base);next.subTasks.PM={...task,roleName:'PM',personId:'author',personIds:['manager']};
  const result=merge(remote,base,next);assert.equal(result.pmId,'manager');assert.equal(result.roles.창호.personId,'manager');
 });
}
await check('이전 배정은 실제 API 저장·재조회 후에도 유지',async()=>{
 const original={...structuredClone(project),id:'legacy-project',pmId:'chief',subTasks:{조적:task},roles:{창호:{personId:'author',startDate:'2026-09-03',endDate:'2026-09-15'}}};
 assert.equal((await request('chief','projects','POST',{project:original})).status,200);
 const next=structuredClone(original);next.subTasks.조적.memo='도면 검토';
 assert.equal((await request('chief','projects','POST',{base:original,project:next})).status,200);
 const saved=(await request('author','projects')).data.projects.find(row=>row.project.id===original.id).project;
 assert.equal(saved.pmId,'chief');assert.deepEqual(saved.roles.창호,original.roles.창호);
});
await check('직급 전체 순서 및 동직급 명부순 유지',()=>{const ranks=['프로','수석','파트장','책임','실장','선임','팀장','수석'];assert.deepEqual(ranks.map((position,i)=>({position,i})).sort(compareStaff).map(x=>x.i),[4,6,2,1,7,3,5,0]);});
await check('구형 미보고 공종을 포함한 서버 저장은 기존 전체 실적 유지',async()=>{
 const original={...structuredClone(project),id:'legacy-weight-project',code:'QA-LEGACY-WEIGHT',startDate:'2026-10-06',endDate:'2026-10-08',progress:73,subTasks:{조적:{...task,personId:'author',personIds:['author'],startDate:'2026-10-06',endDate:'2026-10-08',progress:40}},roles:{창호:{personId:'author',startDate:'2026-10-06',endDate:'2026-10-08'}}};
 assert.equal((await request('chief','projects','POST',{project:original})).status,200);
 const next=structuredClone(original);next.subTasks.조적.memo='실적 이외 메모 수정';
 const saved=await request('chief','projects','POST',{base:original,project:next});assert.equal(saved.status,200);assert.equal(saved.data.project.progress,73);assert.deepEqual(saved.data.project.roles.창호,original.roles.창호);
 const reread=(await request('author','projects')).data.projects.find(row=>row.project.id===original.id).project;assert.equal(reread.progress,73);assert.equal(reread.subTasks.조적.progress,40);
});
await check('혼합 공종 서버 병합은 정식 공종 우선 및 구형 작업일 가중 반영',()=>{
 const original={...structuredClone(project),startDate:'2026-10-06',endDate:'2026-10-08',progress:73,subTasks:{조적:{...task,startDate:'2026-10-06',endDate:'2026-10-08',progress:40}},roles:{조적:{personId:'author',startDate:'2026-10-01',endDate:'2026-10-31',progress:100},창호:{personId:'author',startDate:'2026-10-06',endDate:'2026-10-08',progress:80}}};
 const next=structuredClone(original);next.subTasks.조적.memo='검토 메모';const saved=mergeProject(original,original,next);assert.equal(saved.progress,60);assert.equal(saved.subTasks.조적.progress,40);assert.equal(saved.roles.창호.progress,80);assert.equal(original.progress,73);
});
await check('인증 없는 API 접근 차단',async()=>assert.equal((await request('none','projects')).status,401));
await check('팀 실장만 소속 일정 등록 가능',async()=>{assert.equal((await request('author','projects','POST',{project})).status,403);assert.equal((await request('structure','projects','POST',{project})).status,403);assert.equal((await request('chief','projects','POST',{project})).status,200);});
await check('다른 공종 동시 수정 병합',async()=>{const a=structuredClone(project),b=structuredClone(project);a.subTasks.조적.endDate='2026-09-25';b.subTasks.창호.endDate='2026-09-28';assert.equal((await request('chief','projects','POST',{base:project,project:a})).status,200);const r=await request('manager','projects','POST',{base:project,project:b});assert.equal(r.status,200);assert.equal(r.data.project.subTasks.조적.endDate,'2026-09-25');assert.equal(r.data.project.subTasks.창호.endDate,'2026-09-28');});
await check('동일 공종 충돌 거부 및 원본 유지',async()=>{const p=structuredClone(project);p.subTasks.조적.endDate='2026-09-27';assert.equal((await request('manager','projects','POST',{base:project,project:p})).status,409);const r=await request('author','projects');assert.equal(r.data.projects.find(row=>row.project.id===project.id).project.subTasks.조적.endDate,'2026-09-25');});
await check('충돌 해결 시 관계없는 서버 변경 보존',()=>{const remote=structuredClone(project),local=structuredClone(project);remote.name='다른 담당자 제목 수정';remote.subTasks.창호.endDate='2026-09-28';local.subTasks.조적.endDate='2026-09-27';const r=rebaseProject(remote,project,local);assert.equal(r.name,remote.name);assert.equal(r.subTasks.창호.endDate,'2026-09-28');assert.equal(r.subTasks.조적.endDate,'2026-09-27');});
await check('전송 중 PM 재배정·해제는 대기 화면의 PM 표시에도 즉시 반영',()=>{const base={...structuredClone(project),subTasks:{...structuredClone(project.subTasks),PM:{roleName:'PM',personId:'author',personIds:['author'],startDate:'2026-09-01',endDate:'2026-09-30',status:'예정'}},pmId:'author',roles:{PM:{personId:'author',startDate:'2026-09-01',endDate:'2026-09-30'}}};const remote={...structuredClone(base),name:'서버에서 변경한 제목'};const local=structuredClone(base);local.subTasks.PM.personId='manager';local.subTasks.PM.personIds=['manager'];local.pmId='manager';const r=rebaseProject(remote,base,local);assert.equal(r.name,'서버에서 변경한 제목');assert.equal(r.subTasks.PM.personId,'manager');assert.equal(r.pmId,'manager');assert.equal(r.roles.PM.personId,'manager');const removed=structuredClone(base);delete removed.subTasks.PM;removed.pmId='';const cleared=rebaseProject(remote,base,removed);assert.equal(cleared.pmId,'');assert.equal(cleared.roles.PM,undefined);});
await check('서로 다른 공종의 파생 공정률 변화는 충돌 없이 재계산',()=>{const base=structuredClone(project);base.subTasks.조적.progress=100;base.subTasks.창호.progress=0;const remote=structuredClone(base),local=structuredClone(base);remote.subTasks.조적.endDate='2026-09-20';remote.progress=40;local.subTasks.창호.endDate='2026-09-21';local.progress=60;const r=mergeProject(remote,base,local);assert.equal(r.subTasks.조적.endDate,'2026-09-20');assert.equal(r.subTasks.창호.endDate,'2026-09-21');assert.ok(r.progress>0&&r.progress<100);});
await check('납품 후 검토·수정 별도 저장 및 서로 다른 일정 동시 편집',async()=>{
 const first={id:'follow-1',kind:'검토',startDate:'2026-10-01',endDate:'2026-10-01',memo:'납품본 검토',personIds:['author'],status:'예정'};
 const original={...structuredClone(project),id:'follow-project',code:'QA-FOLLOW',startDate:'2026-09-01',endDate:'2026-09-30',postDeliveryTasks:[first]};
 assert.equal((await request('chief','projects','POST',{project:original})).status,200);
 const a={...structuredClone(original),postDeliveryTasks:[first,{...first,id:'follow-2',kind:'수정',memo:'변경 도면 반영'}]};
 const b={...structuredClone(original),postDeliveryTasks:[first,{...first,id:'follow-3',memo:'재검토'}]};
 assert.equal((await request('chief','projects','POST',{base:original,project:a})).status,200);
 const merged=await request('manager','projects','POST',{base:original,project:b});assert.equal(merged.status,200);
 assert.equal(merged.data.project.postDeliveryTasks.length,3);assert.equal(merged.data.project.progress,0);
 const edited={...structuredClone(original),postDeliveryTasks:[{...first,memo:'서로 다른 수정'}]};
 assert.equal((await request('manager','projects','POST',{base:original,project:edited})).status,200);
 const collision={...structuredClone(original),postDeliveryTasks:[{...first,memo:'충돌 수정'}]};
 assert.equal((await request('chief','projects','POST',{base:original,project:collision})).status,409);
 const latest=(await request('chief','projects')).data.projects.find(row=>row.project.id===original.id).project;
 const bad={...structuredClone(latest),postDeliveryTasks:[{...first,id:'bad',memo:''}]};
 assert.equal((await request('chief','projects','POST',{base:latest,project:bad})).status,400);
 assert.deepEqual((await request('chief','projects')).data.projects.find(row=>row.project.id===original.id).project,latest);
});
await check('납품 후 메모 저장은 기존 납품 공정률·승인 실적·원납품일 보존',()=>{
 const follow={id:'follow-keep-total',kind:'수정',startDate:'2026-10-06',endDate:'2026-10-08',memo:'기존 메모',personIds:['author'],status:'완료',progress:100,actualProgressDate:'2026-10-06'};
 const original={...structuredClone(project),startDate:'2026-10-01',endDate:'2026-10-02',progress:80,subTasks:{조적:{...task,startDate:'2026-10-01',endDate:'2026-10-02',progress:40}},postDeliveryTasks:[follow]};
 const next=structuredClone(original);next.postDeliveryTasks[0].memo='새 메모';const saved=mergeProject(original,original,next);
 assert.equal(saved.progress,80);assert.equal(saved.subTasks.조적.progress,40);assert.equal(saved.endDate,original.endDate);assert.equal(saved.postDeliveryTasks[0].progress,100);assert.equal(saved.postDeliveryTasks[0].actualProgressDate,'2026-10-06');assert.equal(saved.postDeliveryTasks[0].memo,'새 메모');
});
await check('저장만으로 결재 알림 발생 금지',async()=>{const r=await request('author','meetings/m1','PUT',{meeting});assert.equal(r.status,200);assert.equal(r.data.meeting.archiveRevision,1);assert.equal((await request('chief','notifications')).data.notifications.length,0);});
await check('상신 시 실장·본부장 각각 알림, 재상신 중복 없음',async()=>{for(let i=0;i<2;i++)assert.equal((await request('author','meetings/m1/submit','POST',{revision:1})).status,200);assert.equal((await request('chief','notifications')).data.notifications.length,1);assert.equal((await request('director','notifications')).data.notifications.length,1);assert.equal((await request('manager','notifications')).data.notifications.length,0);});
await check('알림 읽음과 문서 열람 분리',async()=>{const n=(await request('chief','notifications')).data.notifications[0];await request('chief','notifications/read','POST',{id:n.id});const m=(await request('author','meetings')).data.meetings[0];assert.equal(m.reviews.find(x=>x.recipient_id==='chief').read_at,null);});
await check('열람 기록은 승인과 분리, 작성자 알림',async()=>{assert.equal((await request('chief','meetings/m1/read','POST',{revision:1})).status,200);const m=(await request('author','meetings')).data.meetings[0],r=m.reviews.find(x=>x.recipient_id==='chief');assert.ok(r.read_at);assert.equal(r.decision,null);assert.equal((await request('author','notifications')).data.notifications.length,1);});
await check('진행 중 결재본 수정·정리 차단',async()=>{assert.equal((await request('author','meetings/m1','PUT',{meeting,revision:1})).status,409);assert.equal((await request('author','meetings/m1','DELETE',{revision:1})).status,409);});
await check('수신자와 버전 검증 후 승인·반려',async()=>{assert.equal((await request('manager','meetings/m1/approve','POST',{revision:1})).status,403);assert.equal((await request('chief','meetings/m1/approve','POST',{revision:0})).status,409);assert.equal((await request('chief','meetings/m1/approve','POST',{revision:1})).status,200);assert.equal((await request('chief','meetings/m1/reject','POST',{revision:1})).status,409);assert.equal((await request('director','meetings/m1/reject','POST',{revision:1})).status,200);});
await check('구버전 열람 중 수정본 재상신은 새 알림을 읽음 처리하지 않음',async()=>{
 const id='meeting-read-race',m={...meeting,id};
 assert.equal((await request('author',`meetings/${id}`,'PUT',{meeting:m})).status,200);
 assert.equal((await request('author',`meetings/${id}/submit`,'POST',{revision:1})).status,200);
 for(const recipient of ['chief','director'])assert.equal((await request(recipient,`meetings/${id}/approve`,'POST',{revision:1})).status,200);
 let expectedNotifications;
 env.DB={...DB,batch:async statements=>{
  env.DB=DB;
  assert.equal((await request('author',`meetings/${id}`,'PUT',{meeting:{...m,title:'재상신한 새 회의록'},revision:1})).status,200);
  assert.equal((await request('author',`meetings/${id}/submit`,'POST',{revision:2})).status,200);
  expectedNotifications=db.prepare('SELECT * FROM studio_notifications WHERE meeting_id=? ORDER BY id').all(id);
  return DB.batch(statements);
 }};
 try{
  assert.equal((await request('chief',`meetings/${id}/read`,'POST',{revision:1})).status,409);
  assert.deepEqual(db.prepare('SELECT * FROM studio_notifications WHERE meeting_id=? ORDER BY id').all(id),expectedNotifications);
  assert.equal(db.prepare('SELECT read_at FROM studio_reviews WHERE meeting_id=? AND revision=2 AND recipient_id=?').get(id,'chief').read_at,null);
 }finally{
  env.DB=DB;
  db.prepare('DELETE FROM studio_notifications WHERE meeting_id=?').run(id);
  db.prepare('DELETE FROM studio_reviews WHERE meeting_id=?').run(id);
  db.prepare('DELETE FROM studio_meetings WHERE id=?').run(id);
 }
});
await check('Drive 장애 시 DB 원본 보존·정리 차단',async()=>{archiveFail=true;const r=await request('author','meetings/m1','PUT',{meeting:{...meeting,title:'수정본'},revision:1});assert.equal(r.status,200);assert.equal(r.data.meeting.serverRevision,2);assert.ok(r.data.meeting.archiveError);assert.equal((await request('author','meetings/m1','DELETE',{revision:2})).status,409);archiveFail=false;});
await check('수정 전 결재 권한 재사용 차단',async()=>{assert.equal((await request('chief','meetings/m1/approve','POST',{revision:1})).status,409);assert.equal((await request('chief','meetings/m1/approve','POST',{revision:2})).status,403);});
await check('보관 재시도 후 정리, Drive 삭제 없이 최종 기록 보존',async()=>{assert.equal((await request('author','meetings/m1/archive','POST',{revision:2})).status,200);assert.equal((await request('author','meetings/m1','DELETE',{revision:2})).status,200);assert.equal((await request('author','meetings')).data.meetings.length,0);assert.equal(archives.at(-1).m.title,'수정본');});
await check('HTML 보관본 원문/특수문자 보존, 스크립트 삽입 차단',()=>{const m={...meeting,title:'<script>alert(1)</script>',rawTranscript:'</script><script>alert(2)</script>\n원문'};const html=meetingHtml(m,1);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));const json=html.match(/id="meeting-source">(.*?)<\/script>/s)[1];assert.deepEqual(JSON.parse(json).meeting,m);});
await check('Drive 재시도는 같은 파일 ID 재사용',async()=>{const savedFetch=globalThis.fetch;let ids=0,upload=0;const folder=async name=>name;globalThis.fetch=async(url,_init)=>{if(String(url).includes('generateIds')){ids++;return Response.json({ids:['fake-id']});}if(String(url).includes('/upload/')){upload++;return Response.json({id:'fake-id'});}return new Response('',{status:404});};try{await archiveMeeting(env,meeting,1,'mock-token',folder);await archiveMeeting(env,meeting,1,'mock-token',folder);assert.equal(ids,1);assert.equal(upload,2);}finally{globalThis.fetch=savedFetch;}});
await check('서버 비밀번호 변경 후 새 비밀번호로 로그인',async()=>{assert.equal((await request('author','password','POST',{oldPassword:'wrong',newPassword:'next-password'})).status,403);assert.equal((await request('author','password','POST',{oldPassword:'test-password',newPassword:'next-password'})).status,200);assert.equal((await request('author','login','POST',{login:'author',password:'test-password'})).status,401);assert.equal((await request('author','login','POST',{login:'author',password:'next-password'})).status,200);});
await check('변경 번호는 읽기에 유지되고 프로젝트 저장 때만 증가',async()=>{
 const before=(await request('chief','changes')).data.versions;
 await request('chief','projects');assert.deepEqual((await request('chief','changes')).data.versions,before);
 const base=(await request('chief','projects')).data.projects[0].project;
 assert.equal((await request('chief','projects','POST',{base,project:{...base,name:'수정 일정'}})).status,200);
 const after=(await request('chief','changes')).data.versions;assert.equal(after.projects,before.projects+1);assert.equal(after.directory,before.directory);
});
await check('토목 결재는 지정 본부장 한 명만 수신',async()=>{
 const profile={id:'civil',name:'토목 작성',department:'토목&조경팀',position:'프로',idPrefix:'civil',email:'civil@example.invalid'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(profile.id,profile.id,profile.email,profile.name,profile.department,profile.position,JSON.stringify(profile),'test',await passwordHash('test-password','test'));
 const login=await request('civil','login','POST',{login:'civil',password:'test-password'});cookies.civil=login.response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('civil','meetings/civil-minute','PUT',{meeting:{...meeting,id:'civil-minute'}})).status,200);
 assert.equal((await request('civil','meetings/civil-minute/submit','POST',{revision:1})).status,409);
 env.CIVIL_APPROVER_ID='director';assert.equal((await request('civil','meetings/civil-minute/submit','POST',{revision:1})).status,200);
 assert.deepEqual(db.prepare('SELECT recipient_id FROM studio_reviews WHERE meeting_id=?').all('civil-minute').map(r=>r.recipient_id),['director']);
});
await check('서버 관리자 계정 생성·초기화·비활성화와 기록 보존',async()=>{
 assert.equal((await request('chief','admin/users','POST',{action:'create',record:{}})).status,403);
 const admin={id:'admin',name:'관리자',department:'관리',position:'관리자',idPrefix:'qaadmin',email:'yjw@con-cost.com'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(admin.id,admin.idPrefix,admin.email,admin.name,admin.department,admin.position,JSON.stringify(admin),'test',await passwordHash('test-password','test'));
 const login=await request('admin','login','POST',{login:'qaadmin',password:'test-password'});cookies.admin=login.response.headers.get('set-cookie').split(';')[0];
 const record={name:'신규 검수',department:'마감팀',position:'프로',idPrefix:'newqa',email:'newqa@example.invalid'};
 assert.equal((await request('admin','admin/users','POST',{action:'create',record,password:'1234'})).status,400);
 assert.equal((await request('admin','admin/users','POST',{action:'create',record,password:'initial-password'})).status,200);
 assert.equal((await request('admin','admin/users','POST',{action:'create',record,password:'initial-password'})).status,409);
 const users=(await request('admin','directory')).data.users,target=users.find(u=>u.idPrefix==='newqa');assert.ok(target);assert.ok(!JSON.stringify(users).includes('password_hash'));assert.ok(!JSON.stringify(users).includes('initial-password'));
 const userLogin=await request('newqa','login','POST',{login:'newqa',password:'initial-password'});cookies.newqa=userLogin.response.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('newqa','meetings/admin-history','PUT',{meeting:{...meeting,id:'admin-history'}})).status,200);
 assert.equal((await request('admin','admin/users','POST',{action:'reset',id:target.id,password:'changed-password'})).status,200);
 assert.equal((await request('newqa','session')).status,401);
 assert.equal((await request('newqa','login','POST',{login:'newqa',password:'initial-password'})).status,401);
 assert.equal((await request('newqa','login','POST',{login:'newqa',password:'changed-password'})).status,200);
 assert.equal((await request('admin','admin/users','POST',{action:'deactivate',id:'admin'})).status,409);
 assert.equal((await request('admin','admin/users','POST',{action:'deactivate',id:target.id})).status,200);
 assert.equal((await request('newqa','login','POST',{login:'newqa',password:'changed-password'})).status,401);
 assert.ok(db.prepare('SELECT body FROM studio_meetings WHERE id=?').get('admin-history').body);
});
for(const field of ['memo','endDate'])await check(`일반 공종 ${field} 충돌 재적용·API 재조회는 최신 승인70%와 실적일 보존`,async()=>{
 const base={...structuredClone(project),id:`main-approved-${field}`,code:`MAIN-${field}`,startDate:'2026-10-06',endDate:'2026-10-08',progress:35,subTasks:{조적:{...task,personId:'author',personIds:['author'],startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'기존',progress:35,actualProgressDate:'2026-10-05'}}};
 const remote=structuredClone(base);remote.subTasks.조적.progress=70;remote.subTasks.조적.actualProgressDate='2026-10-06';remote.progress=70;assert.equal((await request('chief','projects','POST',{project:remote})).status,200);
 const local=structuredClone(base);local.subTasks.조적[field]=field==='memo'?'내 메모':'2026-10-12';assert.equal((await request('chief','projects','POST',{base,project:local})).status,409);
 const rebased=rebaseProject(remote,base,local);assert.equal(rebased.subTasks.조적.progress,70);assert.equal(rebased.subTasks.조적.actualProgressDate,'2026-10-06');
 assert.equal((await request('chief','projects','POST',{base:remote,project:rebased})).status,200);
 const saved=(await request('author','projects')).data.projects.find(row=>row.project.id===base.id).project;assert.equal(saved.progress,70);assert.equal(saved.subTasks.조적.progress,70);assert.equal(saved.subTasks.조적.actualProgressDate,'2026-10-06');assert.equal(saved.subTasks.조적[field],local.subTasks.조적[field]);assert.equal(saved.endDate,base.endDate);
});
await check('일반 공종 충돌 재적용은 미변경 완료 상태·기간·재배정 및 전체 승인값 보존',()=>{
 const base={...structuredClone(project),progress:35,subTasks:{조적:{...task,personId:'author',startDate:'2026-10-06',endDate:'2026-10-08',status:'진행중',memo:'기존',progress:35,actualProgressDate:'2026-10-05'}}};delete base.subTasks.조적.personIds;
 const remote=structuredClone(base);Object.assign(remote.subTasks.조적,{personId:'manager',personIds:['manager'],endDate:'2026-10-12',status:'완료',progress:100,actualProgressDate:'2026-10-06'});remote.progress=100;
 const local=structuredClone(base);Object.assign(local.subTasks.조적,{memo:'내 메모',personIds:['author']});local.progress=40;
 const saved=rebaseProject(remote,base,local);assert.equal(saved.progress,100);assert.equal(saved.subTasks.조적.progress,100);assert.equal(saved.subTasks.조적.actualProgressDate,'2026-10-06');assert.equal(saved.subTasks.조적.status,'완료');assert.equal(saved.subTasks.조적.endDate,'2026-10-12');assert.equal(saved.subTasks.조적.personId,'manager');assert.deepEqual(saved.subTasks.조적.personIds,['manager']);assert.equal(saved.subTasks.조적.memo,'내 메모');
 const duplicated=structuredClone(base);duplicated.subTasks.조적.personIds=['','author','author'];const normalized=structuredClone(local);normalized.subTasks.조적.personIds=['author'];const preserved=rebaseProject(remote,duplicated,normalized);assert.equal(preserved.subTasks.조적.personId,'manager');assert.deepEqual(preserved.subTasks.조적.personIds,['manager']);assert.equal(preserved.subTasks.조적.progress,100);
});
await check('삭제된 일반 공종은 재적용으로 부활 금지, 신규 공종 추가 및 원격 다른 공종 보존',()=>{
 const base=structuredClone(project),local=structuredClone(base),remote=structuredClone(base);local.subTasks.조적.memo='내 초안';delete remote.subTasks.조적;const original=structuredClone(local);assert.throws(()=>rebaseProject(remote,base,local),/삭제/);assert.deepEqual(local,original);
 const added=structuredClone(base);added.subTasks.내역={...task,roleName:'내역',memo:'신규 공종'};remote.subTasks.창호.memo='원격 메모';const saved=rebaseProject(remote,base,added);assert.equal(saved.subTasks.조적,undefined);assert.equal(saved.subTasks.내역.memo,'신규 공종');assert.equal(saved.subTasks.창호.memo,'원격 메모');
});
await check('구형 공종을 편집 중 정식 승인 업무로 연결되면 미변경 기본 상태·배정·기간 보존',()=>{
 const base={...structuredClone(project),startDate:'2026-10-06',endDate:'2026-10-08',progress:35,subTasks:{},roles:{조적:{personId:'author',startDate:'2026-10-06',endDate:'2026-10-08'}}};
 const remote=structuredClone(base);remote.subTasks.조적={...task,personId:'author',personIds:['author'],startDate:'2026-10-06',endDate:'2026-10-08',status:'완료',memo:'',version:'v2',progress:100,actualProgressDate:'2026-10-06'};remote.progress=100;
 const local=structuredClone(base);local.subTasks.조적={roleName:'조적',...base.roles.조적,personIds:['author'],status:'예정',memo:'구형 공종 메모 편집',version:'v1'};
 const saved=rebaseProject(remote,base,local);assert.equal(saved.subTasks.조적.progress,100);assert.equal(saved.subTasks.조적.actualProgressDate,'2026-10-06');assert.equal(saved.subTasks.조적.status,'완료');assert.equal(saved.subTasks.조적.version,'v2');assert.equal(saved.subTasks.조적.memo,local.subTasks.조적.memo);assert.deepEqual(saved.subTasks.조적.personIds,['author']);assert.equal(saved.roles.조적.personId,'author');
});
await check('열린 구형 날짜 초안의 구간 전환은 입력을 버리지 않고 충돌 표시, 메모 편집은 최신 구간과 실적 보존',()=>{
 const base={...structuredClone(project),startDate:'2026-10-01',endDate:'2026-10-10',subTasks:{조적:{roleName:'조적',personId:'author',personIds:['author'],startDate:'2026-10-01',endDate:'2026-10-10',status:'예정',memo:'',version:'v1',progress:35}},roles:{}};
 const remote=structuredClone(base);remote.subTasks.조적={...remote.subTasks.조적,progress:70,actualProgressDate:'2026-10-07',legacyAllocationId:'retained',allocations:[{id:'retained',personIds:['author'],startDate:'2026-10-01',endDate:'2026-10-10'},{id:'new-source',personIds:['author'],startDate:'2026-10-05',endDate:'2026-10-08'}]};
 const dates=structuredClone(base);dates.subTasks.조적.endDate='2026-10-12';const protectedDates=structuredClone(dates);assert.throws(()=>rebaseProject(remote,base,dates,true),/인원별 투입 구간/);assert.deepEqual(dates,protectedDates);
 const memo=structuredClone(base);memo.subTasks.조적.memo='작성 중인 메모';const saved=rebaseProject(remote,base,memo,true);assert.equal(saved.subTasks.조적.memo,memo.subTasks.조적.memo);assert.deepEqual(saved.subTasks.조적.allocations,remote.subTasks.조적.allocations);assert.equal(saved.subTasks.조적.legacyAllocationId,'retained');assert.equal(saved.subTasks.조적.progress,70);assert.equal(saved.subTasks.조적.actualProgressDate,'2026-10-07');
 assert.deepEqual(rebaseProject(remote,base,dates).subTasks.조적.allocations,remote.subTasks.조적.allocations,'Existing explicit conflict reapply behavior stays unchanged');
});
mkdirSync('test-results',{recursive:true});writeFileSync('test-results/collaboration.json',JSON.stringify(results,null,2));for(const r of results)console.log(r.status,r.name,r.status==='FAIL'?r.reason:'');db.close();if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
