/**
 * API utility functions for ViQi frontend
 */
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { getSession } from "next-auth/react";
import { apiConfig, getApiUrl } from "@/config/api.config";

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    console.log(`🔗 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    try {
      // First check for custom email auth
      const customAuth = localStorage.getItem('customAuth');
      if (customAuth) {
        try {
          const auth = JSON.parse(customAuth);
          if (auth.backendToken) {
            config.headers.Authorization = `Bearer ${auth.backendToken}`;
            console.log("🔑 Added custom email auth token to request");
            return config;
          }
        } catch (e) {
          console.error("Failed to parse custom auth:", e);
        }
      }
      
      // Fallback to sessionStorage
      const backendToken = sessionStorage.getItem('backendToken');
      if (backendToken) {
        config.headers.Authorization = `Bearer ${backendToken}`;
        console.log("🔑 Added sessionStorage auth token to request");
        return config;
      }
      
      // Finally check NextAuth session
      const session = await getSession();
      if (session && (session as any).backendToken) {
        config.headers.Authorization = `Bearer ${(session as any).backendToken}`;
        console.log("🔑 Added NextAuth token to request");
      }
    } catch (error) {
      console.warn("⚠️ Failed to get auth token for API request:", error);
    }
    
    return config;
  },
  (error) => {
    console.error("❌ Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      console.warn("🔒 Unauthorized - authentication expired or invalid");
      
      // Clear any stored auth data that might be stale
      localStorage.removeItem('customAuth');
      sessionStorage.removeItem('backendToken');
      
      // Create a more helpful error message
      const errorMessage = error.response?.data?.detail || "Authentication required";
      error.userFriendlyMessage = errorMessage.includes("expired") 
        ? "Your session has expired. Please sign in again."
        : "Authentication required. Please sign in to continue.";
    }
    
    return Promise.reject(error);
  }
);

// API functions
export const api = {
  // Authentication
  auth: {
    register: (data: { email: string; name?: string; auth_provider: string }) =>
      apiClient.post("/api/auth/register", data),
    
    verifyToken: () =>
      apiClient.post("/api/auth/verify-token"),
    
    refreshToken: () =>
      apiClient.post("/api/auth/refresh"),
    
    getMe: () =>
      apiClient.get("/api/auth/me"),
  },

  // Matching
  matching: {
    createMatch: (data: { query: string; max_results?: number }) =>
      apiClient.post("/api/matching/match", data),
    
    revealMatch: (matchId: number) =>
      apiClient.post(`/api/matching/reveal/${matchId}`),
    
    getHistory: () =>
      apiClient.get("/api/matching/history"),
  },

  // Matching POC (no auth required; email-only session)
  matchingPoc: {
    createMatch: (data: { query: string; user_email: string; max_results?: number }) =>
      apiClient.post("/api/matching-poc/match", data),
  },

  // Payments
  payments: {
    getPlans: () =>
      apiClient.get("/api/payments/plans"),
    
    createCheckout: (data: {
      plan_name: string;
      billing_cycle: string;
      geo_group?: string;
      price_id?: string;
      success_url?: string;
      cancel_url?: string;
      customer_email?: string;
    }) =>
      apiClient.post("/api/payments/checkout", data),
    
    purchaseCredits: (data: { credits: number; match_id?: number }) =>
      apiClient.post("/api/payments/purchase-credits", data),
    
    verifyPayment: (sessionId: string, data?: { customer_email?: string }) =>
      apiClient.post(`/api/payments/verify/${sessionId}`, data),
    
    getHistory: () =>
      apiClient.get("/api/payments/history"),
  },

  // Users
  users: {
    getDashboard: () =>
      apiClient.get("/api/users/me/dashboard"),
    
    getUsage: () =>
      apiClient.get("/api/users/me/usage"),
    
    adjustCredits: (credits: number) =>
      apiClient.post("/api/users/me/credits/adjust", { credits }),

    getSubscription: (email?: string) => {
      const config: AxiosRequestConfig = {};
      if (email) {
        config.params = { email };
        config.headers = {
          ...(config.headers ?? {}),
          "x-user-email": email,
        } as AxiosRequestConfig["headers"];
      }
      return apiClient.get("/api/users/me/subscription", config);
    },
  },
};

// Helper function for making authenticated requests
export const makeAuthenticatedRequest = async <T = any>(
  requestFn: () => Promise<{ data: T }>
): Promise<T> => {
  try {
    const response = await requestFn();
    return response.data;
  } catch (error: any) {
    console.error("Authenticated request failed:", error);
    
    if (error.response?.status === 401) {
      throw new Error("Authentication required");
    }
    
    throw new Error(error.response?.data?.detail || error.message || "Request failed");
  }
};

/**
 * Gets the current user info from either auth system
 */
export function getCurrentUser() {
  // Try to get custom email auth from localStorage first (most persistent)
  const customAuth = localStorage.getItem('customAuth');
  if (customAuth) {
    try {
      const auth = JSON.parse(customAuth);
      return {
        email: auth.email,
        name: auth.name || auth.email.split('@')[0],
        company: auth.company,
        backendToken: auth.backendToken,
        authType: 'email'
      };
    } catch (e) {
      console.error("Failed to parse custom auth:", e);
    }
  }
  
  // Fallback to sessionStorage with detailed logging
  const userEmail = sessionStorage.getItem('userEmail');
  const backendToken = sessionStorage.getItem('backendToken');
  
  console.log("🔍 Checking sessionStorage:", {
    userEmail: !!userEmail,
    backendToken: !!backendToken,
    emailValue: userEmail,
    tokenLength: backendToken?.length
  });
  
  if (userEmail && backendToken) {
    console.log("✅ Found auth in sessionStorage");
    return {
      email: userEmail,
      name: userEmail.split('@')[0],
      company: sessionStorage.getItem('businessDomain') || null,
      backendToken,
      authType: 'email'
    };
  }
  
  // Check for any customAuth in sessionStorage as backup
  const sessionAuth = sessionStorage.getItem('customAuth');
  if (sessionAuth) {
    try {
      const parsed = JSON.parse(sessionAuth);
      console.log("🔍 Found customAuth in sessionStorage:", {
        hasEmail: !!parsed.email,
        hasToken: !!parsed.backendToken
      });
      if (parsed.email && parsed.backendToken) {
        return parsed;
      }
    } catch (e) {
      console.error("❌ Failed to parse sessionAuth:", e);
    }
  }
  
  console.log("❌ No authentication found anywhere");
  return null;
}

export default apiClient;
