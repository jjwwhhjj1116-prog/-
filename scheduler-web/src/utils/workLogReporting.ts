import type {DailyWorkLog,WorkLogItem} from '../store/useWorkLogStore';
import type {Project,SubTaskSchedule} from '../store/useProjectStore';
import {nextDay,reportsActualProgress,taskAssignedTo,type AssignedTask} from './personalWork.ts';
import {projectProgress} from './scheduleProgress.ts';

export type HistoryStatus='ALL'|'DRAFT'|'PENDING'|'APPROVED';
export function workLogStatus(log:DailyWorkLog):Exclude<HistoryStatus,'ALL'>{
 return log.approvalStatus==='APPROVED_FINAL'?'APPROVED':log.approvalStatus==='DRAFT'?'DRAFT':'PENDING';
}
export const workLogStatusLabel=(log:DailyWorkLog)=>workLogStatus(log)==='APPROVED'?'승인됨':workLogStatus(log)==='DRAFT'?'작성중':log.leaderReview?.approved?'실장 승인 대기':'팀장 검토 대기';
export function filterWorkLogHistory(logs:DailyWorkLog[],filter:{projectId:string;query:string;status:HistoryStatus;start:string;end:string;oldest:boolean}){
 const query=filter.query.trim().toLocaleLowerCase();
 return logs.filter(log=>(filter.projectId==='ALL'||log.items.some(i=>i.projectId===filter.projectId))&&(!filter.start||log.date>=filter.start)&&(!filter.end||log.date<=filter.end)&&(filter.status==='ALL'||workLogStatus(log)===filter.status)&&(!query||[log.userName,log.department,log.overallNotes,...log.items.flatMap(i=>[i.projectCode,i.projectName,i.roleName,i.todayTask,i.notes,i.remainingTask||'',i.delayReason||'',i.blockers||''])].join(' ').toLocaleLowerCase().includes(query)))
 .sort((a,b)=>((a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt))*(filter.oldest?1:-1))||a.id.localeCompare(b.id));
}
export function assignmentDeadline(task:AssignedTask,day:string){
 if(task.status==='완료'||task.progress===100)return '완료';
 if(task.startDate>day)return '착수 예정';
 if(task.endDate<day)return '기한 초과';
 if(task.endDate===day)return '오늘 마감';
 if(task.endDate===nextDay(day))return '내일 마감';
 return '진행중';
}
export function proposedProgress(project:Project,items:WorkLogItem[],date:string,userId:string,aliases:string[]=[userId]){
 const tasks=Object.fromEntries(Object.entries({...project.roles,...project.subTasks}).filter(([,task])=>task).map(([name,task])=>[name,{...task,startDate:task?.startDate||project.startDate,endDate:task?.endDate||project.endDate}])) as Record<string,SubTaskSchedule>;
 for(const item of items){const task=tasks[item.roleName];
  if(item.projectId!==project.id||item.scheduleRemoved||!reportsActualProgress(item)||!task||!taskAssignedTo(task,userId,aliases)||date<task.startDate||(task.actualProgressDate&&task.actualProgressDate>date)||(date>task.endDate&&item.reportBasis!=='TASK'))continue;
  tasks[item.roleName]={...task,progress:item.progress};
 }
 return projectProgress({...project,subTasks:tasks},date).actual;
}
