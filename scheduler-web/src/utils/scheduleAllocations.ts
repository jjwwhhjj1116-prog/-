import type {ScheduleAllocation, SubTaskSchedule} from '../store/useProjectStore';
import {validDateRange} from './scheduleProgress.ts';

export function allocationBounds(allocations:readonly ScheduleAllocation[]|undefined):{startDate:string;endDate:string}|undefined{
 if(!Array.isArray(allocations)||!allocations.length)return undefined;
 const periods=allocations.filter(a=>a&&validDateRange(a.startDate,a.endDate));
 if(!periods.length)return undefined;
 return {startDate:periods.map(a=>a.startDate).sort()[0],endDate:periods.map(a=>a.endDate).sort().at(-1)!};
}
export function withAllocationBounds<T extends {allocations?:ScheduleAllocation[];startDate:string;endDate:string}>(task:T):T{
 const bounds=allocationBounds(task.allocations);return bounds?{...task,...bounds}:task;
}

export function updateAssignmentMembers(task:SubTaskSchedule, change:{addIds?:readonly string[];removeIds?:readonly string[];startDate?:string;endDate?:string;restoreScope?:boolean}):SubTaskSchedule {
 if(task.scopeExcluded&&!change.restoreScope)throw new Error('용역 범위 없음 공종은 범위에 다시 포함한 뒤 배정하세요.');
 const remove=new Set(change.removeIds||[]),requested=[...new Set(change.addIds||[])];
 if([...remove,...requested].some(id=>typeof id!=='string'||!id.trim()))throw new Error('배정할 담당자 ID를 확인하세요.');
 const original=task.scopeExcluded?[]:task.personIds??(task.personId?[task.personId]:[]);
 let allocations=task.scopeExcluded?[]:task.allocations?.map(period=>({...period,personIds:period.personIds.filter(id=>!remove.has(id))})).filter(period=>period.personIds.length);
 const existing=allocations===undefined?original.filter(id=>!remove.has(id)):allocations.flatMap(period=>period.personIds);
 const added=requested.filter(id=>!existing.includes(id));
 if(!added.length&&!task.scopeExcluded&&!(task.allocations?.flatMap(period=>period.personIds)??original).some(id=>remove.has(id))&&!(task.roleName==='PM'&&remove.has(task.personId)))return task;
 let legacyAllocationId=task.legacyAllocationId;
 if(added.length){
  const startDate=change.startDate??task.startDate,endDate=change.endDate??task.endDate;
  if(!validDateRange(startDate,endDate))throw new Error('담당자 투입 시작일과 종료일을 확인하세요.');
  if(allocations===undefined){
   allocations=[];
   if(original.length){
    if(existing.length&&!validDateRange(task.startDate,task.endDate))throw new Error('기존 담당자의 배정 기간을 확인한 뒤 인원을 추가하세요.');
    legacyAllocationId??=`manual-${crypto.randomUUID()}`;
    if(existing.length)allocations.push({id:legacyAllocationId,personIds:existing,startDate:task.startDate,endDate:task.endDate,memo:task.memo,...(task.dateMode==='PROJECT'?{dateMode:'PROJECT' as const}:{})});
   }
  }
  allocations.push({id:`manual-${crypto.randomUUID()}`,personIds:added,startDate,endDate,...(task.dateMode==='PROJECT'&&change.startDate===undefined&&change.endDate===undefined?{dateMode:'PROJECT' as const}:{})});
 }
 const pm=task.roleName==='PM'&&task.personId&&!remove.has(task.personId)?[task.personId]:[];
 const personIds=[...new Set([...pm,...(allocations===undefined?existing:allocations.flatMap(period=>period.personIds))])];
 const personId=personIds.includes(task.personId)?task.personId:personIds[0]||'';
 return withAllocationBounds({...task,...(task.scopeExcluded?{scopeExcluded:false}:{}),personId,personIds,
  ...(allocations!==undefined?{allocations}:{}),...(legacyAllocationId!==undefined?{legacyAllocationId}:{})});
}
