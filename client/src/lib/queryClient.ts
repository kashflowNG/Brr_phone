import { QueryClient } from "@tanstack/react-query";

async function handleRequest(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const message = await response.text();
    throw new Error(message || `${response.status}: ${response.statusText}`);
  }

  return response;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: any,
): Promise<any> {
  const isFormData = data instanceof FormData;

  const options: RequestInit = {
    method,
    headers: isFormData ? {} : {
      "Content-Type": "application/json",
    },
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
  };

  const response = await handleRequest(url, options);

  // Save APK files to localStorage for persistence
  if (method === "POST" && url.includes("/api/apk-files")) {
    const result = await response.clone().json();
    const stored = localStorage.getItem("apk_files");
    const files = stored ? JSON.parse(stored) : [];
    files.push(result);
    localStorage.setItem("apk_files", JSON.stringify(files));
    return result;
  }

  if (method === "DELETE" && url.includes("/api/apk-files")) {
    const id = url.split("/").pop();
    const stored = localStorage.getItem("apk_files");
    if (stored) {
      const files = JSON.parse(stored);
      const filtered = files.filter((f: any) => f.id !== id);
      localStorage.setItem("apk_files", JSON.stringify(filtered));
    }
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const url = queryKey[0] as string;

        // Return from localStorage for APK file list
        if (url === "/api/apk-files") {
          const stored = localStorage.getItem("apk_files");
          if (stored) {
            const files = JSON.parse(stored);
            // Convert string dates back to Date objects
            return files.map((f: any) => ({
              ...f,
              uploadedAt: new Date(f.uploadedAt)
            }));
          }
        }

        const response = await handleRequest(url);

        if (response.headers.get("content-type")?.includes("application/json")) {
          return response.json();
        }

        return response.text();
      },
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});