
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface ApiEndpoint {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "UNKNOWN";
  context: string;
  dbOperation?: string;
  hasPayload?: boolean;
  payloadIndicators?: string[];
  confidence: "high" | "medium" | "low";
}

export interface ApkAnalysisResult {
  apiEndpoints: ApiEndpoint[];
  totalEndpoints: number;
  databaseOperations: {
    INSERT: number;
    UPDATE: number;
    DELETE: number;
    READ: number;
    UPSERT: number;
    BULK: number;
  };
  summary: {
    totalUrls: number;
    uniqueDomains: number;
    authEndpoints: number;
    uploadEndpoints: number;
    adminEndpoints: number;
  };
}

export async function analyzeApk(apkPath: string): Promise<ApkAnalysisResult> {
  const apiEndpoints: ApiEndpoint[] = [];
  const seenUrls = new Set<string>();
  
  try {
    const zip = new AdmZip(apkPath);
    const zipEntries = zip.getEntries();
    
    // Extract to temporary directory for better processing
    const tempDir = path.join(path.dirname(apkPath), `temp_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      zip.extractAllTo(tempDir, true);
      
      // Enhanced URL patterns including database operations
      const urlPatterns = [
        // Standard URLs
        /https?:\/\/[^\s"'\`<>)}\]]+/gi,
        // API paths with various delimiters
        /"(\/api\/[^"]+)"/gi,
        /'(\/api\/[^']+)'/gi,
        /`(\/api\/[^`]+)`/gi,
        // Endpoints with parameters
        /endpoint\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
        /url\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
        /path\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
        /action\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
        /route\s*[:=]\s*["'`]([^"'`]+)["'`]/gi,
        // Retrofit/OkHttp patterns
        /@(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
        // JavaScript fetch/axios patterns
        /fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi,
        /axios\.\w+\s*\(\s*["'`]([^"'`]+)["'`]/gi,
        // URL construction patterns
        /new\s+URL\s*\(\s*["'`]([^"'`]+)["'`]/gi,
        // Query parameters
        /\?op=\w+|&op=\w+/gi,
      ];

      // Method detection patterns (expanded)
      const methodPatterns = {
        GET: /\.get\s*\(|HttpGet|@GET|method\s*[:=]\s*["']GET["']|Request\.Method\.GET|RequestMethod\.GET/gi,
        POST: /\.post\s*\(|HttpPost|@POST|method\s*[:=]\s*["']POST["']|Request\.Method\.POST|RequestMethod\.POST|FormBody|MultipartBody|ContentType\.APPLICATION_JSON/gi,
        PUT: /\.put\s*\(|HttpPut|@PUT|method\s*[:=]\s*["']PUT["']|Request\.Method\.PUT|RequestMethod\.PUT/gi,
        PATCH: /\.patch\s*\(|HttpPatch|@PATCH|method\s*[:=]\s*["']PATCH["']|Request\.Method\.PATCH|RequestMethod\.PATCH/gi,
        DELETE: /\.delete\s*\(|HttpDelete|@DELETE|method\s*[:=]\s*["']DELETE["']|Request\.Method\.DELETE|RequestMethod\.DELETE/gi,
      };

      // Database operation patterns (comprehensive)
      const dbOperationPatterns = {
        INSERT: /\/(?:create|insert|add|new|register|signup|submit|save|store|append)(?:\/|$|\?)|action=(?:create|insert|add|new)|op=(?:insert|add|create)|method.*create/gi,
        UPDATE: /\/(?:update|edit|modify|change|patch|save|put|alter|set)(?:\/|$|\?)|action=(?:update|edit|modify)|op=(?:update|edit)|method.*update/gi,
        DELETE: /\/(?:delete|remove|destroy|drop|clear|purge|erase)(?:\/|$|\?)|action=(?:delete|remove)|op=(?:delete|remove)|method.*delete/gi,
        UPSERT: /\/(?:upsert|merge|replace|sync)(?:\/|$|\?)|action=upsert|op=upsert/gi,
        BULK: /\/(?:bulk|batch|multi|mass)(?:\/|$|\?)|action=bulk|op=bulk/gi,
        READ: /\/(?:get|list|fetch|query|search|find|read|view|show|retrieve)(?:\/|$|\?)|action=(?:get|list|fetch)|op=(?:get|fetch|select)/gi,
      };

      // Payload indicators
      const payloadIndicators = {
        hasId: /["']?(?:id|_id|user_id|post_id|item_id|object_id|userId|postId|itemId)["']?\s*[:=]/i,
        hasUserData: /["']?(?:user|email|username|password|name|profile|phone|address|firstName|lastName)["']?\s*[:=]/i,
        hasTimestamp: /["']?(?:timestamp|created_at|updated_at|date|time|datetime|createdAt|updatedAt)["']?\s*[:=]/i,
        hasFileData: /["']?(?:file|image|upload|attachment|media|blob|binary|photo|avatar)["']?\s*[:=]/i,
        hasStatus: /["']?(?:status|state|active|enabled|published|isActive|isPublished)["']?\s*[:=]/i,
        hasSqlKeywords: /\b(?:INSERT|UPDATE|DELETE|SELECT|WHERE|SET|VALUES|FROM|INTO)\b/gi,
        hasJson: /Content-Type.*application\/json|JSON\.stringify|JSON\.parse/i,
        hasFormData: /FormData|multipart\/form-data|x-www-form-urlencoded/i,
      };

      // Backend detection (enhanced)
      function looksLikeBackend(str: string): boolean {
        return (
          str.includes("?op=") ||
          str.includes("/api/") ||
          str.includes("/v1/") ||
          str.includes("/v2/") ||
          str.includes("/rest/") ||
          /\.php(\?|$)/.test(str) ||
          /\.asp(x)?(\?|$)/.test(str) ||
          /\.jsp(\?|$)/.test(str) ||
          /\/cgi-bin\//.test(str) ||
          /\/admin\//.test(str) ||
          /\/upload/.test(str) ||
          /\/login/.test(str) ||
          /\/auth/.test(str) ||
          /\/logout/.test(str) ||
          /\.json($|\?)/.test(str) ||
          /\.xml($|\?)/.test(str) ||
          /\/graphql/.test(str) ||
          /\/webhook/.test(str) ||
          /\/(?:create|insert|update|delete|remove|edit|modify|save)/.test(str) ||
          /\/(?:users|posts|comments|orders|products|customers|items|accounts|profiles)\/\d+/.test(str) ||
          /\?action=/.test(str) ||
          /\/database\//.test(str) ||
          /\/db\//.test(str) ||
          /\/query/.test(str) ||
          /\/service\//.test(str) ||
          /\/endpoint\//.test(str)
        );
      }

      // Determine HTTP method from context
      function determineMethod(context: string, url: string): ApiEndpoint["method"] {
        const contextLower = context.toLowerCase();
        
        for (const [method, pattern] of Object.entries(methodPatterns)) {
          if (pattern.test(context)) {
            return method as ApiEndpoint["method"];
          }
        }

        // Heuristic based on URL
        const urlLower = url.toLowerCase();
        if (/\/(?:delete|remove|destroy)/.test(urlLower)) return "DELETE";
        if (/\/(?:update|edit|modify|patch)/.test(urlLower)) return "PUT";
        if (/\/(?:create|insert|add|new|register|submit)/.test(urlLower)) return "POST";
        
        return "UNKNOWN";
      }

      // Determine database operation
      function getDatabaseOperation(method: string, url: string, context: string): string | undefined {
        const urlLower = url.toLowerCase();
        const contextLower = context.toLowerCase();
        
        for (const [op, pattern] of Object.entries(dbOperationPatterns)) {
          if (pattern.test(urlLower) || pattern.test(contextLower)) {
            return op;
          }
        }

        // Method-based heuristics
        if (method === "POST") return "INSERT";
        if (method === "PUT" || method === "PATCH") return "UPDATE";
        if (method === "DELETE") return "DELETE";
        if (method === "GET" && /\/(?:list|search|find|get)/.test(urlLower)) return "READ";
        
        return undefined;
      }

      // Analyze payload indicators
      function analyzePayloadContext(context: string): { hasPayload: boolean; indicators: string[] } {
        const indicators: string[] = [];
        
        for (const [key, pattern] of Object.entries(payloadIndicators)) {
          if (pattern.test(context)) {
            indicators.push(key.replace('has', ''));
          }
        }
        
        return {
          hasPayload: indicators.length > 0,
          indicators
        };
      }

      // Process all files recursively
      async function processDirectory(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await processDirectory(fullPath);
          } else {
            // Focus on code and resource files
            if (
              entry.name.endsWith(".smali") ||
              entry.name.endsWith(".dex") ||
              entry.name.endsWith(".xml") ||
              entry.name.endsWith(".json") ||
              entry.name.endsWith(".js") ||
              entry.name.endsWith(".html") ||
              entry.name.includes("resources.arsc") ||
              entry.name.includes("classes") ||
              fullPath.includes("/assets/") ||
              fullPath.includes("/res/") ||
              fullPath.includes("/lib/")
            ) {
              try {
                const content = await fs.readFile(fullPath, "utf8");
                
                // Find all URLs
                for (const pattern of urlPatterns) {
                  let match;
                  pattern.lastIndex = 0; // Reset regex state
                  
                  while ((match = pattern.exec(content)) !== null) {
                    let url = (match[1] || match[0]).replace(/['"` ]/g, "");
                    
                    // Clean up URL
                    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
                      String.fromCharCode(parseInt(code, 16))
                    );
                    
                    // Remove trailing punctuation
                    url = url.replace(/[,;)}\]]+$/, "");
                    
                    // Skip non-backend URLs
                    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || 
                        url.startsWith('mailto:') || url.startsWith('#') || url.length < 5) {
                      continue;
                    }

                    // Only process if it looks like a backend endpoint
                    if (!looksLikeBackend(url)) {
                      continue;
                    }

                    // Avoid duplicates
                    const urlKey = `${url}`;
                    if (seenUrls.has(urlKey)) {
                      continue;
                    }
                    seenUrls.add(urlKey);

                    // Get context (surrounding code - larger window)
                    const contextStart = Math.max(0, match.index - 1000);
                    const contextEnd = Math.min(content.length, match.index + 1000);
                    const surroundingContext = content.substring(contextStart, contextEnd);

                    // Determine method
                    const method = determineMethod(surroundingContext, url);

                    // Determine database operation
                    const dbOperation = getDatabaseOperation(method, url, surroundingContext);

                    // Analyze payload
                    const payloadAnalysis = analyzePayloadContext(surroundingContext);

                    // Determine confidence
                    let confidence: ApiEndpoint["confidence"] = "medium";
                    if (method !== "UNKNOWN" && dbOperation) {
                      confidence = "high";
                    } else if (method === "UNKNOWN" && !dbOperation) {
                      confidence = "low";
                    }

                    apiEndpoints.push({
                      url,
                      method,
                      context: path.relative(tempDir, fullPath),
                      dbOperation,
                      hasPayload: payloadAnalysis.hasPayload,
                      payloadIndicators: payloadAnalysis.indicators,
                      confidence: confidence || "low"
                    });
                  }
                }
              } catch (err) {
                // Skip files that can't be read as text
                continue;
              }
            }
          }
        }
      }

      // Process the extracted APK
      await processDirectory(tempDir);

    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error("Failed to cleanup temp directory:", err);
      }
    }

    // Sort by confidence and method
    apiEndpoints.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
        return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      }
      return a.method.localeCompare(b.method);
    });

    // Calculate database operations
    const databaseOperations = {
      INSERT: apiEndpoints.filter(e => e.dbOperation === "INSERT").length,
      UPDATE: apiEndpoints.filter(e => e.dbOperation === "UPDATE").length,
      DELETE: apiEndpoints.filter(e => e.dbOperation === "DELETE").length,
      READ: apiEndpoints.filter(e => e.dbOperation === "READ").length,
      UPSERT: apiEndpoints.filter(e => e.dbOperation === "UPSERT").length,
      BULK: apiEndpoints.filter(e => e.dbOperation === "BULK").length,
    };

    // Calculate summary statistics
    const uniqueDomains = new Set(
      apiEndpoints
        .map(e => {
          try {
            const url = new URL(e.url.startsWith('http') ? e.url : `http://${e.url}`);
            return url.hostname;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    ).size;

    const summary = {
      totalUrls: apiEndpoints.length,
      uniqueDomains,
      authEndpoints: apiEndpoints.filter(e => 
        /auth|login|signup|register|token|jwt|session/i.test(e.url)
      ).length,
      uploadEndpoints: apiEndpoints.filter(e => 
        /upload|file|media|image|attachment|photo/i.test(e.url)
      ).length,
      adminEndpoints: apiEndpoints.filter(e => 
        /admin|manage|dashboard|panel|console/i.test(e.url)
      ).length,
    };

    return {
      apiEndpoints,
      totalEndpoints: apiEndpoints.length,
      databaseOperations,
      summary
    };

  } catch (error) {
    console.error("Error analyzing APK:", error);
    throw new Error("Failed to analyze APK file");
  }
}
