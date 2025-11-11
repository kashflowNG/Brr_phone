import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { insertApkFileSchema, insertEmulatorSessionSchema } from "@shared/schema";
import { EmulatorService } from "./emulator-service.js";

// Configure multer for APK uploads
const uploadDir = path.join(process.cwd(), "uploads");

// Ensure upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".apk") {
      return cb(new Error("Only APK files are allowed"));
    }
    cb(null, true);
  },
});

const emulatorService = new EmulatorService();

export async function registerRoutes(app: Express): Promise<Server> {
  // APK File routes
  app.get("/api/apk-files", async (req, res) => {
    try {
      const apkFiles = await storage.getAllApkFiles();
      res.json(apkFiles);
    } catch (error) {
      console.error("Error fetching APK files:", error);
      res.status(500).json({ error: "Failed to fetch APK files" });
    }
  });

  app.post("/api/apk-files/upload", upload.single("apk"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const apkData = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
      };

      const validatedData = insertApkFileSchema.parse(apkData);
      const apkFile = await storage.createApkFile(validatedData);

      res.status(201).json(apkFile);
    } catch (error) {
      console.error("Error uploading APK:", error);
      res.status(500).json({ error: "Failed to upload APK file" });
    }
  });

  app.delete("/api/apk-files/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const apkFile = await storage.getApkFile(id);

      if (!apkFile) {
        return res.status(404).json({ error: "APK file not found" });
      }

      // Delete file from filesystem
      try {
        await fs.unlink(apkFile.path);
      } catch (err) {
        console.error("Error deleting file:", err);
      }

      const deleted = await storage.deleteApkFile(id);
      if (!deleted) {
        return res.status(404).json({ error: "APK file not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting APK:", error);
      res.status(500).json({ error: "Failed to delete APK file" });
    }
  });

  // Device routes
  app.get("/api/devices", async (req, res) => {
    try {
      const devices = await storage.getAllDevices();
      res.json(devices);
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });

  // Session routes
  app.get("/api/session/active", async (req, res) => {
    try {
      const session = await storage.getActiveSession();
      res.json(session);
    } catch (error) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ error: "Failed to fetch active session" });
    }
  });

  app.post("/api/session/start", async (req, res) => {
    try {
      const sessionData = insertEmulatorSessionSchema.parse(req.body);

      // Check if there's already an active session
      const activeSession = await storage.getActiveSession();
      if (activeSession) {
        return res.status(409).json({
          error: "An emulator session is already running. Please stop it first.",
        });
      }

      // Create session in initializing state
      const session = await storage.createSession({
        ...sessionData,
        status: "initializing",
      });

      // Start emulator session (async - returns streaming URL)
      const apkFile = await storage.getApkFile(sessionData.apkFileId);
      if (!apkFile) {
        await storage.updateSession(session.id, { status: "error" });
        return res.status(404).json({ error: "APK file not found" });
      }

      try {
        const { sessionUrl, publicKey } = await emulatorService.startSession(
          session.id,
          apkFile.path,
          sessionData.deviceId
        );

        // Update session with streaming URL, publicKey and set status to running
        const updatedSession = await storage.updateSession(session.id, {
          sessionUrl,
          publicKey,
          status: "running",
          startedAt: new Date(),
        });

        res.status(201).json(updatedSession);
      } catch (error) {
        await storage.updateSession(session.id, { status: "error" });
        throw error;
      }
    } catch (error) {
      console.error("Error starting session:", error);
      res.status(500).json({ error: "Failed to start emulator session" });
    }
  });

  app.post("/api/session/:id/stop", async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getSession(id);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Stop emulator session
      if (session.publicKey) {
        await emulatorService.stopSession(session.publicKey);
      }

      const updatedSession = await storage.updateSession(id, {
        status: "stopped",
        stoppedAt: new Date(),
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error stopping session:", error);
      res.status(500).json({ error: "Failed to stop session" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}