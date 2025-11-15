
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
  uiElement?: string;
  buttonText?: string;
  eventType?: string;
}

export interface UiComponent {
  type: string;
  id?: string;
  text?: string;
  action?: string;
  listeners: string[];
  file: string;
}

export interface SecurityFinding {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  location: string;
  evidence?: string;
}

export interface ApkAnalysisResult {
  apiEndpoints: ApiEndpoint[];
  uiComponents: UiComponent[];
  totalEndpoints: number;
  totalUiElements: number;
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
    buttons: number;
    textFields: number;
    clickHandlers: number;
  };
  securityFindings: SecurityFinding[];
  permissions: string[];
  cryptoUsage: {
    hardcodedKeys: number;
    weakAlgorithms: number;
    sslIssues: number;
  };
  thirdPartyLibraries: string[];
}

export async function analyzeApk(apkPath: string): Promise<ApkAnalysisResult> {
  const apiEndpoints: ApiEndpoint[] = [];
  const uiComponents: UiComponent[] = [];
  const securityFindings: SecurityFinding[] = [];
  const permissions: string[] = [];
  const thirdPartyLibraries = new Set<string>();
  const seenUrls = new Set<string>();
  const seenUiElements = new Set<string>();
  
  let hardcodedKeys = 0;
  let weakAlgorithms = 0;
  let sslIssues = 0;
  
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

      // Security patterns
      const securityPatterns = {
        hardcodedSecrets: [
          /["']([a-zA-Z0-9]{32,})["']/g, // API keys
          /password\s*[:=]\s*["']([^"']{4,})["']/gi,
          /secret\s*[:=]\s*["']([^"']{4,})["']/gi,
          /api[-_]?key\s*[:=]\s*["']([^"']{10,})["']/gi,
          /access[-_]?token\s*[:=]\s*["']([^"']{10,})["']/gi,
          /private[-_]?key\s*[:=]\s*["']([^"']{10,})["']/gi,
          /aws[-_]?secret\s*[:=]\s*["']([^"']{10,})["']/gi,
          /AKIA[0-9A-Z]{16}/g, // AWS Access Key
        ],
        weakCrypto: [
          /DES|RC4|MD5|SHA1(?!256|384|512)/gi,
          /TrustAllCertificates|TrustManager|HostnameVerifier/gi,
          /SSLSocketFactory\.ALLOW_ALL_HOSTNAME_VERIFIER/gi,
        ],
        sqlInjection: [
          /execSQL\s*\([^)]*\+/gi,
          /rawQuery\s*\([^)]*\+/gi,
          /query\s*\([^)]*\+[^)]*\)/gi,
        ],
        commandInjection: [
          /Runtime\.getRuntime\(\)\.exec/gi,
          /ProcessBuilder/gi,
        ],
        unsafeWebView: [
          /setJavaScriptEnabled\s*\(\s*true/gi,
          /addJavascriptInterface/gi,
          /setAllowFileAccess\s*\(\s*true/gi,
          /setAllowFileAccessFromFileURLs\s*\(\s*true/gi,
        ],
        urlSchemes: [
          /http:\/\//gi, // Insecure HTTP
        ],
      };

      // Permission patterns
      const permissionPatterns = [
        /<uses-permission\s+android:name="([^"]+)"/gi,
        /<permission\s+android:name="([^"]+)"/gi,
      ];

      // Third-party library patterns
      const libraryPatterns = [
        /com\.google\.(firebase|android|gms)/gi,
        /com\.facebook\./gi,
        /retrofit2?\./gi,
        /okhttp3?\./gi,
        /com\.squareup\./gi,
        /io\.reactivex/gi,
        /com\.amazonaws/gi,
        /org\.apache/gi,
        /com\.stripe/gi,
        /com\.paypal/gi,
      ];

      // UI Component patterns
      const uiPatterns = {
        buttons: [
          /<Button[^>]*>/gi,
          /<button[^>]*>/gi,
          /android:id="@\+id\/([^"]*btn[^"]*)"/gi,
          /android:id="@\+id\/([^"]*button[^"]*)"/gi,
          /findViewById.*Button/gi,
          /setOnClickListener/gi,
          /onClick\s*[:=]\s*["'`]([^"'`\n]+)["'`]/gi,
          /\.click\s*\(/gi,
          /addEventListener\s*\(\s*["']click["']/gi,
        ],
        textFields: [
          /<input[^>]*>/gi,
          /<TextField[^>]*>/gi,
          /android:id="@\+id\/([^"]*edit[^"]*)"/gi,
          /android:id="@\+id\/([^"]*input[^"]*)"/gi,
          /EditText/gi,
          /TextInputLayout/gi,
          /type\s*=\s*["']text["']/gi,
          /type\s*=\s*["']password["']/gi,
        ],
        images: [
          /<img[^>]*>/gi,
          /<Image[^>]*>/gi,
          /android:id="@\+id\/([^"]*image[^"]*)"/gi,
          /ImageView/gi,
        ],
        eventListeners: [
          /setOnClickListener/gi,
          /addEventListener/gi,
          /onClick/gi,
          /onTouch/gi,
          /onLongClick/gi,
          /addTextChangedListener/gi,
          /setOnFocusChangeListener/gi,
        ]
      };

      // Method detection patterns
      const methodPatterns = {
        GET: /\.get\s*\(|HttpGet|@GET|method\s*[:=]\s*["']GET["']|Request\.Method\.GET|RequestMethod\.GET|GET\s+request|getMethod\(\).*GET/gi,
        POST: /\.post\s*\(|HttpPost|@POST|method\s*[:=]\s*["']POST["']|Request\.Method\.POST|RequestMethod\.POST|POST\s+request|FormBody|MultipartBody|RequestBody|ContentType\.APPLICATION_JSON|application\/json|x-www-form-urlencoded|setRequestMethod\("POST"\)/gi,
        PUT: /\.put\s*\(|HttpPut|@PUT|method\s*[:=]\s*["']PUT["']|Request\.Method\.PUT|RequestMethod\.PUT|PUT\s+request|setRequestMethod\("PUT"\)/gi,
        PATCH: /\.patch\s*\(|HttpPatch|@PATCH|method\s*[:=]\s*["']PATCH["']|Request\.Method\.PATCH|RequestMethod\.PATCH|PATCH\s+request|setRequestMethod\("PATCH"\)/gi,
        DELETE: /\.delete\s*\(|HttpDelete|@DELETE|method\s*[:=]\s*["']DELETE["']|Request\.Method\.DELETE|RequestMethod\.DELETE|DELETE\s+request|setRequestMethod\("DELETE"\)/gi,
      };

      // Database operation patterns
      const dbOperationPatterns = {
        INSERT: /\/(?:create|insert|add|new|register|signup|submit|save|store|append|write|put)(?:\/|$|\?|&)|action=(?:create|insert|add|new|register|signup)|op=(?:insert|add|create|new)|method.*(?:create|insert|add)|CREATE\s+|INSERT\s+INTO|\.save\(|\.insert\(|\.create\(/gi,
        UPDATE: /\/(?:update|edit|modify|change|patch|save|put|alter|set|revise)(?:\/|$|\?|&)|action=(?:update|edit|modify|change|patch)|op=(?:update|edit|modify|patch)|method.*(?:update|edit|modify)|UPDATE\s+SET|\.update\(|\.modify\(|\.edit\(/gi,
        DELETE: /\/(?:delete|remove|destroy|drop|clear|purge|erase|trash)(?:\/|$|\?|&)|action=(?:delete|remove|destroy|drop)|op=(?:delete|remove|destroy)|method.*(?:delete|remove)|DELETE\s+FROM|WHERE.*DELETE|\.delete\(|\.remove\(|\.destroy\(/gi,
        UPSERT: /\/(?:upsert|merge|replace|sync|saveOrUpdate)(?:\/|$|\?|&)|action=(?:upsert|merge|sync)|op=(?:upsert|merge)|REPLACE\s+INTO|INSERT.*ON\s+DUPLICATE|\.upsert\(|\.merge\(/gi,
        BULK: /\/(?:bulk|batch|multi|mass|many)(?:\/|$|\?|&)|action=(?:bulk|batch|multi)|op=(?:bulk|batch)|bulkInsert|bulkUpdate|bulkDelete|\.bulkCreate\(|\.bulkUpdate\(/gi,
        READ: /\/(?:get|list|fetch|query|search|find|read|view|show|retrieve|select|load|all)(?:\/|$|\?|&)|action=(?:get|list|fetch|query|search|find)|op=(?:get|fetch|select|query)|SELECT\s+.*FROM|\.get\(|\.find\(|\.query\(|\.search\(/gi,
      };

      // Payload indicators
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

      function determineMethod(context: string, url: string): ApiEndpoint["method"] {
        const contextLower = context.toLowerCase();
        const urlLower = url.toLowerCase();
        
        for (const [method, pattern] of Object.entries(methodPatterns)) {
          if (pattern.test(context)) {
            return method as ApiEndpoint["method"];
          }
        }

        if (/\/(?:delete|remove|destroy|drop|clear)/.test(urlLower)) return "DELETE";
        if (/\/(?:update|edit|modify|patch|change)/.test(urlLower)) return "PUT";
        if (/\/(?:create|insert|add|new|register|signup|submit|save|store)/.test(urlLower)) return "POST";
        if (/\/(?:get|fetch|list|show|view|retrieve|read)/.test(urlLower)) return "GET";
        
        if (/(?:FormData|RequestBody|@Body|@Field|JSON\.stringify)/.test(context)) return "POST";
        
        return "UNKNOWN";
      }

      function getDatabaseOperation(method: string, url: string, context: string): string | undefined {
        const urlLower = url.toLowerCase();
        const contextLower = context.toLowerCase();
        const combined = urlLower + " " + contextLower;
        
        for (const [op, pattern] of Object.entries(dbOperationPatterns)) {
          if (pattern.test(combined)) {
            return op;
          }
        }

        if (method === "POST") return "INSERT";
        if (method === "PUT" || method === "PATCH") return "UPDATE";
        if (method === "DELETE") return "DELETE";
        if (method === "GET") return "READ";
        
        return undefined;
      }

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

      function extractUiInfo(context: string): { uiElement?: string; buttonText?: string; eventType?: string } {
        let uiElement: string | undefined;
        let buttonText: string | undefined;
        let eventType: string | undefined;

        // Check for button
        if (/button|btn|click/i.test(context)) {
          uiElement = "Button";
          
          // Extract button text
          const textMatch = context.match(/android:text="([^"]+)"|text[:=]["']([^"']+)["']|>([^<]{1,50})<\/[Bb]utton>/);
          if (textMatch) {
            buttonText = textMatch[1] || textMatch[2] || textMatch[3];
          }
        }

        // Check for input field
        if (/input|edit|textfield/i.test(context)) {
          uiElement = "Input Field";
        }

        // Determine event type
        if (/onClick|setOnClickListener|click/i.test(context)) {
          eventType = "Click";
        } else if (/onSubmit|submit/i.test(context)) {
          eventType = "Submit";
        } else if (/onChange|textChanged/i.test(context)) {
          eventType = "Change";
        }

        return { uiElement, buttonText, eventType };
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
                
                // Extract Permissions
                if (entry.name === "AndroidManifest.xml") {
                  for (const pattern of permissionPatterns) {
                    let match;
                    pattern.lastIndex = 0;
                    while ((match = pattern.exec(content)) !== null) {
                      const permission = match[1];
                      if (!permissions.includes(permission)) {
                        permissions.push(permission);
                        
                        // Flag dangerous permissions
                        if (permission.includes("INTERNET") || 
                            permission.includes("READ_EXTERNAL_STORAGE") ||
                            permission.includes("WRITE_EXTERNAL_STORAGE") ||
                            permission.includes("CAMERA") ||
                            permission.includes("RECORD_AUDIO") ||
                            permission.includes("ACCESS_FINE_LOCATION") ||
                            permission.includes("READ_CONTACTS") ||
                            permission.includes("SEND_SMS")) {
                          securityFindings.push({
                            type: "Sensitive Permission",
                            severity: "medium",
                            description: `App requests ${permission.split('.').pop()}`,
                            location: relPath,
                          });
                        }
                      }
                    }
                  }
                }

                // Detect Third-party Libraries
                for (const pattern of libraryPatterns) {
                  let match;
                  pattern.lastIndex = 0;
                  while ((match = pattern.exec(content)) !== null) {
                    thirdPartyLibraries.add(match[0].split('.').slice(0, 3).join('.'));
                  }
                }

                // Security Analysis
                for (const [type, patterns] of Object.entries(securityPatterns)) {
                  for (const pattern of patterns) {
                    let match;
                    pattern.lastIndex = 0;
                    while ((match = pattern.exec(content)) !== null) {
                      const contextStart = Math.max(0, match.index - 100);
                      const contextEnd = Math.min(content.length, match.index + 100);
                      const evidence = content.substring(contextStart, contextEnd)
                        .replace(/\s+/g, ' ').trim().substring(0, 100);

                      if (type === "hardcodedSecrets") {
                        hardcodedKeys++;
                        if (match[1] && match[1].length > 15) {
                          securityFindings.push({
                            type: "Hardcoded Secret",
                            severity: "high",
                            description: `Potential hardcoded secret found (${match[1].substring(0, 10)}...)`,
                            location: relPath,
                            evidence,
                          });
                        }
                      } else if (type === "weakCrypto") {
                        weakAlgorithms++;
                        securityFindings.push({
                          type: "Weak Cryptography",
                          severity: "high",
                          description: `Weak or deprecated crypto detected: ${match[0]}`,
                          location: relPath,
                          evidence,
                        });
                      } else if (type === "sqlInjection") {
                        securityFindings.push({
                          type: "SQL Injection Risk",
                          severity: "critical",
                          description: "Dynamic SQL query construction detected",
                          location: relPath,
                          evidence,
                        });
                      } else if (type === "commandInjection") {
                        securityFindings.push({
                          type: "Command Injection Risk",
                          severity: "critical",
                          description: "Runtime command execution detected",
                          location: relPath,
                          evidence,
                        });
                      } else if (type === "unsafeWebView") {
                        securityFindings.push({
                          type: "Unsafe WebView Configuration",
                          severity: "high",
                          description: `Insecure WebView setting: ${match[0]}`,
                          location: relPath,
                          evidence,
                        });
                      } else if (type === "urlSchemes") {
                        sslIssues++;
                      }
                    }
                  }
                }
                
                // Extract UI Components
                for (const [uiType, patterns] of Object.entries(uiPatterns)) {
                  for (const pattern of patterns) {
                    let match;
                    pattern.lastIndex = 0;
                    
                    while ((match = pattern.exec(content)) !== null) {
                      const contextStart = Math.max(0, match.index - 500);
                      const contextEnd = Math.min(content.length, match.index + 500);
                      const uiContext = content.substring(contextStart, contextEnd);
                      
                      // Extract ID and text
                      const idMatch = uiContext.match(/android:id="@\+id\/([^"]+)"|id[:=]["']([^"']+)["']/);
                      const textMatch = uiContext.match(/android:text="([^"]+)"|text[:=]["']([^"']+)["']|>([^<]{1,100})</);
                      const actionMatch = uiContext.match(/onClick[:=]["']([^"']+)["']|setOnClickListener/);
                      
                      const listeners: string[] = [];
                      if (/onClick|setOnClickListener/.test(uiContext)) listeners.push("Click");
                      if (/onTouch/.test(uiContext)) listeners.push("Touch");
                      if (/onLongClick/.test(uiContext)) listeners.push("Long Click");
                      if (/addTextChangedListener/.test(uiContext)) listeners.push("Text Changed");
                      
                      const uiKey = `${uiType}-${idMatch?.[1] || idMatch?.[2] || 'unknown'}-${relPath}`;
                      if (!seenUiElements.has(uiKey) && listeners.length > 0) {
                        seenUiElements.add(uiKey);
                        
                        uiComponents.push({
                          type: uiType,
                          id: idMatch?.[1] || idMatch?.[2],
                          text: textMatch?.[1] || textMatch?.[2] || textMatch?.[3],
                          action: actionMatch?.[1],
                          listeners,
                          file: relPath
                        });
                      }
                    }
                  }
                }
                
                // Process URLs
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

                    const contextStart = Math.max(0, match.index - 2000);
                    const contextEnd = Math.min(content.length, match.index + 2000);
                    const surroundingContext = content.substring(contextStart, contextEnd);

                    const method = determineMethod(surroundingContext, url);
                    const dbOperation = getDatabaseOperation(method, url, surroundingContext);
                    const payloadAnalysis = analyzePayloadContext(surroundingContext);
                    const uiInfo = extractUiInfo(surroundingContext);

                    let confidence: ApiEndpoint["confidence"] = "medium";
                    if ((method !== "UNKNOWN" && dbOperation) || payloadAnalysis.indicators.length >= 3) {
                      confidence = "high";
                    } else if (method === "UNKNOWN" && !dbOperation && payloadAnalysis.indicators.length === 0) {
                      confidence = "low";
                    }

                    apiEndpoints.push({
                      url,
                      method,
                      context: relPath,
                      dbOperation,
                      hasPayload: payloadAnalysis.hasPayload,
                      payloadIndicators: payloadAnalysis.indicators,
                      confidence,
                      uiElement: uiInfo.uiElement,
                      buttonText: uiInfo.buttonText,
                      eventType: uiInfo.eventType
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

    // Sort endpoints
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
      buttons: uiComponents.filter(u => u.type === 'buttons').length,
      textFields: uiComponents.filter(u => u.type === 'textFields').length,
      clickHandlers: uiComponents.filter(u => u.listeners.includes('Click')).length,
    };

    // Sort security findings by severity
    securityFindings.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return {
      apiEndpoints,
      uiComponents,
      totalEndpoints: apiEndpoints.length,
      totalUiElements: uiComponents.length,
      databaseOperations,
      summary,
      securityFindings: securityFindings.slice(0, 50), // Limit to top 50
      permissions: permissions.sort(),
      cryptoUsage: {
        hardcodedKeys,
        weakAlgorithms,
        sslIssues,
      },
      thirdPartyLibraries: Array.from(thirdPartyLibraries).sort(),
    };

  } catch (error) {
    console.error("Error analyzing APK:", error);
    throw new Error("Failed to analyze APK file");
  }
}
