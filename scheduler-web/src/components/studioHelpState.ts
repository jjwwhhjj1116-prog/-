type ReleaseNote = { id: string; date: string; ko: string[]; vi: string[] };

// 새 버전을 배포할 때 실제 변경 사항을 최신 날짜가 먼저 오도록 추가합니다.
export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-10-20-help-and-updates',
    date: '2026-10-20',
    ko: ['처음 접속하면 주요 업무 흐름을 안내합니다. 상단의 사용 안내에서 언제든 다시 볼 수 있습니다.', '업데이트 내용을 날짜별로 확인할 수 있으며 새 내용은 접속 시 알려줍니다.'],
    vi: ['Hướng dẫn công việc chính xuất hiện khi đăng nhập lần đầu; có thể mở lại từ Hướng dẫn sử dụng.', 'Xem thay đổi theo ngày; cập nhật mới sẽ được thông báo khi đăng nhập.'],
  },
  {
    id: '2026-10-19-project-overtime-calendar',
    date: '2026-10-19',
    ko: ['승인된 야근을 프로젝트 일정표에도 표시하고, 야근이 있는 달에서 해당 프로젝트가 보이도록 수정했습니다.'],
    vi: ['Giờ làm thêm đã duyệt cũng hiển thị trên lịch dự án, kể cả trong tháng chỉ có lịch làm thêm.'],
  },
];

const storageKey = (kind: string, actorId: string) => `concost-studio-${kind}:${actorId}`;
export function readHelpStatus(actorId: string) {
  try {
    return {
      guideSeen: localStorage.getItem(storageKey('guide-v1', actorId)) === 'seen',
      updateSeen: localStorage.getItem(storageKey('updates', actorId)) === releaseNotes[0].id,
    };
  } catch {
    return { guideSeen: false, updateSeen: false };
  }
}
export function markHelpSeen(actorId: string) {
  try {
    localStorage.setItem(storageKey('guide-v1', actorId), 'seen');
    localStorage.setItem(storageKey('updates', actorId), releaseNotes[0].id);
  } catch { /* 브라우저 저장이 차단돼도 안내는 계속 사용할 수 있습니다. */ }
}
