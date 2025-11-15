import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { insertApkFileSchema } from "@shared/schema";
import { analyzeApk } from "./apk-analyzer";

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

  app.post("/api/apk-files/download-from-url", async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Validate URL
      let apkUrl: URL;
      try {
        apkUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      console.log(`Downloading APK from: ${url}`);

      // Download the APK
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; APKDownloader/1.0)'
        }
      });
      
      if (!response.ok) {
        console.error(`Download failed with status: ${response.status}`);
        return res.status(400).json({ error: `Failed to download APK: ${response.statusText}` });
      }

      const contentType = response.headers.get("content-type");
      console.log(`Content-Type: ${contentType}`);
      
      // More lenient content-type check
      if (contentType && 
          !contentType.includes("application/vnd.android.package-archive") && 
          !contentType.includes("application/octet-stream") &&
          !url.endsWith(".apk")) {
        return res.status(400).json({ error: "URL does not appear to point to an APK file" });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        return res.status(400).json({ error: "Downloaded file is empty" });
      }

      console.log(`Downloaded ${buffer.length} bytes`);

      // Extract filename from URL or use default
      const urlPath = apkUrl.pathname;
      const urlFilename = path.basename(urlPath);
      const originalName = urlFilename.endsWith(".apk") ? urlFilename : "downloaded.apk";

      // Save to disk
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const filename = "apk-" + uniqueSuffix + ".apk";
      const filePath = path.join(uploadDir, filename);

      await fs.writeFile(filePath, buffer);
      console.log(`Saved to: ${filePath}`);

      const apkData = {
        filename,
        originalName,
        size: buffer.length,
        path: filePath,
      };

      const validatedData = insertApkFileSchema.parse(apkData);
      const apkFile = await storage.createApkFile(validatedData);

      console.log(`APK file created with ID: ${apkFile.id}`);
      res.status(201).json(apkFile);
    } catch (error) {
      console.error("Error downloading APK from URL:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download APK from URL";
      res.status(500).json({ error: errorMessage });
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

  // APK Download route
  app.get("/api/apk-files/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const apkFile = await storage.getApkFile(id);

      if (!apkFile) {
        return res.status(404).json({ error: "APK file not found" });
      }

      // Set headers for file download
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${apkFile.originalName}"`);
      res.setHeader("Content-Length", apkFile.size);

      // Stream the file
      const fileStream = (await import("fs")).createReadStream(apkFile.path);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error downloading APK:", error);
      res.status(500).json({ error: "Failed to download APK file" });
    }
  });

  // APK Analysis route
  app.get("/api/apk-files/:id/analyze", async (req, res) => {
    try {
      const { id } = req.params;
      const apkFile = await storage.getApkFile(id);

      if (!apkFile) {
        return res.status(404).json({ error: "APK file not found" });
      }

      const analysis = await analyzeApk(apkFile.path);
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing APK:", error);
      res.status(500).json({ error: "Failed to analyze APK file" });
    }
  });

  // Emulator session routes
  app.post("/api/session/start", async (req, res) => {
    try {
      const { apkFileId, deviceId } = req.body;

      if (!apkFileId) {
        return res.status(400).json({ error: "APK file ID is required" });
      }

      const apkFile = await storage.getApkFile(apkFileId);
      if (!apkFile) {
        return res.status(404).json({ error: "APK file not found" });
      }

      // Create a mock session - replace with actual emulator service integration
      const session = {
        id: `session-${Date.now()}`,
        apkFileId,
        deviceId: deviceId || "default-device",
        status: "running" as const,
        sessionUrl: `https://appetize.io/embed/YOUR_PUBLIC_KEY?device=pixel7&osVersion=13.0`,
        createdAt: new Date().toISOString(),
      };

      res.status(201).json(session);
    } catch (error) {
      console.error("Error starting session:", error);
      res.status(500).json({ error: "Failed to start emulator session" });
    }
  });

  app.post("/api/session/:id/stop", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Mock session stop - replace with actual cleanup logic
      res.json({ 
        success: true,
        message: "Session stopped successfully" 
      });
    } catch (error) {
      console.error("Error stopping session:", error);
      res.status(500).json({ error: "Failed to stop emulator session" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}