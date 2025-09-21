/**
 * Reveal page - POC version with no database calls
 */
"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Copy, Mail, CheckCircle, Star, Building } from "lucide-react";
import { toast } from "sonner";
import { api, getCurrentUser } from "@/lib/api";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading your contacts...</p>
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

  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id") ?? null;

  const mapToRevealedMatches = (results: any[]): PersonRevealed[] =>
    results.map((result: any, index: number) => ({
      id: result.id ?? index + 1,
      name: result.name,
      title: result.title,
      company_name: result.company_name,
      email: result.email_plain || result.email || "",
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

  const ensureMatches = async (userEmail?: string | null, forceRefresh = false) => {
    const storedResultsRaw = sessionStorage.getItem("matchResults");

    if (!storedResultsRaw) {
      await refreshMatches(userEmail);
      return;
    }

    try {
      const storedResults = JSON.parse(storedResultsRaw);
      const hasUnmaskedEmails = Array.isArray(storedResults.results)
        ? storedResults.results.every((result: any) => !!result.email_plain)
        : false;

      if (forceRefresh || storedResults.status !== "revealed" || !hasUnmaskedEmails) {
        await refreshMatches(userEmail);
        return;
      }

      setMatches(mapToRevealedMatches(storedResults.results));
      setError(null);
    } catch (err) {
      console.error("Failed to parse stored reveal results", err);
      await refreshMatches(userEmail);
      return;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshMatches = async (userEmail?: string | null) => {
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
        credit_cost: 1,
        token_usage: { prompt: 0, completion: 0, total: 0 },
        status: refreshed.revealed ? "revealed" : "preview",
        user_company: refreshed.user_company,
      };

      sessionStorage.setItem("currentMatchId", pocResults.match_id.toString());
      sessionStorage.setItem("matchResults", JSON.stringify(pocResults));

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
    } catch (err: any) {
      console.error("Failed to refresh matches after payment", err);
      setError(err.message || "Failed to load results");
      toast.error("Failed to load results", {
        description: "Please try again or contact support if the issue persists.",
      });
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/")} variant="outline">
              Start Over
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-gray-900">ViQi AI</span>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Revealed
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Your Professional Contacts
            </h1>
            <p className="text-gray-600">
              Full contact details and personalized outreach emails for {matches.length} relevant professionals.
            </p>
          </div>

          {/* Contacts Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {matches.map((match) => (
              <Card key={match.id} className="shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl text-gray-900">{match.name}</CardTitle>
                      <p className="text-blue-600 font-medium mt-1">{match.title}</p>
                      <div className="flex items-center text-gray-600 mt-2">
                        <Building className="w-4 h-4 mr-1" />
                        {match.company_name}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-200">
                      <Star className="w-3 h-3 mr-1" />
                      {Math.round(match.score * 100)}% match
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Contact Info */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Contact</h4>
                    <p className="text-blue-600 font-mono text-sm">{match.email}</p>
                  </div>

                  {/* Why This Match */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Why this match</h4>
                    <p className="text-gray-600 text-sm leading-relaxed">{match.reason}</p>
                  </div>

                  <Separator />

                  {/* Email Draft */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Personalized Email</h4>
                    <div className="bg-gray-50 p-3 rounded-lg border">
                      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                        {match.email_draft}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => copyEmailDraft(match.id, match.email_draft)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      {copiedEmails.has(match.id) ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Email
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => sendEmail(match.email, match.name, match.email_draft)}
                      size="sm"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              size="lg"
            >
              Search Again
            </Button>
          </div>
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
