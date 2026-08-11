import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCaller(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, auth_id, role, full_name, login, department_id")
    .eq("auth_id", data.user.id)
    .single();
  return appUser;
}

async function handleRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/documents-api\/?/, "");
  const segments = path.split("/").filter(Boolean);
  const resource = segments[0];

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Authentication required" }, 401);

  // ---- USERS LIST (for author assignment — ADMIN/CHECKER only) ----
  if (resource === "users-list" && req.method === "GET") {
    if (caller.role !== "ADMIN" && caller.role !== "CHECKER1" && caller.role !== "CHECKER2") {
      return json({ error: "Not authorized" }, 403);
    }
    const { data, error } = await supabase.from("app_users")
      .select("id, full_name, login, role")
      .order("full_name");
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  // ---- LIST documents ----
  if (resource === "list" && req.method === "GET") {
    const params = url.searchParams;
    let query = supabase.from("documents").select(`
      id, doc_type, doc_number, doc_number_clean, doc_date, company_id, amount,
      client_name, manager_name, author_raw, assigned_user_id, submission_status,
      checker1_status, checker2_status, is_marked_for_deletion, is_deleted,
      rejection_reason, created_at, updated_at,
      company:company_id(id, name),
      assigned_user:assigned_user_id(id, full_name, login)
    `);

    if (params.get("company_id")) query = query.eq("company_id", params.get("company_id"));
    if (params.get("year")) query = query.gte("doc_date", `${params.get("year")}-01-01`).lte("doc_date", `${params.get("year")}-12-31`);
    if (params.get("month")) {
      const y = params.get("year") || new Date().getFullYear().toString();
      const m = params.get("month")!.padStart(2, "0");
      query = query.gte("doc_date", `${y}-${m}-01`).lte("doc_date", `${y}-${m}-31`);
    }
    if (params.get("day")) {
      const y = params.get("year") || new Date().getFullYear().toString();
      const m = (params.get("month") || "01").padStart(2, "0");
      const d = params.get("day")!.padStart(2, "0");
      query = query.eq("doc_date", `${y}-${m}-${d}`);
    }
    if (params.get("status")) query = query.eq("submission_status", params.get("status"));
    if (params.get("show_deleted") === "true") {
      query = query.eq("is_deleted", true);
    } else {
      query = query.eq("is_deleted", false);
    }

    const { data, error } = await query.order("doc_date", { ascending: false }).limit(50000);
    if (error) return json({ error: error.message }, 400);

    // Filter by role visibility (defense-in-depth; RLS already enforces)
    let filtered = data || [];
    const role = caller.role;
    if (role === "AUTHOR") {
      if (caller.department_id) {
        const { data: deptUsers } = await supabase.from("app_users").select("id").eq("department_id", caller.department_id);
        const deptIds = (deptUsers || []).map((u: { id: string }) => u.id);
        filtered = filtered.filter((d: { assigned_user_id: string | null }) =>
          d.assigned_user_id === caller.id || (d.assigned_user_id && deptIds.includes(d.assigned_user_id))
        );
      } else {
        filtered = filtered.filter((d: { assigned_user_id: string | null }) => d.assigned_user_id === caller.id);
      }
    } else if (role === "DEPT_HEAD") {
      const { data: deptUsers } = await supabase.from("app_users").select("id").eq("department_id", caller.department_id);
      const deptIds = (deptUsers || []).map((u: { id: string }) => u.id);
      filtered = filtered.filter((d: { assigned_user_id: string | null }) => d.assigned_user_id && deptIds.includes(d.assigned_user_id));
    } else if (role === "COMPANY_HEAD") {
      const { data: userComps } = await supabase.from("user_companies").select("company_id").eq("user_id", caller.id);
      const compIds = (userComps || []).map((uc: { company_id: string }) => uc.company_id);
      filtered = filtered.filter((d: { company_id: string }) => compIds.includes(d.company_id));
    }

    return json(filtered);
  }

  // ---- FAST CHECK (trim-zero lookup) — CHECKER/ADMIN only ----
  if (resource === "fast-check" && req.method === "GET") {
    if (caller.role !== "ADMIN" && caller.role !== "CHECKER1" && caller.role !== "CHECKER2") {
      return json({ error: "Not authorized" }, 403);
    }
    const rawInput = url.searchParams.get("q") || "";
    const clean = rawInput.replace(/[^0-9]/g, "").replace(/^0+/, "");
    if (!clean) return json({ results: [] });
    const { data, error } = await supabase.from("documents")
      .select("id, doc_number, doc_number_clean, doc_date, company_id, amount, client_name, author_raw, submission_status, checker1_status, checker2_status, is_marked_for_deletion, assigned_user_id, company:company_id(name)")
      .eq("doc_number_clean", clean)
      .eq("is_deleted", false)
      .limit(20);
    if (error) return json({ error: error.message }, 400);
    return json({ results: data });
  }

  // ---- CHANGE SUBMISSION STATUS ----
  if (resource === "submission-status" && req.method === "POST") {
    const body = await req.json();
    const { document_id, new_status, comment } = body;
    if (!document_id || !new_status) return json({ error: "document_id and new_status required" }, 400);
    const { error } = await supabase.rpc("change_submission_status", {
      p_document_id: document_id, p_new_status: new_status, p_user_id: caller.id, p_comment: comment || null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- SET CHECK STATUS ----
  if (resource === "check-status" && req.method === "POST") {
    const body = await req.json();
    const { document_id, stage, new_status, comment } = body;
    if (!document_id || !stage || !new_status) return json({ error: "document_id, stage, new_status required" }, 400);
    if (caller.role !== "ADMIN" && caller.role !== "CHECKER1" && caller.role !== "CHECKER2") {
      return json({ error: "Not authorized for check status" }, 403);
    }
    if (caller.role === "CHECKER1" && stage !== "checker1") {
      return json({ error: "Checker 1 can only modify their own stage" }, 403);
    }
    if (caller.role === "CHECKER2" && stage !== "checker2") {
      return json({ error: "Checker 2 can only modify their own stage" }, 403);
    }
    const { error } = await supabase.rpc("set_check_status", {
      p_document_id: document_id, p_stage: stage, p_new_status: new_status, p_user_id: caller.id, p_comment: comment || null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- UPDATE DOCUMENT FIELDS (checker edits) ----
  if (resource === "update-fields" && req.method === "POST") {
    const body = await req.json();
    const { document_id, doc_number, amount, client_name, assigned_user_id } = body;
    if (!document_id) return json({ error: "document_id required" }, 400);
    if (caller.role !== "ADMIN" && caller.role !== "CHECKER1" && caller.role !== "CHECKER2") {
      return json({ error: "Not authorized to edit fields" }, 403);
    }
    const { error } = await supabase.rpc("update_document_fields", {
      p_document_id: document_id, p_user_id: caller.id,
      p_doc_number: doc_number || null, p_amount: amount ?? null,
      p_client_name: client_name || null, p_assigned_user_id: assigned_user_id || null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- MARK FOR DELETION ----
  if (resource === "mark-deletion" && req.method === "POST") {
    const body = await req.json();
    const { document_id } = body;
    if (!document_id) return json({ error: "document_id required" }, 400);
    if (caller.role !== "ADMIN" && caller.role !== "CHECKER1" && caller.role !== "CHECKER2") {
      return json({ error: "Not authorized" }, 403);
    }
    const { error } = await supabase.rpc("mark_for_deletion", { p_document_id: document_id, p_user_id: caller.id });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- RESTORE FROM MARKED ----
  if (resource === "restore-marked" && req.method === "POST") {
    const body = await req.json();
    const { document_id } = body;
    if (!document_id) return json({ error: "document_id required" }, 400);
    if (caller.role !== "ADMIN") return json({ error: "Admin only" }, 403);
    const { error } = await supabase.rpc("restore_from_marked", { p_document_id: document_id, p_user_id: caller.id });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- PURGE TO TRASH ----
  if (resource === "purge" && req.method === "POST") {
    const body = await req.json();
    const { document_id } = body;
    if (!document_id) return json({ error: "document_id required" }, 400);
    if (caller.role !== "ADMIN") return json({ error: "Admin only" }, 403);
    const { error } = await supabase.rpc("purge_document", { p_document_id: document_id, p_user_id: caller.id });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- RESTORE FROM TRASH ----
  if (resource === "restore-trash" && req.method === "POST") {
    const body = await req.json();
    const { document_id } = body;
    if (!document_id) return json({ error: "document_id required" }, 400);
    if (caller.role !== "ADMIN") return json({ error: "Admin only" }, 403);
    const { error } = await supabase.rpc("restore_from_trash", { p_document_id: document_id, p_user_id: caller.id });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  // ---- AUDIT HISTORY — role-based visibility ----
  if (resource === "audit" && req.method === "GET") {
    const document_id = url.searchParams.get("document_id");
    if (!document_id) return json({ error: "document_id required" }, 400);

    const { data: doc } = await supabase.from("documents")
      .select("id, assigned_user_id, company_id, is_deleted")
      .eq("id", document_id)
      .single();
    if (!doc) return json({ error: "Document not found" }, 404);

    const role = caller.role;
    const canSee = role === "ADMIN" || role === "CHECKER1" || role === "CHECKER2";
    if (!canSee) {
      if (role === "AUTHOR") {
        if (doc.assigned_user_id !== caller.id) {
          if (caller.department_id) {
            const { data: deptUser } = await supabase.from("app_users")
              .select("id").eq("id", doc.assigned_user_id).eq("department_id", caller.department_id).maybeSingle();
            if (!deptUser) return json({ error: "Not authorized" }, 403);
          } else {
            return json({ error: "Not authorized" }, 403);
          }
        }
      } else if (role === "DEPT_HEAD") {
        if (caller.department_id) {
          const { data: deptUser } = await supabase.from("app_users")
            .select("id").eq("id", doc.assigned_user_id).eq("department_id", caller.department_id).maybeSingle();
          if (!deptUser) return json({ error: "Not authorized" }, 403);
        } else {
          return json({ error: "Not authorized" }, 403);
        }
      } else if (role === "COMPANY_HEAD") {
        const { data: userCompanies } = await supabase.from("user_companies")
          .select("company_id").eq("user_id", caller.id);
        const companyIds = (userCompanies || []).map((uc: { company_id: string }) => uc.company_id);
        if (!companyIds.includes(doc.company_id)) return json({ error: "Not authorized" }, 403);
      } else {
        return json({ error: "Not authorized" }, 403);
      }
    }

    const { data, error } = await supabase.from("audit_logs")
      .select("id, document_id, user_id, action_type, old_value, new_value, comment, created_at, user:user_id(id, full_name, login)")
      .eq("document_id", document_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  // ---- RE-MATCH AUTHORS (admin only) ----
  if (resource === "rematch-authors" && req.method === "POST") {
    if (caller.role !== "ADMIN") return json({ error: "Admin only" }, 403);

    const { data: users } = await supabase.from("app_users").select("id, excel_alias, login, full_name");
    const aliasMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    (users || []).forEach((u: { id: string; excel_alias: string | null; login: string; full_name: string }) => {
      if (u.excel_alias) aliasMap.set(u.excel_alias.toLowerCase().trim(), u.id);
      nameMap.set(u.full_name.toLowerCase().trim(), u.id);
      nameMap.set(u.login.toLowerCase().trim(), u.id);
    });

    const { data: unmatched } = await supabase.from("documents")
      .select("id, author_raw")
      .is("assigned_user_id", null)
      .eq("is_deleted", false);

    let matched = 0;
    for (const doc of (unmatched || []) as Array<{ id: string; author_raw: string }>) {
      const authorLower = (doc.author_raw || "").toLowerCase().trim();
      if (!authorLower) continue;
      let userId: string | null = null;
      if (aliasMap.has(authorLower)) userId = aliasMap.get(authorLower)!;
      else if (nameMap.has(authorLower)) userId = nameMap.get(authorLower)!;
      if (userId) {
        await supabase.from("documents").update({ assigned_user_id: userId }).eq("id", doc.id);
        matched++;
      }
    }

    return json({ success: true, matched, checked: (unmatched || []).length });
  }

  // ---- DASHBOARD COUNTS ----
  if (resource === "counts" && req.method === "GET") {
    const params = url.searchParams;
    let query = supabase.from("documents").select("submission_status, is_deleted, is_marked_for_deletion, checker1_status, checker2_status, assigned_user_id, company_id");
    if (params.get("company_id")) query = query.eq("company_id", params.get("company_id"));
    if (params.get("year")) query = query.gte("doc_date", `${params.get("year")}-01-01`).lte("doc_date", `${params.get("year")}-12-31`);
    if (params.get("month")) {
      const y = params.get("year") || new Date().getFullYear().toString();
      const m = params.get("month")!.padStart(2, "0");
      query = query.gte("doc_date", `${y}-${m}-01`).lte("doc_date", `${y}-${m}-31`);
    }
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 400);
    let rows = (data || []) as Array<{ submission_status: string; is_deleted: boolean; is_marked_for_deletion: boolean; checker1_status: string; checker2_status: string; assigned_user_id: string | null; company_id: string }>;

    // Apply same role-based visibility filter as list endpoint
    const role = caller.role;
    if (role === "AUTHOR") {
      if (caller.department_id) {
        const { data: deptUsers } = await supabase.from("app_users").select("id").eq("department_id", caller.department_id);
        const deptIds = (deptUsers || []).map((u: { id: string }) => u.id);
        rows = rows.filter((r) => r.assigned_user_id === caller.id || (r.assigned_user_id && deptIds.includes(r.assigned_user_id)));
      } else {
        rows = rows.filter((r) => r.assigned_user_id === caller.id);
      }
    } else if (role === "DEPT_HEAD") {
      const { data: deptUsers } = await supabase.from("app_users").select("id").eq("department_id", caller.department_id);
      const deptIds = (deptUsers || []).map((u: { id: string }) => u.id);
      rows = rows.filter((r) => r.assigned_user_id && deptIds.includes(r.assigned_user_id));
    } else if (role === "COMPANY_HEAD") {
      const { data: userComps } = await supabase.from("user_companies").select("company_id").eq("user_id", caller.id);
      const compIds = (userComps || []).map((uc: { company_id: string }) => uc.company_id);
      rows = rows.filter((r) => compIds.includes(r.company_id));
    }

    const counts = {
      total: 0, not_submitted: 0, paper: 0, edo_unsigned: 0, edo_signed: 0,
      confirmed: 0, returned: 0, deleted: 0,
    };
    for (const r of rows) {
      if (r.is_deleted) { counts.deleted++; continue; }
      counts.total++;
      switch (r.submission_status) {
        case "NOT_SUBMITTED": counts.not_submitted++; break;
        case "SUBMITTED_PAPER": counts.paper++; break;
        case "SUBMITTED_EDO_UNSIGNED": counts.edo_unsigned++; break;
        case "SUBMITTED_EDO_SIGNED": counts.edo_signed++; break;
        case "RETURNED": counts.returned++; break;
      }
      if (r.checker1_status === "APPROVED" && r.checker2_status === "APPROVED") counts.confirmed++;
    }
    return json(counts);
  }

  return json({ error: "Not found" }, 404);
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRoute(req);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
