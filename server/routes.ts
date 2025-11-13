import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import dns from "dns";
import { isIP } from "net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
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
    const TIMEOUT_MS = 30000;
    const MAX_HTML_SIZE = 10 * 1024 * 1024;
    const MAX_SCRIPT_SIZE = 5 * 1024 * 1024;
    const MAX_SCRIPTS_TO_FETCH = 50;

    // SSRF protection
    const blockedIPv4CIDRs = [
      ipaddr.parseCIDR("0.0.0.0/8"),
      ipaddr.parseCIDR("10.0.0.0/8"),
      ipaddr.parseCIDR("100.64.0.0/10"),
      ipaddr.parseCIDR("127.0.0.0/8"),
      ipaddr.parseCIDR("169.254.0.0/16"),
      ipaddr.parseCIDR("172.16.0.0/12"),
      ipaddr.parseCIDR("192.0.0.0/24"),
      ipaddr.parseCIDR("192.0.2.0/24"),
      ipaddr.parseCIDR("192.168.0.0/16"),
      ipaddr.parseCIDR("198.18.0.0/15"),
      ipaddr.parseCIDR("198.51.100.0/24"),
      ipaddr.parseCIDR("203.0.113.0/24"),
      ipaddr.parseCIDR("224.0.0.0/4"),
      ipaddr.parseCIDR("240.0.0.0/4"),
      ipaddr.parseCIDR("255.255.255.255/32"),
    ];

    const blockedIPv6CIDRs = [
      ipaddr.parseCIDR("::/128"),
      ipaddr.parseCIDR("::1/128"),
      ipaddr.parseCIDR("::ffff:0:0/96"),
      ipaddr.parseCIDR("64:ff9b::/96"),
      ipaddr.parseCIDR("100::/64"),
      ipaddr.parseCIDR("2001:db8::/32"),
      ipaddr.parseCIDR("2001:10::/28"),
      ipaddr.parseCIDR("fc00::/7"),
      ipaddr.parseCIDR("fe80::/10"),
      ipaddr.parseCIDR("ff00::/8"),
    ];

    function isPrivateIP(ipString: string): boolean {
      try {
        let parsedIP = ipaddr.parse(ipString);
        if (parsedIP.kind() === "ipv6" && parsedIP.isIPv4MappedAddress()) {
          parsedIP = parsedIP.toIPv4Address();
        }
        const cidrsToCheck = parsedIP.kind() === "ipv4" ? blockedIPv4CIDRs : blockedIPv6CIDRs;
        for (const [range, prefix] of cidrsToCheck) {
          if (parsedIP.match(range, prefix)) {
            return true;
          }
        }
        return false;
      } catch (err) {
        return true;
      }
    }

    const secureLookup: typeof dns.lookup = (hostname, options, callback) => {
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

        if (isPrivateIP(address as string)) {
          const error = new Error("Access to private networks not allowed") as NodeJS.ErrnoException;
          error.code = "ENOTFOUND";
          return originalCallback(error);
        }

        originalCallback(null, address, family);
      });
    };

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

      const hostname = parsed.hostname;
      const ipVersion = isIP(hostname);

      if (ipVersion !== 0) {
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
        redirect: "manual",
        // @ts-ignore
        dispatcher: secureAgent,
      });
    }

    // Enhanced backend detection with comprehensive database patterns
    function looksLikeBackend(str: string): boolean {
      return (
        str.includes("?op=") ||
        str.includes("/api/") ||
        /\.php(\?|$)/.test(str) ||
        /\.asp(x)?(\?|$)/.test(str) ||
        /\.jsp(\?|$)/.test(str) ||
        /\/cgi-bin\//.test(str) ||
        /\.cgi(\?|$)/.test(str) ||
        /\/admin\//.test(str) ||
        /\/upload/.test(str) ||
        /\/login/.test(str) ||
        /\/auth/.test(str) ||
        /\/logout/.test(str) ||
        /\.json$/.test(str) ||
        /\.xml$/.test(str) ||
        /\/graphql/.test(str) ||
        /\/webhook/.test(str) ||
        /\/password/.test(str) ||
        /\/reset/.test(str) ||
        /\/verify/.test(str) ||
        /\/create/.test(str) ||
        /\/insert/.test(str) ||
        /\/update/.test(str) ||
        /\/delete/.test(str) ||
        /\/remove/.test(str) ||
        /\/edit/.test(str) ||
        /\/modify/.test(str) ||
        /\/save/.test(str) ||
        /\/store/.test(str) ||
        /\/add/.test(str) ||
        /\/new/.test(str) ||
        /\/submit/.test(str) ||
        /\/process/.test(str) ||
        /\/handle/.test(str) ||
        /\/publish/.test(str) ||
        /\/approve/.test(str) ||
        /\/reject/.test(str) ||
        /\/activate/.test(str) ||
        /\/deactivate/.test(str) ||
        /\/enable/.test(str) ||
        /\/disable/.test(str) ||
        /\/bulk/.test(str) ||
        /\/batch/.test(str) ||
        /\/(users|posts|comments|orders|products|customers|items|accounts|profiles)\/\d+/.test(str) ||
        /\?action=(create|update|delete|insert|edit|save|add|remove|submit|process|publish|approve)/.test(str) ||
        /\?method=(post|put|patch|delete)/.test(str) ||
        /\?cmd=(insert|update|delete|create|modify)/.test(str) ||
        /\?operation=(write|modify|change|alter)/.test(str) ||
        /\/database\//.test(str) ||
        /\/db\//.test(str) ||
        /\/sql/.test(str) ||
        /\/query/.test(str) ||
        /\/execute/.test(str) ||
        /\/transaction/.test(str) ||
        /\/commit/.test(str) ||
        /\/rollback/.test(str)
      );
    }

    // Enhanced server logic analysis
    function analyzeServerLogic(url: string): string[] {
      const patterns: Record<string, RegExp> = {
        'db-insert': /insert|create|add|new|register|signup|post(?!.*get)|submit(?!.*form)/i,
        'db-update': /update|edit|modify|change|patch|save|put|alter|set/i,
        'db-delete': /delete|remove|destroy|drop|clear|purge|erase/i,
        'db-upsert': /upsert|merge|replace|save/i,
        'db-bulk': /bulk|batch|multi|mass/i,
        'db-transaction': /transaction|commit|rollback|begin|start/i,
        'db-read': /read|get|fetch|list|view|show|select|find|search/i,
        'auth': /login|auth|signin|signup|register|token|jwt|oauth/i,
        'admin': /admin|manage|control|dashboard|panel/i,
        'upload': /upload|file|attachment|media|image/i,
        'security': /csrf|xsrf|captcha|verify|validate/i,
        'workflow': /approve|reject|publish|activate|enable|process|handle/i,
        'backup': /backup|export|import|migrate|dump|restore/i
      };

      const types: string[] = [];
      Object.entries(patterns).forEach(([type, regex]) => {
        if (regex.test(url)) types.push(type);
      });

      return types;
    }

    // Database operation detection
    function getDatabaseOperation(method: string, url: string): string {
      const urlLower = url.toLowerCase();
      const hasIdInPath = /\/(\w+)\/\d+/.test(urlLower);

      if (method === 'POST') {
        if (hasIdInPath) return 'UPDATE';
        if (/insert|create|add|new|register|signup|submit/.test(urlLower)) return 'INSERT';
        if (/update|edit|modify|save|set/.test(urlLower)) return 'UPDATE';
        if (/delete|remove|destroy|purge/.test(urlLower)) return 'DELETE';
        if (/upsert|merge|replace/.test(urlLower)) return 'UPSERT';
        if (/bulk|batch|multi/.test(urlLower)) return 'BULK_OP';
        return 'INSERT';
      } else if (method === 'PUT') {
        return 'UPDATE/REPLACE';
      } else if (method === 'PATCH') {
        return 'PARTIAL_UPDATE';
      } else if (method === 'DELETE') {
        return 'DELETE';
      } else if (method === 'GET') {
        if (/delete|remove|destroy/.test(urlLower)) return 'DELETE_VIA_GET';
        if (/update|edit|modify/.test(urlLower)) return 'UPDATE_VIA_GET';
        return 'READ';
      }

      return 'UNKNOWN';
    }

    function extractEndpointsFromCode(code: string, baseUrl: URL): Array<{
      url: string;
      method: string;
      headers?: Record<string, string>;
      dbOperation?: string;
      logicTypes?: string[];
      codeSnippet?: string;
    }> {
      const endpoints: Array<{
        url: string;
        method: string;
        headers?: Record<string, string>;
        dbOperation?: string;
        logicTypes?: string[];
        codeSnippet?: string;
      }> = [];

      const patterns = [
        { regex: /fetch\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*({[\s\S]{0,500}?})/gi, hasOptions: true },
        { regex: /fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi, defaultMethod: "GET" },
        { regex: /axios\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]\s*,?\s*({[\s\S]{0,500}?})?/gi, methodInMatch: true },
        { regex: /axios\s*\(\s*({[\s\S]{0,500}?})/gi, hasConfig: true },
        { regex: /\$\.ajax\s*\(\s*({[\s\S]{0,500}?})/gi, hasConfig: true },
        { regex: /\$\.(get|post)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        { regex: /\.open\s*\(\s*["'`](\w+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        { regex: /(?:baseURL|apiURL|API_URL|ENDPOINT|endpoint|BASE_PATH)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi, defaultMethod: "GET" },
        { regex: /request\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        { regex: /\.(create|insert|update|delete|save|store|upsert|merge)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        { regex: /\.(?:findOneAndUpdate|findByIdAndUpdate|updateOne|updateMany|deleteOne|deleteMany|insertOne|insertMany)\s*\(\s*["'`]([^"'`]+)["'`]/gi, methodInMatch: true },
        { regex: /execute\s*\(\s*["'`]([^"'`]*(?:INSERT|UPDATE|DELETE|CREATE|MERGE|UPSERT)[^"'`]*)["'`]/gi, defaultMethod: "POST" },
        { regex: /query\s*\(\s*["'`]([^"'`]*(?:INSERT|UPDATE|DELETE|CREATE|MERGE|UPSERT)[^"'`]*)["'`]/gi, defaultMethod: "POST" },
        { regex: /sql\s*[:=]\s*["'`]([^"'`]*(?:INSERT|UPDATE|DELETE|CREATE|MERGE|UPSERT)[^"'`]*)["'`]/gi, defaultMethod: "POST" },
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(code)) !== null) {
          let apiUrl: string = "";
          let method = pattern.defaultMethod || "GET";
          let headers: Record<string, string> = {};
          let codeSnippet = match[0];

          if (pattern.hasOptions && match[2]) {
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
            } catch {}
          } else if (pattern.hasConfig && match[1]) {
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
            } catch {}
          } else if (pattern.methodInMatch) {
            method = (match[1] || "GET").toUpperCase();
            apiUrl = match[2] || match[1];
          } else {
            apiUrl = match[1];
          }

          if (!apiUrl || apiUrl.includes("${") || apiUrl.includes("#{") || apiUrl.startsWith("$") || apiUrl.includes("+")) {
            continue;
          }

          try {
            if (apiUrl.startsWith("/")) {
              apiUrl = new URL(apiUrl, baseUrl.origin).href;
            } else if (!apiUrl.startsWith("http")) {
              apiUrl = new URL(apiUrl, baseUrl).href;
            }
          } catch {
            continue;
          }

          if (looksLikeBackend(apiUrl)) {
            const dbOperation = getDatabaseOperation(method, apiUrl);
            const logicTypes = analyzeServerLogic(apiUrl);

            endpoints.push({ 
              url: apiUrl, 
              method,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
              dbOperation,
              logicTypes: logicTypes.length > 0 ? logicTypes : undefined,
              codeSnippet
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

      const allEndpoints: Array<{
        url: string;
        method: string;
        headers?: Record<string, string>;
        dbOperation?: string;
        logicTypes?: string[];
        source?: string;
        codeSnippet?: string;
      }> = [];
      const scriptUrls: string[] = [];
      const scriptSources: Record<string, string> = {};
      const inlineScripts: Array<{ code: string; source: string }> = [];

      // Extract endpoints from HTML
      const htmlEndpoints = extractEndpointsFromCode(html, parsedUrl);
      htmlEndpoints.forEach(ep => allEndpoints.push({ ...ep, source: 'html' }));

      // Extract inline scripts
      const inlineScriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
      let inlineMatch;
      while ((inlineMatch = inlineScriptRegex.exec(html)) !== null) {
        const inlineCode = inlineMatch[2];
        if (inlineCode && inlineCode.trim()) {
          const inlineEndpoints = extractEndpointsFromCode(inlineCode, parsedUrl);
          inlineEndpoints.forEach(ep => allEndpoints.push({ ...ep, source: 'inline-script', codeSnippet: inlineCode }));
          inlineScripts.push({ code: inlineCode, source: 'inline-script' });
        }
      }

      // Extract external script URLs
      const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi;
      while ((match = scriptSrcRegex.exec(html)) !== null) {
        let scriptUrl = match[1];
        try {
          if (!scriptUrl.startsWith("http")) {
            scriptUrl = new URL(scriptUrl, parsedUrl.origin).href;
          }
          scriptUrls.push(scriptUrl);
        } catch {}
      }

      // Modulepreload links
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

      // Scan forms
      const formRegex = /<form[^>]*action=["']([^"']+)["'][^>]*>/gi;
      while ((match = formRegex.exec(html)) !== null) {
        const formAction = match[1];
        try {
          let actionUrl = formAction.startsWith("http") ? formAction : new URL(formAction, parsedUrl.origin).href;
          if (looksLikeBackend(actionUrl)) {
            const dbOperation = getDatabaseOperation('POST', actionUrl);
            const logicTypes = analyzeServerLogic(actionUrl);
            allEndpoints.push({
              url: actionUrl,
              method: 'POST',
              dbOperation,
              logicTypes: logicTypes.length > 0 ? logicTypes : undefined,
              source: 'form'
            });
          }
        } catch {}
      }

      // Check for API documentation
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
              dbOperation: "READ",
              logicTypes: ["api-docs"],
              source: "api-documentation"
            });

            const docText = await docResponse.text();
            if (docText.length < MAX_SCRIPT_SIZE) {
              try {
                const apiDoc = JSON.parse(docText);
                if (apiDoc.paths) {
                  for (const [path, methods] of Object.entries(apiDoc.paths)) {
                    for (const [method, details] of Object.entries(methods as any)) {
                      if (["get", "post", "put", "delete", "patch"].includes(method.toLowerCase())) {
                        const fullPath = new URL(path, parsedUrl.origin).href;
                        const dbOp = getDatabaseOperation(method.toUpperCase(), fullPath);
                        allEndpoints.push({
                          url: fullPath,
                          method: method.toUpperCase(),
                          dbOperation: dbOp,
                          source: "openapi-spec"
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

      // Fetch and analyze external scripts
      const scriptsToAnalyze = scriptUrls.slice(0, MAX_SCRIPTS_TO_FETCH);

      for (const scriptUrl of scriptsToAnalyze) {
        try {
          const scriptResponse = await safeFetch(scriptUrl);

          if (scriptResponse.ok) {
            const scriptCode = await scriptResponse.text();
            scriptSources[scriptUrl] = scriptCode;

            if (scriptCode.length <= MAX_SCRIPT_SIZE) {
              const scriptEndpoints = extractEndpointsFromCode(scriptCode, new URL(scriptUrl));
              scriptEndpoints.forEach(ep => allEndpoints.push({ ...ep, source: scriptUrl }));
            }
          }
        } catch (err) {
          console.error(`Failed to fetch script ${scriptUrl}:`, err);
        }
      }

      // Deduplicate endpoints
      const uniqueEndpoints = allEndpoints.filter((endpoint, index, self) =>
        index === self.findIndex((e) => e.url === endpoint.url && e.method === endpoint.method)
      );

      // Calculate statistics
      const databaseOperations = {
        'INSERT/CREATE': uniqueEndpoints.filter(e => e.dbOperation?.includes('INSERT') || e.dbOperation?.includes('CREATE')).length,
        'UPDATE/EDIT': uniqueEndpoints.filter(e => e.dbOperation?.includes('UPDATE') || e.dbOperation?.includes('PARTIAL')).length,
        'DELETE/REMOVE': uniqueEndpoints.filter(e => e.dbOperation?.includes('DELETE')).length,
        'UPSERT/MERGE': uniqueEndpoints.filter(e => e.dbOperation?.includes('UPSERT')).length,
        'BULK_OPERATIONS': uniqueEndpoints.filter(e => e.dbOperation?.includes('BULK')).length,
        'READ/SELECT': uniqueEndpoints.filter(e => e.dbOperation === 'READ').length,
      };

      const serverLogic = {
        'auth': uniqueEndpoints.filter(e => e.logicTypes?.includes('auth')).length,
        'admin': uniqueEndpoints.filter(e => e.logicTypes?.includes('admin')).length,
        'upload': uniqueEndpoints.filter(e => e.logicTypes?.includes('upload')).length,
        'security': uniqueEndpoints.filter(e => e.logicTypes?.includes('security')).length,
        'workflow': uniqueEndpoints.filter(e => e.logicTypes?.includes('workflow')).length,
        'database': uniqueEndpoints.filter(e => e.logicTypes?.some(t => t.startsWith('db-'))).length,
      };

      res.json({
        endpoints: uniqueEndpoints,
        scripts: [...scriptUrls, ...(inlineScripts.length > 0 ? ["inline-script"] : [])],
        scriptSources,
        totalEndpoints: uniqueEndpoints.length,
        databaseOperations,
        serverLogic
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

  app.get("/api/apk-files/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const apkFile = await storage.getApkFile(id);

      if (!apkFile) {
        return res.status(404).json({ error: "APK file not found" });
      }

      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${apkFile.originalName}"`);
      res.setHeader("Content-Length", apkFile.size);

      const fileStream = (await import("fs")).createReadStream(apkFile.path);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error downloading APK:", error);
      res.status(500).json({ error: "Failed to download APK file" });
    }
  });

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