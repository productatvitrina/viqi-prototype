/**
 * Sign-in page with refreshed Vitrina styling
 */
"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getNextStep, getStepRoute } from "@/config/flow.config";

function SignInPageInner() {
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const router = useRouter();

  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        return;
      }
      const nextStep = getNextStep("sso_optional");
      if (nextStep) {
        router.push(getStepRoute(nextStep));
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
      toast.error("Google sign-in failed. Please try again.");
      setIsLoading(false);
      setProvider(null);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setProvider("email");

    try {
      const domain = email.split("@")[1].toLowerCase();
      const freeProviders = [
        "gmail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "icloud.com",
      ];
      const isBusinessEmail = !freeProviders.includes(domain);

      const userSession = {
        email,
        name: email.split("@")[0],
        businessDomain: isBusinessEmail ? domain : "",
        company: isBusinessEmail ? domain : null,
        authType: "email",
        provider: "email",
      };

      localStorage.setItem("customAuth", JSON.stringify(userSession));
      sessionStorage.setItem("userEmail", email);
      sessionStorage.setItem("businessDomain", isBusinessEmail ? domain : "");

      toast.success(`Signed in with ${isBusinessEmail ? "business" : "personal"} email!`);

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

  const inputDisabled = isLoading && provider === "email";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020710] px-4 text-white">
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
        width={680}
        height={680}
        priority
        className="pointer-events-none select-none absolute -left-40 top-[-10%] h-[680px] w-[680px] opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#050A17]/50 via-transparent to-[#020710]" />

      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-6 top-6 z-20 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/70 transition hover:bg-white/10"
      >
        <X className="size-5" />
      </button>

      <div className="relative z-10 w-full max-w-sm rounded-[32px] border border-white/10 bg-black/70 p-8 shadow-[0_0_18px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-5 h-10 w-28">
            <Image
              src="/logo-vitrina-light.png"
              alt="Vitrina"
              fill
              priority
              className="object-contain"
            />
          </div>
          <p className="text-sm font-medium text-white/70">Log in or sign up to continue</p>
        </div>

        <div className="space-y-5">
          <div>
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              disabled={inputDisabled}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-2xl border border-white/15 bg-white text-sm text-black placeholder-black/50 shadow-[0_0_12px_rgba(0,0,0,0.2)] focus-visible:border-[#2E8AE5] focus-visible:outline-none focus-visible:ring-0"
            />
            <Button
              type="button"
              onClick={handleEmailAuth}
              disabled={isLoading || !email}
              className="mt-3 w-full rounded-xl bg-black py-3 text-sm font-semibold text-white shadow-[0_0_25px_5px_rgba(6,110,214,0.05)] transition hover:bg-black/90 disabled:border disabled:border-white/10 disabled:bg-black/60 disabled:text-white/40"
            >
              {isLoading && provider === "email" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Continuing…</span>
                </span>
              ) : (
                "Continue"
              )}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="bg-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-[0.3em] text-white/40">
              <span className="bg-black/70 px-3">or</span>
            </div>
          </div>

          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/90 py-3 text-sm font-semibold text-black shadow-[0_0_12px_rgba(0,0,0,0.12)] transition hover:bg-white"
          >
            {isLoading && provider === "google" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span>Signing in…</span>
              </span>
            ) : (
              <>
                <Image src="/ic-google.png" alt="Google" width={18} height={18} />
                <span>Continue with Google</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-semibold text-white/60"
          >
            <Image src="/ic-apple.png" alt="Apple" width={18} height={18} />
            <span>Continue with Apple</span>
            <Badge className="ml-auto bg-white/10 text-[10px] uppercase tracking-wider text-white/70">
              Soon
            </Badge>
          </Button>

          <Button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#0A66C2]/40 bg-[#0A66C2]/30 py-3 text-sm font-semibold text-white/70"
          >
            <Image src="/ic-linkedin.png" alt="LinkedIn" width={18} height={18} />
            <span>Continue with LinkedIn</span>
            <Badge className="ml-auto bg-white/10 text-[10px] uppercase tracking-wider text-white/70">
              Soon
            </Badge>
          </Button>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
          By continuing, you agree to our{" "}
          <a href="#" className="text-white/70 underline-offset-2 hover:underline">
            Terms of Service
          </a>{" "}and{" "}
          <a href="#" className="text-white/70 underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          . We use your email domain to tailor ViQi results to your company.
        </p>
      </div>
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
