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
		video_url TEXT,
		file_size INTEGER,
		content_type TEXT,
		user_id TEXT,
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
): Promise<string | undefined> {
  // Check if user already exists
  interface UserRow {
    id: string;
  }
  const existingUser = db
    .query<UserRow, [string]>("SELECT id FROM users WHERE email = ?")
    .get(email);

  let userID: string;

  if (existingUser) {
    userID = existingUser.id;
  } else {
    // Create test user with hashed password
    const hashedPassword = await hashPassword(password);
    userID = randomUUID();
    db.run(
      "INSERT INTO users (id, created_at, updated_at, email, password) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)",
      [userID, email, hashedPassword],
    );
  }

  // Always seed test videos for this user (to ensure test data exists)
  // Note: Seed data uses direct S3 URLs - for production, use presigned URLs for private access
  const testVideos = [
    {
      title: "Test Video 1",
      description: "A test video for bootdev tests",
      thumbnail_url: "https://example.com/thumb1.jpg",
      video_url:
        "https://tubely-19840327.s3.us-east-1.amazonaws.com/testvideo1.mp4",
      file_size: 12345678,
      content_type: "video/mp4",
    },
    {
      title: "Test Video 2",
      description: "Another test video",
      thumbnail_url: "https://example.com/thumb2.jpg",
      video_url:
        "https://tubely-19840327.s3.us-east-1.amazonaws.com/testvideo2.mp4",
      file_size: 87654321,
      content_type: "video/mp4",
    },
  ];

  for (const video of testVideos) {
    const videoID = randomUUID();
    // Use INSERT OR IGNORE to avoid duplicates
    db.run(
      "INSERT OR IGNORE INTO videos (id, created_at, updated_at, title, description, thumbnail_url, video_url, file_size, content_type, user_id) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)",
      [
        videoID,
        video.title,
        video.description,
        video.thumbnail_url,
        video.video_url,
        video.file_size,
        video.content_type,
        userID,
      ],
    );
  }

  return userID;
}
