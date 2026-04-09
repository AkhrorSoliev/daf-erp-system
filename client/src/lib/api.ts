import axios from "axios";
import Cookies from "js-cookie";
import { useAuth } from "@/hooks/use-auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error);
    } else {
      p.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Login/refresh so'rovlarida interceptor ishlamasin
    const isAuthRequest = originalRequest.url?.includes("/auth/");
    if (isAuthRequest) {
      return Promise.reject(error);
    }

    // 403 — ruxsat yo'q
    if (error.response?.status === 403) {
      const { default: toast } = await import("react-hot-toast");
      const msg = error.response?.data?.message;
      const message = Array.isArray(msg) ? msg[0] : msg;
      toast.error(message || "Sizga bu amalni bajarishga ruxsat yo'q");
      return Promise.reject(error);
    }

    // 401 va refresh qilish mumkin bo'lsa
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = Cookies.get("refreshToken");

      if (!refreshToken) {
        Cookies.remove("token");
        Cookies.remove("refreshToken");
        Cookies.remove("user");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Refresh jarayonida — navbatga qo'shish
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refreshToken },
        );

        const { accessToken, refreshToken: newRefreshToken, user } = res.data;

        // Cookie va Zustand store ni yangilash
        useAuth.getState().setAuth(user, accessToken, newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        Cookies.remove("token");
        Cookies.remove("refreshToken");
        Cookies.remove("user");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
