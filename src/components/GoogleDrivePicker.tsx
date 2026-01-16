import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Cloud, Loader2, FileText, CheckCircle, AlertCircle, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { loadPdfjs } from '@/lib/pdfjs';

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'error';
  result?: {
    text: string;
    confidence: number;
  };
  error?: string;
  retryCount?: number;
}

interface GoogleDrivePickerProps {
  onFilesProcessed: (files: GoogleDriveFile[]) => void;
  mode?: 'ocr' | 'make';
  colorScheme?: 'blue' | 'amber' | 'violet';
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const MAKE_WEBHOOK_URL = 'https://hook.us1.make.com/87hxhca15k0dawmw9v25ngzq8wr95pu2';

export const GoogleDrivePicker = ({ onFilesProcessed, mode = 'ocr', colorScheme = 'blue' }: GoogleDrivePickerProps) => {
  // 色系配置
  const colorClasses = {
    blue: {
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      iconBg: 'bg-blue-600',
      borderHover: 'hover:border-blue-400',
      processing: 'border-blue-500 bg-blue-500/5',
      iconColor: 'text-blue-500',
    },
    amber: {
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      iconBg: 'bg-amber-600',
      borderHover: 'hover:border-amber-400',
      processing: 'border-amber-500 bg-amber-500/5',
      iconColor: 'text-amber-500',
    },
    violet: {
      button: 'bg-violet-600 hover:bg-violet-700 text-white',
      iconBg: 'bg-violet-600',
      borderHover: 'hover:border-violet-400',
      processing: 'border-violet-500 bg-violet-500/5',
      iconColor: 'text-violet-500',
    }
  };
  const colors = colorClasses[colorScheme];
  const [isLoading, setIsLoading] = useState(false);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<GoogleDriveFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<{ apiKey: string; clientId: string } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [autoRetryCount, setAutoRetryCount] = useState<number>(1);
  const autoRetryRoundRef = useRef<number>(0);
  const filesRef = useRef<GoogleDriveFile[]>([]);

  // Keep ref in sync with state
  filesRef.current = selectedFiles;

  // Keep parent in sync (避免 processFiles 結尾拿到舊的 selectedFiles)
  useEffect(() => {
    onFilesProcessed(selectedFiles);
  }, [selectedFiles, onFilesProcessed]);

  // Fetch config from edge function
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-drive-config');
        if (error) throw error;
        if (data?.apiKey && data?.clientId) {
          setConfig(data);
        }
      } catch (err) {
        console.error('Failed to fetch Google Drive config:', err);
      }
    };
    fetchConfig();
  }, []);

  // Load Google API scripts
  useEffect(() => {
    if (!config) return;

    const loadGoogleApi = () => {
      if (window.gapi && window.google) {
        setIsApiLoaded(true);
        return;
      }

      // Load GAPI
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => {
        window.gapi.load('picker', () => {
          setIsApiLoaded(true);
        });
      };
      document.body.appendChild(gapiScript);

      // Load Google Identity Services
      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.async = true;
      gisScript.defer = true;
      document.body.appendChild(gisScript);
    };

    loadGoogleApi();
  }, [config]);

  const handleAuthClick = useCallback(() => {
    if (!config) return;

    // 如果已有 token，直接開啟 picker
    if (accessToken) {
      createPicker(accessToken);
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (response: any) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          createPicker(response.access_token);
        }
      },
    });

    // 使用空字串讓 Google 自動判斷：已授權過就不再跳驗證
    tokenClient.requestAccessToken({ prompt: '' });
  }, [config, accessToken]);

  const createPicker = useCallback((token: string) => {
    if (!config || !window.google) return;

    const view = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setMimeTypes('application/pdf,image/png,image/jpeg,image/jpg')
      .setSelectFolderEnabled(false);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const files: GoogleDriveFile[] = data.docs.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.sizeBytes,
            status: 'pending',
            retryCount: 0,
          }));
          setSelectedFiles(prev => [...prev, ...files]);
        }
      })
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .build();

    picker.setVisible(true);
  }, [config]);

  // 從 Google Drive 下載檔案（Blob）
  const downloadFileAsBlob = async (fileId: string): Promise<Blob> => {
    if (!accessToken) throw new Error('未授權');

    // supportsAllDrives：避免共用雲端硬碟檔案下載失敗
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error('下載失敗');
    return await response.blob();
  };

  const blobToDataUrl = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // PDF Blob 轉換為每頁 PNG（data URL）
  const convertPdfBlobToImages = async (pdfBlob: Blob): Promise<string[]> => {
    const pdfjs = await loadPdfjs();
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    const dataUrls: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      const baseViewport = page.getViewport({ scale: 1 });
      const targetLongSidePx = 3200;
      const scale = Math.min(
        6,
        Math.max(2, targetLongSidePx / Math.max(baseViewport.width, baseViewport.height))
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.height = Math.ceil(viewport.height);
      canvas.width = Math.ceil(viewport.width);

      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      await page.render({ canvasContext: context, viewport }).promise;
      dataUrls.push(canvas.toDataURL('image/png'));
    }

    return dataUrls;
  };

  // 發送到 Make.com Webhook
  const sendToMakeWebhook = async (
    imageBase64: string,
    fileName: string,
    pageNumber: number,
    totalPages: number
  ): Promise<string> => {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        pageNumber,
        totalPages,
        imageBase64,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        // ignore
      }
      throw new Error(`Webhook 回應錯誤: ${response.status}${bodyText ? ` (${bodyText.slice(0, 120)})` : ''}`);
    }

    return await response.text();
  };

  const processSingleFile = async (fileId: string) => {
    const file = filesRef.current.find(f => f.id === fileId);
    if (!file) return false;
    if (!accessToken) return false;

    // Update status to downloading
    setSelectedFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'downloading', error: undefined } : f
    ));

    try {
      if (mode === 'make') {
        // SOP 模式：
        // - PDF：先轉為每頁 PNG，再逐頁送出（避免直接送整份 PDF 造成 webhook 500）
        // - 圖片：直接轉 data URL 送出
        const blob = await downloadFileAsBlob(file.id);

        setSelectedFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'processing' } : f
        ));

        const isPdf = file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const pageImages = isPdf ? await convertPdfBlobToImages(blob) : [await blobToDataUrl(blob)];

        const results: string[] = [];
        for (let idx = 0; idx < pageImages.length; idx++) {
          const text = await sendToMakeWebhook(pageImages[idx], file.name, idx + 1, pageImages.length);
          results.push(text);
        }

        setSelectedFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'completed', result: { text: results.join('\n'), confidence: 95 } }
            : f
        ));
      } else {
        // 工程圖模式：使用原有的 Edge Function
        const { data, error } = await supabase.functions.invoke('google-drive-ocr', {
          body: {
            fileId: file.id,
            accessToken,
            mimeType: file.mimeType,
          },
        });

        if (error) {
          const msg = error.message?.includes('non-2xx')
            ? '後端處理失敗（可能是模型忙碌/配額限制），請稍後再試'
            : error.message;
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);

        setSelectedFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'completed', result: { text: data.text, confidence: 95 } } : f
        ));
      }
      return true;
    } catch (error) {
      setSelectedFiles(prev => prev.map(f =>
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

  const processFiles = async () => {
    if (!accessToken || filesRef.current.length === 0) return;

    setIsProcessing(true);
    autoRetryRoundRef.current = 0;

    // First pass: process all pending files
    const pendingFileIds = filesRef.current.filter(f => f.status === 'pending').map(f => f.id);
    for (const fileId of pendingFileIds) {
      await processSingleFile(fileId);
    }

    // Auto retry logic: 等整輪完成後，再統一對失敗項目進行下一輪重試
    for (let round = 0; round < autoRetryCount; round++) {
      // 等待 3 秒讓模型有時間恢復
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 取得當前失敗的檔案 (使用 ref 取得最新狀態)
      const failedFileIds = filesRef.current.filter(f => f.status === 'error').map(f => f.id);
      if (failedFileIds.length === 0) break;

      autoRetryRoundRef.current = round + 1;
      console.log(`自動重試第 ${round + 1} 輪，共 ${failedFileIds.length} 個失敗項目`);

      // 依序重試每個失敗的檔案
      for (const fileId of failedFileIds) {
        // 再次確認狀態（可能已經在這輪中被處理過）
        const currentFile = filesRef.current.find(f => f.id === fileId);
        if (currentFile?.status !== 'error') continue;
        
        await processSingleFile(fileId);
      }
    }

    setIsProcessing(false);
    autoRetryRoundRef.current = 0;
  };

  const retryFile = async (fileId: string) => {
    setIsProcessing(true);
    await processSingleFile(fileId);
    setIsProcessing(false);
  };

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setSelectedFiles([]);
  };

  const getStatusIcon = (status: GoogleDriveFile['status']) => {
    switch (status) {
      case 'downloading':
      case 'processing':
        return <Loader2 className={cn("w-5 h-5 animate-spin", colors.iconColor)} />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const pendingCount = selectedFiles.filter(f => f.status === 'pending').length;
  const completedCount = selectedFiles.filter(f => f.status === 'completed').length;
  const errorCount = selectedFiles.filter(f => f.status === 'error').length;

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed border-border bg-card">
        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-2" />
        <p className="text-sm text-muted-foreground">載入 Google Drive 設定中...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Auto Retry Setting */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <RotateCcw className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">自動重試次數：</span>
        <Select value={autoRetryCount.toString()} onValueChange={(v) => setAutoRetryCount(parseInt(v))}>
          <SelectTrigger className="w-20 h-8 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background border border-border z-50">
            {[1, 2, 3, 4, 5].map(n => (
              <SelectItem key={n} value={n.toString()}>{n} 次</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">（處理完畢後自動重試失敗項目）</span>
      </div>

      {/* Connect Button */}
      <motion.div
        className={cn(
          "flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed border-border bg-card transition-all cursor-pointer",
          colors.borderHover,
          "hover:bg-secondary/50"
        )}
        onClick={() => !isLoading && isApiLoaded && handleAuthClick()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <div
          className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-3", colors.iconBg)}
        >
          <Cloud className="w-6 h-6 text-white" />
        </div>
        <p className="font-semibold text-foreground text-sm">
          {isApiLoaded ? '選擇 Google Drive 檔案' : '載入 Google Drive API...'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          從雲端硬碟選擇 PDF 或圖片檔案
        </p>
      </motion.div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              已選擇 {selectedFiles.length} 個檔案
              {completedCount > 0 && ` · ${completedCount} 個完成`}
              {errorCount > 0 && ` · ${errorCount} 個失敗`}
            </p>
            <div className="flex gap-2">
              {!isProcessing && (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  清除全部
                </Button>
              )}
              {pendingCount > 0 && !isProcessing && (
                <Button size="sm" onClick={processFiles} className={cn("gap-2", colors.button)}>
                  <Play className="w-4 h-4" />
                  開始辨識 ({pendingCount})
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedFiles.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border",
                  (file.status === 'downloading' || file.status === 'processing') && colors.processing,
                  file.status === 'completed' && "border-green-500/30 bg-green-500/5",
                  file.status === 'error' && "border-destructive/30 bg-destructive/5",
                  file.status === 'pending' && "border-border bg-card"
                )}
              >
                {getStatusIcon(file.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {file.name}
                  </p>
                  {file.error && (
                    <p className="text-xs text-destructive">{file.error}</p>
                  )}
                </div>
                {file.status === 'error' && !isProcessing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryFile(file.id)}
                    className="gap-1 text-xs h-7 px-2"
                  >
                    <RefreshCw className="w-3 h-3" />
                    重試
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
