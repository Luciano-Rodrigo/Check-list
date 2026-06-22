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
