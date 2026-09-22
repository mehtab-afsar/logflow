import { redirect } from "next/navigation";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { OrganisationSection } from "@/features/settings/components/OrganisationSection";
import { TaxModeSection } from "@/features/settings/components/TaxModeSection";
import { BranchesSection, type BranchRow } from "@/features/settings/components/BranchesSection";
import { PeopleSection, type MemberRow } from "@/features/settings/components/PeopleSection";
import { HomeBranchSection } from "@/features/settings/components/HomeBranchSection";
import type { TaxMode } from "@/lib/tax";

export const dynamic = "force-dynamic";

/**
 * Everything onboarding decided, editable here. Each section is its own
 * component in features/settings/ so the write path for a field lives next
 * to its display — see the API routes under app/api/organisations/.
 */
export default async function SettingsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const [{ data: org }, { data: branches }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", auth.ctx.orgId).single(),
    supabase.from("branches").select("*").order("name"),
    supabase.from("profiles").select("id, full_name, role, home_branch_id").order("full_name"),
    supabase
      .from("org_invites")
      .select("id, email, role, expires_at")
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  // document_sequences is deny-all under RLS, so "has this branch issued
  // anything" can only be answered through the SECURITY DEFINER RPC — a
  // direct read would silently come back empty regardless of the truth.
  const branchRows: BranchRow[] = await Promise.all(
    (branches ?? []).map(async (b) => {
      const { data: locked } = await supabase.rpc("branch_has_issued_documents", {
        p_branch_id: b.id,
      });
      return { ...b, locked: Boolean(locked) };
    }),
  );

  const canEdit = auth.ctx.role === "owner";

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      {org && (
        <OrganisationSection
          org={{
            ...org,
            // bank_details comes back as Json from select("*") — narrowed here
            // rather than in the component, matching how tax_mode is cast on
            // the next line.
            bank_details: org.bank_details as { bank?: string; branch?: string; account?: string; ifsc?: string } | null,
          }}
          canEdit={canEdit}
        />
      )}
      {org && <TaxModeSection mode={org.tax_mode as TaxMode} canEdit={canEdit} />}
      <BranchesSection branches={branchRows} canEdit={canEdit} />
      <HomeBranchSection
        branches={(branches ?? []).filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name }))}
        currentBranchId={members?.find((m) => m.id === auth.ctx.userId)?.home_branch_id ?? null}
      />
      <PeopleSection
        members={(members ?? []) as MemberRow[]}
        invites={invites ?? []}
        canEdit={canEdit}
        currentUserId={auth.ctx.userId}
      />
    </div>
  );
}
