-- Conector UCP (Universal Commerce Protocol) de solo lectura: tiendas cuyo catálogo se consulta por su endpoint MCP oficial.
-- Primera tienda: Grimey (Shopify). Se puede ejecutar varias veces.
alter table public.retailers add column if not exists connector text check (connector is null or connector in ('ucp'));

insert into public.retailers (slug, name, group_name, domains, url_policy, policy_note, connector) values
  ('grimey', 'Grimey', 'Conectadas por UCP', array['grimey.com'], 'metadata', 'Catálogo oficial por UCP/MCP (search_catalog, get_product, lookup_catalog): solo consulta, bajo demanda, sin carrito ni compra. Imágenes solo enlazadas.', 'ucp')
on conflict (slug) where user_id is null do update set name = excluded.name, group_name = excluded.group_name, domains = excluded.domains, url_policy = excluded.url_policy, policy_note = excluded.policy_note, connector = excluded.connector;
