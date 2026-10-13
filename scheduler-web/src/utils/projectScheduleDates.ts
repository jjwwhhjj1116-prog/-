import type {Project,SubTaskSchedule} from '../store/useProjectStore';
import {validDateRange} from './scheduleProgress.ts';
import {withAllocationBounds} from './scheduleAllocations.ts';

export type ProjectPeriod=Pick<Project,'startDate'|'endDate'>;

// Existing personal periods are explicit. Only marked common periods follow the project.
export function taskWithProjectDates(task:SubTaskSchedule,period:ProjectPeriod):SubTaskSchedule {
 if(!validDateRange(period.startDate,period.endDate))return task;
 const dates={startDate:period.startDate,endDate:period.endDate};
 if(task.allocations!==undefined){
  let changed=false;
  const allocations=task.allocations.map(allocation=>{
   if(allocation.dateMode!=='PROJECT'||allocation.startDate===period.startDate&&allocation.endDate===period.endDate)return allocation;
   changed=true;return {...allocation,...dates};
  });
  return changed?withAllocationBounds({...task,allocations}):task;
 }
 return task.dateMode==='PROJECT'&&(task.startDate!==period.startDate||task.endDate!==period.endDate)?{...task,...dates}:task;
}

export function applyProjectDates(project:Project,tasks:Record<string,SubTaskSchedule>=project.subTasks):Record<string,SubTaskSchedule>{
 return Object.fromEntries(Object.entries(tasks).map(([name,task])=>[name,taskWithProjectDates(task,project)]));
}
