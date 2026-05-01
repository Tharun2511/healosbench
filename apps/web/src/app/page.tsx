"use client";

import Link from "next/link";
import { Button } from "@test-evals/ui/components/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-20 text-center">
      {/* Badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        Clinical NLP Evaluation Framework
      </div>

      {/* Title */}
      <h1 className="mb-4 text-5xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
        HealOSBench
      </h1>

      {/* Subtitle */}
      <p className="mb-8 max-w-md text-base text-muted-foreground leading-relaxed">
        Benchmark LLM prompt strategies on clinical transcript extraction.
        Compare zero-shot, few-shot, and chain-of-thought across structured medical data.
      </p>

      {/* CTA */}
      <div className="flex items-center gap-3">
        <Link href="/runs">
          <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow">
            Start Evaluation
          </Button>
        </Link>
        <Link href="/compare">
          <Button size="lg" variant="outline" className="rounded-full px-8">
            Compare Runs
          </Button>
        </Link>
      </div>

      {/* Feature grid */}
      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
        {[
          { label: "3 Strategies", desc: "Zero-shot · Few-shot · Chain-of-thought" },
          { label: "50 Cases", desc: "Synthetic clinical transcripts with gold labels" },
          { label: "6 Fields", desc: "Vitals · Meds · Diagnoses · Plan · Follow-up" },
        ].map(({ label, desc }) => (
          <div key={label} className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm px-5 py-4 text-left hover:border-border transition-colors">
            <p className="text-sm font-semibold mb-1">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
