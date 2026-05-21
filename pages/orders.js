window.Module_Orders = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useMemo } = React;

    // ==========================================
    // 1. حالات الشاشة (State Management)
    // ==========================================
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); 
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 3; 

    // حالات الفاتورة المحددة
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [orderItems, setOrderItems] = useState([]);
    const [isClosing, setIsClosing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // ==========================================
    // 2. جلب البيانات (LiveQuery)
    // ==========================================
    const allOrders = window.useLiveQuery(
        () => window.db.orders.orderBy('created_at').reverse().toArray(),
        []
    );

    // ==========================================
    // 3. فلترة البيانات (البحث، الحالة، التواريخ)
    // ==========================================
    const filteredOrders = useMemo(() => {
        if (!allOrders) return [];
        let result = allOrders;

        if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter);
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(o => 
                o.id.toString().includes(query) || 
                (o.customer_name && o.customer_name.toLowerCase().includes(query))
            );
        }
        if (fromDate) {
            const startTimestamp = new Date(fromDate).setHours(0, 0, 0, 0);
            result = result.filter(o => new Date(o.created_at).getTime() >= startTimestamp);
        }
        if (toDate) {
            const endTimestamp = new Date(toDate).setHours(23, 59, 59, 999);
            result = result.filter(o => new Date(o.created_at).getTime() <= endTimestamp);
        }
        return result;
    }, [allOrders, statusFilter, searchQuery, fromDate, toDate]);

    useEffect(() => setCurrentPage(1), [statusFilter, searchQuery, fromDate, toDate]);

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
    const paginatedOrders = filteredOrders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // ==========================================
    // 4. جلب تفاصيل الفاتورة عند النقر
    // ==========================================
    useEffect(() => {
        if (selectedOrder) {
            window.db.order_items.where('order_id').equals(selectedOrder.id).toArray()
                .then(items => setOrderItems(items))
                .catch(err => console.error("Error fetching items:", err));
        } else {
            setOrderItems([]);
            setIsEditing(false); 
        }
    }, [selectedOrder]);

    // ==========================================
    // 5. العمليات (طباعة، دفع، تعديل، حذف)
    // ==========================================
    
    // -- دالة الطباعة --
    const printReceipt = (order, items) => {
        const printContent = `
            <html dir="rtl" lang="ar">
            <head>
                <title>فاتورة رقم #${order.id}</title>
                <style>
                    body { font-family: 'Cairo', sans-serif; font-size: 13px; margin: 0; padding: 10px; width: 80mm; color: #000; }
                    h2 { text-align: center; margin-bottom: 5px; font-size: 18px; font-weight: bold; }
                    .info { text-align: center; margin-bottom: 15px; font-size: 12px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    th { border-bottom: 1px dashed #000; padding: 5px 2px; text-align: right; font-size: 12px; }
                    td { padding: 5px 2px; text-align: right; font-size: 13px; }
                    .center { text-align: center; }
                    .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
                    .totals div { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
                    .final-total { font-size: 18px !important; font-weight: bold; border-top: 2px solid #000; padding-top: 5px; margin-top: 5px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>نظام المطعم</h2>
                <div class="info">
                    <div>رقم الطلب: #${order.id}</div>
                    <div>التاريخ: ${new Date(order.created_at).toLocaleString('ar-EG')}</div>
                    ${order.order_type === 'dine_in' && order.table_id ? `<div>طلب صالة</div>` : ''}
                    ${order.customer_name ? `<div>العميل: ${order.customer_name}</div>` : ''}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50%;">الصنف</th>
                            <th class="center" style="width: 20%;">الكمية</th>
                            <th style="width: 30%;">المجموع</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${item.item_name || item.name}</td>
                                <td class="center">${item.quantity}</td>
                                <td>${item.subtotal}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="totals">
                    ${order.discount > 0 ? `
                        <div><span>الإجمالي الفرعي:</span> <span>${order.total_amount} ج</span></div>
                        <div><span>الخصم:</span> <span>${order.discount} ج</span></div>
                    ` : ''}
                    <div class="final-total"><span>الصافي:</span> <span>${order.final_total} ج.م</span></div>
                </div>
                <div class="footer"><p>شكراً لزيارتكم!</p></div>
            </body>
            </html>
        `;
        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'absolute'; printWindow.style.top = '-1000px';
        document.body.appendChild(printWindow);
        printWindow.contentDocument.write(printContent); printWindow.contentDocument.close();
        printWindow.contentWindow.focus(); printWindow.contentWindow.print();
        setTimeout(() => { document.body.removeChild(printWindow); }, 1000);
    };

    // الدفع والإغلاق
    const handleCloseOrder = async () => {
        if (!selectedOrder) return;
        if (!confirm("هل أنت متأكد من استلام المبلغ وإغلاق الفاتورة؟")) return;
        setIsClosing(true);
        try {
            await window.RestaurantQueries.closeOrder(selectedOrder.id);
            showToast(`تم دفع وإغلاق الفاتورة #${selectedOrder.id} بنجاح`, "success");
            setSelectedOrder(null); 
        } catch (error) { showToast("حدث خطأ أثناء إغلاق الفاتورة", "error"); } 
        finally { setIsClosing(false); }
    };

    // التعديل والحفظ والحذف (نفس المنطق السابق)
    const handleEditQuantity = (index, delta) => {
        const newItems = [...orderItems];
        newItems[index].quantity += delta;
        if (newItems[index].quantity <= 0) newItems.splice(index, 1); 
        else newItems[index].subtotal = newItems[index].quantity * newItems[index].price;
        setOrderItems(newItems);
    };

    const saveEdits = async () => {
        if (orderItems.length === 0) return showToast("لا يمكن حفظ فاتورة فارغة، قم بإلغاء الطلب", "error");
        try {
            const newSubtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
            const newFinalTotal = Math.max(0, newSubtotal - (selectedOrder.discount || 0));
            await window.db.transaction('rw', window.db.orders, window.db.order_items, async () => {
                await window.db.orders.update(selectedOrder.id, { total_amount: newSubtotal, final_total: newFinalTotal });
                await window.db.order_items.where('order_id').equals(selectedOrder.id).delete();
                await window.db.order_items.bulkAdd(orderItems.map(item => ({...item, order_id: selectedOrder.id})));
            });
            showToast("تم التعديل بنجاح", "success"); setIsEditing(false);
            setSelectedOrder({...selectedOrder, total_amount: newSubtotal, final_total: newFinalTotal});
        } catch (error) { showToast("خطأ أثناء حفظ التعديلات", "error"); }
    };

    const handleDeleteOrder = async () => {
        if (!confirm("تحذير: هل أنت متأكد من إلغاء وحذف هذا الطلب نهائياً؟")) return;
        try {
            await window.db.transaction('rw', window.db.orders, window.db.order_items, async () => {
                await window.db.order_items.where('order_id').equals(selectedOrder.id).delete();
                await window.db.orders.delete(selectedOrder.id);
            });
            showToast("تم إلغاء الطلب", "success"); setSelectedOrder(null);
        } catch (error) { showToast("خطأ أثناء الحذف", "error"); }
    };

    const orderTypes = {
        'dine_in': { text: 'صالة', icon: 'fa-chair', color: 'text-blue-600 bg-blue-50 border-blue-200' },
        'takeaway': { text: 'تيك أواي', icon: 'fa-shopping-bag', color: 'text-orange-600 bg-orange-50 border-orange-200' },
        'delivery': { text: 'دليفري', icon: 'fa-motorcycle', color: 'text-purple-600 bg-purple-50 border-purple-200' }
    };
    const statusConfig = {
        'open': { text: 'قيد التجهيز', badge: 'bg-rose-100 text-rose-600' },
        'closed': { text: 'مدفوعة', badge: 'bg-emerald-100 text-emerald-600' }
    };

    // ==========================================
    // 6. واجهة المستخدم (UI)
    // ==========================================
    return (
        /* تعديل التصميم: إزالة h-full واستخدام block لضمان السكرول الطبيعي للمتصفح بدون قص */
        <div className="space-y-4 md:space-y-6 fade-up pb-[140px] md:pb-12 max-w-7xl mx-auto w-full">
            
            {/* شريط الأدوات والبحث */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 text-lg shrink-0">
                            <i className="fas fa-list-alt"></i>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-slate-800">سجل الطلبات</h3>
                            <p className="text-xs font-bold text-slate-400">إدارة ومراجعة الفواتير</p>
                        </div>
                    </div>
                    {(fromDate || toDate || searchQuery || statusFilter !== 'all') && (
                        <button onClick={() => {setFromDate(''); setToDate(''); setSearchQuery(''); setStatusFilter('all');}} className="text-xs text-rose-500 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                            مسح الفلاتر <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl px-3 py-2.5 outline-none focus:border-[#EA580C]">
                        <option value="all">جميع الحالات</option>
                        <option value="open">قيد التجهيز (مفتوحة)</option>
                        <option value="closed">مكتملة (مدفوعة)</option>
                    </select>

                    <div className="flex gap-2 col-span-1 sm:col-span-2">
                        <div className="relative w-full">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">من</span>
                            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 pl-2 py-2.5 outline-none focus:border-[#EA580C] text-xs font-bold text-slate-700 dir-ltr" />
                        </div>
                        <div className="relative w-full">
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">إلى</span>
                            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 pl-2 py-2.5 outline-none focus:border-[#EA580C] text-xs font-bold text-slate-700 dir-ltr" />
                        </div>
                    </div>

                    <div className="relative w-full sm:col-span-2 md:col-span-1">
                        <input type="text" placeholder="بحث برقم الطلب..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-10 py-2.5 outline-none focus:border-[#EA580C] text-sm font-bold text-slate-700 placeholder:text-slate-400" />
                        <i className="fas fa-search absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    </div>
                </div>
            </div>

            {/* قائمة الطلبات */}
            <div className="w-full space-y-4">
                {!allOrders ? (
                    <div className="flex justify-center items-center py-20"><i className="fas fa-circle-notch fa-spin text-4xl text-[#EA580C]"></i></div>
                ) : filteredOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-slate-400 py-16 shadow-sm text-center">
                        <i className="fas fa-receipt text-6xl mb-4 text-slate-200"></i>
                        <h3 className="text-lg font-bold">لا توجد طلبات مطابقة</h3>
                        <p className="text-sm mt-1">جرب تغيير فلاتر البحث أو التواريخ.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedOrders.map(order => {
                            const typeData = orderTypes[order.order_type] || orderTypes['takeaway'];
                            const statusData = statusConfig[order.status];

                            return (
                                <div key={order.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                    <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${order.status === 'closed' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">رقم الطلب</span>
                                            <h4 className="text-xl md:text-2xl font-black text-slate-800">#{order.id}</h4>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-black ${statusData.badge}`}>{statusData.text}</span>
                                    </div>

                                    <div className="space-y-2 mb-5">
                                        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                            <i className="fas fa-user text-slate-400 w-4 text-center"></i> 
                                            <span className="truncate">{order.customer_name || 'بدون اسم'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                            <i className={`fas ${typeData.icon} text-slate-400 w-4 text-center`}></i> 
                                            <span className={`px-2 py-0.5 rounded text-[10px] border ${typeData.color}`}>{typeData.text}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                            <i className="fas fa-clock text-slate-400 w-4 text-center"></i> 
                                            <span className="dir-ltr">{new Date(order.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end pt-3 border-t border-slate-100 border-dashed">
                                        <div>
                                            <span className="block text-[10px] font-bold text-slate-400 mb-0.5">الإجمالي</span>
                                            <span className="text-xl font-black text-[#EA580C]">{order.final_total} ج</span>
                                        </div>
                                        <button onClick={() => setSelectedOrder(order)} className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 border border-slate-200">
                                            التفاصيل <i className="fas fa-arrow-left text-[10px]"></i>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 mx-auto max-w-sm w-full">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors">
                            <i className="fas fa-chevron-right text-sm"></i>
                        </button>
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-500">
                            <span className="bg-[#EA580C] text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-md">{currentPage}</span>
                            <span>من</span>
                            <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">{totalPages}</span>
                        </div>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors">
                            <i className="fas fa-chevron-left text-sm"></i>
                        </button>
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
                    <h3 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">ارتقِ بأعمالك مع <span className="text-transparent bg-clip-text bg-gradient-to-l from-yellow-400 to-yellow-200">النسخة المدفوعة</span>!</h3>
                    <p className="text-sm font-bold text-slate-300 mb-6 max-w-lg mx-auto leading-relaxed">
                        احصل على ربط سحابي للأجهزة، مزامنة فروع، تقارير أرباح مفصلة، شاشة مطبخ، ودعم فني مباشر على مدار الساعة لضمان نجاح مطعمك.
                    </p>
                    <a href="https://wa.me/201211934816" target="_blank" className="inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1DA851] text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl font-black text-sm sm:text-base transition-transform active:scale-95 shadow-[0_10px_20px_rgba(37,211,102,0.3)] hover:shadow-[0_10px_30px_rgba(37,211,102,0.4)] w-full sm:w-auto">
                        <i className="fab fa-whatsapp text-2xl"></i>
                        <span>تواصل معنا الآن: 01211934816</span>
                    </a>
                </div>
            </div>

            {/* النافذة المنبثقة (Modal) للطلبات */}
            {selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}></div>
                    <div className="relative bg-white w-full max-w-lg rounded-2xl md:rounded-3xl shadow-2xl flex flex-col h-auto max-h-[90vh] animate-view overflow-hidden border border-slate-100">
                        
                        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-base md:text-xl font-black text-slate-800">فاتورة #{selectedOrder.id}</h2>
                                <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-0.5">{new Date(selectedOrder.created_at).toLocaleString('ar-EG')}</p>
                            </div>
                            <div className="flex gap-2">
                                {/* زر الطباعة الجديد */}
                                <button onClick={() => printReceipt(selectedOrder, orderItems)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-800 hover:text-white flex items-center justify-center transition-colors shadow-sm" title="طباعة الفاتورة">
                                    <i className="fas fa-print text-xs"></i>
                                </button>
                                
                                {selectedOrder.status === 'open' && !isEditing && (
                                    <button onClick={() => setIsEditing(true)} className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-colors shadow-sm" title="تعديل الطلب">
                                        <i className="fas fa-pen text-xs"></i>
                                    </button>
                                )}
                                <button onClick={() => setSelectedOrder(null)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors shadow-sm">
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-white hide-scrollbar min-h-[200px]">
                            {isEditing && (
                                <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl text-[10px] md:text-xs font-bold mb-3 flex items-center gap-2 border border-blue-100">
                                    <i className="fas fa-info-circle text-base"></i> يمكنك تعديل الكميات أو حذف الصنف بتصفير الكمية.
                                </div>
                            )}
                            <table className="w-full text-right text-xs md:text-sm">
                                <thead className="border-b border-slate-100 text-slate-400 font-bold">
                                    <tr>
                                        <th className="pb-2">الصنف</th>
                                        <th className="pb-2 text-center">الكمية</th>
                                        <th className="pb-2">المجموع</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {orderItems.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="py-3 font-bold text-slate-700">{item.item_name || item.name}</td>
                                            <td className="py-3 text-center">
                                                {isEditing ? (
                                                    <div className="flex items-center justify-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-200 w-max mx-auto">
                                                        <button onClick={() => handleEditQuantity(idx, 1)} className="w-6 h-6 bg-white shadow-sm rounded text-emerald-500"><i className="fas fa-plus text-[10px]"></i></button>
                                                        <span className="font-black text-slate-700 w-4">{item.quantity}</span>
                                                        <button onClick={() => handleEditQuantity(idx, -1)} className="w-6 h-6 bg-white shadow-sm rounded text-rose-500"><i className="fas fa-minus text-[10px]"></i></button>
                                                    </div>
                                                ) : (
                                                    <span className="font-black text-slate-600 bg-slate-50 px-2 py-1 rounded-lg">x{item.quantity}</span>
                                                )}
                                            </td>
                                            <td className="py-3 font-black text-slate-800">{item.subtotal}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-4 pt-3 border-t border-slate-200 border-dashed space-y-1.5">
                                <div className="flex justify-between text-xs md:text-sm font-bold text-slate-500">
                                    <span>الإجمالي الفرعي:</span>
                                    <span>{isEditing ? orderItems.reduce((s, i) => s + i.subtotal, 0) : selectedOrder.total_amount} ج.م</span>
                                </div>
                                <div className="flex justify-between text-xs md:text-sm font-bold text-slate-500">
                                    <span>الخصم المطبق:</span>
                                    <span>{selectedOrder.discount || 0} ج.م</span>
                                </div>
                                <div className="flex justify-between text-base md:text-xl font-black text-slate-800 pt-2">
                                    <span>الصافي النهائي:</span>
                                    <span className="text-[#EA580C]">{isEditing ? Math.max(0, orderItems.reduce((s, i) => s + i.subtotal, 0) - (selectedOrder.discount || 0)) : selectedOrder.final_total} ج.م</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 md:p-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-2">
                            {isEditing ? (
                                <div className="flex gap-2">
                                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs md:text-sm">إلغاء التعديل</button>
                                    <button onClick={saveEdits} className="flex-2 bg-blue-500 hover:bg-blue-600 text-white font-black py-3 px-4 rounded-xl shadow-md text-xs md:text-sm flex items-center justify-center gap-2 w-2/3">
                                        <i className="fas fa-save"></i> حفظ التعديلات
                                    </button>
                                </div>
                            ) : selectedOrder.status === 'open' ? (
                                <div className="flex gap-2">
                                    <button onClick={handleDeleteOrder} className="w-12 md:w-14 bg-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl flex items-center justify-center transition-colors shrink-0 shadow-sm" title="إلغاء الطلب">
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                    <button onClick={handleCloseOrder} disabled={isClosing} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 md:py-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex justify-center items-center gap-2 active:scale-95 text-sm md:text-base">
                                        {isClosing ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-hand-holding-usd text-lg"></i> استلام الدفع وإغلاق</>}
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-600 font-black py-3 md:py-4 rounded-xl flex justify-center items-center gap-2 text-sm md:text-base">
                                    <i className="fas fa-check-circle text-lg"></i> الفاتورة مدفوعة ومغلقة
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};