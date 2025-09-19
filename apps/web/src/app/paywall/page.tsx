/**
 * Paywall page - Stripe checkout for credits and subscriptions
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, CreditCard, Zap, Crown } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, makeAuthenticatedRequest, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";

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

  const { data: session } = useSession();
  const router = useRouter();

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
    
    console.log("🛒 Subscribe attempt:", {
      planName,
      hasSession: !!session?.user,
      hasCustomAuth: !!currentUser,
      isAuthenticated: !!isAuthenticated,
      userEmail: session?.user?.email || currentUser?.email
    });
    
    if (!isAuthenticated) {
      toast.error("Please sign in to continue", {
        description: "Authentication is required to purchase a subscription."
      });
      router.push("/auth/signin");
      return;
    }

    setIsLoading(true);
    setSelectedPlan(planName);

    try {
      const response = await makeAuthenticatedRequest(() => 
        api.payments.createCheckout({
          plan_name: planName,
          billing_cycle: billingCycle
        })
      );

      // Redirect to Stripe checkout
      if (response.checkout_url) {
        window.location.href = response.checkout_url;
      } else {
        throw new Error("No checkout URL received");
      }

    } catch (err: any) {
      console.error("Checkout failed:", err);
      toast.error("Checkout failed", {
        description: err.message || "Please try again or contact support."
      });
      setIsLoading(false);
    }
  };

  const handleCreditPurchase = async (credits: number) => {
    // Check both session and custom auth
    const currentUser = getCurrentUser();
    const isAuthenticated = session?.user || currentUser;
    
    if (!isAuthenticated) {
      toast.error("Please sign in to continue");
      router.push("/auth/signin");
      return;
    }
    
    console.log("💳 Starting payment with auth:", {
      hasSession: !!session?.user,
      hasCustomAuth: !!currentUser,
      userEmail: session?.user?.email || currentUser?.email
    });

    setIsLoading(true);

    try {
      const response = await makeAuthenticatedRequest(() =>
        api.payments.purchaseCredits({
          credits,
          match_id: currentMatchId ? parseInt(currentMatchId) : undefined
        })
      );

      if (response.checkout_url) {
        window.location.href = response.checkout_url;
      } else {
        throw new Error("No checkout URL received");
      }

    } catch (err: any) {
      console.error("Credit purchase failed:", err);
      toast.error("Purchase failed", {
        description: err.message || "Please try again or contact support."
      });
      setIsLoading(false);
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

  if (isLoadingPlans) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Loading pricing plans...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </Button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">V</span>
                </div>
                <span className="text-xl font-bold text-gray-900">ViQi AI</span>
              </div>
            </div>
            <Badge variant="secondary">Step 4 of 5</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-full mb-4">
              <Crown className="w-4 h-4" />
              <span className="text-sm font-medium">Unlock Full Access</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose your plan</h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get personalized matches with full contact details and AI-generated outreach emails
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "monthly"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingCycle === "annual"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Annual
                <Badge variant="secondary" className="ml-2 text-xs">
                  Save 17%
                </Badge>
              </button>
            </div>
          </div>

          {/* Plans */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {plans.map((plan) => {
              const price = billingCycle === "monthly" ? plan.monthly_price_display : plan.annual_price_display;
              const pricePerMonth = billingCycle === "annual" 
                ? Math.round(plan.annual_price_cents / 12 / 100)
                : plan.monthly_price_cents / 100;
              const isPopular = plan.name === "Pro";

              return (
                <Card key={plan.id} className={`relative ${isPopular ? "border-blue-500 shadow-lg scale-105" : ""}`}>
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white">
                      Most Popular
                    </Badge>
                  )}
                  
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      {plan.name === "Starter" ? (
                        <Zap className="w-5 h-5 text-green-600" />
                      ) : (
                        <Crown className="w-5 h-5 text-purple-600" />
                      )}
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                    </div>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{price}</span>
                      <span className="text-gray-500">
                        {billingCycle === "annual" ? "/year" : "/month"}
                      </span>
                      {billingCycle === "annual" && (
                        <div className="text-sm text-gray-500">
                          ${pricePerMonth}/month billed annually
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      <li className="flex items-center space-x-3">
                        <Check className="w-4 h-4 text-green-600" />
                        <span>{plan.included_credits} credits included</span>
                      </li>
                      <li className="flex items-center space-x-3">
                        <Check className="w-4 h-4 text-green-600" />
                        <span>AI-powered matching</span>
                      </li>
                      <li className="flex items-center space-x-3">
                        <Check className="w-4 h-4 text-green-600" />
                        <span>Personalized email drafts</span>
                      </li>
                      <li className="flex items-center space-x-3">
                        <Check className="w-4 h-4 text-green-600" />
                        <span>Full contact details</span>
                      </li>
                      {plan.name === "Pro" && (
                        <>
                          <li className="flex items-center space-x-3">
                            <Check className="w-4 h-4 text-green-600" />
                            <span>Priority matching</span>
                          </li>
                          <li className="flex items-center space-x-3">
                            <Check className="w-4 h-4 text-green-600" />
                            <span>Advanced analytics</span>
                          </li>
                        </>
                      )}
                    </ul>

                    <Button
                      onClick={() => handleSubscribe(plan.name)}
                      disabled={isLoading && selectedPlan === plan.name}
                      className={`w-full ${
                        isPopular 
                          ? "bg-blue-600 hover:bg-blue-700 text-white" 
                          : "bg-gray-900 hover:bg-gray-800 text-white"
                      }`}
                      size="lg"
                    >
                      {isLoading && selectedPlan === plan.name ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Processing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <CreditCard className="w-4 h-4" />
                          <span>Choose {plan.name}</span>
                        </div>
                      )}
                    </Button>

                    <p className="text-xs text-center text-gray-500 mt-2">
                      Additional credits: ${(plan.overage_price_cents / 100).toFixed(2)} each
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* One-time Credits */}
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader>
              <CardTitle className="text-center">Just need credits for this match?</CardTitle>
              <p className="text-center text-gray-600">Purchase credits without a subscription</p>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center space-x-4">
                <Button
                  onClick={() => handleCreditPurchase(1)}
                  variant="outline"
                  disabled={isLoading}
                >
                  1 Credit - $1.00
                </Button>
                <Button
                  onClick={() => handleCreditPurchase(5)}
                  variant="outline"
                  disabled={isLoading}
                >
                  5 Credits - $4.50
                </Button>
                <Button
                  onClick={() => handleCreditPurchase(10)}
                  variant="outline"
                  disabled={isLoading}
                >
                  10 Credits - $8.50
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Demo Section */}
          <div className="text-center mt-8">
            <Separator className="mb-6" />
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
              <h3 className="font-semibold text-yellow-800 mb-2">🚀 Demo Mode</h3>
              <p className="text-sm text-yellow-700 mb-3">
                Skip payment for demonstration purposes
              </p>
              <Button
                onClick={handleDemo}
                variant="outline"
                className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
              >
                Continue Demo (No Payment)
              </Button>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-12 text-sm text-gray-500">
            <p>💳 Secure payments powered by Stripe</p>
            <p className="mt-1">✨ Cancel anytime • 30-day money-back guarantee</p>
          </div>
        </div>
      </main>
    </div>
  );
}
