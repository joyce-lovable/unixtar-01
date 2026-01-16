import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SopParsedStep {
  seq: string;
  code: string;
  stepCode: string;
  stepName: string;
}

export interface SopOCRFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: {
    text: string;
    rawPhase1: string;
    parsedSteps: SopParsedStep[];
    confidence: number;
    rotationApplied?: number;
    processedImageBase64?: string; // 處理後的圖片
  };
  error?: string;
  retryCount?: number;
}

export const useSopOCR = () => {
  const [files, setFiles] = useState<SopOCRFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const filesRef = useRef<SopOCRFile[]>([]);

  filesRef.current = files;

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

  const convertPdfToImages = async (file: File): Promise<string[]> => {
    const { pdfjs } = await import('react-pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const base64List: string[] = [];

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
      base64List.push(dataUrl.split(',')[1]);
    }

    return base64List;
  };

  // 偵測圖片方向並旋轉
  const detectAndRotateImage = async (imageBase64: string, mimeType: string): Promise<{ base64: string; rotation: number }> => {
    // 使用 ai-ocr 偵測方向
    const { data, error } = await supabase.functions.invoke('ai-ocr', {
      body: {
        imageBase64,
        mimeType,
        documentType: 'sop', // SOP 流程圖：方向錯誤通常需旋轉 180°
      },
    });

    if (error) {
      console.warn('方向偵測失敗，使用原圖:', error.message);
      return { base64: imageBase64, rotation: 0 };
    }

    // 如果需要旋轉
    if (data.needsRotation && data.rotation !== 0) {
      console.log(`📐 SOP 圖片需要旋轉 ${data.rotation}°`);
      const rotatedBase64 = await rotateImage(imageBase64, data.rotation);
      return { base64: rotatedBase64, rotation: data.rotation };
    }

    return { base64: imageBase64, rotation: 0 };
  };

  const processFile = async (file: File): Promise<{
    text: string;
    rawPhase1: string;
    parsedSteps: SopParsedStep[];
    confidence: number;
    rotationApplied?: number;
    processedImageBase64?: string;
  }> => {
    let base64List: string[] = [];
    let mimeType = file.type;

    // PDF 需要先轉成 PNG
    if (file.type === 'application/pdf') {
      base64List = await convertPdfToImages(file);
      mimeType = 'image/png';
    } else {
      const base64 = await convertFileToBase64(file);
      base64List = [base64];
      mimeType = file.type || 'image/png';
    }

    // SOP 通常只處理第一頁（工作流程圖）
    let imageBase64 = base64List[0];
    
    // 偵測方向並旋轉
    const { base64: rotatedBase64, rotation } = await detectAndRotateImage(imageBase64, mimeType);
    
    // 旋轉後進行對比度強化
    imageBase64 = await enhanceImageContrast(rotatedBase64, 1.15);
    console.log(`🔆 SOP 圖片已完成對比度強化 (1.15x)`);

    const { data, error } = await supabase.functions.invoke('sop-ocr', {
      body: {
        imageBase64,
        mimeType: 'image/png', // 旋轉後一律是 PNG
      },
    });

    if (error) throw new Error(error.message);
    if (data.error) throw new Error(data.error);

    return {
      text: data.text || '',
      rawPhase1: data.rawPhase1 || '',
      parsedSteps: data.parsedSteps || [],
      confidence: data.confidence || 95,
      rotationApplied: rotation,
      processedImageBase64: imageBase64,
    };
  };

  const processSingleFile = async (fileId: string): Promise<boolean> => {
    const file = filesRef.current.find(f => f.id === fileId);
    if (!file) return false;

    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'processing', error: undefined } : f
    ));

    try {
      const result = await processFile(file.file);
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'completed', result } : f
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
    
    const batchFiles: SopOCRFile[] = validFiles.map(file => ({
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

    for (let i = 0; i < filesRef.current.length; i++) {
      const file = filesRef.current[i];
      if (file.status !== 'pending') continue;

      setCurrentProcessingIndex(i);
      await processSingleFile(file.id);
    }

    for (let round = 0; round < autoRetryCount; round++) {
      const failedFiles = filesRef.current.filter(f => f.status === 'error');
      if (failedFiles.length === 0) break;

      await new Promise(resolve => setTimeout(resolve, 2000));

      for (const file of failedFiles) {
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
  };
};