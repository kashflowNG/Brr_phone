import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, 
  RotateCw, 
  Maximize, 
  X, 
  Smartphone,
  Loader2,
  AlertCircle
} from "lucide-react";
import type { EmulatorSession } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface EmulatorViewerProps {
  session: EmulatorSession | null | undefined;
  selectedApk: string | null;
  selectedDevice: string | null;
  onSessionStart: (session: EmulatorSession) => void;
  onSessionEnd: () => void;
}

export function EmulatorViewer({
  session,
  selectedApk,
  selectedDevice,
  onSessionStart,
  onSessionEnd,
}: EmulatorViewerProps) {
  const { toast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApk || !selectedDevice) {
        throw new Error("Please select both an APK file and a device");
      }
      
      return apiRequest<EmulatorSession>("POST", "/api/session/start", {
        apkFileId: selectedApk,
        deviceId: selectedDevice,
      });
    },
    onSuccess: (data) => {
      onSessionStart(data);
      toast({
        title: "Session started",
        description: "Your APK is now running in the emulator",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stopSessionMutation = useMutation({
    mutationFn: async () => {
      if (!session) return;
      return apiRequest("POST", `/api/session/${session.id}/stop`, {});
    },
    onSuccess: () => {
      onSessionEnd();
      toast({
        title: "Session stopped",
        description: "The emulator session has been terminated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop session",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Empty state - no session
  if (!session || session.status === "idle") {
    return (
      <Card className="h-full flex flex-col items-center justify-center p-8 gap-6" data-testid="card-emulator-empty">
        <Smartphone className="w-24 h-24 text-muted-foreground opacity-50" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium" data-testid="text-empty-title">
            No Active Session
          </h3>
          <p className="text-sm text-muted-foreground max-w-md" data-testid="text-empty-description">
            Select an APK file and device from the sidebar, then click "Run APK" to start an emulator session
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => startSessionMutation.mutate()}
          disabled={!selectedApk || !selectedDevice || startSessionMutation.isPending}
          data-testid="button-start-session"
        >
          {startSessionMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run APK
            </>
          )}
        </Button>
      </Card>
    );
  }

  // Initializing state
  if (session.status === "initializing") {
    return (
      <Card className="h-full flex flex-col items-center justify-center p-8 gap-6" data-testid="card-emulator-loading">
        <Loader2 className="w-24 h-24 text-primary animate-spin" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium" data-testid="text-loading-title">
            Initializing Emulator
          </h3>
          <p className="text-sm text-muted-foreground" data-testid="text-loading-description">
            Please wait while we prepare your Android device...
          </p>
        </div>
      </Card>
    );
  }

  // Error state
  if (session.status === "error") {
    return (
      <Card className="h-full flex flex-col items-center justify-center p-8 gap-6" data-testid="card-emulator-error">
        <AlertCircle className="w-24 h-24 text-destructive" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium" data-testid="text-error-title">
            Session Error
          </h3>
          <p className="text-sm text-muted-foreground" data-testid="text-error-description">
            Something went wrong with the emulator session
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => stopSessionMutation.mutate()}
          disabled={stopSessionMutation.isPending}
          data-testid="button-close-error-session"
        >
          <X className="w-4 h-4 mr-2" />
          Close Session
        </Button>
      </Card>
    );
  }

  // Running state - show emulator
  return (
    <div className={`flex flex-col gap-4 ${isFullscreen ? "fixed inset-0 z-50 bg-background p-4" : "h-full"}`}>
      <Card className="flex-1 flex flex-col overflow-hidden" data-testid="card-emulator-active">
        {/* Device Frame with Emulator */}
        <div className="flex-1 flex items-center justify-center p-6 bg-muted/20">
          <div className="relative max-w-full max-h-full aspect-[9/16] bg-black rounded-3xl shadow-2xl overflow-hidden border-8 border-gray-800">
            {session.sessionUrl ? (
              <iframe
                src={session.sessionUrl}
                className="w-full h-full"
                title="Android Emulator"
                allow="camera; microphone; geolocation"
                data-testid="iframe-emulator"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white">
                <Loader2 className="w-12 h-12 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Control Bar */}
        <div className="border-t p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={handleFullscreen}
                data-testid="button-fullscreen"
              >
                <Maximize className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                data-testid="button-rotate"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant="destructive"
              onClick={() => stopSessionMutation.mutate()}
              disabled={stopSessionMutation.isPending}
              data-testid="button-stop-session"
            >
              {stopSessionMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Stop Session
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
