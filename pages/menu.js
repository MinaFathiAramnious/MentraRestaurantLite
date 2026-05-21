window.Module_Menu = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useMemo } = React;

    // ==========================================
    // 1. حالات الشاشة (State Management)
    // ==========================================
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilterCategory, setSelectedFilterCategory] = useState('all'); 
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 3; 

    // حالات النوافذ المنبثقة
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showItemModal, setShowItemModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // يحدد ما إذا كنا في وضع الإضافة أو التعديل
    const [editingItem, setEditingItem] = useState(null); 
    const [editingCategory, setEditingCategory] = useState(null); 

    // بيانات الأقسام
    const [catName, setCatName] = useState('');
    const [catIcon, setCatIcon] = useState('fa-utensils');

    // بيانات الأصناف
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [itemCost, setItemCost] = useState('');
    const [itemCategory, setItemCategory] = useState('');

    // ==========================================
    // 2. جلب البيانات (LiveQuery)
    // ==========================================
    const categories = window.useLiveQuery(() => window.db.categories.orderBy('sort_order').toArray(), []);
    const menuItems = window.useLiveQuery(() => window.db.menu_items.orderBy('id').reverse().toArray(), []);

    useEffect(() => {
        if (categories && categories.length > 0 && !itemCategory) {
            setItemCategory(categories[0].id);
        }
    }, [categories]);

    // ==========================================
    // 3. فلترة البيانات (بحث + أقسام) و Pagination
    // ==========================================
    const filteredItems = useMemo(() => {
        if (!menuItems) return [];
        let result = menuItems;

        if (selectedFilterCategory !== 'all') {
            result = result.filter(item => item.category_id === parseInt(selectedFilterCategory));
        }

        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(item => item.name.toLowerCase().includes(query));
        }

        return result;
    }, [menuItems, searchQuery, selectedFilterCategory]);

    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedFilterCategory]);

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
    const paginatedItems = filteredItems.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // ==========================================
    // 4. العمليات (الأقسام)
    // ==========================================
    
    // فتح نافذة القسم (للإضافة أو التعديل)
    const openCategoryModal = (cat = null) => {
        if (cat) {
            setEditingCategory(cat);
            setCatName(cat.name);
            setCatIcon(cat.icon);
        } else {
            setEditingCategory(null);
            setCatName('');
            setCatIcon('fa-utensils');
        }
        setShowCategoryModal(true);
    };

    // حفظ القسم (إضافة أو تعديل)
    const handleSaveCategory = async (e) => {
        e.preventDefault();
        const trimmedName = catName.trim();
        if (!trimmedName) return showToast("الرجاء إدخال اسم القسم", "error");
        
        setIsSubmitting(true);
        try {
            if (editingCategory) {
                // تعديل قسم موجود
                await window.db.categories.update(editingCategory.id, {
                    name: trimmedName,
                    icon: catIcon
                });
                showToast("تم تعديل القسم بنجاح", "success");
            } else {
                // إضافة قسم جديد
                await window.RestaurantQueries.addCategory(trimmedName, catIcon);
                showToast("تم إضافة القسم بنجاح", "success");
            }
            setShowCategoryModal(false);
        } catch (error) { 
            showToast("حدث خطأ أثناء الحفظ", "error"); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    // حذف قسم (مع حماية ضد حذف قسم يحتوي على أصناف)
    const handleDeleteCategory = async () => {
        if (!editingCategory) return;
        
        // التحقق أولاً إذا كان القسم يحتوي على أصناف
        const itemsInCat = await window.db.menu_items.where('category_id').equals(editingCategory.id).count();
        if (itemsInCat > 0) {
            return showToast("عفواً، لا يمكن حذف القسم لوجود أصناف بداخله. احذف الأصناف أولاً.", "error");
        }

        if(!confirm(`هل أنت متأكد من حذف قسم (${editingCategory.name}) نهائياً؟`)) return;

        setIsSubmitting(true);
        try {
            await window.db.categories.delete(editingCategory.id);
            if (selectedFilterCategory === editingCategory.id) {
                setSelectedFilterCategory('all');
            }
            showToast("تم حذف القسم بنجاح", "success");
            setShowCategoryModal(false);
        } catch (error) {
            showToast("حدث خطأ أثناء الحذف", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ==========================================
    // 5. العمليات (الأصناف)
    // ==========================================
    
    // فتح نافذة الإضافة أو التعديل للصنف
    const openItemModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setItemName(item.name);
            setItemPrice(item.price);
            setItemCost(item.cost || '');
            setItemCategory(item.category_id);
        } else {
            setEditingItem(null);
            setItemName('');
            setItemPrice('');
            setItemCost('');
            setItemCategory(categories?.[0]?.id || '');
        }
        setShowItemModal(true);
    };

    // حفظ الصنف (إضافة أو تعديل)
    const handleSaveItem = async (e) => {
        e.preventDefault();
        const trimmedName = itemName.trim();
        
        if (!trimmedName || !itemPrice || !itemCategory) {
            return showToast("الرجاء إكمال البيانات الأساسية", "error");
        }

        const isDuplicate = menuItems.some(i => i.name.toLowerCase() === trimmedName.toLowerCase() && i.id !== editingItem?.id);
        if (isDuplicate) {
            return showToast("هذا الصنف مسجل بالفعل في المنيو!", "error");
        }

        setIsSubmitting(true);
        try {
            if (editingItem) {
                await window.db.menu_items.update(editingItem.id, {
                    name: trimmedName,
                    price: parseFloat(itemPrice),
                    cost: parseFloat(itemCost || 0),
                    category_id: parseInt(itemCategory)
                });
                showToast("تم تعديل الصنف بنجاح", "success");
            } else {
                await window.RestaurantQueries.addMenuItem(parseInt(itemCategory), trimmedName, parseFloat(itemPrice), parseFloat(itemCost || 0));
                showToast("تم الإضافة للمنيو بنجاح", "success");
            }
            setShowItemModal(false);
        } catch (error) { showToast("حدث خطأ أثناء الحفظ", "error"); } 
        finally { setIsSubmitting(false); }
    };

    // حذف صنف
    const handleDeleteItem = async (id, name) => {
        if (!confirm(`تحذير: هل أنت متأكد من حذف الصنف (${name}) من المنيو؟`)) return;
        try {
            await window.db.menu_items.delete(id);
            showToast("تم حذف الصنف بنجاح", "success");
        } catch (error) { showToast("حدث خطأ أثناء الحذف", "error"); }
    };

    const iconOptions = ['fa-utensils', 'fa-hamburger', 'fa-pizza-slice', 'fa-coffee', 'fa-ice-cream', 'fa-drumstick-bite', 'fa-fish', 'fa-glass-cheers'];

    // ==========================================
    // 6. واجهة المستخدم (UI)
    // ==========================================
    return (
        <div className="space-y-5 md:space-y-6 fade-up pb-[140px] md:pb-12 max-w-7xl mx-auto w-full">
            
            {/* 1. الهيدر وأزرار الإضافة */}
            <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-[#EA580C] text-lg shrink-0">
                        <i className="fas fa-book-open"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-base md:text-lg text-slate-800">إدارة المنيو</h3>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400">تأسيس وتعديل الأقسام والأصناف</p>
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => openCategoryModal()} className="flex-1 md:flex-none bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 px-3 py-2.5 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        <i className="fas fa-folder-plus text-[#EA580C]"></i> قسم جديد
                    </button>
                    <button onClick={() => { if(!categories || categories.length === 0) return showToast("أضف قسم أولاً", "error"); openItemModal(); }} className="flex-1 md:flex-none bg-[#EA580C] hover:bg-orange-700 text-white px-3 py-2.5 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2">
                        <i className="fas fa-plus"></i> صنف جديد
                    </button>
                </div>
            </div>

            {/* 2. شريط الأقسام (الفلتر مع التعديل) */}
            <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100">
                <h4 className="text-xs md:text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                    <i className="fas fa-filter text-slate-400"></i> الأقسام (اضغط على القلم للتعديل)
                </h4>
                <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1 snap-x touch-pan-x">
                    <button 
                        onClick={() => setSelectedFilterCategory('all')} 
                        className={`snap-start whitespace-nowrap px-4 py-2 rounded-xl font-bold text-xs transition-all border shrink-0 ${selectedFilterCategory === 'all' ? 'border-[#EA580C] bg-[#EA580C] text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                        الكل
                    </button>
                    {!categories || categories.length === 0 ? null : (
                        categories.map(cat => (
                            <div key={cat.id} className="relative group shrink-0 flex items-center">
                                {/* زر الفلترة */}
                                <button 
                                    onClick={() => setSelectedFilterCategory(cat.id)}
                                    className={`snap-start whitespace-nowrap pl-8 pr-4 py-2 rounded-xl font-bold text-xs transition-all border flex items-center gap-2 w-full ${selectedFilterCategory === cat.id ? 'border-[#EA580C] bg-[#EA580C] text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <i className={`fas ${cat.icon}`}></i> {cat.name}
                                </button>
                                {/* زر التعديل الصغير (متموضع مطلقاً جهة اليسار) */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); openCategoryModal(cat); }}
                                    className={`absolute left-1 w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${selectedFilterCategory === cat.id ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-slate-400 hover:text-[#EA580C] hover:bg-orange-50'}`}
                                >
                                    <i className="fas fa-pen text-[10px]"></i>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 3. سجل الأصناف */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h4 className="text-xs md:text-sm font-black text-slate-700 hidden sm:block">قائمة الأصناف</h4>
                    <div className="relative w-full sm:w-72">
                        <input type="text" placeholder="ابحث باسم الصنف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-9 py-2.5 md:py-2 outline-none focus:border-[#EA580C] text-xs md:text-sm font-bold text-slate-700" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                </div>

                <div className="p-3 md:p-4 min-h-[300px]">
                    {!menuItems ? (
                        <div className="flex justify-center items-center py-20"><i className="fas fa-circle-notch fa-spin text-3xl text-[#EA580C]"></i></div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-slate-400 opacity-60 py-16 text-center">
                            <i className="fas fa-box-open text-5xl md:text-6xl mb-3"></i>
                            <p className="font-bold text-xs md:text-sm">لا توجد أصناف تطابق فلاتر البحث</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            {paginatedItems.map(item => {
                                const cat = categories?.find(c => c.id === item.category_id);
                                return (
                                    <div key={item.id} className="border border-slate-100 rounded-2xl p-4 hover:border-[#EA580C] hover:shadow-md transition-all flex flex-col justify-between bg-white relative group">
                                        <div className="absolute top-3 left-3 flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openItemModal(item)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-colors border border-blue-100"><i className="fas fa-pen text-[10px]"></i></button>
                                            <button onClick={() => handleDeleteItem(item.id, item.name)} className="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors border border-rose-100"><i className="fas fa-trash text-[10px]"></i></button>
                                        </div>
                                        <div className="mb-4 pr-16">
                                            <h4 className="font-black text-slate-800 text-sm md:text-base leading-tight">{item.name}</h4>
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded mt-1.5 inline-flex items-center gap-1 border border-slate-200">
                                                <i className={`fas ${cat?.icon || 'fa-tag'}`}></i> {cat?.name || 'بدون قسم'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-100 border-dashed">
                                            <div>
                                                <span className="block text-[9px] md:text-[10px] font-bold text-slate-400">سعر البيع</span>
                                                <span className="font-black text-[#EA580C] text-sm md:text-base">{item.price} ج</span>
                                            </div>
                                            {item.cost > 0 && (
                                                <div className="text-left">
                                                    <span className="block text-[9px] md:text-[10px] font-bold text-slate-400">التكلفة</span>
                                                    <span className="font-bold text-slate-500 text-xs md:text-sm">{item.cost} ج</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                        <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100 w-full max-w-sm">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors"><i className="fas fa-chevron-right text-xs"></i></button>
                            <div className="flex items-center gap-2 font-bold text-xs text-slate-500">
                                <span className="bg-[#EA580C] text-white w-6 h-6 rounded flex items-center justify-center shadow-sm">{currentPage}</span>
                                <span>من</span>
                                <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">{totalPages}</span>
                            </div>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-[#EA580C] hover:text-white transition-colors"><i className="fas fa-chevron-left text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* ===================================== */}
            {/* Modal: إضافة / تعديل قسم */}
            {/* ===================================== */}
            {showCategoryModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)}></div>
                    <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-view">
                        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-sm md:text-base">{editingCategory ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3>
                            <button onClick={() => setShowCategoryModal(false)} className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <form onSubmit={handleSaveCategory} className="p-4 md:p-5 space-y-4">
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">اسم القسم (مثال: مشويات، بيتزا)</label>
                                <input type="text" required value={catName} onChange={e => setCatName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-xs md:text-sm" placeholder="أدخل اسم القسم..." />
                            </div>
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-2">اختر أيقونة للقسم</label>
                                <div className="flex flex-wrap gap-2">
                                    {iconOptions.map(icon => (
                                        <button key={icon} type="button" onClick={() => setCatIcon(icon)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border-2 ${catIcon === icon ? 'border-[#EA580C] bg-orange-50 text-[#EA580C] shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-300 bg-slate-50'}`}>
                                            <i className={`fas ${icon}`}></i>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="pt-2 flex flex-col gap-2">
                                <button type="submit" disabled={isSubmitting} className="w-full bg-[#EA580C] hover:bg-orange-600 text-white font-black py-3 rounded-xl shadow-lg shadow-orange-500/30 flex justify-center items-center gap-2 text-sm">
                                    {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : (editingCategory ? 'حفظ التعديلات' : 'حفظ القسم')}
                                </button>
                                
                                {editingCategory && (
                                    <button type="button" onClick={handleDeleteCategory} disabled={isSubmitting} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold py-3 rounded-xl flex justify-center items-center gap-2 text-sm transition-colors mt-2">
                                        <i className="fas fa-trash"></i> حذف هذا القسم
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===================================== */}
            {/* Modal: إضافة / تعديل صنف */}
            {/* ===================================== */}
            {showItemModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowItemModal(false)}></div>
                    <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-view">
                        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-sm md:text-base">{editingItem ? 'تعديل الصنف' : 'إضافة صنف جديد'}</h3>
                            <button onClick={() => setShowItemModal(false)} className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <form onSubmit={handleSaveItem} className="p-4 md:p-5 space-y-4">
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">اسم الصنف / الوجبة</label>
                                <input type="text" required value={itemName} onChange={e => setItemName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-xs md:text-sm" placeholder="مثال: شاورما دجاج كبير" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">سعر البيع (ج.م)</label>
                                    <input type="number" step="0.01" min="0" required value={itemPrice} onChange={e => setItemPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-black text-xs md:text-sm dir-ltr text-left" placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">تكلفة الصنف (اختياري)</label>
                                    <input type="number" step="0.01" min="0" value={itemCost} onChange={e => setItemCost(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-slate-300 font-bold text-xs md:text-sm dir-ltr text-left" placeholder="0.00" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">القسم</label>
                                <select required value={itemCategory} onChange={e => setItemCategory(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-xs md:text-sm text-slate-700">
                                    {categories?.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="submit" disabled={isSubmitting} className="w-full bg-[#EA580C] hover:bg-orange-600 text-white font-black py-3 md:py-3.5 rounded-xl shadow-lg shadow-orange-500/30 flex justify-center items-center gap-2 mt-4 text-sm">
                                {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : (editingItem ? 'حفظ التعديلات' : 'إضافة للمنيو')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
			
            {/* إعلان النسخة المدفوعة */}
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

        </div>
    );
};