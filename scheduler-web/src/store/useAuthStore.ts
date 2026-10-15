import { studioApi } from '../services/studioApi';
import { create } from 'zustand';
import concostUsersData from '../data/publicDirectory.json';

export interface ConcostUser {
  id: string;
  no: number;
  employeeNo?: string;
  vietTeamId?: string;
  company: string;
  name: string;
  engName: string;
  department: string;
  originalDept: string;
  position: string;
  phone: string;
  extension?: string;
  email: string;
  idPrefix: string;
  password?: string;
  active?: boolean;
  role: 'ADMIN' | 'MEMBER';
}

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  rootFolderId: string;
  connected: boolean;
  companyEmail?: string;
  autoCreateFolder: boolean;
  lastCheckedAt?: string;
}

interface AuthState {
  users: ConcostUser[];
  currentUser: ConcostUser | null;
  isAuthenticated: boolean;
  loginError: string | null;
  googleDriveConfig: GoogleDriveConfig;
  login: (idOrEmail: string, password: string) => Promise<boolean>;
  quickLogin: (userId: string) => void;
  logout: () => void;
  clearError: () => void;
  // 개인 설정 (비밀번호 변경)
  changePassword: (oldPw: string, newPw: string) => Promise<{ success: boolean; message: string }>;
  // 관리자 회원 관리
  adminResetPassword: (userId: string, newPw: string, options?: {resetMode:'extension'|'temporary';extension?:string}) => Promise<boolean>;
  adminAddUser: (user: Omit<ConcostUser, 'id'>) => Promise<boolean>;
  adminUpdateUser: (userId: string, update: Partial<ConcostUser>) => Promise<boolean>;
  adminDeleteUser: (userId: string) => Promise<boolean>;
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
  const {password: _password,...safe}=user;
  return {
    ...safe,
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

// OAuth 비밀 값은 서버 환경 변수에서만 관리한다.
const loadInitialGDriveConfig = (): GoogleDriveConfig => {
  let saved: Partial<GoogleDriveConfig> = {};
  try { saved = JSON.parse(localStorage.getItem(GDRIVE_STORAGE_KEY) || '{}'); } catch { /* 기본값 */ }
  const safe = {clientId: saved.clientId || '', clientSecret: '', redirectUri: saved.redirectUri || '', rootFolderId: saved.rootFolderId || '', connected: false, autoCreateFolder: saved.autoCreateFolder ?? true};
  localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(safe));
  return safe;
};

const initialUsers = loadInitialUsers();
const initialUser = loadInitialUser(initialUsers);

export const useAuthStore = create<AuthState>((set, get) => ({
  users: initialUsers,
  currentUser: initialUser,
  isAuthenticated: initialUser !== null,
  loginError: null,
  googleDriveConfig: loadInitialGDriveConfig(),

  login: async (idOrEmail: string, password: string) => {
    try {
      const {user}=await studioApi('login','POST',{login:idOrEmail,password});
      localStorage.setItem(STORAGE_KEY,JSON.stringify(user));
      set({currentUser:user,isAuthenticated:true,loginError:null});return true;
    } catch(error) {set({loginError:error instanceof Error?error.message:'서버 로그인 실패'});return false;}
  },

  quickLogin: (userId: string) => {
    if (!import.meta.env.DEV) { set({loginError:"비밀번호로 로그인해 주세요."}); return; }
    const user = get().users.find((u) => u.id === userId);
    if (user) {
      const sanitized = sanitizeUser(user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      set({ currentUser: sanitized, isAuthenticated: true, loginError: null });
    }
  },

  logout: () => {
    void studioApi("logout","POST").catch(()=>{});
    localStorage.removeItem(STORAGE_KEY);
    set({
      currentUser: null,
      isAuthenticated: false,
      loginError: null,
    });
  },

  clearError: () => set({ loginError: null }),

  // 개인 설정: 본인 비밀번호 변경
  changePassword: async (oldPw: string,newPw: string)=>{
    try{await studioApi('password','POST',{oldPassword:oldPw,newPassword:newPw});return {success:true,message:'서버 비밀번호를 변경했습니다.'};}
    catch(e){return {success:false,message:e instanceof Error?e.message:'변경 실패'};}
  },

  adminResetPassword: async (id,password,options)=>manageUser('reset',{id,password,...options},set),
  adminAddUser: async ({password,...record})=>manageUser('create',{record,password},set),
  adminUpdateUser: async (id,record)=>manageUser('update',{id,record},set),
  adminDeleteUser: async (id)=>manageUser('deactivate',{id},set),

  // 구글 드라이브 설정 갱신
  updateGoogleDriveConfig: (config) => {
    const updated = { ...get().googleDriveConfig, ...config };
    localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(updated));
    set({ googleDriveConfig: updated });
  },

  // 서버에서 실제 저장 계정과 연결 상태를 확인한다.
  testGoogleDriveConnection: async () => {
    let connected = false;
    let companyEmail = '';
    try { const response = await fetch('/api/google/status'); const status = await response.json(); connected = response.ok && status.connected === true; if(connected && typeof status.companyEmail === 'string')companyEmail=status.companyEmail; } catch { /* 연결 실패 */ }
    const updated = {...get().googleDriveConfig, clientSecret:'', connected, companyEmail, lastCheckedAt:new Date().toISOString()};
    localStorage.setItem(GDRIVE_STORAGE_KEY, JSON.stringify(updated));
    set({googleDriveConfig:updated});
    return connected;
  },
}));

async function manageUser(action:string,input:Record<string,unknown>,set:(value:Partial<AuthState>)=>void){
 const actor=useAuthStore.getState().currentUser;
 try{const result=await studioApi('admin/users','POST',{action,...input});if(actor!==useAuthStore.getState().currentUser)return false;if(result.sessionRevoked){localStorage.removeItem(STORAGE_KEY);set({currentUser:null,isAuthenticated:false,loginError:null});return true;}const {users}=await studioApi('directory');if(actor!==useAuthStore.getState().currentUser)return false;set({users:users.map(sanitizeUser),loginError:null});return true;}
 catch(e){if(actor===useAuthStore.getState().currentUser)set({loginError:e instanceof Error?e.message:'계정 관리 요청 실패'});return false;}
}
