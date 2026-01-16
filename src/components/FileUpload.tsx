import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
  currentFile: File | null;
  onClear: () => void;
}

export const FileUpload = ({ onFileSelect, isProcessing, currentFile, onClear }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);

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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {currentFile ? (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-2xl bg-card border border-border p-6 shadow-card"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-secondary flex items-center justify-center">
                {isProcessing ? (
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                ) : (
                  <FileText className="w-7 h-7 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{currentFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {!isProcessing && (
                <button
                  onClick={onClear}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-muted hover:bg-destructive/10 flex items-center justify-center transition-colors group"
                >
                  <X className="w-5 h-5 text-muted-foreground group-hover:text-destructive" />
                </button>
              )}
            </div>
            {isProcessing && (
              <motion.div 
                className="mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'var(--gradient-primary)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3, ease: 'easeInOut' }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  正在進行 OCR 辨識...
                </p>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.label
            key="upload-area"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border bg-card hover:border-primary/50 hover:bg-secondary/50"
            )}
          >
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <motion.div
              animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <Upload className="w-8 h-8 text-primary-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">
                  拖拽檔案至此處或點擊上傳
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  支援 PDF、PNG、JPG、JPEG 格式
                </p>
              </div>
            </motion.div>
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  );
};
