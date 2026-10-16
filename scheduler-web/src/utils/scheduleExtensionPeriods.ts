import type {Project} from '../store/useProjectStore';
import {nextDay,validDay} from './personalWork.ts';

// Only approved days belonging to this exact assignment may appear as an extension.
export function scheduleExtensionPeriods(project:Project|undefined,task:{id:string;startDate:string;endDate:string}){
 const periods=(project?.scheduleExtensions||[]).filter(request=>request.status==='APPROVED'&&(request.type||'DEADLINE')==='DEADLINE'&&(request.appliedTaskId||request.taskId)===task.id&&validDay(request.previousEnd)&&validDay(request.requestedEnd)&&request.previousEnd<request.requestedEnd).map(request=>({start:nextDay(request.previousEnd)>task.startDate?nextDay(request.previousEnd):task.startDate,end:request.requestedEnd<task.endDate?request.requestedEnd:task.endDate})).filter(period=>validDay(period.start)&&validDay(period.end)&&period.start<=period.end).sort((a,b)=>a.start.localeCompare(b.start));
 const merged:{start:string;end:string}[]=[];
 for(const period of periods){const previous=merged.at(-1);if(previous&&period.start<=nextDay(previous.end))previous.end=period.end>previous.end?period.end:previous.end;else merged.push({...period});}
 return merged;
}
