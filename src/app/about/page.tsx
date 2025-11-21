
"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import Container from "@/components/Container";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans">
      <Header />

      {/* Hero Section */}
      <section className="py-24 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <Container className="flex flex-col items-center justify-center text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-tight text-neutral-100 mb-6"
          >
            Built by Organisers, <span className="text-blue-400">Made for Climbers</span>
          </motion.h1>
          <p className="text-neutral-400 leading-relaxed max-w-3xl mx-auto">
            GripRank began as an internal project to solve a familiar problem — the chaos of competition day.
            From judging and score entry to live result sharing, we built GripRank to make events smoother, faster, and more transparent.
            Today, it’s trusted by organisers across Boulder and Speed events, with Lead competition support actively in development.
            Our goal: a complete end-to-end platform for every climbing format.
          </p>
        </Container>
      </section>

      {/* Mission Section */}
      <section className="py-20 border-t border-neutral-800 bg-neutral-900/60">
        <Container className="text-center md:text-left">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-neutral-100 mb-6">
            Our Mission
          </h2>
          <p className="text-neutral-400 leading-relaxed max-w-3xl mx-auto md:mx-0">
            To simplify competition management for organisers and make results instantly accessible for climbers — across Boulder, Speed, and soon Lead.
            Our system is built to be fast, fair, and to keep the focus where it belongs: on the climb.
          </p>
        </Container>
      </section>

      {/* Vision Section */}
      <section className="py-20">
        <Container className="text-center md:text-left">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-neutral-100 mb-6">
            Our Vision
          </h2>
          <p className="text-neutral-400 leading-relaxed max-w-3xl mx-auto md:mx-0">
            To become the trusted backbone of climbing competitions worldwide — connecting organisers, judges, and climbers through technology that enhances every discipline of the sport.
            From Boulder and Speed to Lead, GripRank evolves with the community: building smarter tools that keep every event fair, efficient, and connected.
          </p>
          <Button
            asChild
            className="mt-8 bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-2xl shadow-lg shadow-blue-500/20"
          >
            <Link href="https://griprank.com/boulder/leaderboard">
              Explore Live Results
            </Link>
          </Button>
        </Container>
      </section>

      {/* Coming Soon Bar */}
      <section className="py-20 bg-neutral-900 border-y border-neutral-800">
        <Container className="text-center">
          <h3 className="text-2xl font-semibold tracking-tight leading-snug text-neutral-100 mb-6">
            🧰 For Organisers — Coming Soon
          </h3>
          <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto">
            Our organiser dashboard is in pilot testing with partner gyms and event directors.
            Be among the first to simplify your workflow for Boulder and Speed comps — with Lead support coming soon.
          </p>
          <Button
            variant="secondary"
            asChild
            className="mt-8 bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl"
          >
            <Link href="/contact">
              Join the Pilot Program →
            </Link>
          </Button>
        </Container>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800 bg-neutral-950">
        <Container>
          <div className="py-6 text-center text-sm text-neutral-500">
            © 2025 <span className="font-semibold text-blue-400">GripRank</span> — Built by climbers for climbers.
          </div>
        </Container>
      </footer>
    </div>
  );
}
