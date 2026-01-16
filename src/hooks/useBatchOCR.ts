import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadPdfjs } from '@/lib/pdfjs';

export interface OCRTiming {
  orientationDuration?: number;
  ocrDuration: number;
  totalDuration: number;
  attemptCount: number;
  rotationApplied?: number;
}

export interface OCRResultData {
  text: string;
  confidence: number;
  timing?: OCRTiming;
}

export interface BatchOCRFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: OCRResultData;
  error?: string;
  retryCount?: number;
  convertedImageUrl?: string; // base64 data URL for download
}

export interface BatchOCRResult {
  files: BatchOCRFile[];
  totalCompleted: number;
  totalFiles: number;
}

export const useBatchOCR = () => {
  const [files, setFiles] = useState<BatchOCRFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const filesRef = useRef<BatchOCRFile[]>([]);
  
  // 追蹤已同步的檔案名稱（提升到 hook 層級，避免切換模式時狀態遺失）
  const [syncedFileNames, setSyncedFileNames] = useState<Set<string>>(new Set());

  // Keep ref in sync with state
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
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 對比度增強函數（對 base64 圖片進行處理）
  const enhanceImageContrast = async (base64: string, contrast: number = 1.15): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 先填白底
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // 對比度增強
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
        
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
        
        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]);
      };
      img.src = `data:image/png;base64,${base64}`;
    });
  };

  // 旋轉圖片
  const rotateImage = async (base64: string, degrees: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        if (degrees === 90 || degrees === 270) {
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
        
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]);
      };
      img.src = `data:image/png;base64,${base64}`;
    });
  };

  const convertPdfToImages = async (file: File): Promise<{ base64List: string[], dataUrls: string[] }> => {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const base64List: string[] = [];
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
      
      // 填白底
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport,
        background: 'white',
      }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      base64List.push(dataUrl.split(',')[1]);
      dataUrls.push(dataUrl);
      
      console.log(`📐 PDF 頁 ${i} 轉換尺寸: ${canvas.width}x${canvas.height}px`);
    }

    return { base64List, dataUrls };
  };

  const processFile = async (file: File): Promise<{ result: OCRResultData; convertedImageUrl?: string }> => {
    let base64List: string[] = [];
    let mimeType = file.type;
    const frontendStartTime = Date.now();
    let finalProcessedImageUrl: string | undefined; // 保存最終處理後的圖片

    if (file.type === 'application/pdf') {
      const pdfConvertStart = Date.now();
      const { base64List: list } = await convertPdfToImages(file);
      base64List = list;
      console.log(`⏱️ PDF 轉換耗時: ${Date.now() - pdfConvertStart}ms`);
    } else {
      const base64 = await convertFileToBase64(file);
      base64List = [base64];
      mimeType = file.type || 'image/png';
    }

    const allTexts: string[] = [];
    let totalOcrDuration = 0;
    let totalOrientationDuration = 0;
    let totalAttemptCount = 0;
    let rotationsApplied: number[] = [];

    // 對第一頁做方向偵測，決定旋轉角度
    // 工程圖模式：非正向一律順時針轉 270°
    let rotationToApply = 0;
    
    if (base64List.length > 0) {
      const { data: orientationData, error: orientationError } = await supabase.functions.invoke('ai-ocr', {
        body: {
          imageBase64: base64List[0],
          mimeType: file.type === 'application/pdf' ? 'image/png' : mimeType,
          detectOrientationOnly: true,
        },
      });

      if (!orientationError && !orientationData?.error) {
        const aiRotation = orientationData?.rotation || 0;
        totalOrientationDuration = orientationData?.timing?.orientationDuration || 0;
        
        // 工程圖模式：非正向（aiRotation !== 0）一律順時針轉 270°
        if (aiRotation !== 0) {
          rotationToApply = 270;
          console.log(`📐 方向偵測結果: AI判斷 ${aiRotation}° → 工程圖模式固定轉 270° (信心: ${orientationData?.confidence})`);
        } else {
          rotationToApply = 0;
          console.log(`📐 方向偵測結果: 正向 0° (信心: ${orientationData?.confidence})`);
        }
      }
    }

    for (let i = 0; i < base64List.length; i++) {
      let finalBase64 = base64List[i];
      
      // 如果需要旋轉
      if (rotationToApply !== 0) {
        console.log(`📐 頁面 ${i + 1} 旋轉 ${rotationToApply}°`);
        finalBase64 = await rotateImage(finalBase64, rotationToApply);
      }
      
      // 對比度強化
      finalBase64 = await enhanceImageContrast(finalBase64, 1.15);
      console.log(`🔆 頁面 ${i + 1} 已完成對比度強化 (1.15x)`);
      
      // 保存第一頁處理後的圖片
      if (i === 0) {
        finalProcessedImageUrl = `data:image/png;base64,${finalBase64}`;
      }
      
      // 發送 OCR 請求（跳過方向偵測）
      const { data, error } = await supabase.functions.invoke('ai-ocr', {
        body: {
          imageBase64: finalBase64,
          mimeType: 'image/png',
          skipOrientationDetection: true,
        },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      if (data.isEmpty) throw new Error('無法辨識圖片中的文字，請確認圖片清晰度或嘗試重新上傳');
      
      allTexts.push(data.text);
      
      if (data.timing) {
        totalOcrDuration += data.timing.ocrDuration || 0;
        totalAttemptCount += data.timing.attemptCount || 1;
      }
      
      rotationsApplied.push(rotationToApply);
    }

    const finalText = base64List.length === 1 
      ? allTexts[0] 
      : allTexts.map((text, idx) => `=== 第 ${idx + 1} 頁 ===\n\n${text}`).join('\n\n');

    const frontendDuration = Date.now() - frontendStartTime;
    console.log(`⏱️ 前端總耗時: ${frontendDuration}ms`);
    console.log(`📐 旋轉記錄: ${rotationsApplied.map((r, i) => `頁${i+1}:${r}°`).join(', ')}`);

    return { 
      result: {
        text: finalText, 
        confidence: 95,
        timing: {
          orientationDuration: totalOrientationDuration,
          ocrDuration: totalOcrDuration,
          totalDuration: frontendDuration,
          attemptCount: totalAttemptCount,
          rotationApplied: rotationsApplied.length > 0 
            ? rotationsApplied.reduce((a, b) => a + b, 0) / rotationsApplied.length 
            : 0,
        }
      },
      convertedImageUrl: finalProcessedImageUrl,
    };
  };

  const processSingleFile = async (fileId: string): Promise<boolean> => {
    const file = filesRef.current.find(f => f.id === fileId);
    if (!file) return false;

    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'processing', error: undefined } : f
    ));

    try {
      const { result, convertedImageUrl } = await processFile(file.file);
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'completed', result, convertedImageUrl } : f
      ));
      return true;
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : '處理失敗',
          retryCount: (f.retryCount || 0) + 1,
        } : f
      ));
      return false;
    }
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    
    const batchFiles: BatchOCRFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
      retryCount: 0,
    }));

    setFiles(prev => [...prev, ...batchFiles]);
    return batchFiles;
  }, []);

  const processAllFiles = useCallback(async (autoRetryCount: number = 1) => {
    const pendingFiles = filesRef.current.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);

    // First pass: process all pending files
    for (let i = 0; i < filesRef.current.length; i++) {
      const file = filesRef.current[i];
      if (file.status !== 'pending') continue;

      setCurrentProcessingIndex(i);
      await processSingleFile(file.id);
    }

    // Auto retry logic
    for (let round = 0; round < autoRetryCount; round++) {
      // Get current failed files
      const failedFiles = filesRef.current.filter(f => f.status === 'error');
      if (failedFiles.length === 0) break;

      // Wait 2 seconds before retry
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retry each failed file
      for (const file of failedFiles) {
        // Re-check status as it might have changed
        const currentFile = filesRef.current.find(f => f.id === file.id);
        if (currentFile?.status !== 'error') continue;
        
        await processSingleFile(file.id);
      }
    }

    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
  }, []);

  const retryFile = useCallback(async (id: string) => {
    setIsProcessing(true);
    await processSingleFile(id);
    setIsProcessing(false);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setCurrentProcessingIndex(-1);
    setSyncedFileNames(new Set()); // 清空時也重置已同步清單
  }, []);

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return {
    files,
    addFiles,
    processAllFiles,
    retryFile,
    removeFile,
    clearAll,
    isProcessing,
    currentProcessingIndex,
    completedCount,
    errorCount,
    totalFiles: files.length,
    // 同步狀態追蹤（提升到 hook 層級）
    syncedFileNames,
    markFilesAsSynced,
  };
};
