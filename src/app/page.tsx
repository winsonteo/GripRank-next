"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="font-extrabold text-2xl tracking-tight text-blue-400">GripRank</div>
        <nav className="hidden md:flex gap-8 text-sm font-medium">
          <a href="/results" className="hover:text-blue-300 transition-colors">Results</a>
          <a href="/about" className="hover:text-blue-300 transition-colors">About</a>
          <a href="/contact" className="hover:text-blue-300 transition-colors">Contact</a>
        </nav>
        <Button variant="outline" className="text-sm border-neutral-700 text-neutral-200 hover:bg-neutral-800">For Organisers</Button>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col md:flex-row items-center justify-between px-6 md:px-20 py-24 gap-12 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 text-neutral-100">
            From Score Sheet to <span className="text-blue-400">Live Results</span>
          </h1>
          <p className="text-lg text-neutral-400 mb-10 max-w-xl">
            The competition management system powering Singapore’s climbing scene. <br />
            Built by organisers, made for climbers.
          </p>
          <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white text-base px-8 py-4 rounded-2xl shadow-lg shadow-blue-500/20">
            View Competition Results
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex-1 flex justify-center"
        >
          <Card className="shadow-xl rounded-2xl border border-neutral-800 bg-neutral-900 w-full max-w-md">
            <CardContent className="p-8 text-center text-sm text-neutral-400">
              <p>📊 Live results view mockup (placeholder image)</p>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* About Section */}
      <section className="px-6 md:px-20 py-20 bg-neutral-900/60 text-center md:text-left border-t border-neutral-800">
        <h2 className="text-3xl font-bold mb-6 text-neutral-100">What is GripRank?</h2>
        <p className="text-neutral-400 max-w-2xl leading-relaxed">
          GripRank connects competitions, organisers, and climbers through real-time digital scorekeeping and results.
          Whether you’re following VengaFest or any future event, this is where live results live.
        </p>
        <Button variant="ghost" className="mt-8 text-blue-400 hover:text-blue-300">Learn More About GripRank →</Button>
      </section>

      {/* Coming Soon Bar */}
      <section className="bg-neutral-900 py-12 px-6 text-center border-y border-neutral-800">
        <h3 className="text-2xl font-semibold mb-3 text-neutral-100">🧰 For Organisers — Coming Soon</h3>
        <p className="text-neutral-400 mb-6 max-w-xl mx-auto leading-relaxed">
          Streamline your competition from score sheet to leaderboard. GripRank’s organiser tools are in closed testing and launching soon.
        </p>
        <Button variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl">
          Get Notified at Launch
        </Button>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800 py-6 text-center text-sm text-neutral-500 bg-neutral-950">
        © 2025 <span className="font-semibold text-blue-400">GripRank</span> — Built by climbers for climbers.
      </footer>
    </div>
  );
}
