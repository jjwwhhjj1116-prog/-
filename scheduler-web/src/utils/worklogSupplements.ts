import type { Project } from '../store/useProjectStore';
import type { DailyWorkLog, WorkLogItem } from '../store/useWorkLogStore';
import { assignedItems, automaticWorkLogItems } from './personalWork.ts';

export type SupplementReportItem = WorkLogItem & { submittedAt: string; submissionRevision: number };

// A registration already reports to the team. Show it separately from the signed daily body.
export function separateSupplementReports(userId: string, day: string, projects: Project[], log?: Pick<DailyWorkLog, 'items' | 'approvalStatus' | 'authorSignature'>, aliases: string[] = [userId]): SupplementReportItem[] {
  const signedAt = log?.approvalStatus !== 'DRAFT' ? log?.authorSignature?.signedAt : undefined;
  const assigned = assignedItems(userId, day, projects, aliases);
  return automaticWorkLogItems(assigned, day).flatMap(item => {
    const project = projects.find(project => project.id === item.projectId);
    const task = project?.postDeliveryTasks?.find(task => item.id === `gen-${project.id}-followup-${task.id}`);
    if (task?.submissionStatus !== 'REPORTED' || !task.submittedAt || !Number.isFinite(Date.parse(task.submittedAt))) return [];
    const registeredDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(task.submittedAt));
    if (registeredDay > day) return [];
    const recorded = log?.items.some(old => old.id === item.id);
    if (recorded && (!signedAt || task.submittedAt <= signedAt)) return [];
    return [{ ...item, submittedAt: task.submittedAt, submissionRevision: task.revision || 1 }];
  });
}
