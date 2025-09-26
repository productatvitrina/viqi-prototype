/**
 * Processing page - Makes OpenAI API call right after auth
 */
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle } from "lucide-react";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { api, getCurrentUser } from "@/lib/api";
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

      try {
        const userQuery = sessionStorage.getItem("userQuery");
        if (!userQuery) {
          toast.error("No query found. Please start over.");
          router.push("/");
          return;
        }

        const currentUser = getCurrentUser();
        const userEmail =
          session?.user?.email || currentUser?.email || sessionStorage.getItem("userEmail");

        if (!userEmail) {
          toast.error("Please sign in to continue");
          router.push("/auth/signin");
          return;
        }

        setProgress(20);
        setCurrentStep("Preparing your request...");
        await new Promise((resolve) => setTimeout(resolve, 900));

        setProgress(50);
        setCurrentStep("Finding the best matches for you...");

        const matchResponse = await api.matchingPoc
          .createMatch({
            query: userQuery,
            user_email: userEmail,
            max_results: 4,
          })
          .then((r) => r.data);

        setProgress(80);
        setCurrentStep("Staging results...");

        const pocResults = {
          match_id: Date.now(),
          results: matchResponse.results,
          credit_cost: matchResponse?.credits_charged ?? 0,
          token_usage: { prompt: 0, completion: 0, total: 0 },
          status: matchResponse.revealed ? "revealed" : "preview",
          user_company: matchResponse.user_company,
          credit_summary: matchResponse.credit_summary ?? null,
          credits_charged: matchResponse?.credits_charged ?? null,
        };

        sessionStorage.setItem("currentMatchId", pocResults.match_id.toString());
        sessionStorage.setItem("matchResults", JSON.stringify(pocResults));

        if (matchResponse.credit_summary) {
          sessionStorage.setItem("creditSummary", JSON.stringify(matchResponse.credit_summary));
          window.dispatchEvent(new Event("viqi:credits-updated"));
        }

        if (matchResponse.credits_charged) {
          toast.success(`Used ${matchResponse.credits_charged} credits`, {
            description: matchResponse.credit_summary
              ? `Projected balance: ${
                  matchResponse.credit_summary?.projected_remaining_credits ??
                  matchResponse.credit_summary?.remaining_credits ??
                  0
                } credits remaining`
              : undefined,
          });
        }

        setProgress(100);
        setCurrentStep("Done! Redirecting…");
        await new Promise((resolve) => setTimeout(resolve, 400));

        const nextStep = matchResponse.revealed ? "reveal" : getNextStep("processing");
        router.push(nextStep ? getStepRoute(nextStep) : "/preview");
      } catch (err: any) {
        console.error("Processing failed", err);
        setError(err?.message || "Failed to process your query");
        setIsProcessing(false);
        toast.error("Failed to process your query", {
          description: "Please try again or contact support if the issue persists.",
        });
      }
    };

    processQuery();
  }, [router, session?.user]);

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
          className="pointer-events-none select-none absolute right-[-7rem] top-[-4rem] h-[720px] w-[720px] opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-center shadow-[0_0_30px_rgba(229,57,53,0.2)] backdrop-blur-2xl">
          <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-3 text-sm text-white/70">{error}</p>
          <button
            className="mt-6 w-full rounded-full border border-white/15 bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            onClick={() => router.push("/")}
          >
            Start over
          </button>
        </div>
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
        className="pointer-events-none select-none absolute -right-24 top-[-6rem] h-[720px] w-[720px] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-28">
              <Image
                src="/logo-ViQi-light.png"
                alt="ViQi"
                fill
                priority
                className="object-contain"
              />
            </div>
            <Badge className="bg-white/10 text-xs font-medium text-white/80">Processing</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <CreditsBadge />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20">
        <div className="w-full rounded-[32px] border border-white/10 bg-black/70 p-10 shadow-[0_0_22px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
            <span>Step 02</span>
            <span>ViQi AI</span>
          </div>

          <div className="mt-8 flex flex-col items-center text-center">
            {isProcessing ? (
              <div className="relative mb-6 flex size-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <Loader2 className="size-12 animate-spin text-[#76B8FF]" />
                <span className="absolute -bottom-8 text-sm font-medium text-white/70">
                  {progress}%
                </span>
              </div>
            ) : (
              <div className="relative mb-6 flex size-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <CheckCircle className="size-12 text-green-400" />
              </div>
            )}

            <h1 className="text-2xl font-semibold">Let’s find your matches</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/60">
              We’re analysing your request, scoring the best industry contacts, and preparing
              outreach templates tailored to your company.
            </p>
          </div>

          <div className="mt-10 space-y-4">
            {["Preparing your request", "Finding the best matches", "Staging results"].map(
              (step, index) => {
                const stepProgress = (index + 1) * 33;
                const isComplete = progress >= stepProgress + 5;
                const isActive = !isComplete && progress >= stepProgress - 33;

                return (
                  <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between text-sm text-white/60">
                      <span className="font-medium text-white/80">{step}</span>
                      {isComplete ? (
                        <CheckCircle className="size-4 text-green-400" />
                      ) : isActive ? (
                        <Loader2 className="size-4 animate-spin text-[#76B8FF]" />
                      ) : (
                        <span className="size-3 rounded-full border border-white/20" />
                      )}
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#76B8FF] to-[#2E8AE5] transition-all"
                        style={{ width: `${Math.min(progress, stepProgress)}%` }}
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
