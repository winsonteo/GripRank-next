"use client";

import * as React from "react";
import { motion } from "framer-motion";

import Container from "@/components/Container";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage() {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      message: String(formData.get("message") || ""),
    };

    setStatus("loading");
    setErrorMsg("");

    try {
  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error((await res.text()) || "Failed to send");
  setStatus("success");
  form.reset();
} catch (err: unknown) {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong. Please try again.";
  setStatus("error");
  setErrorMsg(message as string);
}

  }

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
            Get in Touch
          </motion.h1>
          <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto">
            We’d love to hear from you — especially if you’re running a Boulder or Speed comp and want to simplify your judging and results.
            Lead organisers — we’d love your feedback too, as that format is in active development.
          </p>
        </Container>
      </section>

      {/* Contact Form */}
      <section className="py-20 border-t border-neutral-800 bg-neutral-900/60">
        <Container className="flex justify-center">
          <div className="bg-neutral-900 p-8 md:p-12 rounded-2xl shadow-xl shadow-black/30 border border-neutral-800 w-full max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-neutral-100 mb-6 text-center">Send us a message</h2>
            <form className="space-y-6" onSubmit={onSubmit}>
              <div>
                <label className="block text-sm font-medium tracking-tight text-neutral-300 mb-2">Name</label>
                <Input
                  name="name"
                  required
                  placeholder="Your name"
                  className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium tracking-tight text-neutral-300 mb-2">Email</label>
                <Input
                  name="email"
                  required
                  type="email"
                  placeholder="you@example.com"
                  className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium tracking-tight text-neutral-300 mb-2">Message</label>
                <Textarea
                  name="message"
                  required
                  placeholder="How can we help?"
                  className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
              <Button type="submit" disabled={status === "loading"} className="w-full mt-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/20">
                {status === "loading" ? "Sending..." : "Send Message"}
              </Button>
              {status === "success" && (
                <p className="text-green-400 text-sm">Thanks! Your message has been sent.</p>
              )}
              {status === "error" && (
                <p className="text-red-400 text-sm">{errorMsg}</p>
              )}
            </form>
          </div>
        </Container>
      </section>

      {/* Additional Info Section */}
      <section className="py-12 text-center">
        <Container>
          <h3 className="text-2xl font-semibold tracking-tight leading-snug text-neutral-100 mb-6">
            Other Ways to Reach Us
          </h3>
          <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto">
            📧 Email:{" "}
            <a
              href="mailto:contact@griprank.com"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
            >
              contact@griprank.com
            </a>
          </p>
          <p className="text-neutral-400 leading-relaxed max-w-2xl mx-auto mt-4">
            {/* 💬 Instagram: <a href="https://instagram.com/griprank" target="_blank" className="text-blue-400 hover:underline" rel="noreferrer">@griprank</a> */}
          </p>
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
