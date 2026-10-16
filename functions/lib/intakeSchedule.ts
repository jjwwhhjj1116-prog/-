import {validDay} from '../../scheduler-web/src/utils/personalWork.ts';

const teams=['마감팀','구조팀','토목&조경팀'];
type Intake=Record<string,any>&{code:string;name:string;targetDepartments:string[]};
export type PendingIntake=Intake&{reason:'department-unconfirmed'|'archived';missingDepartments:string[]};
const intakeCode=(code:unknown)=>typeof code==='string'?code.trim().toUpperCase():'';
function validIntake(item:any):item is Intake {
 return item&&/^TK-20\d{5}$/.test(intakeCode(item.code))&&typeof item.name==='string'&&Boolean(item.name.trim())&&Array.isArray(item.targetDepartments)&&item.targetDepartments.every((team:unknown)=>teams.includes(String(team)));
}
const matchingProject="json_valid(body) AND upper(trim(json_extract(body,'$.code')))=? AND json_extract(body,'$.department')=?";

// The collector creates planned work only; a manager assigns actual PM/personnel later.
export function intakeProjectStatements(DB:D1Database,items:unknown[],stamp:string) {
 return items.filter(validIntake).flatMap(item=>{
  const code=intakeCode(item.code),hasDates=validDay(item.startDate)&&validDay(item.endDate)&&item.startDate<=item.endDate;
  const departments=item.scopeVerified===true?[...new Set(item.targetDepartments)]:[];
  return departments.map(department=>{
   const project={id:`intake:${code}:${['F','S','C'][teams.indexOf(department)]}`,code,name:item.name,client:item.client,rawTitle:item.rawTitle,
    startDate:hasDates?item.startDate:'',endDate:hasDates?item.endDate:'',department,pmId:'',progress:0,status:'착수예정',roles:{},subTasks:{},
    area:item.area,usage:item.usage,buildings:item.buildings,floors:item.floors,contacts:item.contacts,notes:item.notes,request:item.request};
   return DB.prepare(`INSERT OR IGNORE INTO studio_projects(id,body,revision,updated_at,updated_by) SELECT ?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM studio_projects WHERE ${matchingProject})`)
    .bind(project.id,JSON.stringify(project),stamp,'intake-sync',code,department);
  });
 });
}

export async function ensureIntakeSchedules(DB:D1Database) {
 const rows=await DB.prepare('SELECT data,updated_at FROM studio_intake_documents ORDER BY document_no DESC').all<{data:string;updated_at:string}>();
 const intakeList=rows.results.flatMap(row=>{try{return [JSON.parse(row.data)];}catch{return [];}});
 const items=intakeList.filter(validIntake);
 const existing=await DB.prepare("SELECT id,upper(trim(json_extract(body,'$.code'))) AS code,json_extract(body,'$.department') AS department FROM studio_projects WHERE json_valid(body)").all<{id:string;code:string;department:string}>();
 const scheduled=new Set(existing.results.map(project=>`${project.code}\0${project.department}`));
 const missing=items.map(item=>({...item,targetDepartments:item.targetDepartments.filter(department=>!scheduled.has(`${intakeCode(item.code)}\0${department}`))}));
 const statements=intakeProjectStatements(DB,missing,new Date().toISOString());
 if(statements.length)await DB.batch(statements);
 // Direct SQL collectors are also repaired before the next shared version snapshot.
 return {items,intakeList,intakeVersion:`${rows.results.reduce((latest,row)=>row.updated_at>latest?row.updated_at:latest,'')}:${rows.results.length}`};
}

export function pendingIntakeSchedules(items:Intake[],active:Record<string,any>[],archived:Record<string,any>[]):PendingIntake[] {
 const activeCodes=new Set(active.map(project=>intakeCode(project.code))),activeTeams=new Set(active.map(project=>`${intakeCode(project.code)}\0${project.department}`)),archivedTeams=new Set(archived.map(project=>`${intakeCode(project.code)}\0${project.department}`));
 return items.flatMap(item=>{
  const code=intakeCode(item.code),departments=item.scopeVerified===true?item.targetDepartments:[];
  if(!departments.length)return activeCodes.has(code)?[]:[{...item,code,reason:'department-unconfirmed' as const,missingDepartments:[]}];
  const missingDepartments=departments.filter(department=>!activeTeams.has(`${code}\0${department}`)&&archivedTeams.has(`${code}\0${department}`));
  return missingDepartments.length?[{...item,code,reason:'archived' as const,missingDepartments}]:[];
 });
}
