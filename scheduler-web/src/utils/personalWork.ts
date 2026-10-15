import {HOLIDAYS} from '../constants/holidays.ts';
import {workDays} from './scheduleProgress.ts';
import {isPostDeliveryConfirmed,postDeliveryDepartment} from './postDeliveryVisibility.ts';
import {VIET_TEAMS_DATA} from '../data/vietTeams.ts';
import type {Project,ScheduleAllocation} from '../store/useProjectStore';
import type {WorkLogItem} from '../store/useWorkLogStore';
export interface Leave {id:string;user_id:string;start_date:string;end_date:string;kind:string;revision:number;name?:string}
export const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
export const nextDay=(day:string)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
export function dayOff(day:string){const n=new Date(day+'T12:00:00Z').getUTCDay();return n===0||n===6?'주말':HOLIDAYS[day]?.country==='KR'?HOLIDAYS[day].name:'';}
export const leavesFor=(leaves:Leave[],id:string,start:string,end=start)=>leaves.filter(l=>l.user_id===id&&l.start_date<=end&&l.end_date>=start);
export type AssignedTask=WorkLogItem&{startDate:string;endDate:string;reportingMode:'DAILY'|'TASK';legacyAllocationId?:string};
export type AssignmentPerson={id:string;name?:string;no?:string|number;active?:boolean};
type AssignmentMembers={personId?:string;personIds?:string[]};
export const memberIds=(task:AssignmentMembers)=>task.personIds!==undefined?(task.personIds||[]):task.personId?[task.personId]:[];
export type AssignmentSegment={id?:string;personIds:string[];startDate:string;endDate:string;memo?:string;source?:ScheduleAllocation['source']};
export function assignmentSegments(task:AssignmentMembers&{scopeExcluded?:boolean;allocations?:ScheduleAllocation[];startDate?:string;endDate?:string;memo?:string},fallbackStart='',fallbackEnd=''):AssignmentSegment[]{
 if(task.scopeExcluded)return [];
 return task.allocations!==undefined?task.allocations.map(segment=>({...segment,personIds:segment.personIds||[],memo:segment.memo??task.memo})):
  [{personIds:memberIds(task),startDate:task.startDate||fallbackStart,endDate:task.endDate||fallbackEnd,memo:task.memo}];
}
const staffNumber=(person:AssignmentPerson)=>typeof person.no==='string'||typeof person.no==='number'&&Number.isFinite(person.no)?String(person.no):'';
const teamReferences=new Set(VIET_TEAMS_DATA.flatMap(team=>[team.id,team.code,team.name,team.displayName]));
// Only the current directory can establish an unambiguous personal legacy reference.
export function assignmentAliases(actor:AssignmentPerson|null|undefined,directory:AssignmentPerson[]):string[]{
 if(!actor?.id)return [];
 const active=directory.filter(person=>person.active!==false),owners=active.filter(person=>person.id===actor.id);
 if(owners.length!==1)return [actor.id];
 const owner=owners[0],aliases=[actor.id];
 for(const value of [owner.name,staffNumber(owner)]){
  if(typeof value!=='string'||!value||teamReferences.has(value)||directory.some(person=>person.id===value&&person.id!==actor.id))continue;
  const matches=active.filter(person=>person.name===value||staffNumber(person)===value);
  if(matches.length===1&&matches[0].id===actor.id)aliases.push(value);
 }
 return [...new Set(aliases)];
}
export function assignmentPersonId(reference:string|null|undefined,directory:AssignmentPerson[]):string|undefined{
 if(typeof reference!=='string'||!reference)return undefined;
 const canonical=directory.filter(person=>person.id===reference);
 if(canonical.length)return canonical.length===1&&canonical[0].active!==false?canonical[0].id:undefined;
 const owners=directory.filter(person=>person.active!==false&&assignmentAliases(person,directory).includes(reference));
 return owners.length===1?owners[0].id:undefined;
}
const assignedTeamIds=(task:AssignmentMembers,userId:string)=>VIET_TEAMS_DATA.filter(team=>team.members.some(member=>member.id===userId)).flatMap(team=>memberIds(task).filter(reference=>[team.id,team.code,team.name,team.displayName].includes(reference)));
export const taskAssignedTo=(task:AssignmentMembers,userId:string,aliases:string[]=[userId])=>memberIds(task).some(id=>id===userId||aliases.includes(id))||assignedTeamIds(task,userId).length>0;
export const assignedReportingMode=(task:AssignmentMembers&{reportingMode?:'DAILY'|'TASK';reportingModes?:Record<string,'DAILY'|'TASK'>},userId:string,aliases:string[]=[userId])=>task.reportingModes?.[userId]||aliases.filter(id=>memberIds(task).includes(id)).map(id=>task.reportingModes?.[id]).find(Boolean)||assignedTeamIds(task,userId).map(id=>task.reportingModes?.[id]).find(Boolean)||task.reportingMode||'DAILY';
export function assignedTasks(userId:string,projects:Project[],aliases:string[]=[userId]):AssignedTask[]{
 const rows:AssignedTask[]=[];
 for(const p of projects){
  const tasks={...p.roles,...p.subTasks};
  for(const [role,t]of Object.entries(tasks)){
   if(!t)continue;
   const sub=p.subTasks?.[role];
   for(const segment of assignmentSegments(t,p.startDate,p.endDate)){
    const assignment={...sub,personIds:segment.personIds},start=segment.startDate,end=segment.endDate;
    if(!taskAssignedTo(assignment,userId,aliases)||!validDay(start)||!validDay(end)||start>end)continue;
    rows.push({id:`gen-${p.id}-${role}${segment.id&&segment.id!==sub?.legacyAllocationId?'-'+segment.id:''}`,...(segment.id?{allocationId:segment.id}:{}),...(sub?.legacyAllocationId?{legacyAllocationId:sub.legacyAllocationId}:{}),projectId:p.id,projectCode:p.code||p.id,projectName:p.name,department:p.department,roleName:role,scheduleMemo:segment.memo||'',
     todayTask:segment.memo||`${role} 배정 업무`,progress:sub?.progress??0,status:sub?.status==='완료'?'완료':sub?.status==='지연'?'지연':sub?.status==='진행중'?'진행중':'대기',tomorrowPlan:'',notes:`배정 기간: ${start} ~ ${end}`,startDate:start,endDate:end,reportingMode:assignedReportingMode(assignment,userId,aliases),reportBasis:assignedReportingMode(assignment,userId,aliases),scheduleDerived:true,manualFields:[]});
   }
  }
  for(const task of p.postDeliveryTasks||[]){
   if(!isPostDeliveryConfirmed(task))continue;
   if(!taskAssignedTo(task,userId,aliases)||!validDay(task.startDate)||!validDay(task.endDate)||task.startDate>task.endDate)continue;
   rows.push({id:`gen-${p.id}-followup-${task.id}`,projectId:p.id,projectCode:p.code||p.id,projectName:p.name,department:postDeliveryDepartment(p,task),roleName:`납품 후 ${task.kind}`,scheduleMemo:task.memo,
    todayTask:task.memo,progress:task.progress??(task.status==='완료'?100:0),status:task.status==='완료'?'완료':task.status==='진행중'?'진행중':'대기',tomorrowPlan:'',notes:`검토·수정 기간: ${task.startDate} ~ ${task.endDate}`,startDate:task.startDate,endDate:task.endDate,reportingMode:assignedReportingMode(task,userId,aliases),reportBasis:assignedReportingMode(task,userId,aliases),scheduleDerived:true,manualFields:[]});
  }
 }
 return rows;
}
// Display the current schedule's raw actual value separately from report-input defaults.
export function approvedTaskProgress(task:AssignedTask|undefined,projects:Project[]):number|null {
 const project=task&&projects.find(project=>project.id===task.projectId);
 if(!task||!project)return null;
 const record=project.postDeliveryTasks?.find(follow=>task.id===`gen-${project.id}-followup-${follow.id}`)??project.subTasks?.[task.roleName]??project.roles?.[task.roleName];
 const value=record&&'progress' in record?record.progress:undefined;
 return typeof value==='number'&&Number.isFinite(value)?value:null;
}
// Calendar/team views can match historical IDs, staff numbers and team aliases without duplicating a task.
export function assignedTasksForAliases(aliases:string[],projects:Project[]):AssignedTask[]{
 const rows=new Map<string,AssignedTask>();
 for(const id of new Set(aliases.filter(Boolean)))for(const task of assignedTasks(id,projects))if(!rows.has(task.id))rows.set(task.id,task);
 return [...rows.values()];
}
export function assignedItems(userId:string,day:string,projects:Project[],aliases:string[]=[userId]):AssignedTask[]{
 if(!validDay(day)||dayOff(day))return [];
 return assignedTasks(userId,projects,aliases).filter(task=>task.startDate<=day&&task.endDate>=day);
}
export function reconcileItems(previous:WorkLogItem[],assigned:WorkLogItem[]):WorkLogItem[]{
 const next=assigned.map(item=>{
  const old=previous.find(p=>p.id===item.id);if(!old)return item;
  if(old.allocationId!==undefined&&old.allocationId!==item.allocationId)return {...old,scheduleRemoved:true};
  const editable=['todayTask','reportHtml','progress','status','tomorrowPlan','notes','workHours','remainingTask','delayReason','blockers','dailyGoal','plannedDetails','planMemo','planStartedAt','attachments'];
  const fields=(old.manualFields??['todayTask','progress','status','tomorrowPlan','notes']).filter(key=>editable.includes(key));
  return {...item,...Object.fromEntries(fields.map(key=>[key,old[key as keyof WorkLogItem]])),manualFields:fields,scheduleRemoved:false} as WorkLogItem;
 });
 for(const old of previous){
  if(next.some(n=>n.id===old.id))continue;
  if(!old.id.startsWith('gen-')||old.manualFields===undefined||old.manualFields.length)next.push({...old,scheduleRemoved:old.id.startsWith('gen-')});
 }
 return next;
}
// An explicit allocation can only link to the same current assignment; first-time legacy links require one candidate.
export function legacyAllocationTask(item:WorkLogItem,tasks:AssignedTask[]):AssignedTask|undefined {
 if(item.id!==`gen-${item.projectId}-${item.roleName}`)return undefined;
 const matching=tasks.filter(task=>task.projectId===item.projectId&&task.roleName===item.roleName);
 const anchors=[...new Set(matching.map(task=>task.legacyAllocationId).filter(Boolean))];
 if(item.allocationId===undefined&&anchors.length>1)return undefined;
 const allocationId=item.allocationId??anchors[0];
 const candidates=matching.filter(task=>task.allocationId&&(allocationId===undefined||allocationId===task.allocationId));
 return candidates.length===1?candidates[0]:undefined;
}
// An overdue task remains reportable without moving its planned deadline. Reassignment/archive revokes that link.
export function reconcileWorkLogItems(previous:WorkLogItem[],userId:string,day:string,projects:Project[],aliases:string[]=[userId]):WorkLogItem[]{
 const assigned=assignedItems(userId,day,projects,aliases);
 const reportable=assignedTasks(userId,projects,aliases);
 const conflicts=new Set(previous.filter(item=>item.allocationId!==undefined&&reportable.some(task=>task.id===item.id&&task.allocationId!==item.allocationId)).map(item=>item.id));
 for(const task of reportable)if(!conflicts.has(task.id)&&validDay(day)&&task.startDate<=day&&task.reportingMode==='TASK'&&previous.some(item=>!conflicts.has(item.id)&&(item.id===task.id||item.allocationId!==undefined&&legacyAllocationTask(item,reportable)?.id===task.id))&&!assigned.some(item=>item.id===task.id))assigned.push(task);
 const linked=assigned.filter(task=>!conflicts.has(task.id)).map(task=>{
  const legacyId=`gen-${task.projectId}-${task.roleName}`,legacy=previous.find(item=>item.id===legacyId);
  const canonical=previous.find(item=>item.id===task.id);
  return task.allocationId&&legacy&&!conflicts.has(legacy.id)&&(!canonical||canonical.scheduleDerived&&canonical.manualFields?.length===0)&&legacyAllocationTask(legacy,assigned)?.id===task.id?{...task,id:legacyId}:task;
 });
 return reconcileItems(previous,linked).map(item=>{
  const legacy=previous.find(old=>old.id===item.id&&old.id===`gen-${item.projectId}-${item.roleName}`);
  const allocation=linked.find(task=>task.id===item.id&&task.allocationId);
   // Newly generated anchor drafts keep the live schedule merge; imported legacy bodies retain their original metadata.
   const generatedAnchor=legacy&&allocation&&(legacy as AssignedTask).legacyAllocationId===allocation.allocationId;
   return legacy&&allocation&&!generatedAnchor&&(legacy.allocationId===undefined||legacy.allocationId===allocation.allocationId)?{...legacy,allocationId:allocation.allocationId,reportBasis:allocation.reportBasis,reportingMode:allocation.reportingMode,scheduleRemoved:false}:item;
 }).map(item=>previous.some(old=>old.id===item.id&&old.autoScheduleDate)&&!item.scheduleRemoved?automaticWorkLogItems([item],day)[0]:item);
}
export const reportsActualProgress=(item:WorkLogItem)=>item.manualFields===undefined||item.manualFields.includes('progress');

export function automaticWorkLogItems(items:WorkLogItem[],day:string):WorkLogItem[]{
 return items.map(item=>{
  if(item.scheduleRemoved||!item.startDate||!item.endDate||item.startDate>day||item.endDate<day||item.manualFields===undefined)return item;
  const total=workDays(item.startDate,item.endDate),elapsed=workDays(item.startDate,day);
  if(!total||elapsed===undefined)return item;
  const fields=item.manualFields||[],progress=Math.round(elapsed/total*10000)/100;
  return {...item,autoScheduleDate:day,...(!fields.includes('progress')?{progress}:{}),...(!fields.includes('status')?{status:progress===100?'완료' as const:'진행중' as const}:{}),...(!fields.includes('todayTask')?{todayTask:`[일정 기준 자동 작성] ${item.roleName} · ${item.scheduleMemo||item.projectName}`}: {})};
 });
}

// A site is shared across team records; original IDs remain the write targets.
export function sameWorkProject(projects:Project[],left:string,right:string){
 if(left===right)return true;
 const a=projects.find(p=>p.id===left),b=projects.find(p=>p.id===right);
 return !!a?.code?.trim()&&!!b&&a.code.trim().toUpperCase()===b.code.trim().toUpperCase();
}
export function workProjectOptions(projects:Project[]){return projects.filter((p,i)=>!projects.slice(0,i).some(other=>sameWorkProject(projects,p.id,other.id)));}
