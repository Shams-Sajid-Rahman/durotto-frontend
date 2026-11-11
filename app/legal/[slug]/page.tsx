import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// ── Legal document content ──────────────────────────────────────────────────────

interface Section {
  heading: string;
  body: string[];
}

interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
}

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: "Terms of Service",
    updated: "July 1, 2026",
    intro:
      "These Terms of Service govern your use of Durotto. By creating an account or using the service, you agree to these terms.",
    sections: [
      {
        heading: "1. Using Durotto",
        body: [
          "You must be at least 13 years old to use Durotto. You are responsible for keeping your account credentials secure and for all activity that happens under your account.",
          "You agree not to misuse the service, including attempting to disrupt meetings, access rooms you were not invited to, or upload unlawful content.",
        ],
      },
      {
        heading: "2. Your content",
        body: [
          "You retain ownership of the files, messages, and whiteboard content you create. You grant Durotto a limited license to store and transmit that content solely to provide the service.",
        ],
      },
      {
        heading: "3. Availability",
        body: [
          "Durotto is provided on an “as is” basis. This is an early-access product and features may change, break, or be removed without notice.",
        ],
      },
      {
        heading: "4. Termination",
        body: [
          "You may delete your account at any time. We may suspend accounts that violate these terms.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "July 1, 2026",
    intro:
      "This Privacy Policy explains what information Durotto collects and how it is used.",
    sections: [
      {
        heading: "1. Information we collect",
        body: [
          "Account information such as your name and email address.",
          "Content you create: messages, uploaded files, and whiteboard drawings.",
          "Basic usage data such as which rooms you join and when.",
        ],
      },
      {
        heading: "2. How we use it",
        body: [
          "We use your information to operate the service, sync your data across devices, and keep your account secure. We do not sell your personal information.",
        ],
      },
      {
        heading: "3. Real-time communication",
        body: [
          "Audio and video calls use peer-to-peer WebRTC connections where possible. Signaling metadata passes through our servers to establish connections.",
        ],
      },
      {
        heading: "4. Your rights",
        body: [
          "You can access, export, or delete your data at any time from Settings. Deleting your account removes your personal information from our systems.",
        ],
      },
    ],
  },
  licenses: {
    title: "Open Source Licenses",
    updated: "July 1, 2026",
    intro:
      "Durotto is built on open source software. We are grateful to the maintainers of these projects.",
    sections: [
      {
        heading: "Frontend",
        body: [
          "Next.js — MIT License",
          "React — MIT License",
          "Tailwind CSS — MIT License",
          "Radix UI — MIT License",
          "lucide-react — ISC License",
          "Fabric.js — MIT License",
          "react-hook-form — MIT License",
          "zod — MIT License",
        ],
      },
      {
        heading: "Backend",
        body: [
          "FastAPI — MIT License",
          "SQLAlchemy — MIT License",
          "python-jose — MIT License",
          "passlib — BSD License",
          "slowapi — MIT License",
        ],
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-base">
      <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Settings
        </Link>

        <h1 className="text-[26px] font-semibold text-text-primary">{doc.title}</h1>
        <p className="text-sm text-text-tertiary mt-1">Last updated {doc.updated}</p>

        <p className="text-sm text-text-secondary leading-relaxed mt-6">{doc.intro}</p>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold text-text-primary mb-2">
                {section.heading}
              </h2>
              <div className="space-y-2">
                {section.body.map((para, i) => (
                  <p key={i} className="text-sm text-text-secondary leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
