import { useState, useCallback } from 'react';
import { parseFileContent } from '@/lib/dailyCheckParser';

export interface DailyCheckFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: {
    text: string;
    confidence?: number;
    parsedData?: string[][];
  };
  error?: string;
}

export const useDailyCheck = () => {
  const [files, setFiles] = useState<DailyCheckFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);

  const addFiles = useCallback((newFiles: File[]) => {
    const fileItems: DailyCheckFile[] = newFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...fileItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
  }, []);

  const processFile = async (file: DailyCheckFile): Promise<{ text: string; parsedData: string[][] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const parsedData = parseFileContent(text);
          resolve({ text, parsedData });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('檔案讀取失敗'));
      reader.readAsText(file.file);
    });
  };

  const processAllFiles = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.status !== 'pending' && file.status !== 'error') continue;

      setCurrentProcessingIndex(i);
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: 'processing' as const } : f))
      );

      try {
        const { text, parsedData } = await processFile(file);
        
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: 'completed' as const,
                  result: { text, parsedData, confidence: 100 },
                }
              : f
          )
        );
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: 'error' as const,
                  error: error instanceof Error ? error.message : '處理失敗',
                }
              : f
          )
        );
      }
    }

    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
  }, [files]);

  const retryFile = useCallback(async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file || file.status !== 'error') return;

    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'pending' as const, error: undefined } : f))
    );
  }, [files]);

  const completedCount = files.filter((f) => f.status === 'completed').length;

  return {
    files,
    addFiles,
    removeFile,
    clearAll,
    processAllFiles,
    retryFile,
    isProcessing,
    currentProcessingIndex,
    completedCount,
  };
};
