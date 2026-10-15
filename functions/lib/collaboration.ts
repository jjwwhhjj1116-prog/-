import {projectProgress,allocationScheduleOnly} from '../../scheduler-web/src/utils/scheduleProgress.ts';
import {withAllocationBounds} from '../../scheduler-web/src/utils/scheduleAllocations.ts';
import {VIET_ASSIGNMENT_GROUPS} from '../../scheduler-web/src/utils/vietPersonnel.ts';
import {validDay} from '../../scheduler-web/src/utils/personalWork.ts';
import {isScheduleAdmin} from '../../scheduler-web/src/utils/schedulePermissions.ts';
import {personalRoute} from './personal.ts';
import {syncAutomaticWorklogs} from './automaticWorklogs.ts';
import {weeklyReportRoute} from './weeklyReports.ts';
import {weeklyApprovalRoute} from './weeklyApprovals.ts';
import {scheduleExtensionRoute} from './scheduleExtensions.ts';
import {ensureIntakeSchedules,pendingIntakeSchedules} from './intakeSchedule.ts';
import {projectInquiryRoute} from './projectInquiries.ts';
import {applyProjectDates} from '../../scheduler-web/src/utils/projectScheduleDates.ts';
import {postDeliverySchedulesRoute,protectReportedPostDeliveryTasks} from './postDeliverySchedules.ts';
// A small, versioned collaboration API. D1 is the shared source; cookies identify the actor.
export type StudioUser = { id:string; name:string; department:string; position:string; profile:string; login?:string; salt?:string; password_hash?:string };
type Environment = { DB: D1Database; CIVIL_APPROVER_ID?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
type Archive = (meeting: Record<string, any>, revision:number) => Promise<string>;
const archiveReceiptsSql='(SELECT json_group_array(json_array(id,meeting_id,revision,recipient_id,stage,read_at,decision,decided_at)) FROM (SELECT * FROM studio_reviews WHERE meeting_id=? AND revision=? ORDER BY id))';
const archiveReceiptsSnapshot=(receipts:Record<string,unknown>[])=>JSON.stringify(receipts.map(row=>[row.id,row.meeting_id,row.revision,row.recipient_id,row.stage,row.read_at,row.decision,row.decided_at]));
const json = (body:unknown,status=200,headers:Record<string,string>={}) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const hex = (bytes:ArrayBuffer) => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export const tokenHash = async (token:string) => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
export async function passwordHash(password:string,salt:string) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
export async function sessionUser(request:Request,env:Environment):Promise<StudioUser|null> {
 const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1];
 if(!token)return null;
 return env.DB.prepare('SELECT u.* FROM studio_sessions s JOIN studio_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(await tokenHash(token),Date.now()).first<StudioUser>();
}
export function canEditTeam(user:StudioUser,department:string) {
 return user.department===department && (['실장','팀장'].includes(user.position) || (department==='마감팀' && user.id==='u_13'));
}
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const validInitialPassword=(password:unknown,company:unknown)=>typeof password==='string'&&((password.length>=8&&password.length<=256)||(company==='VIETQS'&&/^[0-9]{4}$/.test(password)));
export function mergeProject(current:Record<string,any>,base:Record<string,any>,next:Record<string,any>) {
 const result={...current};
 for(const key of new Set([...Object.keys(base),...Object.keys(next)])) {
  if(['id','department','roles','pmId','progress','scheduleExtensions'].includes(key))continue;
  if(key==='subTasks') {
   const tasks={...current.subTasks};
   for(const role of new Set([...Object.keys(base.subTasks||{}),...Object.keys(next.subTasks||{})])) {
    if(eq(base.subTasks?.[role],next.subTasks?.[role]))continue;
    const old=base.subTasks?.[role],local=next.subTasks?.[role],remote=tasks[role];
    if(local&&remote&&(old?.allocations!==undefined||local.allocations!==undefined||remote.allocations!==undefined)){
     const merged={...remote};
    for(const field of ['roleName','personId','personIds','startDate','endDate','status','memo','version','subType','reportingMode','reportingModes','legacyAllocationId','scopeExcluded','dateMode']){
      if(local.allocations!==undefined&&(['startDate','endDate','personIds'].includes(field)||role!=='PM'&&field==='personId'))continue;
      if(eq(old?.[field],local[field]))continue;
      if(!eq(remote[field],old?.[field])&&!eq(remote[field],local[field]))throw new Error(`동시 변경 충돌: ${role} ${field}`);
      merged[field]=local[field];
     }
     if(!eq(old?.allocations,local.allocations)){
      if(local.allocations===undefined){if(!eq(remote.allocations,old?.allocations)&&!eq(remote.allocations,local.allocations))throw new Error(`동시 변경 충돌: ${role} 할당 구간`);delete merged.allocations;}
      else{
       const allocations=new Map((remote.allocations||[]).map((a:any)=>[a.id,a]));
       const previous=new Map((old?.allocations||[]).map((a:any)=>[a.id,a]));
       const edited=new Map(local.allocations.map((a:any)=>[a.id,a]));
       for(const id of new Set([...previous.keys(),...edited.keys()])){
        if(eq(previous.get(id),edited.get(id)))continue;
        if(!eq(allocations.get(id),previous.get(id))&&!eq(allocations.get(id),edited.get(id)))throw new Error(`동시 변경 충돌: ${role} 할당 구간 ${id}`);
        if(edited.has(id))allocations.set(id,edited.get(id));else allocations.delete(id);
       }
       merged.allocations=[...allocations.values()];
      }
     }
     if(merged.allocations!==undefined){
      merged.personIds=[...new Set([...(role==='PM'&&merged.personId?[merged.personId]:[]),...merged.allocations.flatMap((a:any)=>a.personIds)])];
      if(role!=='PM')merged.personId=merged.personIds[0]||'';
     }
     tasks[role]=withAllocationBounds(merged);continue;
    }
    if(!eq(tasks[role],base.subTasks?.[role])&&!eq(tasks[role],next.subTasks?.[role]))throw new Error(`동시 변경 충돌: ${role}`);
    if(next.subTasks?.[role])tasks[role]=next.subTasks[role];else delete tasks[role];
   }
   result.subTasks=tasks;
  } else if(key==='postDeliveryTasks'&&!eq(base[key],next[key])) {
   const currentTasks=new Map((current.postDeliveryTasks||[]).map((task:any)=>[task.id,task]));
   const before=new Map((base.postDeliveryTasks||[]).map((task:any)=>[task.id,task]));
   const after=new Map((next.postDeliveryTasks||[]).map((task:any)=>[task.id,task]));
   for(const id of new Set([...before.keys(),...after.keys()])) {
    if(eq(before.get(id),after.get(id)))continue;
    if(!eq(currentTasks.get(id),before.get(id))&&!eq(currentTasks.get(id),after.get(id)))throw new Error(`동시 변경 충돌: 검토·수정 ${id}`);
    if(after.has(id))currentTasks.set(id,after.get(id));else currentTasks.delete(id);
   }
   result.postDeliveryTasks=[...currentTasks.values()];
  } else if(!eq(base[key],next[key])) {
   if(!eq(current[key],base[key])&&!eq(current[key],next[key]))throw new Error(`동시 변경 충돌: ${key}`);
   result[key]=next[key];
  }
 }
 result.subTasks=applyProjectDates(result as any);
 const legacyRoles=Object.fromEntries(Object.entries(current.roles||{}).filter(([role])=>!current.subTasks?.[role]));
 result.roles={...legacyRoles,...Object.fromEntries(Object.entries(result.subTasks||{}).map(([role,t]:[string,any])=>[role,{personId:(t.personIds??[t.personId])[0]||'',startDate:t.startDate,endDate:t.endDate}]))};
 result.pmId=result.subTasks?.PM ? result.roles.PM?.personId||'' : current.subTasks?.PM ? '' : current.pmId;
 const mainChanged=!eq(result.subTasks,current.subTasks)||result.startDate!==current.startDate||result.endDate!==current.endDate;
 result.progress=mainChanged&&!(result.startDate===current.startDate&&result.endDate===current.endDate&&allocationScheduleOnly({...current.roles,...current.subTasks},{...result.roles,...result.subTasks}))?projectProgress(result as any).actual??current.progress:current.progress;
 return result;
}
function validProject(p:any,current?:any) {
 if(!p||typeof p.id!=='string'||typeof p.code!=='string'||typeof p.name!=='string'||!['마감팀','구조팀','토목&조경팀'].includes(p.department)||!p.subTasks||typeof p.subTasks!=='object'||Array.isArray(p.subTasks)||Object.values(p.subTasks).some(t=>!t||typeof t!=='object'||Array.isArray(t)))throw new Error('프로젝트 필수값이 잘못되었습니다.');
 const tasks=p.postDeliveryTasks||[];
 for(const [role,t] of Object.entries(p.subTasks) as [string,any][]){
  if(t.dateMode!==undefined&&!['PROJECT','CUSTOM'].includes(t.dateMode))throw new Error('공종의 프로젝트 공통 기간 설정을 확인하세요.');
  if(t.scopeExcluded!==undefined&&typeof t.scopeExcluded!=='boolean')throw new Error('용역 범위 없음 설정을 확인하세요.');
  if(t.scopeExcluded&&(role==='PM'||t.personId||(t.personIds||[]).length||!Array.isArray(t.allocations)||t.allocations.length))throw new Error('용역 범위 없음 공종에는 담당자·배정 구간을 지정할 수 없습니다. PM은 프로젝트 책임자로 배정하세요.');
  const originalAnchor=current?.subTasks?.[role]?.legacyAllocationId;
  if(originalAnchor!==undefined&&t?.legacyAllocationId!==originalAnchor)throw new Error('기존 업무일지·완료 체크의 배정 연결은 변경할 수 없습니다. 원 구간을 제외해도 기존 연결 정보는 유지하세요.');
  if(t?.legacyAllocationId!==undefined&&(typeof t.legacyAllocationId!=='string'||!t.legacyAllocationId.trim()||!Array.isArray(t.allocations)))throw new Error('기존 배정 연결 정보와 할당 구간을 확인하세요.');
  if(t?.allocations===undefined)continue;
  const allocations=t.allocations;
  const sourceKeys=['workbookHash','sheet','ownerRange','roleRange','projectRange','projectText','roleText'];
  if(!Array.isArray(allocations)||new Set(allocations.map((a:any)=>a?.id)).size!==allocations.length||allocations.some((a:any)=>!a||typeof a.id!=='string'||!a.id.trim()||!Array.isArray(a.personIds)||!a.personIds.length||a.personIds.some((id:any)=>typeof id!=='string'||!id.trim())||!validDay(a.startDate)||!validDay(a.endDate)||a.startDate>a.endDate||(a.memo!==undefined&&typeof a.memo!=='string')||(a.dateMode!==undefined&&!['PROJECT','CUSTOM'].includes(a.dateMode))||Object.keys(a).some(key=>!['id','personIds','startDate','endDate','memo','source','dateMode'].includes(key))||(a.source!==undefined&&(!a.source||typeof a.source!=='object'||Array.isArray(a.source)||sourceKeys.some(key=>typeof a.source[key]!=='string')||Object.keys(a.source).some(key=>!sourceKeys.includes(key))))))throw new Error('할당 구간의 ID·담당자·날짜·원본 좌표를 확인하세요.');
  Object.assign(t,withAllocationBounds(t));
 }
 for(const t of [...Object.values(p.subTasks||{}),...tasks] as any[])if((t.reportingMode!==undefined&&!['DAILY','TASK'].includes(t.reportingMode))||(t.reportingModes!==undefined&&(!t.reportingModes||typeof t.reportingModes!=='object'||Array.isArray(t.reportingModes)||Object.values(t.reportingModes).some(mode=>!['DAILY','TASK'].includes(String(mode))))))throw new Error('업무 보고 방식을 확인하세요.');
 if(!Array.isArray(tasks)||tasks.length>100||new Set(tasks.map((t:any)=>t.id)).size!==tasks.length||tasks.some((t:any)=>!t||typeof t.id!=='string'||!t.id||!['검토','수정'].includes(t.kind)||!validDay(t.startDate)||!validDay(t.endDate)||t.endDate<t.startDate||!validDay(p.endDate)||t.startDate<p.endDate||typeof t.memo!=='string'||!t.memo.trim()||t.memo.length>500||!Array.isArray(t.personIds)||!t.personIds.length||t.personIds.some((id:any)=>typeof id!=='string'||!id)||!['예정','진행중','완료'].includes(t.status)))throw new Error('검토·수정 일정의 날짜·메모·담당자를 확인하세요.');
 p.subTasks=applyProjectDates(p);
}
function validLegacyDates(p:any,current?:any) {
 const invalid=(start:string,end:string)=>[start,end].some(day=>day!==undefined&&day!==null&&day!=='')&&(!validDay(start)||!validDay(end)||start>end);
 const error='프로젝트·공종의 시작일과 종료일을 확인하세요. 기존 미확정 기간은 날짜를 바꾸지 않고 보존할 수 있습니다.';
 if(invalid(p.startDate,p.endDate)&&!(current&&p.startDate===current.startDate&&p.endDate===current.endDate))throw new Error(error);
 const previous={...current?.roles,...current?.subTasks};
 for(const [role,t] of Object.entries({...p.roles,...p.subTasks}) as [string,any][]){
  if(!t||t.allocations!==undefined)continue;
  const start=t.startDate||p.startDate,end=t.endDate||p.endDate,old=previous[role];
  if(invalid(start,end)&&!(old&&old.allocations===undefined&&start===(old.startDate||current.startDate)&&end===(old.endDate||current.endDate)))throw new Error(error);
 }
}
const fail=(message:string,status=400)=>json({error:message},status);
export async function handleCollaboration(request:Request,env:Environment,archive:Archive):Promise<Response> {
 const url=new URL(request.url),route=url.pathname.replace('/api/collaboration/',''),method=request.method;
 if(method!=='GET' && request.headers.get('Origin') && request.headers.get('Origin')!==url.origin)return fail('다른 출처 요청은 허용하지 않습니다.',403);
 try {
  if(route==='login'&&method==='POST') {
   const {login,password}=await request.json() as any;
   if(typeof login!=='string'||typeof password!=='string'||password.length>256)return fail('로그인 입력을 확인하세요.');
   const key=await tokenHash(`${request.headers.get('CF-Connecting-IP')||'local'}:${login.toLowerCase()}`);
   const rate=await env.DB.prepare('SELECT * FROM studio_login_attempts WHERE id=?').bind(key).first<any>();
   if(rate&&rate.until_at>Date.now()&&rate.attempts>=10)return fail('로그인 시도가 많습니다. 15분 후 다시 시도하세요.',429);
   const user=await env.DB.prepare('SELECT * FROM studio_users WHERE active=1 AND (lower(login)=? OR lower(email)=?)').bind(login.trim().toLowerCase(),login.trim().toLowerCase()).first<StudioUser>();
   if(!user||await passwordHash(password,user.salt!)!==user.password_hash) {
    await env.DB.prepare('INSERT INTO studio_login_attempts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,until_at=excluded.until_at').bind(key,rate&&rate.until_at>Date.now()?rate.attempts+1:1,rate&&rate.until_at>Date.now()?rate.until_at:Date.now()+900000).run();
    return fail('ID 또는 비밀번호가 일치하지 않습니다.',401);
   }
   const token=crypto.randomUUID()+crypto.randomUUID();
   await env.DB.batch([env.DB.prepare('DELETE FROM studio_login_attempts WHERE id=?').bind(key),env.DB.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').bind(await tokenHash(token),user.id,Date.now()+43200000)]);
   return json({user:JSON.parse(user.profile)},200,{'Set-Cookie':`studio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol==='https:'?'; Secure':''}`});
  }
  const user=await sessionUser(request,env);
  if(!user)return fail('서버 로그인이 필요합니다.',401);
  if(route==='automatic-worklogs/sync'){
   if(method!=='POST')return fail('지원하지 않는 요청입니다.',405);
   if(request.body||url.search)return fail('자동 보고는 서버의 현재 날짜와 배정만 사용합니다. 입력값은 지정할 수 없습니다.');
   const profile=JSON.parse(user.profile);
   if(profile.id!==user.id)return fail('계정 연결을 확인하세요.',403);
   const actor={...profile,id:user.id,email:(user as any).email,department:user.department,position:user.position,active:true};
   const administrator=isScheduleAdmin(actor);
   if(!administrator&&!['마감팀','구조팀','토목&조경팀'].includes(user.department))return fail('현재 소속에는 자동 업무보고가 설정되지 않았습니다.',403);
   const DB={prepare:(sql:string)=>env.DB.prepare(sql),batch:(statements:D1PreparedStatement[])=>env.DB.batch([
    env.DB.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND profile=? AND email=? AND department=? AND position=?)').bind(user.id,user.profile,(user as any).email,user.department,user.position),...statements
   ])};
   const result=await syncAutomaticWorklogs({...env,DB},administrator?{}:{onlyUserId:user.id});
   return result.conflicts?json({error:'동시 변경으로 일부 자동 보고를 보류했습니다. 다음 갱신에서 다시 확인합니다.',result},409):json(result);
  }
  const supplements=await postDeliverySchedulesRoute(request,env,user,route);if(supplements)return supplements;
  const inquiry=await projectInquiryRoute(request,env,user,route);if(inquiry)return inquiry;
  const personal=await personalRoute(request,env,user,route);if(personal)return personal;
  const weeklyApproval=await weeklyApprovalRoute(request,env,user,route);if(weeklyApproval)return weeklyApproval;
  const weekly=await weeklyReportRoute(request,env,user,route);if(weekly)return weekly;
  const extension=await scheduleExtensionRoute(request,env,user,route,canEditTeam);if(extension)return extension;
  if(route==='session'&&method==='GET')return json({user:JSON.parse(user.profile)});
  if(route==='logout'&&method==='POST') {
   const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1]||'';
   await env.DB.prepare('DELETE FROM studio_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
   return json({ok:true},200,{'Set-Cookie':'studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  if(route==='password'&&method==='POST'){
   const {oldPassword,newPassword}=await request.json() as any;
   if(typeof oldPassword!=='string'||typeof newPassword!=='string'||newPassword.length<8||newPassword.length>256)return fail('새 비밀번호는 8~256자로 입력하세요.');
   if(await passwordHash(oldPassword,user.salt!)!==user.password_hash)return fail('현재 비밀번호가 일치하지 않습니다.',403);
   const salt=crypto.randomUUID();const hash=await passwordHash(newPassword,salt);
   const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1]||'';
   await env.DB.batch([env.DB.prepare('UPDATE studio_users SET salt=?,password_hash=? WHERE id=?').bind(salt,hash,user.id),env.DB.prepare('DELETE FROM studio_sessions WHERE user_id=? AND token_hash<>?').bind(user.id,await tokenHash(token))]);
   return json({ok:true});
  }
  if(route==='changes'&&method==='GET'){
   const result=await env.DB.prepare('SELECT key,revision FROM studio_sync_versions').all<{key:string;revision:number}>();
   return json({versions:Object.fromEntries(result.results.map(r=>[r.key,r.revision]))});
  }
  if(route==='directory'&&method==='GET'){
   const rows=await env.DB.prepare('SELECT profile,active FROM studio_users').all<any>();
   return json({users:rows.results.map(row=>({...JSON.parse(row.profile),active:row.active===1}))});
  }
  if(route==='admin/users'&&method==='POST'){
   const profile=JSON.parse(user.profile);
   if(!['yjw@con-cost.com','yjpark@con-cost.com'].includes(String(profile.email).toLowerCase()))return fail('관리자 권한이 필요합니다.',403);
   const {action,id,record,password,resetMode,extension}=await request.json() as any;
   const target=id?await env.DB.prepare('SELECT * FROM studio_users WHERE id=?').bind(id).first<any>():null;
   if(action!=='create'&&!target)return fail('계정을 찾을 수 없습니다.',404);
   if(action==='deactivate'){
    if(id===user.id)return fail('현재 로그인한 관리자 계정은 비활성화할 수 없습니다.',409);
    await env.DB.batch([env.DB.prepare('UPDATE studio_users SET active=0 WHERE id=?').bind(id),env.DB.prepare('DELETE FROM studio_sessions WHERE user_id=?').bind(id)]);return json({ok:true});
   }
   if(action==='reset'){
    if(resetMode!==undefined&&!['extension','temporary'].includes(resetMode))return fail('비밀번호 리셋 방식을 확인하세요.');
    const byExtension=resetMode==='extension';
    if(byExtension){if(typeof password!=='string'||!(/^[0-9]{4}$/.test(password))||(extension!==undefined&&extension!==password))return fail('확인한 내선번호 4자리를 입력하세요.');}
    else if(!validInitialPassword(password,JSON.parse(target.profile).company))return fail(JSON.parse(target.profile).company==='VIETQS'?'임시 비밀번호는 숫자 4자리 또는 8~256자로 입력하세요.':'새 비밀번호는 8~256자로 입력하세요.');
    const salt=crypto.randomUUID(),hash=await passwordHash(password,salt);
    const update=byExtension?env.DB.prepare("UPDATE studio_users SET profile=json_set(profile,'$.extension',?),salt=?,password_hash=? WHERE id=?").bind(password,salt,hash,target.id):env.DB.prepare('UPDATE studio_users SET salt=?,password_hash=? WHERE id=?').bind(salt,hash,target.id);
    await env.DB.batch([update,env.DB.prepare('DELETE FROM studio_sessions WHERE user_id=?').bind(target.id)]);
    const sessionRevoked=target.id===user.id;
    return json({ok:true,sessionRevoked},200,sessionRevoked?{'Set-Cookie':'studio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}:{});
   }
   if(!['create','update'].includes(action)||!record)return fail('잘못된 계정 관리 요청입니다.');
   const previous=target?JSON.parse(target.profile):{};
   const next={...previous,...record,id:target?.id||crypto.randomUUID()};delete next.password;delete next.active;
   if(![next.idPrefix,next.name,next.email,next.department,next.position].every(v=>typeof v==='string'&&v.trim()))return fail('이름·로그인 ID·이메일·부서·직급을 입력하세요.');
   if(next.employeeNo!==undefined&&(typeof next.employeeNo!=='string'||!next.employeeNo.trim()))return fail('사번을 확인하세요.');
   if(next.vietTeamId===''||next.vietTeamId===null)delete next.vietTeamId;
   if(next.vietTeamId!==undefined&&(next.company!=='VIETQS'||!VIET_ASSIGNMENT_GROUPS.some(group=>group.id===next.vietTeamId&&group.department===next.department)))return fail('해당 부서의 베트남 팀을 선택하세요.');
   next.role=['yjw@con-cost.com','yjpark@con-cost.com'].includes(next.email.toLowerCase())?'ADMIN':'MEMBER';
   const duplicate=await env.DB.prepare('SELECT id FROM studio_users WHERE (lower(login)=? OR lower(email)=?) AND id<>?').bind(next.idPrefix.toLowerCase(),next.email.toLowerCase(),next.id).first();
   if(duplicate)return fail('이미 등록된 로그인 ID 또는 이메일입니다.',409);
   if(action==='create'){
    if(!validInitialPassword(password,next.company))return fail(next.company==='VIETQS'?'초기 비밀번호는 숫자 4자리 또는 8~256자로 입력하세요.':'초기 비밀번호는 8~256자로 입력하세요.');
    const salt=crypto.randomUUID();await env.DB.prepare('INSERT INTO studio_users (id,login,email,name,department,position,profile,salt,password_hash) VALUES (?,?,?,?,?,?,?,?,?)').bind(next.id,next.idPrefix,next.email,next.name,next.department,next.position,JSON.stringify(next),salt,await passwordHash(password,salt)).run();
   }else{
    await env.DB.batch([env.DB.prepare('UPDATE studio_users SET login=?,email=?,name=?,department=?,position=?,profile=? WHERE id=?').bind(next.idPrefix,next.email,next.name,next.department,next.position,JSON.stringify(next),id),env.DB.prepare('DELETE FROM studio_sessions WHERE user_id=?').bind(id)]);
   }
   return json({ok:true});
  }
  if(route==='projects'&&method==='GET') {
   const {items}=await ensureIntakeSchedules(env.DB);
   const rows=await env.DB.prepare('SELECT * FROM studio_projects').all<any>();
   const archived=await env.DB.prepare('SELECT * FROM studio_project_archive').all<any>();
   const activeProjects=rows.results.filter(r=>!archived.results.some(a=>a.project_id===r.id)).map(r=>({project:JSON.parse(r.body),revision:r.revision}));
   const archivedProjects=rows.results.filter(r=>archived.results.some(a=>a.project_id===r.id)).map(r=>({project:JSON.parse(r.body),revision:r.revision}));
   return json({projects:activeProjects,archived:archivedProjects,pendingIntake:pendingIntakeSchedules(items,activeProjects.map(r=>r.project),archivedProjects.map(r=>r.project))});
  }
  const lifecycle=route.match(/^projects\/([^/]+)\/(archive|restore)$/);
  if(lifecycle&&method==='POST'){
   const id=decodeURIComponent(lifecycle[1]),input:any=await request.json();
   const row=await env.DB.prepare('SELECT * FROM studio_projects WHERE id=?').bind(id).first<any>();
   if(!row)return fail('중앙 저장된 프로젝트를 찾을 수 없습니다.',404);
   const project=JSON.parse(row.body);if(!canEditTeam(user,project.department))return fail('해당 팀 실장·팀장만 정리·복원할 수 있습니다.',403);
   if(!eq(input.base,project))return fail('일정이 변경되었습니다. 최신 내용을 확인한 후 다시 실행하세요.',409);
   const tomb=await env.DB.prepare('SELECT * FROM studio_project_archive WHERE project_id=?').bind(id).first();
   if((lifecycle[2]==='archive')===Boolean(tomb))return fail('이미 처리된 요청입니다. 목록을 갱신하세요.',409);
   const action=lifecycle[2]==='archive'?env.DB.prepare('INSERT INTO studio_project_archive VALUES (?,?,?)').bind(id,new Date().toISOString(),user.id):env.DB.prepare('DELETE FROM studio_project_archive WHERE project_id=?').bind(id);
   try{await env.DB.batch([env.DB.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=?)').bind(id,row.revision),action,env.DB.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=? AND revision=?').bind(id,row.revision)]);}catch{return fail('동시 변경으로 정리·복원을 취소했습니다.',409);}
   return json({ok:true});
  }
  if(route==='projects'&&method==='POST') {
   const {project,base}=await request.json() as any;try{validProject(project);}catch(e){return fail((e as Error).message,400);}
   const profile=JSON.parse(user.profile);
   if(!canEditTeam(user,project.department)&&!(profile.id===user.id&&isScheduleAdmin(profile)))return fail('관리자 또는 해당 팀 실장·팀장만 일정을 변경할 수 있습니다.',403);
   for(let attempt=0;attempt<3;attempt++) {
    if(await env.DB.prepare('SELECT project_id FROM studio_project_archive WHERE project_id=?').bind(project.id).first())return fail('정리된 프로젝트입니다. 복원 후 편집하세요. 대기 변경은 보존됩니다.',409);
    const row=await env.DB.prepare('SELECT * FROM studio_projects WHERE id=?').bind(project.id).first<any>();
    if(!row){
     try{protectReportedPostDeliveryTasks(null,null,project);}catch(e){return fail((e as Error).message,403);}
     try{validLegacyDates(project);}catch(e){return fail((e as Error).message,400);}
     const code=project.code.trim().toUpperCase();
     const linked=await env.DB.prepare("SELECT id FROM studio_intake_documents WHERE json_valid(data) AND upper(trim(json_extract(data,'$.code')))=? LIMIT 1").bind(code).first();
     if(linked){
      const duplicate=await env.DB.prepare("SELECT * FROM studio_projects WHERE json_valid(body) AND upper(trim(json_extract(body,'$.code')))=? AND json_extract(body,'$.department')=? LIMIT 1").bind(code,project.department).first<any>();
      if(duplicate)return json({error:'수주 프로젝트의 해당 팀 일정이 이미 중앙 등록되어 있습니다. 최신 목록의 기존 프로젝트를 열어 배정하세요.',current:JSON.parse(duplicate.body),revision:duplicate.revision},409);
     }
     delete project.scheduleExtensions;
     const saved=await env.DB.prepare("INSERT OR IGNORE INTO studio_projects SELECT ?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM studio_intake_documents WHERE json_valid(data) AND upper(trim(json_extract(data,'$.code')))=?) OR NOT EXISTS(SELECT 1 FROM studio_projects WHERE json_valid(body) AND upper(trim(json_extract(body,'$.code')))=? AND json_extract(body,'$.department')=?)").bind(project.id,JSON.stringify(project),new Date().toISOString(),user.id,code,code,project.department).run();
     if(saved.meta.changes)return json({project,revision:1});continue;
    }
    const current=JSON.parse(row.body);
    if(current.department!==project.department)return fail('프로젝트 부서를 변경할 수 없습니다.',403);
    try{protectReportedPostDeliveryTasks(current,base||{},project);}catch(e){return fail((e as Error).message,403);}
    let merged;try{merged=mergeProject(current,base||{},project);validProject(merged,current);}catch(e){return json({error:(e as Error).message,current,revision:row.revision},409);}
    try{validLegacyDates(merged,current);}catch(e){return fail((e as Error).message,400);}
    const saved=await env.DB.prepare('UPDATE studio_projects SET body=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(JSON.stringify(merged),new Date().toISOString(),user.id,project.id,row.revision).run();
    if(saved.meta.changes)return json({project:merged,revision:row.revision+1});
   }
   return fail('동시 변경이 많습니다. 다시 시도하세요.',409);
  }
  if(route==='notifications'&&method==='GET') {
   const rows=await env.DB.prepare('SELECT * FROM studio_notifications WHERE user_id=? ORDER BY (read_at IS NULL) DESC,created_at DESC LIMIT 100').bind(user.id).all();
   const unread=await env.DB.prepare('SELECT COUNT(*) AS n FROM studio_notifications WHERE user_id=? AND read_at IS NULL').bind(user.id).first<{n:number}>();
   return json({notifications:rows.results,unreadCount:unread?.n||0});
  }
  if(route==='meetings'&&method==='GET') {
   const rows=await env.DB.prepare('SELECT * FROM studio_meetings WHERE removed=0 ORDER BY updated_at DESC').all<any>();
   const reviews=await env.DB.prepare('SELECT * FROM studio_reviews').all<any>();
   return json({meetings:rows.results.map(r=>({...JSON.parse(r.body),serverRevision:r.revision,authorId:r.author_id,archiveRevision:r.archive_revision,archiveUrl:r.archive_url,archiveError:r.archive_error,reviews:reviews.results.filter(v=>v.meeting_id===r.id&&v.revision===r.revision)}))});
  }
  const match=route.match(/^meetings\/([^/]+)(?:\/(submit|read|approve|reject|archive))?$/);
  if(match) {
   const id=decodeURIComponent(match[1]),action=match[2];
   const row=await env.DB.prepare('SELECT * FROM studio_meetings WHERE id=?').bind(id).first<any>();
   const now=new Date().toISOString();
   if(row&&method==='POST'||row&&method==='DELETE'){
    const input=await request.json() as any;
    if(input.revision!==row.revision)return fail('회의록 버전이 변경되었습니다. 다시 열어 확인하세요.',409);
   }

   if(!action&&method==='PUT') {
    const {meeting,revision}=await request.json() as any;
    if(meeting?.id!==id||!meeting.title?.trim()||!meeting.projectCode||!Array.isArray(meeting.attendeesInternal)||!Array.isArray(meeting.attendeesExternal))return fail('회의명과 프로젝트 등 필수값을 확인하세요.');
    if(row&&(row.author_id!==user.id||row.removed))return fail('작성자만 수정할 수 있습니다.',403);
    if(row&&row.revision!==revision)return fail('다른 창에서 수정한 회의록입니다. 새로 확인하세요.',409);
    if(row){const pending=await env.DB.prepare('SELECT id FROM studio_reviews WHERE meeting_id=? AND revision=? AND decision IS NULL').bind(id,row.revision).first();if(pending)return fail('결재 진행 중인 저장본은 수정할 수 없습니다. 결재 처리 후 수정하세요.',409);}
    const body={...meeting,author:user.name,authorId:user.id,department:user.department,status:'DRAFT',authorSigned:false,pmApproved:false,directorApproved:false};
    for(const key of ['reviews','serverRevision','archiveRevision','archiveUrl','archiveError'])delete body[key];
    const nextRevision=(row?.revision||0)+1;
    const saved=row?await env.DB.prepare('UPDATE studio_meetings SET body=?,revision=?,updated_at=?,archive_error=NULL WHERE id=? AND revision=? AND removed=0 AND NOT EXISTS(SELECT 1 FROM studio_reviews WHERE meeting_id=? AND revision=? AND decision IS NULL)').bind(JSON.stringify(body),nextRevision,now,id,revision,id,revision).run():await env.DB.prepare('INSERT OR IGNORE INTO studio_meetings (id,author_id,department,body,revision,updated_at) VALUES (?,?,?,?,1,?)').bind(id,user.id,user.department,JSON.stringify(body),now).run();
    if(!saved.meta.changes)return fail('동시 수정 충돌입니다.',409);
    // Archive failure does not erase the saved meeting. Retry only the same revision.
    let archiveUrl:string|null=null,archiveError:string|null=null;
    try{archiveUrl=await archive(body,nextRevision);const updated=await env.DB.prepare(`UPDATE studio_meetings SET archive_revision=?,archive_url=?,archive_error=NULL WHERE id=? AND revision=? AND removed=0 AND ${archiveReceiptsSql}=?`).bind(nextRevision,archiveUrl,id,nextRevision,id,nextRevision,'[]').run();if(!updated.meta.changes)return fail('회의록 상태가 변경되었습니다. 다시 확인하세요.',409);}
    catch{archiveError='Drive 보관 실패 · 목록 원본 유지 · 재시도 필요';const updated=await env.DB.prepare(`UPDATE studio_meetings SET archive_error=? WHERE id=? AND revision=? AND removed=0 AND ${archiveReceiptsSql}=?`).bind(archiveError,id,nextRevision,id,nextRevision,'[]').run();if(!updated.meta.changes)return fail('회의록 상태가 변경되었습니다. 다시 확인하세요.',409);}
    return json({meeting:{...body,serverRevision:nextRevision,archiveRevision:archiveUrl?nextRevision:row?.archive_revision||0,archiveUrl,archiveError,reviews:[]}});
   }
   if(!row||row.removed)return fail('회의록을 찾을 수 없습니다.',404);
   const meeting=JSON.parse(row.body);
   if(action==='archive'&&method==='POST') {
    if(row.author_id!==user.id)return fail('작성자만 보관을 재시도할 수 있습니다.',403);
    const receipts=await env.DB.prepare('SELECT * FROM studio_reviews WHERE meeting_id=? AND revision=? ORDER BY id').bind(id,row.revision).all();
    const link=await archive({...meeting,reviews:receipts.results},row.revision);
    const updated=await env.DB.prepare(`UPDATE studio_meetings SET archive_revision=?,archive_url=?,archive_error=NULL WHERE id=? AND revision=? AND removed=0 AND ${archiveReceiptsSql}=?`).bind(row.revision,link,id,row.revision,id,row.revision,archiveReceiptsSnapshot(receipts.results)).run();if(!updated.meta.changes)return fail('회의록 상태가 변경되었습니다. 다시 확인하세요.',409);return json({ok:true});
   }
   if(!action&&method==='DELETE') {
    if(row.author_id!==user.id)return fail('작성자만 목록에서 정리할 수 있습니다.',403);
    if(row.archive_revision!==row.revision||!row.archive_url)return fail('현재 버전의 Drive 보관을 먼저 완료해야 합니다.',409);
    const pending=await env.DB.prepare('SELECT id FROM studio_reviews WHERE meeting_id=? AND revision=? AND decision IS NULL').bind(id,row.revision).first();
    if(pending)return fail('결재 중인 회의록은 목록에서 정리할 수 없습니다.',409);
    const receipts=await env.DB.prepare('SELECT * FROM studio_reviews WHERE meeting_id=? AND revision=? ORDER BY id').bind(id,row.revision).all();
    const link=await archive({...meeting,reviews:receipts.results},row.revision);
    const deleted=await env.DB.prepare(`UPDATE studio_meetings SET body=NULL,removed=1,archive_url=?,archive_error=NULL WHERE id=? AND revision=? AND removed=0 AND archive_revision=revision AND ${archiveReceiptsSql}=? AND NOT EXISTS(SELECT 1 FROM studio_reviews WHERE meeting_id=? AND revision=? AND decision IS NULL)`).bind(link,id,row.revision,id,row.revision,archiveReceiptsSnapshot(receipts.results),id,row.revision).run();
    if(!deleted.meta.changes)return fail('회의록 상태가 변경되었습니다. 다시 확인하세요.',409);
    return json({ok:true,archiveUrl:link});
   }
   if(action==='submit'&&method==='POST') {
    if(row.author_id!==user.id)return fail('작성자만 상신할 수 있습니다.',403);
    const recipients=row.department==='토목&조경팀'
     ? await env.DB.prepare("SELECT * FROM studio_users WHERE active=1 AND id=? AND position='본부장'").bind(env.CIVIL_APPROVER_ID||'').all<StudioUser>()
     : await env.DB.prepare("SELECT * FROM studio_users WHERE active=1 AND ((department=? AND position='실장') OR position='본부장')").bind(row.department).all<StudioUser>();
    if(!recipients.results.some(r=>r.position==='본부장'))return fail('본부장 수신 계정을 먼저 등록해 주세요.',409);
    if(!recipients.results.some(r=>r.department===row.department)&&row.department!=='토목&조경팀')return fail('팀 실장 수신 계정이 없습니다.',409);
    if(row.department==='토목&조경팀'&&!env.CIVIL_APPROVER_ID)return fail('토목·조경 결재선 설정이 필요합니다.',409);
    const statements=[];
    for(const recipient of recipients.results) {
     const rid=`${id}:${row.revision}:${recipient.id}`;
     statements.push(env.DB.prepare('INSERT OR IGNORE INTO studio_reviews (id,meeting_id,revision,recipient_id,stage) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM studio_meetings WHERE id=? AND revision=? AND removed=0)').bind(rid,id,row.revision,recipient.id,recipient.position==='본부장'?'director':'chief',id,row.revision));
     statements.push(env.DB.prepare('INSERT OR IGNORE INTO studio_notifications (id,user_id,meeting_id,message,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM studio_reviews WHERE id=?)').bind(`submit:${rid}`,recipient.id,id,`${user.name}님이 회의록 결재를 상신했습니다: ${meeting.title}`,now,rid));
    }
    await env.DB.batch(statements);
    const current=await env.DB.prepare('SELECT revision,removed FROM studio_meetings WHERE id=?').bind(id).first<any>();
    if(current?.revision!==row.revision||current.removed)return fail('상신 중 회의록이 변경되었습니다. 다시 확인하세요.',409);
    return json({ok:true});
   }
   if(['read','approve','reject'].includes(action||'')&&method==='POST') {
    const review=await env.DB.prepare('SELECT * FROM studio_reviews WHERE meeting_id=? AND revision=? AND recipient_id=?').bind(id,row.revision,user.id).first<any>();
    if(!review)return fail('이 버전의 결재 수신자가 아닙니다.',403);
    const statements=[env.DB.prepare('UPDATE studio_reviews SET read_at=COALESCE(read_at,?) WHERE id=? AND EXISTS(SELECT 1 FROM studio_meetings WHERE id=? AND revision=? AND removed=0)').bind(now,review.id,id,row.revision),env.DB.prepare('UPDATE studio_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=? AND id=?').bind(now,user.id,`submit:${review.id}`)];
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`read:${review.id}`,row.author_id,id,`${user.name}님이 회의록을 열람했습니다: ${meeting.title}`,now));
    if(action!=='read') {
     if(review.decision)return fail('이미 처리한 결재입니다.',409);
     statements.push(env.DB.prepare('UPDATE studio_reviews SET decision=?,decided_at=? WHERE id=? AND decision IS NULL AND EXISTS(SELECT 1 FROM studio_meetings WHERE id=? AND revision=? AND removed=0)').bind(action,now,review.id,id,row.revision));
     statements.push(env.DB.prepare('INSERT OR IGNORE INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`decision:${review.id}`,row.author_id,id,`${user.name}님이 회의록을 ${action==='approve'?'승인':'반려'}했습니다: ${meeting.title}`,now));
    }
    const guard=env.DB.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_meetings WHERE id=? AND revision=? AND removed=0) OR NOT EXISTS(SELECT 1 FROM studio_reviews WHERE id=? AND (?=\'read\' OR decision IS NULL))').bind(id,row.revision,review.id,action);
    let result;
    try{result=(await env.DB.batch([guard,...statements])).slice(1);}catch{return fail('결재 상태가 변경되었습니다. 다시 확인하세요.',409);}
    if(!result[0].meta.changes||(action!=='read'&&!result[3].meta.changes))return fail('결재 상태가 변경되었습니다. 다시 확인하세요.',409);
    return json({ok:true});
   }
  }
  if(route==='notifications/read'&&method==='POST') {
   const {id}=await request.json() as any;
   await env.DB.prepare('UPDATE studio_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').bind(new Date().toISOString(),id,user.id).run();return json({ok:true});
  }
  return fail('지원하지 않는 요청입니다.',404);
 }catch(error){
  const quota=error instanceof Error&&/exceeded D1's free tier daily row (read|write) limit/i.test(error.message);
  console.error('Studio collaboration request failed',quota?'D1_DAILY_LIMIT':error instanceof Error?error.name:'Error');
  if(quota)return json({error:'중앙 DB의 오늘 무료 조회·저장 한도를 초과했습니다. 입력은 보존됩니다. 한국시간 오전 9시 한도 초기화 후 다시 연결하거나 관리자에게 문의하세요.',code:'D1_DAILY_LIMIT'},503,{'Retry-After':String(Math.ceil((86400000-Date.now()%86400000)/1000))});
  return fail('요청 처리 실패. 입력은 보존됩니다. 서버 설정 및 연결을 확인하세요.',503);
 }
}
