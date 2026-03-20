"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { CopilotChat } from "@/components/copilot/CopilotChat";

function CopilotPageInner() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("q")?.trim() || undefined;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-[40vh] max-w-4xl items-center justify-center px-4">
        <p className="text-stone-600">
          {authLoading ? "Loading…" : "Redirecting…"}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">
          Recruiter copilot
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Ask about your pipeline, priorities, candidates, and follow-ups. Answers
          use live ATS data.
        </p>
      </header>

      <CopilotChat initialPrompt={initialPrompt} />
    </main>
  );
}

export default function CopilotPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[40vh] max-w-4xl items-center justify-center px-4">
          <p className="text-stone-600">Loading…</p>
        </main>
      }
    >
      <CopilotPageInner />
    </Suspense>
  );
}
