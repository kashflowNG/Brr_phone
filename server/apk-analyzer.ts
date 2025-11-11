
import AdmZip from "adm-zip";
import fs from "fs/promises";

export interface ApiEndpoint {
  url: string;
  method: "GET" | "POST";
  context: string;
}

export interface ApkAnalysisResult {
  apiEndpoints: ApiEndpoint[];
  totalEndpoints: number;
}

export async function analyzeApk(apkPath: string): Promise<ApkAnalysisResult> {
  const apiEndpoints: ApiEndpoint[] = [];
  
  try {
    const zip = new AdmZip(apkPath);
    const zipEntries = zip.getEntries();

    // Patterns to find API requests
    const urlPatterns = [
      /https?:\/\/[^\s"'`]+/gi,
      /"(\/api\/[^"]+)"/gi,
      /'(\/api\/[^']+)'/gi,
    ];

    const methodPatterns = {
      GET: /\.get\s*\(|GET|HttpGet|@GET/gi,
      POST: /\.post\s*\(|POST|HttpPost|@POST/gi,
    };

    // Analyze text files in the APK
    for (const entry of zipEntries) {
      const fileName = entry.entryName;
      
      // Focus on code files
      if (
        fileName.endsWith(".smali") ||
        fileName.endsWith(".xml") ||
        fileName.endsWith(".json") ||
        fileName.includes("resources.arsc")
      ) {
        try {
          const content = entry.getData().toString("utf8");
          
          // Find URLs
          for (const pattern of urlPatterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
              const url = match[0].replace(/['"]/g, "");
              
              // Try to determine the HTTP method
              const surrounding = content.substring(
                Math.max(0, match.index! - 200),
                Math.min(content.length, match.index! + 200)
              );
              
              let method: "GET" | "POST" = "GET";
              if (methodPatterns.POST.test(surrounding)) {
                method = "POST";
              }
              
              // Check if this endpoint already exists
              if (!apiEndpoints.some(e => e.url === url && e.method === method)) {
                apiEndpoints.push({
                  url,
                  method,
                  context: fileName,
                });
              }
            }
          }
        } catch (err) {
          // Skip files that can't be read as text
          continue;
        }
      }
    }

    // Sort by method and URL
    apiEndpoints.sort((a, b) => {
      if (a.method !== b.method) {
        return a.method.localeCompare(b.method);
      }
      return a.url.localeCompare(b.url);
    });

  } catch (error) {
    console.error("Error analyzing APK:", error);
    throw new Error("Failed to analyze APK file");
  }

  return {
    apiEndpoints,
    totalEndpoints: apiEndpoints.length,
  };
}
