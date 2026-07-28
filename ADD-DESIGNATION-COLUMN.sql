-- Run once in Supabase Dashboard > SQL Editor.
-- This keeps Designation / Job Title values from future Excel imports.
alter table public.employees add column if not exists designation text;
