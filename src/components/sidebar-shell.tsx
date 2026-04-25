"use client";

import { useEffect } from "react";

import type { SidebarCounts } from "@/lib/sidebar-counts";
import { Sidebar } from "@/components/sidebar";

type Props = {
  counts: SidebarCounts;
};

export function SidebarShell({ counts }: Props) {
  useEffect(() => {
    document.body.classList.add("has-sidebar");
    return () => document.body.classList.remove("has-sidebar");
  }, []);

  return <Sidebar counts={counts} />;
}
