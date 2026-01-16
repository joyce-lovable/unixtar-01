import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Loader2, CheckCircle, AlertCircle, Play, RefreshCw, RotateCcw, Send, FileImage, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Generic file type that supports multiple status types
interface GenericFile {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'converting' | 'sending';
  error?: string;
}

interface BatchFileUploadProps {
  files: GenericFile[];
  onFilesSelect: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onProcess: (autoRetryCount?: number) => void;
  onRetryFile?: (id: string) => void;
  onClear: () => void;
  isProcessing: boolean;
  currentProcessingIndex: number;
  mode?: 'ocr' | 'make' | 'orientation';
  colorScheme?: 'blue' | 'amber' | 'teal';
}

export const BatchFileUpload = ({ 
  files, 
  onFilesSelect, 
  onRemoveFile, 
  onProcess, 
  onRetryFile,
  onClear,
  isProcessing,
  currentProcessingIndex,
  mode = 'ocr',
  colorScheme = 'blue'
}: BatchFileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState<number>(1);

  // 色系配置
  const colorClasses = {
    blue: {
      uploadIcon: 'bg-blue-600',
      uploadBorderHover: 'hover:border-blue-400',
      uploadBorderDrag: 'border-blue-500 bg-blue-500/5',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      processing: 'border-blue-500 bg-blue-500/5',
      iconColor: 'text-blue-500',
    },
    amber: {
      uploadIcon: 'bg-amber-600',
      uploadBorderHover: 'hover:border-amber-400',
      uploadBorderDrag: 'border-amber-500 bg-amber-500/5',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      processing: 'border-amber-500 bg-amber-500/5',
      iconColor: 'text-amber-500',
    },
    teal: {
      uploadIcon: 'bg-teal-600',
      uploadBorderHover: 'hover:border-teal-400',
      uploadBorderDrag: 'border-teal-500 bg-teal-500/5',
      button: 'bg-teal-600 hover:bg-teal-700 text-white',
      processing: 'border-teal-500 bg-teal-500/5',
      iconColor: 'text-teal-500',
    }
  };
  const colors = colorClasses[colorScheme];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || file.type.startsWith('image/')
    );
    
    if (droppedFiles.length > 0) {
      onFilesSelect(droppedFiles);
    }
  }, [onFilesSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesSelect(selectedFiles);
    }
    e.target.value = '';
  }, [onFilesSelect]);

  const handleProcess = () => {
    onProcess(autoRetryCount);
  };

  const getStatusIcon = (status: GenericFile['status'], index: number) => {
    switch (status) {
      case 'processing':
      case 'converting':
      case 'sending':
        return <Loader2 className={cn("w-5 h-5 animate-spin", colors.iconColor)} />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return mode === 'make' || mode === 'orientation'
          ? <FileImage className="w-5 h-5 text-muted-foreground" />
          : <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: GenericFile['status']) => {
    switch (status) {
      case 'converting': return '轉換中...';
      case 'sending': return '發送中...';
      case 'processing': return '處理中...';
      default: return '';
    }
  };

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const inProgressCount = files.filter(f => ['processing', 'converting', 'sending'].includes(f.status)).length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const buttonLabel = mode === 'orientation' ? '開始偵測' : '開始辨識';

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

      {/* Upload Area */}
      <motion.label
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300",
          isDragging
            ? cn(colors.uploadBorderDrag, "scale-[1.02]")
            : cn("border-border bg-card", colors.uploadBorderHover, "hover:bg-secondary/50")
        )}
      >
        <input
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <motion.div
          animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
          className="flex flex-col items-center gap-3"
        >
          <div 
            className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colors.uploadIcon)}
          >
            <Upload className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground text-sm">
              拖拽多個檔案至此處或點擊上傳
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              支援 PDF、PNG、JPG、JPEG 格式（可多選）
            </p>
          </div>
        </motion.div>
      </motion.label>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              已選擇 {files.length} 個檔案
              {completedCount > 0 && ` · ${completedCount} 個完成`}
              {errorCount > 0 && ` · ${errorCount} 個失敗`}
            </p>
            <div className="flex gap-2">
              {!isProcessing && files.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                >
                  清除全部
                </Button>
              )}
              {pendingCount > 0 && !isProcessing && (
                <Button
                  size="sm"
                  onClick={handleProcess}
                  className={cn("gap-2", colors.button)}
                >
                  {mode === 'make' ? <Send className="w-4 h-4" /> : mode === 'orientation' ? <RotateCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {buttonLabel} ({pendingCount})
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border",
                    (file.status === 'processing' || file.status === 'converting' || file.status === 'sending') && colors.processing,
                    file.status === 'completed' && "border-green-500/30 bg-green-500/5",
                    file.status === 'error' && "border-destructive/30 bg-destructive/5",
                    file.status === 'pending' && "border-border bg-card"
                  )}
                >
                  {getStatusIcon(file.status, index)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {file.error && <span className="text-destructive ml-2">{file.error}</span>}
                    </p>
                  </div>
                  {file.status === 'error' && !isProcessing && onRetryFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRetryFile(file.id)}
                      className="gap-1 text-xs h-7 px-2"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重試
                    </Button>
                  )}
                  {!isProcessing && file.status !== 'completed' && file.status !== 'error' && (
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 rounded-full hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  {file.status === 'error' && !isProcessing && (
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 rounded-full hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
