import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Loader2, AlertCircle, CheckCircle2, Clock, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { BatchMbomFile } from '@/hooks/useMbomImport';

interface MbomUploadProps {
  files: BatchMbomFile[];
  isProcessing: boolean;
  currentProcessingIndex: number;
  onFilesSelect: (files: File[]) => void;
  onProcess: () => void;
  onRemoveFile: (fileId: string) => void;
  onClear: () => void;
}

export function MbomUpload({
  files,
  isProcessing,
  currentProcessingIndex,
  onFilesSelect,
  onProcess,
  onRemoveFile,
  onClear,
}: MbomUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const txtFiles = droppedFiles.filter(f => f.name.toLowerCase().endsWith('.txt'));
    if (txtFiles.length > 0) {
      onFilesSelect(txtFiles);
    }
  }, [onFilesSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      onFilesSelect(Array.from(selectedFiles));
    }
    e.target.value = '';
  }, [onFilesSelect]);

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  const getStatusIcon = (status: BatchMbomFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusBadge = (file: BatchMbomFile) => {
    switch (file.status) {
      case 'pending':
        return <Badge variant="outline" className="bg-muted text-muted-foreground">等待中</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">處理中...</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">{file.parsedData?.length || 0} 筆</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">錯誤</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* 上傳區域 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center",
          "transition-all duration-300 cursor-pointer",
          "hover:border-emerald-400 hover:bg-emerald-50/5",
          isProcessing ? "border-emerald-500 bg-emerald-50/10" : "border-border"
        )}
      >
        <input
          type="file"
          accept=".txt"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        
        <div className="flex flex-col items-center gap-4">
          <Upload className="w-12 h-12 text-emerald-500" />
          <div>
            <p className="font-semibold text-foreground">
              拖放多個 TXT 檔案至此處，或點擊選擇
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              支援實英零件表 TXT 格式（可多選）
            </p>
          </div>
        </div>
      </div>

      {/* 檔案清單 */}
      {files.length > 0 && (
        <div className="space-y-3">
          {/* 統計資訊與操作按鈕 */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                已選擇 <strong className="text-foreground">{files.length}</strong> 個檔案
              </span>
              {completedCount > 0 && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  {completedCount} 個完成
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  {errorCount} 個失敗
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                清除全部
              </Button>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  onClick={onProcess}
                  disabled={isProcessing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Play className="w-4 h-4 mr-1" />
                  開始解析 ({pendingCount})
                </Button>
              )}
            </div>
          </div>

          {/* 進度提示 */}
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
            >
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              <span className="text-sm font-medium text-emerald-600">
                正在處理第 {currentProcessingIndex + 1} / {files.length} 個檔案...
              </span>
            </motion.div>
          )}

          {/* 檔案列表 */}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2 pr-4">
              <AnimatePresence mode="popLayout">
                {files.map((file, index) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border",
                      file.status === 'completed' && "bg-emerald-500/5 border-emerald-500/20",
                      file.status === 'processing' && "bg-emerald-500/10 border-emerald-500/30",
                      file.status === 'error' && "bg-destructive/5 border-destructive/20",
                      file.status === 'pending' && "bg-card border-border"
                    )}
                  >
                    {getStatusIcon(file.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        {file.status === 'completed' && file.mainPartNumber && (
                          <span className="text-xs text-muted-foreground">
                            · {file.mainPartNumber}
                          </span>
                        )}
                        {file.status === 'error' && file.error && (
                          <span className="text-xs text-destructive truncate">
                            · {file.error}
                          </span>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(file)}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveFile(file.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                      disabled={isProcessing}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
