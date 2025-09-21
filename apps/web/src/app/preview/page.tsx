/**
 * Preview page - Shows masked match results before payment
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Eye, EyeOff, ThumbsUp, ThumbsDown, CreditCard } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, makeAuthenticatedRequest, getCurrentUser } from "@/lib/api";
import Spinner from "@/components/ui/spinner";
import { toast } from "sonner";

interface MatchPreview {
  id: number;
  name: string;
  title: string;
  company_name: string;
  company_blurred: boolean;
  email_masked: string;
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-gray-900">ViQi AI</span>
            </div>
            <Badge variant="secondary" className="w-fit self-start sm:self-auto">Step 3 of 5</Badge>
          </div>
        </div>
        </header>

        <main className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Finding your matches...</h1>
              <p className="text-gray-600">Analyzing your request and matching with industry professionals</p>
            </div>

            <div className="grid gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="p-6">
                  <div className="flex space-x-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                </Card>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="flex items-center gap-2 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">V</span>
                </div>
                <span className="text-xl font-bold text-gray-900">ViQi AI</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
              {(session?.user || customUser) && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    Hi, {session?.user?.name?.split(' ')[0] || customUser?.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSignOut}
                    className="transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                  >
                    Sign Out
                  </Button>
                </div>
              )}
              <Badge variant="secondary" className="w-fit self-start sm:self-auto">
                Step 3 of 5
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full mb-4">
              <span className="text-sm font-medium">✨ {matches.length} matches found</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Here are your potential matches</h1>
            <p className="text-lg text-gray-600">
              Preview connections based on your requirements. Unlock full details to connect.
            </p>
          </div>

          {/* Match Results */}
          <div className="grid gap-6 mb-8">
            {matches.map((match, index) => (
              <Card
                key={`match-${match.id}-${index}`}
                className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {match.name.charAt(0)}
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{match.name}</h3>
                          <p className="text-gray-600">{match.title}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-gray-500 blur-sm select-none">{match.company_name}</span>
                            <Button 
                              size="sm"
                              variant="secondary" 
                              className="text-xs h-7 px-3 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                              onClick={handleContinue}
                              disabled={isCheckingAccess}
                            >
                              {isCheckingAccess ? (
                                <span className="flex items-center gap-2">
                                  <Spinner className="h-3 w-3" />
                                  <span>Checking...</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" />
                                  <span>Unlock to see</span>
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-green-600 border-green-200 self-start">
                          {Math.round(match.score * 100)}% match
                        </Badge>
                      </div>

                      <div className="mb-4">
                        <p className="text-gray-700 text-sm leading-relaxed">
                          {match.reason}
                        </p>
                      </div>

                      <div className="mb-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-700">Email draft ready:</span>
                            <Button 
                              size="sm"
                              variant="secondary" 
                              className="text-xs h-7 px-3 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                              onClick={handleContinue}
                              disabled={isCheckingAccess}
                            >
                              {isCheckingAccess ? (
                                <span className="flex items-center gap-2">
                                  <Spinner className="h-3 w-3" />
                                  <span>Loading…</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" />
                                  <span>Preview</span>
                                </span>
                              )}
                            </Button>
                          </div>
                          <p className="text-sm text-gray-500 blur-sm select-none">
                            Hi {match.name}, I found your profile and believe you might be interested in collaborating on my upcoming project...
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Contact:</span>
                          <code className="bg-gray-100 px-2 py-1 rounded text-xs">{match.email_masked}</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFeedback(match.id, true)}
                            className="transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFeedback(match.id, false)}
                            className="transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Stats & CTA */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{matches.length}</div>
                  <div className="text-sm text-blue-800">Quality Matches</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{matchData?.credit_cost || 1}</div>
                  <div className="text-sm text-blue-800">Credit{matchData && matchData.credit_cost !== 1 ? 's' : ''} Required</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{matchData?.token_usage.total || 1270}</div>
                  <div className="text-sm text-blue-800">AI Tokens Used</div>
                </div>
              </div>
              
              <Separator className="mb-6" />
              
              <div className="text-center">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                  Ready to connect with these professionals?
                </h3>
                <p className="text-blue-800 mb-4">
                  Unlock full profiles, contact details, and personalized email drafts
                </p>
                <Button 
                  onClick={handleContinue}
                  size="lg"
                  disabled={isCheckingAccess}
                  className="bg-blue-600 hover:bg-blue-700 text-white transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
                >
                  {isCheckingAccess ? (
                    <span className="flex items-center gap-3">
                      <Spinner size="sm" className="text-white" />
                      <span>Processing...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      <span>Unlock Full Access</span>
                    </span>
                  )}
                </Button>
                <p className="text-xs text-blue-700 mt-2">
                  Starting at $29/month • Cancel anytime • Money-back guarantee
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
