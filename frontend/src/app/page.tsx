import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <h1 className="text-3xl font-bold text-stone-900 tracking-tight">
        Recruitment Automation
      </h1>
      <p className="mt-3 text-stone-600 leading-relaxed">
        Manage applications, move candidates through the pipeline, and get help from the recruiter copilot.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/candidates"
          className="inline-flex items-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
        >
          Go to pipeline
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/copilot"
          className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
        >
          Recruiter copilot
        </Link>
      </div>
    </main>
  );
}

