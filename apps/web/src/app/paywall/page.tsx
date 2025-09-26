/**
 * Paywall page - Stripe checkout for credits and subscriptions
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, CreditCard, Zap, Crown } from "lucide-react";
import { getNextStep, getStepRoute } from "@/config/flow.config";
import { api, makeAuthenticatedRequest, getCurrentUser } from "@/lib/api";
import Spinner from "@/components/ui/spinner";
import { toast } from "sonner";
import CreditsBadge from "@/components/credits-badge";

interface Plan {
  id: number;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  included_credits: number;
  overage_price_cents: number;
  currency: string;
  monthly_price_display: string;
  annual_price_display: string;
  stripe_monthly_price_id?: string | null;
  stripe_annual_price_id?: string | null;
}

interface PlansResponse {
  plans: Plan[];
  geo_group: string;
}

export default function PaywallPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("Starter");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [customUser, setCustomUser] = useState<any>(null);
  const [pendingCredit, setPendingCredit] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check for custom email auth
  useEffect(() => {
    const user = getCurrentUser();
    console.log("🔍 Custom user check:", user);
    setCustomUser(user);
  }, []);

  // Trigger plans reload when authentication state changes
  useEffect(() => {
    const user = getCurrentUser();
    if (user && !customUser) {
      setCustomUser(user);
    }
  }, [customUser]);

  useEffect(() => {
    // Get current match ID from session storage
    const matchId = sessionStorage.getItem("currentMatchId");
    setCurrentMatchId(matchId);

    const loadPlans = async () => {
      try {
        setIsLoadingPlans(true);
        
        // Check if user is authenticated via any method
        const currentUser = getCurrentUser();
        const isAuthenticated = session?.user || currentUser;
        
        console.log("🔍 Paywall auth check:", { 
          hasSession: !!session?.user, 
          hasCustomUser: !!currentUser, 
          isAuthenticated: !!isAuthenticated 
        });
        
        // Load real plans if authenticated, otherwise show demo plans
        if (!isAuthenticated) {
          const mockPlans: Plan[] = [
            {
              id: 1,
              name: "Starter",
              monthly_price_cents: 2900,
              annual_price_cents: 29000,
              included_credits: 50,
              overage_price_cents: 100,
              currency: "USD",
              monthly_price_display: "$29",
              annual_price_display: "$290"
            },
            {
              id: 2,
              name: "Pro",
              monthly_price_cents: 7900,
              annual_price_cents: 79000,
              included_credits: 200,
              overage_price_cents: 80,
              currency: "USD",
              monthly_price_display: "$79",
              annual_price_display: "$790"
            }
          ];
          
          setPlans(mockPlans);
          setIsLoadingPlans(false);
          return;
        }

        // Load actual plans from API
        console.log("📋 Loading real Stripe plans...");
        const response: PlansResponse = await makeAuthenticatedRequest(() => api.payments.getPlans());
        console.log("✅ Loaded plans:", response.plans);
        setPlans(response.plans);
        
      } catch (err: any) {
        console.error("Failed to load plans:", err);
        setError(err.message);
        // Show mock plans on error
        const mockPlans: Plan[] = [
          {
            id: 1,
            name: "Starter",
            monthly_price_cents: 2900,
            annual_price_cents: 29000,
            included_credits: 50,
            overage_price_cents: 100,
            currency: "USD",
            monthly_price_display: "$29",
            annual_price_display: "$290"
          },
          {
            id: 2,
            name: "Pro",
            monthly_price_cents: 7900,
            annual_price_cents: 79000,
            included_credits: 200,
            overage_price_cents: 80,
            currency: "USD",
            monthly_price_display: "$79",
            annual_price_display: "$790"
          }
        ];
        setPlans(mockPlans);
      } finally {
        setIsLoadingPlans(false);
      }
    };

    loadPlans();
  }, [session, customUser]);

  const handleSubscribe = async (planName: string) => {
    // Check both session and custom auth
    const currentUser = getCurrentUser();
    const isAuthenticated = session?.user || currentUser;
    const userEmail = session?.user?.email || currentUser?.email || undefined;

    const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "https://viqi-prototype-web.vercel.app";
    const normalizedOrigin = origin.replace(/\/$/, "");
    const successUrl = `${normalizedOrigin}/reveal`;
    const cancelUrl = `${normalizedOrigin}/paywall`;

    console.log("🛒 Subscribe attempt:", {
      planName,
      hasSession: !!session?.user,
      hasCustomAuth: !!currentUser,
      isAuthenticated: !!isAuthenticated,
      userEmail
    });
    
    if (!isAuthenticated) {
      toast.error("Please sign in to continue", {
        description: "Authentication is required to purchase a subscription."
      });
      setPendingCredit(null);
      router.push("/auth/signin");
      return;
    }

    if (!userEmail) {
      toast.error("Email required", {
        description: "We couldn't detect your email. Please sign in again."
      });
      router.push("/auth/signin");
      return;
    }

    setPendingCredit(null);
    setIsLoading(true);
    setSelectedPlan(planName);

    const plan = plans.find((item) => item.name === planName);
    const priceId = plan
      ? billingCycle === "annual"
        ? plan.stripe_annual_price_id
        : plan.stripe_monthly_price_id
      : null;

    if (!plan || !priceId) {
      console.warn("⚠️ No Stripe price configured for plan", { planName, billingCycle });
      toast.error("Plan configuration missing", {
        description: "Stripe price not configured for this plan. Please contact support."
      });
      setIsLoading(false);
      return;
    }

    let redirected = false;

    try {
      const response = await makeAuthenticatedRequest(() =>
        api.payments.createCheckout({
          plan_name: planName,
          billing_cycle: billingCycle,
          price_id: priceId,
          customer_email: userEmail,
          success_url: successUrl,
          cancel_url: cancelUrl
        })
      );

      sessionStorage.setItem("stripeCheckoutEmail", userEmail);
      sessionStorage.setItem("stripeCheckoutPlan", `${planName}_${billingCycle}`);
      sessionStorage.setItem("stripeCheckoutOrigin", normalizedOrigin);

      // Redirect to Stripe checkout
      if (response.checkout_url) {
        redirected = true;
        window.location.href = response.checkout_url;
      } else {
        throw new Error("No checkout URL received");
      }

    } catch (err: any) {
      console.error("Checkout failed:", err);
      toast.error("Checkout failed", {
        description: err.message || "Please try again or contact support."
      });
    } finally {
      if (!redirected && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleCreditPurchase = async (credits: number) => {
    // Check both session and custom auth
    const currentUser = getCurrentUser();
    const isAuthenticated = session?.user || currentUser;
    const userEmail = session?.user?.email || currentUser?.email || undefined;

    if (!isAuthenticated) {
      toast.error("Please sign in to continue");
      setPendingCredit(null);
      router.push("/auth/signin");
      return;
    }
    
    console.log("💳 Starting payment with auth:", {
      hasSession: !!session?.user,
      hasCustomAuth: !!currentUser,
      userEmail
    });

    setPendingCredit(credits);
    setIsLoading(true);

    let redirected = false;

    try {
      const response = await makeAuthenticatedRequest(() =>
        api.payments.purchaseCredits({
          credits,
          match_id: currentMatchId ? parseInt(currentMatchId) : undefined
        })
      );

      if (userEmail) {
        sessionStorage.setItem("stripeCheckoutEmail", userEmail);
      }

      if (response.checkout_url) {
        redirected = true;
        window.location.href = response.checkout_url;
      } else {
        throw new Error("No checkout URL received");
      }

    } catch (err: any) {
      console.error("Credit purchase failed:", err);
      toast.error("Purchase failed", {
        description: err.message || "Please try again or contact support."
      });
    } finally {
      if (!redirected && isMountedRef.current) {
        setIsLoading(false);
        setPendingCredit(null);
      }
    }
  };

  const handleDemo = () => {
    // For demo purposes, simulate payment success
    toast.success("Demo payment successful!", {
      description: "Redirecting to reveal page..."
    });
    
    setTimeout(() => {
      const nextStep = getNextStep("paywall");
      if (nextStep) {
        router.push(getStepRoute(nextStep));
      }
    }, 1500);
  };

  const creditOptions = [
    { credits: 1, label: "1 Credit - $1.00" },
    { credits: 5, label: "5 Credits - $4.50" },
    { credits: 10, label: "10 Credits - $8.50" },
  ];

  if (isLoadingPlans) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020710] px-6 text-white">
        <Image
          src="/bg-top.png"
          alt="Background glow"
          fill
          priority
          className="pointer-events-none select-none object-cover opacity-60"
        />
        <Image
          src="/bg-gradient-shape.png"
          alt="Background gradient"
          width={720}
          height={720}
          priority
          className="pointer-events-none select-none absolute right-[-6rem] top-[-6rem] h-[720px] w-[720px] opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/70 p-8 text-center shadow-[0_0_22px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5">
            <div className="size-6 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
          </div>
          <p className="text-sm text-white/70">Loading pricing plans…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020710] text-white">
      <Image
        src="/bg-top.png"
        alt="Background glow"
        fill
        priority
        className="pointer-events-none select-none object-cover opacity-60"
      />
      <Image
        src="/bg-gradient-shape.png"
        alt="Background gradient"
        width={720}
        height={720}
        priority
        className="pointer-events-none select-none absolute left-[-6rem] top-[-6rem] h-[720px] w-[720px] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div className="relative h-9 w-28">
              <Image src="/logo-ViQi-light.png" alt="ViQi" fill priority className="object-contain" />
            </div>
            <Badge className="bg-white/10 text-xs font-medium text-white/80">Step 4 of 5</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <CreditsBadge />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            <Crown className="w-4 h-4" />
            <span>Unlock full access</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold md:text-4xl">Choose your plan</h1>
          <p className="mt-2 text-sm text-white/60 md:text-base">
            Get personalised matches with full contact details and AI-generated outreach emails tailored to your company.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 p-1 text-xs font-semibold text-white/70">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-5 py-2 transition duration-150 ${
                billingCycle === "monthly"
                  ? "bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.2)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`rounded-full px-5 py-2 transition duration-150 ${
                billingCycle === "annual"
                  ? "bg-white text-black shadow-[0_0_18px_rgba(46,138,229,0.35)]"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Annual
              <Badge className="ml-2 bg-white/10 text-[10px] uppercase tracking-[0.3em] text-white/70">
                Save 17%
              </Badge>
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {plans.map((plan) => {
            const price = billingCycle === "monthly" ? plan.monthly_price_display : plan.annual_price_display;
            const pricePerMonth =
              billingCycle === "annual"
                ? Math.round(plan.annual_price_cents / 12 / 100)
                : plan.monthly_price_cents / 100;
            const isPopular = plan.name === "Pro";

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:shadow-[0_25px_50px_-12px_rgba(15,23,42,0.6)] ${
                  isPopular ? "border-[#2E8AE5] shadow-[0_0_35px_rgba(46,138,229,0.35)] scale-[1.01]" : ""
                }`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[rgba(46,138,229,0.9)] text-[10px] font-semibold uppercase tracking-[0.3em] text-white">
                    Most Popular
                  </Badge>
                )}

                <div className="flex items-center gap-3 text-sm text-white/70">
                  {plan.name === "Starter" ? (
                    <Zap className="w-5 h-5 text-emerald-300" />
                  ) : (
                    <Crown className="w-5 h-5 text-[#d7b3ff]" />
                  )}
                  <span className="text-base font-semibold text-white">{plan.name}</span>
                </div>

                <div className="mt-6 text-white">
                  <span className="text-4xl font-semibold">{price}</span>
                  <span className="ml-2 text-sm text-white/60">
                    {billingCycle === "annual" ? "/year" : "/month"}
                  </span>
                  {billingCycle === "annual" && (
                    <div className="mt-1 text-xs text-white/50">${pricePerMonth}/month billed annually</div>
                  )}
                </div>

                <ul className="mt-6 space-y-3 text-sm text-white/70">
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>{plan.included_credits} credits included</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>AI-powered matching</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Personalised outreach drafts</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Full contact details</span>
                  </li>
                  {plan.name === "Pro" && (
                    <>
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>Priority matching & support</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-emerald-300" />
                        <span>Advanced analytics dashboard</span>
                      </li>
                    </>
                  )}
                </ul>

                <Button
                  onClick={() => handleSubscribe(plan.name)}
                  disabled={isLoading && selectedPlan === plan.name}
                  className={`mt-6 w-full rounded-full border-[3px] border-white/10 px-6 py-3 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5 active:scale-95 ${
                    isPopular
                      ? "bg-[radial-gradient(253.12%_50%_at_50%_50%,#2E8AE5_0%,#0068D0_70%)] text-white shadow-[0_0_25px_5px_rgba(6,110,214,0.2)]"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {isLoading && selectedPlan === plan.name ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner className="text-white" />
                      <span>Processing…</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      <span>Choose {plan.name}</span>
                    </span>
                  )}
                </Button>

                <p className="mt-3 text-center text-[11px] text-white/40">
                  Additional credits ${(plan.overage_price_cents / 100).toFixed(2)} each
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 backdrop-blur-lg">
          <h3 className="text-center text-base font-semibold text-white">Just need credits for this match?</h3>
          <p className="mt-2 text-center text-xs text-white/50">Purchase one-off credits without a subscription.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {creditOptions.map(({ credits, label }) => (
              <Button
                key={credits}
                onClick={() => handleCreditPurchase(credits)}
                variant="ghost"
                disabled={isLoading}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/15"
              >
                {isLoading && pendingCredit === credits ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="text-white" />
                    <span>Processing…</span>
                  </span>
                ) : (
                  label
                )}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-amber-300/30 bg-amber-500/10 p-6 text-center text-sm text-amber-100 backdrop-blur-lg">
          <h3 className="text-base font-semibold text-amber-100">Demo mode</h3>
          <p className="mt-2 text-xs text-amber-200">Skip payment and continue exploring the flow.</p>
          <Button
            onClick={handleDemo}
            variant="ghost"
            className="mt-4 rounded-full border border-amber-200/40 bg-amber-200/20 px-4 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-200/30"
          >
            Continue demo (no payment)
          </Button>
        </div>

        <div className="mt-12 text-center text-[11px] text-white/40">
          <p>💳 Secure payments powered by Stripe</p>
          <p className="mt-1">✨ Cancel anytime • 30-day money-back guarantee</p>
        </div>
      </main>
    </div>
  );
}
