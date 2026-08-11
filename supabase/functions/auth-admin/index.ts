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

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function json(data: Json, status = 200) {
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

async function requireAdmin(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return null;
  return caller;
}

async function handleRoute(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth-admin\/?/, "");
  const segments = path.split("/").filter(Boolean);
  const resource = segments[0];
  const id = segments[1];

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // ---- CHECK BOOTSTRAP: public, returns whether any users exist ----
  if (resource === "check-bootstrap" && req.method === "GET") {
    const { data: existing } = await supabase.from("app_users").select("id").limit(1);
    return json({ needs_bootstrap: !existing || existing.length === 0 });
  }

  // ---- BOOTSTRAP: create first admin (only if no users exist) ----
  if (resource === "bootstrap" && req.method === "POST") {
    const { data: existing } = await supabase.from("app_users").select("id").limit(1);
    if (existing && existing.length > 0) {
      return json({ error: "System already initialized" }, 403);
    }
    const body = await req.json();
    const { login, password, full_name } = body as { login: string; password: string; full_name: string };
    if (!login || !password || !full_name) return json({ error: "login, password, full_name required" }, 400);

    const syntheticEmail = `${login.toLowerCase()}@registry.local`;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    const { data: appUser, error: dbErr } = await supabase.from("app_users").insert({
      auth_id: authData.user.id,
      full_name,
      login,
      role: "ADMIN",
    }).select().single();
    if (dbErr) return json({ error: dbErr.message }, 400);

    return json({ user: appUser });
  }

  // ---- ME (current user info — any authenticated user, not just admin) ----
  if (resource === "me" && req.method === "GET") {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Authentication required" }, 401);
    return json(caller);
  }

  // ---- COMPANIES: GET is available to any authenticated user ----
  if (resource === "companies" && req.method === "GET") {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Authentication required" }, 401);
    const { data, error } = await supabase.from("companies").select("*").order("name");
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  // ---- All other routes require admin ----
  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "Admin access required" }, 403);

  // ---- COMPANIES (mutations) ----
  if (resource === "companies") {
    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await supabase.from("companies").insert({ name: body.name }).select().single();
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }
    if (req.method === "PUT" && id) {
      const body = await req.json();
      const { data, error } = await supabase.from("companies").update({ name: body.name }).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }
    if (req.method === "DELETE" && id) {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
  }

  // ---- DEPARTMENTS ----
  if (resource === "departments") {
    if (req.method === "GET") {
      const { data, error } = await supabase.from("departments").select("*, department_companies(company_id)").order("name");
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }
    if (req.method === "POST") {
      const body = await req.json();
      const { data: dept, error } = await supabase.from("departments").insert({ name: body.name }).select().single();
      if (error) return json({ error: error.message }, 400);
      if (body.company_ids && body.company_ids.length > 0) {
        const rows = body.company_ids.map((cid: string) => ({ department_id: dept.id, company_id: cid }));
        await supabase.from("department_companies").insert(rows);
      }
      return json(dept);
    }
    if (req.method === "PUT" && id) {
      const body = await req.json();
      const { data, error } = await supabase.from("departments").update({ name: body.name }).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 400);
      // sync companies
      await supabase.from("department_companies").delete().eq("department_id", id);
      if (body.company_ids && body.company_ids.length > 0) {
        const rows = body.company_ids.map((cid: string) => ({ department_id: id, company_id: cid }));
        await supabase.from("department_companies").insert(rows);
      }
      return json(data);
    }
    if (req.method === "DELETE" && id) {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
  }

  // ---- USERS ----
  if (resource === "users") {
    if (req.method === "GET") {
      const { data, error } = await supabase.from("app_users")
        .select("id, full_name, login, role, excel_alias, department_id, created_at, user_companies(company_id)")
        .order("full_name");
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }
    if (req.method === "POST") {
      const body = await req.json();
      const { full_name, login, password, role, excel_alias, department_id, company_ids } = body;
      if (!full_name || !login || !password || !role) return json({ error: "full_name, login, password, role required" }, 400);

      const syntheticEmail = `${login.toLowerCase()}@registry.local`;
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
      });
      if (authErr) return json({ error: authErr.message }, 400);

      const { data: appUser, error: dbErr } = await supabase.from("app_users").insert({
        auth_id: authData.user.id,
        full_name,
        login,
        role,
        excel_alias: excel_alias || null,
        department_id: department_id || null,
      }).select().single();
      if (dbErr) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return json({ error: dbErr.message }, 400);
      }
      if (company_ids && company_ids.length > 0) {
        const rows = company_ids.map((cid: string) => ({ user_id: appUser.id, company_id: cid }));
        await supabase.from("user_companies").insert(rows);
      }
      return json(appUser);
    }
    if (req.method === "PUT" && id) {
      const body = await req.json();
      const { full_name, login, password, role, excel_alias, department_id, company_ids } = body;

      const update: Record<string, unknown> = {};
      if (full_name !== undefined) update.full_name = full_name;
      if (role !== undefined) update.role = role;
      if (excel_alias !== undefined) update.excel_alias = excel_alias;
      if (department_id !== undefined) update.department_id = department_id || null;

      const { data: appUser, error: dbErr } = await supabase.from("app_users").update(update).eq("id", id).select().single();
      if (dbErr) return json({ error: dbErr.message }, 400);

      if (password) {
        const { data: u } = await supabase.from("app_users").select("auth_id").eq("id", id).single();
        if (u?.auth_id) await supabase.auth.admin.updateUserById(u.auth_id, { password });
      }

      if (company_ids !== undefined) {
        await supabase.from("user_companies").delete().eq("user_id", id);
        if (company_ids.length > 0) {
          const rows = company_ids.map((cid: string) => ({ user_id: id, company_id: cid }));
          await supabase.from("user_companies").insert(rows);
        }
      }
      return json(appUser);
    }
    if (req.method === "DELETE" && id) {
      const { data: u } = await supabase.from("app_users").select("auth_id").eq("id", id).single();
      if (u?.auth_id) await supabase.auth.admin.deleteUser(u.auth_id);
      const { error } = await supabase.from("app_users").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
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
