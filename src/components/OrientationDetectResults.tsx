import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, FileImage, RotateCw, Bug, Eye } from 'lucide-react';
import { useState } from 'react';
import { OrientationFile } from '@/hooks/useOrientationDetect';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface OrientationDetectResultsProps {
  files: OrientationFile[];
}

const getRotationDirectionText = (deg: number) => {
  switch (deg) {
    case 0: return '正向（無需旋轉）';
    case 90: return '向左躺（需順時針轉 90°）';
    case 180: return '倒置（需轉 180°）';
    case 270: return '向右躺（需順時針轉 270°）';
    default: return '未知';
  }
};

const getConfidenceText = (c?: OrientationFile['confidence']) => {
  if (c === 'high') return '高信心度';
  if (c === 'medium') return '中信心度';
  if (c === 'low') return '低信心度';
  return '略過';
};

export const OrientationDetectResults = ({ files }: OrientationDetectResultsProps) => {
  const [showRawResponse, setShowRawResponse] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState<Set<string>>(new Set());

  const toggleRaw = (fileId: string) => {
    setShowRawResponse(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  };

  const togglePreview = (fileId: string) => {
    setShowPreview(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  };

  const completedFiles = files.filter(f => f.status === 'completed');
  const errorFiles = files.filter(f => f.status === 'error');
  const processingFiles = files.filter(f => f.status === 'processing');

  if (files.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Summary Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-2 text-sm">
          <RotateCw className="w-4 h-4 text-teal-600" />
          <span className="font-medium">方向偵測結果</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {completedFiles.length > 0 && (
            <span className="text-green-500">✓ {completedFiles.length} 完成</span>
          )}
          {errorFiles.length > 0 && (
            <span className="text-destructive">✗ {errorFiles.length} 失敗</span>
          )}
          {processingFiles.length > 0 && (
            <span className="text-teal-600 animate-pulse">⟳ {processingFiles.length} 處理中</span>
          )}
        </div>
      </div>

      {/* File Results */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {files.map((file) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              {/* File Header */}
              <div className="flex items-center gap-3 p-4">
                <div className="flex-shrink-0">
                  {file.status === 'completed' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {file.status === 'error' && (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                  {file.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                  )}
                  {file.status === 'pending' && (
                    <FileImage className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.status === 'processing' && '偵測中...'}
                    {file.status === 'completed' && (
                      <span className="text-teal-700 dark:text-teal-400">
                        {getRotationDirectionText(file.rotation ?? 0)}
                        {file.originalRotation !== undefined && file.originalRotation !== file.rotation && (
                          <span className="ml-2 text-purple-600 dark:text-purple-400">
                            (AI 原判: {file.originalRotation}°)
                          </span>
                        )}
                      </span>
                    )}
                    {file.status === 'error' && (file.error || '偵測失敗')}
                    {file.status === 'pending' && '等待處理'}
                  </p>
                </div>

                {/* 結果標籤 */}
                {file.status === 'completed' && file.rotation !== undefined && (
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold flex-shrink-0",
                    file.rotation === 0
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : file.rotation === 180
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    <RotateCw className="w-4 h-4" />
                    <span className="text-lg">{file.rotation}°</span>
                  </div>
                )}

                {/* 信心度 */}
                {file.status === 'completed' && file.confidence && (
                  <div className={cn(
                    "px-2 py-1 rounded-md text-xs font-medium flex-shrink-0",
                    file.confidence === 'high' 
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : file.confidence === 'medium'
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  )}>
                    {getConfidenceText(file.confidence)}
                  </div>
                )}

                {/* 預覽按鈕 */}
                {file.previewUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePreview(file.id)}
                    className={cn(
                      "gap-1 text-xs flex-shrink-0",
                      showPreview.has(file.id) 
                        ? "text-teal-600 bg-teal-100 dark:bg-teal-900/30"
                        : "text-muted-foreground hover:text-teal-600"
                    )}
                  >
                    <Eye className="w-3 h-3" />
                    預覽
                  </Button>
                )}

                {/* Raw 按鈕 */}
                {file.rawResponse && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRaw(file.id)}
                    className={cn(
                      "gap-1 text-xs flex-shrink-0",
                      showRawResponse.has(file.id) 
                        ? "text-purple-600 bg-purple-100 dark:bg-purple-900/30"
                        : "text-muted-foreground hover:text-purple-600"
                    )}
                  >
                    <Bug className="w-3 h-3" />
                    Raw
                  </Button>
                )}
              </div>

              {/* Preview Area */}
              <AnimatePresence>
                {showPreview.has(file.id) && file.previewUrl && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border"
                  >
                    <div className="p-4 bg-secondary/30 flex justify-center">
                      <img 
                        src={file.previewUrl} 
                        alt={file.name}
                        className="max-h-64 max-w-full object-contain rounded-lg shadow-md"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Raw Response Area */}
              <AnimatePresence>
                {showRawResponse.has(file.id) && file.rawResponse && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border"
                  >
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Bug className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                          AI 原始回應（除錯用）
                        </span>
                      </div>
                      <pre className="text-xs font-mono text-purple-800 dark:text-purple-200 whitespace-pre-wrap break-all bg-purple-100 dark:bg-purple-900/40 rounded p-2 max-h-48 overflow-auto">
                        {file.rawResponse}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
