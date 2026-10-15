import {validDay} from '../../scheduler-web/src/utils/personalWork.ts';

const departments=['마감팀','구조팀','토목&조경팀'];
const parse=(value:string)=>{try{return JSON.parse(value);}catch{return {};}};
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
const code=(project:any)=>String(project.code||'').trim().toUpperCase()||String(project.id);
const delivered=(project:any)=>project.status==='납품'||project.progress>=100;
const managed=(task:any)=>['submissionStatus','createdBy','createdByName','submittedAt','reviewerIds','revision','department','cancelledAt'].some(key=>task&&Object.hasOwn(task,key));
const domestic=(row:any)=>row?.active===1&&parse(row.profile).id===row.id&&parse(row.profile).company==='컨코스트';
const canRegister=(row:any)=>domestic(row)&&departments.includes(row.department);
const reporterGuard=(db:any,row:any)=>db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_users WHERE id=? AND active=1 AND department=? AND position=? AND profile=?)').bind(row.id,row.department,row.position,row.profile);
const recipients=(directory:any[],department:string)=>directory.filter(row=>domestic(row)&&((row.department===department&&(['실장','팀장'].includes(row.position)||(department==='마감팀'&&row.id==='u_13')))||(department==='토목&조경팀'&&row.id==='u_8')));

// Self-registered schedules are server-owned. A general project edit may only carry them unchanged.
export function protectReportedPostDeliveryTasks(current:any,base:any,next:any){
 const before=new Map((base?.postDeliveryTasks||[]).map((task:any)=>[task.id,task]));
 const after=new Map((next?.postDeliveryTasks||[]).map((task:any)=>[task.id,task]));
 for(const task of [...(current?.postDeliveryTasks||[]),...(base?.postDeliveryTasks||[]),...(next?.postDeliveryTasks||[])]){
  if(managed(task)&&!same(before.get(task.id),after.get(task.id)))throw Error('본인이 등록한 보완 일정은 프로젝트 보완 일정표에서 수정·취소하세요. 보고 기록은 일반 프로젝트 편집으로 변경할 수 없습니다.');
 }
}

export async function postDeliverySchedulesRoute(request:Request,env:any,user:any,route:string):Promise<Response|null>{
 const match=route.match(/^projects\/([^/]+)\/supplements(?:\/([^/]+)(?:\/(cancel))?)?$/);
 if(route!=='post-delivery-schedules'&&!match)return null;
 const fail=(error:string,status=400)=>json({error},status),db=env.DB;
 const directory=(await db.prepare('SELECT id,name,department,position,profile,active FROM studio_users').all()).results;
 const actor=directory.find((row:any)=>row.id===user.id&&row.active===1);
 if(!actor)return fail('활성 계정으로 다시 로그인하세요.',403);
 const rows=(await db.prepare('SELECT id,body,revision FROM studio_projects WHERE id NOT IN (SELECT project_id FROM studio_project_archive) ORDER BY id').all()).results;
 const records=rows.map((row:any)=>({...row,project:parse(row.body)}));
 if(route==='post-delivery-schedules'){
  if(request.method!=='GET')return fail('지원하지 않는 요청입니다.',405);
  const groups=new Map<string,any[]>();
  for(const record of records){const key=code(record.project);groups.set(key,[...(groups.get(key)||[]),record]);}
  const projects=[...groups.values()].map(group=>{
   const selected=group.find(record=>record.project.department===actor.department)||group[0],project=selected.project;
   return {projectId:project.id,projectCode:project.code,projectName:project.name,department:project.department,deliveryDate:project.endDate,delivered:delivered(project),projectRevision:selected.revision,
    tasks:group.flatMap(record=>(record.project.postDeliveryTasks||[]).map((task:any)=>({...task,projectId:record.id,projectRevision:record.revision,deliveryDate:record.project.endDate,canEdit:canRegister(actor)&&task.createdBy===actor.id&&task.submissionStatus==='REPORTED',canCancel:canRegister(actor)&&task.createdBy===actor.id&&task.submissionStatus==='REPORTED'})))};
  });
  return json({projects,capabilities:{canRegister:canRegister(actor),department:actor.department,userId:actor.id}});
 }
 if(!canRegister(actor))return fail('국내 기술본부 직원만 본인의 프로젝트 보완 일정을 등록·수정할 수 있습니다.',403);
 const creating=!match![2],cancelling=match![3]==='cancel';
 if(creating?request.method!=='POST':cancelling?request.method!=='POST':request.method!=='PUT')return fail('지원하지 않는 요청입니다.',405);
 let input:any;try{input=await request.json();}catch{return fail('요청 내용을 확인하세요.');}
 if(!input||typeof input!=='object'||Array.isArray(input))return fail('요청 내용을 확인하세요.');
 const allowed=creating?['id','revision','kind','startDate','endDate','memo']:cancelling?['revision','taskRevision']:['revision','taskRevision','kind','startDate','endDate','memo'];
 if(Object.keys(input).some(key=>!allowed.includes(key)))return fail('작성자·소속·보고 상태·진척률은 서버에서 관리합니다. 일정과 내용만 입력하세요.');
 const requested=records.find((record:any)=>record.id===decodeURIComponent(match![1]));
 if(!requested)return fail('활성 프로젝트를 찾을 수 없습니다.',404);
 const group=records.filter((record:any)=>code(record.project)===code(requested.project));
 const target=creating?(group.find((record:any)=>record.project.department===actor.department)||requested):requested;
 const project=target.project,tasks=project.postDeliveryTasks||[],now=new Date().toISOString();
 const id=creating?(input.id??crypto.randomUUID()):decodeURIComponent(match![2]);
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))return fail('보완 일정 ID를 확인하세요.');
 const existing=tasks.find((task:any)=>task.id===id);
 if(creating&&!cancelling){
  const duplicate=records.flatMap((record:any)=>(record.project.postDeliveryTasks||[]).map((task:any)=>({record,task}))).find((entry:any)=>entry.task.id===id);
  if(duplicate){
   if(code(duplicate.record.project)===code(project)&&duplicate.task.submissionStatus==='REPORTED'&&duplicate.task.createdBy===actor.id&&duplicate.task.kind===(input.kind||'수정')&&duplicate.task.startDate===input.startDate&&duplicate.task.endDate===input.endDate&&duplicate.task.memo===String(input.memo||'').trim())return json({project:duplicate.record.project,projectRevision:duplicate.record.revision,revision:duplicate.record.revision,task:duplicate.task});
   return fail('이미 사용된 일정 ID입니다. 새 일정을 다시 열어 등록하세요.',409);
  }
 }
 if(creating&&!delivered(project))return fail('납품이 완료된 프로젝트만 새 보완 일정을 등록할 수 있습니다. 프로젝트의 납품 상태 또는 완료율을 확인하세요.',409);
 if(!Number.isInteger(input.revision)||input.revision!==target.revision)return fail('현장 일정이 변경되었습니다. 입력을 유지하고 최신 내용을 확인하세요.',409);
 if(!creating&&(!existing||existing.createdBy!==actor.id))return fail('본인이 등록한 보완 일정만 수정·취소할 수 있습니다.',403);
 if(!creating&&(!Number.isInteger(input.taskRevision)||input.taskRevision!==existing.revision))return fail('다른 화면에서 보완 일정이 변경되었습니다. 최신 내용을 확인하세요.',409);
 if(!creating&&existing.submissionStatus!=='REPORTED')return fail('취소된 보완 일정은 다시 변경할 수 없습니다. 새 일정으로 등록하세요.',409);
 if(creating&&tasks.length>=100)return fail('현장별 검토·보완 일정은 최대 100개입니다. 기존 일정을 확인하세요.',409);
 const reviewers=recipients(directory,creating?actor.department:existing.department);
 if(!reviewers.length)return fail('해당 팀의 활성 국내 보고 수신자가 없습니다. 팀장·실장 계정을 확인하세요.',409);
 let task:any;
 if(cancelling){task={...existing,submissionStatus:'CANCELLED',cancelledAt:now,reviewerIds:reviewers.map((row:any)=>row.id),revision:existing.revision+1};}
 else{
  if(!['검토','수정'].includes(input.kind||'수정')||!validDay(input.startDate)||!validDay(input.endDate)||input.startDate>input.endDate||!validDay(project.endDate)||input.startDate<project.endDate)return fail('원 납품일 이후의 보완 시작일·종료일을 확인하세요. 납품 당일 등록도 가능합니다.');
  if(typeof input.memo!=='string'||!input.memo.trim()||input.memo.trim().length>500)return fail('보완 작업 내용을 1~500자로 입력하세요.');
  if(existing?.actualProgressDate&&(input.startDate>existing.actualProgressDate||input.endDate<existing.actualProgressDate))return fail('이미 승인된 진척 날짜를 보완 기간에서 제외할 수 없습니다. 기존 진행 기록을 확인하세요.',409);
  task={...existing,id,kind:input.kind||'수정',startDate:input.startDate,endDate:input.endDate,memo:input.memo.trim(),personIds:[actor.id],status:existing?.status||'예정',department:existing?.department||actor.department,createdBy:actor.id,createdByName:existing?.createdByName||actor.name,submissionStatus:'REPORTED',submittedAt:now,reviewerIds:reviewers.map((row:any)=>row.id),revision:(existing?.revision||0)+1};
 }
 project.postDeliveryTasks=creating?[...tasks,task]:tasks.map((entry:any)=>entry.id===id?task:entry);
 const codeSnapshot=JSON.stringify(group.map((record:any)=>[record.id,record.revision]));
 const sameSiteSql="SELECT json_group_array(json_array(id,revision)) FROM (SELECT id,revision FROM studio_projects WHERE id NOT IN (SELECT project_id FROM studio_project_archive) AND CASE WHEN trim(COALESCE(json_extract(body,'$.code'),''))<>'' THEN upper(trim(json_extract(body,'$.code'))) ELSE id END=? ORDER BY id)";
 const message=`${actor.name} · ${project.code} · ${project.name} · 프로젝트 보완 일정 ${cancelling?'취소':creating?'등록':'수정 보고'} (${task.startDate} ~ ${task.endDate}) · ${task.memo}`;
 try{await db.batch([
  db.prepare('INSERT INTO studio_write_assertions SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE id=? AND revision=? AND id NOT IN (SELECT project_id FROM studio_project_archive))').bind(target.id,target.revision),
  db.prepare(`INSERT INTO studio_write_assertions SELECT 0 WHERE (${sameSiteSql})<>?`).bind(code(project),codeSnapshot),
  reporterGuard(db,actor),...reviewers.map((row:any)=>reporterGuard(db,row)),
  db.prepare('UPDATE studio_projects SET body=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(JSON.stringify(project),now,actor.id,target.id,target.revision),
  ...reviewers.map((row:any)=>db.prepare('INSERT INTO studio_notifications (id,user_id,meeting_id,message,created_at) VALUES (?,?,?,?,?)').bind(`supplement-report:${id}:r${task.revision}:${row.id}`,row.id,`supplement:${target.id}:${id}`,message,now))
 ]);}catch{return fail('동시에 현장·계정·보고 수신자가 변경되어 저장을 취소했습니다. 입력을 유지하고 최신 내용을 확인하세요.',409);}
 return json({project,projectRevision:target.revision+1,revision:target.revision+1,task});
}
