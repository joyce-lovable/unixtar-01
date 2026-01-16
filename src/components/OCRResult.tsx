import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, FileText, Sparkles, Wrench, Tag, Hash, Download, Clock, RefreshCw, RotateCw } from 'lucide-react';
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

interface OCRResultProps {
  text: string;
  confidence?: number;
  filename?: string;
  timing?: OCRTiming;
}

export const OCRResult = ({ text, confidence, filename, timing }: OCRResultProps) => {
  const [copied, setCopied] = useState(false);
  const [copiedMolds, setCopiedMolds] = useState(false);
  const { toast } = useToast();

  // 解析資料，傳入檔名以優先提取
  const parsedData: ParsedData = useMemo(() => parseMoldEntries(text, filename), [text, filename]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: '已複製到剪貼簿',
      description: '文字內容已成功複製',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMolds = async () => {
    const moldText = parsedData.molds
      .flatMap(e => e.expanded)
      .join('\n');
    await navigator.clipboard.writeText(moldText);
    setCopiedMolds(true);
    toast({
      title: '已複製成型模具清單',
      description: `共 ${parsedData.molds.reduce((acc, e) => acc + e.expanded.length, 0)} 個模具編號`,
    });
    setTimeout(() => setCopiedMolds(false), 2000);
  };

  const handleDownloadExcel = () => {
    const allMolds = parsedData.molds.flatMap(e => e.expanded);
    
    // 每個模具編號獨立一行
    const data = allMolds.length > 0
      ? allMolds.map((mold, index) => ({
          '序號': index + 1,
          '檔案名稱': filename || '未知檔案',
          '品名': parsedData.partName || '',
          '確認模具': mold
        }))
      : [{
          '序號': 1,
          '檔案名稱': filename || '未知檔案',
          '品名': parsedData.partName || '',
          '確認模具': ''
        }];

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // 設定欄寬
    worksheet['!cols'] = [
      { wch: 8 },   // 序號
      { wch: 30 },  // 檔案名稱
      { wch: 30 },  // 品名
      { wch: 20 }   // 確認模具
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OCR結果');

    // 生成檔名
    const baseFilename = filename?.replace(/\.[^/.]+$/, '') || 'ocr_result';
    XLSX.writeFile(workbook, `${baseFilename}_解析結果.xlsx`);

    toast({
      title: '已下載 Excel 檔案',
      description: `共 ${allMolds.length} 筆資料`,
    });
  };

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const charCount = text.length;

  const totalMoldCount = parsedData.molds.reduce((acc, e) => acc + e.expanded.length, 0);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full space-y-4"
    >
      {/* 處理時間資訊卡片 */}
      {timing && (
        <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
          <div className="px-6 py-4 bg-muted/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent/20">
                <Clock className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">處理時間分析</h3>
                <p className="text-sm text-muted-foreground">詳細效能統計</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* 方向偵測耗時 */}
              {timing.orientationDuration !== undefined && timing.orientationDuration > 0 && (
                <div className="bg-background/50 rounded-xl p-3 text-center">
                  <div className="text-xs text-muted-foreground mb-1">方向偵測</div>
                  <div className="text-lg font-bold text-blue-500">{formatDuration(timing.orientationDuration)}</div>
                </div>
              )}
              {/* 旋轉角度 */}
              {timing.rotationApplied !== undefined && timing.rotationApplied !== 0 && (
                <div className="bg-background/50 rounded-xl p-3 text-center">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <RotateCw className="w-3 h-3" />
                    自動旋轉
                  </div>
                  <div className="text-lg font-bold text-purple-500">{timing.rotationApplied}°</div>
                </div>
              )}
              <div className="bg-background/50 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">AI 辨識</div>
                <div className="text-lg font-bold text-primary">{formatDuration(timing.ocrDuration)}</div>
              </div>
              <div className="bg-background/50 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">總耗時</div>
                <div className="text-lg font-bold text-foreground">{formatDuration(timing.totalDuration)}</div>
              </div>
              <div className="bg-background/50 rounded-xl p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  重試次數
                </div>
                <div className="text-lg font-bold text-foreground">
                  {timing.attemptCount > 1 ? (
                    <span className="text-amber-500">{timing.attemptCount} 次</span>
                  ) : (
                    <span className="text-green-500">1 次通過</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 解析結果卡片 */}
      {parsedData.hasResults && (
        <div className="rounded-2xl bg-card border border-primary/30 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-primary/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary"
              >
                <Wrench className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">智慧解析結果</h3>
                <p className="text-sm text-muted-foreground">
                  {parsedData.partName && '品名 · '}
                  {parsedData.partNumber && 'PART NUMBER · '}
                  {parsedData.molds.length > 0 && `${parsedData.molds.length} 組模具 (${totalMoldCount} 個編號)`}
                </p>
              </div>
          </div>
            <div className="flex items-center gap-2">
              {parsedData.molds.length > 0 && (
                <Button
                  onClick={handleCopyMolds}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  {copiedMolds ? (
                    <>
                      <Check className="w-4 h-4" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      複製模具
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={handleDownloadExcel}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                下載 Excel
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {/* 品名 */}
            {parsedData.partName && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/20 shrink-0">
                  <Tag className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">品名</p>
                  <p className="font-medium text-foreground">{parsedData.partName}</p>
                </div>
              </div>
            )}
            
            {/* PART NUMBER */}
            {parsedData.partNumber && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/20 shrink-0">
                  <Hash className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">PART NUMBER</p>
                  <p className="font-mono font-medium text-foreground">{parsedData.partNumber}</p>
                </div>
              </div>
            )}
            
            {/* 成型模具 */}
            {parsedData.molds.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 shrink-0">
                  <Wrench className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">成型模具清單</p>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.molds.flatMap((entry, idx) =>
                      entry.expanded.map((moldNum, i) => (
                        <span
                          key={`${idx}-${i}`}
                          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-mono text-sm font-medium border border-primary/20"
                        >
                          {moldNum}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 原始 OCR 結果 */}
      <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-accent)' }}
            >
              <Sparkles className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">辨識結果</h3>
              <p className="text-sm text-muted-foreground">
                {charCount} 字元 · {wordCount} 個詞
                {confidence !== undefined && ` · 信心度 ${Math.round(confidence)}%`}
              </p>
            </div>
          </div>
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                已複製
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                複製全部
              </>
            )}
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          {text ? (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-foreground bg-muted/50 rounded-xl p-4 text-sm leading-relaxed overflow-auto max-h-[500px]">
                {text}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">未能辨識到任何文字內容</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
