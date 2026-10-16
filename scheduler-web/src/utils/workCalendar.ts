import {HOLIDAYS} from '../constants/holidays.ts';

export type WorkCalendarException={id:string;kind:'HOLIDAY'|'WORKDAY';startDate:string;endDate:string;name:string};
export type CompanyWorkCalendar={company:'VIETQS';year:number;revision:number;saturdayOffDates:string[];exceptions:WorkCalendarException[]};
export type WorkCalendarContext={company?:string;calendars?:CompanyWorkCalendar[]};
export type WorkDayInfo={working:boolean;country:'KR'|'VN';kind:'WORKDAY'|'SATURDAY_WORK'|'SATURDAY_OFF'|'SUNDAY'|'HOLIDAY'|'UNKNOWN';name:string;configured:boolean};
const valid=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
export function workDayInfo(day:string,context:WorkCalendarContext={}):WorkDayInfo{
 const vietnam=context.company==='VIETQS',country=vietnam?'VN':'KR';
 if(!valid(day))return {working:false,country,kind:'UNKNOWN',name:'날짜 확인 필요',configured:false};
 const weekday=new Date(day+'T12:00:00Z').getUTCDay();
 const calendar=vietnam?context.calendars?.find(row=>row.year===Number(day.slice(0,4))&&row.company==='VIETQS'):undefined;
 const configured=!vietnam||!!calendar;
 if(calendar){
  const entries=calendar.exceptions.filter(entry=>entry.startDate<=day&&entry.endDate>=day);
  const work=entries.find(entry=>entry.kind==='WORKDAY');
  if(work)return {working:true,country,kind:weekday===6?'SATURDAY_WORK':'WORKDAY',name:work.name,configured};
  const holiday=entries.find(entry=>entry.kind==='HOLIDAY');
  if(holiday)return {working:false,country,kind:'HOLIDAY',name:holiday.name,configured};
 }
 if(weekday===0)return {working:false,country,kind:'SUNDAY',name:'일요일',configured};
 if(vietnam&&calendar){
  if(weekday===6){const off=calendar.saturdayOffDates.includes(day);return {working:!off,country,kind:off?'SATURDAY_OFF':'SATURDAY_WORK',name:off?'VIET QS 토요 휴무':'VIET QS 토요 근무',configured};}
  return {working:true,country,kind:'WORKDAY',name:'',configured};
 }
 const holiday=HOLIDAYS[day];
 if(holiday?.country===country)return {working:false,country,kind:'HOLIDAY',name:holiday.name,configured};
 if(weekday===6)return {working:false,country,kind:'SATURDAY_OFF',name:vietnam?'VIET QS 토요 근무일 미등록':'토요일',configured};
 return {working:true,country,kind:'WORKDAY',name:'',configured};
}
export const isWorkDay=(day:string,context:WorkCalendarContext={})=>workDayInfo(day,context).working;
export const workCalendarContext=(person:{company?:string}|null|undefined,calendars:CompanyWorkCalendar[]=[]):WorkCalendarContext=>({company:person?.company,calendars});
// Shared headers show each country's holiday while registered VN years replace the old VN list.
export function calendarHoliday(day:string,calendars:CompanyWorkCalendar[]=[]):{name:string;country:string}|undefined{
 const legacy=HOLIDAYS[day],countries:string[]=[],names:string[]=[];
 if(legacy?.country==='KR'||legacy?.country==='UK'){countries.push(legacy.country);names.push(legacy.name);}
 const configured=calendars.some(row=>row.company==='VIETQS'&&row.year===Number(day.slice(0,4))),vietnam=workDayInfo(day,{company:'VIETQS',calendars});
 if(configured?vietnam.kind==='HOLIDAY':legacy?.country==='VN'){countries.push('VN');names.push(configured?vietnam.name:legacy!.name);}
 return countries.length?{country:countries.join('·'),name:names.join(' · ')}:undefined;
}
export function workDateRanges(startDate:string,endDate:string,include:(day:string)=>boolean):{startDate:string;endDate:string}[]{
 if(!valid(startDate)||!valid(endDate)||startDate>endDate)return [];
 const ranges:{startDate:string;endDate:string}[]=[];
 let previous='';
 for(let day=startDate;day<=endDate;){
  if(include(day)){const last=ranges.at(-1);if(last&&last.endDate===previous)last.endDate=day;else ranges.push({startDate:day,endDate:day});}
  previous=day;const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);day=date.toISOString().slice(0,10);
 }
 return ranges;
}

// 2026 회사 확정표: 토요 휴무 열과 VIETQS 공휴일 열. 구정 연도는 사용자가 2026으로 정정했다.
export const VIET_2026_SATURDAY_OFF=[
 '01-03','01-17','01-31','02-07','02-21','03-07','03-21','04-04','04-18','05-02','05-16','06-06','06-20','07-04','07-18','08-01','08-15','08-29','09-05','09-19','10-03','10-17','11-07','11-21','12-05','12-19',
].map(day=>'2026-'+day);
export function vietCalendarPreset(year:number):CompanyWorkCalendar{
 const saturdayOffDates:string[]=[];
 if(year===2026)saturdayOffDates.push(...VIET_2026_SATURDAY_OFF);
 else for(let month=0;month<12;month++)for(let day=1;day<=31;day++){const date=new Date(Date.UTC(year,month,day,12));if(date.getUTCMonth()===month&&date.getUTCDay()===6)saturdayOffDates.push(date.toISOString().slice(0,10));}
 return {company:'VIETQS',year,revision:0,saturdayOffDates,exceptions:year===2026?[
  {id:'vn2026-new-year',kind:'HOLIDAY',startDate:'2026-01-01',endDate:'2026-01-01',name:'신정'},
  {id:'vn2026-tet',kind:'HOLIDAY',startDate:'2026-02-13',endDate:'2026-02-23',name:'구정 연휴'},
  {id:'vn2026-hung',kind:'HOLIDAY',startDate:'2026-04-26',endDate:'2026-04-27',name:'흥왕 탄신일·회사 휴무'},
  {id:'vn2026-reunion',kind:'HOLIDAY',startDate:'2026-04-30',endDate:'2026-04-30',name:'통일기념일'},
  {id:'vn2026-labour',kind:'HOLIDAY',startDate:'2026-05-01',endDate:'2026-05-01',name:'노동절'},
  {id:'vn2026-national',kind:'HOLIDAY',startDate:'2026-09-01',endDate:'2026-09-02',name:'독립기념일 연휴'},
 ]:[]};
}
