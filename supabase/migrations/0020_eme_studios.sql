-- EME Studios como tienda con conector UCP de solo lectura (EmeStudiosProductSource). Se puede ejecutar varias veces.
insert into public.retailers (slug, name, group_name, domains, url_policy, policy_note, connector) values
  ('eme-studios', 'EME Studios', 'Conectadas por UCP', array['emestudios.com'], 'metadata', 'Catálogo oficial por UCP/MCP en checkout.emestudios.com (search_catalog, get_product, lookup_catalog): solo consulta, bajo demanda, sin carrito ni compra. emestudios.com está tras Cloudflare y no se lee. Imágenes solo enlazadas.', 'ucp')
on conflict (slug) where user_id is null do update set name = excluded.name, group_name = excluded.group_name, domains = excluded.domains, url_policy = excluded.url_policy, policy_note = excluded.policy_note, connector = excluded.connector;
