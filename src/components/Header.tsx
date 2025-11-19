"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Container from "@/components/Container";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href
      ? "text-blue-300"
      : "hover:text-blue-300 text-neutral-200";

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md">
      <Container className="flex items-center justify-between py-4">
        <Link
          href="/"
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
        >
          <Image
            src="/logo_header.png"
            alt="GripRank"
            width={4001}
            height={1228}
            priority
            className="h-12 md:h-14 w-auto"
          />
          <span className="sr-only">GripRank</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link
            href="https://griprank.com/boulder/leaderboard"
            className={`${isActive("/leaderboard")} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md`}
          >
            Results
          </Link>
          <Link
            href="/about"
            className={`${isActive("/about")} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md`}
          >
            About
          </Link>
          <Link
            href="/contact"
            className={`${isActive("/contact")} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md`}
          >
            Contact
          </Link>
        </nav>

        {/* Right CTA (restored styles) */}
        <Button
          variant="secondary"
          asChild
          className="bg-blue-500 text-white hover:bg-blue-600 font-semibold px-6 py-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
        >
          <Link href="https://griprank.com/boulder/leaderboard">Live Results</Link>
        </Button>
      </Container>
    </header>
  );
}
