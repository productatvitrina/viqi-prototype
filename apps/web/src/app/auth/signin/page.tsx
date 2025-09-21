/**
 * Sign-in page with Google OAuth
 */
"use client";

import { useEffect, useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Chrome, Linkedin, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";

function SignInPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [email, setEmail] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if user is already signed in
    getSession().then((session) => {
      if (session) {
        // User is already signed in, redirect to next step
        const nextStep = getNextStep("sso_optional");
        if (nextStep) {
          router.push(getStepRoute(nextStep));
        }
      }
    });
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setProvider("google");

    const nextStep = getNextStep("sso_optional");
    const callbackUrl = nextStep ? getStepRoute(nextStep) : "/preview";

    try {
      await signIn("google", {
        redirect: true,
        callbackUrl,
      });
    } catch (error) {
      console.error("Sign-in error:", error);
      setIsLoading(false);
      setProvider(null);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !email.includes('@')) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setIsLoading(true);
    setProvider("email");
    
    try {
      // Extract domain for business context
      const domain = email.split('@')[1].toLowerCase();
      const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
      const isBusinessEmail = !freeProviders.includes(domain);
      
      // Session-only authentication - store in localStorage for session persistence
      const userSession = {
        email,
        name: email.split('@')[0],
        businessDomain: isBusinessEmail ? domain : '',
        company: isBusinessEmail ? domain : null,
        authType: 'email',
        provider: 'email'
      };
      
      // Store the session info for this POC (session-only, no backend)
      localStorage.setItem('customAuth', JSON.stringify(userSession));
      
      // Also store in sessionStorage for backward compatibility
      sessionStorage.setItem('userEmail', email);
      sessionStorage.setItem('businessDomain', isBusinessEmail ? domain : '');
      
      toast.success(`Signed in with ${isBusinessEmail ? 'business' : 'personal'} email!`);
      
      // Redirect to next step
      const nextStep = getNextStep("sso_optional");
      if (nextStep) {
        router.push(getStepRoute(nextStep));
      }
      
    } catch (error) {
      console.error("Email auth failed:", error);
      toast.error("Email authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
      setProvider(null);
    }
  };

  const handleSkip = () => {
    // For demo purposes, allow skipping auth
    const nextStep = getNextStep("sso_optional");
    if (nextStep) {
      router.push(getStepRoute(nextStep));
    }
  };

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
            <Badge variant="secondary">Step 2 of 5</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <Card className="shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">V</span>
                </div>
              </div>
              <CardTitle className="text-2xl">Sign in to continue</CardTitle>
              <p className="text-gray-600 mt-2">
                Connect your profile to get personalized matches and save your preferences
              </p>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Google Sign In */}
              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 shadow-sm"
                size="lg"
              >
                {isLoading && provider === "google" ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <Chrome className="w-5 h-5" />
                    <span>Continue with Google</span>
                  </div>
                )}
              </Button>

              {/* LinkedIn Sign In (Disabled for demo) */}
              <Button
                disabled
                className="w-full bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white opacity-50"
                size="lg"
              >
                <div className="flex items-center space-x-3">
                  <Linkedin className="w-5 h-5" />
                  <span>Continue with LinkedIn</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Coming Soon
                  </Badge>
                </div>
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or</span>
                </div>
              </div>

              {/* Email Sign In Option */}
              {!showEmailAuth ? (
                <Button
                  onClick={() => setShowEmailAuth(true)}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <div className="flex items-center space-x-3">
                    <Mail className="w-5 h-5" />
                    <span>Sign in with Email</span>
                  </div>
                </Button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Enter your business email
                    </label>
                    <Input
                      type="email"
                      placeholder="john@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      We'll extract your company info to provide better matches
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={handleEmailAuth}
                      disabled={isLoading || !email}
                      className="flex-1"
                    >
                      {isLoading && provider === "email" ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Signing in...</span>
                        </div>
                      ) : (
                        "Continue"
                      )}
                    </Button>
                    <Button
                      onClick={() => setShowEmailAuth(false)}
                      variant="outline"
                      disabled={isLoading}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}


              {/* Info */}
              <div className="text-center text-xs text-gray-500 space-y-2 pt-4">
                <p>
                  By continuing, you agree to our{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Privacy Policy
                  </a>
                </p>
                <p>We'll use your email domain to identify your company and provide better matches.</p>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card className="mt-6 border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <h3 className="font-semibold text-green-900 mb-2">✨ Why sign in?</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Get matches personalized to your company</li>
                <li>• Save your search history and preferences</li>
                <li>• Access premium features and higher quality matches</li>
                <li>• Track your outreach and connection success</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInPageInner />
    </Suspense>
  );
}
