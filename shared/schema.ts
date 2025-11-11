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
