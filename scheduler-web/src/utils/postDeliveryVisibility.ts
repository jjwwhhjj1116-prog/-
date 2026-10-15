import type { Department, PostDeliveryTask, Project, ScheduleExtension } from '../store/useProjectStore';

// Registering reports the schedule immediately; cancellation removes only that assignment.
export const isPostDeliveryConfirmed = (task: PostDeliveryTask) => task.submissionStatus !== 'CANCELLED';
export const isPostDeliveryVisible = isPostDeliveryConfirmed;
export const postDeliveryDepartment = (project: Pick<Project, 'department'>, task: PostDeliveryTask): Department => task.department || project.department;
export const visiblePostDeliveryTasks = (project: Pick<Project, 'department' | 'postDeliveryTasks'>, department: Department | 'ALL' = 'ALL') =>
  (project.postDeliveryTasks || []).filter(task => isPostDeliveryVisible(task) && (department === 'ALL' || postDeliveryDepartment(project, task) === department));

// Requests keep their reporting team even when their host belongs to another team.
export function scheduleExtensionDepartment(project: Pick<Project, 'id' | 'department' | 'postDeliveryTasks'>, request: Pick<ScheduleExtension, 'taskId' | 'department'>): Department {
  if (request.department && ['마감팀', '구조팀', '토목&조경팀'].includes(request.department)) return request.department;
  const task = project.postDeliveryTasks?.find(task => request.taskId === `gen-${project.id}-followup-${task.id}`);
  return task ? postDeliveryDepartment(project, task) : project.department;
}
