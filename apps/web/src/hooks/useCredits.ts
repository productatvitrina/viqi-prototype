"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { api, getCurrentUser } from "@/lib/api";

export interface CreditSummary {
  included_credits: number;
  used_credits: number;
  remaining_credits: number;
  pending_credits: number;
  projected_used_credits: number;
  projected_remaining_credits: number;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_subscription_item_id?: string | null;
  period_start?: number | null;
  period_end?: number | null;
}

interface UseCreditsResult {
  creditSummary: CreditSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setLocalSummary: (summary: CreditSummary | null) => void;
}

const STORAGE_KEY = "creditSummary";

function readStoredSummary(): CreditSummary | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CreditSummary) : null;
  } catch (error) {
    console.warn("Failed to parse stored credit summary", error);
    return null;
  }
}

export function useCredits(autoRefresh: boolean = true): UseCreditsResult {
  const { data: session } = useSession();
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(() => readStoredSummary());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveEmail = useCallback((): string | null => {
    if (session?.user?.email) {
      return session.user.email;
    }

    if (typeof window === "undefined") {
      return null;
    }

    try {
      const customUser = getCurrentUser();
      return customUser?.email ?? null;
    } catch (err) {
      console.warn("Failed to resolve user email for credits", err);
      return null;
    }
  }, [session?.user?.email]);

  const persistSummary = useCallback((summary: CreditSummary | null) => {
    if (typeof window === "undefined") {
      return;
    }

    if (summary) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }

    window.dispatchEvent(new Event("viqi:credits-updated"));
  }, []);

  const setLocalSummary = useCallback(
    (summary: CreditSummary | null) => {
      setCreditSummary(summary);
      persistSummary(summary);
    },
    [persistSummary]
  );

  const fetchCredits = useCallback(async () => {
    const email = resolveEmail();
    if (!email) {
      setCreditSummary(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.users.getCredits(email);
      const summary = response.data as CreditSummary;
      setCreditSummary(summary);
      persistSummary(summary);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // User does not have a metered subscription yet
        setCreditSummary(null);
        persistSummary(null);
        setError(null);
      } else {
        setError(err?.message ?? "Failed to fetch credit summary");
      }
    } finally {
      setLoading(false);
    }
  }, [persistSummary, resolveEmail]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    fetchCredits();
  }, [autoRefresh, fetchCredits]);

  useEffect(() => {
    const handleUpdate = () => {
      setCreditSummary(readStoredSummary());
    };

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("viqi:credits-updated", handleUpdate);
    const handleSignOut = () => {
      setLocalSummary(null);
    };
    window.addEventListener("viqi:sign-out", handleSignOut);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("viqi:credits-updated", handleUpdate);
      window.removeEventListener("viqi:sign-out", handleSignOut);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [setLocalSummary]);

  useEffect(() => {
    if (!session?.user?.email) {
      const localUser = typeof window === "undefined" ? null : getCurrentUser();
      if (!localUser) {
        setLocalSummary(null);
      }
    }
  }, [session?.user?.email, setLocalSummary]);

  return useMemo(
    () => ({
      creditSummary,
      loading,
      error,
      refresh: fetchCredits,
      setLocalSummary,
    }),
    [creditSummary, loading, error, fetchCredits, setLocalSummary]
  );
}

export default useCredits;
