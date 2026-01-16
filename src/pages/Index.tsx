import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Scan, Zap, Shield, Globe, HardDrive, Cloud, FileText, ListChecks, RotateCw, ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { BatchFileUpload } from '@/components/BatchFileUpload';
import { GoogleDrivePicker } from '@/components/GoogleDrivePicker';
import { BatchOCRResults } from '@/components/BatchOCRResults';
import { MakeWebhookResults } from '@/components/MakeWebhookResults';
import { OrientationDetectResults } from '@/components/OrientationDetectResults';
import { DailyCheckUpload } from '@/components/DailyCheckUpload';
import { DailyCheckResults } from '@/components/DailyCheckResults';
import { MbomUpload } from '@/components/MbomUpload';
import { MbomResults } from '@/components/MbomResults';
import { useBatchOCR } from '@/hooks/useBatchOCR';
import { useMakeWebhook } from '@/hooks/useMakeWebhook';
import { useOrientationDetect } from '@/hooks/useOrientationDetect';
import { useDailyCheck } from '@/hooks/useDailyCheck';
import { useMbomImport } from '@/hooks/useMbomImport';
const Index = () => {
  // 工程圖模式 hook
  const moldOCR = useBatchOCR();
  
  // SOP 模式 hook (發送至 Make.com)
  const sopWebhook = useMakeWebhook();

  // 方向偵測模式 hook
  const orientationDetect = useOrientationDetect();

  // 每日檢核模式 hook
  const dailyCheck = useDailyCheck();

  // MBOM 導入 hook
  const mbomImport = useMbomImport();

  const [activeTab, setActiveTab] = useState('local');
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [functionMode, setFunctionMode] = useState<'mold' | 'sop' | 'orientation' | 'dailycheck' | 'mbom'>('mold');

  // 根據模式選擇對應的 hook
  const getCurrentOCR = () => {
    switch (functionMode) {
      case 'mold': return moldOCR;
      case 'sop': return sopWebhook;
      case 'orientation': return orientationDetect;
      case 'dailycheck': return dailyCheck;
      case 'mbom': return null; // MBOM 有自己的處理邏輯
      default: return moldOCR;
    }
  };
  const currentOCR = getCurrentOCR();
  const { 
    files = [], 
    addFiles = () => {}, 
    processAllFiles = () => {}, 
    retryFile = () => {},
    removeFile = () => {}, 
    clearAll = () => {}, 
    isProcessing = false, 
    completedCount = 0 
  } = currentOCR || {};
  const currentProcessingIndex = currentOCR && 'currentProcessingIndex' in currentOCR ? currentOCR.currentProcessingIndex : -1;

  // 頁面載入時自動關閉 Lovable badge
  useEffect(() => {
    const closeBadge = () => {
      const closeBtn = document.getElementById('lovable-badge-close');
      if (closeBtn) closeBtn.click();
    };
    
    const timers = [0, 100, 300, 500, 1000, 2000].map(delay => 
      setTimeout(closeBadge, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleFilesSelect = useCallback((newFiles: File[]) => {
    addFiles(newFiles);
  }, [addFiles]);

  const handleDriveFilesProcessed = useCallback((processedFiles: any[]) => {
    setDriveFiles(processedFiles);
  }, []);

  const features = [
    {
      icon: Zap,
      title: 'AI 智能辨識',
      description: '採用多功能智慧引擎，精準辨識特殊符號',
    },
    {
      icon: Globe,
      title: '多語言支援',
      description: '支援繁體中文、簡體中文、英文辨識',
    },
    {
      icon: Shield,
      title: '批次處理',
      description: '支援多檔案同時上傳，批次導出 Excel',
    },
  ];

  const hasResults = completedCount > 0 || driveFiles.some(f => f.status === 'completed') || mbomImport.completedCount > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-glow"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Scan className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-foreground">Unixtar 智慧辨識 v 1.4</h1>
              <p className="text-xs text-muted-foreground">精準提取 PDF 與圖片文字 (2026/1/16 修正版)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Unixtar 智慧轉換辨識系統
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              上傳 PDF 或圖片，即刻提取精準文字內容。
              支援批次處理與 Google Drive 雲端整合。
            </p>
          </motion.div>

          {/* Upload Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            {/* Function Mode Tabs - 頂層功能選擇 */}
            <div className="mb-8">
              {/* 第一排：工程圖轉模具編號 */}
              <div className="flex gap-4 justify-start flex-wrap mb-4">
                {/* 工程圖模式 - 藍色系 */}
                <button
                  onClick={() => setFunctionMode('mold')}
                  className={`
                    relative flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg
                    transition-all duration-300 border-2
                    ${functionMode === 'mold' 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/30 scale-105' 
                      : 'bg-card text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'}
                  `}
                >
                  <FileText className={`w-5 h-5 ${functionMode === 'mold' ? 'text-white' : 'text-blue-500'}`} />
                  <span>工程圖轉模具編號</span>
                  {functionMode === 'mold' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-300 rounded-full animate-pulse" />
                  )}
                </button>
                {/* SOP 模式 - 橘色/琥珀色系 */}
                <button
                  onClick={() => setFunctionMode('sop')}
                  className={`
                    relative flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg
                    transition-all duration-300 border-2
                    ${functionMode === 'sop' 
                      ? 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-600/30 scale-105' 
                      : 'bg-card text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600'}
                  `}
                >
                  <ListChecks className={`w-5 h-5 ${functionMode === 'sop' ? 'text-white' : 'text-amber-500'}`} />
                  <span>SOP轉製程及編碼</span>
                  {functionMode === 'sop' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-300 rounded-full animate-pulse" />
                  )}
                </button>
                {/* PDF 方向偵測模式 - 青綠色系 */}
                <button
                  onClick={() => setFunctionMode('orientation')}
                  className={`
                    relative flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg
                    transition-all duration-300 border-2
                    ${functionMode === 'orientation' 
                      ? 'bg-teal-600 text-white border-teal-600 shadow-lg shadow-teal-600/30 scale-105' 
                      : 'bg-card text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600'}
                  `}
                >
                  <RotateCw className={`w-5 h-5 ${functionMode === 'orientation' ? 'text-white' : 'text-teal-500'}`} />
                  <span>PDF圖向偵測與處理</span>
                  {functionMode === 'orientation' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-teal-300 rounded-full animate-pulse" />
                  )}
                </button>
              </div>

              {/* 第二排：每日檢核資料系統 + 系統MBOM導入 */}
              <div className="flex gap-4 justify-start flex-wrap">
                {/* 每日檢核模式 - 紫色系 */}
                <button
                  onClick={() => setFunctionMode('dailycheck')}
                  className={`
                    relative flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg
                    transition-all duration-300 border-2
                    ${functionMode === 'dailycheck' 
                      ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/30 scale-105' 
                      : 'bg-card text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600'}
                  `}
                >
                  <ClipboardCheck className={`w-5 h-5 ${functionMode === 'dailycheck' ? 'text-white' : 'text-violet-500'}`} />
                  <span>每日檢核資料系統</span>
                  {functionMode === 'dailycheck' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-violet-300 rounded-full animate-pulse" />
                  )}
                </button>

                {/* MBOM 導入模式 - 綠色系 */}
                <button
                  onClick={() => setFunctionMode('mbom')}
                  className={`
                    relative flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-lg
                    transition-all duration-300 border-2
                    ${functionMode === 'mbom' 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/30 scale-105' 
                      : 'bg-card text-muted-foreground border-border hover:border-emerald-400 hover:text-emerald-600'}
                  `}
                >
                  <FileSpreadsheet className={`w-5 h-5 ${functionMode === 'mbom' ? 'text-white' : 'text-emerald-500'}`} />
                  <span>系統MBOM導入</span>
                  {functionMode === 'mbom' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-300 rounded-full animate-pulse" />
                  )}
                </button>
              </div>

              <p className="text-center text-sm text-muted-foreground mt-3">
                請選擇要進行的作業模式
              </p>
            </div>

            {/* Upload Source Tabs - 非 MBOM 模式使用 */}
            {functionMode === 'mbom' ? (
              /* MBOM 模式專用介面 */
              <div className="space-y-6">
                <MbomUpload
                  files={mbomImport.files}
                  isProcessing={mbomImport.isProcessing}
                  currentProcessingIndex={mbomImport.currentProcessingIndex}
                  onFilesSelect={mbomImport.addFiles}
                  onProcess={mbomImport.processAllFiles}
                  onRemoveFile={mbomImport.removeFile}
                  onClear={mbomImport.clearAll}
                />
              </div>
            ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={cn(
                "grid w-full mb-6",
                functionMode === 'orientation' ? "grid-cols-1" : "grid-cols-2",
                functionMode === 'mold' && "data-[state=active]:bg-blue-600",
                functionMode === 'sop' && "data-[state=active]:bg-amber-600",
                functionMode === 'orientation' && "data-[state=active]:bg-teal-600",
                functionMode === 'dailycheck' && "data-[state=active]:bg-violet-600"
              )}>
                <TabsTrigger 
                  value="local" 
                  className={cn(
                    "gap-2",
                    functionMode === 'mold' && "data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                    functionMode === 'sop' && "data-[state=active]:bg-amber-600 data-[state=active]:text-white",
                    functionMode === 'orientation' && "data-[state=active]:bg-teal-600 data-[state=active]:text-white",
                    functionMode === 'dailycheck' && "data-[state=active]:bg-violet-600 data-[state=active]:text-white"
                  )}
                >
                  <HardDrive className="w-4 h-4" />
                  本地上傳
                </TabsTrigger>
                {functionMode !== 'orientation' && (
                  <TabsTrigger 
                    value="drive" 
                    className={cn(
                      "gap-2",
                      functionMode === 'mold' && "data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                      functionMode === 'sop' && "data-[state=active]:bg-amber-600 data-[state=active]:text-white",
                      functionMode === 'dailycheck' && "data-[state=active]:bg-violet-600 data-[state=active]:text-white"
                    )}
                  >
                    <Cloud className="w-4 h-4" />
                    Google Drive
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="local" className="mt-0">
                {/* 方向偵測模式的文件類型選擇器 */}
                {functionMode === 'orientation' && (
                  <div className="mb-6 p-4 rounded-xl bg-card border border-border">
                    <p className="text-sm font-medium text-foreground mb-3">選擇處理的文件類型：</p>
                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={() => orientationDetect.setDocumentType('mold')}
                        className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
                          transition-all duration-200 border-2
                          ${orientationDetect.documentType === 'mold'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-background text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600'}
                        `}
                      >
                        <FileText className={`w-4 h-4 ${orientationDetect.documentType === 'mold' ? 'text-white' : 'text-blue-500'}`} />
                        工程圖轉模具編號
                        <span className="text-xs opacity-75">(非正向 → 270°)</span>
                      </button>
                      <button
                        onClick={() => orientationDetect.setDocumentType('sop')}
                        className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm
                          transition-all duration-200 border-2
                          ${orientationDetect.documentType === 'sop'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                            : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-600'}
                        `}
                      >
                        <ListChecks className={`w-4 h-4 ${orientationDetect.documentType === 'sop' ? 'text-white' : 'text-amber-500'}`} />
                        SOP轉製程及編碼
                        <span className="text-xs opacity-75">(非正向 → 180°)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 每日檢核模式使用專屬上傳組件 */}
                {functionMode === 'dailycheck' ? (
                  <DailyCheckUpload
                    files={dailyCheck.files}
                    onFilesSelect={handleFilesSelect}
                    onRemoveFile={removeFile}
                    onProcess={processAllFiles}
                    onRetryFile={retryFile}
                    onClear={clearAll}
                    isProcessing={isProcessing}
                    currentProcessingIndex={currentProcessingIndex}
                  />
                ) : (
                  <BatchFileUpload
                    files={files as any}
                    onFilesSelect={handleFilesSelect}
                    onRemoveFile={removeFile}
                    onProcess={processAllFiles}
                    onRetryFile={retryFile}
                    onClear={clearAll}
                    isProcessing={isProcessing}
                    currentProcessingIndex={currentProcessingIndex}
                    mode={functionMode === 'sop' ? 'make' : functionMode === 'orientation' ? 'orientation' : 'ocr'}
                    colorScheme={functionMode === 'sop' ? 'amber' : functionMode === 'orientation' ? 'teal' : 'blue'}
                  />
                )}
              </TabsContent>

              {functionMode !== 'orientation' && (
                <TabsContent value="drive" className="mt-0">
                  {functionMode === 'dailycheck' ? (
                    <GoogleDrivePicker 
                      onFilesProcessed={handleDriveFilesProcessed} 
                      mode="ocr"
                      colorScheme="violet"
                    />
                  ) : (
                    <GoogleDrivePicker 
                      onFilesProcessed={handleDriveFilesProcessed} 
                      mode={functionMode === 'sop' ? 'make' : 'ocr'}
                      colorScheme={functionMode === 'sop' ? 'amber' : 'blue'}
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>
            )}
          </motion.div>

          {/* Results - MBOM */}
          {functionMode === 'mbom' && mbomImport.completedCount > 0 && (
            <div className="mb-8">
              <MbomResults
                files={mbomImport.files}
                selectedFile={mbomImport.selectedFile}
                totalItems={mbomImport.totalItems}
                totalMolds={mbomImport.totalMolds}
                completedCount={mbomImport.completedCount}
                onSelectFile={mbomImport.selectFile}
                onExportSingle={mbomImport.exportSingleExcel}
                onExportAllMerged={mbomImport.exportAllMerged}
                onExportAllSeparate={mbomImport.exportAllSeparate}
              />
            </div>
          )}

          {/* Results - Local Upload */}
          {functionMode !== 'mbom' && activeTab === 'local' && completedCount > 0 && (
            <div className="mb-8">
              {functionMode === 'mold' && (
                <BatchOCRResults files={moldOCR.files} />
              )}
              {functionMode === 'sop' && (
                <MakeWebhookResults files={sopWebhook.files} />
              )}
              {functionMode === 'orientation' && (
                <OrientationDetectResults files={orientationDetect.files} />
              )}
              {functionMode === 'dailycheck' && (
                <DailyCheckResults files={dailyCheck.files} />
              )}
            </div>
          )}

          {/* Results - Google Drive */}
          {activeTab === 'drive' && driveFiles.filter(f => f.status === 'completed').length > 0 && (
            <div className="mb-8">
              {functionMode === 'mold' ? (
                <BatchOCRResults files={driveFiles.filter(f => f.status === 'completed').map(f => ({
                  id: f.id,
                  name: f.name,
                  status: 'completed' as const,
                  result: f.result ? { text: f.result.text, confidence: f.result.confidence } : undefined,
                }))} />
              ) : (
                <MakeWebhookResults files={driveFiles.filter(f => f.status === 'completed').map(f => ({
                  id: f.id,
                  file: null as any,
                  name: f.name,
                  size: 0,
                  status: 'completed' as const,
                  pages: [{
                    id: `${f.id}-page-1`,
                    pageNumber: 1,
                    status: 'completed' as const,
                    result: f.result?.text,
                  }],
                }))} />
              )}
            </div>
          )}

          {/* Features */}
          {!hasResults && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  className="p-6 rounded-2xl bg-card border border-border shadow-soft hover:shadow-card transition-shadow"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-violet-600">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>採用多功能智慧引擎 · 精準辨識技術規格文件</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
