/**
 * API configuration for ViQi frontend
 */

export const apiConfig = {
  // Base API URL - will be set from environment
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000",
  
  // API endpoints
  endpoints: {
    auth: {
      register: "/api/auth/register",
      verify: "/api/auth/verify-token",
      me: "/api/auth/me"
    },
    matching: {
      match: "/api/matching/match",
      reveal: "/api/matching/reveal",
      history: "/api/matching/history"
    },
    payments: {
      plans: "/api/payments/plans",
      checkout: "/api/payments/checkout",
      purchaseCredits: "/api/payments/purchase-credits",
      history: "/api/payments/history"
    },
    users: {
      dashboard: "/api/users/me/dashboard",
      usage: "/api/users/me/usage",
      adjustCredits: "/api/users/me/credits/adjust"
    }
  },
  
  // Request configuration
  timeout: 30000, // 30 seconds
  retries: 3,
  
  // Debug mode
  debug: process.env.NODE_ENV === "development"
} as const;

export const getApiUrl = (endpoint: string): string => {
  return `${apiConfig.baseURL}${endpoint}`;
};

// Helper to build nested endpoint paths
export const getEndpoint = (
  category: keyof typeof apiConfig.endpoints,
  endpoint: string
): string => {
  const categoryEndpoints = apiConfig.endpoints[category] as Record<string, string>;
  return categoryEndpoints[endpoint] || "";
};

export default apiConfig;
