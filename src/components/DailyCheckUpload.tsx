import { useCallback } from 'react';
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { DailyCheckFile } from '@/hooks/useDailyCheck';

interface DailyCheckUploadProps {
  files: DailyCheckFile[];
  onFilesSelect: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onProcess: () => void;
  onRetryFile: (id: string) => void;
  onClear: () => void;
  isProcessing: boolean;
  currentProcessingIndex: number;
}

export const DailyCheckUpload = ({
  files,
  onFilesSelect,
  onRemoveFile,
  onProcess,
  onRetryFile,
  onClear,
  isProcessing,
  currentProcessingIndex,
}: DailyCheckUploadProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesSelect(droppedFiles);
    },
    [onFilesSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files);
        onFilesSelect(selectedFiles);
      }
    },
    [onFilesSelect]
  );

  const getStatusIcon = (status: DailyCheckFile['status']) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-violet-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const progress = files.length > 0 ? (completedCount / files.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
          'hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20',
          'border-border bg-card'
        )}
      >
        <input
          type="file"
          multiple
          accept=".txt,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Upload className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">拖放檔案至此處上傳</p>
            <p className="text-sm text-muted-foreground mt-1">
              或點擊選擇檔案 (TXT, PDF, PNG, JPG)
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              已選擇 {files.length} 個檔案
              {completedCount > 0 && (
                <span className="text-green-600 ml-2">({completedCount} 已完成)</span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={isProcessing}>
              <Trash2 className="w-4 h-4 mr-1" />
              清除全部
            </Button>
          </div>

          {isProcessing && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                處理進度: {completedCount}/{files.length}
              </p>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {files.map((file, index) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  file.status === 'processing' && 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800',
                  file.status === 'completed' && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
                  file.status === 'error' && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
                  file.status === 'pending' && 'bg-card border-border'
                )}
              >
                {getStatusIcon(file.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                    {file.error && <span className="text-red-500 ml-2">{file.error}</span>}
                  </p>
                </div>
                {file.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRetryFile(file.id)}
                    className="text-violet-600 hover:text-violet-700"
                  >
                    重試
                  </Button>
                )}
                {!isProcessing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveFile(file.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Process Button */}
          {pendingCount > 0 && (
            <Button
              onClick={onProcess}
              disabled={isProcessing}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  處理中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  開始處理 ({pendingCount} 個檔案)
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
