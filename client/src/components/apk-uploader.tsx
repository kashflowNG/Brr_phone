import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";

interface ApkUploaderProps {
  onUploadComplete: () => void;
}

export function ApkUploader({ onUploadComplete }: ApkUploaderProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("apk", file);
      
      return apiRequest("POST", "/api/apk-files/upload", formData);
    },
    onSuccess: () => {
      toast({
        title: "APK uploaded successfully",
        description: "Your file is ready to run",
      });
      setUploadProgress(0);
      onUploadComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) return;

    if (!file.name.endsWith(".apk")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an APK file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 200MB",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(50);
    uploadMutation.mutate(file);
  }, [uploadMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.android.package-archive": [".apk"],
    },
    maxFiles: 1,
    multiple: false,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          min-h-48 p-8 border-2 border-dashed rounded-lg
          flex flex-col items-center justify-center gap-4
          cursor-pointer transition-all duration-200
          active:scale-95 touch-manipulation
          hover:shadow-lg hover:scale-[1.02] hover:border-primary
          ${isDragActive ? "border-primary bg-primary/10 scale-105" : "border-border"}
          ${uploadMutation.isPending ? "opacity-50 pointer-events-none" : ""}
        `}
        data-testid="dropzone-apk-upload"
        role="button"
        tabIndex={0}
      >
        <input 
          {...getInputProps()} 
          data-testid="input-apk-file"
          accept=".apk,application/vnd.android.package-archive"
          style={{ 
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            borderWidth: 0
          }}
        />
        
        <CloudUpload className={`w-12 h-12 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
        
        <div className="text-center pointer-events-none">
          <p className="text-base font-semibold mb-1" data-testid="text-upload-primary">
            {isDragActive ? "Drop APK file here" : "Tap to select APK file"}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-upload-secondary">
            Supports .apk files up to 200MB
          </p>
        </div>
      </div>

      {uploadProgress > 0 && (
        <div className="space-y-2">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-sm text-muted-foreground text-center" data-testid="text-upload-progress">
            Uploading...
          </p>
        </div>
      )}
    </div>
  );
}
