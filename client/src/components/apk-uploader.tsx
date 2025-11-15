
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { CloudUpload, Link as LinkIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

interface ApkUploaderProps {
  onUploadComplete: () => void;
}

export function ApkUploader({ onUploadComplete }: ApkUploaderProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [apkUrl, setApkUrl] = useState("");

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

  const downloadFromUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest("POST", "/api/apk-files/download-from-url", { url });
    },
    onSuccess: () => {
      toast({
        title: "APK downloaded successfully",
        description: "Your file is ready to scan",
      });
      setUploadProgress(0);
      setApkUrl("");
      onUploadComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
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
    
    // Reset input
    e.target.value = '';
  };

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

  const handleDownloadFromUrl = () => {
    if (!apkUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter an APK URL",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(50);
    downloadFromUrlMutation.mutate(apkUrl);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.android.package-archive": [".apk"],
    },
    maxFiles: 1,
    multiple: false,
    noClick: true,
    noKeyboard: false,
  });

  const isProcessing = uploadMutation.isPending || downloadFromUrlMutation.isPending;

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          min-h-48 p-8 border-2 border-dashed rounded-lg
          flex flex-col items-center justify-center gap-4
          transition-all duration-200
          ${isDragActive ? "border-primary bg-primary/10 scale-105" : "border-border"}
          ${isProcessing ? "opacity-50" : ""}
        `}
        data-testid="dropzone-apk-upload"
      >
        <input {...getInputProps()} />
        
        <CloudUpload className={`w-12 h-12 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
        
        <div className="text-center space-y-3">
          <p className="text-base font-semibold" data-testid="text-upload-primary">
            {isDragActive ? "Drop APK file here" : "Select APK file"}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="text-upload-secondary">
            Or drag and drop • Up to 200MB
          </p>
          
          <label htmlFor="apk-file-input" className="block">
            <Button 
              type="button" 
              size="lg"
              disabled={isProcessing}
              className="cursor-pointer"
              asChild
            >
              <span>
                Choose File
              </span>
            </Button>
            <input
              id="apk-file-input"
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or download from URL
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://example.com/app.apk"
          value={apkUrl}
          onChange={(e) => setApkUrl(e.target.value)}
          disabled={isProcessing}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleDownloadFromUrl();
            }
          }}
        />
        <Button
          onClick={handleDownloadFromUrl}
          disabled={isProcessing}
          size="default"
        >
          <LinkIcon className="mr-2 h-4 w-4" />
          Download
        </Button>
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
