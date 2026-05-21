window.Module_Backup = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useRef } = React;

    // ==========================================
    // 1. حالات الشاشة (State)
    // ==========================================
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("");
    
    // إحصائيات قاعدة البيانات
    const [dbStats, setDbStats] = useState({
        totalIncome: 0,
        totalOrders: 0,
        menuItemsCount: 0,
        usersCount: 0,
        restaurantName: "جاري التحميل...",
        lastBackup: localStorage.getItem(`Mentra_${window.db.name}_LastBackup`) || "لم يتم عمل نسخة بعد"
    });

    const fileInputRef = useRef(null);
    const dbName = window.db.name;

    // ==========================================
    // 2. تحليل قاعدة البيانات وجلب الإحصائيات الشاملة
    // ==========================================
    useEffect(() => {
        const analyzeDatabase = async () => {
            try {
                const info = await window.db.restaurant_info.toCollection().first();
                const ordersCount = await window.db.orders.count();
                const itemsCount = await window.db.menu_items.count();
                const usersCount = await window.db.users.count();

                let income = 0;
                await window.db.accounting.where('type').equals('income').each(record => {
                    income += record.amount;
                });

                setDbStats(prev => ({
                    ...prev,
                    restaurantName: info?.restaurant_name || "مطعم غير معروف",
                    totalOrders: ordersCount,
                    menuItemsCount: itemsCount,
                    usersCount: usersCount,
                    totalIncome: income
                }));
            } catch (error) {
                console.error("خطأ في تحليل البيانات:", error);
            }
        };

        analyzeDatabase();
    }, []);

    // ==========================================
    // 3. تصدير البيانات (Backup) - تقنية Blob للملفات الكبيرة
    // ==========================================
    const handleExport = async () => {
        setIsLoading(true);
        setLoadingText("جاري تجميع وضغط البيانات، الرجاء الانتظار...");

        setTimeout(async () => {
            try {
                const tables = ['restaurant_info', 'users', 'categories', 'menu_items', 'tables', 'orders', 'order_items', 'accounting'];
                
                let backupData = {
                    mentra_signature: "MENTRA_RESTAURANT_LITE_V1",
                    dbName: dbName,
                    restaurant_name: dbStats.restaurantName,
                    generated_at: new Date().toISOString(),
                    data: {}
                };

                for (let table of tables) {
                    backupData.data[table] = await window.db.table(table).toArray();
                }

                const jsonString = JSON.stringify(backupData);
                const blob = new Blob([jsonString], { type: "application/json" });
                const downloadUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `Mentra_Backup_${dbStats.restaurantName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl); 

                const nowStr = new Date().toLocaleString('ar-EG');
                localStorage.setItem(`Mentra_${dbName}_LastBackup`, nowStr);
                setDbStats(prev => ({ ...prev, lastBackup: nowStr }));

                showToast("تم استخراج النسخة الاحتياطية بنجاح!", "success");
            } catch (error) {
                console.error("Export Error:", error);
                showToast("حدث خطأ أثناء استخراج البيانات", "error");
            } finally {
                setIsLoading(false);
            }
        }, 100);
    };

    // ==========================================
    // 4. استيراد البيانات (Restore) - مع التحقق الصارم
    // ==========================================
    const triggerImport = () => {
        if(confirm("تنبيه خطير: استعادة النسخة الاحتياطية ستقوم بمسح كافة الفواتير والمنيو الموجودة حالياً وإحلال بيانات الملف محلها. هل أنت متأكد؟")) {
            fileInputRef.current.click();
        }
    };

    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsLoading(true);
        setLoadingText("جاري قراءة واستعادة البيانات، لا تقم بإغلاق المتصفح...");

        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const importedJson = JSON.parse(e.target.result);

                if (importedJson.mentra_signature !== "MENTRA_RESTAURANT_LITE_V1") {
                    throw new Error("هذا الملف ليس نسخة احتياطية صالحة لنظام Mentra");
                }
                
                if (importedJson.dbName !== dbName && !confirm(`هذا الملف يخص مطعم (${importedJson.restaurant_name}) وأنت الآن في مطعم (${dbStats.restaurantName}). هل تريد دمج واستبدال البيانات على أي حال؟`)) {
                    throw new Error("تم إلغاء الاستعادة");
                }

                const tablesToRestore = Object.keys(importedJson.data);
                const actualTables = window.db.tables.map(t => t.name);

                await window.db.transaction('rw', actualTables, async () => {
                    for (let tableName of tablesToRestore) {
                        if (actualTables.includes(tableName)) {
                            await window.db.table(tableName).clear();
                            if (importedJson.data[tableName].length > 0) {
                                await window.db.table(tableName).bulkAdd(importedJson.data[tableName]);
                            }
                        }
                    }
                });

                showToast("تمت استعادة البيانات بنجاح! سيتم إعادة تشغيل النظام.", "success");
                setTimeout(() => window.location.reload(), 2000);

            } catch (error) {
                console.error("Import Error:", error);
                showToast(error.message || "حدث خطأ: الملف تالف أو غير مدعوم", "error");
                setIsLoading(false);
            }
            event.target.value = '';
        };

        reader.onerror = () => {
            showToast("فشلت قراءة الملف", "error");
            setIsLoading(false);
        };
        reader.readAsText(file);
    };

    // ==========================================
    // 5. واجهة المستخدم (UI)
    // ==========================================
    return (
        /* تعديل المسافة السفلية (pb-[140px]) للسكرول الطبيعي وإزالة تقييد الارتفاع */
        <div className="space-y-4 md:space-y-6 fade-up pb-[140px] md:pb-12 max-w-7xl mx-auto w-full">
            
            {/* شاشة التحميل (Overlay Loader) */}
            {isLoading && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm animate-view p-4">
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl flex flex-col items-center w-full max-w-sm text-center">
                        <i className="fas fa-database text-4xl md:text-5xl text-[#EA580C] mb-3 md:mb-4 animate-bounce"></i>
                        <h3 className="text-lg md:text-xl font-black text-slate-800 mb-1 md:mb-2">الرجاء الانتظار</h3>
                        <p className="text-xs md:text-sm font-bold text-slate-500 leading-relaxed">{loadingText}</p>
                        <div className="w-full bg-slate-100 h-2 rounded-full mt-4 md:mt-6 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#EA580C] to-[#F97316] w-full animate-pulse"></div>
                        </div>
                    </div>
                </div>
            )}

            {/* الهيدر */}
            <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 relative overflow-hidden">
                <i className="fas fa-server absolute left-0 top-1/2 -translate-y-1/2 text-7xl md:text-8xl opacity-5 transform -translate-x-2 md:-translate-x-4"></i>
                <div className="flex items-center gap-3 md:gap-4 z-10 w-full md:w-auto">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-800 flex items-center justify-center text-white text-xl md:text-2xl shadow-lg shrink-0">
                        <i className="fas fa-database"></i>
                    </div>
                    <div className="flex-1">
                        <h2 className="font-black text-lg md:text-xl text-slate-800">قواعد البيانات والنسخ</h2>
                        <p className="text-[10px] md:text-sm font-bold text-slate-400 mt-0.5 md:mt-1 truncate">حماية بيانات {dbStats.restaurantName}</p>
                    </div>
                </div>
                <div className="bg-orange-50 border border-orange-100 px-3 md:px-4 py-2 rounded-xl text-right md:text-left z-10 w-full md:w-auto flex flex-row md:flex-col justify-between md:justify-center items-center md:items-start">
                    <span className="text-[9px] md:text-[10px] font-black text-orange-400 uppercase tracking-widest mb-0 md:mb-0.5">آخر نسخة</span>
                    <span className="font-bold text-xs md:text-sm text-orange-700">{dbStats.lastBackup}</span>
                </div>
            </div>

            {/* لوحة الإحصائيات (Data Health Check) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 shrink-0">
                <div className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm text-center md:text-right">
                    <div className="text-slate-400 mb-1.5 md:mb-2 text-lg md:text-xl"><i className="fas fa-receipt"></i></div>
                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-0.5 md:mb-1">إجمالي الفواتير</p>
                    <h4 className="font-black text-xl md:text-2xl text-slate-700">{dbStats.totalOrders.toLocaleString()}</h4>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm text-center md:text-right">
                    <div className="text-sky-400 mb-1.5 md:mb-2 text-lg md:text-xl"><i className="fas fa-hamburger"></i></div>
                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-0.5 md:mb-1">أصناف المنيو</p>
                    <h4 className="font-black text-xl md:text-2xl text-slate-700">{dbStats.menuItemsCount.toLocaleString()}</h4>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm text-center md:text-right">
                    <div className="text-emerald-400 mb-1.5 md:mb-2 text-lg md:text-xl"><i className="fas fa-wallet"></i></div>
                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-0.5 md:mb-1">الإيرادات التاريخية</p>
                    <h4 className="font-black text-xl md:text-2xl text-slate-700">{dbStats.totalIncome.toLocaleString()} <span className="text-[10px] md:text-xs">ج</span></h4>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm text-center md:text-right">
                    <div className="text-purple-400 mb-1.5 md:mb-2 text-lg md:text-xl"><i className="fas fa-users"></i></div>
                    <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mb-0.5 md:mb-1">الموظفين المسجلين</p>
                    <h4 className="font-black text-xl md:text-2xl text-slate-700">{dbStats.usersCount.toLocaleString()}</h4>
                </div>
            </div>

            {/* أزرار الإجراءات (Actions) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                
                {/* كارت التصدير (Backup) */}
                <div className="bg-white border-2 border-slate-100 hover:border-emerald-500 rounded-2xl md:rounded-3xl p-5 md:p-8 flex flex-col items-center justify-center text-center transition-all group shadow-sm hover:shadow-xl">
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-2xl md:text-4xl mb-4 md:mb-6 group-hover:scale-110 transition-transform shadow-inner">
                        <i className="fas fa-cloud-download-alt"></i>
                    </div>
                    <h3 className="font-black text-slate-800 text-lg md:text-2xl mb-2 md:mb-3">تصدير وحفظ البيانات</h3>
                    <p className="text-xs md:text-sm font-bold text-slate-500 mb-5 md:mb-8 max-w-xs leading-relaxed">
                        احفظ نسخة كاملة من النظام على جهازك بصيغة ملف مشفر (JSON) لحمايتها من الضياع.
                    </p>
                    <button onClick={handleExport} className="w-full max-w-xs bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 text-sm md:text-lg flex items-center justify-center gap-2">
                        <i className="fas fa-save"></i> استخراج النسخة الآن
                    </button>
                </div>

                {/* كارت الاستيراد (Restore) */}
                <div className="bg-white border-2 border-slate-100 hover:border-blue-500 rounded-2xl md:rounded-3xl p-5 md:p-8 flex flex-col items-center justify-center text-center transition-all group shadow-sm hover:shadow-xl relative overflow-hidden">
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-2xl md:text-4xl mb-4 md:mb-6 group-hover:scale-110 transition-transform shadow-inner">
                        <i className="fas fa-cloud-upload-alt"></i>
                    </div>
                    <h3 className="font-black text-slate-800 text-lg md:text-2xl mb-2 md:mb-3">استعادة البيانات</h3>
                    <p className="text-xs md:text-sm font-bold text-slate-500 mb-5 md:mb-8 max-w-xs leading-relaxed">
                        قم برفع ملف نسخة احتياطية تم استخراجه مسبقاً لاستعادة المطعم. <br/>
                        <span className="text-rose-500 mt-1 md:mt-2 block">سيتم مسح البيانات الحالية.</span>
                    </p>
                    
                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} className="hidden" />
                    
                    <button onClick={triggerImport} className="w-full max-w-xs bg-slate-800 hover:bg-slate-900 text-white font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl shadow-lg transition-all active:scale-95 text-sm md:text-lg flex items-center justify-center gap-2">
                        <i className="fas fa-upload"></i> اختيار ملف النسخة
                    </button>
                </div>

            </div>
            
            {/* ملاحظة أمنية */}
            <div className="text-center shrink-0">
                <p className="text-[10px] md:text-xs font-bold text-slate-400 flex items-center justify-center gap-1.5 md:gap-2">
                    <i className="fas fa-lock text-emerald-500"></i> يتم معالجة البيانات محلياً على جهازك دون الحاجة لإنترنت حفاظاً على السرية.
                </p>
            </div>

            {/* إعلان النسخة المدفوعة */}
            <div className="mt-4 md:mt-8 bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-center shadow-xl border border-yellow-500/20 relative overflow-hidden group w-full">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl group-hover:bg-yellow-500/30 transition-colors"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#EA580C]/20 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                    <div className="w-14 h-14 md:w-16 md:h-16 mx-auto bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/30 mb-3 md:mb-4 transform -rotate-6 group-hover:rotate-0 transition-transform">
                        <i className="fas fa-crown text-2xl md:text-3xl text-white"></i>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-black text-white mb-2">ارتقِ بأعمالك مع <span className="text-transparent bg-clip-text bg-gradient-to-l from-yellow-400 to-yellow-200">النسخة المدفوعة</span>!</h3>
                    <p className="text-xs md:text-sm font-bold text-slate-300 mb-5 md:mb-6 max-w-lg mx-auto">
                        احفظ بياناتك تلقائياً في السحابة لحمايتها من الضياع، واربط فروع مطعمك معاً للحصول على تقارير موحدة ودعم فني على مدار الساعة.
                    </p>
                    <a href="https://wa.me/201211934816" target="_blank" className="inline-flex items-center justify-center gap-2 md:gap-3 bg-[#25D366] hover:bg-[#1DA851] text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl md:rounded-2xl font-black text-xs sm:text-base transition-transform active:scale-95 shadow-[0_10px_20px_rgba(37,211,102,0.3)] w-full sm:w-auto">
                        <i className="fab fa-whatsapp text-xl md:text-2xl"></i><span>تواصل معنا الآن: 01211934816</span>
                    </a>
                </div>
            </div>

        </div>
    );
};