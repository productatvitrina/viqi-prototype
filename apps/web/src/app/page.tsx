/**
 * Landing page for ViQi - Film & TV Industry Matchmaking
 */
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { flowConfig, getNextStep, getStepRoute } from "@/config/flow.config";
import { getCurrentUser } from "@/lib/api";
import CreditsBadge from "@/components/credits-badge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const featureHighlights = [
  {
    title: "AI-Powered Matching",
    copy: "We analyse your request and surface the most relevant people instantly.",
    icon: "🎯",
  },
  {
    title: "Tailored Outreach",
    copy: "Get personalised email drafts that reflect your brand voice and goals.",
    icon: "✉️",
  },
  {
    title: "Instant Access",
    copy: "Unlock verified contacts and act on opportunities the moment you need them.",
    icon: "⚡",
  },
];

const exampleQueries = [
  "I'm looking for someone to finance my independent film",
  "Need VFX company for high-budget sci-fi series",
  "Seeking dubbing services for international distribution",
  "Looking for post-production partner for documentary",
  "Need colorist for feature film finishing",
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [customUser, setCustomUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const isQueryPresent = useMemo(() => query.trim().length > 0, [query]);

  const handleSignOut = async () => {
    try {
      localStorage.removeItem("customAuth");
    } catch (err) {
      console.warn("Failed to remove customAuth from localStorage", err);
    }

    try {
      sessionStorage.removeItem("userEmail");
      sessionStorage.removeItem("backendToken");
      sessionStorage.removeItem("businessDomain");
      sessionStorage.removeItem("creditSummary");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("viqi:sign-out"));
      }
    } catch (err) {
      console.warn("Failed to remove session auth keys", err);
    }

    setCustomUser(null);

    if (session?.user) {
      await signOut({ callbackUrl: "/" });
    } else {
      router.push("/");
    }
  };

  useEffect(() => {
    const user = getCurrentUser();
    setCustomUser(user);
  }, [session]);

  useEffect(() => {
    setIsSubmitting(false);
  }, [session]);

  useEffect(() => {
    if (!isQueryPresent) {
      setIsSubmitting(false);
    }
  }, [isQueryPresent]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!isQueryPresent) {
      return;
    }

    sessionStorage.setItem("userQuery", query.trim());

    const currentUser = getCurrentUser();
    const isAuthenticated = session?.user || currentUser;

    if (!isAuthenticated) {
      setIsSubmitting(true);
      router.push("/auth/signin");
      return;
    }

    setIsSubmitting(true);
    router.push(getStepRoute("processing"));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020710] text-white">
      <Image
        src="/bg-top.png"
        alt="Background glow"
        fill
        priority
        className="pointer-events-none select-none object-cover opacity-70"
      />
      <Image
        src="/bg-gradient-shape.png"
        alt="Background gradient"
        width={720}
        height={720}
        priority
        className="pointer-events-none select-none absolute -right-24 top-20 h-[720px] w-[720px] opacity-80"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/40 via-transparent to-[#020710]" />

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative h-8 w-24 sm:h-9 sm:w-28">
              <Image
                src="/logo-ViQi-light.png"
                alt="ViQi"
                fill
                priority
                className="object-contain"
              />
            </div>
            <Badge className="bg-white/10 text-xs font-medium text-white/80">Preview</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70 sm:gap-3">
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
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 sm:px-4"
                >
                  Sign Out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-8 sm:px-6 sm:py-12 md:py-16">
        <div className="mb-12 text-center">
          <h1 className="mx-auto mb-6 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
            Connect with the right people for your
            <span className="bg-gradient-to-r from-[#76B8FF] to-[#2E8AE5] bg-clip-text text-transparent"> next project</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-white/70 sm:text-lg md:text-xl">
            AI-powered matchmaking for Film, TV, and entertainment professionals. Find partners, vendors, and collaborators with personalised outreach.
          </p>
        </div>

        <div className="relative w-full max-w-3xl rounded-[32px] border border-white/10 bg-black/80 p-4 sm:p-6 md:p-8 shadow-[0_0_8px_rgba(0,0,0,0.3)] backdrop-blur-[12.5px]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-left">
              <label htmlFor="query" className="block text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                What are you looking for?
              </label>
              <Textarea
                id="query"
                placeholder="Describe what you need in natural language..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mt-3 min-h-20 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-lg text-white placeholder-white/40 shadow-[0_0_12px_rgba(13,71,161,0.15)] focus-visible:border-[#2E8AE5] focus-visible:ring-0 resize-none"
                maxLength={flowConfig.usage.maxQueryLength}
                rows={3}
              />
              <p className="mt-2 text-xs text-white/40">
                {query.length}/{flowConfig.usage.maxQueryLength} characters
              </p>
            </div>
            <Button
              type="submit"
              className={cn(
                "w-full rounded-full border-[3px] border-white/10 px-4 py-3 text-sm font-semibold transition-all duration-200 sm:px-6 sm:py-4 sm:text-base",
                "disabled:border-white/10 disabled:bg-black disabled:text-white/40 disabled:shadow-[0_0_25px_5px_rgba(6,110,214,0.05)]",
                isQueryPresent
                  ? "bg-[radial-gradient(253.12%_50%_at_50%_50%,#2E8AE5_0%,#0068D0_70%)] shadow-[0_0_25px_5px_rgba(6,110,214,0.10)] hover:shadow-[0_0_35px_8px_rgba(46,138,229,0.2)] hover:brightness-110"
                  : "bg-black"
              )}
              disabled={!isQueryPresent || isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2 text-white/80">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Working…</span>
                </span>
              ) : (
                "Ask ViQi →"
              )}
            </Button>
          </form>
        </div>

        <div className="mt-12 w-full max-w-3xl">
          <p className="mb-4 text-sm font-medium text-white/60">Try these examples:</p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {exampleQueries.map((example) => (
              <button
                key={example}
                onClick={() => setQuery(example)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 transition duration-150 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 hover:text-white sm:px-4 break-words text-left"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid w-full gap-4 sm:gap-6 sm:grid-cols-2 md:grid-cols-3 md:mt-16">
          {featureHighlights.map((feature) => (
            <div
              key={feature.title}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 text-left shadow-[0_25px_50px_-12px_rgba(15,23,42,0.35)] backdrop-blur-lg sm:p-6"
            >
              <div className="mb-4 text-2xl">{feature.icon}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="text-sm text-white/70">{feature.copy}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
