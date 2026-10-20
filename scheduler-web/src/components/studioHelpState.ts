type ReleaseNote = { id: string; date: string; ko: string[]; vi: string[] };

// 새 버전을 배포할 때 실제 변경 사항을 최신 날짜가 먼저 오도록 추가합니다.
export const releaseNotes: ReleaseNote[] = [
  {id:'2026-10-20-claim-worklogs',date:'2026-10-20',ko:['클레임센터 업무일지에서 기존 본인 계정으로 배정된 클레임 프로젝트의 수행 업무·계획·특이사항을 저장하고 다시 열 수 있습니다. 클레임센터와 같은 저장본을 사용합니다.','작성 대상은 이경훈 센터장·최영배 본부장·장범선 실장입니다. 대표·부사장의 기존 조회·결재 권한과 기존 기술본부 업무일지는 유지합니다. 이경훈 센터장은 기존 클레임센터 계정으로 작성합니다.'],vi:['Nhật ký Claim Center dùng cùng bản lưu với Claim Center; chọn dự án được phân công và ngày để ghi kết quả, kế hoạch và ghi chú.','Chỉ ba người phụ trách được chỉ định có thể viết bằng tài khoản hiện có. Quyền xem, duyệt và nhật ký kỹ thuật hiện có được giữ nguyên.']},
  {
    id: '2026-10-20-inquiry-intake-team-link',
    date: '2026-10-20',
    ko: ['질의사항에서 선택한 팀의 일정이 아직 없으면 다른 팀 일정 대신 프로젝트 접수 원본에 연결되도록 수정했습니다.'],
    vi: ['Nếu nhóm được chọn chưa có lịch dự án, câu hỏi sẽ liên kết với hồ sơ tiếp nhận dự án thay vì lịch của nhóm khác.'],
  },
  {
    id: '2026-10-20-meeting-intake-gemini-draft',
    date: '2026-10-20',
    ko: ['회의록의 프로젝트 선택 목록을 프로젝트 접수목록과 맞췄습니다.', '회의 녹취록·문서·엑셀을 맨 위에서 첨부하면 Gemini가 아래 회의록 초안을 작성합니다. 내용을 확인·수정한 뒤 저장하세요.'],
    vi: ['Danh sách chọn dự án trong biên bản họp nay khớp với danh sách tiếp nhận dự án.', 'Đính kèm bản ghi âm, tài liệu hoặc Excel ở đầu trang để Gemini tạo bản nháp biên bản bên dưới. Kiểm tra và sửa trước khi lưu.'],
  },
  {
    id: '2026-10-20-phone-business-card',
    date: '2026-10-20',
    ko: ['명함 등록에서 일회용 QR을 만들면 휴대폰으로 찍은 사진이 PC 등록 화면에 도착합니다. PC에서 Gemini 인식 결과를 확인·수정한 뒤 저장하세요.'],
    vi: ['Tạo mã QR dùng một lần trong Đăng ký danh thiếp để gửi ảnh chụp từ điện thoại đến màn hình PC. Kiểm tra và sửa kết quả Gemini trên PC trước khi lưu.'],
  },
  {
    id: '2026-10-20-calendar-page-scroll',
    date: '2026-10-20',
    ko: ['프로젝트·개인 일정표의 긴 목록을 브라우저 전체 스크롤로 볼 수 있게 바꾸고, 날짜의 가로 스크롤은 유지했습니다.', '인맥관리의 명함 삭제 확인을 화면 안 대화상자로 바꿨습니다.'],
    vi: ['Có thể cuộn cả trang để xem danh sách dài trong lịch dự án và lịch cá nhân; vẫn cuộn ngang để xem ngày.', 'Hộp xác nhận xóa danh thiếp nay hiển thị ngay trong trang.'],
  },
  {
    id: '2026-10-20-contacts',
    date: '2026-10-20',
    ko: ['인맥관리에서 명함을 촬영·업로드하고 Gemini 인식값을 수정한 뒤 회사 Drive에 등록할 수 있습니다.', '관리자는 설정에서 명함 인식용 Gemini API 키를 입력하고 명함 DB를 관리할 수 있습니다.', '처음 접속하면 주요 업무 흐름을 안내합니다. 상단의 사용 안내에서 언제든 다시 볼 수 있습니다.', '업데이트 내용을 날짜별로 확인할 수 있으며 새 내용은 접속 시 알려줍니다.'],
    vi: ['Có thể tải ảnh danh thiếp, chỉnh sửa kết quả Gemini rồi lưu vào Drive công ty trong mục Danh bạ.', 'Quản trị viên có thể thiết lập khóa Gemini API và quản lý cơ sở dữ liệu danh thiếp.', 'Hướng dẫn công việc chính xuất hiện khi đăng nhập lần đầu; có thể mở lại từ Hướng dẫn sử dụng.', 'Xem thay đổi theo ngày; cập nhật mới sẽ được thông báo khi đăng nhập.'],
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
