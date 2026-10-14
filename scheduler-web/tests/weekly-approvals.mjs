import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {weeklyApprovalRoute,sendScheduledWeeklyApprovals} from '../../functions/lib/weeklyApprovals.ts';

const week='2026-10-12',results=[];
function fixture(){
 const {db,DB}=database();
 for(const migration of ['0009_weekly_reports.sql','0010_weekly_approvals.sql'])db.exec(readFileSync(new URL('../../migrations/'+migration,import.meta.url),'utf8'));
 const people=[['worker','마감팀','프로'],['peer','마감팀','프로'],['structure','구조팀','프로'],['civil','토목&조경팀','프로'],['u_12','마감팀','실장'],['u_13','마감팀','팀장'],['u_25','구조팀','팀장'],['executive','경영지원','실장'],['director','경영진','대표'],['guessed','경영진','부사장'],['inactive','경영지원','실장'],['admin','개발TF','실장']];
 for(const [id,department,position]of people){const profile={id,name:'합성 '+id,department,position,email:id==='admin'?'yjw@con-cost.com':id+'@example.invalid',role:id==='admin'?'ADMIN':'EMPLOYEE'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,id,profile.email,profile.name,department,position,JSON.stringify(profile),'unused','unused',id==='inactive'?0:1);}
 const setAllow=(ids=['executive','director'])=>db.prepare('INSERT INTO studio_reporting_settings VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run('weekly-eligible-recipients',JSON.stringify({recipientIds:ids}),'synthetic','admin');setAllow();
 const log=(id,department)=>{const body={userId:id,userName:'합성 '+id,department,approvalStatus:'APPROVED_FINAL',overallNotes:'상신 원문 '+id,items:[{projectCode:'QA-WEEK',projectName:'한국어 현장',roleName:'내부',progress:40,status:'진행중',todayTask:'물량 검토'}]};db.prepare('INSERT INTO studio_worklogs VALUES (?,?,?,?,?,?,?)').run('wl-'+id,id,week,department,JSON.stringify(body),1,0);};log('worker','마감팀');log('peer','마감팀');log('structure','구조팀');log('civil','토목&조경팀');
 db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run('qa',JSON.stringify({id:'qa',code:'QA-WEEK',name:'한국어 현장',department:'마감팀',scheduleExtensions:[{id:'ot',type:'OVERTIME',status:'APPROVED',userId:'worker',workDate:week,startTime:'17:00',endTime:'20:00',roleName:'내부'}]}),1,'synthetic','u_12');
 const actor=id=>db.prepare('SELECT * FROM studio_users WHERE id=?').get(id);
 const request=async(id,path,method='GET',body)=>{const response=await weeklyApprovalRoute(new Request('https://example.invalid/api/studio/'+path+'?week='+week,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB},actor(id),path);return response?{status:response.status,data:await response.json()}:null;};
 const submit=(id='u_12',recipientIds=['executive','director'],department='마감팀')=>request(id,'weekly-reports/submit','POST',{week,department,recipientIds});
 const decide=(id,submission,decision='APPROVED')=>request(id,'weekly-reports/decision','POST',{id:submission.id,revision:submission.revision,decision,memo:'합성 검토'});
 const configure=(ids=['executive','director'])=>db.prepare('INSERT INTO studio_reporting_settings VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run('weekly-reporting',JSON.stringify({recipientIds:ids}),'synthetic','admin');
 const scheduled=(instant='2026-10-16T08:10:00Z')=>sendScheduledWeeklyApprovals({DB},{now:new Date(instant)});
 return {db,DB,actor,setAllow,request,submit,decide,configure,scheduled};
}
const ownRows=report=>report.teams.flatMap(team=>team.employees).map(person=>person.id);
async function test(name,fn){const q=fixture();try{const observed=await fn(q);results.push({name,status:'PASS',observed});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}finally{q.db.close();}}

await test('직급 추측 없는 활성 allowlist 선택: 부사장·비활성·미등록·중복 계정 모두 차단',async q=>{
 const listed=await q.request('u_12','weekly-reports/submissions');assert.equal(listed.status,200);assert.deepEqual(listed.data.recipientOptions.map(person=>person.id),['executive','director']);assert.deepEqual(listed.data.departments,['마감팀']);
 for(const ids of [[],['guessed'],['inactive'],['missing'],['executive','executive'],[1]])assert.equal((await q.submit('u_12',ids)).status,400);
 assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,0);return {options:listed.data.recipientOptions};
});
await test('상신 권한: 일반 직원·타 팀 관리자 불가, 팀 실장/팀장과 확정 관리자만 가능',async q=>{
 assert.equal((await q.submit('worker')).status,403);assert.equal((await q.submit('u_25')).status,403);assert.equal((await q.submit('guessed')).status,403);assert.equal((await q.submit('u_13',['executive'])).status,200);assert.equal((await q.submit('admin',['executive'],'구조팀')).status,200);
 const fresh=await q.request('worker','weekly-reports/submissions');assert.equal(fresh.data.canSubmit,false);return {allowed:['u_13','admin']};
});
await test('불변 주간 상신본: 선택 팀의 일지와 승인 야근 3시간 보존, 원문 후속수정 분리',async q=>{
 const result=await q.submit();assert.equal(result.status,200);const report=result.data.submission;assert.equal(report.weekStart,week);assert.equal(report.weekEnd,'2026-10-18');assert.equal(report.status,'PENDING');assert.equal(report.revision,1);assert.deepEqual(report.teams.map(team=>team.department),['마감팀']);assert.equal(report.teams[0].employees.find(person=>person.id==='worker').overtimeHours,3);
 const frozen=q.db.prepare('SELECT body FROM studio_weekly_submissions WHERE id=?').get(report.id).body;q.db.prepare('UPDATE studio_worklogs SET body=? WHERE id=?').run(JSON.stringify({overallNotes:'나중 수정',items:[]}), 'wl-worker');
 const read=await q.request('executive','weekly-reports/submissions');assert.equal(read.data.submissions[0].teams[0].employees.find(person=>person.id==='worker').days[0].notes,'상신 원문 worker');assert.equal(q.db.prepare('SELECT body FROM studio_weekly_submissions WHERE id=?').get(report.id).body,frozen);return {report};
});
await test('상신 조회 범위: 일반 직원은 본인 행, 같은 팀 관리자·선택 수신자만 팀 전체, 타 팀 차단',async q=>{
 await q.submit();const worker=await q.request('worker','weekly-reports/submissions');assert.equal(worker.data.submissions.length,1);assert.deepEqual(ownRows(worker.data.submissions[0]),['worker']);
 for(const id of ['u_13','executive','director','admin'])assert.ok(ownRows((await q.request(id,'weekly-reports/submissions')).data.submissions[0]).includes('peer'));
 for(const id of ['u_25','structure','guessed'])assert.equal((await q.request(id,'weekly-reports/submissions')).data.submissions.length,0);return {workerRows:ownRows(worker.data.submissions[0])};
});
await test('승인 중 같은 주·팀 중복 및 동시 상신 방지: 원문/수신 알림이 단 한 본',async q=>{
 const pair=await Promise.all([q.submit(),q.submit('u_13')]);assert.deepEqual(pair.map(row=>row.status).sort(),[200,409]);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,2);assert.equal((await q.submit()).status,409);return {statuses:pair.map(row=>row.status)};
});
await test('결재자 전원 승인: 첫 승인 대기·둘째 승인 완료, 버전 증가와 중복 결정 차단',async q=>{
 const initial=(await q.submit()).data.submission;assert.equal((await q.decide('u_12',initial)).status,403);assert.equal((await q.decide('guessed',initial)).status,403);
 const first=await q.decide('executive',initial);assert.equal(first.status,200);assert.equal(first.data.submission.status,'PENDING');assert.equal(first.data.submission.revision,2);assert.equal((await q.decide('director',initial)).status,409);assert.equal((await q.decide('executive',first.data.submission)).status,409);
 const second=await q.decide('director',first.data.submission);assert.equal(second.status,200);assert.equal(second.data.submission.status,'APPROVED');assert.equal(second.data.submission.revision,3);assert.ok(second.data.submission.recipients.every(person=>person.decision==='APPROVED'));assert.equal((await q.decide('director',second.data.submission)).status,409);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,4);return {first:first.data.submission.status,final:second.data.submission.status};
});
await test('한 명 반려 시 종료, 새 본 재상신 가능하며 이전 원문·결정·메모 보존',async q=>{
 const initial=(await q.submit()).data.submission,frozen=q.db.prepare('SELECT body FROM studio_weekly_submissions').get().body,decided=await q.decide('executive',initial,'REJECTED');assert.equal(decided.status,200);assert.equal(decided.data.submission.status,'REJECTED');assert.equal((await q.decide('director',decided.data.submission)).status,409);
 const again=await q.submit();assert.equal(again.status,200);assert.notEqual(again.data.submission.id,initial.id);assert.equal(q.db.prepare('SELECT body FROM studio_weekly_submissions WHERE id=?').get(initial.id).body,frozen);const review=q.db.prepare('SELECT decision,memo FROM studio_weekly_submission_recipients WHERE submission_id=? AND recipient_id=?').get(initial.id,'executive');assert.deepEqual({...review},{decision:'REJECTED',memo:'합성 검토'});assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,2);return {oldId:initial.id,newId:again.data.submission.id};
});
await test('상신 CAS: 저장 직전 계정 직급/allowlist/수신자 활성 변경 시 원문과 알림 모두 취소',async q=>{
 const batch=q.DB.batch;q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_users SET position=? WHERE id=?').run('프로','u_12');return batch(statements);};assert.equal((await q.submit()).status,409);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,0);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);q.DB.batch=batch;q.db.prepare('UPDATE studio_users SET position=? WHERE id=?').run('실장','u_12');
 q.DB.batch=async statements=>{q.setAllow(['director']);return batch(statements);};assert.equal((await q.submit()).status,409);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);q.setAllow();
 q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('executive');return batch(statements);};assert.equal((await q.submit()).status,409);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,0);return {atomic:true};
});
await test('결정 CAS: 버전 경쟁/allowlist 교체/비활성은 결정과 알림 원자적 취소',async q=>{
 const initial=(await q.submit()).data.submission,batch=q.DB.batch,notes=q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n;q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_weekly_submissions SET revision=revision+1 WHERE id=?').run(initial.id);return batch(statements);};assert.equal((await q.decide('executive',initial)).status,409);assert.equal(q.db.prepare('SELECT decision FROM studio_weekly_submission_recipients WHERE submission_id=? AND recipient_id=?').get(initial.id,'executive').decision,null);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,notes);q.DB.batch=batch;
 const latest={...initial,revision:2};q.DB.batch=async statements=>{q.setAllow(['director']);return batch(statements);};assert.equal((await q.decide('executive',latest)).status,409);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,notes);q.DB.batch=batch;assert.equal((await q.decide('executive',latest)).status,403);q.setAllow();q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('executive');assert.equal((await q.decide('executive',latest)).status,403);return {atomic:true};
});
await test('잘못된 입력/요청 방식·서버 값 임의 주입 차단',async q=>{
 for(const body of [{week:'2026-10-32',department:'마감팀',recipientIds:['executive']},{week,department:'없는팀',recipientIds:['executive']}])assert.equal((await q.request('u_12','weekly-reports/submit','POST',body)).status,400);
 assert.equal((await q.request('u_12','weekly-reports/submit')).status,405);assert.equal(await q.request('u_12','other-resource'),null);for(const body of [{id:'missing',revision:1,decision:'APPROVED'},{id:'id',revision:0,decision:'APPROVED'},{id:'id',revision:1,decision:'bad'}])assert.notEqual((await q.request('executive','weekly-reports/decision','POST',body)).status,200);
 const forged=await q.request('u_12','weekly-reports/submit','POST',{week,department:'마감팀',recipientIds:['executive'],teams:[{department:'구조팀',employees:[{id:'secret'}]}],status:'APPROVED',authorId:'worker'});assert.equal(forged.status,200);assert.equal(forged.data.submission.status,'PENDING');assert.equal(forged.data.submission.authorId,'u_12');assert.deepEqual(forged.data.submission.teams.map(team=>team.department),['마감팀']);return {serverOwned:true};
});
await test('ALL 상신은 관리자만 허용하고 팀장 조회는 소속 팀만, 직원은 본인 행만',async q=>{
 assert.equal((await q.submit('u_12',['executive'],'ALL')).status,403);const all=await q.submit('admin',['executive'],'ALL');assert.equal(all.status,200);assert.deepEqual(all.data.submission.teams.map(team=>team.department),['마감팀','구조팀','토목&조경팀']);
 const manager=(await q.request('u_25','weekly-reports/submissions')).data.submissions[0];assert.deepEqual(manager.teams.map(team=>team.department),['구조팀']);const employee=(await q.request('worker','weekly-reports/submissions')).data.submissions[0];assert.deepEqual(ownRows(employee),['worker']);return {allTeams:all.data.submission.teams.map(team=>team.department),managerTeams:manager.teams.map(team=>team.department)};
});
await test('정기 상신 due: 금요일 17:10 이전·다른 요일 미실행, 설정 또는 활성 allowlist 없는 경우 미상신',async q=>{
 q.configure();for(const instant of ['2026-10-16T08:09:59Z','2026-10-15T08:10:00Z','2026-10-17T08:10:00Z'])assert.equal((await q.scheduled(instant)).status,'NOT_DUE');q.configure([]);assert.equal((await q.scheduled()).status,'RECIPIENTS_REQUIRED');q.configure(['guessed']);assert.equal((await q.scheduled()).status,'RECIPIENTS_REQUIRED');q.configure(['executive']);q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('executive');assert.equal((await q.scheduled()).status,'RECIPIENTS_REQUIRED');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,0);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {noUnauthorizedDelivery:true};
});
await test('정기 상신은 전체 팀 불변 원문·결재자·기존 발송 metadata를 한 batch에 저장, 예약 재시도 중복 없음',async q=>{
 q.configure();const both=await Promise.all([q.scheduled(),q.scheduled()]);assert.equal(both.filter(result=>result.status==='SENT').length,1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_reports').get().n,1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,2);
 const stored=q.db.prepare('SELECT * FROM studio_weekly_submissions').get();assert.equal(stored.source,'SCHEDULED');assert.equal(stored.department,'ALL');assert.equal(stored.author_name,'시스템 정기 보고');assert.equal(stored.status,'PENDING');assert.equal(stored.sent_at,'2026-10-16T08:10:00.000Z');assert.equal(stored.body,q.db.prepare('SELECT body FROM studio_weekly_reports').get().body);assert.equal((await q.scheduled('2026-10-16T08:20:00Z')).status,'ALREADY_SENT');const read=(await q.request('executive','weekly-reports/submissions')).data.submissions[0];assert.equal(read.source,'SCHEDULED');assert.equal((await q.decide('executive',read)).status,200);return {statuses:both.map(result=>result.status),source:stored.source};
});
await test('정기 상신 CAS: 발송 직전 defaults·allowlist·수신자 비활성 변경이면 본문·metadata·알림 동시 취소',async q=>{
 q.configure();const batch=q.DB.batch;q.DB.batch=async statements=>{q.configure(['director']);return batch(statements);};assert.equal((await q.scheduled()).status,'CONFLICT_RETRY');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,0);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_reports').get().n,0);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);q.configure();q.DB.batch=async statements=>{q.setAllow(['director']);return batch(statements);};assert.equal((await q.scheduled()).status,'CONFLICT_RETRY');q.setAllow();q.DB.batch=async statements=>{q.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('executive');return batch(statements);};assert.equal((await q.scheduled()).status,'CONFLICT_RETRY');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_reports').get().n,0);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);return {atomic:true};
});
await test('관리자가 ALL 수기 상신 결재 중이면 정기 발송이 별도 대기본을 중복 생성하지 않음',async q=>{
 q.configure();assert.equal((await q.submit('admin',['executive'],'ALL')).status,200);assert.equal((await q.scheduled()).status,'PENDING_EXISTS');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_weekly_submissions').get().n,1);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,1);return {status:'PENDING_EXISTS'};
});

const output=process.argv.find(arg=>arg.startsWith('--output='));if(output)writeFileSync(output.slice(9),JSON.stringify({kind:'ACTUAL_WEEKLY_APPROVAL_ROUTE_SQLITE_D1',operatingWrites:0,externalCalls:0,results},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
