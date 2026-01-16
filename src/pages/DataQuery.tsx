import { useState } from 'react';
import { motion } from 'framer-motion';
import { Scan, FileText, ListChecks, FileSpreadsheet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MainNavigation from '@/components/MainNavigation';
import MoldDataTable from '@/components/data-query/MoldDataTable';
import SopDataTable from '@/components/data-query/SopDataTable';
import MbomDataTable from '@/components/data-query/MbomDataTable';

const DataQuery = () => {
  const [activeTab, setActiveTab] = useState('mold');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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
            <MainNavigation />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              歷史資料查詢
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              查詢、管理及匯出已上傳處理的歷史資料
            </p>
          </motion.div>

          {/* Data Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger 
                  value="mold" 
                  className="gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                >
                  <FileText className="w-4 h-4" />
                  模具編號
                </TabsTrigger>
                <TabsTrigger 
                  value="sop" 
                  className="gap-2 data-[state=active]:bg-amber-600 data-[state=active]:text-white"
                >
                  <ListChecks className="w-4 h-4" />
                  SOP製程編碼
                </TabsTrigger>
                <TabsTrigger 
                  value="mbom" 
                  className="gap-2 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  MBOM資料
                </TabsTrigger>
              </TabsList>

              <TabsContent value="mold" className="mt-0">
                <MoldDataTable />
              </TabsContent>

              <TabsContent value="sop" className="mt-0">
                <SopDataTable />
              </TabsContent>

              <TabsContent value="mbom" className="mt-0">
                <MbomDataTable />
              </TabsContent>
            </Tabs>
          </motion.div>
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

export default DataQuery;
