import type {CompanyWorkCalendar} from '../../scheduler-web/src/utils/workCalendar.ts';
import {validDay} from '../../scheduler-web/src/utils/personalWork.ts';
import {canManageSchedule,isScheduleAdmin} from '../../scheduler-web/src/utils/schedulePermissions.ts';

const key=(year:number)=>`work-calendar:VIETQS:${year}`;
const parse=(value:string)=>{try{return JSON.parse(value);}catch{return null;}};
const object=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value);
function validCalendar(calendar:any):calendar is CompanyWorkCalendar {
 if(!object(calendar)||Object.keys(calendar).some(field=>!['company','year','revision','saturdayOffDates','exceptions'].includes(field))||calendar.company!=='VIETQS'||!Number.isInteger(calendar.year)||calendar.year<2000||calendar.year>2100||!Number.isSafeInteger(calendar.revision)||calendar.revision<0||!Array.isArray(calendar.saturdayOffDates)||calendar.saturdayOffDates.length>53||new Set(calendar.saturdayOffDates).size!==calendar.saturdayOffDates.length||!Array.isArray(calendar.exceptions)||calendar.exceptions.length>732)return false;
 const day=(value:any)=>typeof value==='string'&&validDay(value)&&Number(value.slice(0,4))===calendar.year;
 if(calendar.saturdayOffDates.some((value:any)=>!day(value)||new Date(value+'T12:00:00Z').getUTCDay()!==6))return false;
 const ids=new Set<string>();
 for(const entry of calendar.exceptions){
  if(!object(entry)||Object.keys(entry).some(field=>!['id','kind','startDate','endDate','name'].includes(field))||typeof entry.id!=='string'||!entry.id.trim()||entry.id.length>100||ids.has(entry.id)||!['HOLIDAY','WORKDAY'].includes(entry.kind)||!day(entry.startDate)||!day(entry.endDate)||entry.startDate>entry.endDate||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>120)return false;
  ids.add(entry.id);
 }
 // An explicit WORKDAY overrides a holiday; overlapping entries of the same kind are ambiguous.
 return !calendar.exceptions.some((entry:any,index:number)=>calendar.exceptions.slice(index+1).some((other:any)=>entry.kind===other.kind&&entry.startDate<=other.endDate&&entry.endDate>=other.startDate));
}
export async function readWorkCalendars(db:any):Promise<CompanyWorkCalendar[]> {
 const rows=(await db.prepare("SELECT id,body FROM studio_reporting_settings WHERE id LIKE 'work-calendar:VIETQS:%' ORDER BY id").all()).results;
 return rows.map((row:any)=>{const calendar=parse(row.body);if(!validCalendar(calendar)||calendar.revision<1||row.id!==key(calendar.year))throw Error('등록된 VIET QS 근무달력의 형식을 확인하세요.');return calendar;}).sort((a:CompanyWorkCalendar,b:CompanyWorkCalendar)=>a.year-b.year);
}
function canManage(user:any):boolean {
 const profile=parse(user.profile||'{}');
 if(!profile||profile.id!==user.id)return false;
 const actor={...profile,id:user.id,department:user.department,position:user.position,active:true};
 return isScheduleAdmin(actor)||profile.company==='컨코스트'&&['마감팀','구조팀','토목&조경팀'].some(department=>canManageSchedule(actor,department as any,false));
}
export async function workCalendarRoute(request:Request,env:any,user:any,route:string):Promise<Response|null> {
 if(route.split('/')[0]!=='work-calendars')return null;
 const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}}),fail=(error:string,status=400)=>json({error},status);
 if(route!=='work-calendars')return fail('지원하지 않는 근무달력 요청입니다.',404);
 if(request.method==='GET')return json({workCalendars:await readWorkCalendars(env.DB),canManage:canManage(user)});
 if(request.method!=='POST')return fail('지원하지 않는 근무달력 요청입니다.',405);
 if(!canManage(user))return fail('관리자 또는 국내 팀장·실장만 회사 근무달력을 등록할 수 있습니다.',403);
 let input:any;try{input=await request.json();}catch{return fail('근무달력 입력 형식을 확인하세요.');}
 if(!object(input)||Object.keys(input).some(field=>!['calendar','baseRevision'].includes(field))||!validCalendar(input.calendar)||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0||input.baseRevision>=Number.MAX_SAFE_INTEGER||input.calendar.revision!==input.baseRevision)return fail('근무달력의 연도·토요 휴무·회사 휴일·변경 번호를 확인하세요. 동일 종류의 일정은 겹치지 않게 등록하세요.');
 const db=env.DB,id=key(input.calendar.year),row=await db.prepare('SELECT body FROM studio_reporting_settings WHERE id=?').bind(id).first();
 const previous=row?parse(row.body):null;
 if(row&&(!validCalendar(previous)||previous.revision<1||previous.year!==input.calendar.year))return fail('등록된 근무달력을 확인할 수 없습니다. 원본을 확인한 후 다시 등록하세요.',409);
 if((previous?.revision||0)!==input.baseRevision)return fail('다른 PC에서 근무달력을 변경했습니다. 최신 목록을 불러온 후 다시 저장하세요.',409);
 const calendar:CompanyWorkCalendar={...input.calendar,revision:input.baseRevision+1,saturdayOffDates:[...input.calendar.saturdayOffDates].sort()};
 const guards=[db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND department=? AND position=? AND profile=?)').bind(user.id,user.department,user.position,user.profile),row?db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_reporting_settings WHERE id=? AND body=?)').bind(id,row.body):db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE EXISTS(SELECT 1 FROM studio_reporting_settings WHERE id=?)').bind(id)];
 try{await db.batch([...guards,db.prepare('INSERT INTO studio_reporting_settings (id,body,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(id,JSON.stringify(calendar),new Date().toISOString(),user.id),db.prepare("UPDATE studio_sync_versions SET revision=revision+1 WHERE key='personal'")]);}
 catch{return fail('동시 변경으로 저장을 보류했습니다. 직원 권한과 최신 근무달력을 확인한 후 다시 저장하세요.',409);}
 return json({calendar});
}
