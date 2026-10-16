import { HOLIDAY_YEARS } from '../constants/holidays.ts';
import type { Project, SubTaskSchedule } from '../store/useProjectStore';
import {isWorkDay,type WorkCalendarContext} from './workCalendar.ts';

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export const validDateRange = (start: string, end: string) => validDate(start) && validDate(end) && start <= end;
function workingDates(start: string, end: string, holidays?: Set<string>,context:WorkCalendarContext={}): Set<string> | undefined {
  const knownYear=(year:string)=>HOLIDAY_YEARS.has(year)||context.company==='VIETQS'&&context.calendars?.some(calendar=>calendar.year===Number(year));
  if (!validDateRange(start,end) || (!holidays && (!knownYear(start.slice(0,4)) || !knownYear(end.slice(0,4))))) return undefined;
  const dates = new Set<string>();
  for (let day = new Date(`${start}T00:00:00Z`); day.toISOString().slice(0,10) <= end; day.setUTCDate(day.getUTCDate()+1)) {
    const key=day.toISOString().slice(0,10);
    if(!holidays&&!knownYear(key.slice(0,4)))return undefined;
    if (holidays ? day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && !holidays.has(key) : isWorkDay(key,context)) dates.add(key);
  }
  return dates;
}
export const workDays = (start:string,end:string,holidays?:Set<string>,context:WorkCalendarContext={}):number|undefined => workingDates(start,end,holidays,context)?.size;
type ProgressTask = Pick<SubTaskSchedule,'startDate'|'endDate'|'progress'|'allocations'|'scopeExcluded'>;
function plannedDates(task:ProgressTask,context:WorkCalendarContext={}):Set<string>|undefined {
  if(task.scopeExcluded)return new Set<string>();
  if(task.allocations===undefined)return workingDates(task.startDate,task.endDate,undefined,context);
  const dates=new Set<string>();
  for(const allocation of task.allocations){
    const period=workingDates(allocation.startDate,allocation.endDate,undefined,context);
    if(!period)return undefined;
    for(const day of period)dates.add(day);
  }
  return dates;
}
export const plannedWorkDays = (task:ProgressTask,context:WorkCalendarContext={}):number|undefined => plannedDates(task,context)?.size;
// Plan periods, assignment metadata and PM-only edits preserve approved overall progress.
export function allocationScheduleOnly(before:Record<string,any>,after:Record<string,any>):boolean {
  const roles=[...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].filter(role=>role!=='PM');
  return roles.every(role=>{
    const old=before?.[role],next=after?.[role];
    if(!old||!next)return false;
    // Missing legacy editor fields equal only the established initial defaults.
    const read=(task:any)=>({...task,roleName:task.roleName??role,status:task.status??'예정',memo:task.memo??'',version:task.version??'v1'});
    const original=read(old),updated=read(next);
    return [...new Set([...Object.keys(original),...Object.keys(updated)])].filter(key=>!['allocations','legacyAllocationId','startDate','endDate','personId','personIds','dateMode'].includes(key)).every(key=>JSON.stringify(original[key])===JSON.stringify(updated[key]));
  });
}

// 관리 업무인 PM은 산출 공종 가중치에서 제외. 원본 progress 값은 이관 전 유지한다.
export function scheduleProgress(tasks: Record<string, ProgressTask>, today = localDate(),context:WorkCalendarContext={}) {
  const included = Object.entries(tasks).filter(([name,task]) => name !== 'PM' && !task.scopeExcluded).map(([,task]) => task);
  let days = 0, elapsed = 0, actual = 0, actualDays = 0;
  let completeActual = true;
  if (!included.length) return { planned: undefined, actual: undefined, days: 0 };
  for (const task of included) {
    // 연도별 휴일을 확인하지 않은 기간은 임의로 평일 계산하지 않는다.
    if (!task.startDate || !task.endDate) return { planned: undefined, actual: undefined, days: 0 };
    const duration = workDays(task.startDate, task.endDate,undefined,context);
    if (duration === undefined || duration === 0) return { planned: undefined, actual: undefined, days: 0 };
    const planned=plannedDates(task,context);
    if(!planned)return {planned:undefined,actual:undefined,days:0};
    days += planned.size;
    elapsed += task.allocations===undefined ? (today < task.startDate ? 0 : (workDays(task.startDate, today < task.endDate ? today : task.endDate,undefined,context) ?? 0)) : [...planned].filter(day=>day<=today).length;
    actualDays += duration;
    if (task.progress === undefined || !Number.isFinite(task.progress) || task.progress < 0 || task.progress > 100) completeActual = false;
    else actual += duration * task.progress;
  }
  return { planned: days ? elapsed / days * 100 : undefined, actual: completeActual ? actual / actualDays : undefined, days };
}

// 기존 roles 전용 공종도 포함하되 같은 공종은 최신 subTasks를 사용한다.
const projectTasks = (project: Project):Record<string,ProgressTask> => Object.fromEntries(
  Object.entries({...project.roles, ...project.subTasks}).filter(([,task]) => task && !('scopeExcluded' in task && task.scopeExcluded)).map(([name,task]) => [name, {
    ...task,
    startDate: task?.startDate || project.startDate,
    endDate: task?.endDate || project.endDate,
  }]),
);
export const projectProgress = (project: Project, today = localDate(),context:WorkCalendarContext={}) => scheduleProgress(projectTasks(project), today,context);
export const percentLabel = (value: number | undefined) => value === undefined ? '미산정' : `${value.toLocaleString('ko-KR', {maximumFractionDigits: 2})}%`;
// Display approved task extensions without overwriting the original project delivery date.
export function projectScheduleRange(project:Project){
 const tasks=Object.values(projectTasks(project));
 if(tasks.some(task=>task.allocations!==undefined)){
  const periods=tasks.flatMap<Pick<ProgressTask,'startDate'|'endDate'>>(task=>task.allocations===undefined?[task]:task.allocations).filter(task=>validDateRange(task.startDate,task.endDate));
  return {start:periods.map(task=>task.startDate).sort()[0]||'',end:periods.map(task=>task.endDate).sort().at(-1)||''};
 }
 const starts=[project.startDate,...tasks.map(t=>t.startDate)].filter(validDate).sort();
 const ends=[project.endDate,...tasks.map(t=>t.endDate)].filter(validDate).sort();
 return {start:starts[0]||project.startDate,end:ends.at(-1)||project.endDate};
}
