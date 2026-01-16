import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, FileImage, Send, ChevronDown, ChevronUp, Download, Image, Database } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { MakeWebhookFile } from '@/hooks/useMakeWebhook';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MakeWebhookResultsProps {
  files: MakeWebhookFile[];
  autoOverwrite?: boolean;  // 從外部傳入的自動覆蓋設定
}

// 解析回傳資料格式: ["010","10",201,"裁線"] 或 ["30205068-00","010","10",201,"裁線"]
interface SopRowData {
  partNumber: string;  // 從檔名提取
  operation: string;   // 工序
  sequence: string;    // 序號
  processCode: number; // 製程編碼
  processName: string; // 製程名稱
}

export const MakeWebhookResults = ({ files, autoOverwrite = false }: MakeWebhookResultsProps) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  // 追蹤已同步的檔案名稱，讓重試成功的檔案也能自動同步
  const [syncedFileNames, setSyncedFileNames] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  
  // 覆蓋功能狀態（autoOverwrite 現在從 props 傳入）
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
  const [pendingInsertData, setPendingInsertData] = useState<{
    part_number: string;
    operation: string;
    sequence: string;
    process_code: number;
    process_name: string;
    file_name: string;
    group_id: number;
  }[]>([]);

  // 取得或建立群組 ID
  const getOrCreateGroupId = async (partNumber: string): Promise<number> => {
    // 先查詢是否已存在該料號的群組
    const { data: existingGroup } = await supabase
      .from('sop_groups')
      .select('group_id')
      .eq('part_number', partNumber)
      .maybeSingle();

    if (existingGroup) {
      return existingGroup.group_id;
    }

    // 不存在則新增群組
    const { data: newGroup, error } = await supabase
      .from('sop_groups')
      .insert({ part_number: partNumber })
      .select('group_id')
      .single();

    if (error || !newGroup) {
      throw new Error(`無法建立群組: ${error?.message}`);
    }

    return newGroup.group_id;
  };

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

  // 準備要插入的資料（非同步版本，包含 group_id）
  const prepareInsertData = async (): Promise<{
    part_number: string;
    operation: string;
    sequence: string;
    process_code: number;
    process_name: string;
    file_name: string;
    group_id: number;
  }[]> => {
    // 1. 收集所有不重複的料號
    const uniquePartNumbers = [...new Set(allResultData.map(r => r.partNumber))];
    
    // 2. 取得或建立所有料號對應的 group_id
    const partNumberToGroupId: Map<string, number> = new Map();
    for (const partNumber of uniquePartNumbers) {
      const groupId = await getOrCreateGroupId(partNumber);
      partNumberToGroupId.set(partNumber, groupId);
    }

    // 3. 建立完整的插入資料
    return allResultData.map((row, index) => {
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
        group_id: partNumberToGroupId.get(row.partNumber)!,
      };
    });
  };

  // 執行插入操作
  const executeInsert = async (data: typeof pendingInsertData, overwrittenCount: number = 0) => {
    const { error } = await supabase
      .from('sop_ocr_results')
      .insert(data);

    if (error) {
      throw error;
    }

    // 同步成功後，將檔案名稱加入已同步清單
    const syncedNames = [...new Set(data.map(d => d.file_name).filter(Boolean))];
    setSyncedFileNames(prev => {
      const newSet = new Set(prev);
      syncedNames.forEach(name => newSet.add(name));
      return newSet;
    });

    const message = overwrittenCount > 0
      ? `已將 ${data.length} 筆資料寫入資料庫（覆蓋 ${overwrittenCount} 個檔案）`
      : `已將 ${data.length} 筆資料寫入資料庫`;

    toast({
      title: '同步成功',
      description: message,
    });
    setHasSynced(true);
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
      const insertData = await prepareInsertData();
      
      // 檢查資料庫中是否已存在相同檔案名稱
      const fileNames = [...new Set(insertData.map(d => d.file_name).filter(n => n))];
      
      const { data: existingFiles } = await supabase
        .from('sop_ocr_results')
        .select('file_name')
        .in('file_name', fileNames);

      const existingFileNames = new Set(existingFiles?.map(f => f.file_name) || []);
      const duplicates = fileNames.filter(name => existingFileNames.has(name));

      // 如果有重複檔案
      if (duplicates.length > 0) {
        if (autoOverwrite) {
          // 自動覆蓋模式：直接刪除舊資料
          await supabase
            .from('sop_ocr_results')
            .delete()
            .in('file_name', duplicates);
          
          // 重置受影響群組的 downloaded 狀態
          const affectedPartNumbers = [...new Set(insertData.map(d => d.part_number))];
          await supabase
            .from('sop_groups')
            .update({ downloaded: false })
            .in('part_number', affectedPartNumbers);
          
          await executeInsert(insertData, duplicates.length);
        } else {
          // 詢問模式：顯示對話框
          setDuplicateFileNames(duplicates);
          setPendingInsertData(insertData);
          setShowDuplicateDialog(true);
          setIsSyncing(false);
          return;
        }
      } else {
        // 無重複，直接寫入
        await executeInsert(insertData);
      }
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

  // 使用者選擇「覆蓋」
  const handleOverwrite = async () => {
    setShowDuplicateDialog(false);
    setIsSyncing(true);

    try {
      // 刪除舊資料
      await supabase
        .from('sop_ocr_results')
        .delete()
        .in('file_name', duplicateFileNames);

      // 重置受影響群組的 downloaded 狀態
      const affectedPartNumbers = [...new Set(pendingInsertData.map(d => d.part_number))];
      await supabase
        .from('sop_groups')
        .update({ downloaded: false })
        .in('part_number', affectedPartNumbers);

      // 寫入全部資料
      await executeInsert(pendingInsertData, duplicateFileNames.length);
    } catch (error: any) {
      console.error('覆蓋同步失敗:', error);
      toast({
        title: '同步失敗',
        description: error.message || '寫入資料庫時發生錯誤',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // 使用者選擇「跳過」
  const handleSkip = async () => {
    setShowDuplicateDialog(false);
    setIsSyncing(true);

    try {
      const existingSet = new Set(duplicateFileNames);
      const newData = pendingInsertData.filter(row => !existingSet.has(row.file_name));
      
      if (newData.length > 0) {
        await executeInsert(newData);
        toast({
          title: '同步成功',
          description: `已寫入 ${newData.length} 筆資料，跳過 ${duplicateFileNames.length} 個重複檔案`,
        });
      } else {
        toast({
          title: '無新資料需同步',
          description: '所有檔案都已存在於資料庫中',
        });
      }
      setHasSynced(true);
    } catch (error: any) {
      console.error('同步失敗:', error);
      toast({
        title: '同步失敗',
        description: error.message || '寫入資料庫時發生錯誤',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // 自動同步：當有新完成的檔案（包括重試成功的）且沒有正在處理的檔案時自動觸發
  useEffect(() => {
    // 找出尚未同步的已完成檔案
    const currentFileNames = completedFiles.map(f => f.name);
    const hasUnSyncedFiles = currentFileNames.some(name => !syncedFileNames.has(name));

    const shouldAutoSync = 
      processingFiles.length === 0 &&   // 沒有正在處理的檔案
      allResultData.length > 0 &&       // 有資料可同步
      hasUnSyncedFiles &&               // 有未同步的已完成檔案
      !isSyncing &&                      // 沒有正在同步中
      !showDuplicateDialog;              // 沒有顯示重複對話框

    if (shouldAutoSync) {
      handleSyncToSupabase();
    }
  }, [processingFiles.length, completedFiles, allResultData.length, syncedFileNames, isSyncing, showDuplicateDialog]);

  // 當 files 清空時重置同步狀態
  useEffect(() => {
    if (files.length === 0) {
      setHasSynced(false);
      setSyncedFileNames(new Set());
    }
  }, [files.length]);

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
          {autoOverwrite && (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              自動覆蓋已啟用
            </span>
          )}
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

      {/* 重複檔案對話框 */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>偵測到重複檔案</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">以下檔案已存在於資料庫中：</p>
                <ul className="list-disc list-inside space-y-1 max-h-40 overflow-y-auto bg-muted/50 rounded-lg p-3">
                  {duplicateFileNames.map((name, idx) => (
                    <li key={idx} className="text-sm font-mono truncate">{name}</li>
                  ))}
                </ul>
                <p className="mt-3">請選擇處理方式：</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkip}>跳過這些檔案</AlertDialogCancel>
            <AlertDialogAction onClick={handleOverwrite}>覆蓋舊資料</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};
