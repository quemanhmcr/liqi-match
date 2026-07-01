insert into public.ranks (slug, name, sort_order)
values
  ('iron', 'Iron', 10),
  ('bronze', 'Bronze', 20),
  ('silver', 'Silver', 30),
  ('gold', 'Gold', 40),
  ('platinum', 'Platinum', 50),
  ('diamond', 'Diamond', 60),
  ('master', 'Master', 70)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

insert into public.roles (slug, name)
values
  ('duelist', 'Duelist'),
  ('initiator', 'Initiator'),
  ('controller', 'Controller'),
  ('sentinel', 'Sentinel'),
  ('support', 'Support')
on conflict (slug) do update
set name = excluded.name;
