import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Home, Trophy, ArrowRight } from "lucide-react"

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 overflow-hidden">

      {/* --- BACKGROUND TECH GRID ---
          This creates the subtle "sport-tech" grid pattern
      */}
      <div className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: `linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(to right, #cbd5e1 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      ></div>

      {/* Optional: Radial gradient overlay to soften the edges */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-gray-50 via-transparent to-gray-50/80"></div>

      {/* --- TOP BRANDING --- */}
      <div className="absolute top-8 left-8 z-10 flex items-center gap-3">
        <Image
          src="/logo_header.png"
          alt="GripRank"
          width={200}
          height={61}
          priority
          className="h-8 w-auto"
        />
      </div>

      {/* --- MAIN CARD --- */}
      <Card className="relative z-10 w-full max-w-lg border-slate-200 shadow-xl bg-white/90 backdrop-blur-sm">

        <CardHeader className="flex flex-col items-center pb-2 pt-10">
          {/* ILLUSTRATION */}
          <div className="relative w-full max-w-6xl h-[512px] md:h-[640px] mb-6">
            <Image
              src="/images/climbing-route-404.png"
              alt="Climbing wall with missing hold"
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* H1 HEADLINE */}
          <h1 className="text-3xl md:text-4xl font-bold text-center text-slate-900 tracking-tight">
            404 – Route not found
          </h1>
        </CardHeader>

        <CardContent className="text-center space-y-8 px-8 md:px-12">
          {/* BODY COPY */}
          <p className="text-slate-600 leading-relaxed">
            Looks like you&apos;ve wandered off-route. This page doesn&apos;t exist or the link might be expired. Let&apos;s get you back to base or check the live leaderboards.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center w-full">
            <Button asChild size="lg" className="w-full sm:w-auto font-medium shadow-md transition-all hover:-translate-y-0.5">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto border-slate-300 hover:bg-slate-50">
              <Link href="/boulder/leaderboard">
                <Trophy className="w-4 h-4 mr-2" />
                View Leaderboard
              </Link>
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col items-center pb-8">
           {/* TERTIARY LINK */}
           <Link
            href="/contact"
            className="text-sm text-slate-500 hover:text-blue-600 hover:underline flex items-center gap-1 transition-colors"
          >
            Contact support <ArrowRight className="w-3 h-3" />
          </Link>
        </CardFooter>
      </Card>

      {/* --- BOTTOM TAGLINE --- */}
      <div className="absolute bottom-8 z-10 text-xs text-slate-400 font-medium uppercase tracking-widest">
        GripRank — From Score Sheet to Live Results
      </div>

    </div>
  )
}
