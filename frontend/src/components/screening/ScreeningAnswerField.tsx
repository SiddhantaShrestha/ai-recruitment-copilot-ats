"use client";

import type { ScreeningQuestion } from "@/types/screening";

type Props = {
  question: ScreeningQuestion;
  value: string;
  onChange: (next: string) => void;
};

export function ScreeningAnswerField({ question, value, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-stone-800">
        {question.order}. {question.question}
      </label>

      {question.type === "TEXT" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          placeholder="Type your answer..."
        />
      )}

      {question.type === "YES_NO" && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="">Select…</option>
          <option value="YES">Yes</option>
          <option value="NO">No</option>
        </select>
      )}

      {question.type === "NUMBER" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          placeholder="Enter a number..."
        />
      )}
    </div>
  );
}

