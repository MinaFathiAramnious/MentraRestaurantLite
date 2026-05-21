window.Module_POS = function({ restaurantId, userId, showToast, setActiveModule }) {
    const { useState, useEffect, useMemo } = React;

    // ==========================================
    // 1. حالات الشاشة (State Management)
    // ==========================================
    const [cart, setCart] = useState([]);
    const [orderType, setOrderType] = useState('takeaway'); 
    const [selectedTable, setSelectedTable] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [discount, setDiscount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // حالة الطباعة الاختيارية (مفعلة افتراضياً)
    const [shouldPrint, setShouldPrint] = useState(true);
    
    // حالة خيار الإغلاق المباشر (للتيك أواي فقط - غير مفعلة افتراضياً)
    const [autoCloseOrder, setAutoCloseOrder] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 3; 

    // ==========================================
    // 2. جلب البيانات (LiveQuery)
    // ==========================================
    const categories = window.useLiveQuery(() => window.db.categories.orderBy('sort_order').toArray(), []);
    const menuItems = window.useLiveQuery(() => window.db.menu_items.where('is_active').equals(1).toArray(), []);
    const availableTables = window.useLiveQuery(() => window.db.table('tables').where('status').equals('available').toArray(), []);

    useEffect(() => {
        if (categories && categories.length > 0 && !selectedCategory) {
            setSelectedCategory(categories[0].id);
        }
    }, [categories]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCategory]);

    // ==========================================
    // 3. الفلترة والـ Pagination
    // ==========================================
    const filteredItems = useMemo(() => {
        if (!menuItems || !selectedCategory) return [];
        return menuItems.filter(item => item.category_id === selectedCategory);
    }, [menuItems, selectedCategory]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // ==========================================
    // 4. منطق سلة المشتريات
    // ==========================================
    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1 }];
        });
        if (navigator.vibrate) navigator.vibrate(50);
    };

    const updateQuantity = (id, delta) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }));
    };

    const clearCart = () => {
        if(confirm("هل أنت متأكد من تفريغ الفاتورة الحالية؟")) {
            setCart([]);
            setDiscount('');
            setCustomerName('');
            setSelectedTable('');
            setAutoCloseOrder(false); // تصفير خيار الدفع السريع
        }
    };

    const subTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const numDiscount = parseFloat(discount) || 0;
    const finalTotal = Math.max(0, subTotal - numDiscount);

    // ==========================================
    // دالة طباعة الفاتورة (مجهزة للطابعات الحرارية)
    // ==========================================
    const printReceipt = (orderId, orderCart, total, discountVal) => {
        const printContent = `
            <html dir="rtl" lang="ar">
            <head>
                <title>فاتورة رقم #${orderId}</title>
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
                    <div>رقم الطلب: #${orderId}</div>
                    <div>التاريخ: ${new Date().toLocaleString('ar-EG')}</div>
                    ${orderType === 'dine_in' && selectedTable ? `<div>طاولة رقم: ${selectedTable}</div>` : ''}
                    ${customerName ? `<div>العميل: ${customerName}</div>` : ''}
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th style="width: 50%;">الصنف</th>
                            <th class="center" style="width: 20%;">الكمية</th>
                            <th style="width: 30%;">السعر</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orderCart.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td class="center">${item.quantity}</td>
                                <td>${item.price * item.quantity}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="totals">
                    ${discountVal > 0 ? `
                        <div><span>الإجمالي الفرعي:</span> <span>${total + discountVal} ج</span></div>
                        <div><span>الخصم:</span> <span>${discountVal} ج</span></div>
                    ` : ''}
                    <div class="final-total"><span>الصافي:</span> <span>${total} ج.م</span></div>
                </div>

                <div class="footer">
                    <p>شكراً لزيارتكم!</p>
                </div>
            </body>
            </html>
        `;

        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'absolute';
        printWindow.style.top = '-1000px';
        document.body.appendChild(printWindow);
        printWindow.contentDocument.write(printContent);
        printWindow.contentDocument.close();
        
        printWindow.contentWindow.focus();
        printWindow.contentWindow.print();
        
        setTimeout(() => { document.body.removeChild(printWindow); }, 1000);
    };

    // ==========================================
    // 5. إرسال وحفظ الفاتورة
    // ==========================================
    const handleCheckout = async () => {
        if (cart.length === 0) {
            showToast("لا يمكن حفظ فاتورة فارغة", "error");
            return;
        }
        if (orderType === 'dine_in' && !selectedTable) {
            showToast("الرجاء تحديد الطاولة لطلب الصالة", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. إنشاء الطلب
            const orderId = await window.RestaurantQueries.createOrder(
                orderType,
                selectedTable ? parseInt(selectedTable) : null,
                customerName,
                cart,
                numDiscount
            );
            
            // 2. التحقق من خيار الدفع والإغلاق المباشر (التيك أواي فقط)
            if (orderType === 'takeaway' && autoCloseOrder) {
                await window.RestaurantQueries.closeOrder(orderId);
                showToast(`تم حفظ ودفع وإغلاق الفاتورة #${orderId} بنجاح`, "success");
            } else {
                showToast(`تم حفظ الفاتورة رقم #${orderId} بنجاح`, "success");
            }
            
            // 3. تنفيذ الطباعة إذا كان الخيار مفعلاً
            if (shouldPrint) {
                printReceipt(orderId, cart, finalTotal, numDiscount);
            }
            
            // 4. تصفير الحقول لبدء طلب جديد
            setCart([]);
            setDiscount('');
            setCustomerName('');
            setSelectedTable('');
            setOrderType('takeaway');
            setAutoCloseOrder(false); // إرجاع الخيار للوضع الافتراضي
            
        } catch (error) {
            showToast(error.message || "حدث خطأ أثناء حفظ الفاتورة", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ==========================================
    // 6. واجهة المستخدم (UI)
    // ==========================================

    if (!categories || categories.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 fade-up space-y-4 px-4 text-center">
                <i className="fas fa-box-open text-6xl text-slate-300"></i>
                <h2 className="text-xl font-bold">المنيو فارغ تماماً!</h2>
                <p className="text-sm">يجب إضافة أقسام وأصناف أولاً لتتمكن من استخدام الكاشير.</p>
                <button onClick={() => setActiveModule && setActiveModule('menu')} className="bg-[#EA580C] text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-orange-500/20">
                    الذهاب لإدارة المنيو
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 pb-[120px] md:pb-8 fade-up">
            
            {/* الجزء الأيمن (الأصناف والأقسام والإعلان) */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
                
                {/* شريط نوع الطلب */}
                <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 flex gap-2 overflow-x-auto hide-scrollbar shrink-0 snap-x">
                    <button onClick={() => setOrderType('takeaway')} className={`snap-center flex-1 min-w-[90px] py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex flex-col items-center gap-1 ${orderType === 'takeaway' ? 'bg-[#EA580C] text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                        <i className="fas fa-shopping-bag text-base sm:text-lg"></i> تيك أواي
                    </button>
                    <button onClick={() => setOrderType('dine_in')} className={`snap-center flex-1 min-w-[90px] py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex flex-col items-center gap-1 ${orderType === 'dine_in' ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                        <i className="fas fa-chair text-base sm:text-lg"></i> صالة
                    </button>
                    <button onClick={() => setOrderType('delivery')} className={`snap-center flex-1 min-w-[90px] py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex flex-col items-center gap-1 ${orderType === 'delivery' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                        <i className="fas fa-motorcycle text-base sm:text-lg"></i> دليفري
                    </button>
                </div>

                {/* خيارات الطلب */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
                    {orderType === 'dine_in' && (
                        <div className="bg-white px-3 py-2.5 rounded-xl shadow-sm border border-slate-100">
                            <label className="text-[10px] font-bold text-slate-400 block mb-1">اختر الطاولة</label>
                            <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer">
                                <option value="">-- اضغط للاختيار --</option>
                                {availableTables && availableTables.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="bg-white px-3 py-2.5 rounded-xl shadow-sm border border-slate-100 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">اسم العميل/الهاتف (اختياري)</label>
                        <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="مثال: أحمد 010..." className="w-full bg-transparent font-bold text-slate-700 outline-none text-sm placeholder:text-slate-300" />
                    </div>
                </div>

                {/* الأقسام (Categories) */}
                <div className="flex gap-2.5 overflow-x-auto hide-scrollbar py-1 shrink-0 snap-x touch-pan-x">
                    {categories.map(cat => (
                        <button 
                            key={cat.id} 
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`snap-start whitespace-nowrap px-4 sm:px-6 py-2.5 rounded-2xl font-black text-xs sm:text-sm transition-all border-2 flex items-center gap-2 ${selectedCategory === cat.id ? 'border-[#EA580C] bg-orange-50 text-[#EA580C]' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}`}
                        >
                            <i className={`fas ${cat.icon}`}></i> {cat.name}
                        </button>
                    ))}
                </div>

                {/* الأصناف (Items) */}
                <div className="bg-slate-100/50 rounded-2xl p-3 sm:p-4 border border-slate-100 border-dashed flex flex-col justify-between flex-1 min-h-[300px]">
                    
                    {filteredItems.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 font-bold text-sm">
                            لا توجد أصناف في هذا القسم.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 auto-rows-max">
                            {paginatedItems.map(item => (
                                <div 
                                    key={item.id} 
                                    onClick={() => addToCart(item)}
                                    className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-md hover:border-[#EA580C] transition-all group flex flex-col justify-between active:scale-95"
                                >
                                    <h4 className="font-black text-slate-700 text-base sm:text-lg group-hover:text-[#EA580C] transition-colors">{item.name}</h4>
                                    <div className="mt-3 sm:mt-4 flex justify-between items-end">
                                        <span className="bg-orange-100 text-[#EA580C] px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-black">{item.price} ج.م</span>
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-[#EA580C] group-hover:text-white transition-colors">
                                            <i className="fas fa-plus text-xs sm:text-sm"></i>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-4 sm:mt-6 flex items-center justify-between bg-white px-3 sm:px-4 py-2 rounded-2xl shadow-sm border border-slate-100 shrink-0">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-200 transition-colors">
                                <i className="fas fa-chevron-right text-sm"></i>
                            </button>
                            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-slate-500">
                                <span className="bg-[#EA580C] text-white w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shadow-md">{currentPage}</span>
                                <span>من</span>
                                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center">{totalPages}</span>
                            </div>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-200 transition-colors">
                                <i className="fas fa-chevron-left text-sm"></i>
                            </button>
                        </div>
                    )}
                </div>

                {/* إعلان النسخة المدفوعة (Pro Version Ad) يظهر تحت الأصناف */}
  

            </div>

            {/* الجزء الأيسر (الفاتورة) - ثابت على الجنب في الشاشات الكبيرة */}
            <div className="lg:col-span-4 bg-white rounded-3xl shadow-xl border border-slate-200 flex flex-col h-auto max-h-[80vh] lg:h-[calc(100vh-140px)] overflow-hidden lg:sticky lg:top-4 mt-2 lg:mt-0">
                
                {/* رأس الفاتورة */}
                <div className="bg-[#0F172A] p-3 sm:p-4 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-black text-base sm:text-lg">الفاتورة الحالية</h3>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold mt-0.5">رقم مرجعي: #{Date.now().toString().slice(-4)}</p>
                    </div>
                    {cart.length > 0 && (
                        <button onClick={clearCart} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center text-slate-300">
                            <i className="fas fa-trash-alt text-[10px] sm:text-xs"></i>
                        </button>
                    )}
                </div>

                {/* قائمة المشتريات */}
                <div className="flex-1 overflow-y-auto min-h-[150px] p-3 sm:p-4 bg-slate-50 space-y-2 sm:space-y-3 hide-scrollbar">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 min-h-[150px]">
                            <i className="fas fa-receipt text-4xl sm:text-6xl mb-3 sm:mb-4"></i>
                            <p className="font-bold text-xs sm:text-sm">الفاتورة فارغة</p>
                        </div>
                    ) : (
                        cart.map((item, idx) => (
                            <div key={`${item.id}-${idx}`} className="bg-white p-2.5 sm:p-3 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center animate-view gap-2">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-slate-700 text-xs sm:text-sm truncate">{item.name}</h4>
                                    <p className="text-[#EA580C] font-bold text-[10px] sm:text-xs mt-0.5">{item.price} ج</p>
                                </div>
                                
                                <div className="flex items-center gap-2 bg-slate-50 px-1.5 py-1 rounded-xl border border-slate-100 shrink-0">
                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 bg-white rounded-lg shadow-sm text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors flex items-center justify-center"><i className="fas fa-plus text-[10px]"></i></button>
                                    <span className="font-black text-xs sm:text-sm w-4 text-center text-slate-700">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 bg-white rounded-lg shadow-sm text-rose-500 hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center"><i className="fas fa-minus text-[10px]"></i></button>
                                </div>
                                
                                <div className="font-black text-slate-800 text-xs sm:text-sm w-10 sm:w-12 text-left shrink-0">
                                    {item.price * item.quantity}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* الحساب النهائي والدفع والخيارات */}
                <div className="bg-white p-3 sm:p-4 border-t border-slate-100 shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
                    <div className="space-y-1.5 sm:space-y-2 mb-3">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-500">
                            <span>الإجمالي الفرعي</span>
                            <span>{subTotal} ج.م</span>
                        </div>
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-500">
                            <span>الخصم (إن وجد)</span>
                            <div className="relative w-20 sm:w-24">
                                <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs sm:text-sm outline-none focus:border-[#EA580C] text-left dir-ltr" placeholder="0" />
                            </div>
                        </div>
                        <div className="pt-2 mt-2 border-t border-slate-100 border-dashed flex justify-between items-center">
                            <span className="text-sm sm:text-lg font-black text-slate-800">الصافي للدفع</span>
                            <span className="text-lg sm:text-2xl font-black text-[#EA580C]">{finalTotal} ج.م</span>
                        </div>
                    </div>
                    
                    {/* خيارات الطباعة والإغلاق */}
                    <div className="flex flex-col gap-2.5 mb-4 border-t border-slate-100 pt-3">
                        {/* خيار طباعة الفاتورة */}
                        <label className="flex items-center gap-2 cursor-pointer group w-fit">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${shouldPrint ? 'bg-[#EA580C] border-[#EA580C] text-white' : 'bg-slate-50 border-slate-300 text-transparent group-hover:border-[#EA580C]'}`}>
                                <i className="fas fa-check text-xs"></i>
                            </div>
                            <input type="checkbox" checked={shouldPrint} onChange={(e) => setShouldPrint(e.target.checked)} className="hidden" />
                            <span className="text-xs sm:text-sm font-bold text-slate-600 select-none">طباعة الفاتورة تلقائياً</span>
                        </label>

                        {/* خيار الإغلاق المباشر (تيك أواي فقط) */}
                        {orderType === 'takeaway' && (
                            <label className="flex items-center gap-2 cursor-pointer group w-fit animate-view">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${autoCloseOrder ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-50 border-slate-300 text-transparent group-hover:border-emerald-500'}`}>
                                    <i className="fas fa-check text-xs"></i>
                                </div>
                                <input type="checkbox" checked={autoCloseOrder} onChange={(e) => setAutoCloseOrder(e.target.checked)} className="hidden" />
                                <span className="text-xs sm:text-sm font-bold text-slate-600 select-none text-emerald-700">استلام الحساب وإغلاق الطلب فوراً</span>
                            </label>
                        )}
                    </div>

                    <button 
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || isSubmitting}
                        className="w-full bg-gradient-to-l from-[#EA580C] to-[#F97316] hover:to-orange-500 text-white font-black py-3 sm:py-4 rounded-xl sm:rounded-2xl shadow-lg shadow-orange-500/30 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg active:scale-95"
                    >
                        {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-check-circle"></i> تأكيد وحفظ الفاتورة</>}
                    </button>
                </div>
				
            </div>
			
        </div>
		

    );
};