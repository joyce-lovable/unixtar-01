import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MbomUploadProps {
  fileName: string | null;
  isProcessing: boolean;
  error: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}

export function MbomUpload({
  fileName,
  isProcessing,
  error,
  onFileSelect,
  onClear,
}: MbomUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find(f => f.name.toLowerCase().endsWith('.txt'));
    if (txtFile) {
      onFileSelect(txtFile);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
    e.target.value = '';
  }, [onFileSelect]);

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
          isProcessing ? "border-emerald-500 bg-emerald-50/10" : "border-border",
          error && "border-destructive bg-destructive/5"
        )}
      >
        <input
          type="file"
          accept=".txt"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <>
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <div>
                <p className="font-semibold text-foreground">正在解析檔案...</p>
                <p className="text-sm text-muted-foreground mt-1">請稍候</p>
              </div>
            </>
          ) : error ? (
            <>
              <AlertCircle className="w-12 h-12 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">解析錯誤</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-emerald-500" />
              <div>
                <p className="font-semibold text-foreground">
                  拖放 TXT 檔案至此處，或點擊選擇
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  支援實英零件表 TXT 格式
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 已選擇的檔案 */}
      {fileName && !error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
        >
          <FileText className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-medium text-foreground flex-1 truncate">
            {fileName}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={isProcessing}
          >
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
