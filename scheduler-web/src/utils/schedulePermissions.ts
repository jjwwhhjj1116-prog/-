import type { ConcostUser } from '../store/useAuthStore';
import type { Department } from '../store/useProjectStore';

// 인수인계 결재선과 직원 ID 대조. 토목/조경 결재선은 담당자 확인 전 직급/소속으로 판단.
const managers: Partial<Record<Department, string[]>> = { 마감팀: ['u_12','u_13'], 구조팀: ['u_24','u_25'] };
export function isScheduleAdmin(user: Pick<ConcostUser, 'email' | 'role' | 'active'> | null | undefined): boolean {
  return Boolean(user && user.active !== false && user.role === 'ADMIN' && ['yjw@con-cost.com', 'yjpark@con-cost.com'].includes(user.email?.trim().toLowerCase()));
}
// 결재·기록 조회/정리는 기존 팀 권한을 유지한다. 관리자 예외는 일정 편집에만 사용한다.
export function canManageSchedule(user: ConcostUser | null, department: Department, includeAdmin = true): boolean {
  if (!user || user.active === false) return false;
  if (includeAdmin && isScheduleAdmin(user)) return true;
  if (user.department !== department) return false;
  return Boolean(managers[department]?.includes(user.id) || ['실장','팀장'].includes(user.position));
}
