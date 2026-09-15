PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS seasons (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, year INTEGER NOT NULL, weeks INTEGER NOT NULL CHECK(weeks BETWEEN 1 AND 53),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
 rules TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, final_snapshot TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seasons_user_year ON seasons(user_id,year DESC);
CREATE TABLE IF NOT EXISTS teams (
 id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 name TEXT NOT NULL COLLATE NOCASE, abbreviation TEXT NOT NULL, color TEXT NOT NULL,
 UNIQUE(season_id,name)
);
CREATE TABLE IF NOT EXISTS players (
 id TEXT PRIMARY KEY, season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
 name TEXT NOT NULL COLLATE NOCASE, jersey TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '',
 UNIQUE(team_id,name,jersey)
);
CREATE INDEX IF NOT EXISTS idx_players_season ON players(season_id);
CREATE TABLE IF NOT EXISTS scores (
 season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
 player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
 week INTEGER NOT NULL CHECK(week BETWEEN 1 AND 53), counts TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
 PRIMARY KEY(season_id,player_id,week)
);
CREATE INDEX IF NOT EXISTS idx_scores_season_week ON scores(season_id,week);
PRAGMA optimize;
