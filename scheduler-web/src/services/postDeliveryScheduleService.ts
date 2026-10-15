import {studioApi} from './studioApi';
import type {Department, PostDeliveryTask, Project} from '../store/useProjectStore';

export interface SupplementScheduleTask extends PostDeliveryTask {
  projectId: string;
  projectRevision: number;
  deliveryDate?: string;
  canEdit: boolean;
  canCancel: boolean;
  revision?: number;
  department?: Department;
  submissionStatus?: 'REPORTED' | 'CANCELLED';
  createdBy?: string;
  createdByName?: string;
  submittedAt?: string;
  reviewerIds?: string[];
}
export interface SupplementScheduleProject {
  projectId: string;
  projectCode: string;
  projectName: string;
  department: Department;
  deliveryDate: string;
  projectRevision: number;
  tasks: SupplementScheduleTask[];
}
export interface SupplementScheduleList {
  projects: SupplementScheduleProject[];
  capabilities: {canRegister: boolean; department: Department | null; userId: string};
}
export interface SupplementScheduleDraft {
  kind: '검토' | '수정';
  startDate: string;
  endDate: string;
  memo: string;
}
interface MutationResult {project: Project; projectRevision: number; revision: number; task: SupplementScheduleTask}
const projectPath = (projectId: string) => `projects/${encodeURIComponent(projectId)}/supplements`;
export const listSupplementSchedules = () => studioApi<SupplementScheduleList>('post-delivery-schedules');
export const registerSupplementSchedule = (projectId: string, id: string, revision: number, draft: SupplementScheduleDraft) =>
  studioApi<MutationResult>(projectPath(projectId), 'POST', {id, revision, ...draft});
export const updateSupplementSchedule = (projectId: string, taskId: string, revision: number, taskRevision: number, draft: SupplementScheduleDraft) =>
  studioApi<MutationResult>(`${projectPath(projectId)}/${encodeURIComponent(taskId)}`, 'PUT', {revision, taskRevision, ...draft});
export const cancelSupplementSchedule = (projectId: string, taskId: string, revision: number, taskRevision: number) =>
  studioApi<MutationResult>(`${projectPath(projectId)}/${encodeURIComponent(taskId)}/cancel`, 'POST', {revision, taskRevision});
