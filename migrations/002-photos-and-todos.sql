-- ============================================================
--  第二步迁移：留言可以带照片 + 一起做清单
--  在你的 D1 数据库 → 控制台，整段粘贴执行一次。
--
--  如果提示 "duplicate column name: photos"，说明照片那列已经加过了，
--  可以忽略这句，继续执行后面的建表语句。
-- ============================================================

ALTER TABLE messages ADD COLUMN photos TEXT;

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  author      TEXT,
  created_at  TEXT NOT NULL,
  done_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_created ON todos (created_at DESC);
