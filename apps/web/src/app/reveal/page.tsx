/**
 * Reveal page - POC version with no database calls
 */
"use client";

import { Suspense, useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Mail, CheckCircle, Building } from "lucide-react";
import { toast } from "sonner";
import { api, getCurrentUser } from "@/lib/api";
import CreditsBadge from "@/components/credits-badge";
import useCredits from "@/hooks/useCredits";

interface PersonRevealed {
  id: number;
  name: string;
  title: string;
  company_name: string;
  email: string;
  reason: string;
  email_draft: string;
  score: number;
}

function RevealLoading() {
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

      <div className="relative z-10 flex flex-col items-center gap-4 text-sm text-white/70">
        <div className="size-12 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
        <p>Loading your contacts…</p>
      </div>
    </div>
  );
}

function RevealContent() {
  const [matches, setMatches] = useState<PersonRevealed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmails, setCopiedEmails] = useState<Set<number>>(new Set());
  const [customUser, setCustomUser] = useState<any>(null);
  const [handledSessionId, setHandledSessionId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState<string | null>(null);

  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id") ?? null;
  const { creditSummary } = useCredits(false);

  useEffect(() => {
    setUserQuery(sessionStorage.getItem("userQuery"));
  }, []);

  const mapToRevealedMatches = (results: any[]): PersonRevealed[] =>
    results.map((result: any, index: number) => ({
      id: result.id ?? index + 1,
      name: result.name,
      title: result.title,
      company_name: result.company_name,
      email: result.email_plain || result.raw_email || result.email || "",
      reason: result.reason,
      email_draft: result.email_draft,
      score: result.score,
    }));

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCustomUser(user);
    }
  }, [status]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    const processReveal = async () => {
      setIsLoading(true);
      let determinedEmail = session?.user?.email || customUser?.email || sessionStorage.getItem("stripeCheckoutEmail") || undefined;
      let forceRefresh = false;

      if (sessionId && sessionId !== handledSessionId) {
        try {
          const verification = await api.payments.verifyPayment(sessionId, {
            customer_email: determinedEmail,
          }).then((r) => r.data);

          setHandledSessionId(sessionId);

          if (verification.customer_email) {
            determinedEmail = verification.customer_email;
            sessionStorage.setItem("stripeCheckoutEmail", verification.customer_email);
          }

          if (verification.success) {
            toast.success("Payment confirmed", {
              description: "Unlocking your connections now.",
            });
            forceRefresh = true;
            sessionStorage.setItem("lastStripeSessionId", sessionId);
          } else {
            toast.warning("Checkout not completed", {
              description: "You can retry the payment from the paywall.",
            });
          }
        } catch (err) {
          console.error("Failed to verify Stripe session", err);
          toast.error("Unable to verify payment", {
            description: "We couldn't confirm your payment. Please try again or contact support.",
          });
        } finally {
          router.replace("/reveal");
        }
      }

      await ensureMatches(determinedEmail, forceRefresh);
    };

    processReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.email, customUser?.email, sessionId]);

  const promoteStoredResultsToReveal = (storedResults: any, { showToast = false } = {}) => {
    if (!storedResults || !Array.isArray(storedResults.results)) {
      return false;
    }

    const promotedResults = storedResults.results.map((result: any) => ({
      ...result,
      email_plain: result.email_plain || result.raw_email || result.email,
    }));

    const payload = {
      ...storedResults,
      status: "revealed",
      results: promotedResults,
    };

    if (payload.credit_summary) {
      sessionStorage.setItem("creditSummary", JSON.stringify(payload.credit_summary));
      window.dispatchEvent(new Event("viqi:credits-updated"));
    }

    sessionStorage.setItem("matchResults", JSON.stringify(payload));
    setMatches(mapToRevealedMatches(promotedResults));
    setError(null);
    setIsLoading(false);

    if (showToast) {
      toast.success("Contacts revealed!", {
        description: `Found ${promotedResults.length} professional contacts for you.`,
      });
    }

    return true;
  };

  const ensureMatches = async (userEmail?: string | null, forceRefresh = false) => {
    const storedResultsRaw = sessionStorage.getItem("matchResults");

    if (!storedResultsRaw) {
      await refreshMatches(userEmail);
      return;
    }

    try {
      const storedResults = JSON.parse(storedResultsRaw);
      const canRevealLocally = Array.isArray(storedResults.results) && storedResults.results.length > 0;
      const hasRawEmails = canRevealLocally
        ? storedResults.results.some((result: any) => result.raw_email)
        : false;

      if (forceRefresh) {
        await refreshMatches(userEmail, {
          fallback: hasRawEmails ? storedResults : null,
          showToast: true,
        });
        return;
      }

      if (storedResults.status === "revealed" && canRevealLocally) {
        setMatches(mapToRevealedMatches(storedResults.results));
        setError(null);
        setIsLoading(false);
        return;
      }

      if (hasRawEmails && promoteStoredResultsToReveal(storedResults)) {
        return;
      }

      await refreshMatches(userEmail);
    } catch (err) {
      console.error("Failed to parse stored reveal results", err);
      await refreshMatches(userEmail);
    }
  };

  const refreshMatches = async (
    userEmail?: string | null,
    options?: { fallback?: any; showToast?: boolean }
  ) => {
    const resolvedEmail = userEmail || session?.user?.email || customUser?.email || sessionStorage.getItem("stripeCheckoutEmail") || undefined;
    const userQuery = sessionStorage.getItem("userQuery");

    if (!resolvedEmail) {
      setError("Missing email for reveal. Please sign in again.");
      toast.error("Sign-in required", {
        description: "We couldn't detect your email. Please sign in again to unlock results.",
      });
      setIsLoading(false);
      router.push("/auth/signin");
      return;
    }

    if (!userQuery) {
      setError("No search query found. Please start a new search.");
      toast.error("Start a new search", {
        description: "We couldn't find your original query. Redirecting you to begin again.",
      });
      setIsLoading(false);
      router.push("/");
      return;
    }

    try {
      console.log("🔄 Refreshing matches after payment", { resolvedEmail, userQuerySnippet: userQuery.slice(0, 40) });
      const refreshed = await api.matchingPoc.createMatch({
        query: userQuery,
        user_email: resolvedEmail,
        max_results: 4,
      }).then((r) => r.data);

      const pocResults = {
        match_id: Date.now(),
        results: refreshed.results,
        credit_cost: refreshed?.credits_charged ?? 0,
        token_usage: { prompt: 0, completion: 0, total: 0 },
        status: refreshed.revealed ? "revealed" : "preview",
        user_company: refreshed.user_company,
        credit_summary: refreshed.credit_summary ?? null,
        credits_charged: refreshed?.credits_charged ?? null,
      };

      sessionStorage.setItem("currentMatchId", pocResults.match_id.toString());
      sessionStorage.setItem("matchResults", JSON.stringify(pocResults));

      if (refreshed.credit_summary) {
        sessionStorage.setItem("creditSummary", JSON.stringify(refreshed.credit_summary));
        window.dispatchEvent(new Event("viqi:credits-updated"));
      }

      const revealedMatches = mapToRevealedMatches(pocResults.results);
      setMatches(revealedMatches);
      setError(null);

      if (refreshed.revealed) {
        toast.success("Contacts revealed!", {
          description: `Found ${revealedMatches.length} professional contacts for you.`,
        });
      } else {
        toast.info("Preview updated", {
          description: "You still need to complete payment to unlock full details.",
        });
      }

      if (refreshed.credits_charged) {
        toast.success(`Used ${refreshed.credits_charged} credits`, {
          description: refreshed.credit_summary
            ? `Updated balance: ${refreshed.credit_summary.projected_remaining_credits ?? refreshed.credit_summary.remaining_credits ?? 0} credits remaining`
            : undefined,
        });
      }
    } catch (err: any) {
      console.error("Failed to refresh matches after payment", err);
      setError(err.message || "Failed to load results");
      toast.error("Failed to load results", {
        description: "Please try again or contact support if the issue persists.",
      });

      if (options?.fallback) {
        promoteStoredResultsToReveal(options.fallback, { showToast: options?.showToast });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyEmailDraft = async (personId: number, emailDraft: string) => {
    try {
      await navigator.clipboard.writeText(emailDraft);
      setCopiedEmails(prev => new Set([...prev, personId]));
      toast.success("Email copied to clipboard!");
      
      // Reset copied state after 3 seconds
      setTimeout(() => {
        setCopiedEmails(prev => {
          const newSet = new Set(prev);
          newSet.delete(personId);
          return newSet;
        });
      }, 3000);
    } catch (err) {
      toast.error("Failed to copy email");
    }
  };

  const sendEmail = (email: string, name: string, draft: string) => {
    const subject = encodeURIComponent(`Collaboration Opportunity`);
    const body = encodeURIComponent(draft);
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, '_blank');
  };

  if (isLoading) {
    return <RevealLoading />;
  }

  if (error) {
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
          className="pointer-events-none select-none absolute left-[-6rem] top-[-6rem] h-[720px] w-[720px] opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-red-500/10 p-8 text-center shadow-[0_0_30px_rgba(229,57,53,0.2)] backdrop-blur-2xl">
          <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
          <p className="mt-3 text-sm text-white/70">{error}</p>
          <Button
            onClick={() => router.push("/")}
            variant="ghost"
            className="mt-6 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const greetingName = session?.user?.name?.split(" ")[0] || customUser?.name;

  const handleNewSearch = () => {
    sessionStorage.removeItem("userQuery");
    sessionStorage.removeItem("matchResults");
    sessionStorage.removeItem("currentMatchId");
    sessionStorage.removeItem("creditSummary");
    router.push("/");
  };

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
        className="pointer-events-none select-none absolute right-[-6rem] top-[-6rem] h-[720px] w-[720px] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewSearch}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Home</span>
            </Button>
            <div className="relative h-9 w-28">
              <Image src="/logo-ViQi-light.png" alt="ViQi" fill priority className="object-contain" />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            {greetingName ? <span className="text-white/80">Hi, {greetingName}</span> : null}
            <CreditsBadge />
            <Badge className="bg-emerald-500/10 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
              Revealed
            </Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 md:py-16">
        {userQuery ? (
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 backdrop-blur-lg md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Your question</p>
              <p className="mt-2 text-base text-white">{userQuery}</p>
            </div>
            <Button
              variant="ghost"
              onClick={handleNewSearch}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Search again
            </Button>
          </div>
        ) : null}

        {creditSummary ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70 backdrop-blur-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Credits overview</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-2xl font-semibold text-white">
                  {creditSummary.projected_remaining_credits ?? creditSummary.remaining_credits ?? 0}
                </div>
                <p className="text-xs text-white/50">Credits remaining</p>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">
                  {creditSummary.used_credits ?? 0}
                </div>
                <p className="text-xs text-white/50">Credits used</p>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">
                  {creditSummary.included_credits ?? 0}
                </div>
                <p className="text-xs text-white/50">Plan total</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:gap-6 md:grid-cols-2 md:mt-12">
          {matches.map((match) => (
            <div
              key={match.id}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg transition duration-200 hover:-translate-y-1 hover:shadow-[0_25px_50px_-12px_rgba(15,23,42,0.6)] sm:p-6"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{match.name}</h3>
                    <p className="text-sm text-white/60">{match.title}</p>
                    <div className="mt-3 flex items-center gap-2 text-base text-white/80">
                      <Building className="w-5 h-5" />
                      <span className="font-medium">{match.company_name}</span>
                    </div>
                  </div>
                  <Badge className="bg-white/10 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 self-start">
                    {Math.round(match.score * 100)}% match
                  </Badge>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  <p>{match.reason}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Contact</p>
                  <p className="mt-2 font-mono text-sm text-[#76B8FF]">{match.email}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between text-xs text-white/50">
                    <span className="uppercase tracking-[0.3em]">Email draft</span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyEmailDraft(match.id, match.email_draft)}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/15"
                      >
                        {copiedEmails.has(match.id) ? (
                          <>
                            <CheckCircle className="w-3 h-3 text-emerald-300" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sendEmail(match.email, match.name, match.email_draft)}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/15"
                      >
                        <Mail className="w-3 h-3" />
                        Send
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-line text-sm text-white/70">{match.email_draft}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function RevealPage() {
  return (
    <Suspense fallback={<RevealLoading />}>
      <RevealContent />
    </Suspense>
  );
}
