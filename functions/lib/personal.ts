import {validDay,assignedItems,assignedTasks,reconcileWorkLogItems,reportsActualProgress,assignmentAliases,taskAssignedTo,legacyAllocationTask} from '../../scheduler-web/src/utils/personalWork.ts';
import {sanitizeReportHtml,reportHtmlMatchesText} from '../../scheduler-web/src/utils/reportContent.ts';
import {projectProgress} from '../../scheduler-web/src/utils/scheduleProgress.ts';
function reportTask(item:any,day:string,tasks:ReturnType<typeof assignedTasks>){
 const exact=tasks.find(task=>task.id===item.id&&task.projectId===item.projectId&&task.roleName===item.roleName);
 if(exact)return exact.startDate<=day&&(item.allocationId===undefined||item.allocationId===exact.allocationId)?exact:undefined;
 if(item.id!==`gen-${item.projectId}-${item.roleName}`)return undefined;
 return legacyAllocationTask(item,tasks.filter(task=>task.startDate<=day&&(day<=task.endDate||item.allocationId!==undefined&&task.reportingMode==='TASK')));
}
export async function personalRoute(request:Request,env:any,user:any,route:string):Promise<Response|null>{
 if(!['personal','leaves','task-checks','worklogs','legacy-worklogs'].includes(route.split('/')[0]))return null;
 const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}}),fail=(error:string,status=400)=>json({error},status);
 const method=request.method,db=env.DB;
 const directoryRows=['personal','task-checks','worklogs'].includes(route.split('/')[0])?(await db.prepare('SELECT id,name,profile,active FROM studio_users').all()).results:[];
 const directory=directoryRows.map((row:any)=>{let profile:any={};try{profile=JSON.parse(row.profile);}catch{/* Unknown profiles only retain their canonical ID. */}const owner=profile?.id===row.id?profile:{};return {id:row.id,name:typeof owner.name==='string'?owner.name:undefined,no:owner.no,active:row.active===1};});
 const aliasesFor=(id:string)=>assignmentAliases({id},directory);
 const lead=(dept:string)=>dept==='마감팀'?'u_13':dept==='구조팀'?'u_25':'u_8';
 const chief=(dept:string)=>dept==='마감팀'?'u_12':dept==='구조팀'?'u_24':'u_8';
 const canRead=(row:any)=>row.user_id===user.id||lead(row.department)===user.id||chief(row.department)===user.id||['yjw@con-cost.com','yjpark@con-cost.com'].includes(JSON.parse(user.profile).email);
 const activeSchedules=async()=>{const rows=await db.prepare('SELECT body FROM studio_projects WHERE id NOT IN (SELECT project_id FROM studio_project_archive)').all();return rows.results.map((r:any)=>JSON.parse(r.body));};
 if(route==='legacy-worklogs'&&method==='GET'){
  const rows=await db.prepare('SELECT * FROM studio_legacy_worklogs ORDER BY imported_at DESC').all();return json({records:rows.results.filter(canRead).map((r:any)=>({id:r.id,source:JSON.parse(r.body),importedAt:r.imported_at}))});
 }
 if(route==='legacy-worklogs'&&method==='POST'){
  const {log}:any=await request.json();if(!log||log.userId!==user.id||!validDay(log.date)||!Array.isArray(log.items)||log.serverRevision)return fail('본인의 기존 PC 기록만 보관할 수 있습니다.',403);
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const body=JSON.stringify(canonical(log));if(new TextEncoder().encode(body).byteLength>1000000)return fail('일지 원본이 너무 큽니다. 별도 파일로 보존하세요.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.id+':'+body)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT OR IGNORE INTO studio_legacy_worklogs VALUES (?,?,?,?,?)').bind(hash,user.id,user.department,body,new Date().toISOString()).run();return json({id:hash});
 }
 if(route==='personal'&&method==='GET'){
  const leaves=await db.prepare('SELECT l.*,u.name FROM studio_leaves l JOIN studio_users u ON u.id=l.user_id WHERE cancelled=0').all();
  const checks=await db.prepare('SELECT day,task_id,done FROM studio_task_checks WHERE user_id=?').bind(user.id).all();
  const rows=await db.prepare('SELECT * FROM studio_worklogs WHERE removed=0').all();
  const schedules=await activeSchedules();
  return json({leaves:leaves.results,checks:checks.results,worklogs:rows.results.filter(canRead).map((r:any)=>{const log=JSON.parse(r.body);return {...log,items:log.approvalStatus==='DRAFT'?reconcileWorkLogItems(log.items,r.user_id,r.day,schedules,aliasesFor(r.user_id)):log.items,serverRevision:r.revision};})});
 }
 if(route==='leaves'&&method==='POST'){
  const b:any=await request.json();
  if(!validDay(b.startDate)||!validDay(b.endDate)||b.startDate>b.endDate||!['연차','오전 반차','오후 반차','휴가'].includes(b.kind))return fail('휴가 종류와 시작·종료일을 확인하세요.');
  if(b.kind.includes('반차')&&b.startDate!==b.endDate)return fail('반차는 하루씩 등록하세요.');
  const existing=await db.prepare('SELECT * FROM studio_leaves WHERE user_id=? AND cancelled=0 AND start_date<=? AND end_date>=?').bind(user.id,b.endDate,b.startDate).all();
  if(existing.results.some((l:any)=>!l.kind.includes('반차')||!b.kind.includes('반차')||l.kind===b.kind))return fail('겹치는 휴가가 이미 등록되어 있습니다.',409);
  const id=crypto.randomUUID();const inserted=await db.prepare("INSERT INTO studio_leaves (id,user_id,start_date,end_date,kind) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM studio_leaves WHERE user_id=? AND cancelled=0 AND start_date<=? AND end_date>=? AND (kind NOT LIKE '%반차' OR ? NOT LIKE '%반차' OR kind=?))").bind(id,user.id,b.startDate,b.endDate,b.kind,user.id,b.endDate,b.startDate,b.kind,b.kind).run();return inserted.meta.changes?json({id}):fail('동시에 등록된 휴가와 겹칩니다. 최신 상태를 확인하세요.',409);
 }
 if(route.startsWith('leaves/')&&method==='DELETE'){
  const {revision}:any=await request.json();const r=await db.prepare('UPDATE studio_leaves SET cancelled=1,revision=revision+1 WHERE id=? AND user_id=? AND revision=? AND cancelled=0').bind(route.slice(7),user.id,revision).run();
  return r.meta.changes?json({ok:true}):fail('본인 휴가만 취소할 수 있습니다. 최신 상태를 확인하세요.',409);
 }
 if(route==='task-checks'&&method==='POST'){
  const {day,taskId,done}:any=await request.json();if(!validDay(day)||typeof done!=='boolean')return fail('날짜와 완료 상태를 확인하세요.');
  const projects=await db.prepare('SELECT body FROM studio_projects WHERE id NOT IN (SELECT project_id FROM studio_project_archive)').all();
  if(!assignedItems(user.id,day,projects.results.map((r:any)=>JSON.parse(r.body)),aliasesFor(user.id)).some(i=>i.id===taskId))return fail('해당 날짜에 본인에게 배정된 업무만 체크할 수 있습니다.',403);
  await db.prepare('INSERT INTO studio_task_checks VALUES (?,?,?,?) ON CONFLICT(user_id,day,task_id) DO UPDATE SET done=excluded.done').bind(user.id,day,taskId,done?1:0).run();return json({ok:true});
 }
 const match=route.match(/^worklogs\/([^/]+)(?:\/(submit|review|approve|read))?$/);if(!match)return fail('지원하지 않는 요청입니다.',404);
 const id=decodeURIComponent(match[1]),action=match[2];const row=await db.prepare('SELECT * FROM studio_worklogs WHERE id=?').bind(id).first();
 if(action==='read'){
  if(method!=='POST')return fail('지원하지 않는 요청입니다.',405);
  if(!row||row.removed)return fail('일지를 찾을 수 없습니다.',404);
  if(!canRead(row))return fail('이 일지를 열람할 권한이 없습니다.',403);
  const {revision}:any=await request.json();if(revision!==row.revision)return fail('다른 화면에서 일지가 변경되었습니다. 최신 본문을 확인하세요.',409);
  const log=JSON.parse(row.body),now=new Date().toISOString();
  const writes=[db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_worklogs WHERE id=? AND revision=? AND removed=0)').bind(id,row.revision)];
  if(row.user_id!==user.id&&['SUBMITTED_LEADER','APPROVED_FINAL'].includes(log.approvalStatus)){
   writes.push(db.prepare('UPDATE studio_notifications SET read_at=? WHERE user_id=? AND meeting_id=? AND read_at IS NULL').bind(now,user.id,`worklog:${id}`));
   writes.push(db.prepare('INSERT OR IGNORE INTO studio_notifications (id,user_id,meeting_id,message,created_at) SELECT ?,?,?,?,? FROM studio_users WHERE id=? AND active=1').bind(`worklog:${encodeURIComponent(id)}:read:${encodeURIComponent(user.id)}`,row.user_id,`worklog:${id}`,`${user.name}님이 ${row.day} 업무일지를 열람했습니다.`,now,row.user_id));
  }
  try{await db.batch(writes);}catch{return fail('동시 변경으로 열람 확인을 취소했습니다. 최신 본문을 확인하세요.',409);}
  return json({ok:true});
 }
 const input:any=await request.json();const now=new Date().toISOString();
 if(method==='PUT'&&!action){
  if(!['마감팀','구조팀','토목&조경팀'].includes(user.department))return fail('현재 소속의 업무일지 결재선이 설정되지 않았습니다.',403);
  const log=input.log;
  if(!log||log.id!==id||!validDay(log.date)||!Array.isArray(log.items)||log.items.some((i:any)=>typeof i.todayTask!=='string'||!Number.isFinite(i.progress)||i.progress<0||i.progress>100))return fail('업무일지 날짜·내용·진척률을 확인하세요.');
  if((log.reportMode!==undefined&&!['DAILY','TASK'].includes(log.reportMode))||log.items.some((i:any)=>(i.reportBasis!==undefined&&!['DAILY','TASK'].includes(i.reportBasis))||(i.workHours!==undefined&&(!Number.isFinite(i.workHours)||i.workHours<0||i.workHours>24))||['remainingTask','delayReason','blockers'].some(key=>i[key]!==undefined&&(typeof i[key]!=='string'||i[key].length>5000))))return fail('보고 방식·업무 시간·업무 평가 입력을 확인하세요.');
  if(row&&(row.user_id!==user.id||row.removed))return fail('본인의 일지만 수정할 수 있습니다.',403);
  if(row&&row.day!==log.date)return fail('저장된 일지의 날짜는 변경할 수 없습니다. 다른 날짜의 일지를 작성하세요.',409);
  if(row&&(row.revision!==input.revision||JSON.parse(row.body).approvalStatus!=='DRAFT'))return fail('일지가 변경되었거나 이미 상신되었습니다. 입력을 보존하고 다시 확인하세요.',409);
  const duplicate=await db.prepare('SELECT id FROM studio_worklogs WHERE user_id=? AND day=? AND removed=0 AND id<>?').bind(user.id,log.date,id).first();if(duplicate)return fail('해당 날짜의 일지가 이미 있습니다. 목록에서 열어 수정하세요.',409);
  const schedules=await activeSchedules(),reportable=assignedTasks(user.id,schedules,aliasesFor(user.id));
  const previousItems=row?JSON.parse(row.body).items:[];
  if(log.items.some((i:any)=>i.reportBasis==='TASK'&&!reportTask(i,log.date,reportable)&&!previousItems.some((old:any)=>old.id===i.id&&old.reportBasis==='TASK')))return fail('본인에게 배정된 작업만 Task 기준으로 보고할 수 있습니다.',403);
  if(log.items.some((i:any)=>{const task=reportTask(i,log.date,reportable);return task&&i.reportBasis!==undefined&&i.reportBasis!==task.reportingMode;}))return fail('관리자가 지정한 보고 방식이 변경되었습니다. 최신 배정을 확인하세요.',409);
  if(log.items.some((i:any)=>['dailyGoal','plannedDetails','planMemo','planStartedAt'].some(key=>i[key]!==undefined&&(typeof i[key]!=='string'||i[key].length>5000))||!['대기','진행중','지연','완료'].includes(i.status)||(i.attachments!==undefined&&(!Array.isArray(i.attachments)||i.attachments.length>50||i.attachments.some((f:any)=>!f||typeof f.name!=='string'||f.name.length>500||typeof f.url!=='string'||f.url.length>2000||!(/^https:\/\//.test(f.url)||/^\/api\/drive\/files\/download\?id=[a-zA-Z0-9_%.-]+$/.test(f.url)))))))return fail('업무 계획·상태·첨부 링크를 확인하세요.');
  if(log.items.some((i:any)=>i.reportHtml!==undefined&&(typeof i.reportHtml!=='string'||i.reportHtml.length>20000||!reportHtmlMatchesText(i.reportHtml,i.todayTask))))return fail('완료 업무의 서식과 본문을 확인하세요.');
  const submittedItems=log.items.map((i:any)=>i.reportHtml===undefined?i:{...i,reportHtml:sanitizeReportHtml(i.reportHtml)});
  const items=reconcileWorkLogItems(submittedItems,user.id,log.date,schedules,aliasesFor(user.id));
  const saved={...log,items,userId:user.id,userName:user.name,userPosition:user.position,department:user.department,approvalStatus:'DRAFT',authorSignature:{signed:false,name:user.name},leaderReview:{approved:false,name:''},chiefApproval:{approved:false,name:''},updatedAt:now};delete saved.serverRevision;delete saved.autoGeneratedDay;delete saved.autoReportedAt;if(row){const original=JSON.parse(row.body);if(original.autoGeneratedDay)saved.autoGeneratedDay=original.autoGeneratedDay;}
  const result=row?await db.prepare('UPDATE studio_worklogs SET body=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(saved),id,input.revision).run():await db.prepare('INSERT OR IGNORE INTO studio_worklogs (id,user_id,day,department,body) VALUES (?,?,?,?,?)').bind(id,user.id,log.date,user.department,JSON.stringify(saved)).run();
  return result.meta.changes?json({log:{...saved,serverRevision:(row?.revision||0)+1}}):fail('동시 저장 충돌입니다.',409);
 }
 if(!row||row.removed)return fail('일지를 찾을 수 없습니다.',404);
 if(input.revision!==row.revision)return fail('다른 화면에서 일지가 변경되었습니다.',409);
 const log=JSON.parse(row.body);
 if(method==='DELETE'&&!action){if(row.user_id!==user.id||log.approvalStatus!=='DRAFT')return fail('본인의 작성 중 일지만 정리할 수 있습니다.',403);const removed=await db.prepare('UPDATE studio_worklogs SET removed=1,revision=revision+1 WHERE id=? AND revision=?').bind(id,row.revision).run();return removed.meta.changes?json({ok:true}):fail('다른 화면에서 일지가 변경되었습니다.',409);}
 if(method!=='POST')return fail('지원하지 않는 요청입니다.',405);
 if(action==='submit'){
  if(row.user_id!==user.id||log.approvalStatus!=='DRAFT')return fail('본인의 작성 중 일지만 상신할 수 있습니다.',403);
   log.items=reconcileWorkLogItems(log.items,row.user_id,row.day,await activeSchedules(),aliasesFor(row.user_id));
  if(log.reportMode&&!log.items.some((item:any)=>item.todayTask.trim()&&(item.manualFields===undefined||item.manualFields.includes('todayTask'))))return fail('실제 수행한 업무를 한 건 이상 입력하세요. 배정 메모만으로 상신할 수 없습니다.');
  if(log.reportMode&&log.items.some((item:any)=>reportsActualProgress(item)&&!item.todayTask.trim()))return fail('진척률을 보고하는 업무의 실제 수행 내용을 입력하세요.');
  log.approvalStatus='SUBMITTED_LEADER';log.authorSignature={signed:true,name:user.name,signedAt:now};
 }else if(action==='review'){
  if(user.id!==lead(row.department)||log.approvalStatus!=='SUBMITTED_LEADER'||log.leaderReview.approved)return fail('팀장 검토 권한 또는 단계를 확인하세요.',403);
  log.leaderReview={approved:true,name:user.name,signedAt:now};
 }else if(action==='approve'){
  if(user.id!==chief(row.department)||log.approvalStatus!=='SUBMITTED_LEADER'||!log.leaderReview.approved)return fail('실장 승인 권한 또는 단계를 확인하세요.',403);
  log.approvalStatus='APPROVED_FINAL';log.chiefApproval={approved:true,name:user.name,signedAt:now};
 }else return fail('지원하지 않는 결재입니다.',400);
 const nextApprover=action==='submit'?lead(row.department):action==='review'?chief(row.department):undefined;
 if(nextApprover&&!await db.prepare('SELECT id FROM studio_users WHERE id=? AND active=1').bind(nextApprover).first())return fail('다음 지정 결재자 계정이 없거나 비활성입니다. 관리자에게 확인을 요청하세요.',409);
 log.updatedAt=now;
 const guards=[db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_worklogs WHERE id=? AND revision=?)').bind(id,row.revision)];
 if(nextApprover)guards.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1)').bind(nextApprover));
 const writes=[db.prepare('UPDATE studio_worklogs SET body=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(log),id,row.revision)];
 if(action==='approve'){
   const authorAliases=aliasesFor(row.user_id);
  const projects=await db.prepare('SELECT * FROM studio_projects WHERE id NOT IN (SELECT project_id FROM studio_project_archive)').all();
  for(const record of projects.results){const p=JSON.parse(record.body);let changed=false,mainProgressChanged=false;
   for(const item of log.items){if(item.scheduleRemoved||!reportsActualProgress(item)||item.projectId!==p.id)continue;
    const follow=(p.postDeliveryTasks||[]).find((t:any)=>item.id===`gen-${p.id}-followup-${t.id}`);
    if(follow){if(taskAssignedTo(follow,row.user_id,authorAliases)&&log.date>=follow.startDate&&(log.date<=follow.endDate||item.reportBasis==='TASK')&&(!follow.actualProgressDate||follow.actualProgressDate<=log.date)){follow.progress=item.progress;follow.actualProgressDate=log.date;follow.status=item.progress===100?'완료':item.status==='대기'?'예정':'진행중';changed=true;}continue;}
    const legacy=p.roles?.[item.roleName];
    const t=p.subTasks?.[item.roleName]||(legacy?{...legacy,roleName:item.roleName,startDate:legacy.startDate||p.startDate,endDate:legacy.endDate||p.endDate,memo:''}:null);
    if(!t)continue;
    if(t.allocations!==undefined){
     const task=reportTask(item,log.date,assignedTasks(row.user_id,[p],authorAliases));
     if(!task||(log.date>task.endDate&&item.reportBasis!=='TASK'))continue;
    }else{
     const start=t.startDate||p.startDate,end=t.endDate||p.endDate;
     if(!validDay(start)||!validDay(end)||start>end||!taskAssignedTo(t,row.user_id,authorAliases)||log.date<start||(log.date>end&&item.reportBasis!=='TASK'))continue;
    }
    if(t.actualProgressDate&&t.actualProgressDate>log.date)continue;
    p.subTasks={...p.subTasks,[item.roleName]:{...t,progress:item.progress,status:item.progress===100?'완료':item.status==='대기'?'예정':item.status,actualProgressDate:log.date}};changed=true;mainProgressChanged ||= item.roleName!=='PM';
   }
   if(changed){if(mainProgressChanged)p.progress=projectProgress(p).actual??p.progress;
    guards.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?)').bind(p.id,record.revision));
    writes.push(db.prepare('UPDATE studio_projects SET body=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(JSON.stringify(p),now,user.id,p.id,record.revision));
   }
  }
 }

 // Notify only the next approver and author; the journal/project/notification writes share the same CAS transaction.
 const recipients=action==='submit'?[lead(row.department)]:action==='review'?[chief(row.department),row.user_id]:[row.user_id];
 const message=action==='submit'?`${user.name}님의 ${row.day} 업무일지 검토 요청`:action==='review'?`${log.userName}님의 ${row.day} 업무일지 ${row.department==='토목&조경팀'?'본부장':'팀장'} 검토 완료 · ${row.department==='토목&조경팀'?'본부장':'실장'} 승인 대기`:`${log.userName}님의 ${row.day} 업무일지 최종 승인 완료 · ${user.name}`;
 for(const recipient of new Set(recipients))writes.push(db.prepare('INSERT OR IGNORE INTO studio_notifications (id,user_id,meeting_id,message,created_at) SELECT ?,?,?,?,? FROM studio_users WHERE id=? AND active=1').bind(`worklog:${id}:${action}:${recipient}`,recipient,`worklog:${id}`,message,now,recipient));
 try{await db.batch([...guards,...writes]);}catch{return fail('동시 변경으로 저장을 취소했습니다. 최신 일지를 확인하세요.',409);}
 return json({log:{...log,serverRevision:row.revision+1}});
}
