-- Supabase の SQL Editor で実行してください。

-- 購入記録（書き込みは Stripe Webhook の service role のみ。ユーザーは自分の行を読めるだけ）
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null,
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  unique (user_id, tool_id)
);

alter table public.purchases enable row level security;

create policy "own purchases are readable"
  on public.purchases for select
  to authenticated
  using (user_id = auth.uid());

-- 非公開バケット
insert into storage.buckets (id, name, public)
values ('tools', 'tools', false)
on conflict (id) do nothing;

-- 購入済みユーザーだけが、該当ツールのファイルの署名付きURLを発行できる
-- ファイルは tools バケットの "<tool_id>/<ファイル名>" に配置する（例：merge/excel-csv-merge.zip）
create policy "purchasers can read tool files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tools'
    and exists (
      select 1 from public.purchases p
      where p.user_id = auth.uid()
        and p.tool_id = (storage.foldername(name))[1]
    )
  );
