import { Database } from "bun:sqlite";
import { hashPassword } from "../auth";
import { randomUUID } from "crypto";

export function newDatabase(pathToDB: string): Database {
  const db = new Database(pathToDB);
  autoMigrate(db);
  return db;
}

function autoMigrate(db: Database) {
  const userTable = `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		password TEXT NOT NULL,
		email TEXT UNIQUE NOT NULL
	);
	`;
  db.exec(userTable);

  const refreshTokenTable = `
	CREATE TABLE IF NOT EXISTS refresh_tokens (
		token TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		revoked_at TIMESTAMP,
		user_id TEXT NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`;
  db.exec(refreshTokenTable);

  const videoTable = `
	CREATE TABLE IF NOT EXISTS videos (
		id TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		title TEXT NOT NULL,
		description TEXT,
		thumbnail_url TEXT,
		video_url TEXT TEXT,
		user_id INTEGER,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`;
  db.exec(videoTable);
}

export function reset(db: Database) {
  db.exec("DELETE FROM refresh_tokens");
  db.exec("DELETE FROM users");
  db.exec("DELETE FROM videos");
}

export async function seedTestUser(
  db: Database,
  email: string,
  password: string,
): Promise<void> {
  // Check if user already exists
  const existingUser = db
    .query("SELECT * FROM users WHERE email = ?")
    .get(email);
  if (existingUser) {
    return undefined;
  }
  // Create test user with hashed password
  const hashedPassword = await hashPassword(password);
  const newID = randomUUID();
  db.run(
    "INSERT INTO users (id, created_at, updated_at, email, password) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)",
    [newID, email, hashedPassword],
  );
}
