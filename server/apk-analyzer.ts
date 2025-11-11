
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
      
      // COMPREHENSIVE URL patterns - matches everything
      const urlPatterns = [
        // Standard URLs
        /https?:\/\/[^\s"'\`<>)}\]\n]+/gi,
        // API paths with various delimiters
        /"(\/[a-zA-Z0-9_\-\/\.]+)"/gi,
        /'(\/[a-zA-Z0-9_\-\/\.]+)'/gi,
        /`(\/[a-zA-Z0-9_\-\/\.]+)`/gi,
        // Endpoints with parameters
        /endpoint\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /url\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /path\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /action\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /route\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /uri\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /link\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        // Retrofit/OkHttp/Volley patterns
        /@(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/gi,
        /@(?:Url|Path|Query|Field|FieldMap|Part|PartMap|Body|Header|Headers)\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/gi,
        // JavaScript/TypeScript fetch/axios patterns
        /fetch\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /axios\.\w+\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /\$\.(?:get|post|put|delete|ajax)\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        // URL construction patterns
        /new\s+URL\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /URL\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        // Query parameters and operations
        /\?(?:op|action|method|cmd|operation)=[a-zA-Z0-9_\-]+/gi,
        /&(?:op|action|method|cmd|operation)=[a-zA-Z0-9_\-]+/gi,
        // Base URLs and endpoints
        /(?:BASE_URL|API_URL|ENDPOINT|API_ENDPOINT|ROOT_URL|SERVER_URL)\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        // String concatenation patterns
        /["'`]([^"'`]*\/api\/[^"'`]*)["'`]/gi,
        /["'`]([^"'`]*\/v\d+\/[^"'`]*)["'`]/gi,
        // WebSocket and Socket.IO
        /(?:ws|wss):\/\/[^\s"'\`<>)}\]\n]+/gi,
        // GraphQL
        /\/graphql[^\s"'\`<>)}\]\n]*/gi,
        // Common API patterns
        /\/(?:api|rest|service|endpoint|backend|server)\/[a-zA-Z0-9_\-\/\.]+/gi,
      ];

      // EXTENSIVE method detection patterns
      const methodPatterns = {
        GET: /\.get\s*\(|HttpGet|@GET|method\s*[:=]\s*["']GET["']|Request\.Method\.GET|RequestMethod\.GET|GET\s+request|getMethod\(\).*GET/gi,
        POST: /\.post\s*\(|HttpPost|@POST|method\s*[:=]\s*["']POST["']|Request\.Method\.POST|RequestMethod\.POST|POST\s+request|FormBody|MultipartBody|RequestBody|ContentType\.APPLICATION_JSON|application\/json|x-www-form-urlencoded|setRequestMethod\("POST"\)/gi,
        PUT: /\.put\s*\(|HttpPut|@PUT|method\s*[:=]\s*["']PUT["']|Request\.Method\.PUT|RequestMethod\.PUT|PUT\s+request|setRequestMethod\("PUT"\)/gi,
        PATCH: /\.patch\s*\(|HttpPatch|@PATCH|method\s*[:=]\s*["']PATCH["']|Request\.Method\.PATCH|RequestMethod\.PATCH|PATCH\s+request|setRequestMethod\("PATCH"\)/gi,
        DELETE: /\.delete\s*\(|HttpDelete|@DELETE|method\s*[:=]\s*["']DELETE["']|Request\.Method\.DELETE|RequestMethod\.DELETE|DELETE\s+request|setRequestMethod\("DELETE"\)/gi,
      };

      // COMPREHENSIVE database operation patterns
      const dbOperationPatterns = {
        INSERT: /\/(?:create|insert|add|new|register|signup|submit|save|store|append|write|put)(?:\/|$|\?|&)|action=(?:create|insert|add|new|register|signup)|op=(?:insert|add|create|new)|method.*(?:create|insert|add)|CREATE\s+|INSERT\s+INTO|\.save\(|\.insert\(|\.create\(/gi,
        UPDATE: /\/(?:update|edit|modify|change|patch|save|put|alter|set|revise)(?:\/|$|\?|&)|action=(?:update|edit|modify|change|patch)|op=(?:update|edit|modify|patch)|method.*(?:update|edit|modify)|UPDATE\s+SET|\.update\(|\.modify\(|\.edit\(/gi,
        DELETE: /\/(?:delete|remove|destroy|drop|clear|purge|erase|trash)(?:\/|$|\?|&)|action=(?:delete|remove|destroy|drop)|op=(?:delete|remove|destroy)|method.*(?:delete|remove)|DELETE\s+FROM|WHERE.*DELETE|\.delete\(|\.remove\(|\.destroy\(/gi,
        UPSERT: /\/(?:upsert|merge|replace|sync|saveOrUpdate)(?:\/|$|\?|&)|action=(?:upsert|merge|sync)|op=(?:upsert|merge)|REPLACE\s+INTO|INSERT.*ON\s+DUPLICATE|\.upsert\(|\.merge\(/gi,
        BULK: /\/(?:bulk|batch|multi|mass|many)(?:\/|$|\?|&)|action=(?:bulk|batch|multi)|op=(?:bulk|batch)|bulkInsert|bulkUpdate|bulkDelete|\.bulkCreate\(|\.bulkUpdate\(/gi,
        READ: /\/(?:get|list|fetch|query|search|find|read|view|show|retrieve|select|load|all)(?:\/|$|\?|&)|action=(?:get|list|fetch|query|search|find)|op=(?:get|fetch|select|query)|SELECT\s+.*FROM|\.get\(|\.find\(|\.query\(|\.search\(/gi,
      };

      // Enhanced payload indicators
      const payloadIndicators = {
        hasId: /["']?(?:id|_id|user_id|post_id|item_id|object_id|userId|postId|itemId|entityId|recordId|pk|primaryKey)["']?\s*[:=]/i,
        hasUserData: /["']?(?:user|email|username|password|name|profile|phone|address|firstName|lastName|fullName|displayName|nickname)["']?\s*[:=]/i,
        hasTimestamp: /["']?(?:timestamp|created_at|updated_at|date|time|datetime|createdAt|updatedAt|modifiedAt|dateCreated|dateModified)["']?\s*[:=]/i,
        hasFileData: /["']?(?:file|image|upload|attachment|media|blob|binary|photo|avatar|picture|document|pdf)["']?\s*[:=]/i,
        hasStatus: /["']?(?:status|state|active|enabled|published|isActive|isPublished|isEnabled|isDeleted|deleted|archived)["']?\s*[:=]/i,
        hasSqlKeywords: /\b(?:INSERT|UPDATE|DELETE|SELECT|WHERE|SET|VALUES|FROM|INTO|JOIN|ORDER|GROUP|HAVING|LIMIT)\b/gi,
        hasJson: /Content-Type.*application\/json|JSON\.stringify|JSON\.parse|application\/json|@Body|RequestBody/i,
        hasFormData: /FormData|multipart\/form-data|x-www-form-urlencoded|@Field|@FieldMap|@Part|@PartMap/i,
        hasAuth: /authorization|bearer|token|jwt|session|cookie|auth|api[-_]?key|access[-_]?token/i,
        hasPassword: /password|passwd|pwd|secret|credentials/i,
      };

      // ENHANCED backend detection
      function looksLikeBackend(str: string): boolean {
        // Skip obvious non-API strings
        if (str.startsWith('android.') || 
            str.startsWith('java.') || 
            str.startsWith('com.android.') ||
            str.startsWith('androidx.') ||
            str.includes('.class') ||
            str.includes('.kt') ||
            str.includes('.java')) {
          return false;
        }

        return (
          // Query parameters
          /\?(?:op|action|method|cmd|operation)=/.test(str) ||
          // API paths
          /\/(?:api|rest|v\d+|service|endpoint|backend|server)\//.test(str) ||
          // Backend file extensions
          /\.(?:php|asp|aspx|jsp|cgi)(?:\?|$)/.test(str) ||
          // CGI and admin paths
          /\/(?:cgi-bin|admin|upload|login|auth|logout)\//.test(str) ||
          // Data formats
          /\.(?:json|xml)(?:\?|$)/.test(str) ||
          // Modern API patterns
          /\/(?:graphql|webhook|socket|ws)/.test(str) ||
          // CRUD operations in URL
          /\/(?:create|insert|update|delete|remove|edit|modify|save|add|new|get|fetch|list|query|search|find)(?:\/|$|\?)/.test(str) ||
          // Resource patterns
          /\/(?:users|posts|comments|orders|products|customers|items|accounts|profiles|data|records|entries)(?:\/\d+|\/[a-z0-9-]+)?(?:\/|$|\?)/.test(str) ||
          // Database/storage indicators
          /\/(?:database|db|storage|query)\//.test(str) ||
          // Action parameters
          /[?&]action=/.test(str) ||
          // Has path and starts with /
          (str.startsWith('/') && str.length > 3 && /\/[a-z]/.test(str))
        );
      }

      // IMPROVED method determination with deeper context analysis
      function determineMethod(context: string, url: string): ApiEndpoint["method"] {
        const contextLower = context.toLowerCase();
        const urlLower = url.toLowerCase();
        
        // Check explicit method patterns in context
        for (const [method, pattern] of Object.entries(methodPatterns)) {
          if (pattern.test(context)) {
            return method as ApiEndpoint["method"];
          }
        }

        // Heuristics based on URL patterns
        if (/\/(?:delete|remove|destroy|drop|clear)/.test(urlLower)) return "DELETE";
        if (/\/(?:update|edit|modify|patch|change)/.test(urlLower)) return "PUT";
        if (/\/(?:create|insert|add|new|register|signup|submit|save|store)/.test(urlLower)) return "POST";
        if (/\/(?:get|fetch|list|show|view|retrieve|read)/.test(urlLower)) return "GET";
        
        // Check for payload indicators suggesting POST
        if (/(?:FormData|RequestBody|@Body|@Field|JSON\.stringify)/.test(context)) return "POST";
        
        return "UNKNOWN";
      }

      // Database operation determination
      function getDatabaseOperation(method: string, url: string, context: string): string | undefined {
        const urlLower = url.toLowerCase();
        const contextLower = context.toLowerCase();
        const combined = urlLower + " " + contextLower;
        
        // Check explicit patterns
        for (const [op, pattern] of Object.entries(dbOperationPatterns)) {
          if (pattern.test(combined)) {
            return op;
          }
        }

        // Method-based fallback
        if (method === "POST") return "INSERT";
        if (method === "PUT" || method === "PATCH") return "UPDATE";
        if (method === "DELETE") return "DELETE";
        if (method === "GET") return "READ";
        
        return undefined;
      }

      // Payload analysis
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
            // Process ALL text-based files
            if (
              entry.name.endsWith(".smali") ||
              entry.name.endsWith(".dex") ||
              entry.name.endsWith(".xml") ||
              entry.name.endsWith(".json") ||
              entry.name.endsWith(".js") ||
              entry.name.endsWith(".html") ||
              entry.name.endsWith(".txt") ||
              entry.name.endsWith(".properties") ||
              entry.name.endsWith(".gradle") ||
              entry.name.includes("resources.arsc") ||
              entry.name.includes("classes") ||
              fullPath.includes("/assets/") ||
              fullPath.includes("/res/") ||
              fullPath.includes("/lib/") ||
              fullPath.includes("/META-INF/")
            ) {
              try {
                const content = await fs.readFile(fullPath, "utf8");
                
                // Process each URL pattern
                for (const pattern of urlPatterns) {
                  let match;
                  pattern.lastIndex = 0;
                  
                  while ((match = pattern.exec(content)) !== null) {
                    let url = (match[1] || match[0]).trim();
                    
                    // Clean up URL
                    url = url.replace(/['"` \n\r\t]/g, "");
                    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
                      String.fromCharCode(parseInt(code, 16))
                    );
                    url = url.replace(/[,;)}\]>]+$/, "");
                    url = url.replace(/^[<({[]+/, "");
                    
                    // Skip invalid URLs
                    if (!url || 
                        url.startsWith('data:') || 
                        url.startsWith('javascript:') || 
                        url.startsWith('mailto:') || 
                        url.startsWith('#') || 
                        url.length < 4 ||
                        url.includes('..')) {
                      continue;
                    }

                    // Only process backend-looking URLs
                    if (!looksLikeBackend(url)) {
                      continue;
                    }

                    // Deduplicate
                    const urlKey = url.toLowerCase();
                    if (seenUrls.has(urlKey)) {
                      continue;
                    }
                    seenUrls.add(urlKey);

                    // Get larger context window (2000 chars)
                    const contextStart = Math.max(0, match.index - 1500);
                    const contextEnd = Math.min(content.length, match.index + 1500);
                    const surroundingContext = content.substring(contextStart, contextEnd);

                    // Determine method
                    const method = determineMethod(surroundingContext, url);

                    // Determine database operation
                    const dbOperation = getDatabaseOperation(method, url, surroundingContext);

                    // Analyze payload
                    const payloadAnalysis = analyzePayloadContext(surroundingContext);

                    // Determine confidence level
                    let confidence: ApiEndpoint["confidence"] = "medium";
                    if ((method !== "UNKNOWN" && dbOperation) || payloadAnalysis.indicators.length >= 3) {
                      confidence = "high";
                    } else if (method === "UNKNOWN" && !dbOperation && payloadAnalysis.indicators.length === 0) {
                      confidence = "low";
                    }

                    apiEndpoints.push({
                      url,
                      method,
                      context: path.relative(tempDir, fullPath),
                      dbOperation,
                      hasPayload: payloadAnalysis.hasPayload,
                      payloadIndicators: payloadAnalysis.indicators,
                      confidence
                    });
                  }
                }
              } catch (err) {
                // Skip binary or unreadable files
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

    // Sort by confidence, then method, then URL
    apiEndpoints.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
        return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      }
      if (a.method !== b.method) {
        return a.method.localeCompare(b.method);
      }
      return a.url.localeCompare(b.url);
    });

    // Calculate statistics
    const databaseOperations = {
      INSERT: apiEndpoints.filter(e => e.dbOperation === "INSERT").length,
      UPDATE: apiEndpoints.filter(e => e.dbOperation === "UPDATE").length,
      DELETE: apiEndpoints.filter(e => e.dbOperation === "DELETE").length,
      READ: apiEndpoints.filter(e => e.dbOperation === "READ").length,
      UPSERT: apiEndpoints.filter(e => e.dbOperation === "UPSERT").length,
      BULK: apiEndpoints.filter(e => e.dbOperation === "BULK").length,
    };

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
        /auth|login|signup|register|token|jwt|session|password|credentials/i.test(e.url)
      ).length,
      uploadEndpoints: apiEndpoints.filter(e => 
        /upload|file|media|image|attachment|photo|document/i.test(e.url)
      ).length,
      adminEndpoints: apiEndpoints.filter(e => 
        /admin|manage|dashboard|panel|console|settings/i.test(e.url)
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
