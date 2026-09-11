-- ===========================================================================
-- BUSINESS MODULE — wholesale dress material management
-- ===========================================================================
-- All tables under public schema. RLS enabled on every table.
-- Every table has user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE.
-- Every RLS policy scopes to: user_id = auth.uid().
-- ===========================================================================

-- ===========================================================================
-- TABLE 1: business_lots
-- ===========================================================================
create table if not exists public.business_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  design_no text not null,
  design_photo_url text,
  date_arrived date not null default current_date,
  status text not null default 'arrived' check (status in ('arrived','active','low_stock','cleared','dead_stock')),
  low_stock_threshold integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_lots_user_idx on public.business_lots (user_id, created_at desc);
create index if not exists business_lots_status_idx on public.business_lots (user_id, status);

-- ===========================================================================
-- TABLE 2: business_lot_components
-- ===========================================================================
create table if not exists public.business_lot_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_id uuid not null references public.business_lots(id) on delete cascade,
  component text not null check (component in ('top','bottom','dupatta')),
  opening_metres numeric(10,2) not null default 0,
  sold_metres numeric(10,2) not null default 0,
  cost_per_metre numeric(10,2) default null,
  unique(lot_id, component)
);
create index if not exists business_lot_components_lot_idx on public.business_lot_components (lot_id);
create index if not exists business_lot_components_user_idx on public.business_lot_components (user_id);

-- ===========================================================================
-- TABLE 3: business_parties
-- ===========================================================================
create table if not exists public.business_parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  area text,
  city text,
  phone text,
  gstin text,
  default_payment_days integer default 30,
  default_cd_percent numeric(5,2) default 0,
  default_gst_preference text default 'non_gst' check (default_gst_preference in ('non_gst','gst')),
  credit_limit numeric(12,2) default null,
  notes text default '',
  created_at timestamptz not null default now()
);
create index if not exists business_parties_user_idx on public.business_parties (user_id, name);

-- ===========================================================================
-- TABLE 4: business_rate_cards
-- ===========================================================================
create table if not exists public.business_rate_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  party_id uuid not null references public.business_parties(id) on delete cascade,
  item_name text not null,
  top_rate numeric(10,2),
  bottom_rate numeric(10,2),
  dupatta_rate numeric(10,2),
  discount_percent numeric(5,2) default 0,
  payment_days integer default 30,
  gst_preference text default 'non_gst' check (gst_preference in ('non_gst','gst')),
  unique(party_id, item_name)
);
create index if not exists business_rate_cards_user_idx on public.business_rate_cards (user_id);
create index if not exists business_rate_cards_party_idx on public.business_rate_cards (party_id);

-- ===========================================================================
-- TABLE 5: business_orders
-- ===========================================================================
create table if not exists public.business_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_date date not null default current_date,
  party_id uuid not null references public.business_parties(id),
  lot_id uuid not null references public.business_lots(id),
  item_name text not null,
  design_no text not null,
  top_metres numeric(10,2) not null default 0,
  bottom_metres numeric(10,2) not null default 0,
  dupatta_metres numeric(10,2) not null default 0,
  colours integer not null default 1,
  top_rate numeric(10,2) not null default 0,
  bottom_rate numeric(10,2) not null default 0,
  dupatta_rate numeric(10,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  gst_applied boolean not null default false,
  payment_days integer not null default 30,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_received numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','partial','overdue')),
  due_date date not null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_orders_user_idx on public.business_orders (user_id, created_at desc);
create index if not exists business_orders_party_idx on public.business_orders (user_id, party_id);
create index if not exists business_orders_lot_idx on public.business_orders (user_id, lot_id);
create index if not exists business_orders_status_idx on public.business_orders (user_id, status);

-- ===========================================================================
-- TABLE 6: business_payments
-- ===========================================================================
create table if not exists public.business_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.business_orders(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  cd_applied boolean default false,
  cd_amount numeric(12,2) default 0,
  notes text default '',
  created_at timestamptz not null default now()
);
create index if not exists business_payments_user_idx on public.business_payments (user_id, created_at desc);
create index if not exists business_payments_order_idx on public.business_payments (user_id, order_id);

-- ===========================================================================
-- TABLE 7: business_catalogue
-- ===========================================================================
create table if not exists public.business_catalogue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  design_no text not null,
  photo_url text not null,
  lot_id uuid references public.business_lots(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique(user_id, item_name, design_no)
);
create index if not exists business_catalogue_user_idx on public.business_catalogue (user_id, item_name);
create index if not exists business_catalogue_lot_idx on public.business_catalogue (user_id, lot_id);

-- ===========================================================================
-- TABLE 8: business_morning_briefings
-- ===========================================================================
create table if not exists public.business_morning_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null default current_date,
  content text not null,
  created_at timestamptz not null default now(),
  unique(user_id, briefing_date)
);
create index if not exists business_briefings_user_idx on public.business_morning_briefings (user_id, briefing_date);

-- ===========================================================================
-- FUNCTION 1: recalculate_lot_status()
-- After every INSERT or UPDATE on business_orders:
-- Fetch all components for the lot
-- Calculate remaining = opening - sold for each
-- If all remaining ≤ 5% of opening → 'cleared'
-- If any remaining < low_stock_threshold → 'low_stock'
-- Else if lot has any orders → 'active'
-- Else if lot is 45+ days old with stock above threshold → 'dead_stock'
-- Else → 'arrived'
-- ===========================================================================
create or replace function public.recalculate_lot_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_opening numeric(10,2);
  v_sold numeric(10,2);
  v_remaining numeric(10,2);
  v_threshold integer;
  v_all_cleared boolean := true;
  v_any_low boolean := false;
  v_has_orders boolean := false;
  v_arrival_date date;
  v_days_old integer;
  v_above_threshold boolean := false;
  v_component_record record;
begin
  -- Get the lot_id from the trigger (works on both insert and update)
  if tg_op = 'INSERT' then
    v_lot_id := NEW.lot_id;
  else
    v_lot_id := OLD.lot_id;
  end if;

  -- Check if the lot has any orders
  select exists(select 1 from public.business_orders where lot_id = v_lot_id and user_id = (select auth.uid()))
    into v_has_orders;

  -- Get lot details
  select date_arrived, low_stock_threshold
    into v_arrival_date, v_threshold
    from public.business_lots
    where id = v_lot_id and user_id = (select auth.uid())
    limit 1;

  if v_arrival_date is null then
    return null;
  end if;

  v_days_old := extract(day from age(current_date, v_arrival_date));

  -- Calculate remaining for each component
  for v_component_record in
    select c.component, c.opening_metres, c.sold_metres
    from public.business_lot_components c
    where c.lot_id = v_lot_id and c.user_id = (select auth.uid())
  loop
    v_opening := v_component_record.opening_metres;
    v_sold := v_component_record.sold_metres;
    v_remaining := v_opening - v_sold;

    if v_opening > 0 then
      if v_remaining > (v_opening * 0.05) then
        v_all_cleared := false;
      end if;
      if v_remaining < v_threshold then
        v_any_low := true;
      end if;
      if v_remaining >= v_threshold then
        v_above_threshold := true;
      end if;
    end if;
  end loop;

  -- Determine new status
  if v_all_cleared then
    update public.business_lots set status = 'cleared', updated_at = now()
      where id = v_lot_id and user_id = (select auth.uid());
  elsif v_any_low then
    update public.business_lots set status = 'low_stock', updated_at = now()
      where id = v_lot_id and user_id = (select auth.uid());
  elsif v_has_orders then
    update public.business_lots set status = 'active', updated_at = now()
      where id = v_lot_id and user_id = (select auth.uid());
  elsif v_days_old >= 45 and v_above_threshold then
    update public.business_lots set status = 'dead_stock', updated_at = now()
      where id = v_lot_id and user_id = (select auth.uid());
  else
    update public.business_lots set status = 'arrived', updated_at = now()
      where id = v_lot_id and user_id = (select auth.uid());
  end if;

  return null;
end;
$$;

-- ===========================================================================
-- FUNCTION 2: deduct_stock_on_order()
-- After INSERT on business_orders:
-- Add top_metres × colours to lot component 'top' sold_metres
-- Add bottom_metres × colours to lot component 'bottom' sold_metres
-- Add dupatta_metres × colours to lot component 'dupatta' sold_metres
-- ===========================================================================
create or replace function public.deduct_stock_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_sold numeric(10,2);
  v_bottom_sold numeric(10,2);
  v_dupatta_sold numeric(10,2);
begin
  v_top_sold := NEW.top_metres * NEW.colours;
  v_bottom_sold := NEW.bottom_metres * NEW.colours;
  v_dupatta_sold := NEW.dupatta_metres * NEW.colours;

  if v_top_sold > 0 then
    update public.business_lot_components
    set sold_metres = sold_metres + v_top_sold
    where lot_id = NEW.lot_id and component = 'top'
    and user_id = (select auth.uid());
  end if;

  if v_bottom_sold > 0 then
    update public.business_lot_components
    set sold_metres = sold_metres + v_bottom_sold
    where lot_id = NEW.lot_id and component = 'bottom'
    and user_id = (select auth.uid());
  end if;

  if v_dupatta_sold > 0 then
    update public.business_lot_components
    set sold_metres = sold_metres + v_dupatta_sold
    where lot_id = NEW.lot_id and component = 'dupatta'
    and user_id = (select auth.uid());
  end if;

  -- Recalculate lot status
  perform public.recalculate_lot_status();

  return null;
end;
$$;

-- Create triggers
create trigger trg_deduct_stock_on_order
  after insert on public.business_orders
  for each row
  execute function public.deduct_stock_on_order();

create trigger trg_recalculate_lot_status
  after insert or update on public.business_orders
  for each row
  execute function public.recalculate_lot_status();

-- ===========================================================================
-- FUNCTION 3: refresh_overdue_statuses()
-- Run on app load via API:
-- UPDATE business_orders SET status = 'overdue'
-- WHERE status = 'pending' AND due_date < CURRENT_DATE
-- ===========================================================================
create or replace function public.refresh_overdue_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.business_orders
  set status = 'overdue', updated_at = now()
  where status = 'pending'
    and due_date < current_date
    and user_id = (select auth.uid());
end;
$$;

-- ===========================================================================
-- RLS POLICIES — every table, every operation, scoped to user_id = auth.uid()
-- ===========================================================================

-- business_lots
alter table public.business_lots enable row level security;
create policy "Users can read own lots" on public.business_lots for select using (auth.uid() = user_id);
create policy "Users can insert own lots" on public.business_lots for insert with check (auth.uid() = user_id);
create policy "Users can update own lots" on public.business_lots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own lots" on public.business_lots for delete using (auth.uid() = user_id);

-- business_lot_components
alter table public.business_lot_components enable row level security;
create policy "Users can read own lot components" on public.business_lot_components for select using (auth.uid() = user_id);
create policy "Users can insert own lot components" on public.business_lot_components for insert with check (auth.uid() = user_id);
create policy "Users can update own lot components" on public.business_lot_components for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own lot components" on public.business_lot_components for delete using (auth.uid() = user_id);

-- business_parties
alter table public.business_parties enable row level security;
create policy "Users can read own parties" on public.business_parties for select using (auth.uid() = user_id);
create policy "Users can insert own parties" on public.business_parties for insert with check (auth.uid() = user_id);
create policy "Users can update own parties" on public.business_parties for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own parties" on public.business_parties for delete using (auth.uid() = user_id);

-- business_rate_cards
alter table public.business_rate_cards enable row level security;
create policy "Users can read own rate cards" on public.business_rate_cards for select using (auth.uid() = user_id);
create policy "Users can insert own rate cards" on public.business_rate_cards for insert with check (auth.uid() = user_id);
create policy "Users can update own rate cards" on public.business_rate_cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own rate cards" on public.business_rate_cards for delete using (auth.uid() = user_id);

-- business_orders
alter table public.business_orders enable row level security;
create policy "Users can read own orders" on public.business_orders for select using (auth.uid() = user_id);
create policy "Users can insert own orders" on public.business_orders for insert with check (auth.uid() = user_id);
create policy "Users can update own orders" on public.business_orders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own orders" on public.business_orders for delete using (auth.uid() = user_id);

-- business_payments
alter table public.business_payments enable row level security;
create policy "Users can read own payments" on public.business_payments for select using (auth.uid() = user_id);
create policy "Users can insert own payments" on public.business_payments for insert with check (auth.uid() = user_id);
create policy "Users can update own payments" on public.business_payments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own payments" on public.business_payments for delete using (auth.uid() = user_id);

-- business_catalogue
alter table public.business_catalogue enable row level security;
create policy "Users can read own catalogue" on public.business_catalogue for select using (auth.uid() = user_id);
create policy "Users can insert own catalogue" on public.business_catalogue for insert with check (auth.uid() = user_id);
create policy "Users can update own catalogue" on public.business_catalogue for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own catalogue" on public.business_catalogue for delete using (auth.uid() = user_id);

-- business_morning_briefings
alter table public.business_morning_briefings enable row level security;
create policy "Users can read own briefings" on public.business_morning_briefings for select using (auth.uid() = user_id);
create policy "Users can insert own briefings" on public.business_morning_briefings for insert with check (auth.uid() = user_id);
create policy "Users can update own briefings" on public.business_morning_briefings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own briefings" on public.business_morning_briefings for delete using (auth.uid() = user_id);

-- Updated_at trigger for business_lots (using direct updated_at assignment via trigger logic if needed; for now skip missing helper)
-- If update_updated_at_column is available, run:
-- create trigger trg_lots_updated_at before update on public.business_lots for each row execute function public.update_updated_at_column();
-- create trigger trg_orders_updated_at before update on public.business_orders for each row execute function public.update_updated_at_column();
