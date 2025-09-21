/**
 * Flow configuration for ViQi application
 * This config allows reordering SSO and paywall steps as requested
 */

export const flowConfig = {
  // Updated flow: Landing → SSO → Processing (OpenAI API) → Preview → Paywall → Reveal
  steps: [
    "landing",           // Hero page with "What are you looking for?"
    "intent",            // Optional intent refinement step (enabled by feature flag)
    "sso_optional",      // Google/LinkedIn SSO (required after query)
    "processing",        // OpenAI API call + progress indicator
    "preview",           // Masked matches + blurred email drafts
    "paywall",           // Stripe Checkout (required to unlock)
    "reveal",            // Full details + copy/send buttons
    "dashboard"          // History, credits, usage stats
  ] as const,

  // Feature toggles
  features: {
    requireSSOBeforeReveal: true,
    allowIntentBeforeSSO: true,
    requirePaymentBeforeReveal: true,
    showCompanyMasking: true,
    enableEmailDraftBlur: true
  },

  // Free usage limits
  usage: {
    freePreviewCallsPerUser: 1,    // Changeable to 2, 3, etc.
    previewMatchCount: 4,          // Number of matches shown in preview
    revealMatchCount: 4,           // Number of matches after payment
    maxQueryLength: 500            // Max characters in user query
  },

  // UI Configuration
  ui: {
    showBrandName: "ViQi",
    theme: "modern",               // modern, classic
    colorScheme: "default",        // default, blue, purple
    showStepIndicator: true,       // Progress indicator
    enableAnimations: true
  }
} as const;

export type FlowStep = typeof flowConfig.steps[number];

export const getStepIndex = (step: FlowStep): number => {
  return flowConfig.steps.indexOf(step);
};

export const getNextStep = (currentStep: FlowStep): FlowStep | null => {
  const currentIndex = getStepIndex(currentStep);
  const nextIndex = currentIndex + 1;
  return nextIndex < flowConfig.steps.length ? flowConfig.steps[nextIndex] : null;
};

export const getPreviousStep = (currentStep: FlowStep): FlowStep | null => {
  const currentIndex = getStepIndex(currentStep);
  const prevIndex = currentIndex - 1;
  return prevIndex >= 0 ? flowConfig.steps[prevIndex] : null;
};

export const isStepEnabled = (step: FlowStep): boolean => {
  // Add logic here to conditionally enable/disable steps
  switch (step) {
    case "sso_optional":
      return true; // Always available but position configurable
    case "paywall":
      return flowConfig.features.requirePaymentBeforeReveal;
    default:
      return true;
  }
};

// Helper to get user-friendly step names
// Map flow steps to actual routes
export const getStepRoute = (step: FlowStep): string => {
  const stepRoutes: Record<FlowStep, string> = {
    landing: "/",
    intent: "/intent",
    sso_optional: "/auth/signin",
    processing: "/processing",
    preview: "/preview", 
    paywall: "/paywall",
    reveal: "/reveal",
    dashboard: "/dashboard"
  };
  return stepRoutes[step];
};

export const getStepDisplayName = (step: FlowStep): string => {
  const stepNames: Record<FlowStep, string> = {
    landing: "Welcome",
    intent: "Refine Intent",
    sso_optional: "Sign In",
    processing: "Finding Matches",
    preview: "Preview Matches", 
    paywall: "Choose Plan",
    reveal: "Connect & Send",
    dashboard: "Dashboard"
  };
  return stepNames[step];
};
