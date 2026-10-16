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
