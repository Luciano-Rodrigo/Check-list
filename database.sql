create table if not exists access_workspaces (
  id text primary key,
  owner_user_id text,
  kind text not null default 'personal',
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id text primary key,
  workspace_id text not null references access_workspaces(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  role text not null check (role in ('adm', 'company', 'agent', 'personal')),
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists checklist_models (
  id text primary key,
  workspace_id text not null references access_workspaces(id) on delete cascade,
  owner_user_id text references app_users(id) on delete set null,
  title text not null,
  description text,
  visibility text not null check (visibility in ('public', 'private')),
  category text,
  accent text,
  art_header text,
  border_style text,
  fields jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists checklist_model_assignments (
  model_id text not null references checklist_models(id) on delete cascade,
  agent_user_id text not null references app_users(id) on delete cascade,
  workspace_id text not null references access_workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (model_id, agent_user_id)
);

create table if not exists checklist_submissions (
  id text primary key,
  workspace_id text not null references access_workspaces(id) on delete cascade,
  model_id text,
  task_id text,
  filled_by_user_id text references app_users(id) on delete set null,
  template_title text not null,
  template_category text,
  template_accent text,
  template_art_header text,
  template_border_style text,
  answers jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists daily_tasks (
  id text primary key,
  workspace_id text not null references access_workspaces(id) on delete cascade,
  owner_user_id text references app_users(id) on delete set null,
  assigned_to_user_id text references app_users(id) on delete set null,
  model_id text,
  title text not null,
  recurrence_hours numeric,
  start_hour text,
  end_hour text,
  done boolean not null default false,
  completed_location text,
  last_notified_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash text primary key,
  user_id text not null references app_users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists plan_billing (
  workspace_id text primary key references access_workspaces(id) on delete cascade,
  owner_user_id text not null references app_users(id) on delete cascade,
  customer_id text,
  subscription_id text,
  pix_authorization_id text,
  payment_id text,
  method text,
  status text not null default 'pending',
  paid_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table plan_billing add column if not exists amount numeric(12,2);
alter table plan_billing add column if not exists terms_accepted_at timestamptz;
alter table plan_billing add column if not exists pix_activation_granted boolean not null default false;
alter table plan_billing add column if not exists cancellation_reason text;

create table if not exists checklist_usage (
  submission_id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  usage_day text not null
);
create index if not exists idx_checklist_usage_day on checklist_usage(user_id, usage_day);
insert into checklist_usage(submission_id,user_id,usage_day)
  select id,filled_by_user_id,to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD')
  from checklist_submissions where filled_by_user_id is not null
  on conflict do nothing;

create table if not exists asaas_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);
