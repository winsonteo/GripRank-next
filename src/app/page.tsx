"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Container from "@/components/Container";
import { motion } from "framer-motion";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50">
        <Container className="flex items-center justify-between py-4">
          <div className="font-extrabold text-2xl tracking-tight text-blue-400">GripRank</div>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <Link
              href="/results"
              className="hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-2 py-1"
            >
              Results
            </Link>
            <Link
              href="/about"
              className="hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-2 py-1"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-2 py-1"
            >
              Contact
            </Link>
          </nav>
          <Button variant="secondary" className="mt-8 bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl">
            For Organisers
          </Button>
        </Container>
      </header>

      {/* Hero Section */}
      <section className="py-24 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <Container className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight text-neutral-100 mb-6">
              From Score Sheet to <span className="text-blue-400">Live Results</span>
            </h1>
            <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto md:mx-0">
              The competition management system built by organisers, made for climbers.
            </p>
            <Button
              size="lg"
              asChild
              className="mt-8 bg-blue-500 hover:bg-blue-600 text-white text-base px-8 py-4 rounded-2xl shadow-lg shadow-blue-500/20"
            >
              <Link href="/results">View Competition Results</Link>
            </Button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex-1 flex justify-center"
          >
            <Card className="shadow-xl rounded-2xl border border-neutral-800 bg-neutral-900 w-full max-w-md">
              <CardContent className="p-8 text-center text-sm text-neutral-400 leading-relaxed">
                <p>📊 Live results view mockup (placeholder image)</p>
              </CardContent>
            </Card>
          </motion.div>
        </Container>
      </section>

      {/* About Section */}
      <section className="py-20 border-t border-neutral-800 bg-neutral-900/60">
        <Container className="text-center md:text-left">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-neutral-100 mb-6">
            What is GripRank?
          </h2>
          <p className="text-neutral-400 leading-relaxed max-w-3xl mx-auto md:mx-0">
            GripRank connects competitions, organisers, and climbers through real-time digital scorekeeping and results.
            Whether you’re following VengaFest or any future event, this is where live results live.
          </p>
          <Button variant="ghost" asChild className="mt-8 text-blue-400 hover:bg-grey-700 hover:text-blue-300">
            <Link href="/about">Learn More About GripRank →</Link>
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
            Streamline your competition from score sheet to leaderboard. GripRank’s organiser tools are in closed testing and launching soon.
          </p>
          <Button
            variant="secondary"
            asChild
            className="mt-8 bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl"
          >
            <Link href="mailto:contact@griprank.com?subject=Organiser%20Waitlist%20Request">
              Get Notified at Launch
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
