import {projectProgress} from '../../scheduler-web/src/utils/scheduleProgress.ts';
import {assignedTasks,validDay,assignmentAliases,assignmentPersonId} from '../../scheduler-web/src/utils/personalWork.ts';
import {withAllocationBounds} from '../../scheduler-web/src/utils/scheduleAllocations.ts';

// Extension audit lives with its project. CAS and the notification writes commit together.
export async function scheduleExtensionRoute(request:Request,env:any,user:any,route:string,canManage:(user:any,department:string)=>boolean):Promise<Response|null>{
 const match=route.match(/^projects\/([^/]+)\/extensions(?:\/([^/]+)\/(approve|reject))?$/);
 if(!match)return null;
 const fail=(error:string,status=400)=>Response.json({error},{status});
 if(request.method!=='POST')return fail('지원하지 않는 요청입니다.',405);
 const db=env.DB,id=decodeURIComponent(match[1]),input:any=await request.json();
 const row=await db.prepare('SELECT * FROM studio_projects WHERE id=?').bind(id).first<any>();
 if(!row||await db.prepare('SELECT project_id FROM studio_project_archive WHERE project_id=?').bind(id).first())return fail('활성 프로젝트를 찾을 수 없습니다.',404);
 const project=JSON.parse(row.body),now=new Date().toISOString(),requests=project.scheduleExtensions||[];
 const directoryRows=(await db.prepare('SELECT id,name,department,position,profile,active FROM studio_users').all()).results;
 const directory=directoryRows.map((row:any)=>{let profile:any={};try{profile=JSON.parse(row.profile);}catch{/* Unknown profiles only retain their canonical ID. */}const owner=profile?.id===row.id?profile:{};return {id:row.id,name:typeof owner.name==='string'?owner.name:undefined,no:owner.no,active:row.active===1};});
 const aliasesFor=(id:string)=>assignmentAliases({id},directory);
 const pmId=assignmentPersonId(project.pmId,directory);
 let changed:any,recipients:string[]=[];
 if(!match[2]){
  const task=assignedTasks(user.id,[project],aliasesFor(user.id)).find(t=>t.id===input.taskId);
  if(!task)return fail('본인에게 배정된 업무만 연장을 요청할 수 있습니다.',403);
  if(input.previousEnd!==task.endDate)return fail('마감일이 변경되었습니다. 최신 일정을 확인하세요.',409);
  const type=input.type||'DEADLINE';
  if(!['DEADLINE','OVERTIME'].includes(type)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||input.reasonCategory!==undefined&&(typeof input.reasonCategory!=='string'||input.reasonCategory.length>100))return fail('연장 유형과 사유를 확인하세요.');
  if(type==='DEADLINE'&&(!validDay(input.requestedEnd)||input.requestedEnd<=task.endDate))return fail('현재 마감일 이후의 요청 완료일을 입력하세요.');
  const minutes=(value:unknown)=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  const duration=minutes(input.endTime)-minutes(input.startTime);
  if(type==='OVERTIME'&&(!validDay(input.workDate)||input.workDate<task.startDate||!Number.isFinite(duration)||duration<=0))return fail('배정 시작일 이후의 근무일과 당일 시작·종료 시간을 확인하세요.');
  if(requests.some((r:any)=>r.taskId===task.id&&r.userId===user.id&&r.status==='PENDING'))return fail('이 업무의 승인 대기 요청이 이미 있습니다.',409);
  if(input.approverId!==undefined){
   const approver:any=typeof input.approverId==='string'?await db.prepare('SELECT id,department,position FROM studio_users WHERE id=? AND active=1').bind(input.approverId).first():null;
   if(!approver||!(approver.id===pmId||canManage(approver,project.department)||(project.department==='토목&조경팀'&&approver.id==='u_8')))return fail('현재 프로젝트 PM 또는 해당 팀 결재 담당자를 선택하세요.',403);
   recipients=[approver.id];
  }
  changed={id:crypto.randomUUID(),taskId:task.id,...(task.allocationId?{allocationId:task.allocationId}:{}),userId:user.id,userName:user.name,roleName:task.roleName,previousEnd:task.endDate,requestedEnd:type==='DEADLINE'?input.requestedEnd:task.endDate,type,...(type==='OVERTIME'?{workDate:input.workDate,startTime:input.startTime,endTime:input.endTime,hours:duration/60}:{}),...(input.approverId?{approverId:input.approverId}:{}),reasonCategory:input.reasonCategory||'',reason:input.reason.trim(),createdAt:now,status:'PENDING'};
  project.scheduleExtensions=[...requests,changed];
  const managers=await db.prepare('SELECT id,department,position,profile FROM studio_users WHERE active=1 AND department=?').bind(project.department).all<any>();
  if(!recipients.length)recipients=managers.results.filter((u:any)=>canManage(u,project.department)||(project.department==='토목&조경팀'&&u.id==='u_8')).map((u:any)=>u.id);
 }else{
  const pending=requests.find((r:any)=>r.id===decodeURIComponent(match[2]));
  if(!pending)return fail('연장 요청을 찾을 수 없습니다.',404);
  const manager=canManage(user,project.department)||(project.department==='토목&조경팀'&&user.id==='u_8');
  const designated=directoryRows.find((person:any)=>person.id===pending.approverId&&person.active===1);
  const designatedValid=designated&&(designated.id===pmId||canManage(designated,project.department)||(project.department==='토목&조경팀'&&designated.id==='u_8'));
  const mayReview=pending.approverId?user.id===pending.approverId&&designatedValid:manager;
  const mayRejectOrphan=match[3]==='reject'&&pending.approverId&&!designatedValid&&manager;
  if(!mayReview&&!mayRejectOrphan)return fail('지정된 PM 또는 해당 팀 결재 담당자의 승인 권한이 필요합니다.',403);
  if(input.revision!==row.revision)return fail('프로젝트가 변경되었습니다. 최신 요청을 확인하세요.',409);
  if(pending.status!=='PENDING')return fail('이미 처리된 요청입니다.',409);
  if(input.memo!==undefined&&(typeof input.memo!=='string'||input.memo.length>1000))return fail('처리 메모는 1,000자 이내로 입력하세요.');
  if(match[3]==='approve'){
   const task=assignedTasks(pending.userId,[project],aliasesFor(pending.userId)).find(t=>t.id===pending.taskId);
   if(!task||task.endDate!==pending.previousEnd||pending.allocationId!==undefined&&pending.allocationId!==task.allocationId)return fail('배정 또는 마감일이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
   if(pending.type==='OVERTIME'&&pending.workDate<task.startDate)return fail('배정 시작일이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
   if(pending.type!=='OVERTIME'){
    const follow=(project.postDeliveryTasks||[]).find((t:any)=>`gen-${project.id}-followup-${t.id}`===task.id);
    if(follow)follow.endDate=pending.requestedEnd;
     else{
      const subTask=project.subTasks?.[task.roleName];
      if(task.allocationId){
       const allocation=subTask?.allocations?.find((a:any)=>a.id===task.allocationId);
       if(!allocation)return fail('배정 구간이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
       allocation.endDate=pending.requestedEnd;
       Object.assign(subTask,withAllocationBounds(subTask));
      }else if(subTask)subTask.endDate=pending.requestedEnd;
      project.roles={...project.roles,[task.roleName]:{...project.roles?.[task.roleName],...(subTask?{personId:(subTask.personIds||[subTask.personId])[0]||'',startDate:subTask.startDate,endDate:subTask.endDate}:{endDate:pending.requestedEnd})}};
      if(task.roleName!=='PM'&&!task.allocationId)project.progress=projectProgress(project).actual??project.progress;
     }
   }
  }
  changed={...pending,status:match[3]==='approve'?'APPROVED':'REJECTED',decidedBy:user.id,decidedName:user.name,decidedAt:now,decisionMemo:input.memo||''};
  project.scheduleExtensions=requests.map((r:any)=>r.id===changed.id?changed:r);recipients=[pending.userId];
 }
 const detail=changed.type==='OVERTIME'?`${changed.workDate} ${changed.startTime} ~ ${changed.endTime}, ${changed.hours}시간`:`${changed.previousEnd} → ${changed.requestedEnd}`;
 const message=changed.status==='PENDING'?`${user.name} · ${project.code} ${changed.roleName} ${changed.type==='OVERTIME'?'추가 시간':'일정 연장'} 요청 (${detail})`:`${project.code} ${changed.roleName} ${changed.type==='OVERTIME'?'추가 시간':'일정 연장'} ${changed.status==='APPROVED'?'승인':'반려'} · ${user.name}`;
 try{await db.batch([
  db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?)').bind(id,row.revision),
  db.prepare('UPDATE studio_projects SET body=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(JSON.stringify(project),now,user.id,id,row.revision),
  ...[...new Set(recipients)].map(recipient=>db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),recipient,`extension:${id}`,message,now))
 ]);}catch{return fail('동시 변경으로 요청을 저장하지 못했습니다. 입력은 유지하고 최신 상태를 확인하세요.',409);}
 return Response.json({project,revision:row.revision+1,request:changed});
}
