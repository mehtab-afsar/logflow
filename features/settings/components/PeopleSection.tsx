"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordSheet, type FieldDef } from "@/features/masters/components/RecordSheet";

export interface MemberRow {
  id: string;
  full_name: string | null;
  role: "owner" | "dispatcher" | "accounts" | "viewer";
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "accounts", label: "Accounts" },
  { value: "viewer", label: "Viewer" },
] as const;

const INVITE_FIELDS: FieldDef[] = [
  { name: "email", label: "Email", required: true },
  {
    name: "role", label: "Role", kind: "select", required: true, defaultValue: "dispatcher",
    options: ROLES.filter((r) => r.value !== "owner"),
  },
];

/**
 * Role changes go straight through — a single-field select, not worth a full
 * sheet. Deactivating a member is deliberately not offered here: every RLS
 * policy gating a write on has_role() would need its own is_active check
 * too, which is a larger change than "let Settings edit onboarding" implies.
 * See app/api/organisations/members/[id]/route.ts.
 */
export function PeopleSection({
  members,
  invites,
  canEdit,
  currentUserId,
}: {
  members: MemberRow[];
  invites: PendingInvite[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);

  async function changeRole(id: string, role: string) {
    setChangingId(id);
    try {
      const res = await fetch(`/api/organisations/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not change this member's role");
        return;
      }
      toast.success("Role updated");
      router.refresh();
    } finally {
      setChangingId(null);
    }
  }

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-ink-3 uppercase">People</h2>
        {canEdit && (
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" strokeWidth={1.5} />
            Invite teammate
          </Button>
        )}
      </div>

      <ul className="mt-3 divide-y text-sm">
        {members.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span>{p.full_name ?? "—"}</span>
            {canEdit && p.id !== currentUserId ? (
              <select
                value={p.role}
                disabled={changingId === p.id}
                onChange={(e) => changeRole(p.id, e.target.value)}
                className="rounded-md border border-line bg-white px-2 py-1 text-xs capitalize"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs capitalize text-ink-3">
                {p.role}
                {p.id === currentUserId && " (you)"}
              </span>
            )}
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-medium tracking-wide text-ink-3 uppercase">
            Invited, not yet signed in
          </h3>
          <ul className="mt-1.5 divide-y text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-ink-2">
                <span>{i.email}</span>
                <span className="text-xs capitalize text-ink-3">{i.role}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-xs text-ink-3">
        Drivers and customers never get accounts — they use the links you send them.
      </p>

      <RecordSheet
        open={inviting}
        onOpenChange={setInviting}
        title="Invite a teammate"
        description="We email them a sign-in link. No password to set up."
        endpoint="/api/organisations/invites"
        method="POST"
        fields={INVITE_FIELDS}
      />
    </section>
  );
}
