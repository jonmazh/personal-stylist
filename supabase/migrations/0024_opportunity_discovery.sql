-- Personal Shopper 2.0 · 2.0E: búsquedas ligadas a una oportunidad de estilo (idempotente).
alter table public.shopping_searches add column if not exists opportunity_id uuid references public.style_opportunities(id) on delete set null;
create index if not exists shopping_searches_opportunity_idx on public.shopping_searches (opportunity_id) where opportunity_id is not null;
