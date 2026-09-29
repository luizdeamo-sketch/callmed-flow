// CallMed Flow — gestão de usuários (só administradores do Flow).
// Ações: create | reset_password | set_admin | set_active | import
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "Flow-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // quem está chamando?
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ error: "Sessão inválida" }, 401);
  const callerId = who.user.id;
  const { data: isAdmin } = await admin.rpc("flow_is_admin", { _uid: callerId });
  if (!isAdmin) return json({ error: "Somente administradores do Flow" }, 403);
  const { data: callerProf } = await admin.from("flow_profiles").select("display_name").eq("user_id", callerId).maybeSingle();

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { action } = body;

  const log = (description: string) =>
    admin.from("flow_activities").insert({ type: "admin", description, created_by: callerId, created_by_name: callerProf?.display_name || "Admin" });

  const findAuthUserByEmail = async (email: string) => {
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (hit) return hit;
      if (data.users.length < 1000) return null;
    }
    return null;
  };

  try {
    // Carga da migração do Flow antigo (Lovable). Mantém IDs e autoria originais.
    if (action === "import") {
      const allowed = ["flow_doctors", "flow_activities", "flow_doctor_documents"];
      const { table, rows } = body;
      if (!allowed.includes(table) || !Array.isArray(rows) || rows.length > 500) return json({ error: "Lote inválido" }, 400);
      const conflict = table === "flow_doctor_documents" ? "doctor_id,document_name" : "id";
      let ok = 0;
      const errors: { id: string; msg: string }[] = [];
      const { error } = await admin.from(table).upsert(rows, { onConflict: conflict });
      if (!error) ok = rows.length;
      else {
        for (const r of rows) {
          const { error: e2 } = await admin.from(table).upsert(r, { onConflict: conflict });
          if (e2) errors.push({ id: r.id ?? "", msg: e2.message }); else ok++;
        }
      }
      return json({ ok, errors });
    }

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const display_name = String(body.display_name || "").trim();
      const setor = String(body.setor || "");
      if (!/^\S+@\S+\.\S+$/.test(email) || !display_name) return json({ error: "Nome e e-mail válidos são obrigatórios" }, 400);

      let user = await findAuthUserByEmail(email);
      let temp_password: string | null = null;
      if (!user) {
        temp_password = tempPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email, password: temp_password, email_confirm: true, user_metadata: { full_name: display_name },
        });
        if (error) throw error;
        user = data.user;
      }
      const { error: pErr } = await admin.from("flow_profiles").upsert({
        user_id: user!.id, email, display_name, setor, ativo: true, must_change_password: !!temp_password,
      });
      if (pErr) throw pErr;
      const roles = [{ user_id: user!.id, role: "user" }];
      if (body.admin) roles.push({ user_id: user!.id, role: "admin" });
      await admin.from("flow_user_roles").upsert(roles);
      await log(`Usuário criado/liberado: ${display_name} (${email})${body.admin ? " como administrador" : ""}`);
      return json({ ok: true, user_id: user!.id, temp_password });
    }

    const uid = String(body.user_id || "");
    if (!uid) return json({ error: "user_id obrigatório" }, 400);
    if (uid === callerId) return json({ error: "Use outro administrador para alterar seu próprio acesso" }, 400);
    const { data: target } = await admin.from("flow_profiles").select("*").eq("user_id", uid).maybeSingle();
    if (!target) return json({ error: "Usuário não encontrado no Flow" }, 404);

    if (action === "reset_password") {
      const temp_password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(uid, { password: temp_password });
      if (error) throw error;
      await admin.from("flow_profiles").update({ must_change_password: true }).eq("user_id", uid);
      await log(`Senha provisória gerada para ${target.display_name}`);
      return json({ ok: true, temp_password });
    }
    if (action === "set_admin") {
      if (body.admin) await admin.from("flow_user_roles").upsert({ user_id: uid, role: "admin" });
      else await admin.from("flow_user_roles").delete().eq("user_id", uid).eq("role", "admin");
      await log(`${body.admin ? "Deu" : "Removeu"} acesso de administrador: ${target.display_name}`);
      return json({ ok: true });
    }
    if (action === "set_active") {
      await admin.from("flow_profiles").update({ ativo: !!body.ativo }).eq("user_id", uid);
      await log(`${body.ativo ? "Reativou" : "Bloqueou"} o acesso de ${target.display_name}`);
      return json({ ok: true });
    }
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || "Erro interno" }, 500);
  }
});
