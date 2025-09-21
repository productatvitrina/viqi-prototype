/**
 * Landing page for ViQi - Film & TV Industry Matchmaking
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { getCurrentUser } from "@/lib/api";
import CreditsBadge from "@/components/credits-badge";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [customUser, setCustomUser] = useState<any>(null);
  const router = useRouter();
  const { data: session } = useSession();

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('viqi:sign-out'));
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

  // Check for existing authentication
  useEffect(() => {
    const user = getCurrentUser();
    console.log("🏠 Landing page auth check:", { 
      hasSession: !!session?.user, 
      hasCustomUser: !!user,
      userEmail: session?.user?.email || user?.email
    });
    setCustomUser(user);
  }, [session]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // Store query in session storage
      sessionStorage.setItem("userQuery", query.trim());
      
      // Check if user is already authenticated
      const currentUser = getCurrentUser();
      const isAuthenticated = session?.user || currentUser;
      
      console.log("🚀 New search with auth:", {
        hasSession: !!session?.user,
        hasCustomAuth: !!currentUser,
        isAuthenticated: !!isAuthenticated,
        query: query.trim()
      });
      
      if (!isAuthenticated) {
        // Not authenticated - redirect to sign in
        console.log("❌ User not authenticated, redirecting to sign in");
        router.push("/auth/signin");
      } else {
        // Authenticated - proceed to processing
        console.log("✅ User authenticated, proceeding to processing");
        router.push(getStepRoute("processing"));
      }
    }
  };

  const exampleQueries = [
    "I'm looking for someone to finance my independent film",
    "Need VFX company for high-budget sci-fi series",
    "Seeking dubbing services for international distribution",
    "Looking for post-production partner for documentary",
    "Need colorist for feature film finishing"
  ];

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
              <Badge variant="secondary" className="ml-2">Preview</Badge>
            </div>
            <div className="flex items-center space-x-3">
              <CreditsBadge />
              {(session?.user || customUser) ? (
                <>
                  <span className="text-sm text-gray-600">
                    Hi, {session?.user?.name?.split(' ')[0] || customUser?.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Connect with the right people for your{" "}
              <span className="text-blue-600">next project</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              AI-powered matchmaking for Film & TV professionals. 
              Find partners, vendors, and collaborators with personalized outreach.
            </p>
          </div>

          {/* Query Input */}
          <Card className="max-w-2xl mx-auto mb-12 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-left">
                  <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
                    What are you looking for?
                  </label>
                  <Input
                    id="query"
                    type="text"
                    placeholder="Describe what you need in natural language..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="text-base py-3 px-4"
                    maxLength={flowConfig.usage.maxQueryLength}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {query.length}/{flowConfig.usage.maxQueryLength} characters
                  </p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                  disabled={!query.trim()}
                >
                  Ask ViQi →
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Example Queries */}
          <div className="mb-12">
            <p className="text-sm text-gray-600 mb-4">Try these examples:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleQueries.map((example, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(example)}
                  className="text-xs bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-full border border-gray-200 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="p-6 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-4">🎯</div>
              <h3 className="font-semibold mb-2">AI-Powered Matching</h3>
              <p className="text-sm text-gray-600">
                Our AI understands your industry context and finds the most relevant connections
              </p>
            </Card>
            
            <Card className="p-6 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-4">✉️</div>
              <h3 className="font-semibold mb-2">Personalized Outreach</h3>
              <p className="text-sm text-gray-600">
                Get custom email drafts that highlight why you're a perfect match
              </p>
            </Card>
            
            <Card className="p-6 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-4">🎬</div>
              <h3 className="font-semibold mb-2">Industry-Focused</h3>
              <p className="text-sm text-gray-600">
                Built specifically for Film & TV professionals with deep industry knowledge
              </p>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="mt-8 text-sm text-gray-500">
            Need help? Reach out at <a href="mailto:help@vitrina.ai" className="text-blue-600">help@vitrina.ai</a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-500">
            <p>© 2025 ViQi. Built for the Film & TV industry.</p>
            <p className="mt-2">This is a prototype. All data is for demonstration purposes.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
