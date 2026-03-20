"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export function AppHeader() {
  const { user, loading, logout, isAuthenticated } = useAuth();

  if (loading) return null;
  if (!isAuthenticated || !user) return null;

  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur px-4 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-5">
          <Link
            href="/candidates"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Pipeline
          </Link>
          <Link
            href="/jobs/create"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Create job
          </Link>
          <Link
            href="/applications/create"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Create application
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/copilot"
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Copilot
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-stone-500">
            {user.fullName}
          </span>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
