
"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="font-extrabold text-2xl tracking-tight text-blue-400">GripRank</div>
        <nav className="hidden md:flex gap-8 text-sm font-medium">
          <a href="/results" className="hover:text-blue-300 transition-colors">Results</a>
          <a href="/about" className="text-blue-300 font-semibold">About</a>
          <a href="/contact" className="hover:text-blue-300 transition-colors">Contact</a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 md:px-20 py-24 text-center bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-black text-neutral-100 mb-6"
        >
          Built by Organisers, <span className="text-blue-400">Made for Climbers</span>
        </motion.h1>
        <p className="text-lg text-neutral-400 max-w-2xl leading-relaxed">
          GripRank started as an internal tool to simplify how competitions are managed — from judging and tabulation to live result sharing.
          Designed by people who run comps regularly, our goal is to make climbing competitions smoother, more transparent, and more connected.
        </p>
      </section>

      {/* Mission Section */}
      <section className="px-6 md:px-20 py-20 bg-neutral-900/60 text-center md:text-left border-t border-neutral-800">
        <h2 className="text-3xl font-bold mb-6 text-neutral-100">Our Mission</h2>
        <p className="text-neutral-400 max-w-3xl leading-relaxed">
          We believe every climber deserves clear, live access to results and every organiser deserves tools that reduce the chaos of running a competition.
          GripRank bridges both sides — providing a fast, reliable, and fair system that keeps the community focused on what matters most: the climb.
        </p>
      </section>

      {/* Vision Section */}
      <section className="px-6 md:px-20 py-20 text-center md:text-left">
        <h2 className="text-3xl font-bold mb-6 text-neutral-100">Our Vision</h2>
        <p className="text-neutral-400 max-w-3xl leading-relaxed mb-8">
          GripRank aims to become the trusted backbone of climbing competitions — a unified platform connecting organisers, athletes, and fans across regions.
          As the sport grows, so will our ecosystem: smarter analytics, athlete tracking, and community engagement tools are on the horizon.
        </p>
        <Button className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-2xl shadow-lg shadow-blue-500/20">
          Explore Live Results
        </Button>
      </section>

      {/* Coming Soon Bar */}
      <section className="bg-neutral-900 py-12 px-6 text-center border-y border-neutral-800">
        <h3 className="text-2xl font-semibold mb-3 text-neutral-100">🧰 For Organisers — Coming Soon</h3>
        <p className="text-neutral-400 mb-6 max-w-xl mx-auto leading-relaxed">
          Our organiser dashboard is currently in testing with select partners. Streamline your event and deliver results instantly — join the waitlist to be first in line.
        </p>
        <Button variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl">
          Join the Waitlist
        </Button>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800 py-6 text-center text-sm text-neutral-500 bg-neutral-950">
        © 2025 <span className="font-semibold text-blue-400">GripRank</span> — Built by climbers for climbers.
      </footer>
    </div>
  );
}
