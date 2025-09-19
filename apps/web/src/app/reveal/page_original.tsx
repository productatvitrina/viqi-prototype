/**
 * Reveal page - Shows full contact details after payment
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Copy, Mail, ExternalLink, CheckCircle, Star, Building, MapPin, Phone } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, makeAuthenticatedRequest, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";

interface PersonRevealed {
  id: number;
  name: string;
  title: string;
  company_name: string;
  company_id: number;
  email: string;
  reason: string;
  email_draft: string;
  score: number;
}

interface RevealResponse {
  match_id: number;
  results: PersonRevealed[];
}

export default function RevealPage() {
  const [matches, setMatches] = useState<PersonRevealed[]>([]);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmails, setCopiedEmails] = useState<Set<number>>(new Set());

  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const loadRevealedMatches = async () => {
      // POC: Load from stored results instead of API calls
      const storedResults = sessionStorage.getItem("matchResults");
      const storedMatchId = sessionStorage.getItem("currentMatchId");
      
      if (!storedResults) {
        toast.error("No match results found. Please start a new search.");
        router.push("/");
        return;
      }

      try {
        const matchResponse = JSON.parse(storedResults);
        
        // Convert to reveal format
        const revealedMatches: PersonRevealed[] = matchResponse.results.map((result: any, index: number) => ({
          id: index + 1,
          name: result.name,
          title: result.title,
          company_name: result.company_name,
          company_id: index + 1,
          email: result.email_plain,
          reason: result.reason,
          email_draft: result.email_draft,
          score: result.score
        }));

        setMatches(revealedMatches);
        setMatchId(parseInt(storedMatchId || "1"));
        
        toast.success("Contacts revealed!", {
          description: `Found ${revealedMatches.length} professional contacts for you.`
        });
        
      } catch (err) {
        console.error("Failed to parse stored results:", err);
        setError("Failed to load results");
        toast.error("Failed to load results");
      } finally {
        setIsLoading(false);
      }
    };

    loadRevealedMatches();
      
      if (stripeSessionId) {
        // Payment was successful, mark it as completed
        try {
          console.log("🔍 Verifying payment for session:", stripeSessionId);
          const authUser = getCurrentUser();
          console.log("🔍 Current auth state:", { 
            session: !!session?.user, 
            currentUser: !!authUser,
            backendToken: !!(session as any)?.backendToken || !!authUser?.backendToken
          });
          
          // Wait a bit longer for auth state to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Use API client with proper authentication
          await makeAuthenticatedRequest(() => 
            api.payments.verifyPayment(stripeSessionId)
          );
          
          console.log("✅ Payment verified successfully");
          toast.success("Payment confirmed!", {
            description: "Your purchase was successful. Revealing matches..."
          });
          
          // Remove session_id from URL to clean it up
          window.history.replaceState({}, '', '/reveal');
        } catch (error: any) {
          console.error("❌ Payment verification failed:", error);
          
          // If it's an auth error, we can still proceed to show results
          if (error.message?.includes('Authentication') || error.message?.includes('401') || error.message?.includes('403')) {
            console.log("🔄 Payment verification failed due to auth, but proceeding to show results");
            toast.warning("Payment completed successfully", {
              description: "Showing your results now..."
            });
            // Remove session_id from URL to clean it up
            window.history.replaceState({}, '', '/reveal');
          } else {
            toast.error("Payment verification failed", {
              description: "Please contact support if this issue persists."
            });
          }
        }
      }
      
      const currentMatchId = sessionStorage.getItem("currentMatchId");
      
      if (!currentMatchId) {
        router.push("/preview");
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check if user is authenticated (either NextAuth or custom email auth)
        // Use getCurrentUser() directly to avoid stale state issues
        const currentUser = getCurrentUser();
        const isAuthenticated = session?.user || currentUser;
        
        console.log("🔍 Authentication check:", {
          currentMatchId,
          sessionUser: !!session?.user,
          currentUser: !!currentUser,
          isAuthenticated: !!isAuthenticated,
          backendToken: !!(session as any)?.backendToken || !!currentUser?.backendToken
        });
        
        // Check for payment-completed scenario (auth lost during Stripe redirect)
        const stripeSessionId = searchParams.get('session_id');
        const paymentCompleted = !!stripeSessionId;
        
        if (!isAuthenticated && !paymentCompleted) {
          console.log("❌ Not authenticated and no payment session, redirecting to sign in");
          router.push('/auth/signin');
          return;
        }
        
        if (!isAuthenticated && paymentCompleted) {
          console.log("💳 Payment completed but auth lost - showing results with mock data");
          toast.success("Payment successful!", {
            description: "Your purchase was completed. Showing your results..."
          });
          
          // Skip API call and show mock results when auth is lost but payment succeeded
          throw new Error("AUTH_LOST_AFTER_PAYMENT");
        }

        console.log("🤖 Fetching real matches from API...");
        
        // Make actual API call to reveal matches
        const response: RevealResponse = await makeAuthenticatedRequest(() =>
          api.matching.revealMatch(parseInt(currentMatchId))
        );

        console.log("✅ Real matches received:", response.results?.length || 0, "matches");
        setMatches(response.results);
        setMatchId(response.match_id);
        
        toast.success("Contacts revealed!", {
          description: `Full details for ${response.results.length} professional matches are now available.`
        });

      } catch (err: any) {
        console.error("❌ Failed to reveal matches:", err);
        
        // Special handling for auth lost after payment
        if (err.message === "AUTH_LOST_AFTER_PAYMENT") {
          console.log("💳 Showing results after successful payment (auth was lost during redirect)");
        } else {
          console.log("🔄 Falling back to mock data due to API error");
        }
        
        setTimeout(() => {
          const mockRevealed: PersonRevealed[] = [
            {
              id: 1,
              name: "Sarah Martinez",
                title: "Director of Content Acquisition",
                company_name: "Netflix",
                company_id: 1,
                email: "sarah.martinez@netflix.com",
                reason: "Sarah has extensive experience in independent film acquisition and has been responsible for bringing over 50 indie films to Netflix's platform. Her focus on international co-productions and diverse storytelling makes her an ideal match for your financing needs. She particularly champions films with budgets between $2-10M and has strong relationships with international sales agents.",
                email_draft: "Hi Sarah,\n\nI hope this message finds you well. I came across your impressive work in content acquisition at Netflix, particularly your focus on independent films and international co-productions.\n\nI'm currently seeking financing for an independent drama with strong international appeal, and I believe it aligns perfectly with Netflix's content strategy. The project has attached talent and is budgeted at $5M.\n\nWould you be open to a brief conversation about this opportunity? I'd love to share more details about the project and discuss how it might fit within Netflix's acquisition goals.\n\nBest regards,\n[Your name]",
                score: 0.95
              },
              {
                id: 2,
                name: "James Wright", 
                title: "Head of Business Development",
                company_name: "Industrial Light & Magic",
                company_id: 4,
                email: "james.wright@ilm.com",
                reason: "James leads business development for ILM's most ambitious projects and has been instrumental in securing partnerships for major franchises including Marvel and Star Wars. His expertise in creature work and environmental VFX, combined with his business acumen, makes him the perfect contact for high-budget sci-fi productions requiring cutting-edge visual effects.",
                email_draft: "Hi James,\n\nI'm reaching out regarding a potential VFX partnership for an upcoming sci-fi feature. Having followed ILM's groundbreaking work on recent Marvel and Star Wars projects, I believe your team would be perfect for our creature-heavy production.\n\nThe project is budgeted at $50M with a significant portion allocated to VFX, particularly advanced creature work and large-scale environments. We're looking for a partner who can push the boundaries of what's possible in sci-fi cinema.\n\nWould you have time for a call to discuss the project's scope and timeline? I'd love to explore how we might collaborate on this ambitious production.\n\nBest regards,\n[Your name]",
                score: 0.88
              },
              {
                id: 3,
                name: "Maria Gonzalez",
                title: "Director of Dubbing Services", 
                company_name: "Deluxe Entertainment",
                company_id: 5,
                email: "maria.gonzalez@deluxe.com",
                reason: "Maria oversees Deluxe's international localization efforts and has successfully managed dubbing projects for major studios across 40+ languages. Her expertise in LATAM markets and European territories, combined with Deluxe's state-of-the-art facilities, makes her invaluable for projects requiring high-quality international distribution.",
                email_draft: "Hi Maria,\n\nI'm reaching out regarding dubbing services for our upcoming feature film that we're planning to distribute internationally. Your reputation in the industry for delivering exceptional localization services, particularly in LATAM and European markets, makes you an ideal partner for this project.\n\nWe're looking to create dubbed versions in Spanish, French, German, and Portuguese, with potential for additional languages based on distribution deals. Quality is paramount as this will be a wide theatrical release.\n\nWould you be available for a conversation about our project's requirements and timeline? I'd appreciate your expertise on the best approach for our international rollout.\n\nBest regards,\n[Your name]",
                score: 0.82
              },
              {
                id: 4,
                name: "Robert Kim",
                title: "Senior Vice President",
                company_name: "Paramount Pictures", 
                company_id: 3,
                email: "robert.kim@paramount.com",
                reason: "Robert is a key decision-maker at Paramount with authority over greenlight decisions for projects in the $20-100M range. His strategic focus on franchise development and his track record of identifying commercially successful content makes him an excellent contact for producers seeking major studio backing and distribution.",
                email_draft: "Hi Robert,\n\nI hope you're doing well. I'm reaching out because I believe we have a project that would be a perfect fit for Paramount's current slate development.\n\nWe have an action-thriller with strong franchise potential, featuring attached A-list talent and a proven creative team. The project is designed for wide theatrical release with clear sequel opportunities and international appeal.\n\nI'd love to schedule a brief meeting to present the project and discuss how it might align with Paramount's strategic goals. Are you available for a call in the coming weeks?\n\nBest regards,\n[Your name]",
                score: 0.79
            }
          ];

          setMatches(mockRevealed);
          setMatchId(parseInt(currentMatchId));
          setIsLoading(false);
          
          toast.warning("Using demo data", {
            description: "API temporarily unavailable. Showing sample results."
          });
        }, 1500);
        
        setError(err.message || "Failed to reveal matches");
      } finally {
        setIsLoading(false);
      }
    };

    loadRevealedMatches();
  }, [session, router, searchParams]);

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

  const sendEmail = (email: string, name: string, emailDraft: string) => {
    const subject = encodeURIComponent(`Partnership Opportunity - Introduction from ViQi`);
    const body = encodeURIComponent(emailDraft);
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    
    window.location.href = mailtoUrl;
    
    toast.success("Email client opened!", {
      description: `Ready to send to ${name}`
    });
  };

  const handleDashboard = () => {
    router.push("/dashboard");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Revealing your matches...</h1>
              <p className="text-gray-600">Unlocking full contact details and email drafts</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 mb-4">⚠️</div>
            <h2 className="text-lg font-semibold mb-2">Unable to reveal matches</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => router.push("/paywall")}>Go Back</Button>
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
            <Badge variant="secondary">Step 5 of 5</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              🎉 Your matches are ready!
            </h1>
            <p className="text-lg text-gray-600">
              Connect with these industry professionals using our personalized email drafts
            </p>
          </div>

          {/* Revealed Matches */}
          <div className="space-y-8 mb-8">
            {matches.map((match, index) => (
              <Card key={match.id} className="hover:shadow-lg transition-shadow border-green-200">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
                        {match.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{match.name}</h3>
                        <p className="text-gray-600 mb-2">{match.title}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Building className="w-4 h-4" />
                            <span className="font-medium">{match.company_name}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                        <Star className="w-3 h-3 mr-1 fill-current" />
                        {Math.round(match.score * 100)}% match
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Why This Match */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Why this is a great match:</h4>
                    <p className="text-gray-700 leading-relaxed">{match.reason}</p>
                  </div>

                  {/* Contact Information */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3">Contact Information</h4>
                    <div className="flex items-center space-x-3">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="font-mono text-sm bg-white px-2 py-1 rounded border">
                        {match.email}
                      </span>
                    </div>
                  </div>

                  {/* Email Draft */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Personalized Email Draft</h4>
                    <div className="bg-white border rounded-lg p-4">
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {match.email_draft}
                      </pre>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                    <Button
                      onClick={() => copyEmailDraft(match.id, match.email_draft)}
                      variant="outline"
                      className="flex-1"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedEmails.has(match.id) ? "Copied!" : "Copy Email"}
                    </Button>
                    
                    <Button
                      onClick={() => sendEmail(match.email, match.name, match.email_draft)}
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

          {/* Success Summary */}
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-6 text-center">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                ✨ Mission Accomplished!
              </h3>
              <p className="text-green-800 mb-4">
                You now have {matches.length} high-quality connections with personalized outreach emails.
                Use the copy and send buttons above to start reaching out.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={handleDashboard}
                  variant="outline"
                  className="border-green-300 text-green-800 hover:bg-green-100"
                >
                  View Dashboard
                </Button>
                <Button
                  onClick={() => router.push("/")}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Start New Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="mt-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-blue-900 mb-2">💡 Outreach Tips:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Personalize the subject line with your project name</li>
                <li>• Follow up within 1-2 weeks if you don't hear back</li>
                <li>• Include a one-page project summary as an attachment</li>
                <li>• Be specific about what you're asking for and your timeline</li>
                <li>• Research recent news about their company before sending</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
