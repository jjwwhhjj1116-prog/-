import type { IntakeProject } from '../components/IntakeListView';
import type { Department, Project } from '../store/useProjectStore';
import { projectScheduleRange, validDateRange } from './scheduleProgress';

export type PendingIntakeProject = IntakeProject & {
  reason?: 'department-unconfirmed' | 'archived';
  missingDepartments?: Department[];
};

export function projectPMId(project: Project): string {
  const task = project.subTasks?.PM;
  if (!task) return project.pmId || project.roles?.PM?.personId || '';
  if (task.scopeExcluded) return '';
  if (task.personIds !== undefined && !task.personIds.some(Boolean)) return '';
  // The responsible PM can differ from the staff assigned to a PM work period.
  return project.pmId || task.personIds?.find(Boolean) || task.personId || task.allocations?.flatMap(period => period.personIds).find(Boolean) || '';
}

export function projectHasNoPM(project: Project): boolean {
  return project.status !== '납품' && project.progress < 100 && !projectPMId(project);
}

export function pendingAssignmentReason(project: Project): 'PM 미배정' | '일정 미정' | null {
  if (project.status === '납품' || project.progress >= 100) return null;
  if (projectHasNoPM(project)) return 'PM 미배정';
  const range = projectScheduleRange(project);
  return validDateRange(range.start, range.end) ? null : '일정 미정';
}

