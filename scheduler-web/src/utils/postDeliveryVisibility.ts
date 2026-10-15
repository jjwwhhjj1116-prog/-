import type { Department, PostDeliveryTask, Project } from '../store/useProjectStore';

// Registering reports the schedule immediately; cancellation removes only that assignment.
export const isPostDeliveryConfirmed = (task: PostDeliveryTask) => task.submissionStatus !== 'CANCELLED';
export const isPostDeliveryVisible = isPostDeliveryConfirmed;
export const postDeliveryDepartment = (project: Pick<Project, 'department'>, task: PostDeliveryTask): Department => task.department || project.department;
export const visiblePostDeliveryTasks = (project: Pick<Project, 'department' | 'postDeliveryTasks'>, department: Department | 'ALL' = 'ALL') =>
  (project.postDeliveryTasks || []).filter(task => isPostDeliveryVisible(task) && (department === 'ALL' || postDeliveryDepartment(project, task) === department));
