-- =============================================
-- Meal Planner — миграция существующей базы до актуальной схемы
-- Безопасно запускать повторно (всё через IF NOT EXISTS / DROP IF EXISTS).
-- Запусти в Supabase SQL Editor.
-- =============================================

-- Колонки, которые использует приложение
ALTER TABLE dishes        ADD COLUMN IF NOT EXISTS weekends_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE menu_slots    ADD COLUMN IF NOT EXISTS servings_used INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_days   INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pantry_items  TEXT[]
  DEFAULT ARRAY['соль', 'чёрный перец', 'перец чёрный', 'перец молотый'];

-- Список покупок
CREATE TABLE IF NOT EXISTS shopping_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('menu', 'custom')),
  week_start_date DATE,               -- NULL для своих пунктов (source = 'custom')
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopping_select" ON shopping_items;
DROP POLICY IF EXISTS "shopping_insert" ON shopping_items;
DROP POLICY IF EXISTS "shopping_update" ON shopping_items;
DROP POLICY IF EXISTS "shopping_delete" ON shopping_items;
CREATE POLICY "shopping_select" ON shopping_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shopping_insert" ON shopping_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shopping_update" ON shopping_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "shopping_delete" ON shopping_items FOR DELETE USING (auth.uid() = user_id);

-- Синхронизация списка между устройствами (Realtime)
ALTER TABLE shopping_items REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shopping_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shopping_items;
  END IF;
END $$;

-- =============================================
-- Исправление дат недель
-- Раньше дата недели считалась в UTC, и недели, созданные при летнем времени (UTC+1),
-- сохранялись с воскресеньем вместо понедельника. Сдвигаем их на понедельник.
-- =============================================
UPDATE weekly_menus
  SET week_start_date = week_start_date::date + 1
  WHERE EXTRACT(ISODOW FROM week_start_date::date) = 7;

UPDATE shopping_items
  SET week_start_date = week_start_date::date + 1
  WHERE week_start_date IS NOT NULL
    AND EXTRACT(ISODOW FROM week_start_date::date) = 7;
