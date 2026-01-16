import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, FileImage, Send, ChevronDown, ChevronUp, Download, Image, Database } from 'lucide-react';
import { useState, useMemo } from 'react';
import { MakeWebhookFile } from '@/hooks/useMakeWebhook';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
interface MakeWebhookResultsProps {
  files: MakeWebhookFile[];
}

// 解析回傳資料格式: ["010","10",201,"裁線"] 或 ["30205068-00","010","10",201,"裁線"]
interface SopRowData {
  partNumber: string;  // 從檔名提取
  operation: string;   // 工序
  sequence: string;    // 序號
  processCode: number; // 製程編碼
  processName: string; // 製程名稱
}

export const MakeWebhookResults = ({ files }: MakeWebhookResultsProps) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const toggleExpand = (fileId: string) => {
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

  const completedFiles = files.filter(f => f.status === 'completed');
  const errorFiles = files.filter(f => f.status === 'error');
  const processingFiles = files.filter(f => f.status === 'converting' || f.status === 'sending');

  // 從檔名提取料號 (去除副檔名、=H 等後綴、以及結尾的 -UN)
  const extractPartNumber = (fileName: string): string => {
    return fileName
      .replace(/\.[^.]+$/, '')    // 移除副檔名
      .replace(/=.*$/, '')         // 移除 = 之後的內容
      .replace(/-UN$/i, '');       // 移除結尾的 -UN（不分大小寫）
  };

  // 解析單頁結果為 SopRowData[]
  const parseResultText = (resultText: string, defaultPartNumber: string): SopRowData[] => {
    const rows: SopRowData[] = [];

    const pushFrom4Cols = (partNumber: string, op: string, seq: string, code: string, name: string) => {
      rows.push({
        partNumber,
        operation: op,
        sequence: seq,
        processCode: parseInt(code, 10),
        processName: name,
      });
    };

    // 5 欄：["料號","010","10",201,"裁線"]
    const matches5 = resultText.matchAll(/\["([^"]+)","([^"]+)","([^"]+)",(\d+),"([^"]+)"\]/g);
    let matchedAny = false;
    for (const m of matches5) {
      matchedAny = true;
      pushFrom4Cols(m[1], m[2], m[3], m[4], m[5]);
    }

    if (matchedAny) return rows;

    // 4 欄：["010","10",201,"裁線"]（料號取檔名）
    const matches4 = resultText.matchAll(/\["([^"]+)","([^"]+)",(\d+),"([^"]+)"\]/g);
    for (const m of matches4) {
      pushFrom4Cols(defaultPartNumber, m[1], m[2], m[3], m[4]);
    }

    return rows;
  };

  // 將 page.result 轉為文字
  const getResultText = (result: any): string => {
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) return JSON.stringify(result);
    if (typeof result === 'object' && result) {
      const maybeMessage = (result as any).message;
      return typeof maybeMessage === 'string' ? maybeMessage : JSON.stringify(result);
    }
    return '';
  };

  // 收集所有已完成頁面的資料
  const allResultData = useMemo(() => {
    const rows: SopRowData[] = [];

    completedFiles.forEach(file => {
      const defaultPartNumber = extractPartNumber(file.name);

      file.pages?.forEach(page => {
        if (page.status !== 'completed' || page.result == null) return;
        try {
          const resultText = getResultText(page.result);
          rows.push(...parseResultText(resultText, defaultPartNumber));
        } catch (e) {
          console.error('解析結果資料失敗:', e);
        }
      });
    });

    return rows;
  }, [files]);

  const handleDownloadExcel = () => {
    if (allResultData.length === 0) {
      toast({
        title: '尚無可下載資料',
        description: '請確認每頁都有回傳可解析的資料',
        variant: 'destructive',
      });
      return;
    }

    // 轉換為 Excel 格式
    const excelRows = allResultData.map(row => ({
      '料號': row.partNumber,
      '工序': row.operation,
      '序號': row.sequence,
      '製程編碼': row.processCode,
      '製程名稱': row.processName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    
    worksheet['!cols'] = [
      { wch: 15 },  // 料號
      { wch: 8 },   // 工序
      { wch: 8 },   // 序號
      { wch: 10 },  // 製程編碼
      { wch: 15 },  // 製程名稱
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SOP製程結果');

    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `SOP製程結果_${timestamp}.xlsx`);

    toast({
      title: '已下載 Excel 檔案',
      description: `共 ${excelRows.length} 筆資料`,
    });
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

  // 同步到 Supabase 資料庫
  const handleSyncToSupabase = async () => {
    if (allResultData.length === 0) {
      toast({
        title: '尚無可同步資料',
        description: '請確認每頁都有回傳可解析的資料',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);

    try {
      // 準備要插入的資料，加入檔案名稱
      const insertData = allResultData.map((row, index) => {
        // 找到對應的檔案名稱
        let fileName = '';
        let currentIndex = 0;
        
        for (const file of completedFiles) {
          const defaultPartNumber = extractPartNumber(file.name);
          for (const page of file.pages || []) {
            if (page.status !== 'completed' || page.result == null) continue;
            const resultText = getResultText(page.result);
            const pageRows = parseResultText(resultText, defaultPartNumber);
            if (index >= currentIndex && index < currentIndex + pageRows.length) {
              fileName = file.name;
              break;
            }
            currentIndex += pageRows.length;
          }
          if (fileName) break;
        }

        return {
          part_number: row.partNumber,
          operation: row.operation,
          sequence: row.sequence,
          process_code: row.processCode,
          process_name: row.processName,
          file_name: fileName,
        };
      });

      const { error } = await supabase
        .from('sop_ocr_results')
        .insert(insertData);

      if (error) {
        throw error;
      }

      toast({
        title: '同步成功',
        description: `已將 ${insertData.length} 筆資料寫入資料庫`,
      });
    } catch (error: any) {
      console.error('同步到 Supabase 失敗:', error);
      toast({
        title: '同步失敗',
        description: error.message || '寫入資料庫時發生錯誤',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Summary Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Send className="w-4 h-4 text-primary" />
            <span className="font-medium">資料處理結果</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {completedFiles.length > 0 && (
            <span className="text-green-500">
              ✓ {completedFiles.length} 完成
            </span>
          )}
          {errorFiles.length > 0 && (
            <span className="text-destructive">
              ✗ {errorFiles.length} 失敗
            </span>
          )}
          {processingFiles.length > 0 && (
            <span className="text-primary animate-pulse">
              ⟳ {processingFiles.length} 處理中
            </span>
          )}
          <span className="text-xs text-muted-foreground">解析 {allResultData.length} 筆</span>
          <Button
            onClick={handleSyncToSupabase}
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={allResultData.length === 0 || isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {isSyncing ? '同步中...' : '同步到資料庫'}
          </Button>
          <Button
            onClick={handleDownloadExcel}
            size="sm"
            className="gap-2"
            disabled={allResultData.length === 0}
          >
            <Download className="w-4 h-4" />
            下載 Excel
          </Button>
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
              <div 
                className={cn(
                  "flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/50 transition-colors",
                  file.pages && file.pages.length > 0 && "border-b border-border"
                )}
                onClick={() => file.pages && file.pages.length > 0 && toggleExpand(file.id)}
              >
                <div className="flex-shrink-0">
                  {file.status === 'completed' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {file.status === 'error' && (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                  {(file.status === 'converting' || file.status === 'sending') && (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  )}
                  {file.status === 'pending' && (
                    <FileImage className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.status === 'converting' && '轉換為圖片中...'}
                    {file.status === 'sending' && `發送中 (${file.pages?.filter(p => p.status === 'completed').length || 0}/${file.pages?.length || 0} 頁)`}
                    {file.status === 'completed' && `${file.pages?.length || 1} 頁已發送完成`}
                    {file.status === 'error' && (file.error || '處理失敗')}
                    {file.status === 'pending' && '等待處理'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 下載圖片按鈕 */}
                  {file.convertedImageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadImage(file.name, file.convertedImageUrl!);
                      }}
                      className="gap-1"
                    >
                      <Image className="w-4 h-4" />
                      下載圖片
                    </Button>
                  )}
                  
                  {file.pages && file.pages.length > 0 && (
                    expandedFiles.has(file.id) ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )
                  )}
                </div>
              </div>

              {/* Pages Detail */}
              <AnimatePresence>
                {expandedFiles.has(file.id) && file.pages && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 pt-2 space-y-3 bg-secondary/30">
                      {file.pages.map((page) => {
                        const defaultPartNumber = extractPartNumber(file.name);
                        const resultText = page.result ? getResultText(page.result) : '';
                        const pageRows = page.status === 'completed' && resultText
                          ? parseResultText(resultText, defaultPartNumber)
                          : [];

                        return (
                          <div 
                            key={page.id}
                            className="rounded-lg bg-card border border-border overflow-hidden"
                          >
                            {/* Page Header */}
                            <div className="flex items-center gap-3 p-3 border-b border-border">
                              <div className="flex-shrink-0">
                                {page.status === 'completed' && (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                                {page.status === 'error' && (
                                  <XCircle className="w-4 h-4 text-destructive" />
                                )}
                                {page.status === 'sending' && (
                                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                )}
                                {page.status === 'pending' && (
                                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                                )}
                              </div>
                              <p className="text-sm font-medium">第 {page.pageNumber} 頁</p>
                              {page.status === 'completed' && pageRows.length > 0 && (
                                <span className="text-xs text-muted-foreground ml-auto">{pageRows.length} 筆</span>
                              )}
                            </div>

                            {/* Page Content */}
                            {page.status === 'error' && page.error && (
                              <div className="p-3">
                                <p className="text-xs text-destructive">{page.error}</p>
                              </div>
                            )}
                            {page.status === 'completed' && pageRows.length > 0 && (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">料號</TableHead>
                                    <TableHead className="text-xs">工序</TableHead>
                                    <TableHead className="text-xs">序號</TableHead>
                                    <TableHead className="text-xs">製程編碼</TableHead>
                                    <TableHead className="text-xs">製程名稱</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {pageRows.map((row, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="text-xs font-mono">{row.partNumber}</TableCell>
                                      <TableCell className="text-xs">{row.operation}</TableCell>
                                      <TableCell className="text-xs">{row.sequence}</TableCell>
                                      <TableCell className="text-xs">{row.processCode}</TableCell>
                                      <TableCell className="text-xs">{row.processName}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                            {page.status === 'completed' && pageRows.length === 0 && resultText && (
                              <div className="p-3">
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                                  {resultText.slice(0, 200)}{resultText.length > 200 ? '...' : ''}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
