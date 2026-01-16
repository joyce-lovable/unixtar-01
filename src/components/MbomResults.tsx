import { motion } from 'framer-motion';
import { Download, Database, FileSpreadsheet, Package, Wrench, Box, Files, Layers, CloudUpload, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MbomItem } from '@/lib/mbomParser';
import { BatchMbomFile } from '@/hooks/useMbomImport';

interface MbomResultsProps {
  files: BatchMbomFile[];
  selectedFile: BatchMbomFile | undefined;
  totalItems: number;
  totalMolds: number;
  totalSubAssemblies: number;
  completedCount: number;
  syncedCount: number;
  isSyncing: boolean;
  autoOverwrite: boolean;
  onSelectFile: (fileId: string) => void;
  onExportSingle: (fileId: string) => void;
  onExportAllMerged: () => void;
  onExportAllSeparate: () => void;
  onSetAutoOverwrite: (value: boolean) => void;
  onSyncSingle: (fileId: string, overwrite: boolean) => void;
  onSyncAll: () => void;
}

export function MbomResults({
  files,
  selectedFile,
  totalItems,
  totalMolds,
  totalSubAssemblies,
  completedCount,
  syncedCount,
  isSyncing,
  autoOverwrite,
  onSelectFile,
  onExportSingle,
  onExportAllMerged,
  onExportAllSeparate,
  onSetAutoOverwrite,
  onSyncSingle,
  onSyncAll,
}: MbomResultsProps) {
  const completedFiles = files.filter(f => f.status === 'completed' && f.parsedData);
  const unsyncedCount = completedFiles.filter(f => !f.synced).length;
  
  if (completedFiles.length === 0) return null;

  const data = selectedFile?.parsedData || [];
  const txtCount = data.filter(d => d.source === 'txt').length;
  const moldDataCount = data.filter(d => d.source === 'mold').length;
  const subCount = data.filter(d => d.source === 'sub').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 總覽資訊 */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-foreground">MBOM 批次解析結果</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <Files className="w-3 h-3 mr-1" />
              {completedCount} 個檔案
            </Badge>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
              <Layers className="w-3 h-3 mr-1" />
              {totalItems} 筆資料
            </Badge>
            <Badge variant="outline" className="bg-teal-500/10 text-teal-600 border-teal-500/30">
              <Wrench className="w-3 h-3 mr-1" />
              {totalMolds} 個模具
            </Badge>
            <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/30">
              <Box className="w-3 h-3 mr-1" />
              {totalSubAssemblies} 個半成品
            </Badge>
            {syncedCount > 0 && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                <Database className="w-3 h-3 mr-1" />
                {syncedCount} 已同步
              </Badge>
            )}
          </div>
        </div>

        {/* 匯出與同步按鈕 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Excel 匯出 */}
          {completedFiles.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="w-4 h-4 mr-2" />
                  下載全部 Excel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={onExportAllMerged}>
                  <Layers className="w-4 h-4 mr-2" />
                  合併為一個工作表
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportAllSeparate}>
                  <Files className="w-4 h-4 mr-2" />
                  每檔一個工作表
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {selectedFile && (
            <Button
              variant="outline"
              onClick={() => onExportSingle(selectedFile.id)}
              className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
            >
              <Download className="w-4 h-4 mr-2" />
              下載當前檔案
            </Button>
          )}

          {/* 分隔線 */}
          <div className="h-8 w-px bg-border hidden sm:block" />

          {/* 同步到資料庫 */}
          <Button
            onClick={onSyncAll}
            disabled={isSyncing || unsyncedCount === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CloudUpload className="w-4 h-4 mr-2" />
            )}
            同步至資料庫 {unsyncedCount > 0 && `(${unsyncedCount})`}
          </Button>

          {/* 自動覆蓋選項 */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoOverwrite"
              checked={autoOverwrite}
              onCheckedChange={(checked) => onSetAutoOverwrite(checked === true)}
            />
            <Label htmlFor="autoOverwrite" className="text-sm text-muted-foreground cursor-pointer">
              遇重複自動覆蓋
            </Label>
          </div>
        </div>
      </div>

      {/* 檔案選擇器 */}
      {completedFiles.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-2">
          <ScrollArea className="w-full">
            <Tabs value={selectedFile?.id || ''} onValueChange={onSelectFile}>
              <TabsList className="inline-flex h-auto gap-1 bg-transparent p-0">
                {completedFiles.map((file) => (
                  <TabsTrigger
                    key={file.id}
                    value={file.id}
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-4 py-2 rounded-lg"
                  >
                    <span className="truncate max-w-[150px]">{file.mainPartNumber || file.name}</span>
                    <Badge variant="secondary" className="ml-2 bg-white/20 text-inherit">
                      {file.parsedData?.length || 0}
                    </Badge>
                    {file.synced && (
                      <CheckCircle2 className="w-3 h-3 ml-1 text-green-300" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* 選中檔案的詳細資訊 */}
      {selectedFile && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-muted-foreground">成品料號:</span>
              <span className="font-medium text-foreground">{selectedFile.mainPartNumber}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Box className="w-4 h-4 text-amber-500" />
              <span className="text-muted-foreground">品名:</span>
              <span className="font-medium text-foreground">{selectedFile.customerPartName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Wrench className="w-4 h-4 text-teal-500" />
              <span className="text-muted-foreground">模具數量:</span>
              <span className="font-medium text-foreground">{selectedFile.moldCount}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Database className="w-4 h-4 text-violet-500" />
              <span className="text-muted-foreground">資料來源:</span>
              <span className="font-medium text-foreground">
                TXT({txtCount}) + 模具({moldDataCount}) + 半成品({subCount})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 資料表格 */}
      {data.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ScrollArea className="w-full">
            <div className="min-w-[1400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[120px] font-semibold">客戶料號品名</TableHead>
                    <TableHead className="w-[140px] font-semibold">主件料號 (PK)</TableHead>
                    <TableHead className="w-[80px] font-semibold text-center">生產工序</TableHead>
                    <TableHead className="w-[80px] font-semibold text-center">CAD項次</TableHead>
                    <TableHead className="w-[160px] font-semibold">元件料號 (PK)</TableHead>
                    <TableHead className="w-[80px] font-semibold text-center">用料類別</TableHead>
                    <TableHead className="w-[100px] font-semibold text-right">組成用量</TableHead>
                    <TableHead className="w-[80px] font-semibold text-center">單位</TableHead>
                    <TableHead className="w-[100px] font-semibold text-center">代用品</TableHead>
                    <TableHead className="w-[80px] font-semibold text-center">用料素質</TableHead>
                    <TableHead className="min-w-[200px] font-semibold">備註說明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item, index) => (
                    <TableRow 
                      key={index}
                      className={
                        item.source === 'mold' 
                          ? 'bg-teal-500/5' 
                          : item.source === 'sub'
                          ? 'bg-violet-500/5'
                          : ''
                      }
                    >
                      <TableCell className="font-medium">{item.customerPartName}</TableCell>
                      <TableCell className="font-mono text-sm">{item.mainPartNumber}</TableCell>
                      <TableCell className="text-center">{item.productionProcess}</TableCell>
                      <TableCell className="text-center font-medium">{item.cadSequence}</TableCell>
                      <TableCell className="font-mono text-sm">{item.componentPartNumber}</TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline" 
                          className={
                            item.materialCategory === '4' 
                              ? 'bg-teal-500/10 text-teal-600 border-teal-500/30' 
                              : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                          }
                        >
                          {item.materialCategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                      <TableCell className="text-center">{item.unit}</TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={
                            item.hasSubstitute === 'Y'
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {item.hasSubstitute}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{item.materialQuality}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">
                        {item.remark}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* 圖例說明 */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-card border border-border"></div>
          <span>TXT 主產品零件</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-teal-500/20 border border-teal-500/30"></div>
          <span>模具資料 (Supabase)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-violet-500/20 border border-violet-500/30"></div>
          <span>半成品零件</span>
        </div>
      </div>
    </motion.div>
  );
}
