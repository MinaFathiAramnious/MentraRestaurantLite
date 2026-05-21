window.Module_Accounting = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useMemo } = React;

    // ==========================================
    // 1. حالات الشاشة (State Management)
    // ==========================================
    
    const todayStr = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(todayStr);
    const [endDate, setEndDate] = useState(todayStr);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5; // تم زيادة الليمت لتحسين العرض

    // نافذة المصروفات (إضافة وتعديل)
    const [showModal, setShowModal] = useState(false);
    const [editingTx, setEditingTx] = useState(null);
    const [txAmount, setTxAmount] = useState('');
    const [txDesc, setTxDesc] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ==========================================
    // 2. جلب البيانات (LiveQuery)
    // ==========================================
    useEffect(() => { setCurrentPage(1); }, [startDate, endDate]);

    const startTs = new Date(startDate).setHours(0, 0, 0, 0);
    const endTs = new Date(endDate).setHours(23, 59, 59, 999);

    const transactions = window.useLiveQuery(
        () => window.db.accounting
                .where('date').between(startTs, endTs)
                .reverse().toArray(),
        [startDate, endDate]
    );

    // ==========================================
    // 3. الحسابات والـ Pagination
    // ==========================================
    const stats = useMemo(() => {
        let totalIncome = 0;
        let totalExpense = 0;
        if (transactions) {
            transactions.forEach(t => {
                if (t.type === 'income') totalIncome += t.amount;
                if (t.type === 'expense') totalExpense += t.amount;
            });
        }
        return { totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
    }, [transactions]);

    const safeTransactions = transactions || [];
    const totalPages = Math.max(1, Math.ceil(safeTransactions.length / ITEMS_PER_PAGE));
    const paginatedTransactions = safeTransactions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // ==========================================
    // 4. العمليات (حفظ، تعديل، حذف، تصدير)
    // ==========================================
    const openModal = (tx = null) => {
        if (tx) {
            setEditingTx(tx); setTxAmount(tx.amount); setTxDesc(tx.description);
        } else {
            setEditingTx(null); setTxAmount(''); setTxDesc('');
        }
        setShowModal(true);
    };

    const handleSaveTx = async (e) => {
        e.preventDefault();
        if (!txAmount || txAmount <= 0) return showToast("الرجاء إدخال مبلغ صحيح", "error");
        if (!txDesc.trim()) return showToast("الرجاء إدخال البيان/الوصف", "error");

        setIsSubmitting(true);
        try {
            if (editingTx) {
                await window.db.accounting.update(editingTx.id, { amount: parseFloat(txAmount), description: txDesc });
                showToast("تم تعديل المصروف بنجاح", "success");
            } else {
                await window.RestaurantQueries.addExpense(parseFloat(txAmount), txDesc);
                showToast("تم تسجيل المصروف بنجاح", "success");
            }
            setShowModal(false);
        } catch (error) { showToast("حدث خطأ أثناء الحفظ", "error"); } 
        finally { setIsSubmitting(false); }
    };

    const handleDeleteTx = async (id) => {
        if (!confirm("هل أنت متأكد من حذف هذا المصروف نهائياً؟")) return;
        try {
            await window.db.accounting.delete(id);
            showToast("تم الحذف بنجاح", "success");
        } catch (error) { showToast("خطأ أثناء الحذف", "error"); }
    };

    // التصدير إلى Excel (CSV)
    const exportExcel = () => {
        if (safeTransactions.length === 0) return showToast("لا توجد بيانات للتصدير", "error");
        let csv = "\uFEFFالنوع,البيان,التاريخ,المبلغ\n"; // \uFEFF لدعم اللغة العربية في إكسيل
        safeTransactions.forEach(t => {
            const type = t.type === 'income' ? 'إيراد' : 'مصروف';
            const date = new Date(t.date).toLocaleString('ar-EG');
            csv += `${type},${t.description},${date},${t.amount}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `تقرير_الخزينة_${startDate}.csv`;
        link.click();
    };

    // التصدير إلى PDF (طباعة A4)
    const exportPDF = () => {
        if (safeTransactions.length === 0) return showToast("لا توجد بيانات للطباعة", "error");
        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'absolute'; printWindow.style.top = '-1000px';
        document.body.appendChild(printWindow);
        const doc = printWindow.contentDocument;
        doc.write(`
            <html dir="rtl">
            <head>
                <title>تقرير الخزينة</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                    .stats { display: flex; justify-content: space-around; margin-bottom: 20px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
                    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; }
                    th { background-color: #f4f4f4; }
                    .income { color: green; } .expense { color: red; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>تقرير الخزينة والحسابات</h2>
                    <p>الفترة من: ${startDate} إلى: ${endDate}</p>
                </div>
                <div class="stats">
                    <span>الإيرادات: ${stats.totalIncome} ج.م</span>
                    <span>المصروفات: ${stats.totalExpense} ج.م</span>
                    <span>الصافي: ${stats.netProfit} ج.م</span>
                </div>
                <table>
                    <thead><tr><th>النوع</th><th>البيان</th><th>التاريخ والوقت</th><th>المبلغ</th></tr></thead>
                    <tbody>
                        ${safeTransactions.map(t => `
                            <tr>
                                <td class="${t.type === 'income' ? 'income' : 'expense'}">${t.type === 'income' ? 'إيراد' : 'مصروف'}</td>
                                <td>${t.description}</td>
                                <td>${new Date(t.date).toLocaleString('ar-EG')}</td>
                                <td dir="ltr">${t.amount}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `);
        doc.close();
        printWindow.contentWindow.focus(); printWindow.contentWindow.print();
        setTimeout(() => printWindow.remove(), 1000);
    };

    // ==========================================
    // 5. واجهة المستخدم (UI)
    // ==========================================
    return (
        /* تعديل المسافة السفلية (pb-[140px]) للسكرول الطبيعي */
        <div className="space-y-4 md:space-y-6 fade-up pb-[140px] md:pb-12 max-w-7xl mx-auto w-full">
            
            {/* الهيدر وفلاتر التاريخ */}
            <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-3 md:gap-4 justify-between items-center shrink-0">
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 text-lg shrink-0">
                        <i className="fas fa-wallet"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-base md:text-lg text-slate-800">الخزينة والحسابات</h3>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400">مراقبة الإيرادات والمصروفات والأرباح</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 md:gap-3 w-full lg:w-auto">
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={exportPDF} className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 flex justify-center items-center gap-1"><i className="fas fa-print text-rose-500"></i> PDF</button>
                        <button onClick={exportExcel} className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 flex justify-center items-center gap-1"><i className="fas fa-file-excel text-emerald-500"></i> Excel</button>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 md:py-2">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400">من:</span>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-xs md:text-sm font-bold text-slate-700 outline-none w-full dir-ltr" />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 md:py-2">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400">إلى:</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-xs md:text-sm font-bold text-slate-700 outline-none w-full dir-ltr" />
                    </div>
                    <button onClick={() => openModal()} className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2">
                        <i className="fas fa-minus-circle"></i> سحب مصروف
                    </button>
                </div>
            </div>

            {/* البطاقات الإحصائية */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 shrink-0">
                <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl md:text-2xl shrink-0"><i className="fas fa-arrow-down"></i></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-400 mb-0.5">إجمالي الإيرادات</p><h4 className="font-black text-xl md:text-2xl text-emerald-600">{stats.totalIncome.toLocaleString()} <span className="text-[10px] md:text-sm">ج.م</span></h4></div>
                </div>
                
                <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-xl md:text-2xl shrink-0"><i className="fas fa-arrow-up"></i></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-400 mb-0.5">المصروفات والمسحوبات</p><h4 className="font-black text-xl md:text-2xl text-rose-600">{stats.totalExpense.toLocaleString()} <span className="text-[10px] md:text-sm">ج.م</span></h4></div>
                </div>

                <div className={`p-4 md:p-5 rounded-2xl shadow-sm flex items-center gap-3 md:gap-4 relative overflow-hidden ${stats.netProfit >= 0 ? 'bg-blue-600 text-white shadow-blue-500/30' : 'bg-rose-600 text-white shadow-rose-500/30'}`}>
                    <i className="fas fa-chart-line absolute left-0 bottom-0 text-6xl opacity-20 transform -translate-x-2 translate-y-4"></i>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center text-xl md:text-2xl shrink-0 z-10"><i className="fas fa-coins"></i></div>
                    <div className="z-10"><p className="text-[10px] md:text-xs font-bold text-white/80 mb-0.5">صافي الخزينة (الربح)</p><h4 className="font-black text-xl md:text-2xl dir-ltr text-right">{stats.netProfit.toLocaleString()} <span className="text-[10px] md:text-sm font-normal">ج.م</span></h4></div>
                </div>
            </div>

            {/* سجل الحركات (Table/List) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-3 md:p-4 bg-slate-50 border-b border-slate-100">
                    <h4 className="font-black text-slate-700 text-xs md:text-sm"><i className="fas fa-list-ul text-slate-400 ml-2"></i>سجل العمليات</h4>
                </div>

                <div className="overflow-x-auto hide-scrollbar">
                    {!transactions ? (
                        <div className="flex justify-center items-center py-10"><i className="fas fa-circle-notch fa-spin text-3xl text-purple-500"></i></div>
                    ) : safeTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-slate-400 py-16 opacity-60 text-center">
                            <i className="fas fa-folder-open text-5xl md:text-6xl mb-3 text-slate-200"></i>
                            <p className="font-bold text-xs md:text-sm">لا توجد حركات مالية في هذا التاريخ.</p>
                        </div>
                    ) : (
                        <div className="min-w-[500px]">
                            <table className="w-full text-right text-xs md:text-sm whitespace-nowrap">
                                <thead className="text-slate-400 font-bold border-b border-slate-100">
                                    <tr>
                                        <th className="p-3 md:p-4 w-12 text-center">#</th>
                                        <th className="p-3 md:p-4">البيان</th>
                                        <th className="p-3 md:p-4">التاريخ</th>
                                        <th className="p-3 md:p-4">المبلغ</th>
                                        <th className="p-3 md:p-4 text-center">إجراء</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedTransactions.map(t => {
                                        const isIncome = t.type === 'income';
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-2 md:p-4 text-center">
                                                    <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full mx-auto flex items-center justify-center text-[10px] md:text-xs shadow-sm ${isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                        <i className={`fas ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                                                    </div>
                                                </td>
                                                <td className="p-2 md:p-4">
                                                    <span className="font-bold text-slate-700 block truncate max-w-[150px] md:max-w-xs">{t.description}</span>
                                                    {t.order_id && <span className="text-[8px] md:text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full"><i className="fas fa-link"></i> فاتورة #{t.order_id}</span>}
                                                </td>
                                                <td className="p-2 md:p-4 text-[10px] md:text-xs font-bold text-slate-500">
                                                    {new Date(t.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td className="p-2 md:p-4">
                                                    <span className={`font-black text-sm md:text-lg ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {isIncome ? '+' : '-'}{t.amount} ج
                                                    </span>
                                                </td>
                                                <td className="p-2 md:p-4 text-center">
                                                    {/* تفعيل أزرار التعديل والحذف فقط للمصروفات اليدوية (غير مربوطة بفاتورة) */}
                                                    {!t.order_id ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={() => openModal(t)} className="w-6 h-6 md:w-8 md:h-8 rounded bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-pen text-[10px] md:text-xs"></i></button>
                                                            <button onClick={() => handleDeleteTx(t.id)} className="w-6 h-6 md:w-8 md:h-8 rounded bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-trash text-[10px] md:text-xs"></i></button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-300">تلقائي</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                        <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100 w-full max-w-sm">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-purple-500 hover:text-white"><i className="fas fa-chevron-right text-xs"></i></button>
                            <div className="flex items-center gap-2 font-bold text-xs text-slate-500">
                                <span className="bg-purple-500 text-white w-6 h-6 rounded flex items-center justify-center shadow-sm">{currentPage}</span><span>من</span><span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">{totalPages}</span>
                            </div>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-purple-500 hover:text-white"><i className="fas fa-chevron-left text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* إعلان النسخة المدفوعة (الأسفل) */}
            <div className="mt-8 bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-center shadow-xl border border-yellow-500/20 relative overflow-hidden group w-full">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl group-hover:bg-yellow-500/30 transition-colors"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#EA580C]/20 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/30 mb-4 transform -rotate-6 group-hover:rotate-0 transition-transform">
                        <i className="fas fa-crown text-3xl text-white"></i>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-white mb-2">ارتقِ بأعمالك مع <span className="text-transparent bg-clip-text bg-gradient-to-l from-yellow-400 to-yellow-200">النسخة المدفوعة</span>!</h3>
                    <p className="text-sm font-bold text-slate-300 mb-6 max-w-lg mx-auto">
                        احصل على تقارير مالية متقدمة، مزامنة سحابية للفروع، حسابات موردين ورواتب الموظفين، ودعم فني مباشر لضمان نجاح مطعمك.
                    </p>
                    <a href="https://wa.me/201211934816" target="_blank" className="inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1DA851] text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl font-black text-sm sm:text-base transition-transform active:scale-95 shadow-[0_10px_20px_rgba(37,211,102,0.3)] w-full sm:w-auto">
                        <i className="fab fa-whatsapp text-2xl"></i><span>تواصل معنا الآن: 01211934816</span>
                    </a>
                </div>
            </div>

            {/* Modal: إضافة وتعديل مصروف */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
                    <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-view border border-slate-100">
                        <div className="bg-rose-50 p-4 md:p-5 border-b border-rose-100 flex justify-between items-center">
                            <h3 className="font-black text-rose-700 flex items-center gap-2 text-sm md:text-base"><i className="fas fa-money-bill-wave"></i> {editingTx ? 'تعديل المصروف' : 'سحب مصروف جديد'}</h3>
                            <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-rose-200 text-rose-500 hover:text-white hover:bg-rose-500 flex items-center justify-center transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <form onSubmit={handleSaveTx} className="p-5 md:p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">المبلغ (ج.م)</label>
                                <input type="number" step="0.01" min="1" required value={txAmount} onChange={e => setTxAmount(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-rose-500 font-black text-base md:text-lg text-rose-600 dir-ltr text-left" placeholder="0.00" />
                            </div>
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">البيان / الوصف</label>
                                <input type="text" required value={txDesc} onChange={e => setTxDesc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-rose-500 font-bold text-xs md:text-sm text-slate-700" placeholder="مثال: فاتورة كهرباء..." />
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black py-3 md:py-4 rounded-xl shadow-lg shadow-rose-500/30 flex justify-center items-center gap-2 mt-2 transition-transform active:scale-95 text-sm md:text-base">
                                {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : (editingTx ? 'حفظ التعديل' : 'تأكيد السحب من الخزينة')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};