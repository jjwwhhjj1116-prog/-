import {validDay} from '../../scheduler-web/src/utils/personalWork.ts';
import {canManageSchedule,isScheduleAdmin} from '../../scheduler-web/src/utils/schedulePermissions.ts';
import {buildWeeklyReport} from './weeklyReports.ts';

const departments=['마감팀','구조팀','토목&조경팀'];
const parse=(value:any)=>{try{return JSON.parse(value||'{}');}catch{return {};}};
const shift=(day:string,n:number)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const monday=(day:string)=>shift(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));
const localTime=(now:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const account=(row:any)=>row?{...parse(row.profile),id:row.id,name:row.name,department:row.department,position:row.position,active:row.active===1}:null;
const canSubmit=(actor:any,department:string)=>department==='ALL'?isScheduleAdmin(actor):departments.includes(department)&&canManageSchedule(actor,department as any);
const currentAccount=(db:any,id:string)=>db.prepare('SELECT id,name,department,position,profile,active FROM studio_users WHERE id=? AND active=1').bind(id).first();
const accountGuard=(db:any,row:any)=>db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND department=? AND position=? AND profile=?)').bind(row.id,row.department,row.position,row.profile);
const eligible=async(db:any)=>{
 const row=await db.prepare('SELECT body FROM studio_reporting_settings WHERE id=?').bind('weekly-eligible-recipients').first();
 const ids=parse(row?.body).recipientIds;
 return {body:row?.body||null,ids:Array.isArray(ids)?ids.filter((id:any)=>typeof id==='string'):[]};
};
const eligibilityGuard=(db:any,body:string)=>db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_reporting_settings WHERE id=? AND body=?)').bind('weekly-eligible-recipients',body);
const options=async(db:any,ids:string[])=>{
 const people=(await db.prepare('SELECT id,name,department,position FROM studio_users WHERE active=1').all()).results;
 return people.filter((person:any)=>ids.includes(person.id));
};
const recipients=async(db:any,id:string)=>(await db.prepare('SELECT recipient_id AS id,recipient_name AS name,decision,decided_at AS decidedAt,memo FROM studio_weekly_submission_recipients WHERE submission_id=? ORDER BY recipient_name,recipient_id').bind(id).all()).results;
const submission=(row:any,receivers:any[],teams:any[])=>({id:row.id,weekStart:row.week_start,weekEnd:row.week_end,department:row.department,authorId:row.author_id,authorName:row.author_name,status:row.status,source:row.source,sentAt:row.sent_at,recipients:receivers,teams,revision:row.revision});

export async function weeklyApprovalRoute(request:Request,env:any,user:any,path:string):Promise<Response|null>{
 if(!['weekly-reports/submissions','weekly-reports/submit','weekly-reports/decision'].includes(path))return null;
 const db=env.DB,row=await currentAccount(db,user.id),actor=account(row);
 if(!actor)return json({error:'활성 계정으로 다시 로그인하세요.'},403);
 const allow=await eligible(db),recipientOptions=await options(db,allow.ids),managedDepartments=[...departments,'ALL'].filter(department=>canSubmit(actor,department));
 if(path==='weekly-reports/submissions'&&request.method==='GET'){
  const week=new URL(request.url).searchParams.get('week');
  if(!week||!validDay(week))return json({error:'주간 보고 날짜를 선택하세요.'},400);
  const rows=(await db.prepare('SELECT * FROM studio_weekly_submissions WHERE week_start=? ORDER BY sent_at DESC,id DESC').bind(monday(week)).all()).results;
  const submissions=[];
  for(const stored of rows){
   const receivers=await recipients(db,stored.id),wholeTeam=isScheduleAdmin(actor)||receivers.some((receiver:any)=>receiver.id===actor.id);
   const snapshot=parse(stored.body),teams=(Array.isArray(snapshot.teams)?snapshot.teams:[]).map((team:any)=>({...team,employees:wholeTeam||canManageSchedule(actor,team.department as any,false)?team.employees:(team.employees||[]).filter((employee:any)=>employee.id===actor.id)})).filter((team:any)=>team.employees.length);
   if(!wholeTeam&&!teams.length)continue;
   submissions.push(submission(stored,receivers,teams));
  }
  return json({submissions,canSubmit:managedDepartments.length>0,recipientOptions,departments:managedDepartments});
 }
 if(request.method!=='POST')return json({error:'지원하지 않는 주간 결재 요청입니다.'},405);
 let input:any;try{input=await request.json();}catch{return json({error:'요청 내용을 확인하세요.'},400);}
 if(path==='weekly-reports/submit'&&request.method==='POST'){
  const {week,department,recipientIds}=input||{};
  if(!validDay(week)||![...departments,'ALL'].includes(department))return json({error:'주간 보고 날짜와 팀을 확인하세요.'},400);
  if(!canSubmit(actor,department))return json({error:'해당 팀의 팀장·실장 또는 관리자만 결재 상신할 수 있습니다.'},403);
  if(!Array.isArray(recipientIds)||!recipientIds.length||recipientIds.length>20||recipientIds.some((id:any)=>typeof id!=='string')||new Set(recipientIds).size!==recipientIds.length)return json({error:'결재자를 한 명 이상 선택하세요. 중복 계정은 선택할 수 없습니다.'},400);
  if(!allow.body||recipientIds.some((id:string)=>!recipientOptions.some((person:any)=>person.id===id)))return json({error:'등록된 경영지원·경영진의 활성 계정만 선택할 수 있습니다.'},400);
  const weekStart=monday(week);
  if(await db.prepare("SELECT id FROM studio_weekly_submissions WHERE week_start=? AND department=? AND status='PENDING'").bind(weekStart,department).first())return json({error:'이미 결재 중인 주간 보고가 있습니다. 기존 결재 결과를 확인하세요.'},409);
  const report=await buildWeeklyReport(env,row,week),teams=report.teams.filter((team:any)=>department==='ALL'||team.department===department),id=crypto.randomUUID(),sentAt=new Date().toISOString(),chosen=recipientOptions.filter((person:any)=>recipientIds.includes(person.id));
  const statements=[accountGuard(db,row),eligibilityGuard(db,allow.body),db.prepare("INSERT INTO studio_write_assertions SELECT 0 WHERE EXISTS(SELECT 1 FROM studio_weekly_submissions WHERE week_start=? AND department=? AND status='PENDING')").bind(weekStart,department)];
  for(const person of chosen)statements.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1)').bind(person.id));
  statements.push(db.prepare("INSERT INTO studio_weekly_submissions (id,week_start,week_end,department,author_id,author_name,status,sent_at,body,revision,source) VALUES (?,?,?,?,?,?,?,?,?,1,'MANUAL')").bind(id,weekStart,report.weekEnd,department,actor.id,actor.name,'PENDING',sentAt,JSON.stringify({weekStart,weekEnd:report.weekEnd,teams})));
  for(const person of chosen){
   statements.push(db.prepare('INSERT INTO studio_weekly_submission_recipients (submission_id,recipient_id,recipient_name) VALUES (?,?,?)').bind(id,person.id,person.name));
   statements.push(db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`weekly-submission:${id}:${person.id}`,person.id,`weekly-report:${weekStart}`,`${department} ${weekStart} ~ ${report.weekEnd} 주간 업무·야근 보고 결재가 상신되었습니다.`,sentAt));
  }
  try{await db.batch(statements);}catch{return json({error:'상신 중 계정이나 결재 상태가 변경되었습니다. 새로고침 후 다시 확인하세요.'},409);}
  const stored=await db.prepare('SELECT * FROM studio_weekly_submissions WHERE id=?').bind(id).first();
  return json({ok:true,submission:submission(stored,await recipients(db,id),teams)});
 }
 if(path==='weekly-reports/decision'&&request.method==='POST'){
  const {id,revision,decision,memo}=input||{};
  if(typeof id!=='string'||!Number.isInteger(revision)||revision<1||!['APPROVED','REJECTED'].includes(decision)||(memo!==undefined&&(typeof memo!=='string'||memo.length>2000)))return json({error:'결재 요청을 확인하세요.'},400);
  const stored=await db.prepare('SELECT * FROM studio_weekly_submissions WHERE id=?').bind(id).first();
  if(!stored)return json({error:'상신 보고를 찾을 수 없습니다.'},404);
  const receivers=await recipients(db,id),receiver=receivers.find((person:any)=>person.id===actor.id);
  if(!receiver||!allow.ids.includes(actor.id)||!allow.body)return json({error:'이 보고에 선택된 경영지원·경영진 결재자만 승인·반려할 수 있습니다.'},403);
  if(stored.revision!==revision||stored.status!=='PENDING'||receiver.decision)return json({error:'이미 처리되었거나 결재 상태가 변경되었습니다. 새로고침하세요.'},409);
  const status=decision==='REJECTED'?'REJECTED':receivers.every((person:any)=>person.id===actor.id||person.decision==='APPROVED')?'APPROVED':'PENDING',decidedAt=new Date().toISOString();
  const statements=[accountGuard(db,row),eligibilityGuard(db,allow.body),db.prepare("INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_weekly_submissions WHERE id=? AND revision=? AND status='PENDING')").bind(id,revision),db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_weekly_submission_recipients WHERE submission_id=? AND recipient_id=? AND decision IS NULL)').bind(id,actor.id),db.prepare('UPDATE studio_weekly_submission_recipients SET decision=?,decided_at=?,memo=? WHERE submission_id=? AND recipient_id=? AND decision IS NULL').bind(decision,decidedAt,memo||'',id,actor.id),db.prepare('UPDATE studio_weekly_submissions SET status=?,revision=revision+1 WHERE id=? AND revision=?').bind(status,id,revision)];
  if(stored.source!=='SCHEDULED')statements.push(db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`weekly-decision:${id}:${revision+1}:${actor.id}`,stored.author_id,`weekly-report:${stored.week_start}`,`${stored.department} ${stored.week_start} 주간 보고: ${actor.name} ${decision==='APPROVED'?'승인':'반려'}${status==='APPROVED'?' · 전체 결재 완료':status==='PENDING'?' · 다른 결재자 대기':''}`,decidedAt));
  try{await db.batch(statements);}catch{return json({error:'결재 중 계정이나 보고 버전이 변경되었습니다. 새로고침 후 다시 확인하세요.'},409);}
  const updated=await db.prepare('SELECT * FROM studio_weekly_submissions WHERE id=?').bind(id).first();
  return json({ok:true,submission:submission(updated,await recipients(db,id),parse(stored.body).teams||[])});
 }
 return json({error:'지원하지 않는 주간 결재 요청입니다.'},405);
}

// 금요일 퇴근 보고 취합 후 실행한다. 설정한 활성 결재자에게 주당 한 본만 상신한다.
export async function sendScheduledWeeklyApprovals(env:any,{now=new Date()}:{now?:Date}={}){
 const local=localTime(now),day=local.slice(0,10),weekStart=monday(day),result={weekStart,status:'NOT_DUE',recipients:0};
 if(new Date(day+'T12:00:00Z').getUTCDay()!==5||local.slice(11,16)<'17:10')return result;
 const db=env.DB;
 if(await db.prepare('SELECT week_start FROM studio_weekly_reports WHERE week_start=?').bind(weekStart).first())return {...result,status:'ALREADY_SENT'};
 const settingRow=await db.prepare('SELECT body FROM studio_reporting_settings WHERE id=?').bind('weekly-reporting').first(),configured=parse(settingRow?.body).recipientIds,allow=await eligible(db),people=await options(db,allow.ids),chosen=people.filter((person:any)=>Array.isArray(configured)&&configured.includes(person.id));
 if(!allow.body||!chosen.length)return {...result,status:'RECIPIENTS_REQUIRED'};
 if(await db.prepare("SELECT id FROM studio_weekly_submissions WHERE week_start=? AND department='ALL' AND status='PENDING'").bind(weekStart).first())return {...result,status:'PENDING_EXISTS'};
 const actor={id:'weekly-scheduler',profile:JSON.stringify({email:'yjw@con-cost.com',role:'ADMIN'})},report=await buildWeeklyReport(env,actor,day,now),id=crypto.randomUUID(),sentAt=now.toISOString(),ids=chosen.map((person:any)=>person.id),body=JSON.stringify({weekStart,weekEnd:report.weekEnd,teams:report.teams});
 const statements=[eligibilityGuard(db,allow.body),db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_reporting_settings WHERE id=? AND body=?)').bind('weekly-reporting',settingRow.body),db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE EXISTS(SELECT 1 FROM studio_weekly_reports WHERE week_start=?)').bind(weekStart),db.prepare("INSERT INTO studio_write_assertions SELECT 0 WHERE EXISTS(SELECT 1 FROM studio_weekly_submissions WHERE week_start=? AND department='ALL' AND status='PENDING')").bind(weekStart)];
 for(const person of chosen)statements.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1)').bind(person.id));
 statements.push(db.prepare("INSERT INTO studio_weekly_submissions (id,week_start,week_end,department,author_id,author_name,status,sent_at,body,revision,source) VALUES (?,?,?,'ALL','weekly-scheduler','시스템 정기 보고','PENDING',?,?,1,'SCHEDULED')").bind(id,weekStart,report.weekEnd,sentAt,body),db.prepare('INSERT INTO studio_weekly_reports (week_start,week_end,sent_at,recipient_ids,body) VALUES (?,?,?,?,?)').bind(weekStart,report.weekEnd,sentAt,JSON.stringify(ids),body));
 for(const person of chosen){statements.push(db.prepare('INSERT INTO studio_weekly_submission_recipients (submission_id,recipient_id,recipient_name) VALUES (?,?,?)').bind(id,person.id,person.name),db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`weekly-submission:${id}:${person.id}`,person.id,`weekly-report:${weekStart}`,`${weekStart} ~ ${report.weekEnd} 전체 팀의 주간 업무·승인 야근 정기 보고 결재가 상신되었습니다.`,sentAt));}
 try{await db.batch(statements);return {...result,status:'SENT',recipients:ids.length};}catch{return {...result,status:'CONFLICT_RETRY'};}
}
