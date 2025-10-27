"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";

import Container from "@/components/Container";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans">
      <Header />

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
              <Link href="https://griprank.com/boulder/leaderboard">
                View Competition Results
              </Link>
            </Button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex-1 flex justify-center"
          >
            <Card className="shadow-xl rounded-2xl border border-neutral-800 bg-neutral-900 w-full max-w-md overflow-hidden">
              <CardContent className="p-0">
                <div className="relative w-full aspect-[9/16]">
                  <Image
                    src="/griprank-on-phone.jpg"
                    alt="GripRank on phone"
                    fill
                    priority
                    sizes="(min-width: 768px) 400px, 90vw"
                    className="object-cover"
                  />
                </div>
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
            For Organisers — Coming Soon
          </h3>
          <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto">
            Streamline your competition from score sheet to leaderboard. GripRank’s organiser tools are in closed testing and launching soon.
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
