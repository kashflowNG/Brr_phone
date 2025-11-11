import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// APK Files Table
export const apkFiles = pgTable("apk_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  path: text("path").notNull(),
});

export const insertApkFileSchema = createInsertSchema(apkFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertApkFile = z.infer<typeof insertApkFileSchema>;
export type ApkFile = typeof apkFiles.$inferSelect;

// Emulator Sessions Table
export const emulatorSessions = pgTable("emulator_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apkFileId: varchar("apk_file_id").notNull(),
  deviceId: text("device_id").notNull(),
  status: text("status").notNull().default("idle"), // idle, initializing, running, stopped, error
  sessionUrl: text("session_url"),
  publicKey: text("public_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
});

export const insertEmulatorSessionSchema = createInsertSchema(emulatorSessions).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  stoppedAt: true,
});

export type InsertEmulatorSession = z.infer<typeof insertEmulatorSessionSchema>;
export type EmulatorSession = typeof emulatorSessions.$inferSelect;

// Device Models (for selection)
export interface DeviceModel {
  id: string;
  name: string;
  manufacturer: string;
  androidVersion: string;
  screenSize: string;
  resolution: string;
  available: boolean;
}

// Session Status Type
export type SessionStatus = "idle" | "initializing" | "running" | "stopped" | "error";
