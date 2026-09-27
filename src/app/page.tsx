import type { Metadata } from "next";
import "./landing.css";
import HelixScene from "@/components/landing/HelixScene";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Graph from "@/components/landing/Graph";
import Safeguards from "@/components/landing/Safeguards";
import Escrow from "@/components/landing/Escrow";
import BuiltWith from "@/components/landing/BuiltWith";
import ClosingCta from "@/components/landing/ClosingCta";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Judr - Too small to litigate. Too big to walk away from.",
  description:
    "Judr arbitrates disputes over escrowed real-world assets with a bounded reasoning graph on SERV: a verdict with a complete audit trail, and a vault that settles against it after an appeal window.",
};

// The escrow section reads IXS's vault list; refresh it with the page every
// ten minutes rather than on every request.
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="lp">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <HelixScene />
      <LandingNav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Graph />
        <Safeguards />
        <Escrow />
        <BuiltWith />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}
