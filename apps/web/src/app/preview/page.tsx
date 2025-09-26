/**
 * Preview page - Shows masked match results before payment
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Eye, EyeOff, ThumbsUp, ThumbsDown, CreditCard, Loader2 } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, getCurrentUser } from "@/lib/api";
import Spinner from "@/components/ui/spinner";
import { toast } from "sonner";
import CreditsBadge from "@/components/credits-badge";
import { cn } from "@/lib/utils";

interface MatchPreview {
  id: number;
  name: string;
  title: string;
  company_name: string;
  company_blurred: boolean;
  email_masked: string;
  email_plain?: string;
  raw_email?: string;
  reason: string;
  email_draft_blurred: boolean;
  score: number;
}

interface MatchResponse {
  match_id: number;
  results: MatchPreview[];
  credit_cost: number;
  token_usage: {
    prompt: number;
    completion: number;
    total: number;
  };
  status: string;
  credits_charged?: number | null;
  credit_summary?: {
    included_credits?: number;
    remaining_credits?: number;
    projected_remaining_credits?: number;
    pending_credits?: number;
  } | null;
}

export default function PreviewPage() {
  const [matches, setMatches] = useState<MatchPreview[]>([]);
  const [matchData, setMatchData] = useState<MatchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customUser, setCustomUser] = useState<any>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const isMountedRef = useRef(true);

  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check for custom email auth
  useEffect(() => {
    const user = getCurrentUser();
    setCustomUser(user);
  }, []);

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('customAuth');
    } catch (err) {
      console.warn('Failed to remove customAuth from localStorage', err);
    }

    try {
      sessionStorage.removeItem('userEmail');
      sessionStorage.removeItem('backendToken');
      sessionStorage.removeItem('businessDomain');
      sessionStorage.removeItem('creditSummary');
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("viqi:sign-out"));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("viqi:sign-out"));
      }
    } catch (err) {
      console.warn('Failed to remove session auth keys', err);
    }

    setCustomUser(null);

    if (session?.user) {
      await signOut({ callbackUrl: '/' });
    } else {
      router.push('/');
    }
  };

  useEffect(() => {
    const loadMatches = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if we have stored match results from processing
        const storedResults = sessionStorage.getItem("matchResults");
        
        if (!storedResults) {
          // No stored results, redirect back to start the flow
          toast.error("No match results found. Please start a new search.");
          router.push("/");
          return;
        }

        // Parse stored results
        const matchResponse: MatchResponse = JSON.parse(storedResults);
        console.log("📋 Loaded stored match results:", matchResponse);

        // POC: No authentication required - just show the results

        // Set the match data
        setMatchData(matchResponse);
        setMatches(matchResponse.results);

        if (matchResponse.credit_summary) {
          sessionStorage.setItem("creditSummary", JSON.stringify(matchResponse.credit_summary));
          window.dispatchEvent(new Event("viqi:credits-updated"));
        }
        
        console.log("✅ Preview loaded with", matchResponse.results.length, "matches");

      } catch (err: any) {
        console.error("Failed to load matches:", err);
        setError(err.message || "Failed to load matches");
        toast.error("Failed to load matches", {
          description: "Please try again or contact support if the issue persists."
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadMatches();
  }, [session, status, router]);

  const handleContinue = async () => {
    if (isCheckingAccess) {
      return;
    }

    const currentUser = getCurrentUser();
    const userEmail = session?.user?.email || currentUser?.email;

    if (!userEmail) {
      toast.error("Please sign in to continue");
      router.push("/auth/signin");
      return;
    }

    setIsCheckingAccess(true);
    let redirected = false;

    try {
      console.log("🔍 Checking subscription status...", { userEmail });

      const subscriptionResponse = await api.users
        .getSubscription(userEmail)
        .then((r) => r.data);

      console.log("📊 Subscription status:", subscriptionResponse);

      if (subscriptionResponse.access?.has_credits_or_subscription) {
        console.log("✅ User has access - revealing matches");
        toast.success("Access granted! Revealing your matches...");
        router.push(getStepRoute("reveal"));
        redirected = true;
      } else {
        console.log("🔒 User needs to purchase - redirecting to paywall");
        toast.info("Upgrade required to see full contact details");
        router.push(getStepRoute("paywall"));
        redirected = true;
      }
    } catch (error) {
      console.error("❌ Failed to check subscription:", error);
      console.log("🔄 Fallback: redirecting to paywall");
      router.push(getStepRoute("paywall"));
      redirected = true;
    } finally {
      if (!redirected && isMountedRef.current) {
        setIsCheckingAccess(false);
      }
    }
  };

  const handleFeedback = (matchId: number, positive: boolean) => {
    toast.success(positive ? "Thanks for the positive feedback!" : "Thanks for the feedback!", {
      description: "We'll use this to improve future matches."
    });
  };

  if (isLoading) {
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
          className="pointer-events-none select-none absolute -right-24 top-[-6rem] h-[720px] w-[720px] opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

        <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-28">
                <Image src="/logo-ViQi-light.png" alt="ViQi" fill priority className="object-contain" />
              </div>
              <Badge className="bg-white/10 text-xs font-medium text-white/80">Step 3 of 5</Badge>
            </div>
            <CreditsBadge />
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-16">
          <div className="w-full rounded-[32px] border border-white/10 bg-black/70 p-10 shadow-[0_0_22px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6 flex size-16 items-center justify-center rounded-full border border-white/15 bg-white/10">
                <Loader2 className="size-8 animate-spin text-[#76B8FF]" />
              </div>
              <h1 className="text-2xl font-semibold text-white">Finding your matches…</h1>
              <p className="mt-2 max-w-md text-sm text-white/60">
                Analysing your request and matching you with industry professionals tailored to your query.
              </p>
            </div>

            <div className="mt-10 grid gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-lg"
                >
                  <Skeleton className="size-12 rounded-full bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4 bg-white/10" />
                    <Skeleton className="h-3 w-1/3 bg-white/5" />
                    <Skeleton className="h-3 w-2/3 bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 mb-4">⚠️</div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/intent")}>Try Again</Button>
          </CardContent>
        </Card>
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
        className="pointer-events-none select-none absolute -left-32 top-[-6rem] h-[720px] w-[720px] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="relative h-9 w-28">
              <Image src="/logo-ViQi-light.png" alt="ViQi" fill priority className="object-contain" />
            </div>
            <Badge className="bg-white/10 text-xs font-medium text-white/80">Step 3 of 5</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <CreditsBadge />
            {(session?.user || customUser) ? (
              <>
                <span className="hidden text-white/80 md:inline">
                  Hi, {session?.user?.name?.split(" ")[0] || customUser?.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Sign Out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col px-6 py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            <span>✨ {matches.length} matches found</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold md:text-4xl">Here are your potential matches</h1>
          <p className="mt-2 text-sm text-white/60 md:text-base">
            Preview connections based on your request. Unlock full details to reach out instantly.
          </p>
        </div>

        {matchData?.credit_summary && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 backdrop-blur-lg">
            <p className="font-semibold text-white">
              Credits used for this query: {matchData.credits_charged ?? matchData.credit_cost ?? 0}
            </p>
            <p className="mt-1">
              Remaining balance: {matchData.credit_summary?.projected_remaining_credits ?? matchData.credit_summary?.remaining_credits ?? 0} / {matchData.credit_summary?.included_credits ?? 0}
            </p>
          </div>
        )}

        <div className="mt-12 grid gap-6">
          {matches.map((match, index) => (
            <div
              key={`match-${match.id}-${index}`}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg transition duration-200 hover:-translate-y-1 hover:shadow-[0_25px_50px_-12px_rgba(15,23,42,0.6)]"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:space-x-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-[#76B8FF] to-[#2E8AE5] text-base font-semibold">
                  {match.email_plain ? match.name.charAt(0) : "?"}
                </div>
                <div className="flex-1 space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3
                        className={cn(
                          "text-lg font-semibold text-white",
                          !match.email_plain && "blur-sm select-none text-white/60"
                        )}
                      >
                        {match.name}
                      </h3>
                      <p className="text-white/60">{match.title}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                        <span className="blur-sm select-none">{match.company_name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/15"
                          onClick={handleContinue}
                          disabled={isCheckingAccess}
                        >
                          {isCheckingAccess ? (
                            <span className="flex items-center gap-2 text-white/60">
                              <Spinner className="h-3 w-3" />
                              Checking…
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <EyeOff className="w-3 h-3" />
                              Unlock to see
                            </span>
                          )}
                        </Button>
                      </div>
                    </div>
                    <Badge className="bg-white/10 text-xs font-medium text-green-300">
                      {Math.round(match.score * 100)}% match
                    </Badge>
                  </div>

                  <p className="text-sm leading-relaxed text-white/70">{match.reason}</p>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
                      <span className="font-semibold uppercase tracking-[0.25em] text-white/60">
                        Email draft ready
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/15"
                        onClick={handleContinue}
                        disabled={isCheckingAccess}
                      >
                        {isCheckingAccess ? (
                          <span className="flex items-center gap-2 text-white/60">
                            <Spinner className="h-3 w-3" />
                            Loading…
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            Preview
                          </span>
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-white/30 blur-sm select-none">
                      Hi {match.name}, I found your profile and believe you might be interested in collaborating on my upcoming project...
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span>Contact:</span>
                      <code className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                        {match.email_masked}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 text-white/50">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleFeedback(match.id, true)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60 transition hover:bg-white/15"
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleFeedback(match.id, false)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60 transition hover:bg-white/15"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70 backdrop-blur-lg">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="text-2xl font-semibold text-white">{matches.length}</div>
              <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/50">Quality matches</p>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{matchData?.credit_cost || 1}</div>
              <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/50">Credits needed</p>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{matchData?.token_usage.total || 1270}</div>
              <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/50">AI tokens</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="max-w-lg text-sm text-white/60">
              Unlock full profiles, contact details, and personalised outreach emails tailored to your company.
            </p>
            <Button
              onClick={handleContinue}
              size="lg"
              disabled={isCheckingAccess}
              className="rounded-full border-[3px] border-white/10 bg-[radial-gradient(253.12%_50%_at_50%_50%,#2E8AE5_0%,#0068D0_70%)] px-8 py-4 text-sm font-semibold text-white shadow-[0_0_25px_5px_rgba(6,110,214,0.10)] transition hover:shadow-[0_0_35px_10px_rgba(6,110,214,0.2)]"
            >
              {isCheckingAccess ? (
                <span className="flex items-center gap-3">
                  <Spinner size="sm" className="text-white" />
                  Processing…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Unlock full access
                </span>
              )}
            </Button>
            <p className="text-[11px] text-white/40">
              Starting at $29/month · Cancel anytime · Money-back guarantee
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
