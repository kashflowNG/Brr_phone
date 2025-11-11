import { 
  type ApkFile, 
  type InsertApkFile,
  apkFiles
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // APK File operations
  createApkFile(apkFile: InsertApkFile): Promise<ApkFile>;
  getApkFile(id: string): Promise<ApkFile | undefined>;
  getAllApkFiles(): Promise<ApkFile[]>;
  deleteApkFile(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // APK File operations
  async createApkFile(insertApkFile: InsertApkFile): Promise<ApkFile> {
    const [apkFile] = await db
      .insert(apkFiles)
      .values(insertApkFile)
      .returning();
    return apkFile;
  }

  async getApkFile(id: string): Promise<ApkFile | undefined> {
    const [apkFile] = await db
      .select()
      .from(apkFiles)
      .where(eq(apkFiles.id, id));
    return apkFile || undefined;
  }

  async getAllApkFiles(): Promise<ApkFile[]> {
    return await db
      .select()
      .from(apkFiles)
      .orderBy(desc(apkFiles.uploadedAt));
  }

  async deleteApkFile(id: string): Promise<boolean> {
    const result = await db
      .delete(apkFiles)
      .where(eq(apkFiles.id, id))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
