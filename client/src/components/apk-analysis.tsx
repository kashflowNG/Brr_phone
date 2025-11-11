import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Code, RefreshCw } from "lucide-react";
import type { ApkFile } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ApiEndpoint {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "UNKNOWN";
  payload?: string[];
  script: string;
}

interface ApkAnalysisResult {
  apiEndpoints: ApiEndpoint[];
  totalEndpoints: number;
}

interface ApkAnalysisProps {
  apkFile: ApkFile;
}

export function ApkAnalysis({ apkFile }: ApkAnalysisProps) {
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, refetch } = useQuery<ApkAnalysisResult>({
    queryKey: [`/api/apk-files/${apkFile.id}/analyze`],
    enabled,
  });

  const handleAnalyze = () => {
    setEnabled(true);
    refetch();
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "secondary";
      case "POST": return "default";
      case "PUT": return "outline";
      case "PATCH": return "outline";
      case "DELETE": return "destructive";
      default: return "secondary";
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              API Endpoint Analysis
            </CardTitle>
            <CardDescription>
              Extract endpoints, methods, payloads, and scripts
            </CardDescription>
          </div>
          <Button onClick={handleAnalyze} disabled={isLoading} size="sm">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {!enabled && !data && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Click "Analyze" to extract API endpoints</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Extracting endpoints from APK...</p>
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Found {data.totalEndpoints} endpoint{data.totalEndpoints !== 1 ? 's' : ''}
              </h3>
            </div>

            <ScrollArea className="h-[600px] pr-4">
              {data.apiEndpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No API endpoints detected
                </p>
              ) : (
                <div className="space-y-3">
                  {data.apiEndpoints.map((endpoint, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={getMethodColor(endpoint.method)} className="font-mono">
                            {endpoint.method}
                          </Badge>
                          <code className="text-sm flex-1 break-all">
                            {endpoint.url}
                          </code>
                        </div>

                        {endpoint.payload && endpoint.payload.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Payload Parameters:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {endpoint.payload.map((param, i) => (
                                <Badge key={i} variant="secondary" className="text-xs font-mono">
                                  {param}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Script:</span>{" "}
                          <code className="bg-muted px-1 py-0.5 rounded">
                            {endpoint.script}
                          </code>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}