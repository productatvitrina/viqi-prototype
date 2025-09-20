/**
 * Intent page - Natural language query refinement
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Search, Sparkles } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";

function IntentPageInner() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get query from URL params or session storage
    const urlQuery = searchParams.get("q");
    const storedQuery = sessionStorage.getItem("userQuery");
    
    if (urlQuery) {
      setQuery(decodeURIComponent(urlQuery));
    } else if (storedQuery) {
      setQuery(storedQuery);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    
    try {
      // Store the refined query
      sessionStorage.setItem("userQuery", query.trim());
      
      // Compute next step robustly (works even if TS union doesn't include "intent")
      const steps = flowConfig.steps as readonly string[];
      const idx = steps.indexOf("intent" as any);
      const nextStep = idx >= 0 && idx + 1 < steps.length ? (steps[idx + 1] as any) : null;
      if (nextStep) router.push(getStepRoute(nextStep));
    } catch (error) {
      console.error("Intent processing failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const exampleCategories = [
    {
      title: "Financing & Investment",
      examples: [
        "Looking for investors for $2M independent drama",
        "Need production financing for documentary series",
        "Seeking co-production partners for international feature"
      ]
    },
    {
      title: "Production Services", 
      examples: [
        "Need VFX company for superhero series with $50M budget",
        "Looking for sound mixing studio in Los Angeles",
        "Require color grading services for period drama"
      ]
    },
    {
      title: "Distribution & Sales",
      examples: [
        "Seeking international sales agent for thriller",
        "Need streaming platform contacts for limited series",
        "Looking for theatrical distributor in Europe"
      ]
    },
    {
      title: "Talent & Crew",
      examples: [
        "Need experienced DP for indie film in New York",
        "Looking for composer specializing in orchestral scores",
        "Seeking production designer with fantasy experience"
      ]
    }
  ];

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
                onClick={() => router.push("/")}
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
            <Badge variant="secondary">Step 1 of 5</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI-Powered Matching</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Tell us what you're looking for
            </h1>
            <p className="text-lg text-gray-600">
              The more specific you are, the better matches we can find for you
            </p>
          </div>

          {/* Query Input */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
                    Describe your project or need
                  </label>
                  <Textarea
                    id="query"
                    placeholder="Example: I'm looking for a VFX company that specializes in creature work for a $10M sci-fi feature film shooting in Atlanta this summer. We need someone with experience on Marvel or similar high-budget productions..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="min-h-[120px] text-base"
                    maxLength={flowConfig.usage.maxQueryLength}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">
                      Include budget, location, timeline, specific requirements
                    </p>
                    <p className="text-xs text-gray-500">
                      {query.length}/{flowConfig.usage.maxQueryLength} characters
                    </p>
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                  disabled={!query.trim() || isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Search className="w-4 h-4" />
                      <span>Find Matches</span>
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Example Categories */}
          <div className="grid md:grid-cols-2 gap-6">
            {exampleCategories.map((category, index) => (
              <Card key={index} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {category.examples.map((example, exampleIndex) => (
                      <button
                        key={exampleIndex}
                        onClick={() => setQuery(example)}
                        className="block w-full text-left text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 p-2 rounded transition-colors"
                      >
                        "{example}"
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tips */}
          <Card className="mt-8 border-blue-200 bg-blue-50/50">
            <CardContent className="p-6">
              <h3 className="font-semibold text-blue-900 mb-3">💡 Tips for better matches:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Include your budget range (even rough estimates help)</li>
                <li>• Mention location preferences or requirements</li>
                <li>• Specify timeline and urgency</li>
                <li>• Add any special requirements or preferences</li>
                <li>• Mention similar projects or companies you admire</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function IntentPage() {
  return (
    <Suspense>
      <IntentPageInner />
    </Suspense>
  );
}
