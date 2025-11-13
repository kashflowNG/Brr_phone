import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import dns from "dns";
import { isIP } from "net";
import { Agent } from "undici";
import { insertApkFileSchema } from "@shared/schema";
import { analyzeApk } from "./apk-analyzer";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

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

  app.post("/api/scan-webapp", async (req, res) => {
    const TIMEOUT_MS = 30000; // 30 seconds
    const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB limit for HTML
    const MAX_SCRIPT_SIZE = 5 * 1024 * 1024; // 5MB limit per script
    const MAX_SCRIPTS_TO_FETCH = 50; // Increased limit for better coverage
    
    // SSRF protection - block private networks
    function isPrivateIP(ip: string): boolean {
      // Normalize and extract IPv4 from IPv6-mapped format
      let normalizedIP = ip.toLowerCase();
      
      // Handle IPv4-mapped IPv6 (::ffff:x.x.x.x)
      const ipv4MappedMatch = normalizedIP.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
      if (ipv4MappedMatch) {
        normalizedIP = ipv4MappedMatch[1];
      }
      
      // IPv4 private ranges
      const ipv4Patterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^169\.254\./, // Link-local
        /^0\.0\.0\.0$/,
      ];
      
      // IPv6 private ranges (including compressed forms)
      const ipv6Patterns = [
        /^::1$/, // Loopback
        /^0:0:0:0:0:0:0:1$/, // Loopback expanded
        /^fe[89ab][0-9a-f]:/i, // Link-local fe80::/10 (fe80-febf)
        /^f[cd][0-9a-f]{2}:/i, // Unique local fc00::/7 (fc00-fdff)
        /^::/, // Compressed loopback or other private
        /^0000:/, // Leading zeros (could be loopback)
      ];
      
      // Check if it's a private IPv4 (original or extracted from IPv6-mapped)
      if (ipv4Patterns.some(p => p.test(normalizedIP))) {
        return true;
      }
      
      // Check IPv6 patterns
      if (ipv6Patterns.some(p => p.test(normalizedIP))) {
        return true;
      }
      
      return false;
    }

    // Custom DNS lookup that validates IPs during resolution
    const secureLookup: typeof dns.lookup = (hostname, options, callback) => {
      // Block suspicious hostnames immediately
      if (hostname.toLowerCase() === "localhost" || hostname.includes("metadata")) {
        const error = new Error("Access to private networks not allowed") as NodeJS.ErrnoException;
        error.code = "ENOTFOUND";
        if (typeof options === "function") {
          return options(error);
        }
        return callback?.(error);
      }

      const originalCallback = typeof options === "function" ? options : callback!;
      const lookupOptions = typeof options === "object" ? options : {};

      dns.lookup(hostname, lookupOptions, (err, address, family) => {
        if (err) {
          return originalCallback(err);
        }

        // Handle array results (when options.all is true)
        if (Array.isArray(address)) {
          for (const entry of address) {
            if (isPrivateIP(entry.address)) {
              const error = new Error("Access to private networks not allowed") as NodeJS.ErrnoException;
              error.code = "ENOTFOUND";
              return originalCallback(error);
            }
          }
          return originalCallback(null, address as any, family);
        }

        // Validate the resolved IP
        if (isPrivateIP(address as string)) {
          const error = new Error("Access to private networks not allowed") as NodeJS.ErrnoException;
          error.code = "ENOTFOUND";
          return originalCallback(error);
        }

        originalCallback(null, address, family);
      });
    };

    // Create Undici agent with secure lookup
    const secureAgent = new Agent({
      connect: {
        lookup: secureLookup,
        timeout: TIMEOUT_MS,
        keepAliveTimeout: 0,
      },
    });

    async function safeFetch(url: string): Promise<Response> {
      const parsed = new URL(url);
      
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP/HTTPS allowed");
      }

      // Check if hostname is an IP literal using Node's built-in isIP()
      const hostname = parsed.hostname;
      const ipVersion = isIP(hostname); // Returns 4 for IPv4, 6 for IPv6, 0 for hostname
      
      if (ipVersion !== 0) {
        // It's an IP literal (IPv4 or IPv6)
        if (isPrivateIP(hostname)) {
          throw new Error("Access to private networks not allowed");
        }
      }

      return await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; APKScanner/1.0)",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual", // Don't follow redirects
        // @ts-ignore - Undici dispatcher option
        dispatcher: secureAgent,
      });
    }

    function extractEndpointsFromCode(code: string, baseUrl: URL): Array<{url: string, method: string, headers?: Record<string, string>, payload?: any}> {
      const endpoints: Array<{url: string, method: string, headers?: Record<string, string>, payload?: any}> = [];
      
      const patterns = [
        // fetch() with options
        { regex: /fetch\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*({[\s\S]{0,500}?})/gi, hasOptions: true },
        // fetch() simple
        { regex: /fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi, defaultMethod: "GET" },
        // axios with method
        { regex: /axios\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]\s*,?\s*({[\s\S]{0,500}?})?/gi, methodInMatch: true },
        // axios() generic
        { regex: /axios\s*\(\s*({[\s\S]{0,500}?})/gi, hasConfig: true },
        // jQuery ajax with config
        { regex: /\$\.ajax\s*\(\s*({[\s\S]{0,500}?})/gi, hasConfig: true },
        // jQuery get/post
        { regex: /\$\.(get|post)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        // XMLHttpRequest
        { regex: /\.open\s*\(\s*["'`](\w+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        // API base URLs and endpoints
        { regex: /(?:baseURL|apiURL|API_URL|ENDPOINT|endpoint|BASE_PATH)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi, defaultMethod: "GET" },
        // Request library
        { regex: /request\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(code)) !== null) {
          let apiUrl: string = "";
          let method = pattern.defaultMethod || "GET";
          let headers: Record<string, string> = {};
          let payload: any = null;
          
          if (pattern.hasOptions && match[2]) {
            // Parse fetch options
            apiUrl = match[1];
            try {
              const optionsStr = match[2];
              const methodMatch = /method\s*:\s*["'`](\w+)["'`]/i.exec(optionsStr);
              if (methodMatch) method = methodMatch[1].toUpperCase();
              
              const headersMatch = /headers\s*:\s*({[^}]+})/i.exec(optionsStr);
              if (headersMatch) {
                try {
                  const headersStr = headersMatch[1].replace(/['"`]/g, '"').replace(/(\w+)\s*:/g, '"$1":');
                  headers = JSON.parse(headersStr);
                } catch {}
              }
              
              const bodyMatch = /body\s*:\s*JSON\.stringify\s*\(([^)]+)\)/i.exec(optionsStr);
              if (bodyMatch) {
                payload = { type: "JSON", sample: "data object" };
              }
            } catch {}
          } else if (pattern.hasConfig && match[1]) {
            // Parse axios/ajax config
            try {
              const configStr = match[1];
              const urlMatch = /url\s*:\s*["'`]([^"'`]+)["'`]/i.exec(configStr);
              if (urlMatch) apiUrl = urlMatch[1];
              
              const methodMatch = /method\s*:\s*["'`](\w+)["'`]/i.exec(configStr);
              if (methodMatch) method = methodMatch[1].toUpperCase();
              else if (/type\s*:\s*["'`](\w+)["'`]/i.test(configStr)) {
                const typeMatch = /type\s*:\s*["'`](\w+)["'`]/i.exec(configStr);
                if (typeMatch) method = typeMatch[1].toUpperCase();
              }
              
              const headersMatch = /headers\s*:\s*({[^}]+})/i.exec(configStr);
              if (headersMatch) {
                try {
                  const headersStr = headersMatch[1].replace(/['"`]/g, '"').replace(/(\w+)\s*:/g, '"$1":');
                  headers = JSON.parse(headersStr);
                } catch {}
              }
              
              const dataMatch = /data\s*:\s*({[^}]+}|["'`][^"'`]+["'`])/i.exec(configStr);
              if (dataMatch) {
                payload = { type: "data", sample: dataMatch[1].substring(0, 100) };
              }
            } catch {}
          } else if (pattern.methodInMatch) {
            method = (match[1] || "GET").toUpperCase();
            apiUrl = match[2] || match[1];
            if (match[3]) {
              // Has data/payload
              payload = { type: "object", sample: "data payload" };
            }
          } else {
            apiUrl = match[1];
          }

          // Skip if empty or looks like a variable
          if (!apiUrl || apiUrl.includes("${") || apiUrl.includes("#{") || apiUrl.startsWith("$") || apiUrl.includes("+")) {
            continue;
          }

          // Resolve relative URLs
          try {
            if (apiUrl.startsWith("/")) {
              apiUrl = new URL(apiUrl, baseUrl.origin).href;
            } else if (!apiUrl.startsWith("http")) {
              apiUrl = new URL(apiUrl, baseUrl).href;
            }
          } catch {
            continue;
          }

          // Expanded endpoint detection - be more inclusive
          const isLikelyEndpoint = 
            apiUrl.includes("/api/") || 
            apiUrl.includes("/v1/") ||
            apiUrl.includes("/v2/") ||
            apiUrl.includes("/v3/") ||
            apiUrl.includes("/v4/") ||
            apiUrl.includes(".json") ||
            apiUrl.includes("/graphql") ||
            apiUrl.includes("/rest/") ||
            apiUrl.includes("/data/") ||
            apiUrl.includes("/endpoint") ||
            apiUrl.includes("/query") ||
            apiUrl.includes("/mutation") ||
            apiUrl.includes("/service") ||
            apiUrl.includes("/resource") ||
            apiUrl.match(/\/(get|post|put|delete|fetch|load|save|update|create)/i);

          if (isLikelyEndpoint) {
            endpoints.push({ 
              url: apiUrl, 
              method,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
              payload: payload || undefined
            });
          }
        }
      }

      return endpoints;
    }
    
    try {
      const { url } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Valid URL is required" });
      }

      const parsedUrl = new URL(url);

      // Fetch the main HTML page
      const htmlResponse = await safeFetch(url);
      
      if (htmlResponse.status >= 300 && htmlResponse.status < 400) {
        return res.status(400).json({ error: "Redirects are not followed" });
      }

      if (!htmlResponse.ok) {
        throw new Error(`Failed to fetch: ${htmlResponse.status}`);
      }

      const html = await htmlResponse.text();
      
      if (html.length > MAX_HTML_SIZE) {
        throw new Error("HTML response too large");
      }

      const allEndpoints: Array<{url: string, method: string, headers?: Record<string, string>, payload?: any}> = [];
      const scriptUrls: string[] = [];

      // Extract endpoints from HTML (including inline scripts)
      allEndpoints.push(...extractEndpointsFromCode(html, parsedUrl));

      // Extract and analyze inline scripts
      const inlineScriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
      let inlineMatch;
      while ((inlineMatch = inlineScriptRegex.exec(html)) !== null) {
        const inlineCode = inlineMatch[2];
        if (inlineCode && inlineCode.trim()) {
          allEndpoints.push(...extractEndpointsFromCode(inlineCode, parsedUrl));
        }
      }

      // Extract external script src tags
      const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi;
      let match;
      while ((match = scriptSrcRegex.exec(html)) !== null) {
        let scriptUrl = match[1];
        try {
          if (!scriptUrl.startsWith("http")) {
            scriptUrl = new URL(scriptUrl, parsedUrl.origin).href;
          }
          scriptUrls.push(scriptUrl);
        } catch {}
      }

      // Also look for modulepreload links
      const modulePreloadRegex = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi;
      while ((match = modulePreloadRegex.exec(html)) !== null) {
        let scriptUrl = match[1];
        try {
          if (!scriptUrl.startsWith("http")) {
            scriptUrl = new URL(scriptUrl, parsedUrl.origin).href;
          }
          scriptUrls.push(scriptUrl);
        } catch {}
      }

      // Look for API documentation endpoints
      const docEndpoints = [
        "/swagger.json",
        "/swagger-ui.html",
        "/api-docs",
        "/api-docs.json",
        "/openapi.json",
        "/openapi.yaml",
        "/docs/api",
        "/api/swagger",
      ];

      for (const docPath of docEndpoints) {
        try {
          const docUrl = new URL(docPath, parsedUrl.origin).href;
          const docResponse = await safeFetch(docUrl);
          if (docResponse.ok) {
            allEndpoints.push({
              url: docUrl,
              method: "GET",
              headers: { "Content-Type": "application/json" },
              payload: { type: "API Documentation" }
            });
            
            // Try to parse and extract endpoints from OpenAPI/Swagger
            const docText = await docResponse.text();
            if (docText.length < MAX_SCRIPT_SIZE) {
              try {
                const apiDoc = JSON.parse(docText);
                if (apiDoc.paths) {
                  for (const [path, methods] of Object.entries(apiDoc.paths)) {
                    for (const [method, details] of Object.entries(methods as any)) {
                      if (["get", "post", "put", "delete", "patch"].includes(method.toLowerCase())) {
                        const fullPath = new URL(path, parsedUrl.origin).href;
                        allEndpoints.push({
                          url: fullPath,
                          method: method.toUpperCase(),
                          payload: (details as any)?.requestBody ? { type: "OpenAPI spec" } : undefined
                        });
                      }
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // Fetch and analyze external scripts (limited)
      const scriptsToAnalyze = scriptUrls.slice(0, MAX_SCRIPTS_TO_FETCH);
      
      for (const scriptUrl of scriptsToAnalyze) {
        try {
          const scriptResponse = await safeFetch(scriptUrl);
          
          if (scriptResponse.ok) {
            const scriptCode = await scriptResponse.text();
            
            if (scriptCode.length <= MAX_SCRIPT_SIZE) {
              allEndpoints.push(...extractEndpointsFromCode(scriptCode, new URL(scriptUrl)));
            }
          }
        } catch (err) {
          // Skip failed script fetches
          console.error(`Failed to fetch script ${scriptUrl}:`, err);
        }
      }

      // Deduplicate endpoints
      const uniqueEndpoints = allEndpoints.filter((endpoint, index, self) =>
        index === self.findIndex((e) => e.url === endpoint.url && e.method === endpoint.method)
      );

      res.json({
        endpoints: uniqueEndpoints,
        scripts: scriptUrls.slice(0, 20),
        totalEndpoints: uniqueEndpoints.length,
      });
    } catch (error) {
      console.error("Error scanning web app:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to scan web application" 
      });
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