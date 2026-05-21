window.Module_Main = function({ restaurantId, userId, showToast, setActiveModule }) {
    const { useState, useEffect } = React;

    // حالة التاريخ المحدد (الافتراضي: اليوم)
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    
    // حالات الإحصائيات
    const [stats, setStats] = useState({
        totalIncome: 0,
        totalOrders: 0,
        completedOrders: 0,
        activeTables: 0
    });

    // ==========================================
    // منطق الـ Pagination
    // ==========================================
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 3; // الليمت المطلوب

    // تصفير الصفحة عند تغيير التاريخ
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedDate]);

    // جلب البيانات بناءً على التاريخ المحدد باستخدام LiveQuery
    const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate).setHours(23, 59, 59, 999);

    const ordersQuery = window.useLiveQuery(
        () => window.db.orders.where('created_at').between(dayStart, dayEnd).toArray(),
        [selectedDate]
    );

    const tablesQuery = window.useLiveQuery(
        () => window.db.table('tables').toArray(),
        []
    );

    // حساب الإحصائيات فور تغير البيانات أو التاريخ
    useEffect(() => {
        if (ordersQuery && tablesQuery) {
            let income = 0;
            let completed = 0;

            ordersQuery.forEach(order => {
                if (order.status === 'closed') {
                    income += order.final_total;
                    completed++;
                }
            });

            const activeTbls = tablesQuery.filter(t => t.status === 'occupied').length;

            setStats({
                totalIncome: income,
                totalOrders: ordersQuery.length,
                completedOrders: completed,
                activeTables: activeTbls
            });
        }
    }, [ordersQuery, tablesQuery]);

    // الطلبات المفتوحة حالياً (قيد التجهيز) وتطبيق الـ Pagination عليها
    const activeOrders = ordersQuery ? ordersQuery.filter(o => o.status === 'open').sort((a, b) => b.created_at - a.created_at) : [];
    
    // حساب الصفحات واقتطاع البيانات
    const totalPages = Math.max(1, Math.ceil(activeOrders.length / ITEMS_PER_PAGE));
    const paginatedOrders = activeOrders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // ترجمة أنواع الطلبات
    const orderTypes = {
        'dine_in': { text: 'صالة', color: 'bg-blue-100 text-blue-700' },
        'takeaway': { text: 'تيك أواي', color: 'bg-orange-100 text-orange-700' },
        'delivery': { text: 'دليفري', color: 'bg-emerald-100 text-emerald-700' }
    };

    // دالة الانتقال السريع
    const handleNavigation = (moduleName) => {
        if (setActiveModule) {
            setActiveModule(moduleName);
        } else {
            console.error("setActiveModule prop is missing!");
        }
    };

    return (
        /* تمت إضافة pb-24 للموبايل لمنع الشريط السفلي من تغطية المحتوى، و overflow-x-hidden لمنع الشاشة من التحرك يميناً ويساراً */
        <div className="space-y-6 fade-up pb-24 md:pb-6 w-full max-w-full overflow-x-hidden">
            
            {/* الهيدر وفلتر التاريخ */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 gap-4 w-full">
                <div className="flex items-center gap-3 text-slate-800 w-full md:w-auto">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-[#EA580C] text-lg shrink-0">
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-lg">ملخص الأداء والمبيعات</h3>
                        <p className="text-xs font-bold text-slate-400">تابع حركة المطعم لحظة بلحظة</p>
                    </div>
                </div>
                
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-full md:w-auto justify-between">
                    <i className="fas fa-calendar-alt text-slate-400 ml-2"></i>
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer w-full text-left dir-ltr"
                    />
                </div>
            </div>

            {/* البطاقات الإحصائية (Stats Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full">
                {/* إيرادات اليوم */}
                <div className="bg-gradient-to-br from-[#EA580C] to-[#F97316] p-6 rounded-2xl shadow-lg shadow-orange-500/20 relative overflow-hidden text-white w-full">
                    <i className="fas fa-wallet absolute left-0 bottom-0 text-7xl opacity-20 transform -translate-x-4 translate-y-4"></i>
                    <h4 className="text-orange-100 font-bold text-sm mb-1">مبيعات التاريخ المحدد</h4>
                    <div className="flex items-end gap-1">
                        <span className="text-3xl font-black">{stats.totalIncome.toLocaleString()}</span>
                        <span className="text-sm font-bold mb-1 pb-1">ج.م</span>
                    </div>
                </div>

                {/* إجمالي الطلبات */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden w-full">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-sky-50 text-sky-500 rounded-full flex items-center justify-center text-2xl">
                        <i className="fas fa-receipt"></i>
                    </div>
                    <h4 className="text-slate-400 font-bold text-sm mb-1">إجمالي الطلبات</h4>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-slate-800">{stats.totalOrders}</span>
                        <span className="text-xs font-bold text-emerald-500 mb-1 pb-1 bg-emerald-50 px-2 py-0.5 rounded">مكتمل: {stats.completedOrders}</span>
                    </div>
                </div>

                {/* الطاولات المشغولة */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden w-full sm:col-span-2 md:col-span-1">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-2xl">
                        <i className="fas fa-chair"></i>
                    </div>
                    <h4 className="text-slate-400 font-bold text-sm mb-1">الطاولات المشغولة حالياً</h4>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-slate-800">{stats.activeTables}</span>
                        <span className="text-xs font-bold text-slate-400 mb-1 pb-1">طاولة</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                
                {/* قائمة الوصول السريع */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="font-black text-slate-700 flex items-center gap-2">
                        <i className="fas fa-bolt text-[#EA580C]"></i> الوصول السريع
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div onClick={() => handleNavigation('pos')} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center hover:border-[#EA580C] hover:shadow-md transition-all cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-orange-50 text-[#EA580C] rounded-full flex items-center justify-center text-lg mb-2 group-hover:scale-110 transition-transform"><i className="fas fa-cash-register"></i></div>
                            <span className="text-xs font-bold text-slate-600">الكاشير (POS)</span>
                        </div>
                        <div onClick={() => handleNavigation('menu')} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center hover:border-sky-500 hover:shadow-md transition-all cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-sky-50 text-sky-500 rounded-full flex items-center justify-center text-lg mb-2 group-hover:scale-110 transition-transform"><i className="fas fa-hamburger"></i></div>
                            <span className="text-xs font-bold text-slate-600">إدارة المنيو</span>
                        </div>
                        <div onClick={() => handleNavigation('orders')} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-lg mb-2 group-hover:scale-110 transition-transform"><i className="fas fa-concierge-bell"></i></div>
                            <span className="text-xs font-bold text-slate-600">سجل الطلبات</span>
                        </div>
                        <div onClick={() => handleNavigation('accounting')} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center hover:border-purple-500 hover:shadow-md transition-all cursor-pointer group">
                            <div className="w-10 h-10 mx-auto bg-purple-50 text-purple-500 rounded-full flex items-center justify-center text-lg mb-2 group-hover:scale-110 transition-transform"><i className="fas fa-wallet"></i></div>
                            <span className="text-xs font-bold text-slate-600">الخزينة</span>
                        </div>
                    </div>
                </div>

                {/* الطلبات المفتوحة حالياً (قيد التجهيز) مع Pagination */}
                <div className="lg:col-span-2 flex flex-col">
                    <h3 className="font-black text-slate-700 flex items-center gap-2 mb-4">
                        <i className="fas fa-fire text-rose-500"></i> طلبات قيد التجهيز (للتاريخ المحدد)
                    </h3>
                    
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden w-full flex-1 flex flex-col justify-between">
                        {activeOrders.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 flex-1 flex flex-col justify-center">
                                <i className="fas fa-check-circle text-4xl text-slate-200 mb-3"></i>
                                <p className="font-bold text-sm">لا توجد طلبات معلقة حالياً في هذا التاريخ.</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto hide-scrollbar w-full">
                                    <table className="w-full text-right text-sm whitespace-nowrap">
                                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                                            <tr>
                                                <th className="p-4">رقم الطلب</th>
                                                <th className="p-4">النوع</th>
                                                <th className="p-4">العميل / الطاولة</th>
                                                <th className="p-4">الإجمالي</th>
                                                <th className="p-4">الوقت</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paginatedOrders.map(order => {
                                                const typeInfo = orderTypes[order.order_type] || { text: 'غير معروف', color: 'bg-slate-100' };
                                                return (
                                                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-4 font-black text-slate-700">#{order.id}</td>
                                                        <td className="p-4">
                                                            <span className={`px-2 py-1 rounded text-[10px] font-black ${typeInfo.color}`}>
                                                                {typeInfo.text}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 font-bold text-slate-600">
                                                            {order.customer_name} 
                                                            {order.order_type === 'dine_in' && order.table_id && <span className="text-[10px] text-slate-400 mr-2">(طاولة مقيدة)</span>}
                                                        </td>
                                                        <td className="p-4 font-black text-[#EA580C]">{order.final_total} ج</td>
                                                        <td className="p-4 text-xs font-bold text-slate-400">
                                                            {new Date(order.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* أزرار التحكم بالـ Pagination */}
                                {totalPages > 1 && (
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                                        <div className="flex items-center justify-between bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 w-full md:w-80">
                                            <button 
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors"
                                            >
                                                <i className="fas fa-chevron-right text-xs"></i>
                                            </button>
                                            
                                            <div className="flex items-center gap-2 font-bold text-xs text-slate-500">
                                                <span className="bg-[#EA580C] text-white w-6 h-6 rounded-md flex items-center justify-center shadow-sm">{currentPage}</span>
                                                <span>من</span>
                                                <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">{totalPages}</span>
                                            </div>

                                            <button 
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors"
                                            >
                                                <i className="fas fa-chevron-left text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
				

            </div>
			
			
        </div>
		
    );
};