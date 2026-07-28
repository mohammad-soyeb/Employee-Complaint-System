-- Multi-user private workspace migration for Employee Complaint System.
-- Run this once in Supabase Dashboard > SQL Editor.
-- Existing shared rows are kept but made invisible because they have no owner.

create extension if not exists "pgcrypto";

alter table public.employees add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.employees add column if not exists designation text;
alter table public.complaint_types add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.complaints add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.letter_templates add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.generated_letters add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.company_settings add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();

-- The same employee ID can now exist safely in different private accounts.
alter table public.employees drop constraint if exists employees_employee_id_key;
create unique index if not exists employees_owner_employee_id_unique on public.employees(owner_id, employee_id);
create unique index if not exists company_settings_one_per_owner on public.company_settings(owner_id);

-- Give every newly registered user an independent starter workspace.
create or replace function public.create_private_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.company_settings (id, owner_id, company_name, company_address, authority_name, authority_designation)
  values (gen_random_uuid(), new.id, 'Your Company', '', 'HR Manager', 'Human Resources')
  on conflict (owner_id) do nothing;

  insert into public.complaint_types (owner_id, name) values
    (new.id, 'Attendance Issue'), (new.id, 'Misconduct'), (new.id, 'Policy Violation');

  insert into public.letter_templates (owner_id, name, subject, body, sort_order) values
    (new.id, 'Official Notice', 'Official Notice', E'Date: {{date}}\n\nTo,\n{{employeeName}}\nEmployee ID: {{employeeId}}\nGrade: {{employeeGrade}}\n\nThe following matter(s) have been recorded:\n{{complaints}}\n\nSincerely,\n{{authorityName}}\n{{authorityDesignation}}\n{{companyName}}', 1),
    (new.id, 'Request for Explanation', 'Request for Explanation', E'Date: {{date}}\n\nDear {{employeeName}},\n\nYou are requested to provide an explanation regarding:\n{{complaints}}\n\nRegards,\n{{authorityName}}\n{{authorityDesignation}}', 2);
  return new;
end;
$$;

drop trigger if exists create_private_workspace_on_signup on auth.users;
create trigger create_private_workspace_on_signup after insert on auth.users
for each row execute procedure public.create_private_workspace();

alter table public.employees enable row level security;
alter table public.complaint_types enable row level security;
alter table public.complaints enable row level security;
alter table public.letter_templates enable row level security;
alter table public.generated_letters enable row level security;
alter table public.company_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['employees','complaint_types','complaints','letter_templates','generated_letters','company_settings'] loop
    execute format('drop policy if exists "HR full access" on public.%I', t);
    execute format('drop policy if exists "Private owner access" on public.%I', t);
    execute format('create policy "Private owner access" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

grant select, insert, update, delete on public.employees, public.complaint_types, public.complaints,
  public.letter_templates, public.generated_letters, public.company_settings to authenticated;
