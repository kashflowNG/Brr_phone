
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface ApiEndpoint {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "UNKNOWN";
  payload?: string[];
  script: string;
}

export interface ApkAnalysisResult {
  apiEndpoints: ApiEndpoint[];
  totalEndpoints: number;
}

export async function analyzeApk(apkPath: string): Promise<ApkAnalysisResult> {
  const apiEndpoints: ApiEndpoint[] = [];
  const seenUrls = new Set<string>();
  
  try {
    const zip = new AdmZip(apkPath);
    const zipEntries = zip.getEntries();
    
    const tempDir = path.join(path.dirname(apkPath), `temp_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      zip.extractAllTo(tempDir, true);
      
      // COMPREHENSIVE URL patterns
      const urlPatterns = [
        /https?:\/\/[^\s"'\`<>)}\]\n]+/gi,
        /"(\/[a-zA-Z0-9_\-\/\.]+)"/gi,
        /'(\/[a-zA-Z0-9_\-\/\.]+)'/gi,
        /`(\/[a-zA-Z0-9_\-\/\.]+)`/gi,
        /endpoint\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /url\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /path\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /action\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /route\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /uri\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /link\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /@(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/gi,
        /@(?:Url|Path|Query|Field|FieldMap|Part|PartMap|Body|Header|Headers)\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/gi,
        /fetch\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /axios\.\w+\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /\$\.(?:get|post|put|delete|ajax)\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /new\s+URL\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /URL\s*\(\s*["'`]([^"'`\n]+)["'`]/gi,
        /\?(?:op|action|method|cmd|operation)=[a-zA-Z0-9_\-]+/gi,
        /&(?:op|action|method|cmd|operation)=[a-zA-Z0-9_\-]+/gi,
        /(?:BASE_URL|API_URL|ENDPOINT|API_ENDPOINT|ROOT_URL|SERVER_URL)\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
        /["'`]([^"'`]*\/api\/[^"'`]*)["'`]/gi,
        /["'`]([^"'`]*\/v\d+\/[^"'`]*)["'`]/gi,
        /(?:ws|wss):\/\/[^\s"'\`<>)}\]\n]+/gi,
        /\/graphql[^\s"'\`<>)}\]\n]*/gi,
        /\/(?:api|rest|service|endpoint|backend|server)\/[a-zA-Z0-9_\-\/\.]+/gi,
      ];

      // Method detection patterns
      const methodPatterns = {
        GET: /\.get\s*\(|HttpGet|@GET|method\s*[:=]\s*["']GET["']|Request\.Method\.GET|RequestMethod\.GET|GET\s+request|getMethod\(\).*GET/gi,
        POST: /\.post\s*\(|HttpPost|@POST|method\s*[:=]\s*["']POST["']|Request\.Method\.POST|RequestMethod\.POST|POST\s+request|FormBody|MultipartBody|RequestBody|ContentType\.APPLICATION_JSON|application\/json|x-www-form-urlencoded|setRequestMethod\("POST"\)/gi,
        PUT: /\.put\s*\(|HttpPut|@PUT|method\s*[:=]\s*["']PUT["']|Request\.Method\.PUT|RequestMethod\.PUT|PUT\s+request|setRequestMethod\("PUT"\)/gi,
        PATCH: /\.patch\s*\(|HttpPatch|@PATCH|method\s*[:=]\s*["']PATCH["']|Request\.Method\.PATCH|RequestMethod\.PATCH|PATCH\s+request|setRequestMethod\("PATCH"\)/gi,
        DELETE: /\.delete\s*\(|HttpDelete|@DELETE|method\s*[:=]\s*["']DELETE["']|Request\.Method\.DELETE|RequestMethod\.DELETE|DELETE\s+request|setRequestMethod\("DELETE"\)/gi,
      };

      // Payload extraction patterns
      const payloadPattern = /["']?([\w_]+)["']?\s*[:=]\s*(?:["']([^"']+)["']|(\w+)|(\d+))/gi;

      function looksLikeBackend(str: string): boolean {
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
          /\?(?:op|action|method|cmd|operation)=/.test(str) ||
          /\/(?:api|rest|v\d+|service|endpoint|backend|server)\//.test(str) ||
          /\.(?:php|asp|aspx|jsp|cgi)(?:\?|$)/.test(str) ||
          /\/(?:cgi-bin|admin|upload|login|auth|logout)\//.test(str) ||
          /\.(?:json|xml)(?:\?|$)/.test(str) ||
          /\/(?:graphql|webhook|socket|ws)/.test(str) ||
          /\/(?:create|insert|update|delete|remove|edit|modify|save|add|new|get|fetch|list|query|search|find)(?:\/|$|\?)/.test(str) ||
          /\/(?:users|posts|comments|orders|products|customers|items|accounts|profiles|data|records|entries)(?:\/\d+|\/[a-z0-9-]+)?(?:\/|$|\?)/.test(str) ||
          /\/(?:database|db|storage|query)\//.test(str) ||
          /[?&]action=/.test(str) ||
          (str.startsWith('/') && str.length > 3 && /\/[a-z]/.test(str))
        );
      }

      function determineMethod(context: string): ApiEndpoint["method"] {
        for (const [method, pattern] of Object.entries(methodPatterns)) {
          if (pattern.test(context)) {
            return method as ApiEndpoint["method"];
          }
        }
        if (/(?:FormData|RequestBody|@Body|@Field|JSON\.stringify)/.test(context)) return "POST";
        return "UNKNOWN";
      }

      function extractPayloadParams(context: string): string[] {
        const params = new Set<string>();
        let match;
        payloadPattern.lastIndex = 0;
        
        while ((match = payloadPattern.exec(context)) !== null) {
          const paramName = match[1];
          if (paramName && paramName.length > 1 && paramName.length < 50) {
            params.add(paramName);
          }
        }
        
        return Array.from(params).slice(0, 10);
      }

      // Process all files recursively
      async function processDirectory(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await processDirectory(fullPath);
          } else {
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
                const relPath = path.relative(tempDir, fullPath);
                
                // Extract API endpoints
                for (const pattern of urlPatterns) {
                  let match;
                  pattern.lastIndex = 0;
                  
                  while ((match = pattern.exec(content)) !== null) {
                    let url = (match[1] || match[0]).trim();
                    
                    url = url.replace(/['"` \n\r\t]/g, "");
                    url = url.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
                      String.fromCharCode(parseInt(code, 16))
                    );
                    url = url.replace(/[,;)}\]>]+$/, "");
                    url = url.replace(/^[<({[]+/, "");
                    
                    if (!url || 
                        url.startsWith('data:') || 
                        url.startsWith('javascript:') || 
                        url.startsWith('mailto:') || 
                        url.startsWith('#') || 
                        url.length < 4 ||
                        url.includes('..')) {
                      continue;
                    }

                    if (!looksLikeBackend(url)) {
                      continue;
                    }

                    const urlKey = url.toLowerCase();
                    if (seenUrls.has(urlKey)) {
                      continue;
                    }
                    seenUrls.add(urlKey);

                    const contextStart = Math.max(0, match.index - 1000);
                    const contextEnd = Math.min(content.length, match.index + 1000);
                    const surroundingContext = content.substring(contextStart, contextEnd);

                    const method = determineMethod(surroundingContext);
                    const payloadParams = extractPayloadParams(surroundingContext);

                    apiEndpoints.push({
                      url,
                      method,
                      payload: payloadParams.length > 0 ? payloadParams : undefined,
                      script: relPath
                    });
                  }
                }
              } catch (err) {
                continue;
              }
            }
          }
        }
      }

      await processDirectory(tempDir);

    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error("Failed to cleanup temp directory:", err);
      }
    }

    // Sort endpoints by method then URL
    apiEndpoints.sort((a, b) => {
      if (a.method !== b.method) {
        return a.method.localeCompare(b.method);
      }
      return a.url.localeCompare(b.url);
    });

    return {
      apiEndpoints,
      totalEndpoints: apiEndpoints.length
    };

  } catch (error) {
    console.error("Error analyzing APK:", error);
    throw new Error("Failed to analyze APK file");
  }
}
