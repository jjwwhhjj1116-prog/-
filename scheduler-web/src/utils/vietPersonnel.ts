import { VIET_TEAMS_DATA, type VietTeam } from '../data/vietTeams.ts';
import type { ConcostUser } from '../store/useAuthStore';
import type { Department } from '../store/useProjectStore';

type VietAssignmentGroup = Pick<VietTeam, 'id' | 'code' | 'name' | 'displayName' | 'department' | 'type'>;
export const VIET_ASSIGNMENT_GROUPS: VietAssignmentGroup[] = [
  ...VIET_TEAMS_DATA.filter(team => team.type === 'Finish').map(({id, code, name, displayName, department, type}) => ({id, code, name, displayName, department, type})),
  {id: 'vt_horiz_apartment', code: 'HORIZ_APARTMENT', name: '수평팀(아파트)', displayName: 'VIET 수평팀(아파트)', department: '구조팀', type: 'Structure'},
  {id: 'vt_horiz_general', code: 'HORIZ_GENERAL', name: '수평팀(일반)', displayName: 'VIET 수평팀(일반)', department: '구조팀', type: 'Structure'},
  {id: 'vt_vert_apartment', code: 'VERT_APARTMENT', name: '수직팀(아파트)', displayName: 'VIET 수직팀(아파트)', department: '구조팀', type: 'Structure'},
  {id: 'vt_vert_general', code: 'VERT_GENERAL', name: '수직팀(일반)', displayName: 'VIET 수직팀(일반)', department: '구조팀', type: 'Structure'},
  ...VIET_TEAMS_DATA.filter(team => team.type === 'Civil').map(({id, code, name, displayName, department, type}) => ({id, code, name, displayName, department, type})),
];

// Group membership is explicit directory metadata; names and old roster numbers are not identity links.
export function vietIndividuals(users: ConcostUser[], department?: Department): ConcostUser[] {
  return users.filter(user => user.company === 'VIETQS' && user.active !== false
    && VIET_ASSIGNMENT_GROUPS.some(group => group.department === user.department)
    && (department === undefined || user.department === department));
}

export function resolveVietTeams(users: ConcostUser[], department?: Department): VietTeam[] {
  const individuals = vietIndividuals(users, department);
  return VIET_ASSIGNMENT_GROUPS.filter(group => department === undefined || group.department === department).map(group => {
    const members = individuals.filter(user => user.department === group.department && user.vietTeamId === group.id);
    const leader = members.find(user => user.position === '팀장');
    return {...group, leaderName: leader?.name || '미지정', leaderPosition: leader?.position || '', members: members.map(user => ({
      id: user.id, no: /^\d+$/.test(user.employeeNo || '') ? Number(user.employeeNo) : user.no,
      name: user.name, engName: user.engName, position: user.position, role: user.originalDept || group.name,
    }))};
  });
}
