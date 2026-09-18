export interface VietMember {
  id: string;
  no: number;
  name: string;
  engName: string;
  position: string;
  role: string;
}

export interface VietTeam {
  id: string;
  code: string;
  name: string; // 예: "내부1팀", "수직팀"
  displayName: string; // 예: "VIET 내부1팀"
  department: '마감팀' | '구조팀' | '토목&조경팀';
  type: 'Finish' | 'Structure' | 'Civil';
  leaderName: string;
  leaderPosition: string;
  members: VietMember[];
}

// 엑셀의 role_raw(External, Internal1, P&O1 등)을 기반으로 6개 마감팀, 2개 구조팀, 1개 토목팀으로 정확히 분류
export const VIET_TEAMS_DATA: VietTeam[] = [
  // 1. 마감 6개 팀
  {
    id: 'vt_in1',
    code: 'IN1',
    name: '내부1팀',
    displayName: 'VIET 내부1팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'VÕ VĂN DỬNG',
    leaderPosition: '팀장',
    members: [
      { id: 'u_44', no: 44, name: 'VÕ VĂN DỬNG', engName: 'VO VAN DUNG', position: '팀장', role: '총괄' },
      { id: 'u_45', no: 45, name: 'NGUYỄN NGỌC PHƯƠNG LOAN', engName: 'NGUYEN NGOC PHUONG LOAN', position: '부팀장', role: '검토' },
      { id: 'u_46', no: 46, name: 'VÕ ĐÔNG PHƯƠNG', engName: 'VO DONG PHUONG', position: '사원', role: '산출' },
      { id: 'u_47', no: 47, name: 'PHẠM QUANG TRƯỜNG', engName: 'PHAM QUANG TRUONG', position: '사원', role: '산출' },
    ],
  },
  {
    id: 'vt_in2',
    code: 'IN2',
    name: '내부2팀',
    displayName: 'VIET 내부2팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'HOÀNG THỊ HUYỀN THU',
    leaderPosition: '팀장',
    members: [
      { id: 'u_48', no: 48, name: 'HOÀNG THỊ HUYỀN THU', engName: 'HOANG THI HUYEN THU', position: '팀장', role: '총괄' },
      { id: 'u_49', no: 49, name: 'ĐINH TRẦN KHẢ ÁI', engName: 'DINH TRAN KHA AI', position: '사원', role: '산출' },
      { id: 'u_50', no: 50, name: 'NGUYỄN VĂN ĐÀ', engName: 'NGUYEN VAN DA', position: '사원', role: '산출' },
      { id: 'u_51', no: 51, name: 'LÂM KIM TUYỀN', engName: 'LAM KIM TUYEN', position: '사원', role: '산출' },
      { id: 'u_52', no: 52, name: 'NGUYỄN PHƯỚC NGUYÊN', engName: 'NGUYEN PHUOC NGUYEN', position: '사원', role: '산출' },
    ],
  },
  {
    id: 'vt_in3',
    code: 'IN3',
    name: '내부3팀',
    displayName: 'VIET 내부3팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'TRẦN ĐÌNH PHI',
    leaderPosition: '팀장',
    members: [
      { id: 'u_53', no: 53, name: 'TRẦN ĐÌNH PHI', engName: 'TRAN DINH PHI', position: '팀장', role: '총괄' },
      { id: 'u_54', no: 54, name: 'VÕ MINH TRIẾT', engName: 'VO MINH TRIET', position: '부팀장', role: '검토' },
      { id: 'u_55', no: 55, name: 'ĐOÀN MINH NHỰT', engName: 'DOAN MINH NHUT', position: '사원', role: '산출' },
      { id: 'u_56', no: 56, name: 'TRƯƠNG MINH HẢI', engName: 'TRUONG MINH HAI', position: '사원', role: '산출' },
      { id: 'u_57', no: 57, name: 'TRẦN MINH KIỆT', engName: 'TRAN MINH KIET', position: '사원', role: '산출' },
    ],
  },
  {
    id: 'vt_ext',
    code: 'EXT',
    name: '외부팀',
    displayName: 'VIET 외부팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'THÁI NHẬT DUY',
    leaderPosition: '팀장',
    members: [
      { id: 'u_37', no: 37, name: 'THÁI NHẬT DUY', engName: 'THAI NHAT DUY', position: '팀장', role: '총괄' },
      { id: 'u_38', no: 38, name: 'PHAN THỊ KIỀU DUYÊN', engName: 'PHAN THI KIEU DUYEN', position: '부팀장', role: '검토' },
      { id: 'u_39', no: 39, name: 'NGUYỄN THỊ QUỲNH GIAO', engName: 'NGUYEN THI QUYNH GIAO', position: '사원', role: '산출' },
      { id: 'u_40', no: 40, name: 'HỒ QUỐC BẢO', engName: 'HO QUOC BAO', position: '사원', role: '산출' },
      { id: 'u_41', no: 41, name: 'TÔN NGỌC ÁNH', engName: 'TON NGOC ANH', position: '사원', role: '산출' },
      { id: 'u_42', no: 42, name: 'HỒ MINH TUYÊN', engName: 'HO MINH TUYEN', position: '사원', role: '산출' },
      { id: 'u_43', no: 43, name: 'PHẠM ĐÌNH VĂN', engName: 'PHAM DINH VAN', position: '사원', role: '산출' },
    ],
  },
  {
    id: 'vt_brick',
    code: 'BRICK',
    name: '조적팀',
    displayName: 'VIET 조적팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'VŨ VĂN TÙNG',
    leaderPosition: '팀장',
    members: [
      { id: 'u_58', no: 58, name: 'VŨ VĂN TÙNG', engName: 'VU VAN TUNG', position: '팀장', role: '총괄' },
      { id: 'u_59', no: 59, name: 'NGUYỄN MINH LUÂN', engName: 'NGUYEN MINH LUAN', position: '부팀장', role: '검토' },
      { id: 'u_60', no: 60, name: 'NGUYỄN THỊ ANH', engName: 'NGUYEN THI ANH', position: '사원', role: '산출' },
      { id: 'u_61', no: 61, name: 'NGUYỄN TẤN PHÁT', engName: 'NGUYEN TAN PHAT', position: '사원', role: '산출' },
    ],
  },
  {
    id: 'vt_win',
    code: 'WIN',
    name: '창호팀',
    displayName: 'VIET 창호팀',
    department: '마감팀',
    type: 'Finish',
    leaderName: 'NGUYỄN THỊ THẢO',
    leaderPosition: '팀장',
    members: [
      { id: 'u_62', no: 62, name: 'NGUYỄN THỊ THẢO', engName: 'NGUYEN THI THAO', position: '팀장', role: '총괄' },
      { id: 'u_63', no: 63, name: 'VÕ THỊ THÙY TRÂM', engName: 'VO THI THUY TRAM', position: '팀장', role: '총괄' },
      { id: 'u_64', no: 64, name: 'NGUYỄN TRỌNG NGUYỄN', engName: 'NGUYEN TRONG NGUYEN', position: '사원', role: '산출' },
      { id: 'u_65', no: 65, name: 'NGUYỄN HỒNG NGÂN', engName: 'NGUYEN HONG NGAN', position: '사원', role: '산출' },
      { id: 'u_66', no: 66, name: 'NGUYỄN THỊ MINH CHÂU', engName: 'NGUYEN THI MINH CHAU', position: '사원', role: '산출' },
    ],
  },

  // 2. 구조 2개 팀 (수직팀, 수평팀)
  {
    id: 'vt_vert',
    code: 'VERT',
    name: '수직팀',
    displayName: 'VIET 수직팀 (기둥·옹벽)',
    department: '구조팀',
    type: 'Structure',
    leaderName: 'LÂM ANH TUẤN',
    leaderPosition: '팀장',
    members: [
      { id: 'u_78', no: 78, name: 'LÂM ANH TUẤN', engName: 'LAM ANH TUAN', position: '팀장', role: 'Vertical1 팀장' },
      { id: 'u_79', no: 79, name: 'NGUYỄN NGÔ HỮU CHÂU', engName: 'NGUYEN NGO HUU CHAU', position: '부팀장', role: 'Vertical1 부팀장' },
      { id: 'u_80', no: 80, name: 'TRẦN THỊ CẨM TÚ', engName: 'TRAN THI CAM TU', position: '사원', role: 'Vertical1 사원' },
      { id: 'u_81', no: 81, name: 'HỒ DANH XUÂN', engName: 'HO DANH XUAN', position: '팀장', role: 'Vertical2 팀장' },
      { id: 'u_82', no: 82, name: 'NGUYỄN MINH TÚ', engName: 'NGUYEN MINH TU', position: '부팀장', role: 'Vertical2 부팀장' },
      { id: 'u_83', no: 83, name: 'NGUYỄN THỊ CHI', engName: 'NGUYEN THI CHI', position: '사원', role: 'Vertical2 사원' },
      { id: 'u_84', no: 84, name: 'LÊ VĂN TOÀN', engName: 'LE VAN TOAN', position: '팀장', role: 'Vertical3 팀장' },
      { id: 'u_85', no: 85, name: 'PHAN NGUYỄN THANH XUÂN', engName: 'PHAN NGUYEN THANH XUAN', position: '부팀장', role: 'Vertical3 부팀장' },
      { id: 'u_86', no: 86, name: 'HUỲNH QUỐC HƯNG', engName: 'HUYNH QUOC HUNG', position: '사원', role: 'Vertical3 사원' },
      { id: 'u_87', no: 87, name: 'PHAN KHÁNH DUY', engName: 'PHAN KHANH DUY', position: '사원', role: 'Vertical3 사원' },
      { id: 'u_88', no: 88, name: 'NGUYỄN THỊ THU THỦY', engName: 'NGUYEN THI THU THUY', position: '사원', role: 'Vertical3 사원' },
    ],
  },
  {
    id: 'vt_horiz',
    code: 'HORIZ',
    name: '수평팀',
    displayName: 'VIET 수평팀 (보·슬라브)',
    department: '구조팀',
    type: 'Structure',
    leaderName: 'PHAN LÊ THIÊN NGÂN',
    leaderPosition: '팀장',
    members: [
      { id: 'u_67', no: 67, name: 'PHAN LÊ THIÊN NGÂN', engName: 'PHAN LE THIEN NGAN', position: '팀장', role: 'Horizon1 팀장' },
      { id: 'u_68', no: 68, name: 'NGUYỄN THỊ KIM THOA', engName: 'NGUYEN THI KIM THOA', position: '팀장', role: 'Horizon1 팀장' },
      { id: 'u_69', no: 69, name: 'NGUYỄN ĐÌNH NAM', engName: 'NGUYEN DINH NAM', position: '부팀장', role: 'Horizon1 부팀장' },
      { id: 'u_70', no: 70, name: 'CAO THỊ NGỌC THOA', engName: 'CAO THI NGOC THOA', position: '사원', role: 'Horizon1 사원' },
      { id: 'u_71', no: 71, name: 'NGUYỄN QUỐC HUY', engName: 'NGUYEN QUOC HUY', position: '사원', role: 'Horizon1 사원' },
      { id: 'u_72', no: 72, name: 'LÝ THANH PHONG', engName: 'LY THANH PHONG', position: '팀장', role: 'Horizon2 팀장' },
      { id: 'u_73', no: 73, name: 'TRẦN NHỰT CƯƠNG', engName: 'TRAN NHUT CUONG', position: '부팀장', role: 'Horizon2 부팀장' },
      { id: 'u_74', no: 74, name: 'HUỲNH THỊ NGỌC BÍCH', engName: 'HUYNH THI NGOC BICH', position: '사원', role: 'Horizon2 사원' },
      { id: 'u_75', no: 75, name: 'ĐẶNG SỸ ĐÀN', engName: 'DANG SY DAN', position: '팀장', role: 'Horizon3 팀장' },
      { id: 'u_76', no: 76, name: 'ĐỖ HỮU THÁI', engName: 'DO HUU THAI', position: '팀장', role: 'Horizon3 팀장' },
      { id: 'u_77', no: 77, name: 'NGUYỄN THỊ NGỌC MAI', engName: 'NGUYEN THI NGOC MAI', position: '사원', role: 'Horizon3 사원' },
    ],
  },

  // 3. 토목 1개 팀
  {
    id: 'vt_civil',
    code: 'CIVIL',
    name: '토목팀',
    displayName: 'VIET 토목팀',
    department: '토목&조경팀',
    type: 'Civil',
    leaderName: 'CHÂU QUANG TRÍ',
    leaderPosition: '사원',
    members: [
      { id: 'u_89', no: 89, name: 'CHÂU QUANG TRÍ', engName: 'CHAU QUANG TRI', position: '사원', role: '토목산출' },
      { id: 'u_90', no: 90, name: 'TRẦN TRUNG ĐAN', engName: 'TRAN TRUNG DAN', position: '사원', role: '토목산출' },
    ],
  },
];
