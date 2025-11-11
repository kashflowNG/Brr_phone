import { 
  type ApkFile, 
  type InsertApkFile,
  type EmulatorSession,
  type InsertEmulatorSession,
  type DeviceModel
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // APK File operations
  createApkFile(apkFile: InsertApkFile): Promise<ApkFile>;
  getApkFile(id: string): Promise<ApkFile | undefined>;
  getAllApkFiles(): Promise<ApkFile[]>;
  deleteApkFile(id: string): Promise<boolean>;

  // Emulator Session operations
  createSession(session: InsertEmulatorSession): Promise<EmulatorSession>;
  getSession(id: string): Promise<EmulatorSession | undefined>;
  getActiveSession(): Promise<EmulatorSession | null>;
  updateSession(id: string, updates: Partial<EmulatorSession>): Promise<EmulatorSession | undefined>;
  deleteSession(id: string): Promise<boolean>;

  // Device operations
  getAllDevices(): Promise<DeviceModel[]>;
}

export class MemStorage implements IStorage {
  private apkFiles: Map<string, ApkFile>;
  private sessions: Map<string, EmulatorSession>;
  private devices: DeviceModel[];

  constructor() {
    this.apkFiles = new Map();
    this.sessions = new Map();
    
    // Initialize with mock devices
    this.devices = [
      {
        id: "pixel-6-pro",
        name: "Pixel 6 Pro",
        manufacturer: "Google",
        androidVersion: "13",
        screenSize: "6.7\"",
        resolution: "1440x3120",
        available: true,
      },
      {
        id: "galaxy-s21",
        name: "Galaxy S21",
        manufacturer: "Samsung",
        androidVersion: "12",
        screenSize: "6.2\"",
        resolution: "1080x2400",
        available: true,
      },
      {
        id: "oneplus-9",
        name: "OnePlus 9",
        manufacturer: "OnePlus",
        androidVersion: "12",
        screenSize: "6.55\"",
        resolution: "1080x2400",
        available: true,
      },
      {
        id: "pixel-5",
        name: "Pixel 5",
        manufacturer: "Google",
        androidVersion: "11",
        screenSize: "6.0\"",
        resolution: "1080x2340",
        available: true,
      },
    ];
  }

  // APK File operations
  async createApkFile(insertApkFile: InsertApkFile): Promise<ApkFile> {
    const id = randomUUID();
    const apkFile: ApkFile = {
      ...insertApkFile,
      id,
      uploadedAt: new Date(),
    };
    this.apkFiles.set(id, apkFile);
    return apkFile;
  }

  async getApkFile(id: string): Promise<ApkFile | undefined> {
    return this.apkFiles.get(id);
  }

  async getAllApkFiles(): Promise<ApkFile[]> {
    return Array.from(this.apkFiles.values()).sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
  }

  async deleteApkFile(id: string): Promise<boolean> {
    return this.apkFiles.delete(id);
  }

  // Emulator Session operations
  async createSession(insertSession: InsertEmulatorSession): Promise<EmulatorSession> {
    const id = randomUUID();
    const session: EmulatorSession = {
      ...insertSession,
      id,
      createdAt: new Date(),
      startedAt: null,
      stoppedAt: null,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<EmulatorSession | undefined> {
    return this.sessions.get(id);
  }

  async getActiveSession(): Promise<EmulatorSession | null> {
    const sessions = Array.from(this.sessions.values());
    const activeSession = sessions.find(
      s => s.status === "running" || s.status === "initializing"
    );
    return activeSession || null;
  }

  async updateSession(id: string, updates: Partial<EmulatorSession>): Promise<EmulatorSession | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  // Device operations
  async getAllDevices(): Promise<DeviceModel[]> {
    return this.devices;
  }
}

export const storage = new MemStorage();
