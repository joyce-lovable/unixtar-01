import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, CheckCircle, ChevronDown, ChevronUp, Copy, Check, Clock, RefreshCw, RotateCw, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { parseMoldEntries, type ParsedData } from '@/lib/moldParser';
import * as XLSX from 'xlsx';

interface OCRTiming {
  orientationDuration?: number;
  ocrDuration: number;
  totalDuration: number;
  attemptCount: number;
  rotationApplied?: number;
}

interface OCRResultData {
  text: string;
  confidence: number;
  timing?: OCRTiming;
}

// 支援本地上傳和 Google Drive 兩種檔案格式
interface OCRResultFile {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: OCRResultData;
  error?: string;
  // 可選屬性 - 本地檔案有這些，Google Drive 檔案沒有
  file?: File;
  size?: number;
  convertedImageUrl?: string; // base64 data URL for download
}

interface BatchOCRResultsProps {
  files: OCRResultFile[];
}

interface FileWithParsedData extends OCRResultFile {
  parsedData: ParsedData;
}

export const BatchOCRResults = ({ files }: BatchOCRResultsProps) => {
  const { toast } = useToast();
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const completedFiles = useMemo(() => {
    return files
      .filter(f => f.status === 'completed' && f.result)
      .map(f => ({
        ...f,
        parsedData: parseMoldEntries(f.result!.text, f.name),
      })) as FileWithParsedData[];
  }, [files]);

  const handleDownloadExcel = () => {
    const allRows: any[] = [];
    let fileIndex = 1;

    completedFiles.forEach(file => {
      const allMolds = file.parsedData.molds.flatMap(e => e.expanded);
      const currentFileIndex = fileIndex; // 同檔案共用同一個序號
      fileIndex++; // 下一個檔案序號 +1

      if (allMolds.length > 0) {
        allMolds.forEach(mold => {
          allRows.push({
            '序號': currentFileIndex,
            '檔案名稱': file.name,
            '品名': file.parsedData.partName || '',
            '確認模具': mold,
          });
        });
      } else {
        allRows.push({
          '序號': currentFileIndex,
          '檔案名稱': file.name,
          '品名': file.parsedData.partName || '',
          '確認模具': '',
        });
      }
    });

    if (allRows.length === 0) {
      toast({
        title: '無資料可導出',
        description: '請先完成檔案辨識',
        variant: 'destructive',
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(allRows);

    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 35 },
      { wch: 30 },
      { wch: 25 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '批次OCR結果');

    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `批次辨識結果_${timestamp}.xlsx`);

    toast({
      title: '已下載 Excel 檔案',
      description: `共 ${allRows.length} 筆資料`,
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedFiles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({
      title: '已複製到剪貼簿',
      description: '原始 OCR 文字已成功複製',
    });
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDownloadImage = (fileName: string, dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName.replace(/\.[^/.]+$/, '') + '_轉換圖片.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: '已下載轉換圖片',
      description: '可與原始 PDF 進行品質比較',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const totalMolds = completedFiles.reduce(
    (acc, f) => acc + f.parsedData.molds.reduce((a, e) => a + e.expanded.length, 0),
    0
  );

  // 計算總體統計
  const totalTiming = useMemo(() => {
    let totalOrientation = 0;
    let totalOcr = 0;
    let totalTime = 0;
    let totalAttempts = 0;
    let rotatedCount = 0;
    
    completedFiles.forEach(f => {
      if (f.result?.timing) {
        totalOrientation += f.result.timing.orientationDuration || 0;
        totalOcr += f.result.timing.ocrDuration;
        totalTime += f.result.timing.totalDuration;
        totalAttempts += f.result.timing.attemptCount;
        if (f.result.timing.rotationApplied && f.result.timing.rotationApplied !== 0) {
          rotatedCount++;
        }
      }
    });
    
    return { 
      orientationDuration: totalOrientation,
      ocrDuration: totalOcr, 
      totalDuration: totalTime, 
      attemptCount: totalAttempts,
      rotatedCount,
    };
  }, [completedFiles]);

  if (completedFiles.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card border border-primary/30 shadow-card overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-border bg-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">批次辨識結果</h3>
            <p className="text-sm text-muted-foreground">
              {completedFiles.length} 個檔案 · {totalMolds} 個模具編號
            </p>
          </div>
        </div>
        <Button onClick={handleDownloadExcel} className="gap-2">
          <Download className="w-4 h-4" />
          下載全部 Excel
        </Button>
      </div>

      {/* 總體效能統計 */}
      {totalTiming.totalDuration > 0 && (
        <div className="px-6 py-3 bg-muted/30 border-b border-border">
          <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm">
            {totalTiming.orientationDuration > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">方向偵測:</span>
                <span className="font-semibold text-blue-500">{formatDuration(totalTiming.orientationDuration)}</span>
              </div>
            )}
            {totalTiming.rotatedCount > 0 && (
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-purple-500" />
                <span className="text-muted-foreground">自動旋轉:</span>
                <span className="font-semibold text-purple-500">{totalTiming.rotatedCount} 個檔案</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">AI辨識:</span>
              <span className="font-semibold text-primary">{formatDuration(totalTiming.ocrDuration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">總耗時:</span>
              <span className="font-semibold">{formatDuration(totalTiming.totalDuration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">重試:</span>
              {totalTiming.attemptCount > completedFiles.length ? (
                <span className="font-semibold text-amber-500">{totalTiming.attemptCount - completedFiles.length} 次</span>
              ) : (
                <span className="font-semibold text-green-500">無</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
        {completedFiles.map((file) => {
          const expanded = !!expandedFiles[file.id];
          const rawText = file.result?.text ?? '';
          const hasConvertedImage = !!(file as any).convertedImageUrl;

          return (
            <div
              key={file.id}
              className="p-4 rounded-xl bg-secondary/30 border border-border"
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{file.name}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {file.parsedData.partName && (
                      <span className="text-xs px-2 py-1 rounded-md bg-accent/20 text-accent-foreground">
                        品名: {file.parsedData.partName}
                      </span>
                    )}
                    {file.parsedData.molds.length > 0 && (
                      <span className="text-xs px-2 py-1 rounded-md bg-primary/20 text-primary">
                        模具: {file.parsedData.molds.reduce((a, e) => a + e.expanded.length, 0)} 個
                      </span>
                    )}
                  </div>

                  {file.parsedData.molds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {file.parsedData.molds.flatMap((entry, idx) =>
                        entry.expanded.slice(0, 5).map((mold, i) => (
                          <span
                            key={`${idx}-${i}`}
                            className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                          >
                            {mold}
                          </span>
                        ))
                      )}
                      {file.parsedData.molds.reduce((a, e) => a + e.expanded.length, 0) > 5 && (
                        <span className="text-xs text-muted-foreground">
                          +{file.parsedData.molds.reduce((a, e) => a + e.expanded.length, 0) - 5} 更多
                        </span>
                      )}
                    </div>
                  )}

                  {/* Debug: 原始 OCR 文字 */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleExpanded(file.id)}
                      className="gap-2"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          收合原始文字
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          查看原始文字
                        </>
                      )}
                    </Button>

                    {rawText && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyText(file.id, rawText)}
                        className="gap-2"
                      >
                        {copiedId === file.id ? (
                          <>
                            <Check className="w-4 h-4" />
                            已複製
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            複製原始文字
                          </>
                        )}
                      </Button>
                    )}

                    {/* 下載轉換圖片按鈕 */}
                    {hasConvertedImage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadImage(file.name, (file as any).convertedImageUrl)}
                        className="gap-2 text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        <Image className="w-4 h-4" />
                        下載轉換圖片
                      </Button>
                    )}
                  </div>

                  {expanded && (
                    <div className="mt-3">
                      {rawText ? (
                        <pre className="whitespace-pre-wrap font-sans text-foreground bg-muted/50 rounded-xl p-4 text-sm leading-relaxed overflow-auto max-h-[320px]">
                          {rawText}
                        </pre>
                      ) : (
                        <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4">
                          （此檔案沒有回傳任何可顯示的文字）
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
