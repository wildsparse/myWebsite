-- 地图上点亮的地方。跑法同前几个迁移：
-- Cloudflare → 存储和数据库 → D1 → 你的库 → 控制台，整段贴进去执行。

CREATE TABLE IF NOT EXISTS places (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  x          REAL NOT NULL,      -- 在那张中国地图上的横向位置，百分比
  y          REAL NOT NULL,      -- 纵向位置，百分比
  kind       TEXT,               -- 'home' 表示现在住的地方
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS place_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id   INTEGER NOT NULL,
  photo      TEXT NOT NULL,      -- 压缩后的 data:image/jpeg;base64,...
  caption    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_places_created ON places (created_at ASC);
CREATE INDEX IF NOT EXISTS idx_place_photos ON place_photos (place_id, created_at ASC);
