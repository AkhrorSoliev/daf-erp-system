import { create } from "zustand";
import Cookies from "js-cookie";

interface UserRole {
  id: number;
  name: string;
}

interface UserBranch {
  id: number;
  name: string;
  /** `BranchStatus`; absent in a cookie written before the payload carried it. */
  status?: string;
}

interface UserCompany {
  id: number;
  name: string;
  subdomain: string | null;
  logo: string | null;
  phone: string | null;
}

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
  gender: string | null;
  balance: number;
  companyId: number;
  mainBranch: number | null;
  roles: UserRole[];
  branches: UserBranch[];
  company: UserCompany;
  studentId?: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  /**
   * Drops the session without leaving the page. The Telegram Mini App needs
   * it: a Telegram account with no student behind it must not inherit a
   * session another account left in the same WebView.
   */
  clearSession: () => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,

  setAuth: (user, accessToken, refreshToken) => {
    Cookies.set("token", accessToken, { expires: 1 / 24 }); // 1 soat
    Cookies.set("refreshToken", refreshToken, { expires: 1 }); // 24 soat
    Cookies.set("user", JSON.stringify(user), { expires: 1 }); // 24 soat
    localStorage.setItem("companyId", String(user.companyId));
    set({ user, token: accessToken });
  },

  clearSession: () => {
    Cookies.remove("token");
    Cookies.remove("refreshToken");
    Cookies.remove("user");
    localStorage.removeItem("companyId");
    localStorage.removeItem("branchId");
    set({ user: null, token: null });
  },

  logout: () => {
    get().clearSession();
    window.location.href = "/login";
  },

  hydrate: () => {
    const token = Cookies.get("token");
    const refreshToken = Cookies.get("refreshToken");
    const userStr = Cookies.get("user");
    if (userStr && (token || refreshToken)) {
      try {
        const user = JSON.parse(userStr);
        localStorage.setItem("companyId", String(user.companyId));
        set({ user, token: token || null });
      } catch {
        Cookies.remove("token");
        Cookies.remove("refreshToken");
        Cookies.remove("user");
      }
    }
  },
}));
