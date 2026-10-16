import type {Project} from '../store/useProjectStore';
import {assignedTasksForAliases,assignmentAliases,isWeekendDay,type AssignmentPerson} from './personalWork.ts';
import {isWorkDay,workDateRanges,type CompanyWorkCalendar} from './workCalendar.ts';
import {projectScheduleRange} from './scheduleProgress.ts';

type DisplayTask={id:string;allocationId?:string;startDate:string;endDate:string};
const approvedTaskDays=(task:DisplayTask,project:Project|undefined,userIds:string[])=>new Set((project?.scheduleExtensions||[]).filter(request=>request.type==='WEEKEND'&&request.status==='APPROVED'&&userIds.includes(request.userId)&&request.taskId===task.id&&(request.allocationId===undefined||request.allocationId===task.allocationId)&&isWeekendDay(request.workDate||'')&&request.workDate!>=task.startDate).map(request=>request.workDate!));
export const matchesScheduleProject=(project:{code?:string;name:string},query:string)=>{
 const value=query.trim().toLocaleLowerCase();
 return !value||`${project.code||''} ${project.name}`.toLocaleLowerCase().includes(value);
};
export function taskDisplayRanges(task:DisplayTask,project:Project|undefined,userIds:string[],company:string|undefined,calendars:CompanyWorkCalendar[],start:string,end:string){
 const extra=approvedTaskDays(task,project,userIds);
 return workDateRanges(start,end,day=>extra.has(day)||day>=task.startDate&&day<=task.endDate&&isWorkDay(day,{company,calendars}));
}
// Contract bars use the union of the actual assignees working on each day, never the PM's country.
export function projectDisplayRanges(project:Project,department:string,start:string,end:string,users:(AssignmentPerson&{company?:string})[],calendars:CompanyWorkCalendar[],followupId?:string){
 const followup=followupId?project.postDeliveryTasks?.find(task=>task.id===followupId):undefined;
 const base=followupId?{start:followup?.startDate||'',end:followup?.endDate||''}:projectScheduleRange(project);
 const tasks=users.flatMap(person=>assignedTasksForAliases(assignmentAliases(person,users),[project])
  .filter(task=>task.department===department&&(followupId?task.id===`gen-${project.id}-followup-${followupId}`:!task.roleName.startsWith('납품 후 ')))
  .map(task=>({person,task,extra:approvedTaskDays(task,project,[person.id]),ranges:taskDisplayRanges(task,project,[person.id],person.company,calendars,start,end)})));
 return workDateRanges(start,end,day=>{
  if(tasks.some(({extra})=>extra.has(day)))return true;
  if(!base.start||!base.end||day<base.start||day>base.end)return false;
  const assigned=tasks.filter(({task})=>day>=task.startDate&&day<=task.endDate);
  if(assigned.length)return assigned.some(({ranges})=>ranges.some(range=>day>=range.startDate&&day<=range.endDate));
  if(tasks.some(({ranges})=>ranges.some(range=>day>=range.startDate&&day<=range.endDate)))return true;
  return isWorkDay(day,{company:'컨코스트',calendars});
 });
}
