import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { createConsignmentSchema } from "@/features/consignments/schemas/consignment";
import { computeTax } from "@/lib/tax";
import { toPaise, fromPaise } from "@/lib/money";
import { ewbValidUntil } from "@/lib/india/eway-bill";

export const runtime = "nodejs";

const LIST_COLUMNS =
  "id, lr_no, lr_date, status, origin_city, destination_city, cargo_description, " +
  "taxable_value, invoice_total, freight_terms, consignor_snapshot, consignee_snapshot, " +
  "vehicle_id, driver_id, ewb_no, ewb_valid_until, bill_id, created_at";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = 50;

  // RLS scopes this to the caller's organisation; the filters are UX only.
  let query = supabase
    .from("consignments")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("lr_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const status = sp.get("status");
  if (status) query = query.eq("status", status);
  const from = sp.get("from");
  if (from) query = query.gte("lr_date", from);
  const to = sp.get("to");
  if (to) query = query.lte("lr_date", to);
  const party = sp.get("party");
  if (party) query = query.or(`consignor_party_id.eq.${party},consignee_party_id.eq.${party}`);
  const vehicle = sp.get("vehicle");
  if (vehicle) query = query.eq("vehicle_id", vehicle);
  const q = sp.get("q");
  if (q) query = query.ilike("lr_no", `%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    log.error("GET /api/consignments", { err: error.message });
    return apiErr("Could not load the register", 500);
  }

  return apiOk({ rows: data, count: count ?? 0, page, pageSize });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!["owner", "dispatcher"].includes(auth.ctx.role)) {
    return apiErr("Creating a lorry receipt requires the owner or dispatcher role", 403);
  }

  const parsed = await parseBody(req, createConsignmentSchema);
  if (!parsed.ok) return apiErr(parsed.error, 400);
  const input = parsed.data;

  const supabase = await createClient();

  try {
    // The organisation's tax footing and registered state drive the tax lines.
    const { data: org } = await supabase
      .from("organisations")
      .select("id, tax_mode, state_code")
      .eq("id", auth.ctx.orgId)
      .single();
    if (!org) return apiErr("Organisation not found", 404);

    // Freeze both parties onto the LR. RLS guarantees they are ours.
    const { data: parties } = await supabase
      .from("parties")
      .select("id, name, gstin, state_code, phone, addresses")
      .in("id", [input.consignor_party_id, input.consignee_party_id]);

    const consignor = parties?.find((p) => p.id === input.consignor_party_id);
    const consignee = parties?.find((p) => p.id === input.consignee_party_id);
    if (!consignor || !consignee) return apiErr("Consignor or consignee not found", 400);

    const firstAddress = (p: typeof consignor) => {
      const list = Array.isArray(p.addresses) ? (p.addresses as Record<string, string>[]) : [];
      const a = list[0];
      if (!a) return null;
      return [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(", ");
    };

    const snapshot = (p: typeof consignor) => ({
      name: p.name,
      gstin: p.gstin,
      state_code: p.state_code,
      phone: p.phone,
      address: firstAddress(p),
    });

    // Place of supply for a registered recipient is the consignee's state; fall
    // back to the destination state when the consignee is unregistered.
    const placeOfSupply = consignee.state_code ?? input.destination_state;

    const taxableValuePaise = toPaise(
      input.freight + input.loading + input.unloading + input.detention + input.other_charges,
    );

    const tax = computeTax({
      taxableValuePaise,
      mode: org.tax_mode as "rcm" | "fcm_5" | "fcm_18",
      supplierStateCode: org.state_code,
      placeOfSupplyStateCode: placeOfSupply,
      exemptGoods: input.exempt_goods,
    });

    const lrDate = input.lr_date ?? new Date().toISOString().slice(0, 10);
    const ewb = input.ewb_no && input.ewb_no.length === 12 ? input.ewb_no : null;

    const { data, error } = await supabase
      .from("consignments")
      .insert({
        org_id: auth.ctx.orgId,
        branch_id: input.branch_id,
        created_by: auth.ctx.userId,
        lr_date: lrDate,
        consignor_party_id: input.consignor_party_id,
        consignor_snapshot: snapshot(consignor),
        consignee_party_id: input.consignee_party_id,
        consignee_snapshot: snapshot(consignee),
        origin_city: input.origin_city,
        origin_state: input.origin_state,
        destination_city: input.destination_city,
        destination_state: input.destination_state,
        distance_km: input.distance_km ?? null,
        cargo_description: input.cargo_description,
        packages_count: input.packages_count,
        packages_unit: input.packages_unit,
        actual_weight_kg: input.actual_weight_kg ?? null,
        charged_weight_kg: input.charged_weight_kg ?? null,
        declared_value: input.declared_value,
        hsn_code: input.hsn_code ?? null,
        customer_invoice_no: input.customer_invoice_no ?? null,
        customer_invoice_date: input.customer_invoice_date ?? null,
        ewb_no: ewb,
        ewb_valid_until:
          ewb && input.distance_km
            ? ewbValidUntil(input.distance_km, new Date()).toISOString()
            : null,
        freight_basis: input.freight_basis,
        freight_rate: input.freight_rate ?? null,
        freight: input.freight,
        loading: input.loading,
        unloading: input.unloading,
        detention: input.detention,
        other_charges: input.other_charges,
        tax_mode: org.tax_mode,
        exempt_goods: input.exempt_goods,
        tax_rate_pct: tax.ratePct,
        cgst_amount: fromPaise(tax.cgstPaise),
        sgst_amount: fromPaise(tax.sgstPaise),
        igst_amount: fromPaise(tax.igstPaise),
        invoice_total: fromPaise(tax.invoiceTotalPaise),
        tax_snapshot: {
          mode: org.tax_mode,
          supplier_state: org.state_code,
          pos_state: placeOfSupply,
          exempt: input.exempt_goods,
          rate_pct: tax.ratePct,
          reason: tax.reason,
          note: tax.note,
          computed_at: new Date().toISOString(),
        },
        freight_terms: input.freight_terms,
        advance_received: input.advance_received,
        vehicle_id: input.vehicle_id ?? null,
        driver_id: input.driver_id ?? null,
        delivery_instructions: input.delivery_instructions ?? null,
        remarks: input.remarks ?? null,
        eta_text: input.eta_text ?? null,
      })
      // lr_no is filled in by the BEFORE INSERT trigger.
      .select("id, lr_no, lr_date, status, tracking_token")
      .single();

    if (error) {
      log.error("POST /api/consignments", { err: error.message });
      return apiErr("Could not create the lorry receipt", 500);
    }

    return apiOk(data, 201);
  } catch (err) {
    log.error("POST /api/consignments threw", { err: String(err) });
    return apiErr("Could not create the lorry receipt", 500);
  }
}
