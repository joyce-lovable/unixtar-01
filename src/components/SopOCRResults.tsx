import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Copy, Download, ChevronDown, ChevronUp, FileText, Hash, List, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import type { SopOCRFile, SopParsedStep } from '@/hooks/useSopOCR';

interface SopOCRResultsProps {
  files: SopOCRFile[];
}

export const SopOCRResults = ({ files }: SopOCRResultsProps) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showRawResults, setShowRawResults] = useState<Set<string>>(new Set());

  const completedFiles = files.filter(f => f.status === 'completed' && f.result);

  const toggleExpanded = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleRawResults = (fileId: string) => {
    setShowRawResults(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已複製到剪貼簿');
  };

  const handleDownloadImage = (file: SopOCRFile) => {
    const base64 = file.result?.processedImageBase64;
    if (!base64) {
      toast.error('沒有可下載的圖片');
      return;
    }
    
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = file.name.replace(/\.(pdf|jpg|jpeg|png)$/i, '_processed.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('圖片已下載');
  };

  const copyAllResults = () => {
    const allResults = completedFiles
      .map(f => f.result?.text || '')
      .filter(Boolean)
      .join('\n\n');
    
    if (allResults) {
      navigator.clipboard.writeText(allResults);
      toast.success('已複製所有結果');
    }
  };

  const exportToExcel = () => {
    const rows: Array<{ 序號: string; 流程代碼: string; 步驟代碼: string; 步驟名稱: string; 檔案名稱: string }> = [];

    completedFiles.forEach((file) => {
      const steps = file.result?.parsedSteps || [];
      steps.forEach((step) => {
        rows.push({
          序號: step.seq,
          流程代碼: step.code,
          步驟代碼: step.stepCode,
          步驟名稱: step.stepName,
          檔案名稱: file.name,
        });
      });
    });

    if (rows.length === 0) {
      toast.error('沒有可導出的資料');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SOP製程編碼');

    const colWidths = [
      { wch: 8 },
      { wch: 10 },
      { wch: 10 },
      { wch: 20 },
      { wch: 30 },
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `SOP製程編碼_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel 檔案已下載');
  };

  if (completedFiles.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <List className="w-5 h-5 text-primary" />
          SOP 製程解析結果
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyAllResults}
            className="gap-2"
          >
            <Copy className="w-4 h-4" />
            複製全部
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={exportToExcel}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            匯出 Excel
          </Button>
        </div>
      </div>

      {/* Results Cards */}
      <AnimatePresence mode="popLayout">
        {completedFiles.map((file) => {
          const isExpanded = expandedFiles.has(file.id);
          const showRaw = showRawResults.has(file.id);
          const steps = file.result?.parsedSteps || [];

          return (
            <motion.div
              key={file.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border rounded-xl overflow-hidden shadow-soft"
            >
              {/* Card Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpanded(file.id)}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      識別到 {steps.length} 個製程步驟
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {file.result?.processedImageBase64 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadImage(file);
                      }}
                      className="gap-1"
                    >
                      <Image className="w-4 h-4" />
                      下載圖片
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(file.result?.text || '');
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border"
                  >
                    <div className="p-4 space-y-4">
                      {/* Toggle View */}
                      <div className="flex gap-2">
                        <Button
                          variant={showRaw ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => showRaw && toggleRawResults(file.id)}
                        >
                          <Hash className="w-4 h-4 mr-1" />
                          格式化結果
                        </Button>
                        <Button
                          variant={showRaw ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => !showRaw && toggleRawResults(file.id)}
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          原始辨識
                        </Button>
                      </div>

                      {showRaw ? (
                        /* Raw Phase 1 Result */
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            AI 原始辨識結果：
                          </p>
                          <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                            {file.result?.rawPhase1 || '無資料'}
                          </pre>
                        </div>
                      ) : (
                        /* Formatted Steps Table */
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left p-2 font-medium text-muted-foreground">序號</th>
                                <th className="text-left p-2 font-medium text-muted-foreground">流程代碼</th>
                                <th className="text-left p-2 font-medium text-muted-foreground">步驟代碼</th>
                                <th className="text-left p-2 font-medium text-muted-foreground">步驟名稱</th>
                              </tr>
                            </thead>
                            <tbody>
                              {steps.map((step, idx) => (
                                <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                                  <td className="p-2 font-mono">{step.seq}</td>
                                  <td className="p-2 font-mono">{step.code}</td>
                                  <td className="p-2 font-mono text-primary">{step.stepCode}</td>
                                  <td className="p-2">{step.stepName}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Final Output */}
                      <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-muted-foreground">
                            最終輸出格式：
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(file.result?.text || '')}
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            複製
                          </Button>
                        </div>
                        <pre className="text-sm text-foreground whitespace-pre-wrap font-mono bg-background/50 p-3 rounded border border-border">
                          {file.result?.text || '無資料'}
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};