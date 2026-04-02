import { create } from "zustand";
import Cookies from "js-cookie";

interface UserRole {
  id: number;
  name: string;
}

interface UserBranch {
  id: number;
  name: string;
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
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,

  setAuth: (user, accessToken, refreshToken) => {
    Cookies.set("token", accessToken, { expires: 1 / 24 }); // 1 soat
    Cookies.set("refreshToken", refreshToken, { expires: 1 }); // 24 soat
    Cookies.set("user", JSON.stringify(user), { expires: 1 }); // 24 soat
    localStorage.setItem("companyId", String(user.companyId));
    set({ user, token: accessToken });
  },

  logout: () => {
    Cookies.remove("token");
    Cookies.remove("refreshToken");
    Cookies.remove("user");
    localStorage.removeItem("companyId");
    localStorage.removeItem("branchId");
    set({ user: null, token: null });
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
