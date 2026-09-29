-- CallMed Flow — esquema no Supabase CallMed_Plantoes (prefixo flow_)
-- Substitui o app Lovable 108dd79d. Premissas:
--  * Só quem tem flow_profiles.ativo = true enxerga qualquer dado (cadastro público do Auth não dá acesso).
--  * Autoria (created_by / created_by_name) é carimbada pelo banco, não pelo navegador.
--  * Notificações são geradas por trigger (antes falhavam para não-admin).
--  * Excluir médico, mexer em colunas do Kanban, hospitais e usuários = só admin.

-- ---------- membros e papéis ----------
create table public.flow_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  setor text not null default '',
  ativo boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flow_user_roles (
  user_id uuid not null references public.flow_profiles(user_id) on delete cascade,
  role text not null check (role in ('admin','user')),
  primary key (user_id, role)
);

create or replace function public.flow_is_member(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.flow_profiles where user_id = _uid and ativo)
$$;

create or replace function public.flow_is_admin(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.flow_user_roles r join public.flow_profiles p on p.user_id = r.user_id
    where r.user_id = _uid and r.role = 'admin' and p.ativo)
$$;

create or replace function public.flow_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger flow_profiles_touch before update on public.flow_profiles
  for each row execute function public.flow_touch_updated_at();

-- Usuário comum só pode "baixar" o must_change_password (depois de trocar a senha) e editar nome/setor.
create or replace function public.flow_profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.flow_is_admin() then return new; end if;
  if new.ativo is distinct from old.ativo or new.email is distinct from old.email then
    raise exception 'Somente administradores alteram acesso ou e-mail';
  end if;
  if new.must_change_password and not old.must_change_password then
    raise exception 'Não autorizado';
  end if;
  return new;
end $$;
create trigger flow_profiles_guard before update on public.flow_profiles
  for each row execute function public.flow_profiles_guard();

-- ---------- catálogos ----------
create table public.flow_hospitals (
  nome text primary key,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.flow_stages (
  id text primary key,
  label text not null,
  color text not null,
  position int not null default 0,
  sla_hours int not null default 24,
  is_custom boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- médicos (1 linha = 1 médico em 1 hospital) ----------
create table public.flow_doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hospital text not null references public.flow_hospitals(nome) on update cascade,
  cpf text not null default '',
  crm text not null default '',
  estado text not null default 'SP',
  status_especialidade text not null default '' check (status_especialidade in ('','FORMADO','FORMADO C/ RQE','R1','R2','R3')),
  setores text[] not null default '{}',
  rqe text not null default '',
  procuracao boolean not null default false,
  disc text not null default '' check (disc in ('','ADERENTE','NÃO APLICAVEL','REPROVADO','AGUARDANDO RETORNO')),
  medsimples text not null default '',
  cobranca_medsimples text not null default '',
  doc_pendente text not null default '',
  dt_cobranca_doc text not null default '',
  cobranca text not null default '',
  dt_email_enviado text not null default '',
  cobranca2 text not null default '',
  dt_resp_hospital text not null default '',
  stage text not null default 'aguardando_contato' references public.flow_stages(id) on update cascade,
  priority text not null default 'rotina' check (priority in ('rotina','urgente','hospital_novo')),
  app boolean not null default false,
  link_enviado boolean not null default false,
  whatsapp text not null default '',
  observations text not null default '',
  entry_date timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  sla_hours int not null default 24,
  legacy_id uuid unique,               -- id no Lovable (rastreio da migração)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flow_doctors_stage_idx on public.flow_doctors(stage);
create index flow_doctors_hospital_idx on public.flow_doctors(hospital);
create unique index flow_doctors_name_hosp_uk on public.flow_doctors(lower(btrim(name)), hospital);

create trigger flow_doctors_touch before update on public.flow_doctors
  for each row execute function public.flow_touch_updated_at();

create or replace function public.flow_doctors_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_crm text; v_conflict uuid; v_campo text;
begin
  if tg_op = 'INSERT' and new.created_by is null and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  -- duplicidade por CRM no mesmo hospital (nome já é coberto pelo índice único)
  v_crm := regexp_replace(coalesce(new.crm,''), '\D', '', 'g');
  if length(v_crm) >= 3 then
    select id into v_conflict from public.flow_doctors
     where hospital = new.hospital and id <> new.id
       and regexp_replace(coalesce(crm,''), '\D', '', 'g') = v_crm limit 1;
    if v_conflict is not null then
      raise exception 'Duplicidade bloqueada: já existe um cadastro deste médico (por CRM) no hospital "%"', new.hospital
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;
create trigger flow_doctors_before_write before insert or update of name, crm, hospital on public.flow_doctors
  for each row execute function public.flow_doctors_before_write();

-- ---------- documentos do médico ----------
create table public.flow_doctor_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.flow_doctors(id) on delete cascade,
  document_name text not null,
  status text not null default 'nao_enviado' check (status in ('nao_enviado','enviado','aprovado','reprovado')),
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, document_name)
);
create trigger flow_doctor_documents_touch before update on public.flow_doctor_documents
  for each row execute function public.flow_touch_updated_at();

-- ---------- RQE ----------
create table public.flow_rqe_requests (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.flow_doctors(id) on delete cascade,
  specialty text not null default '',
  stage text not null default 'solicitado' check (stage in ('solicitado','documentacao','requerimento','protocolo','em_analise','aprovado','reprovado')),
  stage_entered_at timestamptz not null default now(),
  observations text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger flow_rqe_requests_touch before update on public.flow_rqe_requests
  for each row execute function public.flow_touch_updated_at();

create table public.flow_rqe_documents (
  id uuid primary key default gen_random_uuid(),
  rqe_request_id uuid not null references public.flow_rqe_requests(id) on delete cascade,
  document_name text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rqe_request_id, document_name)
);
create trigger flow_rqe_documents_touch before update on public.flow_rqe_documents
  for each row execute function public.flow_touch_updated_at();

-- ---------- histórico ----------
create table public.flow_activities (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.flow_doctors(id) on delete cascade,
  rqe_request_id uuid references public.flow_rqe_requests(id) on delete cascade,
  description text not null,
  type text not null default 'note' check (type in ('stage_change','note','contact','cobranca','doc','admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index flow_activities_doctor_idx on public.flow_activities(doctor_id, created_at desc);
create index flow_activities_rqe_idx on public.flow_activities(rqe_request_id);
create index flow_activities_created_idx on public.flow_activities(created_at desc);

-- Autoria carimbada pelo banco (a migração roda sem auth.uid() e mantém os valores originais)
create or replace function public.flow_activities_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_by_name := coalesce((select nullif(display_name,'') from public.flow_profiles where user_id = auth.uid()), 'Usuário');
    new.created_at := now();
  end if;
  return new;
end $$;
create trigger flow_activities_stamp before insert on public.flow_activities
  for each row execute function public.flow_activities_stamp();

-- ---------- notificações ----------
create table public.flow_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doctor_id uuid references public.flow_doctors(id) on delete cascade,
  doctor_name text not null default '',
  message text not null,
  created_by_name text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index flow_notifications_user_idx on public.flow_notifications(user_id, created_at desc);

create or replace function public.flow_activities_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text; v_msg text;
begin
  if new.doctor_id is null or new.created_by is null or auth.uid() is null then return new; end if;
  select name into v_nome from public.flow_doctors where id = new.doctor_id;
  if new.type = 'stage_change' and new.description like 'Movido para %' then
    v_msg := format('%s foi movido para "%s"', v_nome, substr(new.description, 13));
  elsif new.type = 'note' and new.description = 'Cadastro atualizado' then
    v_msg := format('Cadastro de %s foi atualizado', v_nome);
  elsif new.type = 'note' then
    v_msg := format('Nova anotação em %s: "%s"', v_nome, left(new.description, 80) || case when length(new.description) > 80 then '...' else '' end);
  else
    return new;
  end if;
  insert into public.flow_notifications (user_id, doctor_id, doctor_name, message, created_by_name)
  select p.user_id, new.doctor_id, coalesce(v_nome,''), v_msg, new.created_by_name
    from public.flow_profiles p where p.ativo and p.user_id <> new.created_by;
  return new;
end $$;
create trigger flow_activities_notify after insert on public.flow_activities
  for each row execute function public.flow_activities_notify();

-- ---------- RPCs ----------
-- Após trocar a senha, o próprio usuário baixa a flag.
create or replace function public.flow_password_changed()
returns void language sql security definer set search_path = public as $$
  update public.flow_profiles set must_change_password = false where user_id = auth.uid();
$$;

-- ---------- RLS ----------
alter table public.flow_profiles enable row level security;
alter table public.flow_user_roles enable row level security;
alter table public.flow_hospitals enable row level security;
alter table public.flow_stages enable row level security;
alter table public.flow_doctors enable row level security;
alter table public.flow_doctor_documents enable row level security;
alter table public.flow_rqe_requests enable row level security;
alter table public.flow_rqe_documents enable row level security;
alter table public.flow_activities enable row level security;
alter table public.flow_notifications enable row level security;

create policy flow_profiles_sel on public.flow_profiles for select to authenticated using (public.flow_is_member() or user_id = auth.uid());
create policy flow_profiles_upd on public.flow_profiles for update to authenticated using (user_id = auth.uid() or public.flow_is_admin()) with check (user_id = auth.uid() or public.flow_is_admin());

create policy flow_roles_sel on public.flow_user_roles for select to authenticated using (public.flow_is_member() or user_id = auth.uid());
create policy flow_roles_adm on public.flow_user_roles for all to authenticated using (public.flow_is_admin()) with check (public.flow_is_admin());

create policy flow_hosp_sel on public.flow_hospitals for select to authenticated using (public.flow_is_member());
create policy flow_hosp_adm on public.flow_hospitals for all to authenticated using (public.flow_is_admin()) with check (public.flow_is_admin());

create policy flow_stages_sel on public.flow_stages for select to authenticated using (public.flow_is_member());
create policy flow_stages_adm on public.flow_stages for all to authenticated using (public.flow_is_admin()) with check (public.flow_is_admin());

create policy flow_doctors_sel on public.flow_doctors for select to authenticated using (public.flow_is_member());
create policy flow_doctors_ins on public.flow_doctors for insert to authenticated with check (public.flow_is_member());
create policy flow_doctors_upd on public.flow_doctors for update to authenticated using (public.flow_is_member()) with check (public.flow_is_member());
create policy flow_doctors_del on public.flow_doctors for delete to authenticated using (public.flow_is_admin());

create policy flow_docs_all on public.flow_doctor_documents for all to authenticated using (public.flow_is_member()) with check (public.flow_is_member());
create policy flow_rqe_sel on public.flow_rqe_requests for select to authenticated using (public.flow_is_member());
create policy flow_rqe_ins on public.flow_rqe_requests for insert to authenticated with check (public.flow_is_member());
create policy flow_rqe_upd on public.flow_rqe_requests for update to authenticated using (public.flow_is_member()) with check (public.flow_is_member());
create policy flow_rqe_del on public.flow_rqe_requests for delete to authenticated using (public.flow_is_admin());
create policy flow_rqedocs_all on public.flow_rqe_documents for all to authenticated using (public.flow_is_member()) with check (public.flow_is_member());

create policy flow_act_sel on public.flow_activities for select to authenticated using (public.flow_is_member());
create policy flow_act_ins on public.flow_activities for insert to authenticated with check (public.flow_is_member() and type <> 'admin');
create policy flow_act_del on public.flow_activities for delete to authenticated using (public.flow_is_admin());

create policy flow_notif_sel on public.flow_notifications for select to authenticated using (user_id = auth.uid());
create policy flow_notif_upd on public.flow_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy flow_notif_del on public.flow_notifications for delete to authenticated using (user_id = auth.uid());

revoke execute on function public.flow_password_changed() from anon, public;
grant execute on function public.flow_password_changed() to authenticated;

alter publication supabase_realtime add table public.flow_notifications;

-- ---------- seeds ----------
insert into public.flow_stages (id, label, color, position, sla_hours) values
 ('aguardando_contato','Aguardando Contato','hsl(270, 60%, 55%)',0,24),
 ('aguardando_medico','Aguardando Retorno Médico','hsl(40, 90%, 55%)',1,24),
 ('enviar_documentos_juridico','Enviar Documentos Jurídico','hsl(35, 85%, 52%)',2,24),
 ('r3','R3','hsl(280, 65%, 55%)',3,24),
 ('aguardando_juridico','Aguardando Jurídico','hsl(30, 80%, 50%)',4,24),
 ('documentacao_pendente','Documentação Pendente','hsl(25, 85%, 55%)',5,24),
 ('documentacao_recebida','Documentação Recebida - Enviar Email','hsl(190, 70%, 45%)',6,24),
 ('aguardando_hospital','Aguardando Retorno Hospital','hsl(210, 80%, 45%)',7,48),
 ('aprovado','Aprovado','hsl(152, 60%, 45%)',8,9999),
 ('reprovado','Reprovado','hsl(0, 72%, 55%)',9,9999);

insert into public.flow_hospitals (nome) values
 ('Ambulatório CM João Azevedo'),('Ambulatório Monte Serrat'),('Centro Médico Guapituba (MAUÁ)'),
 ('Hospital Salvalus – Unidade Avançada'),('Hospital Ana Costa'),('Hospital e Maternidade Ipiranga Mogi'),
 ('Hospital e Maternidade Vitória'),('Hospital Infantil Gonzaga'),('Hospital Monte Serrat'),
 ('Hospital Notrecare ABC'),('Hospital Santa Helena'),('Hospital Santa Cruz'),('Hospital São Bernardo'),
 ('Hospital e Maternidade Arujá'),('Amhemed Sorocaba'),('Hospital Mário Covas'),('Hospital Inter ABC'),
 ('HSH SADT'),('Hospital Unidade Avançada Luz Santo Amaro'),('Hospital Central Oeste - Rede Dor');

-- ---------- migração 2: funções de trigger não expostas via /rpc ----------
revoke execute on function public.flow_activities_notify(), public.flow_activities_stamp(), public.flow_doctors_before_write(), public.flow_profiles_guard(), public.flow_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.flow_is_member(uuid), public.flow_is_admin(uuid) from public, anon;
grant execute on function public.flow_is_member(uuid), public.flow_is_admin(uuid) to authenticated;

-- migração 3
grant execute on function public.flow_is_member(uuid), public.flow_is_admin(uuid) to service_role;
