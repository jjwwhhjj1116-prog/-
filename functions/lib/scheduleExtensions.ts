import {projectProgress} from '../../scheduler-web/src/utils/scheduleProgress.ts';
import {assignedTasks,validDay,assignmentAliases,assignmentPersonId,memberIds,nextDay,isWeekendDay} from '../../scheduler-web/src/utils/personalWork.ts';
import {withAllocationBounds} from '../../scheduler-web/src/utils/scheduleAllocations.ts';
import {scheduleExtensionDepartment} from '../../scheduler-web/src/utils/postDeliveryVisibility.ts';

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
 const pendingRequest=match[2]?requests.find((r:any)=>r.id===decodeURIComponent(match[2])):null;
 const department=scheduleExtensionDepartment(project,pendingRequest||{taskId:input.taskId});
 const manager=(person:any)=>canManage(person,department)||(department==='토목&조경팀'&&person.id==='u_8');
 const managers=directoryRows.filter((person:any)=>person.active===1&&manager(person));
 const chiefs=managers.filter((person:any)=>person.position==='실장'||person.id===(department==='마감팀'?'u_12':department==='구조팀'?'u_24':'u_8'));
 const guards:any[]=[db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND department=? AND position=?)').bind(user.id,user.department,user.position)];
 let changed:any,recipients:string[]=[],applied:any={};
 if(!match[2]){
  const userTasks=assignedTasks(user.id,[project],aliasesFor(user.id)),task=userTasks.find(t=>t.id===input.taskId);
  if(!task)return fail('본인에게 배정된 업무만 연장을 요청할 수 있습니다.',403);
  if(input.previousEnd!==task.endDate)return fail('마감일이 변경되었습니다. 최신 일정을 확인하세요.',409);
  const type=input.type||'DEADLINE';
  if(!['DEADLINE','OVERTIME','WEEKEND'].includes(type)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||input.reasonCategory!==undefined&&(typeof input.reasonCategory!=='string'||input.reasonCategory.length>100))return fail('연장 유형과 사유를 확인하세요.');
  if(type==='DEADLINE'&&(!validDay(input.requestedEnd)||input.requestedEnd<=task.endDate))return fail('현재 마감일 이후의 요청 완료일을 입력하세요.');
  const minutes=(value:unknown)=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  const duration=minutes(input.endTime)-minutes(input.startTime);
  if(type!=='DEADLINE'&&(!validDay(input.workDate)||input.workDate<task.startDate||!Number.isFinite(duration)||duration<=0))return fail('배정 시작일 이후의 근무일과 당일 시작·종료 시간을 확인하세요.');
  if(type==='WEEKEND'&&!isWeekendDay(input.workDate))return fail('주말 출근은 토요일 또는 일요일에 신청하세요.');
  if(type==='WEEKEND'&&input.approverId===undefined&&!managers.length)return fail('주말 출근을 보고할 활성 팀장 또는 실장 계정이 필요합니다.',409);
  if(type==='WEEKEND'&&requests.some((r:any)=>r.type==='WEEKEND'&&r.status==='APPROVED'&&r.taskId===task.id&&r.userId===user.id&&r.workDate===input.workDate&&minutes(input.startTime)<minutes(r.endTime)&&minutes(input.endTime)>minutes(r.startTime)))return fail('이미 승인된 주말 출근 시간과 겹칩니다. 승인 내역을 확인하세요.',409);
  if(requests.some((r:any)=>r.taskId===task.id&&r.userId===user.id&&r.status==='PENDING'&&(r.type||'DEADLINE')===type&&(type!=='WEEKEND'||r.workDate===input.workDate)))return fail('이 업무의 승인 대기 요청이 이미 있습니다.',409);
  if(type==='DEADLINE'&&requests.some((r:any)=>r.taskId===task.id&&r.userId===user.id&&r.status==='APPROVED'&&(r.type||'DEADLINE')==='DEADLINE'&&r.appliedTaskId&&r.appliedTaskId!==task.id&&userTasks.some(t=>t.id===r.appliedTaskId)))return fail('이미 승인된 개인 연장 구간이 있습니다. 최신 연장 구간의 업무를 선택해 이어서 신청하세요.',409);
  if(type==='DEADLINE'){
   if(!pmId)return fail('현재 프로젝트 PM이 없거나 확인되지 않습니다. PM 배정을 먼저 확인하세요.',409);
   if(!managers.length)return fail('해당 팀의 활성 팀장 또는 실장 계정이 필요합니다.',409);
   if(input.approverId!==undefined&&input.approverId!==pmId)return fail('완료일 연장은 현재 프로젝트 PM이 먼저 검토해야 합니다.',403);
   recipients=[pmId,...chiefs.map((person:any)=>person.id)];
   guards.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1)').bind(pmId));
  }else if(input.approverId!==undefined){
   const approver:any=typeof input.approverId==='string'?await db.prepare('SELECT id,department,position FROM studio_users WHERE id=? AND active=1').bind(input.approverId).first():null;
   if(!approver||!(approver.id===pmId||manager(approver)))return fail('현재 프로젝트 PM 또는 해당 팀 결재 담당자를 선택하세요.',403);
   recipients=[approver.id];
  }
  changed={id:crypto.randomUUID(),taskId:task.id,department,...(task.allocationId?{allocationId:task.allocationId}:{}),userId:user.id,userName:user.name,roleName:task.roleName,previousEnd:task.endDate,requestedEnd:type==='DEADLINE'?input.requestedEnd:task.endDate,type,...(type!=='DEADLINE'?{workDate:input.workDate,startTime:input.startTime,endTime:input.endTime,hours:duration/60}:{}),...(type==='DEADLINE'?{approvalStage:'PM',pmApproverId:pmId,approverId:pmId}:input.approverId?{approverId:input.approverId}:{}),reasonCategory:input.reasonCategory||'',reason:input.reason.trim(),createdAt:now,status:'PENDING'};
  project.scheduleExtensions=[...requests,changed];
  if(!recipients.length)recipients=managers.map((person:any)=>person.id);
 }else{
  const pending=requests.find((r:any)=>r.id===decodeURIComponent(match[2]));
  if(!pending)return fail('연장 요청을 찾을 수 없습니다.',404);
  const isManager=manager(user);
  const designated=directoryRows.find((person:any)=>person.id===pending.approverId&&person.active===1);
  const designatedValid=designated&&(designated.id===pmId||manager(designated));
  const staged=!!pending.approvalStage;
  const pmValid=!!pmId&&pending.pmApproverId===pmId;
  const mayReview=staged?(pending.approvalStage==='PM'?user.id===pending.pmApproverId&&pmValid:isManager):pending.approverId?user.id===pending.approverId&&designatedValid:isManager;
  const mayRejectOrphan=match[3]==='reject'&&isManager&&(staged?!pmValid:pending.approverId&&!designatedValid);
  if(!mayReview&&!mayRejectOrphan)return fail('지정된 PM 또는 해당 팀 결재 담당자의 승인 권한이 필요합니다.',403);
  if(input.revision!==row.revision)return fail('프로젝트가 변경되었습니다. 최신 요청을 확인하세요.',409);
  if(pending.status!=='PENDING')return fail('이미 처리된 요청입니다.',409);
  if(input.memo!==undefined&&(typeof input.memo!=='string'||input.memo.length>1000))return fail('처리 메모는 1,000자 이내로 입력하세요.');
  if(match[3]==='approve'){
   const task=assignedTasks(pending.userId,[project],aliasesFor(pending.userId)).find(t=>t.id===pending.taskId);
   let expectedEnd=pending.previousEnd;
   if(['OVERTIME','WEEKEND'].includes(pending.type)&&task&&task.endDate!==expectedEnd){
    // An approved deadline extension must explain the end change on this same assignment.
    const extensions=requests.filter((r:any)=>r.status==='APPROVED'&&(r.type||'DEADLINE')==='DEADLINE'&&r.userId===pending.userId&&r.taskId===pending.taskId&&(r.appliedTaskId??r.taskId)===pending.taskId&&typeof r.decidedAt==='string'&&typeof pending.createdAt==='string'&&r.decidedAt>=pending.createdAt&&validDay(r.previousEnd)&&validDay(r.requestedEnd)&&r.requestedEnd>r.previousEnd).sort((a:any,b:any)=>a.requestedEnd.localeCompare(b.requestedEnd));
    for(const extension of extensions)if(extension.previousEnd===expectedEnd)expectedEnd=extension.requestedEnd;
   }
   if(!task||task.endDate!==expectedEnd||pending.allocationId!==undefined&&pending.allocationId!==task.allocationId)return fail('배정 또는 마감일이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
   if(['OVERTIME','WEEKEND'].includes(pending.type)&&pending.workDate<task.startDate)return fail('배정 시작일이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
   if(pending.type==='WEEKEND'&&(!isWeekendDay(pending.workDate)||!Number.isFinite(pending.hours)||pending.hours<=0))return fail('주말 출근 날짜와 시간을 확인한 뒤 다시 신청하세요.',409);
   if(staged&&!pmValid)return fail('PM 배정이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
   if(staged&&pending.approvalStage==='TEAM'&&!pending.pmReview?.approvedAt)return fail('PM 검토를 먼저 완료하세요.',409);
   if(staged&&pending.approvalStage==='PM'&&!managers.length)return fail('해당 팀의 활성 팀장 또는 실장 계정이 필요합니다.',409);
   if((pending.type||'DEADLINE')==='DEADLINE'&&(!staged||pending.approvalStage==='TEAM')){
    const follow=(project.postDeliveryTasks||[]).find((t:any)=>`gen-${project.id}-followup-${t.id}`===task.id);
    if(follow){
     if(memberIds(follow).some(reference=>!aliasesFor(pending.userId).includes(reference))){
      if(project.postDeliveryTasks.length>=100)return fail('검토·수정 일정은 최대 100개입니다. 기존 후속 일정을 확인한 뒤 연장을 다시 신청하세요.',409);
      const addition={...follow,id:`extension-${pending.id}`,personIds:[pending.userId],startDate:nextDay(pending.previousEnd),endDate:pending.requestedEnd};
      project.postDeliveryTasks.push(addition);applied={appliedTaskId:`gen-${project.id}-followup-${addition.id}`};
     }else{follow.endDate=pending.requestedEnd;applied={appliedTaskId:task.id};}
    }
     else{
      let subTask=project.subTasks?.[task.roleName];
      const source=task.allocationId?subTask?.allocations?.find((allocation:any)=>allocation.id===task.allocationId):subTask||project.roles?.[task.roleName];
      if(!source)return fail('배정 구간이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
      const shared=memberIds(source).some(reference=>!aliasesFor(pending.userId).includes(reference));
      if(shared){
       if(!subTask){subTask={...source,roleName:task.roleName,personId:memberIds(source)[0]||'',personIds:memberIds(source),startDate:task.startDate,endDate:task.endDate,memo:source.memo||''};project.subTasks={...project.subTasks,[task.roleName]:subTask};}
       if(subTask.allocations===undefined){
        subTask.legacyAllocationId??=`extension-original-${crypto.randomUUID()}`;
        subTask.allocations=[{id:subTask.legacyAllocationId,personIds:memberIds(subTask),startDate:task.startDate,endDate:task.endDate,memo:subTask.memo,...(subTask.dateMode?{dateMode:subTask.dateMode}:{})}];
       }
       const addition={id:`extension-${pending.id}`,personIds:[pending.userId],startDate:nextDay(pending.previousEnd),endDate:pending.requestedEnd,memo:source.memo??subTask.memo,dateMode:'CUSTOM'};
       subTask.allocations.push(addition);subTask.personIds=[...new Set([...(task.roleName==='PM'&&subTask.personId?[subTask.personId]:[]),...subTask.allocations.flatMap((allocation:any)=>allocation.personIds)])];
       Object.assign(subTask,withAllocationBounds(subTask));
       applied={appliedTaskId:`gen-${project.id}-${task.roleName}-${addition.id}`,appliedAllocationId:addition.id};
      }else{
      if(task.allocationId){
       const allocation=subTask?.allocations?.find((a:any)=>a.id===task.allocationId);
       if(!allocation)return fail('배정 구간이 변경되어 승인할 수 없습니다. 요청을 반려하고 다시 신청하세요.',409);
       allocation.endDate=pending.requestedEnd;allocation.dateMode='CUSTOM';
       Object.assign(subTask,withAllocationBounds(subTask));
      }else if(subTask){subTask.endDate=pending.requestedEnd;subTask.dateMode='CUSTOM';}
      applied={appliedTaskId:task.id,...(task.allocationId?{appliedAllocationId:task.allocationId}:{})};
      }
      project.roles={...project.roles,[task.roleName]:{...project.roles?.[task.roleName],...(subTask?{personId:(subTask.personIds||[subTask.personId])[0]||'',startDate:subTask.startDate,endDate:subTask.endDate}:{endDate:pending.requestedEnd})}};
      if(task.roleName!=='PM'&&!task.allocationId)project.progress=projectProgress(project).actual??project.progress;
     }
   }
  }
  const pmApproval=match[3]==='approve'&&staged&&pending.approvalStage==='PM';
  changed=pmApproval?{...pending,approvalStage:'TEAM',pmReview:{userId:user.id,name:user.name,approvedAt:now,memo:input.memo||''}}:{...pending,...applied,status:match[3]==='approve'?'APPROVED':'REJECTED',decidedBy:user.id,decidedName:user.name,decidedAt:now,decisionMemo:input.memo||''};
  project.scheduleExtensions=requests.map((r:any)=>r.id===changed.id?changed:r);
  recipients=pmApproval?managers.map((person:any)=>person.id):[pending.userId,...(staged?chiefs.map((person:any)=>person.id):[])];
  if(staged&&match[3]==='approve')guards.push(db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1)').bind(pmId));
 }
 const detail=changed.type==='OVERTIME'||changed.type==='WEEKEND'?`${changed.workDate} ${changed.startTime} ~ ${changed.endTime}, ${changed.hours}시간`:`${changed.previousEnd} → ${changed.requestedEnd}`;
 const message=changed.status==='PENDING'?(changed.approvalStage==='TEAM'?`${project.code} ${changed.roleName} 일정 연장 PM 검토 완료 · 팀장 또는 실장 최종 승인 필요 (${detail})`:`${user.name} · ${project.code} ${changed.roleName} ${changed.type==='WEEKEND'?'주말 출근':changed.type==='OVERTIME'?'추가 시간':'일정 연장'} 요청 (${detail})`):`${project.code} · ${project.name} · ${changed.roleName} ${changed.type==='WEEKEND'?'주말 출근':changed.type==='OVERTIME'?'추가 시간':'일정 연장'} ${changed.status==='APPROVED'?'승인':'반려'} (${detail}) · ${user.name}`;
 try{await db.batch([
  db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?)').bind(id,row.revision),
  ...guards,
  db.prepare('UPDATE studio_projects SET body=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(JSON.stringify(project),now,user.id,id,row.revision),
  ...[...new Set(recipients)].map(recipient=>db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(changed.status==='APPROVED'&&recipient===changed.userId?`extension-approved:${changed.id}`:crypto.randomUUID(),recipient,`extension:${id}`,message,now))
 ]);}catch{return fail('동시 변경으로 요청을 저장하지 못했습니다. 입력은 유지하고 최신 상태를 확인하세요.',409);}
 return Response.json({project,revision:row.revision+1,request:changed});
}
