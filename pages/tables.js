window.Module_Tables = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useMemo } = React;

    // ==========================================
    // 1. حالات الشاشة (State Management)
    // ==========================================
    const [searchQuery, setSearchQuery] = useState('');
    
    // حالات النافذة المنبثقة (Modal) للإضافة والتعديل
    const [showModal, setShowModal] = useState(false);
    const [tableName, setTableName] = useState('');
    const [editingTable, setEditingTable] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // حالات التقسيم (Pagination)
    const [currentPage, setCurrentPage] = useState(1);
    const tablesPerPage = 10;

    // ==========================================
    // 2. جلب البيانات (LiveQuery)
    // ==========================================
    const tables = window.useLiveQuery(() => window.db.table('tables').orderBy('id').toArray(), []);

    // ==========================================
    // 3. فلترة البيانات وإحصائيات الطاولات والتقسيم
    // ==========================================
    const filteredTables = useMemo(() => {
        if (!tables) return [];
        if (searchQuery.trim() === '') return tables;
        return tables.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [tables, searchQuery]);

    const stats = useMemo(() => {
        if (!tables) return { total: 0, available: 0, occupied: 0 };
        return {
            total: tables.length,
            available: tables.filter(t => t.status === 'available').length,
            occupied: tables.filter(t => t.status === 'occupied').length,
        };
    }, [tables]);

    // حسابات التقسيم (Pagination Calculations)
    const totalPages = Math.ceil(filteredTables.length / tablesPerPage);
    const paginatedTables = filteredTables.slice(
        (currentPage - 1) * tablesPerPage, 
        currentPage * tablesPerPage
    );

    // إعادة ضبط الصفحة عند البحث
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // حماية: إذا تم حذف عنصر وكان هو الوحيد في الصفحة الأخيرة، ارجع خطوة للوراء
    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    // ==========================================
    // 4. العمليات (فتح النافذة، حفظ، حذف)
    // ==========================================
    
    const handleOpenModal = (table = null) => {
        if (table) {
            setEditingTable(table);
            setTableName(table.name);
        } else {
            setEditingTable(null);
            setTableName('');
        }
        setShowModal(true);
    };

    const handleSaveTable = async (e) => {
        e.preventDefault();
        const trimmedName = tableName.trim();

        if (!trimmedName) return showToast("الرجاء إدخال اسم الطاولة", "error");
        
        const isDuplicate = tables.some(t => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== editingTable?.id);
        if (isDuplicate) return showToast("اسم الطاولة مسجل بالفعل! الرجاء اختيار اسم آخر.", "error");

        setIsSubmitting(true);
        try {
            if (editingTable) {
                await window.db.table('tables').update(editingTable.id, { name: trimmedName });
                showToast("تم تعديل اسم الطاولة بنجاح", "success");
            } else {
                await window.db.table('tables').add({ name: trimmedName, status: 'available' });
                showToast("تمت إضافة الطاولة بنجاح", "success");
            }
            setShowModal(false);
            setTableName('');
        } catch (error) {
            showToast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTable = async (table) => {
        if (table.status === 'occupied') return showToast("لا يمكن حذف طاولة مشغولة بطلب مفتوح!", "error");
        if (confirm(`هل أنت متأكد من حذف (${table.name}) بشكل نهائي؟`)) {
            try {
                await window.db.table('tables').delete(table.id);
                showToast("تم الحذف بنجاح", "success");
            } catch (err) {
                showToast("حدث خطأ أثناء الحذف", "error");
            }
        }
    };

    // ==========================================
    // 5. واجهة المستخدم (UI)
    // ==========================================
    return (
        <div className="space-y-4 md:space-y-6 fade-up pb-[140px] md:pb-12 max-w-7xl mx-auto w-full">
            
            {/* الهيدر وشريط البحث */}
            <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-center shrink-0">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-lg shrink-0">
                        <i className="fas fa-chair"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-base md:text-lg text-slate-800">إدارة الطاولات للصالة</h3>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400">تأسيس الطاولات ومراقبة حالتها</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 md:gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <input type="text" placeholder="ابحث عن طاولة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-9 py-2.5 outline-none focus:border-blue-500 text-xs md:text-sm font-bold text-slate-700" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                    <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 shrink-0">
                        <i className="fas fa-plus"></i> إضافة طاولة
                    </button>
                </div>
            </div>

            {/* كروت الإحصائيات */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 shrink-0">
                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:gap-3 text-center sm:text-right">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm sm:text-xl mb-1 sm:mb-0"><i className="fas fa-hashtag"></i></div>
                    <div><p className="text-[8px] sm:text-[10px] font-bold text-slate-400">الإجمالي</p><h4 className="font-black text-base sm:text-xl text-slate-700">{stats.total}</h4></div>
                </div>
                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:gap-3 text-center sm:text-right">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-sm sm:text-xl mb-1 sm:mb-0"><i className="fas fa-check"></i></div>
                    <div><p className="text-[8px] sm:text-[10px] font-bold text-slate-400">متاحة</p><h4 className="font-black text-base sm:text-xl text-emerald-600">{stats.available}</h4></div>
                </div>
                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:gap-3 text-center sm:text-right">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-sm sm:text-xl mb-1 sm:mb-0"><i className="fas fa-lock"></i></div>
                    <div><p className="text-[8px] sm:text-[10px] font-bold text-slate-400">مشغولة</p><h4 className="font-black text-base sm:text-xl text-rose-600">{stats.occupied}</h4></div>
                </div>
            </div>

            {/* شبكة الطاولات */}
            <div className="bg-transparent md:bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-100 md:p-6 w-full">
                {!tables ? (
                    <div className="flex justify-center items-center py-20"><i className="fas fa-circle-notch fa-spin text-3xl text-blue-500"></i></div>
                ) : filteredTables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-400 opacity-60 py-16 text-center bg-white rounded-2xl md:bg-transparent">
                        <i className="fas fa-chair text-5xl md:text-6xl mb-3 md:mb-4"></i>
                        <p className="font-bold text-sm">{searchQuery ? 'لا توجد طاولات تطابق بحثك.' : 'لا توجد طاولات مسجلة.'}</p>
                        {!searchQuery && <p className="text-[10px] md:text-xs mt-1">أضف الطاولات لتتمكن من استخدام خيار "صالة" في الكاشير.</p>}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 auto-rows-max">
                            {paginatedTables.map(table => {
                                const isOccupied = table.status === 'occupied';
                                const colors = isOccupied ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-emerald-200 text-emerald-700 shadow-sm hover:shadow-md';
                                const iconColors = isOccupied ? 'bg-rose-100 text-rose-500' : 'bg-emerald-50 text-emerald-500';

                                return (
                                    <div key={table.id} className={`relative p-4 md:p-5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center group ${colors}`}>
                                        
                                        {/* أزرار التعديل والحذف */}
                                        <div className="absolute top-2 left-2 flex flex-col gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <button onClick={() => handleOpenModal(table)} className="w-6 h-6 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-colors shadow-sm" title="تعديل الطاولة">
                                                <i className="fas fa-pen text-[10px]"></i>
                                            </button>
                                            {!isOccupied && (
                                                <button onClick={() => handleDeleteTable(table)} className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors shadow-sm" title="حذف الطاولة">
                                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                                </button>
                                            )}
                                        </div>

                                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-lg md:text-2xl mb-2 md:mb-3 shadow-inner ${iconColors}`}>
                                            <i className="fas fa-chair"></i>
                                        </div>
                                        <h4 className="font-black text-sm md:text-lg mb-1.5 truncate w-full px-2">{table.name}</h4>
                                        <span className={`text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded-full ${isOccupied ? 'bg-white text-rose-600' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {isOccupied ? 'مشغولة بالزبائن' : 'متاحة'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* أزرار التنقل (Pagination Controls) */}
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-4 mt-6 md:mt-8 pt-4 border-t border-slate-100">
                                <button 
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-slate-200 hover:bg-blue-50 text-slate-600 hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 transition-colors font-bold shadow-sm"
                                >
                                    <i className="fas fa-chevron-right text-xs"></i>
                                </button>
                                
                                <div className="bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
                                    <span className="text-xs font-bold text-slate-600">الصفحة {currentPage} من {totalPages}</span>
                                </div>

                                <button 
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-slate-200 hover:bg-blue-50 text-slate-600 hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 transition-colors font-bold shadow-sm"
                                >
                                    <i className="fas fa-chevron-left text-xs"></i>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ===================================== */}
            {/* إعلان النسخة المدفوعة (Pro Version Ad) */}
            {/* ===================================== */}
            <div className="mt-4 md:mt-6 animate-view relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81] rounded-3xl p-6 md:p-8 shadow-2xl border border-indigo-500/30 w-full group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-indigo-500/30 transition-all duration-700"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2 pointer-events-none group-hover:bg-fuchsia-500/30 transition-all duration-700"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
                    <div className="text-center md:text-right flex-1">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-300 text-[10px] md:text-xs font-black mb-4 shadow-inner">
                            <i className="fas fa-crown text-yellow-400 animate-pulse"></i> ارتقِ لأعلى مستوى
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-white mb-2 tracking-tight">
                            MentraResto <span className="text-transparent bg-clip-text bg-gradient-to-l from-indigo-400 to-fuchsia-400">PRO</span>
                        </h3>
                        <p className="text-slate-300 font-bold text-sm md:text-base leading-relaxed max-w-2xl text-opacity-90">
                            نسخة الكلاود الشاملة! اربط الكاشير بشاشات المطبخ الذكية (KDS)، تابع تقارير الأرباح والمخازن من موبايلك في أي مكان، واستمتع بدعم فني متواصل ومزامنة فورية للبيانات.
                        </p>
                    </div>
                    
                    <a href="https://wa.me/201211934816" target="_blank" className="w-full md:w-auto bg-gradient-to-l from-indigo-500 to-fuchsia-600 hover:from-indigo-400 hover:to-fuchsia-500 text-white font-black px-8 py-4 rounded-2xl shadow-[0_10px_30px_rgba(99,102,241,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(99,102,241,0.6)] flex items-center justify-center gap-3 shrink-0 whitespace-nowrap text-sm md:text-base group/btn">
                        تواصل للترقية الآن
                        <i className="fas fa-arrow-left group-hover/btn:-translate-x-1 transition-transform"></i>
                    </a>
                </div>
            </div>

            {/* Modal: إضافة / تعديل طاولة */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-view">
                        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-sm md:text-base">{editingTable ? 'تعديل الطاولة' : 'إضافة طاولة جديدة'}</h3>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <form onSubmit={handleSaveTable} className="p-4 md:p-5 space-y-4">
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">اسم الطاولة (مثال: طاولة رقم 1)</label>
                                <input type="text" required value={tableName} onChange={e => setTableName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-bold text-xs md:text-sm" placeholder="أدخل اسم الطاولة..." />
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 mt-4 transition-transform active:scale-95 text-sm">
                                {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : (editingTable ? 'حفظ التعديل' : 'حفظ الطاولة')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
