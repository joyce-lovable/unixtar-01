import { motion } from 'framer-motion';
import { Download, Database, FileSpreadsheet, Package, Wrench, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MbomItem } from '@/lib/mbomParser';

interface MbomResultsProps {
  data: MbomItem[];
  fileName: string | null;
  mainPartNumber: string | null;
  customerPartName: string | null;
  moldCount: number;
  onExportExcel: () => void;
}

export function MbomResults({
  data,
  fileName,
  mainPartNumber,
  customerPartName,
  moldCount,
  onExportExcel,
}: MbomResultsProps) {
  if (!data || data.length === 0) return null;

  const txtCount = data.filter(d => d.source === 'txt').length;
  const moldDataCount = data.filter(d => d.source === 'mold').length;
  const subCount = data.filter(d => d.source === 'sub').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 摘要資訊 */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-foreground">MBOM 解析結果</span>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            {data.length} 筆資料
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-blue-500" />
            <span className="text-muted-foreground">成品料號:</span>
            <span className="font-medium text-foreground">{mainPartNumber}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Box className="w-4 h-4 text-amber-500" />
            <span className="text-muted-foreground">品名:</span>
            <span className="font-medium text-foreground">{customerPartName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Wrench className="w-4 h-4 text-teal-500" />
            <span className="text-muted-foreground">模具數量:</span>
            <span className="font-medium text-foreground">{moldCount}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Database className="w-4 h-4 text-violet-500" />
            <span className="text-muted-foreground">資料來源:</span>
            <span className="font-medium text-foreground">
              TXT({txtCount}) + 模具({moldDataCount}) + 半成品({subCount})
            </span>
          </div>
        </div>

        {/* 匯出按鈕 */}
        <Button
          onClick={onExportExcel}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          下載 Excel 檔案
        </Button>
      </div>

      {/* 資料表格 */}
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
