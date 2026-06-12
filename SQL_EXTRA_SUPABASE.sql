-- Rode este SQL no Supabase > SQL Editor > New query > Run.
-- Ele garante que a tabela tem os campos que o painel ADM usa.

alter table public.projects
add column if not exists category_label text,
add column if not exists type_label text;

-- Deixa os campos antigos preenchidos se já existirem artes cadastradas.
update public.projects
set category_label = coalesce(category_label, category),
    type_label = coalesce(type_label, type)
where category_label is null or type_label is null;