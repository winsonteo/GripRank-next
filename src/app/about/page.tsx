
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
            GripRank started as an internal tool to simplify how competitions are managed — from judging and tabulation to live result sharing.
            Designed by people who run comps regularly, our goal is to make climbing competitions smoother, more transparent, and more connected.
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
            We believe every climber deserves clear, live access to results and every organiser deserves tools that reduce the chaos of running a competition.
            GripRank bridges both sides — providing a fast, reliable, and fair system that keeps the community focused on what matters most: the climb.
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
            GripRank aims to become the trusted backbone of climbing competitions — a unified platform connecting organisers, athletes, and fans across regions.
            As the sport grows, so will our ecosystem: smarter analytics, athlete tracking, and community engagement tools are on the horizon.
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
            Our organiser dashboard is currently in testing with select partners. Streamline your event and deliver results instantly — join the waitlist to be first in line.
          </p>
          <Button
            variant="secondary"
            asChild
            className="mt-8 bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl"
          >
            <Link href="/contact">
              Contact Us
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
