
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Code, RefreshCw, Database, TrendingUp, Shield, MousePointer, Type, Smartphone } from "lucide-react";
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
  uiElement?: string;
  buttonText?: string;
  eventType?: string;
}

interface UiComponent {
  type: string;
  id?: string;
  text?: string;
  action?: string;
  listeners: string[];
  file: string;
}

interface ApkAnalysisResult {
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
              Deep APK Analysis
            </CardTitle>
            <CardDescription>
              API endpoints, UI elements, buttons & database operations
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
            <p className="text-sm">Click "Analyze" to scan for endpoints and UI components</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Deep scanning APK structure...</p>
            <p className="text-xs text-muted-foreground">Extracting UI components and API calls</p>
          </div>
        )}

        {data && !isLoading && (
          <Tabs defaultValue="endpoints" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="endpoints">
                API ({data.totalEndpoints})
              </TabsTrigger>
              <TabsTrigger value="ui">
                UI ({data.totalUiElements})
              </TabsTrigger>
              <TabsTrigger value="database">
                Database
              </TabsTrigger>
              <TabsTrigger value="summary">
                Summary
              </TabsTrigger>
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
                            {endpoint.uiElement && (
                              <Badge variant="secondary" className="shrink-0">
                                <MousePointer className="w-3 h-3 mr-1" />
                                {endpoint.uiElement}
                              </Badge>
                            )}
                          </div>
                          
                          <code className="text-xs break-all block bg-muted px-2 py-1 rounded">
                            {endpoint.url}
                          </code>

                          {endpoint.buttonText && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Button:</span>
                              <Badge variant="outline" className="text-xs">
                                "{endpoint.buttonText}"
                              </Badge>
                            </div>
                          )}

                          {endpoint.eventType && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Event:</span>
                              <Badge variant="secondary" className="text-xs">
                                {endpoint.eventType}
                              </Badge>
                            </div>
                          )}
                          
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
                            📁 {endpoint.context}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="ui" className="flex-1 mt-4">
              <ScrollArea className="h-[500px] pr-4">
                {data.uiComponents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No UI components detected
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.uiComponents.map((component, index) => (
                      <Card key={index} className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 flex-wrap">
                            <Badge variant="default" className="shrink-0">
                              {component.type === 'buttons' ? '🔘 Button' : 
                               component.type === 'textFields' ? '📝 Input' : 
                               component.type === 'images' ? '🖼️ Image' : component.type}
                            </Badge>
                            {component.listeners.map((listener, i) => (
                              <Badge key={i} variant="secondary" className="shrink-0">
                                {listener}
                              </Badge>
                            ))}
                          </div>

                          {component.id && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">ID:</span>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                                {component.id}
                              </code>
                            </div>
                          )}

                          {component.text && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Text:</span>
                              <Badge variant="outline" className="text-xs">
                                "{component.text}"
                              </Badge>
                            </div>
                          )}

                          {component.action && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Action:</span>
                              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                                {component.action}
                              </code>
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground truncate">
                            📁 {component.file}
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
                  <h4 className="text-sm font-medium mb-2">Database Operations:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• INSERT: Create/Add new records</li>
                    <li>• UPDATE: Modify existing records</li>
                    <li>• DELETE: Remove records</li>
                    <li>• READ: Fetch/Query data</li>
                    <li>• UPSERT: Insert or Update</li>
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
                        <Code className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Total APIs</span>
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
                        <MousePointer className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Buttons</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.buttons}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Type className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Text Fields</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.textFields}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Auth APIs</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.authEndpoints}
                      </Badge>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Click Handlers</span>
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.summary.clickHandlers}
                      </Badge>
                    </div>
                  </Card>
                </div>

                <Card className="p-4 bg-blue-50 dark:bg-blue-950">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security Analysis
                  </h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>• {data.summary.adminEndpoints} admin/management endpoints</p>
                    <p>• {data.summary.uploadEndpoints} file upload endpoints</p>
                    <p>• {data.summary.authEndpoints} authentication endpoints</p>
                  </div>
                </Card>

                <Card className="p-4 bg-green-50 dark:bg-green-950">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    UI Component Analysis
                  </h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>• {data.summary.buttons} interactive buttons found</p>
                    <p>• {data.summary.textFields} input fields detected</p>
                    <p>• {data.summary.clickHandlers} click event handlers</p>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
