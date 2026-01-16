import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, CheckCircle, ChevronDown, ChevronUp, Copy, Check, Clock, RefreshCw, RotateCw, Image, Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { parseMoldEntries, type ParsedData } from '@/lib/moldParser';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
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
  autoOverwrite?: boolean;  // 從外部傳入的自動覆蓋設定
  syncedFileNames: Set<string>;           // 從 hook 傳入的已同步檔案清單
  markFilesAsSynced: (names: string[]) => void;  // 從 hook 傳入的標記方法
}

interface FileWithParsedData extends OCRResultFile {
  parsedData: ParsedData;
}

export const BatchOCRResults = ({ 
  files, 
  autoOverwrite = false,
  syncedFileNames,
  markFilesAsSynced,
}: BatchOCRResultsProps) => {
  const { toast } = useToast();
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  
  // 覆蓋功能狀態（autoOverwrite 現在從 props 傳入）
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
  const [pendingInsertData, setPendingInsertData] = useState<{ seq_number: number; file_name: string; part_name: string; mold_number: string; group_id: number | null }[]>([]);

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

  // 取得或建立群組 ID
  const getOrCreateGroupId = async (partName: string): Promise<number | null> => {
    if (!partName) return null;
    
    // 先查詢是否已存在
    const { data: existing } = await supabase
      .from('mold_groups')
      .select('group_id')
      .eq('part_name', partName)
      .maybeSingle();
    
    if (existing) return existing.group_id;
    
    // 不存在則建立新群組
    const { data: newGroup, error } = await supabase
      .from('mold_groups')
      .insert({ part_name: partName })
      .select('group_id')
      .single();
    
    if (error) {
      console.error('Error creating mold group:', error);
      return null;
    }
    
    return newGroup.group_id;
  };

  // 準備要插入的資料（含 group_id）
  const prepareInsertData = async () => {
    const insertData: { seq_number: number; file_name: string; part_name: string; mold_number: string; group_id: number | null }[] = [];
    let seqNumber = 1;

    // 收集所有不重複的 part_name 並取得 group_id
    const partNames = [...new Set(completedFiles.map(f => f.parsedData.partName || '').filter(Boolean))];
    const groupIdMap = new Map<string, number | null>();
    
    for (const partName of partNames) {
      const groupId = await getOrCreateGroupId(partName);
      groupIdMap.set(partName, groupId);
    }

    completedFiles.forEach(file => {
      const allMolds = file.parsedData.molds.flatMap(e => e.expanded);
      const currentSeq = seqNumber;
      const partName = file.parsedData.partName || '';
      const groupId = groupIdMap.get(partName) || null;
      seqNumber++;

      if (allMolds.length > 0) {
        allMolds.forEach(mold => {
          insertData.push({
            seq_number: currentSeq,
            file_name: file.name,
            part_name: partName,
            mold_number: mold,
            group_id: groupId,
          });
        });
      } else {
        insertData.push({
          seq_number: currentSeq,
          file_name: file.name,
          part_name: partName,
          mold_number: '',
          group_id: groupId,
        });
      }
    });

    return insertData;
  };

  // 執行插入操作
  const executeInsert = async (data: typeof pendingInsertData, overwrittenCount: number = 0) => {
    const { error } = await supabase
      .from('mold_ocr_results')
      .insert(data);

    if (error) {
      throw error;
    }

    // 同步成功後，將檔案名稱加入已同步清單（使用 props 的方法）
    const syncedNames = [...new Set(data.map(d => d.file_name))];
    markFilesAsSynced(syncedNames);

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
    if (completedFiles.length === 0) {
      toast({
        title: '尚無可同步資料',
        description: '請確認有完成的辨識結果',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);

    try {
      // 取得所有待同步的檔案名稱
      const fileNames = [...new Set(completedFiles.map(f => f.name))];

      // 檢查資料庫中是否已存在相同檔案名稱
      const { data: existingFiles } = await supabase
        .from('mold_ocr_results')
        .select('file_name')
        .in('file_name', fileNames);

      const existingFileNames = new Set(existingFiles?.map(f => f.file_name) || []);
      const duplicates = fileNames.filter(name => existingFileNames.has(name));
      const insertData = await prepareInsertData();

      // 如果有重複檔案
      if (duplicates.length > 0) {
        if (autoOverwrite) {
          // 自動覆蓋模式：直接刪除舊資料
          await supabase
            .from('mold_ocr_results')
            .delete()
            .in('file_name', duplicates);
          
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
        .from('mold_ocr_results')
        .delete()
        .in('file_name', duplicateFileNames);

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

  // 計算處理中的檔案
  const processingFiles = files.filter(f => f.status === 'processing' || f.status === 'pending');

  // 自動同步：當有新完成的檔案（包括重試成功的）且沒有正在處理的檔案時自動觸發
  useEffect(() => {
    // 找出尚未同步的已完成檔案
    const unSyncedFiles = completedFiles.filter(f => !syncedFileNames.has(f.name));

    const shouldAutoSync = 
      processingFiles.length === 0 &&   // 沒有正在處理的檔案
      unSyncedFiles.length > 0 &&       // 有未同步的已完成檔案
      !isSyncing &&                      // 沒有正在同步中
      !showDuplicateDialog;              // 沒有顯示重複對話框

    if (shouldAutoSync) {
      handleSyncToSupabase();
    }
  }, [processingFiles.length, completedFiles, syncedFileNames, isSyncing, showDuplicateDialog]);

  // 當 files 清空時重置 hasSynced（syncedFileNames 已在 hook 層級管理）
  useEffect(() => {
    if (files.length === 0) {
      setHasSynced(false);
    }
  }, [files.length]);

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
        <div className="flex items-center gap-2 flex-wrap">
          {hasSynced && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              已同步
            </span>
          )}
          {autoOverwrite && (
            <span className="text-xs text-blue-500 flex items-center gap-1">
              自動覆蓋已啟用
            </span>
          )}
          <Button
            onClick={handleSyncToSupabase}
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={completedFiles.length === 0 || isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {isSyncing ? '同步中...' : '同步到資料庫'}
          </Button>
          <Button onClick={handleDownloadExcel} className="gap-2">
            <Download className="w-4 h-4" />
            下載全部 Excel
          </Button>
        </div>
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
