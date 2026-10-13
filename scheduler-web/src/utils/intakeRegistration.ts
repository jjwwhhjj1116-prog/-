import type {IntakeProject} from '../components/IntakeListView';
import type {Department,Project} from '../store/useProjectStore';

export function newProjectFromIntake(item:IntakeProject,targetDept:Department):Omit<Project,'id'> {
  return {code:item.code,name:item.name,client:item.client,rawTitle:item.rawTitle,startDate:item.startDate||'',endDate:item.endDate||'',department:targetDept,pmId:'',
    area:item.area,usage:item.usage,buildings:item.buildings,floors:item.floors,contacts:item.contacts,notes:item.notes,request:item.request,
    progress:0,status:'착수예정',roles:{},subTasks:{}};
}
