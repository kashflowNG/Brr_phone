
import { 
  type ApkFile, 
  type InsertApkFile
} from "@shared/schema";

export interface IStorage {
  // APK File operations
  createApkFile(apkFile: InsertApkFile): Promise<ApkFile>;
  getApkFile(id: string): Promise<ApkFile | undefined>;
  getAllApkFiles(): Promise<ApkFile[]>;
  deleteApkFile(id: string): Promise<boolean>;
}

export class LocalStorage implements IStorage {
  private apkFiles: Map<string, ApkFile> = new Map();

  // APK File operations
  async createApkFile(insertApkFile: InsertApkFile): Promise<ApkFile> {
    const apkFile: ApkFile = {
      ...insertApkFile,
      id: insertApkFile.id || crypto.randomUUID(),
      uploadedAt: insertApkFile.uploadedAt || new Date()
    };
    this.apkFiles.set(apkFile.id, apkFile);
    return apkFile;
  }

  async getApkFile(id: string): Promise<ApkFile | undefined> {
    return this.apkFiles.get(id);
  }

  async getAllApkFiles(): Promise<ApkFile[]> {
    const files = Array.from(this.apkFiles.values());
    // Sort by uploadedAt descending
    return files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async deleteApkFile(id: string): Promise<boolean> {
    return this.apkFiles.delete(id);
  }
}

export const storage = new LocalStorage();
