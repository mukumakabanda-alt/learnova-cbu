-- Admin overhaul: drop semester everywhere, add a home for the new
-- Settings tab (homepage text + featured courses). Additive except for
-- the two semester columns — nothing else here touches existing rows.

alter table public.courses drop column if exists semester;
alter table public.profiles drop column if exists semester;

create table if not exists public.site_settings (
  id boolean primary key default true,
  homepage_title text not null default 'Your Learnova library',
  homepage_subtitle text not null default '',
  featured_course_codes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

insert into public.site_settings (id) values (true) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
on public.site_settings for select
using (true);

drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings"
on public.site_settings for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));
