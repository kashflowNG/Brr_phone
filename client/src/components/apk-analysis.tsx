
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
  method: "GET" | "POST";
  context: string;
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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              API Analysis
            </CardTitle>
            <CardDescription>
              Scan APK for GET and POST requests
            </CardDescription>
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
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
            <p className="text-sm">Click "Analyze" to scan for API endpoints</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {data.totalEndpoints} endpoints found
              </Badge>
            </div>

            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {data.apiEndpoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No API endpoints detected
                  </p>
                ) : (
                  data.apiEndpoints.map((endpoint, index) => (
                    <Card key={index} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <Badge
                            variant={endpoint.method === "POST" ? "default" : "secondary"}
                            className="shrink-0"
                          >
                            {endpoint.method}
                          </Badge>
                          <code className="text-xs break-all flex-1 bg-muted px-2 py-1 rounded">
                            {endpoint.url}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          Found in: {endpoint.context}
                        </p>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
