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
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database, FileText } from 'lucide-react';
import { DuplicateInfo } from '@/hooks/useMbomImport';

interface MbomDuplicateDialogProps {
  open: boolean;
  duplicates: DuplicateInfo[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function MbomDuplicateDialog({
  open,
  duplicates,
  onConfirm,
  onCancel,
}: MbomDuplicateDialogProps) {
  const totalExisting = duplicates.reduce((sum, d) => sum + d.existingCount, 0);

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            偵測到重複的客戶料號品名
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                以下客戶料號品名在資料庫中已存在資料，是否要覆蓋舊資料？
              </p>
              
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {duplicates.map((dup) => (
                  <div 
                    key={dup.fileId}
                    className="flex items-center justify-between gap-2 p-2 rounded-md bg-background"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {dup.customerPartName}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0">
                      <Database className="w-3 h-3 mr-1" />
                      {dup.existingCount} 筆
                    </Badge>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                共 <span className="font-semibold text-foreground">{duplicates.length}</span> 個客戶料號、
                <span className="font-semibold text-foreground">{totalExisting}</span> 筆舊資料將被刪除並更新。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            取消（跳過）
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            確認覆蓋
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
