import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Durotto — Real-time meetings, chat & whiteboard",
  description:
    "Video calls, live chat, a collaborative whiteboard and file sharing in one browser tab. Create a room, share a code, and start collaborating.",
};

export default function HomePage() {
  return <LandingPage />;
}
