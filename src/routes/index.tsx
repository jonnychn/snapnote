import { createFileRoute } from "@tanstack/react-router";
import { SnapnoteApp } from "@/components/snapnote/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SnapnoteApp />;
}
