'use client';

import { UserButton, useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import Container from "@/components/Container";

export default function JudgePage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <main className="py-12 text-foreground bg-background min-h-screen">
        <Container>
          <div className="text-center">Loading...</div>
        </Container>
      </main>
    );
  }

  return (
    <main className="py-12 text-foreground bg-background min-h-screen">
      <Container className="space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-block">
              <Image
                src="/logo_header.png"
                alt="GripRank"
                width={4001}
                height={1228}
                priority
                className="h-11 w-auto"
              />
            </Link>
            <span className="text-muted-foreground">Judge Console</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Judge Station Panel */}
        <section className="rounded-2xl border border-border bg-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Judge Station</h2>
            <span className="text-sm text-muted-foreground">
              Select station details
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-muted-foreground">
              Competition
              <select className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none">
                <option value="">Select competition</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-muted-foreground">
              Category
              <select className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none">
                <option value="">Select category</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-muted-foreground">
              Round
              <select className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground focus:border-ring focus:outline-none">
                <option value="qualification">Qualification</option>
                <option value="final">Final</option>
              </select>
            </label>
          </div>
        </section>

        {/* Coming Soon Notice */}
        <section className="rounded-2xl border border-border bg-card p-8 text-center">
          <h3 className="text-xl font-semibold mb-2">Judge Console</h3>
          <p className="text-muted-foreground">
            Full judge functionality coming soon...
          </p>
        </section>
      </Container>
    </main>
  );
}
