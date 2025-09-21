/**
 * Processing page - Makes Gemini API call right after auth
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, makeAuthenticatedRequest, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";
import CreditsBadge from "@/components/credits-badge";

export default function ProcessingPage() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Analyzing your query...");
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    let hasProcessed = false;
    
    const processQuery = async () => {
      if (hasProcessed) return;
      hasProcessed = true;
      console.log("🏁 Processing page - useEffect started");
      
      try {
        // Get stored query
        const userQuery = sessionStorage.getItem("userQuery");
        console.log("📝 Retrieved query from sessionStorage:", userQuery);
        
        if (!userQuery) {
          console.error("❌ No query found in sessionStorage");
          toast.error("No query found. Please start over.");
          router.push("/");
          return;
        }

        // Check authentication first
        const currentUser = getCurrentUser();
        const userEmail = session?.user?.email || currentUser?.email || sessionStorage.getItem('userEmail');
        
        if (!userEmail) {
          console.error("❌ No user email found - redirecting to sign in");
          toast.error("Please sign in to continue");
          router.push("/auth/signin");
          return;
        }
        
        console.log("🔍 Processing page - Authenticated user:", {
          hasSession: !!session?.user,
          hasCurrentUser: !!currentUser,
          userEmail: userEmail,
          pocMode: true,
          sessionUserEmail: session?.user?.email,
          currentUserEmail: currentUser?.email,
          sessionStorageEmail: sessionStorage.getItem('userEmail')
        });

        console.log("🚀 Processing query:", userQuery);

        // Step 1: Initialize
        console.log("⏱️ Step 1: Initialize - setting progress to 20%");
        setProgress(20);
        setCurrentStep("Preparing your request...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("✅ Step 1 completed");

        // Step 2: Make Gemini API call
        console.log("⏱️ Step 2: API call - setting progress to 50%");
        setProgress(50);
        setCurrentStep("Finding the best matches for you...");
        
        console.log("📡 Making Gemini API call (POC)...");
        console.log("🔍 API Debug info:", {
          baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
          fullURL: `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/matching-poc/match`,
          userEmail: userEmail,
          query: userQuery.substring(0, 50) + "..."
        });
        
        // Call POC endpoint directly (no JWT required)
        console.log("🌐 Making POC request (no auth wrapper)...");
        const fetchStart = Date.now();
        const matchResponse = await api.matchingPoc.createMatch({
          query: userQuery,
          user_email: userEmail,
          max_results: 4
        }).then(r => r.data).then(res => {
          const fetchEnd = Date.now();
          console.log(`⏱️ Request completed in ${fetchEnd - fetchStart}ms`);
          console.log("📦 Response received:", res);
          return res;
        });

        console.log("✅ Gemini API response received:", {
          resultCount: matchResponse?.results?.length,
          userCompany: matchResponse?.user_company,
          queryProcessed: matchResponse?.query_processed
        });
        console.log("🔍 Full response:", matchResponse);

        // Step 3: Store results
        console.log("⏱️ Step 3: Store results - setting progress to 80%");
        setProgress(80);
        setCurrentStep("Preparing your matches...");
        
        // Store results for preview (POC format). If revealed=true, we can route to reveal.
        const pocResults = {
          match_id: Date.now(), // Simple ID for POC
          results: matchResponse.results,
          credit_cost: matchResponse?.credits_charged ?? 0,
          token_usage: { prompt: 0, completion: 0, total: 0 },
          status: matchResponse.revealed ? "revealed" : "preview",
          user_company: matchResponse.user_company,
          credit_summary: matchResponse.credit_summary ?? null,
          credits_charged: matchResponse?.credits_charged ?? null
        };

        console.log("💾 Storing results in sessionStorage:", {
          matchId: pocResults.match_id,
          resultCount: pocResults.results.length
        });

        sessionStorage.setItem("currentMatchId", pocResults.match_id.toString());
        sessionStorage.setItem("matchResults", JSON.stringify(pocResults));

        if (matchResponse.credit_summary) {
          sessionStorage.setItem("creditSummary", JSON.stringify(matchResponse.credit_summary));
          window.dispatchEvent(new Event("viqi:credits-updated"));
        }

        if (matchResponse.credits_charged) {
          toast.success(`Used ${matchResponse.credits_charged} credits`, {
            description: matchResponse.credit_summary
              ? `Projected balance: ${matchResponse.credit_summary?.projected_remaining_credits ?? matchResponse.credit_summary?.remaining_credits ?? 0} credits remaining`
              : undefined,
          });
        }
        
        // Verify storage
        const storedMatchId = sessionStorage.getItem("currentMatchId");
        const storedResults = sessionStorage.getItem("matchResults");
        console.log("✅ Storage verification:", {
          matchIdStored: !!storedMatchId,
          resultsStored: !!storedResults,
          storedMatchId: storedMatchId
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("✅ Step 3 completed");

        // Step 4: Complete
        console.log("⏱️ Step 4: Complete - setting progress to 100%");
        setProgress(100);
        setCurrentStep("Ready to show your matches!");
        
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log("✅ Step 4 completed");

        // Redirect based on revealed flag
        console.log("🔀 Preparing to redirect to preview...");
        const nextStep = matchResponse.revealed ? "reveal" : getNextStep("processing");
        console.log("🔍 Next step determined:", nextStep);
        console.log("🔍 Current flow steps:", flowConfig.steps);
        
        if (nextStep) {
          const route = getStepRoute(nextStep);
          console.log("🚀 Redirecting to:", route);
          router.push(route);
        } else {
          console.error("❌ No next step found!");
          console.log("🔍 Available steps:", flowConfig.steps);
          console.log("🔍 Current step index:", flowConfig.steps.indexOf("processing"));
          
          // Fallback: go directly to preview
          console.log("🔄 Fallback: redirecting directly to preview");
          router.push("/preview");
        }

      } catch (err: any) {
        console.error("❌ Processing failed - Full error:", err);
        console.error("❌ Error stack:", err.stack);
        console.error("❌ Error message:", err.message);
        
        setError(err.message || "Failed to process your query");
        setIsProcessing(false);
        
        toast.error("Failed to process your query", {
          description: "Please try again or contact support if the issue persists."
        });
        
        // Allow user to go back after error
        console.log("⏰ Setting timeout to redirect to home in 3 seconds...");
        setTimeout(() => {
          console.log("🏠 Redirecting to home due to error");
          router.push("/");
        }, 3000);
      }
    };

    console.log("🎬 Calling processQuery function...");
    processQuery();
  }, []);

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
            <div className="flex items-center gap-2">
              <CreditsBadge />
              <Badge variant="secondary">Processing...</Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-lg">
            <CardContent className="p-8">
              <div className="text-center">
                {isProcessing && (
                  <>
                    <div className="mb-6">
                      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                        Finding your perfect matches
                      </h2>
                      <p className="text-gray-600">
                        Our AI is analyzing your request and searching through our industry database...
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>{currentStep}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Processing Steps */}
                    <div className="space-y-3 text-left">
                      <div className={`flex items-center space-x-3 ${progress >= 20 ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${progress >= 20 ? 'bg-green-600' : 'bg-gray-300'}`} />
                        <span className="text-sm">Analyzing your request</span>
                      </div>
                      <div className={`flex items-center space-x-3 ${progress >= 50 ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${progress >= 50 ? 'bg-green-600' : 'bg-gray-300'}`} />
                        <span className="text-sm">Searching industry database</span>
                      </div>
                      <div className={`flex items-center space-x-3 ${progress >= 80 ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${progress >= 80 ? 'bg-green-600' : 'bg-gray-300'}`} />
                        <span className="text-sm">Generating personalized outreach</span>
                      </div>
                      <div className={`flex items-center space-x-3 ${progress >= 100 ? 'text-green-600' : 'text-gray-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${progress >= 100 ? 'bg-green-600' : 'bg-gray-300'}`} />
                        <span className="text-sm">Preparing your results</span>
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <div className="text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-red-600 text-xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      Processing Failed
                    </h2>
                    <p className="text-red-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-500">
                      Redirecting you back to the home page...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="mt-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-blue-900 mb-2">✨ What's happening?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• AI is analyzing your specific industry needs</li>
                <li>• Searching through our curated database of professionals</li>
                <li>• Generating personalized outreach emails</li>
                <li>• Ranking matches by relevance and fit</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
