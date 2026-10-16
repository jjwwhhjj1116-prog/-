import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {assignedItems,automaticWorkLogItems,dayOff,reconcileWorkLogItems} from '../src/utils/personalWork.ts';
import {workDays,plannedWorkDays,scheduleProgress} from '../src/utils/scheduleProgress.ts';
import {vietCalendarPreset,workCalendarContext} from '../src/utils/workCalendar.ts';
import {syncAutomaticWorklogs} from '../../functions/lib/automaticWorklogs.ts';
import {personalRoute} from '../../functions/lib/personal.ts';
import {buildWeeklyReport} from '../../functions/lib/weeklyReports.ts';

const calendar={...vietCalendarPreset(2026),revision:1},vn=workCalendarContext({company:'VIETQS'},[calendar]),kr=workCalendarContext({company:'컨코스트'},[calendar]),results=[];
const task={roleName:'내부',personIds:['vn','kr'],startDate:'2026-01-01',endDate:'2026-12-31',status:'예정',memo:'합성 업무',progress:0};
const project={id:'calendar-personal',code:'QA-CALENDAR',name:'합성 회사 근무달력',department:'마감팀',startDate:task.startDate,endDate:task.endDate,status:'진행중',progress:0,roles:{},subTasks:{내부:task}};
function fixture(){
 const {db,DB}=database();
 for(const [id,company,position,email] of [['vn','VIETQS','프로','vn@example.invalid'],['kr','컨코스트','프로','kr@example.invalid'],['u_13','컨코스트','팀장','leader@example.invalid'],['u_12','컨코스트','실장','chief@example.invalid'],['admin','컨코스트','실장','yjw@con-cost.com']]){const profile={id,company,name:id,department:'마감팀',position,email,role:id==='admin'?'ADMIN':'MEMBER'};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,id,email,id,'마감팀',position,JSON.stringify(profile),'synthetic','unused',1);}
 const writeCalendar=value=>db.prepare('INSERT INTO studio_reporting_settings VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run('work-calendar:VIETQS:'+value.year,JSON.stringify(value),'synthetic','admin');writeCalendar(calendar);
 const putProject=value=>db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,revision=revision+1').run(value.id,JSON.stringify(value),1,'synthetic','u_12');putProject(project);
 const actor=id=>db.prepare('SELECT * FROM studio_users WHERE id=?').get(id),row=(id,day)=>db.prepare('SELECT * FROM studio_worklogs WHERE user_id=? AND day=? AND removed=0').get(id,day);
 const api=async(id,route='personal',method='GET',body)=>{const response=await personalRoute(new Request('https://example.invalid/api/collaboration/'+route,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{DB},actor(id),route);return {status:response.status,data:await response.json()};};
 return {db,DB,actor,row,api,writeCalendar,putProject,sync:(day,options={})=>syncAutomaticWorklogs({DB},{now:new Date(day+'T08:00:00Z'),...options})};
}
async function check(name,fn){try{const observed=await fn();results.push({name,status:'PASS',observed});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.stack});console.error('FAIL',name,error.message);}}

await check('소유자별 정규 토요일·회사 휴일: KR 기본/VIETQS 확정연도와 정적VN 대체',()=>{
 for(const day of [...Array.from({length:11},(_,index)=>'2026-02-'+String(13+index)),'2026-10-17'])assert.equal(assignedItems('vn',day,[project],['vn'],vn).length,0,day);
 for(const day of ['2026-09-03','2026-10-09','2026-10-10'])assert.equal(assignedItems('vn',day,[project],['vn'],vn).length,1,day);
 assert.equal(assignedItems('kr','2026-10-10',[project],['kr'],kr).length,0);assert.equal(dayOff('2026-10-09',kr),'한글날');assert.equal(dayOff('2026-10-09',vn),'');assert.equal(calendar.saturdayOffDates.length,26);
});
await check('진척률은 소유자 근무일로 계산, 기존 Set 인자·미등록연도 보호 유지',()=>{
 const period={...task,startDate:'2026-10-05',endDate:'2026-10-10'};
 assert.equal(workDays(period.startDate,period.endDate),3);assert.equal(workDays(period.startDate,period.endDate,undefined,vn),6);assert.equal(plannedWorkDays(period,vn),6);assert.equal(scheduleProgress({내부:period},'2026-10-09',vn).planned,5/6*100);
 const items=automaticWorkLogItems(assignedItems('vn','2026-10-09',[{...project,subTasks:{내부:period}}],['vn'],vn),'2026-10-09',vn);assert.equal(items[0].progress,83.33);
 assert.equal(workDays('2028-01-03','2028-01-07',undefined,vn),undefined);assert.equal(workDays('2028-01-03','2028-01-07',new Set()),5);const future=workCalendarContext({company:'VIETQS'},[{...vietCalendarPreset(2028),revision:1}]);assert.equal(workDays('2028-01-03','2028-01-07',undefined,future),5);assert.equal(workDays('2027-12-31','2029-01-02',undefined,{company:'VIETQS',calendars:[{...vietCalendarPreset(2029),revision:1}]}),undefined);
});
await check('휴무 토요일은 exact 승인 user/task/date만 예외, 기한밖 승인도 원기간 불변',()=>{
 const p=structuredClone(project);p.subTasks.내부.endDate='2026-10-16';p.scheduleExtensions=[{id:'approved',type:'WEEKEND',status:'APPROVED',userId:'vn',taskId:'gen-calendar-personal-내부',workDate:'2026-10-17'}];const original=JSON.stringify(p);
 assert.equal(assignedItems('vn','2026-10-17',[p],['vn'],vn).length,1);assert.equal(assignedItems('kr','2026-10-17',[p],['kr'],kr).length,0);assert.equal(assignedItems('vn','2026-10-18',[p],['vn'],vn).length,0);
 p.scheduleExtensions[0].taskId='wrong';assert.equal(assignedItems('vn','2026-10-17',[p],['vn'],vn).length,0);p.scheduleExtensions[0].taskId='gen-calendar-personal-내부';assert.equal(JSON.stringify(p),original);
});
await check('실제 자동보고 함수: VN 근무토요일은 신청 없이 정규 제출, KR 무신청 제외',async()=>{
 const q=fixture(),result=await q.sync('2026-10-10');assert.equal(result.submitted,1);assert.ok(q.row('vn','2026-10-10'));assert.equal(q.row('kr','2026-10-10'),undefined);const log=JSON.parse(q.row('vn','2026-10-10').body);assert.equal(log.approvalStatus,'SUBMITTED_LEADER');assert.equal(log.authorSignature.signed,true);assert.equal(q.db.prepare("SELECT count(*) n FROM studio_notifications WHERE id='worklog:wl-2026-10-10-vn:submit:u_13'").get().n,1);return result;
});
await check('KR휴일 전역 조기종료 제거: 같은 날 VN만 제출, VN확정휴무는 제외',async()=>{
 const q=fixture();assert.equal((await q.sync('2026-10-09')).submitted,1);assert.ok(q.row('vn','2026-10-09'));assert.equal(q.row('kr','2026-10-09'),undefined);
 for(const day of ['2026-02-14','2026-10-17']){const next=fixture();assert.equal((await next.sync(day)).submitted,0);assert.equal(next.row('vn',day),undefined);}
 const replacement=fixture();await replacement.sync('2026-09-03');assert.ok(replacement.row('vn','2026-09-03'));
});
await check('기존 KR 승인주말 예외와 과거 서명 원본은 새 회사달력에도 유지',async()=>{
 const q=fixture(),p=structuredClone(project);p.scheduleExtensions=[{id:'kr-weekend',type:'WEEKEND',status:'APPROVED',userId:'kr',taskId:'gen-calendar-personal-내부',workDate:'2026-10-17'}];q.putProject(p);assert.equal((await q.sync('2026-10-17')).submitted,1);const before=q.row('kr','2026-10-17');q.writeCalendar({...calendar,revision:2,exceptions:[...calendar.exceptions,{id:'extra',kind:'HOLIDAY',startDate:'2026-10-19',endDate:'2026-10-19',name:'합성 회사휴무'}]});await q.sync('2026-10-17');assert.deepEqual(q.row('kr','2026-10-17'),before);
});
await check('개인 API는 근무달력 1회 읽기·company 반환, 관리자 아닌 일지 소유자 기준 투영',async()=>{
 const q=fixture();await q.sync('2026-10-10',{submit:false});let calendarReads=0;const prepare=q.DB.prepare;q.DB.prepare=sql=>{if(sql.includes("id LIKE 'work-calendar:VIETQS:%'"))calendarReads++;return prepare(sql);};const response=await q.api('admin');assert.equal(response.status,200);assert.equal(calendarReads,1);assert.equal(response.data.workCalendars[0].revision,1);assert.equal(response.data.directory.find(person=>person.id==='vn').company,'VIETQS');assert.equal(response.data.worklogs.find(log=>log.userId==='vn').items.length,1);
 const taskId='gen-calendar-personal-내부';assert.equal((await q.api('vn','task-checks','POST',{day:'2026-10-10',taskId,done:true})).status,200);assert.equal((await q.api('kr','task-checks','POST',{day:'2026-10-10',taskId,done:true})).status,403);
});
await check('수기 필드 보존·이미 서명한 본문은 GET/자동 재실행으로 변경하지 않음',async()=>{
 const q=fixture();await q.sync('2026-10-10',{submit:false});const row=q.row('vn','2026-10-10'),log=JSON.parse(row.body);Object.assign(log.items[0],{todayTask:'수기 원문',tomorrowPlan:'수기 내일',progress:27,manualFields:['todayTask','tomorrowPlan','progress']});q.db.prepare('UPDATE studio_worklogs SET body=? WHERE id=?').run(JSON.stringify(log),row.id);await q.sync('2026-10-10');const signed=q.row('vn','2026-10-10');assert.equal(JSON.parse(signed.body).items[0].progress,27);assert.equal(JSON.parse(signed.body).items[0].tomorrowPlan,'수기 내일');await q.api('admin');await q.sync('2026-10-10');assert.deepEqual(q.row('vn','2026-10-10'),signed);
});
await check('명시 업무일지 저장은 VN 정규토요일 업무·진척률을 유지하고 자동 상신하지 않음',async()=>{
 const q=fixture(),items=automaticWorkLogItems(assignedItems('vn','2026-10-10',[project],['vn'],vn),'2026-10-10',vn),id='explicit-vn-saturday',response=await q.api('vn','worklogs/'+id,'PUT',{log:{id,date:'2026-10-10',items,overallNotes:'직접 저장 원문',reportMode:'DAILY'}});assert.equal(response.status,200);assert.equal(response.data.log.items.length,1);assert.equal(response.data.log.approvalStatus,'DRAFT');assert.equal(response.data.log.overallNotes,'직접 저장 원문');assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);
});
await check('근무달력 revision 또는 소유자 company가 계산 뒤 바뀌면 자동보고 원자적 취소',async()=>{
 for(const mutation of ['calendar','company']){const q=fixture(),batch=q.DB.batch;q.DB.batch=async statements=>{if(mutation==='calendar')q.writeCalendar({...calendar,revision:2});else{const profile=JSON.parse(q.actor('vn').profile);profile.company='컨코스트';q.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(profile),'vn');}return batch(statements);};const result=await q.sync('2026-10-10',{onlyUserId:'vn'});assert.equal(result.conflicts,1,mutation);assert.equal(q.row('vn','2026-10-10'),undefined);assert.equal(q.db.prepare('SELECT count(*) n FROM studio_notifications').get().n,0);}
});
await check('주간 보완 투영도 VN 근무토요일 포함·휴무일 제외, 저장된 서명본문 불변',async()=>{
 const q=fixture(),p=structuredClone(project);p.postDeliveryTasks=[{id:'follow',kind:'수정',startDate:'2026-10-10',endDate:'2026-10-10',memo:'합성 주말 정규보완',personIds:['vn'],department:'마감팀',submissionStatus:'REPORTED',submittedAt:'2026-10-09T00:00:00Z',revision:1,status:'예정'}];q.putProject(p);const report=await buildWeeklyReport({DB:q.DB},q.actor('admin'),'2026-10-05',new Date('2026-10-10T09:00:00Z')),owner=report.teams[0].employees.find(person=>person.id==='vn');assert.equal(owner.days[5].supplementReports.length,1);assert.equal(owner.days[5].supplementReports[0].progress,100);assert.equal(owner.days[6].supplementReports.length,0);
});
const output=process.argv.find(arg=>arg.startsWith('--output='));if(output)writeFileSync(output.slice(9),JSON.stringify({kind:'ACTUAL_PERSONAL_CALENDAR_FUNCTIONS_SQLITE_D1',operatingWrites:0,results,limits:['Synthetic fixtures and fixed dates execute actual shared/server functions; not operating D1 or scheduled-time proof.']},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
