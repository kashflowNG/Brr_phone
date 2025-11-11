import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Trash2, FileArchive, Folder } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ApkFile } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FileManagerProps {
  apkFiles: ApkFile[];
  selectedApk: string | null;
  onSelectApk: (apkId: string) => void;
  onDelete: () => void;
  onRun: (apkId: string) => void;
}

export function FileManager({ apkFiles, selectedApk, onSelectApk, onDelete, onRun }: FileManagerProps) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (apkId: string) => {
      return apiRequest("DELETE", `/api/apk-files/${apkId}`, {});
    },
    onSuccess: () => {
      toast({
        title: "APK deleted",
        description: "File has been removed successfully",
      });
      onDelete();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  // Empty state
  if (apkFiles.length === 0) {
    return (
      <Card className="p-8 text-center" data-testid="card-files-empty">
        <Folder className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground" data-testid="text-no-files">
          No APKs uploaded
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload an APK file to get started
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3" data-testid="grid-apk-files">
      {apkFiles.map((apk) => (
        <Card
          key={apk.id}
          className={`
            p-4 cursor-pointer transition-all duration-200
            hover-elevate
            ${selectedApk === apk.id ? "ring-2 ring-primary" : ""}
          `}
          onClick={() => onSelectApk(apk.id)}
          data-testid={`card-apk-${apk.id}`}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileArchive className="w-5 h-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid={`text-apk-name-${apk.id}`}>
                {apk.originalName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground font-mono" data-testid={`text-apk-size-${apk.id}`}>
                  {formatFileSize(apk.size)}
                </p>
                <span className="text-xs text-muted-foreground">•</span>
                <p className="text-xs text-muted-foreground" data-testid={`text-apk-date-${apk.id}`}>
                  {formatDate(apk.uploadedAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun(apk.id);
                }}
                data-testid={`button-run-${apk.id}`}
              >
                <Play className="w-4 h-4" />
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    data-testid={`button-delete-${apk.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete APK File?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{apk.originalName}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(apk.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
