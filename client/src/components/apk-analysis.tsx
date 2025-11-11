
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Code, RefreshCw, Database, TrendingUp, Shield } from "lucide-react";
import type { ApkFile } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ApiEndpoint {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "UNKNOWN";
  context: string;
  dbOperation?: string;
  hasPayload?: boolean;
  payloadIndicators?: string[];
  confidence: "high" | "medium" | "low";
}

interface ApkAnalysisResult {
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

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: "bg-green-500 text-white",
      medium: "bg-yellow-500 text-white",
      low: "bg-gray-500 text-white"
    };
    return colors[confidence as keyof typeof colors] || colors.low;
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Comprehensive API Analysis
            </CardTitle>
            <CardDescription>
              Deep scan for endpoints, database operations & payloads
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
            <p className="text-sm">Click "Analyze" to perform comprehensive endpoint scan</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Scanning APK for API endpoints...</p>
          </div>
        )}

        {data && !isLoading && (
          <Tabs defaultValue="endpoints" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="endpoints">Endpoints ({data.totalEndpoints})</TabsTrigger>
              <TabsTrigger value="database">Database Ops</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints" className="flex-1 mt-4">
              <ScrollArea className="h-[500px] pr-4">
                {data.apiEndpoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No API endpoints detected
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.apiEndpoints.map((endpoint, index) => (
                      <Card key={index} className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge variant={getMethodColor(endpoint.method)} className="shrink-0">
                              {endpoint.method}
                            </Badge>
                            {endpoint.dbOperation && (
                              <Badge variant="outline" className="shrink-0">
                                <Database className="w-3 h-3 mr-1" />
                                {endpoint.dbOperation}
                              </Badge>
                            )}
                            {endpoint.confidence && (
                              <Badge className={`shrink-0 ${getConfidenceBadge(endpoint.confidence)}`}>
                                {endpoint.confidence.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          
                          <code className="text-xs break-all block bg-muted px-2 py-1 rounded">
                            {endpoint.url}
                          </code>
                          
                          {endpoint.hasPayload && endpoint.payloadIndicators && endpoint.payloadIndicators.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-muted-foreground">Payload:</span>
                              {endpoint.payloadIndicators.map((indicator, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {indicator}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground truncate">
                            Found in: {endpoint.context}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="database" className="flex-1 mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(data.databaseOperations).map(([op, count]) => (
                    <Card key={op} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{op}</span>
                        </div>
                        <Badge variant="secondary" className="text-lg font-bold">
                          {count}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="p-4 bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Database Operation Breakdown:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• INSERT: Create/Add new records</li>
                    <li>• UPDATE: Modify existing records</li>
                    <li>• DELETE: Remove records</li>
                    <li>• READ: Fetch/Query data</li>
                    <li>• UPSERT: Insert or Update (merge)</li>
                    <li>• BULK: Batch operations</li>
                  </ul>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="flex-1 mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Total URLs</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.totalUrls}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Domains</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.uniqueDomains}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Auth</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.authEndpoints}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Upload</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.uploadEndpoints}
                      </Badge>
                    </div>
                  </Card>
                </div>

                <Card className="p-4 bg-blue-50 dark:bg-blue-950">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security & Admin
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Found {data.summary.adminEndpoints} admin/management endpoints
                  </p>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
