create table if not exists public.burhan_api_key_requests (
  id bigint generated always as identity primary key,
  api_key_id uuid not null references public.burhan_api_keys(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists burhan_api_key_requests_key_time_idx
  on public.burhan_api_key_requests (api_key_id, requested_at desc);

alter table public.burhan_api_key_requests enable row level security;

revoke all on public.burhan_api_key_requests from anon, authenticated;
grant select, insert on public.burhan_api_key_requests to service_role;
