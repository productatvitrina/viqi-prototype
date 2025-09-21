"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import useCredits from "@/hooks/useCredits";

interface CreditsBadgeProps {
  className?: string;
  autoRefresh?: boolean;
}

export function CreditsBadge({ className, autoRefresh = true }: CreditsBadgeProps) {
  const { creditSummary, loading } = useCredits(autoRefresh);

  if (loading) {
    return (
      <Badge variant="outline" className={cn("text-xs", className)}>
        Credits: …
      </Badge>
    );
  }

  if (!creditSummary) {
    return null;
  }

  const included = creditSummary.included_credits ?? 0;
  const remaining =
    creditSummary.projected_remaining_credits ?? creditSummary.remaining_credits ?? 0;

  if (!included) {
    return null;
  }

  return (
    <Badge variant="outline" className={cn("text-xs", className)}>
      Credits: {remaining}/{included}
    </Badge>
  );
}

export default CreditsBadge;
