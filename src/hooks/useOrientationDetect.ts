import { useState, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";

export type OrientationDocumentType = 'mold' | 'sop';

export interface OrientationFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  rotation?: number;
  originalRotation?: number; // AI 原始判斷的角度
  confidence?: 'high' | 'medium' | 'low' | 'skipped';
  rawResponse?: string;
  error?: string;
  previewUrl?: string; // 原圖預覽
}

export const useOrientationDetect = () => {
  const [files, setFiles] = useState<OrientationFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentType, setDocumentType] = useState<OrientationDocumentType>('mold');

  const convertFileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const convertPdfToImage = async (file: File): Promise<string> => {
    const { pdfjs } = await import('react-pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    // 只取第一頁
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetLongSidePx = 1600;
    const scale = Math.min(
      4,
      Math.max(1.5, targetLongSidePx / Math.max(baseViewport.width, baseViewport.height))
    );
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false })!;
    canvas.height = Math.ceil(viewport.height);
    canvas.width = Math.ceil(viewport.width);

    context.imageSmoothingEnabled = false;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
      background: 'white',
    }).promise;

    return canvas.toDataURL('image/png');
  };

  const detectOrientation = async (
    imageDataUrl: string,
    mimeType: string
  ): Promise<{ rotation: number; confidence: string; rawResponse?: string }> => {
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
      throw new Error(error?.message || data?.error || '偵測失敗');
    }

    const rawRotation = typeof data?.rotation === 'number'
      ? data.rotation
      : parseInt(String(data?.rotation ?? '0'), 10);
    const rotation = [0, 90, 180, 270].includes(rawRotation) ? rawRotation : 0;
    const confidence = data?.confidence || 'low';
    const rawResponse = data?.rawOrientationResponse;

    return { rotation, confidence, rawResponse };
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    
    const batchFiles: OrientationFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending',
    }));

    setFiles(prev => [...prev, ...batchFiles]);
    return batchFiles;
  }, []);

  // 根據文件類型和 AI 判斷，計算最終旋轉角度
  const calculateFinalRotation = useCallback((aiRotation: number, docType: OrientationDocumentType): number => {
    // 如果 AI 判斷為正向 (0°)，直接回傳 0
    if (aiRotation === 0) return 0;
    
    // 非正向時，根據文件類型決定固定旋轉角度
    if (docType === 'mold') {
      // 工程圖：非正向一律順時針轉 270°
      return 270;
    } else {
      // SOP：非正向一律順時針轉 180°
      return 180;
    }
  }, []);

  const processAllFiles = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);

    for (const file of pendingFiles) {
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'processing' } : f
      ));

      try {
        let imageDataUrl: string;
        let mimeType: string;
        
        if (file.file.type === 'application/pdf') {
          imageDataUrl = await convertPdfToImage(file.file);
          mimeType = 'image/png';
        } else {
          imageDataUrl = await convertFileToBase64(file.file);
          mimeType = file.file.type;
        }

        const result = await detectOrientation(imageDataUrl, mimeType);
        
        // AI 原始判斷
        const originalRotation = result.rotation;
        // 根據文件類型計算最終旋轉角度
        const finalRotation = calculateFinalRotation(originalRotation, documentType);

        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'completed',
            rotation: finalRotation,
            originalRotation: originalRotation,
            confidence: result.confidence as any,
            rawResponse: result.rawResponse,
            previewUrl: imageDataUrl,
          } : f
        ));
      } catch (error) {
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'error',
            error: error instanceof Error ? error.message : '偵測失敗',
          } : f
        ));
      }
    }

    setIsProcessing(false);
  }, [files, documentType, calculateFinalRotation]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
  }, []);

  const retryFile = useCallback(async (id: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, status: 'pending', error: undefined } : f
    ));
    await new Promise(resolve => setTimeout(resolve, 100));
    await processAllFiles();
  }, [processAllFiles]);

  return {
    files,
    addFiles,
    processAllFiles,
    removeFile,
    clearAll,
    retryFile,
    isProcessing,
    completedCount: files.filter(f => f.status === 'completed').length,
    documentType,
    setDocumentType,
  };
};
