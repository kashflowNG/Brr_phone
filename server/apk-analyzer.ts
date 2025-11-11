
import AdmZip from "adm-zip";

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

    // Enhanced URL patterns including database operations
    const urlPatterns = [
      // Standard URLs
      /https?:\/\/[^\s"'\`<>)}\]]+/gi,
      // API paths
      /"(\/api\/[^"]+)"/gi,
      /'(\/api\/[^']+)'/gi,
      // Endpoints with parameters
      /endpoint\s*[:=]\s*["']([^"']+)["']/gi,
      /url\s*[:=]\s*["']([^"']+)["']/gi,
      /path\s*[:=]\s*["']([^"']+)["']/gi,
      /action\s*[:=]\s*["']([^"']+)["']/gi,
      // Retrofit/OkHttp patterns
      /@(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']\s*\)/gi,
    ];

    // Method detection patterns (expanded)
    const methodPatterns = {
      GET: /\.get\s*\(|HttpGet|@GET|method\s*[:=]\s*["']GET["']|Request\.Method\.GET/gi,
      POST: /\.post\s*\(|HttpPost|@POST|method\s*[:=]\s*["']POST["']|Request\.Method\.POST|FormBody|MultipartBody/gi,
      PUT: /\.put\s*\(|HttpPut|@PUT|method\s*[:=]\s*["']PUT["']|Request\.Method\.PUT/gi,
      PATCH: /\.patch\s*\(|HttpPatch|@PATCH|method\s*[:=]\s*["']PATCH["']|Request\.Method\.PATCH/gi,
      DELETE: /\.delete\s*\(|HttpDelete|@DELETE|method\s*[:=]\s*["']DELETE["']|Request\.Method\.DELETE/gi,
    };

    // Database operation patterns (comprehensive)
    const dbOperationPatterns = {
      INSERT: /\/(?:create|insert|add|new|register|signup|submit|save|store)(?:\/|$|\?)|action=(?:create|insert|add|new)|op=insert/gi,
      UPDATE: /\/(?:update|edit|modify|change|patch|save|put|alter|set)(?:\/|$|\?)|action=(?:update|edit|modify)|op=update/gi,
      DELETE: /\/(?:delete|remove|destroy|drop|clear|purge|erase)(?:\/|$|\?)|action=(?:delete|remove)|op=delete/gi,
      UPSERT: /\/(?:upsert|merge|replace|save)(?:\/|$|\?)|action=upsert/gi,
      BULK: /\/(?:bulk|batch|multi|mass)(?:\/|$|\?)|action=bulk/gi,
    };

    // Payload indicators
    const payloadIndicators = {
      hasId: /["']?(?:id|_id|user_id|post_id|item_id|object_id)["']?\s*[:=]/i,
      hasUserData: /["']?(?:user|email|username|password|name|profile|phone|address)["']?\s*[:=]/i,
      hasTimestamp: /["']?(?:timestamp|created_at|updated_at|date|time|datetime)["']?\s*[:=]/i,
      hasFileData: /["']?(?:file|image|upload|attachment|media|blob|binary)["']?\s*[:=]/i,
      hasStatus: /["']?(?:status|state|active|enabled|published)["']?\s*[:=]/i,
      hasSqlKeywords: /\b(?:INSERT|UPDATE|DELETE|SELECT|WHERE|SET|VALUES)\b/gi,
    };

    // Backend detection (enhanced)
    function looksLikeBackend(str: string): boolean {
      return (
        str.includes("?op=") ||
        str.includes("/api/") ||
        /\.php(\?|$)/.test(str) ||
        /\.asp(x)?(\?|$)/.test(str) ||
        /\.jsp(\?|$)/.test(str) ||
        /\/cgi-bin\//.test(str) ||
        /\/admin\//.test(str) ||
        /\/upload/.test(str) ||
        /\/login/.test(str) ||
        /\/auth/.test(str) ||
        /\/logout/.test(str) ||
        /\.json$/.test(str) ||
        /\.xml$/.test(str) ||
        /\/graphql/.test(str) ||
        /\/webhook/.test(str) ||
        /\/(?:create|insert|update|delete|remove|edit|modify|save)/.test(str) ||
        /\/(?:users|posts|comments|orders|products|customers|items|accounts)\/\d+/.test(str) ||
        /\?action=/.test(str) ||
        /\/database\//.test(str) ||
        /\/db\//.test(str) ||
        /\/query/.test(str)
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
    function getDatabaseOperation(method: string, url: string): string | undefined {
      const urlLower = url.toLowerCase();
      
      for (const [op, pattern] of Object.entries(dbOperationPatterns)) {
        if (pattern.test(urlLower)) {
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

    // Process each file in APK
    for (const entry of zipEntries) {
      const fileName = entry.entryName;
      
      // Focus on code and resource files
      if (
        fileName.endsWith(".smali") ||
        fileName.endsWith(".dex") ||
        fileName.endsWith(".xml") ||
        fileName.endsWith(".json") ||
        fileName.includes("resources.arsc") ||
        fileName.includes("classes") ||
        fileName.includes("assets/")
      ) {
        try {
          const content = entry.getData().toString("utf8");
          
          // Find all URLs
          for (const pattern of urlPatterns) {
            let match;
            pattern.lastIndex = 0; // Reset regex state
            
            while ((match = pattern.exec(content)) !== null) {
              let url = (match[1] || match[0]).replace(/['"]/g, "");
              
              // Clean up URL
              url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
                String.fromCharCode(parseInt(code, 16))
              );
              
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

              // Get context (surrounding code)
              const contextStart = Math.max(0, match.index - 500);
              const contextEnd = Math.min(content.length, match.index + 500);
              const surroundingContext = content.substring(contextStart, contextEnd);

              // Determine method
              const method = determineMethod(surroundingContext, url);

              // Determine database operation
              const dbOperation = getDatabaseOperation(method, url);

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
                context: fileName,
                dbOperation,
                hasPayload: payloadAnalysis.hasPayload,
                payloadIndicators: payloadAnalysis.indicators,
                confidence
              });
            }
          }
        } catch (err) {
          // Skip files that can't be read as text
          continue;
        }
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
        /auth|login|signup|register|token|jwt/i.test(e.url)
      ).length,
      uploadEndpoints: apiEndpoints.filter(e => 
        /upload|file|media|image|attachment/i.test(e.url)
      ).length,
      adminEndpoints: apiEndpoints.filter(e => 
        /admin|manage|dashboard|panel/i.test(e.url)
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
