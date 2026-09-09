"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface HomeBranchOption {
  id: string;
  name: string;
}

/**
 * Every signed-in user, not just the owner — a dispatcher working out of a
 * second branch needs New LR to default there just as much as the owner
 * does. There is no canEdit gate for that reason; profiles_update (migration
 * 02) already scopes this to the caller's own row.
 *
 * Deliberately its own small card rather than folded into People: this sets
 * MY default, not anyone else's, and the distinction is easy to lose in a
 * list of teammates.
 */
export function HomeBranchSection({
  branches,
  currentBranchId,
}: {
  branches: HomeBranchOption[];
  currentBranchId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function save(branchId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/profiles/home-branch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not save your home branch");
        return;
      }
      toast.success("Home branch updated");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (branches.length < 2) return null; // Nothing to choose between yet.

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <h2 className="text-xs font-medium tracking-wide text-ink-3 uppercase">Your home branch</h2>
      <p className="mt-1 text-xs text-ink-3">
        New lorry receipts default here. Leave unset and the first branch is used instead.
      </p>
      <select
        aria-label="Home branch"
        value={currentBranchId ?? ""}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        className="mt-3 h-11 w-full max-w-xs rounded-lg border border-line bg-white px-2.5 text-sm"
      >
        <option value="">No preference — use the first branch</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </section>
  );
}
