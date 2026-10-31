-- Spielerliste für die Partie-Auswertung. Einmal im Supabase SQL Editor ausführen.
-- Angemeldete Nutzer dürfen ihren chess.com-Namen eintragen; lesen darf jeder (die GitHub Action liest mit dem
-- öffentlichen Schlüssel). Ändern oder Löschen geht nur im Supabase-Dashboard.
create table if not exists public.players (
  name text primary key check (name ~ '^[a-z0-9_-]{2,30}$'),
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;
create policy "Namen lesen" on public.players for select to anon, authenticated using (true);
create policy "Namen eintragen" on public.players for insert to authenticated with check (true);
grant select on public.players to anon, authenticated;
grant insert on public.players to authenticated;
