"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

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
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="font-extrabold text-2xl tracking-tight text-blue-400">GripRank</div>
        <nav className="hidden md:flex gap-8 text-sm font-medium">
          <a href="/results" className="hover:text-blue-300 transition-colors">Results</a>
          <a href="/about" className="hover:text-blue-300 transition-colors">About</a>
          <a href="/contact" className="text-blue-300 font-semibold">Contact</a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 md:px-20 py-20 text-center bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-black text-neutral-100 mb-6"
        >
          Get in Touch
        </motion.h1>
        <p className="text-lg text-neutral-400 max-w-2xl leading-relaxed">
          Whether you’re an organiser, climber, or fan — we’d love to hear from you. Reach out with questions, feedback, or collaboration ideas.
        </p>
      </section>

      {/* Contact Form */}
      <section className="px-6 md:px-20 py-16 bg-neutral-900/60 flex justify-center border-t border-neutral-800">
        <div className="bg-neutral-900 p-8 md:p-12 rounded-2xl shadow-xl shadow-black/30 border border-neutral-800 w-full max-w-2xl">
          <h2 className="text-2xl font-bold mb-6 text-neutral-100 text-center">Send us a message</h2>
          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Name</label>
              <Input name="name" required placeholder="Your name" className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Email</label>
              <Input name="email" required type="email" placeholder="you@example.com" className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Message</label>
              <Textarea name="message" required placeholder="How can we help?" className="bg-neutral-950 border-neutral-800 text-neutral-100 placeholder:text-neutral-500 min-h-[120px] focus-visible:ring-blue-500" />
            </div>
            <Button type="submit" disabled={status === "loading"} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/20">
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
      </section>

      {/* Additional Info Section */}
      <section className="px-6 md:px-20 py-12 text-center">
        <h3 className="text-xl font-semibold mb-4 text-neutral-100">Other Ways to Reach Us</h3>
        <p className="text-neutral-400 max-w-xl mx-auto mb-2">
          📧 Email: <a href="mailto:hello@griprank.com" className="text-blue-400 hover:underline">hello@griprank.com</a>
        </p>
        <p className="text-neutral-400">
          {/* 💬 Instagram: <a href="https://instagram.com/griprank" target="_blank" className="text-blue-400 hover:underline" rel="noreferrer">@griprank</a> */}
        </p>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800 py-6 text-center text-sm text-neutral-500 bg-neutral-950">
        © 2025 <span className="font-semibold text-blue-400">GripRank</span> — Built by climbers for climbers.
      </footer>
    </div>
  );
}
