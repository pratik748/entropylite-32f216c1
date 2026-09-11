alter table public.api_credentials rename column provider to name;
alter table public.api_credentials rename column key_value to value;
alter table public.api_credentials drop column status;
alter table public.api_credentials add column if not exists is_active boolean not null default true;
alter table public.api_credentials add column if not exists created_by uuid;
create unique index if not exists api_credentials_name_key on public.api_credentials (name);