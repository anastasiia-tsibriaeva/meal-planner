-- =============================================
-- Meal Planner — схема базы данных Supabase (для новой, пустой базы)
-- Запусти этот файл в Supabase SQL Editor.
-- Если база уже есть — запускай migration_column_fix.sql.
-- =============================================

-- Таблица блюд
CREATE TABLE dishes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  meal_types TEXT[] NOT NULL DEFAULT '{}',
  meat_type TEXT NOT NULL DEFAULT 'none',
  difficulty TEXT NOT NULL DEFAULT 'easy',
  cooking_time INTEGER,
  servings_count INTEGER NOT NULL DEFAULT 1,
  weekends_only BOOLEAN NOT NULL DEFAULT FALSE,
  recipe_text TEXT,
  recipe_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица ингредиентов
CREATE TABLE ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL,
  unit TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Таблица недельных меню
CREATE TABLE weekly_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица слотов меню (конкретные блюда по дням и приёмам пищи)
CREATE TABLE menu_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id UUID REFERENCES weekly_menus(id) ON DELETE CASCADE NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL,
  is_leftover BOOLEAN DEFAULT FALSE,
  servings_used INTEGER,
  UNIQUE(menu_id, day_index, meal_type)
);

-- Таблица настроек пользователя
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  pantry_items TEXT[] DEFAULT ARRAY['соль', 'чёрный перец', 'перец чёрный', 'перец молотый'],
  active_days INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  hard_dishes_per_week TEXT NOT NULL DEFAULT '1-2' CHECK (hard_dishes_per_week IN ('1-2', '3-5', 'any')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица списка покупок
CREATE TABLE shopping_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('menu', 'custom')),
  week_start_date DATE,               -- NULL для своих пунктов (source = 'custom')
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Включаем Row Level Security (RLS)
-- =============================================

ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;

-- Политики для dishes
CREATE POLICY "dishes_select" ON dishes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "dishes_insert" ON dishes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dishes_update" ON dishes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "dishes_delete" ON dishes FOR DELETE USING (auth.uid() = user_id);

-- Политики для ingredients (через владельца блюда)
CREATE POLICY "ingredients_select" ON ingredients FOR SELECT USING (
  EXISTS (SELECT 1 FROM dishes WHERE dishes.id = ingredients.dish_id AND dishes.user_id = auth.uid())
);
CREATE POLICY "ingredients_insert" ON ingredients FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM dishes WHERE dishes.id = ingredients.dish_id AND dishes.user_id = auth.uid())
);
CREATE POLICY "ingredients_update" ON ingredients FOR UPDATE USING (
  EXISTS (SELECT 1 FROM dishes WHERE dishes.id = ingredients.dish_id AND dishes.user_id = auth.uid())
);
CREATE POLICY "ingredients_delete" ON ingredients FOR DELETE USING (
  EXISTS (SELECT 1 FROM dishes WHERE dishes.id = ingredients.dish_id AND dishes.user_id = auth.uid())
);

-- Политики для weekly_menus
CREATE POLICY "menus_select" ON weekly_menus FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "menus_insert" ON weekly_menus FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "menus_update" ON weekly_menus FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "menus_delete" ON weekly_menus FOR DELETE USING (auth.uid() = user_id);

-- Политики для menu_slots
CREATE POLICY "slots_select" ON menu_slots FOR SELECT USING (
  EXISTS (SELECT 1 FROM weekly_menus WHERE weekly_menus.id = menu_slots.menu_id AND weekly_menus.user_id = auth.uid())
);
CREATE POLICY "slots_insert" ON menu_slots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM weekly_menus WHERE weekly_menus.id = menu_slots.menu_id AND weekly_menus.user_id = auth.uid())
);
CREATE POLICY "slots_update" ON menu_slots FOR UPDATE USING (
  EXISTS (SELECT 1 FROM weekly_menus WHERE weekly_menus.id = menu_slots.menu_id AND weekly_menus.user_id = auth.uid())
);
CREATE POLICY "slots_delete" ON menu_slots FOR DELETE USING (
  EXISTS (SELECT 1 FROM weekly_menus WHERE weekly_menus.id = menu_slots.menu_id AND weekly_menus.user_id = auth.uid())
);

-- Политики для user_settings
CREATE POLICY "settings_select" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update" ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Политики для shopping_items
CREATE POLICY "shopping_select" ON shopping_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shopping_insert" ON shopping_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shopping_update" ON shopping_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "shopping_delete" ON shopping_items FOR DELETE USING (auth.uid() = user_id);

-- Realtime для синхронизации списка покупок между устройствами
ALTER TABLE shopping_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_items;

-- =============================================
-- Триггер: создаёт настройки при регистрации нового пользователя
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
