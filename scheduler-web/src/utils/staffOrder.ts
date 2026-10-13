export const POSITION_ORDER = ['실장', '팀장', '파트장', '수석', '책임', '선임', '프로'] as const;
export function compareStaff(a: {position: string}, b: {position: string}) {
  const rank = (position: string) => { const index = POSITION_ORDER.indexOf(position.trim() as typeof POSITION_ORDER[number]); return index < 0 ? POSITION_ORDER.length : index; };
  // 동일 직급은 명부의 기존 순서를 유지한다.
  return rank(a.position) - rank(b.position);
}
