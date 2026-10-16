import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash,tokenHash} from '../../functions/lib/collaboration.ts';
import {readWorkCalendars,workCalendarRoute} from '../../functions/lib/workCalendars.ts';
import {workDayInfo} from '../src/utils/workCalendar.ts';

const results=[],output=process.argv[2]||'test-results/work-calendars-api144.json',secret=()=>crypto.randomUUID().replaceAll('-','');
const calendar=(patch={})=>({company:'VIETQS',year:2026,revision:0,saturdayOffDates:['2026-10-17','2026-10-03'],exceptions:[{id:'holiday',kind:'HOLIDAY',startDate:'2026-10-05',endDate:'2026-10-06',name:'회사 휴무'}],...patch});
async function fixture(){
 const {db,DB}=database(),cookies=new Map();db.exec(readFileSync(new URL('../../migrations/0009_weekly_reports.sql',import.meta.url),'utf8'));
 const profiles=[{id:'admin',email:'yjw@con-cost.com',department:'개발 TF',position:'실장',company:'컨코스트',role:'ADMIN'},{id:'leader',department:'마감팀',position:'팀장',company:'컨코스트'},{id:'chief',department:'구조팀',position:'실장',company:'컨코스트'},{id:'member',department:'마감팀',position:'프로',company:'컨코스트'},{id:'vnleader',department:'마감팀',position:'팀장',company:'VIETQS'},{id:'foreign',department:'마감팀',position:'실장',company:'기타회사'}];
 for(const record of profiles){const profile={name:'합성 '+record.id,email:record.id+'@example.invalid',role:'MEMBER',...record},salt=secret(),token=secret();db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(record.id,record.id,profile.email,profile.name,record.department,record.position,JSON.stringify(profile),salt,await passwordHash(secret(),salt));db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash(token),record.id,Date.now()+3600000);cookies.set(record.id,'studio_session='+token);}
 db.prepare('INSERT INTO studio_reporting_settings VALUES (?,?,?,?)').run('weekly-reporting','{"recipientIds":["existing-executive"]}','unchanged','admin');
 db.prepare('INSERT INTO studio_projects VALUES (?,?,?,?,?)').run('qa-project','{"id":"qa-project","progress":42,"memo":"원본"}',7,'unchanged','admin');
 db.prepare('INSERT INTO studio_worklogs (id,user_id,day,department,body) VALUES (?,?,?,?,?)').run('qa-signed','member','2026-10-05','마감팀','{"id":"qa-signed","approvalStatus":"APPROVED_FINAL","signature":"보존"}');
 const actor=id=>db.prepare('SELECT * FROM studio_users WHERE id=?').get(id),request=async(id,method='GET',input,path='work-calendars')=>{const response=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+path,{method,headers:{...(id?{Cookie:cookies.get(id)}:{}),...(input!==undefined?{'Content-Type':'application/json'}:{})},...(input!==undefined?{body:JSON.stringify(input)}:{})}),{DB},async()=>{throw Error('외부 archive 요청금지');});return {status:response.status,data:await response.json()};};
 const save=(id='admin',value=calendar(),baseRevision=value.revision)=>request(id,'POST',{calendar:value,baseRevision});
 const state=()=>({rows:db.prepare('SELECT * FROM studio_reporting_settings ORDER BY id').all(),versions:db.prepare('SELECT * FROM studio_sync_versions ORDER BY key').all()}),history=()=>({projects:db.prepare('SELECT * FROM studio_projects').all(),logs:db.prepare('SELECT * FROM studio_worklogs').all(),weekly:db.prepare('SELECT * FROM studio_reporting_settings WHERE id=?').get('weekly-reporting')});
 return {db,DB,actor,request,save,state,history};
}
const status=(result,code)=>{assert.equal(result.status,code);return result;};
async function check(name,fn){const f=await fixture();try{await fn(f);results.push({name,status:'PASS'});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',reason:error.message});console.error('FAIL',name,error.message);}finally{f.db.close();}}
await check('로그인직원 전체조회·정확권한: 관리자/국내팀장실장만수정가능, 익명401',async f=>{
 for(const id of ['admin','leader','chief','member','vnleader','foreign']){const response=status(await f.request(id),200);assert.deepEqual(response.data.workCalendars,[]);assert.equal(response.data.canManage,['admin','leader','chief'].includes(id));}
 status(await f.request(null),401);const before=f.state();for(const id of [null,'member','vnleader','foreign'])status(await f.save(id),id?403:401);assert.deepEqual(f.state(),before);
});
await check('관리자와국내팀장실장저장: 연도행·revision·정렬된토요일과personal버전만변경',async f=>{
 const before=f.history(),version=f.db.prepare("SELECT revision FROM studio_sync_versions WHERE key='personal'").get().revision;
 for(const [index,id]of ['admin','leader','chief'].entries()){const saved=status(await f.save(id,calendar({revision:index})),200).data.calendar;assert.equal(saved.revision,index+1);assert.deepEqual(saved.saturdayOffDates,['2026-10-03','2026-10-17']);}
 const rows=await readWorkCalendars(f.DB);assert.equal(rows.length,1);assert.equal(rows[0].revision,3);assert.equal(f.db.prepare('SELECT updated_by FROM studio_reporting_settings WHERE id=?').get('work-calendar:VIETQS:2026').updated_by,'chief');assert.equal(f.db.prepare("SELECT revision FROM studio_sync_versions WHERE key='personal'").get().revision,version+3);assert.deepEqual(f.history(),before);
});
await check('실제공유API연결: 등록후다른직원personal응답에같은달력·changes버전수신,서명원문불변',async f=>{
 const original=f.history(),before=status(await f.request('member','GET',undefined,'changes'),200).data.versions.personal,saved=status(await f.save(),200).data.calendar;
 const response=status(await f.request('member','GET',undefined,'personal'),200).data;assert.deepEqual(response.workCalendars,[saved]);assert.equal(response.worklogs[0].approvalStatus,'APPROVED_FINAL');assert.deepEqual(f.history(),original);assert.equal(status(await f.request('member','GET',undefined,'changes'),200).data.versions.personal,before+1);
});
await check('잘못된회사·연도·revision·필드·배열·토요일·날짜·중복은400이며쓰기0',async f=>{
 const before=f.state();for(const patch of [{company:'컨코스트'},{year:'2026'},{year:1999},{year:2101},{revision:-1},{revision:1.5},{extra:true},{saturdayOffDates:null},{saturdayOffDates:['2026-10-16']},{saturdayOffDates:['2025-10-04']},{saturdayOffDates:['2026-10-17','2026-10-17']},{saturdayOffDates:Array(54).fill('2026-10-17')},{exceptions:null},{exceptions:[{id:'x',kind:'UNKNOWN',startDate:'2026-10-01',endDate:'2026-10-01',name:'휴무'}]},{exceptions:[{id:'x',kind:'HOLIDAY',startDate:'2026-10-32',endDate:'2026-10-32',name:'휴무'}]},{exceptions:[{id:'x',kind:'HOLIDAY',startDate:'2026-10-02',endDate:'2026-10-01',name:'휴무'}]},{exceptions:[{id:'x',kind:'HOLIDAY',startDate:'2026-12-31',endDate:'2027-01-01',name:'휴무'}]},{exceptions:[{id:'x',kind:'HOLIDAY',startDate:'2026-10-01',endDate:'2026-10-01',name:' '}]},{exceptions:[{id:'x'.repeat(101),kind:'HOLIDAY',startDate:'2026-10-01',endDate:'2026-10-01',name:'휴무'}]},{exceptions:[{id:'x',kind:'HOLIDAY',startDate:'2026-10-01',endDate:'2026-10-01',name:'x'.repeat(121)}]}])status(await f.save('admin',calendar(patch)),400);
 for(const input of [null,[],{}, {calendar:calendar(),baseRevision:'0'},{calendar:calendar({revision:1}),baseRevision:0},{calendar:calendar(),baseRevision:0,untrusted:true}])status(await f.request('admin','POST',input),400);assert.deepEqual(f.state(),before);
});
await check('같은종류중복범위/id는거부하고휴일+명시대체근무겹침은허용·근무우선',async f=>{
 const entry=calendar().exceptions[0],before=f.state();for(const exceptions of [[entry,{...entry,id:'other'}],[entry,{...entry,startDate:'2026-10-07',endDate:'2026-10-08'}]])status(await f.save('admin',calendar({exceptions})),400);assert.deepEqual(f.state(),before);
 const saved=status(await f.save('admin',calendar({exceptions:[entry,{id:'replacement',kind:'WORKDAY',startDate:'2026-10-06',endDate:'2026-10-06',name:'대체 근무'}]})),200).data.calendar;assert.equal(workDayInfo('2026-10-05',{company:'VIETQS',calendars:[saved]}).working,false);const override=workDayInfo('2026-10-06',{company:'VIETQS',calendars:[saved]});assert.equal(override.working,true);assert.equal(override.name,'대체 근무');
});
await check('연도격리: 복수연도공유와2026변경이2027행·수신설정·서명기록불변',async f=>{
 status(await f.save(),200);status(await f.save('leader',calendar({year:2027,saturdayOffDates:['2027-01-02'],exceptions:[]})),200);const other=f.db.prepare('SELECT * FROM studio_reporting_settings WHERE id=?').get('work-calendar:VIETQS:2027'),history=f.history();status(await f.save('admin',calendar({revision:1,saturdayOffDates:[]})),200);assert.deepEqual(f.db.prepare('SELECT * FROM studio_reporting_settings WHERE id=?').get('work-calendar:VIETQS:2027'),other);assert.deepEqual(f.history(),history);assert.deepEqual((await readWorkCalendars(f.DB)).map(value=>value.year),[2026,2027]);
});
await check('오래된revision은409로원문보존·동시최초등록은1건만성공',async f=>{
 status(await f.save(),200);const before=f.state();status(await f.save(),409);assert.deepEqual(f.state(),before);
 const fresh=await fixture();try{const both=await Promise.all([fresh.save('admin'),fresh.save('leader')]);assert.equal(both.filter(result=>result.status===200).length,1);assert.equal(both.filter(result=>result.status===409).length,1);assert.equal((await readWorkCalendars(fresh.DB))[0].revision,1);}finally{fresh.db.close();}
});
await check('읽은뒤다른PC변경 CAS: 갱신본문/metadata/버전을덮어쓰지않음',async f=>{
 status(await f.save(),200);const batch=f.DB.batch,newer=calendar({revision:2,saturdayOffDates:[]}),newerBody=JSON.stringify(newer);let before;
 f.DB.batch=statements=>{f.db.prepare('UPDATE studio_reporting_settings SET body=?,updated_by=? WHERE id=?').run(newerBody,'other-PC','work-calendar:VIETQS:2026');before=f.state();return batch(statements);};status(await f.save('admin',calendar({revision:1})),409);assert.deepEqual(f.state(),before);assert.equal((await readWorkCalendars(f.DB))[0].revision,2);
});
await check('권한TOCTOU: 저장직전퇴사·부서/직급/회사변경 모두403아닌409보류·calendar쓰기0',async f=>{
 const batch=f.DB.batch;
 for(const field of ['active','department','position','company']){f.DB.batch=statements=>{const person=f.actor('leader'),profile=JSON.parse(person.profile);if(field==='active')f.db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('leader');else if(field==='company'){profile.company='VIETQS';f.db.prepare('UPDATE studio_users SET profile=? WHERE id=?').run(JSON.stringify(profile),'leader');}else f.db.prepare(`UPDATE studio_users SET ${field}=? WHERE id=?`).run('변경됨','leader');return batch(statements);};status(await workCalendarRoute(new Request('https://qa.invalid/work-calendars',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({calendar:calendar(),baseRevision:0})}),{DB:f.DB},f.actor('leader'),'work-calendars').then(async response=>({status:response.status,data:await response.json()})),409);assert.equal(f.db.prepare("SELECT count(*) n FROM studio_reporting_settings WHERE id LIKE 'work-calendar:%'").get().n,0);const original={id:'leader',name:'합성 leader',email:'leader@example.invalid',role:'MEMBER',department:'마감팀',position:'팀장',company:'컨코스트'};f.db.prepare('UPDATE studio_users SET active=1,department=?,position=?,profile=? WHERE id=?').run(original.department,original.position,JSON.stringify(original),'leader');}
});
await check('batch후반실패는달력upsert·personal버전까지원자rollback',async f=>{
 status(await f.save(),200);const before=f.state(),batch=f.DB.batch;f.DB.batch=statements=>batch([...statements,f.DB.prepare('INSERT INTO studio_write_assertions VALUES (0)')]);status(await f.save('admin',calendar({revision:1,saturdayOffDates:[]})),409);assert.deepEqual(f.state(),before);
});
await check('잘못된등록원문은빈달력으로숨기지않고오류,지원하지않는경로/메서드차단',async f=>{
 status(await f.request('admin','DELETE'),405);status(await f.request('admin','GET',undefined,'work-calendars/unknown'),404);assert.equal(await workCalendarRoute(new Request('https://qa.invalid/other'),{DB:f.DB},f.actor('admin'),'other'),null);f.db.prepare('INSERT INTO studio_reporting_settings VALUES (?,?,?,?)').run('work-calendar:VIETQS:2026','malformed','keep','admin');const before=f.state();status(await f.request('admin'),503);status(await f.save(),409);assert.deepEqual(f.state(),before);
});
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({kind:'ACTUAL_COLLABORATION_API_MEMORY_SQLITE_SYNTHETIC_USERS',externalRequests:0,operationalWrites:0,newDdl:0,passed:results.filter(row=>row.status==='PASS').length,failed:results.filter(row=>row.status==='FAIL').length,results},null,2)+'\n');if(results.some(row=>row.status==='FAIL'))process.exitCode=1;
