import { Smartphone, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@shared/schema";

interface HeaderProps {
  sessionStatus: SessionStatus;
}

export function Header({ sessionStatus }: HeaderProps) {
  const getStatusVariant = (status: SessionStatus) => {
    switch (status) {
      case "running":
        return "default";
      case "initializing":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusText = (status: SessionStatus) => {
    switch (status) {
      case "running":
        return "Running";
      case "initializing":
        return "Initializing";
      case "error":
        return "Error";
      case "stopped":
        return "Stopped";
      default:
        return "Idle";
    }
  };

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6" data-testid="header-main">
      <div className="flex items-center gap-3">
        <Smartphone className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-medium" data-testid="text-app-title">
          Android Emulator
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {sessionStatus !== "idle" && (
          <Badge 
            variant={getStatusVariant(sessionStatus)} 
            className="text-sm"
            data-testid={`badge-status-${sessionStatus}`}
          >
            {getStatusText(sessionStatus)}
          </Badge>
        )}
        <Button 
          size="icon" 
          variant="ghost"
          data-testid="button-settings"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
