import type {Project,SubTaskSchedule} from '../store/useProjectStore';
import {withAllocationBounds} from './scheduleAllocations.ts';
import {applyProjectDates} from './projectScheduleDates.ts';
// Reapply only the fields the editor changed, retaining unrelated remote edits.
export function rebaseProject(current:Project,base:Project,next:Project,rejectConflicts=false):Project {
 const checkRemote=(before:unknown,after:unknown,remote:unknown)=>{
  if(rejectConflicts&&JSON.stringify(remote)!==JSON.stringify(before)&&JSON.stringify(remote)!==JSON.stringify(after))throw Error('다른 화면에서 같은 일정 항목이 변경되었습니다. 입력은 유지됩니다. 최신 일정을 다시 불러온 뒤 조정해 주세요.');
 };
 const result:any={...current};
 for(const key of new Set([...Object.keys(base),...Object.keys(next)])){
  if(['id','department','roles','pmId','progress','scheduleExtensions'].includes(key))continue;
  const before=(base as any)[key],after=(next as any)[key];
  if(key==='subTasks'){
   result.subTasks={...current.subTasks};
   for(const role of new Set([...Object.keys(before||{}),...Object.keys(after||{})])){
    if(JSON.stringify(before?.[role])===JSON.stringify(after?.[role]))continue;
    const local=after?.[role];
    const legacy=current.roles?.[role]||(role==='PM'&&current.pmId?{personId:current.pmId,startDate:current.startDate,endDate:current.endDate}:undefined);
    const currentTask:SubTaskSchedule|undefined=current.subTasks?.[role]||(rejectConflicts&&legacy?{...legacy,roleName:role,personIds:legacy.personId?[legacy.personId]:[],startDate:legacy.startDate||current.startDate,endDate:legacy.endDate||current.endDate,status:'예정',memo:'',version:'v1'}:undefined);
    if(!local){checkRemote(before?.[role],local,currentTask);delete result.subTasks[role];continue;}
    if(before?.[role]&&!currentTask)throw Error('다른 화면에서 삭제된 공종입니다. 대기 변경은 보존됩니다. 서버 내용을 적용한 뒤 확인하세요.');
    if(rejectConflicts&&(base.roles?.[role]||role==='PM'&&base.pmId)&&!currentTask)throw Error('다른 화면에서 삭제된 공종입니다. 입력은 유지됩니다. 최신 일정을 다시 불러온 뒤 확인하세요.');
    if(!currentTask){result.subTasks[role]=local;continue;}
    const raw=before?.[role]||{roleName:role,personId:base.roles?.[role]?.personId||(role==='PM'?base.pmId:'')||'',startDate:base.roles?.[role]?.startDate||base.startDate,endDate:base.roles?.[role]?.endDate||base.endDate,status:'예정',memo:'',version:'v1'};
    const personIds=[...new Set((raw.personIds??(raw.personId?[raw.personId]:[])).filter(Boolean))];
    const original={...raw,personIds,personId:personIds[0]||''};
    if(rejectConflicts&&raw.allocations===undefined&&local.allocations===undefined&&currentTask.allocations!==undefined&&(['personId','personIds','startDate','endDate'] as const).some(field=>!(field==='personIds'&&raw.personIds===undefined&&local.personIds===undefined)&&JSON.stringify(original[field])!==JSON.stringify(local[field])))throw Error('다른 화면에서 인원별 투입 구간이 추가되었습니다. 입력은 유지됩니다. 최신 일정을 다시 불러온 뒤 해당 구간을 조정해 주세요.');
    if(role==='PM'&&local.allocations!==undefined&&original.personId!==local.personId&&currentTask.personId!==original.personId&&currentTask.personId!==local.personId)throw Error('다른 화면에서 PM 총괄 책임자가 변경되었습니다. 최신 담당자를 확인한 뒤 다시 조정하세요.');
    const reapplied={...currentTask};
    // Keep approved results and untouched remote edits; the editor only owns schedule fields.
    for(const field of ['roleName','personId','personIds','startDate','endDate','dateMode','status','memo','version','subType','reportingMode','reportingModes','legacyAllocationId','scopeExcluded'] as const){
     if(local.allocations!==undefined&&(['startDate','endDate','personIds'].includes(field)||role!=='PM'&&field==='personId'))continue;
     if(rejectConflicts&&field==='personIds'&&raw.personIds===undefined&&local.personIds===undefined)continue;
     if(JSON.stringify(original[field])!==JSON.stringify(local[field])){checkRemote(original[field],local[field],currentTask[field]);Object.assign(reapplied,{[field]:local[field]});}
    }
    if(JSON.stringify(original.allocations)!==JSON.stringify(local.allocations)){
     if(local.allocations===undefined){checkRemote(original.allocations,local.allocations,currentTask.allocations);delete reapplied.allocations;}
     else{
      const allocations=new Map((currentTask.allocations||[]).map(a=>[a.id,a]));
      const old=new Map<string,any>((original.allocations||[]).map((a:any)=>[a.id,a]));
      const edited=new Map<string,any>(local.allocations.map((a:any)=>[a.id,a]));
      for(const id of new Set([...old.keys(),...edited.keys()])){
       const previous:any=old.get(id),changed:any=edited.get(id),remote=allocations.get(id);
       if(JSON.stringify(previous)===JSON.stringify(changed))continue;
       if(!changed){checkRemote(previous,changed,remote);allocations.delete(id);continue;}
       if(previous&&!remote)throw Error('다른 화면에서 삭제된 할당 구간입니다. 대기 변경은 보존됩니다. 서버 내용을 적용한 뒤 확인하세요.');
       const applied={...remote};
       for(const field of ['id','personIds','startDate','endDate','dateMode','memo','source'])if(JSON.stringify(previous?.[field])!==JSON.stringify(changed[field])){checkRemote(previous?.[field],changed[field],(remote as any)?.[field]);Object.assign(applied,{[field]:changed[field]});}
       allocations.set(id,applied as any);
      }
      reapplied.allocations=[...allocations.values()];
     }
    }
    if(reapplied.allocations!==undefined){
     reapplied.personIds=[...new Set([...(role==='PM'&&reapplied.personId?[reapplied.personId]:[]),...reapplied.allocations.flatMap(a=>a.personIds)])];
     if(role!=='PM')reapplied.personId=reapplied.personIds[0]||'';
    }
    result.subTasks[role]=withAllocationBounds(reapplied);
   }
  }else if(key==='postDeliveryTasks'&&JSON.stringify(before)!==JSON.stringify(after)){
   const tasks=new Map((current.postDeliveryTasks||[]).map(task=>[task.id,task]));
   const old=new Map<string,any>((before||[]).map((task:{id:string})=>[task.id,task]));
   const edited=new Map<string,any>((after||[]).map((task:{id:string})=>[task.id,task]));
   for(const id of new Set<string>([...old.keys(),...edited.keys()])){
    const previous=old.get(id),local=edited.get(id);
    if(JSON.stringify(previous)===JSON.stringify(local))continue;
    if(!local){tasks.delete(id);continue;}
    const currentTask=tasks.get(id);
    if(previous&&!currentTask)throw Error('다른 화면에서 삭제된 검토·수정 일정입니다. 대기 변경은 보존됩니다. 서버 내용을 적용한 뒤 확인하세요.');
    if(!currentTask){tasks.set(id,local);continue;}
    // Forced schedule edits must retain the server's approved progress and approval date.
    const reapplied={...currentTask};
    for(const field of ['kind','startDate','endDate','memo','personIds','status','reportingMode','reportingModes'] as const){
     if(JSON.stringify(previous?.[field])!==JSON.stringify(local[field]))Object.assign(reapplied,{[field]:local[field]});
    }
    tasks.set(id,reapplied);
   }
   result.postDeliveryTasks=[...tasks.values()];
  }else if(JSON.stringify(before)!==JSON.stringify(after)){
   if(key==='startDate'||key==='endDate')checkRemote(before,after,(current as any)[key]);
   result[key]=after;
  }
 }
 result.subTasks=applyProjectDates(result);
 const legacyRoles=Object.fromEntries(Object.entries(current.roles||{}).filter(([role])=>!current.subTasks?.[role]));
 result.roles={...legacyRoles,...Object.fromEntries(Object.entries(result.subTasks||{}).map(([role,task])=>{const t=task as any;return [role,{personId:(t.personIds??[t.personId])[0]||'',startDate:t.startDate,endDate:t.endDate}];}))};
 result.pmId=result.subTasks?.PM ? result.roles.PM?.personId||'' : current.subTasks?.PM ? '' : current.pmId;
 return result;
}
