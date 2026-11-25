-- =========================================================
-- Skema database Supabase untuk Pilketos SMK Krian 1
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

create extension if not exists pgcrypto;

-- Paslon / kandidat
create table if not exists public.paslon (
  id uuid primary key default gen_random_uuid(),
  number integer not null check (number between 1 and 99),
  ketua text not null check (char_length(ketua) between 1 and 100),
  wakil text not null default '',
  kelas text not null default '',
  visi text not null default '',
  misi text[] not null default '{}',
  foto text not null default '',
  created_at timestamptz not null default now()
);

-- Pengaturan utama (selalu satu baris, id = 1)
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  title text not null default 'Pemilihan Ketua OSIS 2026',
  period text not null default '',
  voting_open boolean not null default true,
  leaderboard_public boolean not null default false,
  results_published boolean not null default false,
  published_at timestamptz,
  published_snapshot jsonb not null default '{}'::jsonb,
  pin_hash text not null default '',
  pin_salt text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Suara. voter_key = hash identitas (nama|kelas|jurusan) -> anti duplikat lintas perangkat.
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  voter_key text not null unique,
  nama text not null,
  kelas text not null,
  jurusan text not null,
  paslon_id uuid not null references public.paslon(id) on delete restrict,
  receipt text not null unique,
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists votes_paslon_idx on public.votes(paslon_id);
create index if not exists votes_created_idx on public.votes(created_at desc);

-- Token captcha yang sudah dipakai (anti replay)
create table if not exists public.captcha_used (
  token_hash text primary key,
  used_at timestamptz not null default now()
);

-- Percobaan login untuk rate limiting
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_idx on public.login_attempts(ip_hash, created_at desc);

-- Bersihkan data lama otomatis (opsional)
create or replace function public.cleanup_old_records() returns void language sql as $$
  delete from public.captcha_used where used_at < now() - interval '1 day';
  delete from public.login_attempts where created_at < now() - interval '1 day';
$$;

-- Keamanan: aktifkan RLS. Service role key melewati RLS, anon tidak bisa membaca apa pun.
alter table public.paslon enable row level security;
alter table public.settings enable row level security;
alter table public.votes enable row level security;
alter table public.captcha_used enable row level security;
alter table public.login_attempts enable row level security;

-- Berikan hak akses ke service_role (dipakai oleh Vercel serverless functions).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Policy RLS untuk service_role agar serverless functions selalu bisa mengakses data.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop policy if exists service_all on public.%I', t);
    execute format('create policy service_all on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

-- Data awal paslon (boleh diubah/dihapus lewat panel admin)
insert into public.paslon (number, ketua, wakil, kelas, visi, misi)
select 1, 'Nama Ketua 1', 'Nama Wakil 1', 'XI RPL 1',
       'Mewujudkan OSIS yang dekat dengan siswa, transparan, dan penuh aksi nyata.',
       array['Membuat forum aspirasi siswa yang rutin dan terbuka.',
             'Mengadakan kegiatan kreatif lintas jurusan.',
             'Meningkatkan transparansi kegiatan OSIS.']
where not exists (select 1 from public.paslon where number = 1);

insert into public.paslon (number, ketua, wakil, kelas, visi, misi)
select 2, 'Nama Ketua 2', 'Nama Wakil 2', 'XI TKJ 2',
       'Membangun sekolah yang nyaman, disiplin, dan penuh prestasi bersama seluruh siswa.',
       array['Menumbuhkan budaya disiplin dan saling menghargai.',
             'Mendukung kegiatan ekstrakurikuler dan lomba.',
             'Menyediakan layanan pengaduan siswa yang responsif.']
where not exists (select 1 from public.paslon where number = 2);
