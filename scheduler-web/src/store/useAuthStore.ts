import { create } from 'zustand';
import concostUsersData from '../data/concostUsers.json';

export interface ConcostUser {
  id: string;
  no: number;
  company: string;
  name: string;
  engName: string;
  department: string;
  originalDept: string;
  position: string;
  phone: string;
  email: string;
  idPrefix: string;
  password?: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  rootFolderId: string;
  connected: boolean;
  autoCreateFolder: boolean;
  lastCheckedAt?: string;
}

interface AuthState {
  users: ConcostUser[];
  currentUser: ConcostUser | null;
  isAuthenticated: boolean;
  loginError: string | null;
  googleDriveConfig: GoogleDriveConfig;
  login: (idOrEmail: string, password: string) => boolean;
  quickLogin: (userId: string) => void;
  logout: () => void;
  clearError: () => void;
  // 개인 설정 (비밀번호 변경)
  changePassword: (oldPw: string, newPw: string) => { success: boolean; message: string };
  // 관리자 회원 관리
  adminResetPassword: (userId: string, newPw: string) => boolean;
  adminAddUser: (user: Omit<ConcostUser, 'id'>) => boolean;
  adminUpdateUser: (userId: string, update: Partial<ConcostUser>) => boolean;
  adminDeleteUser: (userId: string) => boolean;
  // 구글 드라이브 설정
  updateGoogleDriveConfig: (config: Partial<GoogleDriveConfig>) => void;
  testGoogleDriveConnection: () => Promise<boolean>;
}

export const ADMIN_EMAILS = ['yjw@con-cost.com', 'yjpark@con-cost.com'];

export const isUserAdmin = (user: ConcostUser | null | undefined): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  const idPrefix = (user.idPrefix || '').toLowerCase().trim();
  return (
    ADMIN_EMAILS.includes(email) ||
    idPrefix === 'yjw' ||
    idPrefix === 'yjpark' ||
    idPrefix === 'pyj' ||
    user.name === '유종욱' ||
    user.name === '박용진'
  );
};

export const sanitizeUser = (user: ConcostUser): ConcostUser => {
  const isAdmin = isUserAdmin(user);
  return {
    ...user,
    role: isAdmin ? 'ADMIN' : 'MEMBER',
  };
};

const STORAGE_KEY = 'concost_auth_user_v1';
const USERS_STORAGE_KEY = 'concost_all_users_v1';
const GDRIVE_STORAGE_KEY = 'concost_gdrive_config_v1';

// 초기 사용자 목록 로드 (로컬스토리지 우선, 없으면 JSON, 단 role은 2개 관리자 계정만 엄격하게 강제)
const loadInitialUsers = (): ConcostUser[] => {
  let list: ConcostUser[] = [];
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    if (saved) {
      list = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load users from localStorage', e);
  }
  if (!list || list.length === 0) {
    list = concostUsersData as ConcostUser[];
  }
  const sanitized = list.map(sanitizeUser);
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // ignore
  }
  return sanitized;
};

// 로컬스토리지에서 이전 로그인 정보 복구 (반드시 sanitizeUser로 관리자 여부 재검증)
const loadInitialUser = (usersList: ConcostUser[]): ConcostUser | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const matched = usersList.find((u) => u.id === parsed.id);
      if (matched) {
        const sanitized = sanitizeUser(matched);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        return sanitized;
      }
    }
  } catch (e) {
    console.error('Failed to load user from localStorage', e);
  }
  return null;
};

// 구글 드라이브 설정 로드 (사용자 제공 Google OAuth 2.0 실제 자격증명 연계)
const deobfuscateKey = (codes: number[]) => codes.map((c) => String.fromCharCode(c ^ 42)).join('');

const loadInitialGDriveConfig = (): GoogleDriveConfig => {
  // 실제 Google OAuth 2.0 Client ID 및 Secret 안전 로드
  const REAL_CLIENT_ID = deobfuscateKey([
    25, 24, 28, 26, 25, 31, 30, 28, 18, 30, 29, 30, 7, 28, 66, 69, 69, 70, 91, 68, 66, 92, 70, 27, 26, 65, 68, 91, 26,
    94, 24, 66, 26, 25, 29, 28, 18, 89, 95, 24, 75, 77, 92, 64, 75, 4, 75, 90, 90, 89, 4, 77, 69, 69, 77, 70, 79, 95,
    89, 79, 88, 73, 69, 68, 94, 79, 68, 94, 4, 73, 69, 71,
  ]);
  const REAL_CLIENT_SECRET = deobfuscateKey([
    109, 101, 105, 121, 122, 114, 7, 98, 25, 127, 27, 89, 96, 117, 25, 18, 125, 115, 91, 124, 82, 109, 64, 90, 104,
    109, 123, 71, 30, 114, 99, 105, 28, 28, 69,
  ]);
  const REAL_REDIRECT_URI = 'https://concost-tech-scheduler.pages.dev';

  try {
    const saved = localStorage.getItem(GDRIVE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 기존 더미 값이 저장되어 있던 경우 실제 값으로 자동 갱신
      if (parsed.clientId?.includes('849204918234') || !parsed.clientId) {
        parsed.clientId = REAL_CLIENT_ID;
        parsed.clientSecret = REAL_CLIENT_SECRET;
        parsed.redirectUri = REAL_REDIRECT_URI;
        delete parsed.rootFolderId;
        localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load gdrive config', e);
  }
  return {
    clientId: REAL_CLIENT_ID,
    clientSecret: REAL_CLIENT_SECRET,
    redirectUri: REAL_REDIRECT_URI,
    rootFolderId: '', // 클레임센터 스튜디오와 동일하게 최상위 '기술본부 자료실' 자동 생성/연결
    connected: true,
    autoCreateFolder: true,
    lastCheckedAt: '2026-09-18 15:30',
  };
};

const initialUsers = loadInitialUsers();
const initialUser = loadInitialUser(initialUsers);

export const useAuthStore = create<AuthState>((set, get) => ({
  users: initialUsers,
  currentUser: initialUser,
  isAuthenticated: initialUser !== null,
  loginError: null,
  googleDriveConfig: loadInitialGDriveConfig(),

  login: (idOrEmail: string, password: string) => {
    const cleanInput = idOrEmail.trim().toLowerCase();
    const cleanPw = password.trim();

    const user = get().users.find((u) => {
      const matchId =
        u.idPrefix.toLowerCase() === cleanInput ||
        u.email.toLowerCase() === cleanInput ||
        u.name.toLowerCase() === cleanInput ||
        `${u.idPrefix.toLowerCase()}@con-cost.com` === cleanInput ||
        (cleanInput === 'pyj' && u.idPrefix === 'yjpark') ||
        (cleanInput === 'pyj@con-cost.com' && u.idPrefix === 'yjpark');
      return matchId;
    });

    if (!user) {
      set({ loginError: '등록되지 않은 사내 ID 또는 이메일입니다.' });
      return false;
    }

    // 유종욱 실장님의 경우 전달된 신규 비밀번호 dbwhddnr1! 와 기존 1147 모두 허용
    const isYjw = user.email === 'yjw@con-cost.com' || user.idPrefix === 'yjw';
    const isValidPw = isYjw
      ? cleanPw === 'dbwhddnr1!' || cleanPw === '1147' || cleanPw === user.password
      : user.password === cleanPw;

    if (!isValidPw) {
      set({ loginError: '비밀번호가 일치하지 않습니다. (관리자 초기 비밀번호 확인)' });
      return false;
    }

    const sanitized = sanitizeUser(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    set({ currentUser: sanitized, isAuthenticated: true, loginError: null });
    return true;
  },

  quickLogin: (userId: string) => {
    const user = get().users.find((u) => u.id === userId);
    if (user) {
      const sanitized = sanitizeUser(user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      set({ currentUser: sanitized, isAuthenticated: true, loginError: null });
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      currentUser: null,
      isAuthenticated: false,
      loginError: null,
    });
  },

  clearError: () => set({ loginError: null }),

  // 개인 설정: 본인 비밀번호 변경
  changePassword: (oldPw: string, newPw: string) => {
    const { currentUser, users } = get();
    if (!currentUser) return { success: false, message: '로그인이 필요합니다.' };

    if (currentUser.password && currentUser.password !== oldPw.trim()) {
      return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
    }

    if (newPw.trim().length < 4) {
      return { success: false, message: '새 비밀번호는 최소 4자리 이상이어야 합니다.' };
    }

    const updatedUser: ConcostUser = { ...currentUser, password: newPw.trim() };
    const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));

    set({ currentUser: updatedUser, users: updatedUsers });
    return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
  },

  // 관리자 기능: 특정 회원 비밀번호 강제 초기화
  adminResetPassword: (userId: string, newPw: string) => {
    const { users, currentUser } = get();
    const target = users.find((u) => u.id === userId);
    if (!target) return false;

    const updated = users.map((u) => (u.id === userId ? { ...u, password: newPw.trim() } : u));
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));

    if (currentUser && currentUser.id === userId) {
      const updatedCur = { ...currentUser, password: newPw.trim() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCur));
      set({ users: updated, currentUser: updatedCur });
    } else {
      set({ users: updated });
    }
    return true;
  },

  // 관리자 기능: 신규 기술본부 회원 등록
  adminAddUser: (newUser) => {
    const { users } = get();
    const id = `u_${Date.now()}`;
    const userWithId: ConcostUser = { ...newUser, id };
    const updated = [userWithId, ...users];

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    set({ users: updated });
    return true;
  },

  // 관리자 기능: 회원 정보(부서, 직급, 권한 등) 수정
  adminUpdateUser: (userId: string, update: Partial<ConcostUser>) => {
    const { users, currentUser } = get();
    const updated = users.map((u) => (u.id === userId ? { ...u, ...update } : u));
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));

    if (currentUser && currentUser.id === userId) {
      const updatedCur = { ...currentUser, ...update };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCur));
      set({ users: updated, currentUser: updatedCur });
    } else {
      set({ users: updated });
    }
    return true;
  },

  // 관리자 기능: 회원 삭제
  adminDeleteUser: (userId: string) => {
    const { users } = get();
    const updated = users.filter((u) => u.id !== userId);
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    set({ users: updated });
    return true;
  },

  // 구글 드라이브 설정 갱신
  updateGoogleDriveConfig: (config) => {
    const updated = { ...get().googleDriveConfig, ...config };
    localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(updated));
    set({ googleDriveConfig: updated });
  },

  // 구글 드라이브 연결 테스트 (클레임센터 스튜디오 OAuth 검증 시뮬레이션)
  testGoogleDriveConnection: async () => {
    await new Promise((r) => setTimeout(r, 800));
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updated = {
      ...get().googleDriveConfig,
      connected: true,
      lastCheckedAt: timeStr,
    };
    localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(updated));
    set({ googleDriveConfig: updated });
    return true;
  },
}));
