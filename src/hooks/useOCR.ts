import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OCRTiming {
  orientationDuration?: number;
  ocrDuration: number;
  totalDuration: number;
  attemptCount: number;
  rotationApplied?: number;
}

interface OCRResult {
  text: string;
  confidence: number;
  timing?: OCRTiming;
  convertedImages?: string[]; // base64 data URLs for download
}

export const useOCR = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [convertedImages, setConvertedImages] = useState<string[]>([]);
  const convertFileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 content
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 對比度增強函數
  const enhanceContrast = (canvas: HTMLCanvasElement, contrast: number = 1.3) => {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // 旋轉圖片
  const rotateImage = async (base64: string, degrees: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // 90 或 270 度旋轉需要交換寬高
        if (degrees === 90 || degrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        // 填白底
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 移動到中心並旋轉
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
      
      // 記錄完整 dataUrl 供下載
      console.log(`📐 PDF 頁 ${i} 轉換尺寸: ${canvas.width}x${canvas.height}px`);
    }

    return base64List;
  };

  const processWithAI = async (file: File): Promise<OCRResult> => {
    let base64Data: string;
    let mimeType = file.type;
    const frontendStartTime = Date.now();
    const imageDataUrls: string[] = [];

    if (file.type === 'application/pdf') {
      // Convert PDF to images and process each page
      const pdfConvertStart = Date.now();
      const base64List = await convertPdfToImages(file);
      const pdfConvertDuration = Date.now() - pdfConvertStart;
      console.log(`⏱️ PDF 轉換耗時: ${pdfConvertDuration}ms`);
      
      // 保存 dataUrl 供下載
      base64List.forEach(b64 => imageDataUrls.push(`data:image/png;base64,${b64}`));
      
      const allTexts: string[] = [];
      let totalOcrDuration = 0;
      let totalOrientationDuration = 0;
      let totalAttemptCount = 0;
      let rotationsApplied: number[] = [];
      
      for (let i = 0; i < base64List.length; i++) {
        setProgress(Math.round(((i + 1) / base64List.length) * 90));
        
        // 第一次請求：偵測方向
        const { data: orientationData, error: orientationError } = await supabase.functions.invoke('ai-ocr', {
          body: {
            imageBase64: base64List[i],
            mimeType: 'image/png',
            documentType: 'engineering', // 工程圖：方向錯誤通常需旋轉 270°
          },
        });

        if (orientationError) throw new Error(orientationError.message);
        
        let finalBase64 = base64List[i];
        let rotationApplied = 0;
        
        // 如果需要旋轉
        if (orientationData.needsRotation && orientationData.rotation !== 0) {
          console.log(`📐 頁面 ${i + 1} 需要旋轉 ${orientationData.rotation}°`);
          rotationApplied = orientationData.rotation;
          finalBase64 = await rotateImage(base64List[i], orientationData.rotation);
          totalOrientationDuration += orientationData.timing?.orientationDuration || 0;
          
          // 旋轉後重新發送 OCR 請求（跳過方向偵測）
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
        } else if (orientationData.error) {
          throw new Error(orientationData.error);
        } else if (orientationData.isEmpty) {
          throw new Error('無法辨識圖片中的文字，請確認圖片清晰度或嘗試重新上傳');
        } else {
          // 不需要旋轉，直接使用結果
          allTexts.push(orientationData.text);
          
          if (orientationData.timing) {
            totalOrientationDuration += orientationData.timing.orientationDuration || 0;
            totalOcrDuration += orientationData.timing.ocrDuration || 0;
            totalAttemptCount += orientationData.timing.attemptCount || 1;
          }
        }
        
        rotationsApplied.push(rotationApplied);
      }

      const finalText = base64List.length === 1 
        ? allTexts[0] 
        : allTexts.map((text, idx) => `=== 第 ${idx + 1} 頁 ===\n\n${text}`).join('\n\n');

      const frontendDuration = Date.now() - frontendStartTime;
      console.log(`⏱️ 前端總耗時: ${frontendDuration}ms`);
      console.log(`📐 旋轉記錄: ${rotationsApplied.map((r, i) => `頁${i+1}:${r}°`).join(', ')}`);

      return { 
        text: finalText, 
        confidence: 95,
        timing: {
          orientationDuration: totalOrientationDuration,
          ocrDuration: totalOcrDuration,
          totalDuration: frontendDuration,
          attemptCount: totalAttemptCount,
          rotationApplied: rotationsApplied.reduce((a, b) => a + b, 0) / rotationsApplied.length,
        },
        convertedImages: imageDataUrls,
      };
    } else {
      base64Data = await convertFileToBase64(file);
      
      setProgress(30);
      
      // 第一次請求：偵測方向
      const { data: orientationData, error: orientationError } = await supabase.functions.invoke('ai-ocr', {
        body: {
          imageBase64: base64Data,
          mimeType: mimeType,
          documentType: 'engineering', // 工程圖：方向錯誤通常需旋轉 270°
        },
      });

      if (orientationError) throw new Error(orientationError.message);
      
      let rotationApplied = 0;
      let totalOrientationDuration = orientationData.timing?.orientationDuration || 0;
      
      // 如果需要旋轉
      if (orientationData.needsRotation && orientationData.rotation !== 0) {
        console.log(`📐 圖片需要旋轉 ${orientationData.rotation}°`);
        rotationApplied = orientationData.rotation;
        
        setProgress(50);
        const rotatedBase64 = await rotateImage(base64Data, orientationData.rotation);
        
        setProgress(70);
        // 旋轉後重新發送 OCR 請求（跳過方向偵測）
        const { data, error } = await supabase.functions.invoke('ai-ocr', {
          body: {
            imageBase64: rotatedBase64,
            mimeType: 'image/png',
            skipOrientationDetection: true,
          },
        });

        if (error) throw new Error(error.message);
        if (data.error) throw new Error(data.error);
        if (data.isEmpty) throw new Error('無法辨識圖片中的文字，請確認圖片清晰度或嘗試重新上傳');

        const frontendDuration = Date.now() - frontendStartTime;
        console.log(`⏱️ 前端總耗時: ${frontendDuration}ms`);

        return { 
          text: data.text, 
          confidence: data.confidence || 95,
          timing: {
            orientationDuration: totalOrientationDuration,
            ocrDuration: data.timing?.ocrDuration || 0,
            totalDuration: frontendDuration,
            attemptCount: data.timing?.attemptCount || 1,
            rotationApplied,
          }
        };
      } else if (orientationData.error) {
        throw new Error(orientationData.error);
      } else if (orientationData.isEmpty) {
        throw new Error('無法辨識圖片中的文字，請確認圖片清晰度或嘗試重新上傳');
      }

      // 不需要旋轉，直接使用結果
      const frontendDuration = Date.now() - frontendStartTime;
      console.log(`⏱️ 前端總耗時: ${frontendDuration}ms`);

      return { 
        text: orientationData.text, 
        confidence: orientationData.confidence || 95,
        timing: {
          orientationDuration: totalOrientationDuration,
          ocrDuration: orientationData.timing?.ocrDuration || 0,
          totalDuration: frontendDuration,
          attemptCount: orientationData.timing?.attemptCount || 1,
          rotationApplied: 0,
        }
      };
    }
  };

  const processOCR = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setConvertedImages([]);

    try {
      const ocrResult = await processWithAI(file);
      setResult(ocrResult);
      if (ocrResult.convertedImages) {
        setConvertedImages(ocrResult.convertedImages);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setError(err instanceof Error ? err.message : '處理過程中發生錯誤');
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
    setConvertedImages([]);
  }, []);

  return {
    processOCR,
    isProcessing,
    result,
    error,
    progress,
    reset,
    convertedImages,
  };
};
