import type {IntakeProject} from '../components/IntakeListView';
import type {Project} from '../store/useProjectStore';

export type ProjectCatalogItem=IntakeProject&{projects:Project[];archivedProjects:Project[]};
export const projectCatalogCode=(code:string)=>code.trim().toUpperCase();

// The intake document is the display identity; team schedule IDs remain untouched write targets.
export function buildProjectCatalog(intakes:IntakeProject[],projects:Project[],archived:Project[]=[]):ProjectCatalogItem[]{
 const seen=new Set<string>();
 return [...intakes].sort((a,b)=>b.no-a.no).flatMap(item=>{
  const code=projectCatalogCode(item.code);
  if(!code||seen.has(code))return [];
  seen.add(code);
  return [{...item,projects:projects.filter(project=>projectCatalogCode(project.code||'')===code),archivedProjects:archived.filter(project=>projectCatalogCode(project.code||'')===code)}];
 });
}

// Existing historical schedules may be restored, but a new team schedule needs an intake source.
export function assertNewSchedulesHaveIntake(intakes:IntakeProject[],existing:Project[],incoming:Project[]):void{
 const intakeCodes=new Set(intakes.map(item=>projectCatalogCode(item.code)));
 const existingTeams=new Set(existing.map(project=>`${projectCatalogCode(project.code||'')}::${project.department}`));
 const missing=[...new Set(incoming.filter(project=>{
  const code=projectCatalogCode(project.code||'');
  return !existingTeams.has(`${code}::${project.department}`)&&!intakeCodes.has(code);
 }).map(project=>project.code||'(번호 없음)'))];
 if(missing.length)throw new Error(`프로젝트 접수목록에 없는 신규 일정은 가져올 수 없습니다: ${missing.slice(0,3).join(', ')}${missing.length>3?' 외':''}. 먼저 접수목록을 확인해 주세요.`);
}
