import { useState } from 'react';
import { Download, FileSpreadsheet, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import type { DailyCheckFile } from '@/hooks/useDailyCheck';

interface DailyCheckResultsProps {
  files: DailyCheckFile[];
}

export const DailyCheckResults = ({ files }: DailyCheckResultsProps) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const completedFiles = files.filter(f => f.status === 'completed' && f.result?.parsedData);

  if (completedFiles.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 過濾每行中的空白欄位
  const filterEmptyCells = (data: string[][]): string[][] => {
    return data.map(row => row.filter(cell => cell && cell.trim() !== ''));
  };

  const downloadExcel = (file: DailyCheckFile) => {
    if (!file.result?.parsedData) return;

    // 過濾空白欄位
    const cleanedData = filterEmptyCells(file.result.parsedData);
    
    const ws = XLSX.utils.aoa_to_sheet(cleanedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    // 設定欄寬
    const maxCols = Math.max(...cleanedData.map(row => row.length));
    ws['!cols'] = Array(maxCols).fill({ wch: 15 });

    const fileName = file.name.replace(/\.[^.]+$/, '') + '.xlsx';
    XLSX.writeFile(wb, fileName);
  };

  const downloadAllExcel = () => {
    const wb = XLSX.utils.book_new();

    completedFiles.forEach((file, idx) => {
      if (!file.result?.parsedData) return;
      
      // 過濾空白欄位
      const cleanedData = filterEmptyCells(file.result.parsedData);
      
      const sheetName = file.name.replace(/\.[^.]+$/, '').slice(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(cleanedData);
      
      // 設定欄寬
      const maxCols = Math.max(...cleanedData.map(row => row.length));
      ws['!cols'] = Array(maxCols).fill({ wch: 15 });
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName || `Sheet${idx + 1}`);
    });

    XLSX.writeFile(wb, `daily_check_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          解析結果 ({completedFiles.length} 個檔案)
        </h3>
        {completedFiles.length > 1 && (
          <Button
            onClick={downloadAllExcel}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            <Download className="w-4 h-4" />
            下載全部 Excel
          </Button>
        )}
      </div>

      {/* File Results */}
      {completedFiles.map((file) => {
        const isExpanded = expandedFiles.has(file.id);
        const data = file.result?.parsedData || [];
        const previewRows = data.slice(0, 3);

        return (
          <Card key={file.id} className="border-violet-200 dark:border-violet-800">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-violet-600" />
                  <CardTitle className="text-base font-medium">{file.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    ({data.length} 列)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleExpand(file.id)}
                    className="gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    {isExpanded ? '收合' : '預覽'}
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => downloadExcel(file)}
                    className="bg-violet-600 hover:bg-violet-700 text-white gap-1"
                  >
                    <Download className="w-4 h-4" />
                    下載 Excel
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Preview/Full Table */}
            <CardContent className="pt-0">
              <div className={cn(
                "rounded-lg border overflow-hidden",
                isExpanded ? "max-h-96 overflow-y-auto" : ""
              )}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-violet-50 dark:bg-violet-950/30">
                      <TableHead className="w-12 text-center font-semibold">#</TableHead>
                      {data[0]?.map((_, colIdx) => (
                        <TableHead key={colIdx} className="font-semibold">
                          {String.fromCharCode(65 + colIdx)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(isExpanded ? data : previewRows).map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        <TableCell className="text-center text-muted-foreground">
                          {rowIdx + 1}
                        </TableCell>
                        {row.map((cell, colIdx) => (
                          <TableCell key={colIdx} className="font-mono text-sm">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {!isExpanded && data.length > 3 && (
                <p className="text-center text-sm text-muted-foreground mt-2">
                  還有 {data.length - 3} 列資料...
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
