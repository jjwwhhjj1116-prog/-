export const POSITION_ORDER = ['본부장', '실장', '팀장', '수석', '책임', '프로'] as const;
export function compareStaff(a: {position?: string | null}, b: {position?: string | null}) {
  const rank = (position: string | null | undefined) => { const index = POSITION_ORDER.indexOf((position || '').trim() as typeof POSITION_ORDER[number]); return index < 0 ? POSITION_ORDER.length : index; };
  // 동일 직급과 목록 밖 직급은 각 화면의 기존 상대 순서를 유지한다.
  return rank(a.position) - rank(b.position);
}
