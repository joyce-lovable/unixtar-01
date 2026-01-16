import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { loadPdfjs } from '@/lib/pdfjs';

export interface MakeWebhookFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'converting' | 'sending' | 'completed' | 'error';
  pages?: MakeWebhookPage[];
  error?: string;
  convertedImageUrl?: string; // base64 data URL for download (after rotation)
  rotationApplied?: number; // 記錄旋轉角度
  rotationConfidence?: 'high' | 'medium' | 'low' | 'skipped'; // 信心度
  rawOrientationResponse?: string; // AI 原始回應（除錯用）
}

export interface MakeWebhookPage {
  id: string;
  pageNumber: number;
  status: 'pending' | 'sending' | 'completed' | 'error';
  base64?: string;
  result?: any;
  error?: string;
}

const MAKE_WEBHOOK_URL = 'https://hook.us1.make.com/87hxhca15k0dawmw9v25ngzq8wr95pu2';

export const useMakeWebhook = () => {
  const [files, setFiles] = useState<MakeWebhookFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(-1);
  const filesRef = useRef<MakeWebhookFile[]>([]);
  
  // 追蹤已同步的檔案名稱（提升到 hook 層級，避免切換模式時狀態遺失）
  const [syncedFileNames, setSyncedFileNames] = useState<Set<string>>(new Set());

  filesRef.current = files;
  
  // 標記檔案為已同步
  const markFilesAsSynced = useCallback((fileNames: string[]) => {
    setSyncedFileNames(prev => {
      const newSet = new Set(prev);
      fileNames.forEach(name => newSet.add(name));
      return newSet;
    });
  }, []);

  const convertFileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result); // Keep full data URL for sending
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 旋轉圖片
  const rotateImage = async (base64: string, degrees: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        if (degrees === 90 || degrees === 270 || degrees === -90) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = base64;
    });
  };

  // 方向偵測（只取角度，不做 OCR）
  // SOP 模式：非正向一律順時針轉 180°
  const detectOrientationInfo = async (
    imageDataUrl: string,
    mimeType: string
  ): Promise<{ rotation: number; confidence: 'high' | 'medium' | 'low' | 'skipped'; rawOrientationResponse?: string }> => {
    try {
      const base64Data = imageDataUrl.includes(',')
        ? imageDataUrl.split(',')[1]
        : imageDataUrl;

      const { data, error } = await supabase.functions.invoke('ai-ocr', {
        body: {
          imageBase64: base64Data,
          mimeType: mimeType || 'image/png',
          detectOrientationOnly: true,
        },
      });

      if (error || data?.error) {
        console.warn('方向偵測失敗，使用預設 0 度:', error || data?.error);
        return { rotation: 0, confidence: 'low' };
      }

      const aiRotation = typeof data?.rotation === 'number'
        ? data.rotation
        : parseInt(String(data?.rotation ?? '0'), 10);
      const validRotation = [0, 90, 180, 270].includes(aiRotation) ? aiRotation : 0;
      const confidence = (data?.confidence as any) || 'low';
      const rawOrientationResponse = data?.rawOrientationResponse;

      // SOP 模式：非正向（aiRotation !== 0）一律順時針轉 180°
      let finalRotation = 0;
      if (validRotation !== 0) {
        finalRotation = 180;
        console.log(`📐 SOP 模式: AI判斷 ${validRotation}° → 固定轉 180°`);
      } else {
        console.log(`📐 SOP 模式: 正向 0°`);
      }

      return { rotation: finalRotation, confidence, rawOrientationResponse };
    } catch (err) {
      console.warn('方向偵測異常，使用預設 0 度:', err);
      return { rotation: 0, confidence: 'low' };
    }
  };

  // 簡化版方向偵測：只做一次，信任 AI 判斷
  const detectBestRotation = async (
    firstImageDataUrl: string,
    mimeType: string
  ): Promise<{ rotation: number; confidence: 'high' | 'medium' | 'low' | 'skipped'; rawOrientationResponse?: string }> => {
    const result = await detectOrientationInfo(firstImageDataUrl, mimeType);
    console.log(`方向偵測結果: rotation=${result.rotation}, confidence=${result.confidence}`);
    return result;
  };

  const convertPdfToImages = async (file: File): Promise<string[]> => {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const dataUrls: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      const baseViewport = page.getViewport({ scale: 1 });
      // 調整為 1600px，與使用者手動轉換的 PNG 尺寸接近
      const targetLongSidePx = 1600;
      const scale = Math.min(
        4,
        Math.max(1.5, targetLongSidePx / Math.max(baseViewport.width, baseViewport.height))
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { 
        alpha: false,
        willReadFrequently: false 
      })!;
      canvas.height = Math.ceil(viewport.height);
      canvas.width = Math.ceil(viewport.width);

      // 關閉圖片平滑，保持文字銳利
      context.imageSmoothingEnabled = false;
      
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport,
        background: 'white',
      }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      dataUrls.push(dataUrl);
    }

    return dataUrls;
  };

  const sendToMakeWebhook = async (
    imageBase64: string, 
    fileName: string, 
    pageNumber: number,
    totalPages: number
  ): Promise<any> => {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName,
        pageNumber,
        totalPages,
        imageBase64,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook 回應錯誤: ${response.status}`);
    }

    // Try to parse JSON response, fallback to text (Make.com 可能回傳非標準 JSON)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return await response.text();
      }
    }

    return await response.text();
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    
    const batchFiles: MakeWebhookFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
    }));

    setFiles(prev => [...prev, ...batchFiles]);
    return batchFiles;
  }, []);

  const processAllFiles = useCallback(async () => {
    const pendingFiles = filesRef.current.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);

    for (let fileIdx = 0; fileIdx < filesRef.current.length; fileIdx++) {
      const file = filesRef.current[fileIdx];
      if (file.status !== 'pending') continue;

      setCurrentFileIndex(fileIdx);

      // Step 1: Convert to images
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'converting' } : f
      ));

      try {
        let imageDataUrls: string[] = [];
        
        if (file.file.type === 'application/pdf') {
          imageDataUrls = await convertPdfToImages(file.file);
        } else {
          const dataUrl = await convertFileToBase64(file.file);
          imageDataUrls = [dataUrl];
        }

        // 方向偵測與自動旋轉（使用第一頁，並做多候選驗證）
        const firstImage = imageDataUrls[0];
        const mimeType = file.file.type === 'application/pdf' ? 'image/png' : file.file.type;
        const { rotation, confidence, rawOrientationResponse } = await detectBestRotation(firstImage, mimeType);

        // 如果需要旋轉，對所有頁面進行旋轉
        let processedImageUrls = imageDataUrls;
        if (rotation !== 0) {
          console.log(`SOP Webhook: 旋轉 ${rotation} 度 (信心: ${confidence})`);
          processedImageUrls = await Promise.all(
            imageDataUrls.map(url => rotateImage(url, rotation))
          );
        } else {
          console.log(`SOP Webhook: 無需旋轉 (信心: ${confidence})`);
        }

        // Initialize pages with rotated images
        const pages: MakeWebhookPage[] = processedImageUrls.map((base64, idx) => ({
          id: `${file.id}-page-${idx}`,
          pageNumber: idx + 1,
          status: 'pending',
          base64,
        }));

        // 保存第一頁「轉正後」圖片供下載
        const firstProcessedImageUrl = processedImageUrls[0];

        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'sending', 
            pages, 
            convertedImageUrl: firstProcessedImageUrl,
            rotationApplied: rotation,
            rotationConfidence: confidence,
            rawOrientationResponse,
          } : f
        ));

        // Step 2: Send each page to webhook
        let hadError = false;

        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
          setCurrentPageIndex(pageIdx);
          const page = pages[pageIdx];

          // Update page status to sending
          setFiles(prev => prev.map(f => {
            if (f.id !== file.id) return f;
            const updatedPages = f.pages?.map(p => 
              p.id === page.id ? { ...p, status: 'sending' as const } : p
            );
            return { ...f, pages: updatedPages };
          }));

          try {
            const result = await sendToMakeWebhook(
              page.base64!,
              file.name,
              page.pageNumber,
              pages.length
            );

            // Update page with result
            setFiles(prev => prev.map(f => {
              if (f.id !== file.id) return f;
              const updatedPages = f.pages?.map(p => 
                p.id === page.id ? { ...p, status: 'completed' as const, result } : p
              );
              return { ...f, pages: updatedPages };
            }));
          } catch (error) {
            hadError = true;

            // Update page with error
            setFiles(prev => prev.map(f => {
              if (f.id !== file.id) return f;
              const updatedPages = f.pages?.map(p => 
                p.id === page.id ? { 
                  ...p, 
                  status: 'error' as const, 
                  error: error instanceof Error ? error.message : '發送失敗' 
                } : p
              );
              return { ...f, pages: updatedPages };
            }));
          }
        }

        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: hadError ? 'error' : 'completed',
            error: hadError ? '部分頁面發送失敗' : undefined
          } : f
        ));

      } catch (error) {
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'error', 
            error: error instanceof Error ? error.message : '轉換失敗' 
          } : f
        ));
      }
    }

    setIsProcessing(false);
    setCurrentFileIndex(-1);
    setCurrentPageIndex(-1);
  }, []);

  const retryFile = useCallback(async (id: string) => {
    // Reset file status to pending and reprocess
    setFiles(prev => prev.map(f => 
      f.id === id ? { 
        ...f, 
        status: 'pending', 
        pages: undefined, 
        error: undefined,
        convertedImageUrl: undefined,
        rotationApplied: undefined,
      } : f
    ));
    
    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setIsProcessing(true);
    
    const file = filesRef.current.find(f => f.id === id);
    if (!file) {
      setIsProcessing(false);
      return;
    }

    // Reprocess this single file
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, status: 'converting' } : f
    ));

    try {
      let imageDataUrls: string[] = [];
      
      if (file.file.type === 'application/pdf') {
        imageDataUrls = await convertPdfToImages(file.file);
      } else {
        const dataUrl = await convertFileToBase64(file.file);
        imageDataUrls = [dataUrl];
      }

      // 方向偵測與自動旋轉（重試時也要執行，並做多候選驗證）
      const firstImage = imageDataUrls[0];
      const mimeType = file.file.type === 'application/pdf' ? 'image/png' : file.file.type;
      const { rotation, confidence, rawOrientationResponse } = await detectBestRotation(firstImage, mimeType);
      
      let processedImageUrls = imageDataUrls;
      if (rotation !== 0) {
        console.log(`SOP Webhook 重試: 旋轉 ${rotation} 度 (信心: ${confidence})`);
        processedImageUrls = await Promise.all(
          imageDataUrls.map(url => rotateImage(url, rotation))
        );
      } else {
        console.log(`SOP Webhook 重試: 無需旋轉 (信心: ${confidence})`);
      }

      const pages: MakeWebhookPage[] = processedImageUrls.map((base64, idx) => ({
        id: `${file.id}-page-${idx}`,
        pageNumber: idx + 1,
        status: 'pending',
        base64,
      }));

      setFiles(prev => prev.map(f => 
        f.id === id ? { 
          ...f, 
          status: 'sending', 
          pages, 
          convertedImageUrl: processedImageUrls[0],
          rotationApplied: rotation,
          rotationConfidence: confidence,
          rawOrientationResponse,
        } : f
      ));

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];

        setFiles(prev => prev.map(f => {
          if (f.id !== id) return f;
          const updatedPages = f.pages?.map(p => 
            p.id === page.id ? { ...p, status: 'sending' as const } : p
          );
          return { ...f, pages: updatedPages };
        }));

        try {
          const result = await sendToMakeWebhook(
            page.base64!,
            file.name,
            page.pageNumber,
            pages.length
          );

          setFiles(prev => prev.map(f => {
            if (f.id !== id) return f;
            const updatedPages = f.pages?.map(p => 
              p.id === page.id ? { ...p, status: 'completed' as const, result } : p
            );
            return { ...f, pages: updatedPages };
          }));
        } catch (error) {
          setFiles(prev => prev.map(f => {
            if (f.id !== id) return f;
            const updatedPages = f.pages?.map(p => 
              p.id === page.id ? { 
                ...p, 
                status: 'error' as const, 
                error: error instanceof Error ? error.message : '發送失敗' 
              } : p
            );
            return { ...f, pages: updatedPages };
          }));
        }
      }

      const currentFile = filesRef.current.find(f => f.id === id);
      const hasErrors = currentFile?.pages?.some(p => p.status === 'error');

      setFiles(prev => prev.map(f => 
        f.id === id ? { 
          ...f, 
          status: hasErrors ? 'error' : 'completed',
          error: hasErrors ? '部分頁面發送失敗' : undefined
        } : f
      ));

    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : '轉換失敗' 
        } : f
      ));
    }

    setIsProcessing(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setCurrentFileIndex(-1);
    setCurrentPageIndex(-1);
    setSyncedFileNames(new Set()); // 清空時也重置已同步清單
  }, []);

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const totalPages = files.reduce((acc, f) => acc + (f.pages?.length || 0), 0);
  const completedPages = files.reduce((acc, f) => 
    acc + (f.pages?.filter(p => p.status === 'completed').length || 0), 0
  );

  return {
    files,
    addFiles,
    processAllFiles,
    retryFile,
    removeFile,
    clearAll,
    isProcessing,
    currentFileIndex,
    currentPageIndex,
    currentProcessingIndex: currentFileIndex, // Alias for compatibility
    completedCount,
    errorCount,
    totalFiles: files.length,
    totalPages,
    completedPages,
    // 同步狀態追蹤（提升到 hook 層級）
    syncedFileNames,
    markFilesAsSynced,
  };
};
