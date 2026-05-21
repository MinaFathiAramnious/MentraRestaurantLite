window.Module_Settings = function({ restaurantId, userId, showToast }) {
    const { useState, useEffect, useRef } = React;

    // ==========================================
    // 1. حالات الشاشة الأساسية (State)
    // ==========================================
    const [activeTab, setActiveTab] = useState('general'); // general, users, backup
    const [isLoading, setIsLoading] = useState(false);
    
    // بيانات المطعم الأساسية
    const [restaurantData, setRestaurantData] = useState({ id: '', restaurant_name: '', owner_name: '', phone: '' });
    const dbName = window.db.name;

    // بيانات المستخدمين
    const usersList = window.useLiveQuery(() => window.db.users.toArray(), []);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null); // لمعرفة إذا كنا نعدل أو نضيف
    const [newUser, setNewUser] = useState({ name: '', phone: '', password: '', role: 'cashier' });

    // === حالات البحث والتقسيم (Pagination) للطاقم ===
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 4; // الحد الأقصى للموظفين في الصفحة الواحدة

    // ==========================================
    // 2. جلب البيانات عند التحميل
    // ==========================================
    useEffect(() => {
        const fetchInfo = async () => {
            const info = await window.db.restaurant_info.toCollection().first();
            if (info) setRestaurantData(info);
        };
        fetchInfo();
    }, []);

    // تصفير الصفحة عند البحث
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // ==========================================
    // 3. العمليات (Logic)
    // ==========================================

    // أ. حفظ البيانات الأساسية
    const handleSaveGeneral = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await window.db.restaurant_info.update(restaurantData.id, {
                restaurant_name: restaurantData.restaurant_name,
                owner_name: restaurantData.owner_name,
                phone: restaurantData.phone
            });

            await window.masterDb.restaurants.where('dbName').equals(dbName).modify({
                restaurantName: restaurantData.restaurant_name,
                ownerName: restaurantData.owner_name,
                phone: restaurantData.phone
            });

            const session = JSON.parse(localStorage.getItem('MentraRestaurant_Session'));
            session.restaurant_name = restaurantData.restaurant_name;
            localStorage.setItem('MentraRestaurant_Session', JSON.stringify(session));

            showToast("تم تحديث بيانات المطعم بنجاح", "success");
        } catch (error) {
            showToast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // ب. فتح نافذة إضافة/تعديل الموظفين
    const handleOpenAddUser = () => {
        setEditingUserId(null);
        setNewUser({ name: '', phone: '', password: '', role: 'cashier' });
        setShowUserModal(true);
    };

    const handleOpenEditUser = (user) => {
        setEditingUserId(user.id);
        setNewUser({ name: user.name, phone: user.phone, password: '', role: user.role });
        setShowUserModal(true);
    };

    // ج. حفظ الموظف (إضافة أو تعديل)
    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!newUser.name || !newUser.phone) return showToast("الرجاء إكمال البيانات الأساسية", "error");

        setIsLoading(true);
        try {
            // فحص تكرار رقم الهاتف
            const exists = await window.db.users.where('phone').equals(newUser.phone).first();
            if (exists && exists.id !== editingUserId) {
                throw new Error("رقم الهاتف مسجل مسبقاً لموظف آخر");
            }

            if (editingUserId) {
                // وضع التعديل
                
                // منع تغيير صلاحية المدير الوحيد
                if (newUser.role !== 'owner') {
                    const oldUser = await window.db.users.get(editingUserId);
                    if (oldUser.role === 'owner') {
                        const ownersCount = usersList.filter(u => u.role === 'owner').length;
                        if (ownersCount <= 1) throw new Error("لا يمكن إزالة صلاحية المدير الوحيد للمطعم");
                    }
                }

                let updateData = {
                    name: newUser.name,
                    phone: newUser.phone,
                    role: newUser.role
                };
                
                // تحديث الباسورد فقط إذا كتب باسورد جديد (وإلا نحتفظ بالقديم)
                if (newUser.password) {
                    updateData.password = btoa(newUser.password);
                }

                await window.db.users.update(editingUserId, updateData);
                showToast("تم تعديل بيانات الموظف بنجاح", "success");

            } else {
                // وضع الإضافة
                if (!newUser.password) throw new Error("الرجاء إدخال كلمة المرور للموظف الجديد");
                
                await window.db.users.add({
                    name: newUser.name,
                    phone: newUser.phone,
                    password: btoa(newUser.password), 
                    role: newUser.role,
                    created_at: Date.now()
                });
                showToast("تم إضافة الموظف بنجاح", "success");
            }

            setShowUserModal(false);
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    // د. النسخ الاحتياطي (استخراج JSON)
    const handleExportBackup = async () => {
        try {
            setIsLoading(true);
            const tables = ['restaurant_info', 'users', 'categories', 'menu_items', 'tables', 'orders', 'order_items', 'accounting'];
            let backupData = { generated_at: new Date().toISOString(), dbName: dbName };

            for (let table of tables) {
                backupData[table] = await window.db.table(table).toArray();
            }

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", `Mentra_Backup_${restaurantData.restaurant_name}_${new Date().toISOString().split('T')[0]}.json`);
            dlAnchorElem.click();
            showToast("تم استخراج النسخة الاحتياطية بنجاح", "success");
        } catch (error) {
            showToast("فشل استخراج النسخة", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const fileInputRef = useRef(null);
    const handleImportBackup = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if(!confirm("تحذير: استعادة النسخة الاحتياطية ستمسح البيانات الحالية. هل تريد المتابعة؟")) {
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                setIsLoading(true);
                const data = JSON.parse(e.target.result);
                const tables = ['restaurant_info', 'users', 'categories', 'menu_items', 'tables', 'orders', 'order_items', 'accounting'];
                
                await window.db.transaction('rw', tables.map(t => window.db.table(t)), async () => {
                    for (let table of tables) {
                        if (data[table]) {
                            await window.db.table(table).clear();
                            await window.db.table(table).bulkAdd(data[table]);
                        }
                    }
                });
                
                showToast("تم استعادة البيانات بنجاح، سيتم إعادة تحميل النظام", "success");
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                showToast("ملف النسخة الاحتياطية غير صالح", "error");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    // ==========================================
    // 5. حسابات البحث وتقسيم الصفحات (Pagination Logic)
    // ==========================================
    const filteredUsers = (usersList || []).filter(user => 
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        user.phone.includes(searchQuery)
    );

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * usersPerPage, 
        currentPage * usersPerPage
    );

    // ==========================================
    // 6. مكونات واجهة المستخدم (UI)
    // ==========================================
    const roleLabels = { 'owner': 'مدير مطعم', 'cashier': 'كاشير', 'waiter': 'كابتن / ويتر' };
    const roleColors = { 'owner': 'bg-purple-100 text-purple-700', 'cashier': 'bg-blue-100 text-blue-700', 'waiter': 'bg-emerald-100 text-emerald-700' };

    return (
        <div className="flex flex-col gap-6 pb-[140px] md:pb-12 fade-up max-w-7xl mx-auto w-full">
            
            <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
                {/* القائمة الجانبية للتبويبات (Sidebar Settings) */}
                <div className="w-full lg:w-64 shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto hide-scrollbar snap-x touch-pan-x pb-2 lg:pb-0">
                    <button onClick={() => setActiveTab('general')} className={`snap-start flex items-center gap-2 md:gap-3 px-4 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all whitespace-nowrap text-right shrink-0 ${activeTab === 'general' ? 'bg-[#EA580C] text-white shadow-md' : 'bg-white text-slate-600 border border-slate-100 hover:border-orange-300'}`}>
                        <i className="fas fa-store w-5 text-center text-base md:text-lg"></i> <span className="text-xs md:text-sm">بيانات المطعم</span>
                    </button>
                    <button onClick={() => setActiveTab('users')} className={`snap-start flex items-center gap-2 md:gap-3 px-4 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all whitespace-nowrap text-right shrink-0 ${activeTab === 'users' ? 'bg-[#EA580C] text-white shadow-md' : 'bg-white text-slate-600 border border-slate-100 hover:border-orange-300'}`}>
                        <i className="fas fa-users w-5 text-center text-base md:text-lg"></i> <span className="text-xs md:text-sm">طاقم العمل</span>
                    </button>
                    <button onClick={() => setActiveTab('backup')} className={`snap-start flex items-center gap-2 md:gap-3 px-4 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all whitespace-nowrap text-right shrink-0 mt-0 lg:mt-4 ${activeTab === 'backup' ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-100 hover:border-slate-300'}`}>
                        <i className="fas fa-shield-alt w-5 text-center text-base md:text-lg"></i> <span className="text-xs md:text-sm">النسخ الاحتياطي</span>
                    </button>
                </div>

                {/* منطقة المحتوى (Content Area) */}
                <div className="flex-1 bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden h-fit">
                    
                    {/* --- 1. البيانات الأساسية --- */}
                    {activeTab === 'general' && (
                        <div className="p-4 md:p-8 animate-view">
                            <div className="mb-6 md:mb-8">
                                <h2 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                                    <i className="fas fa-store text-[#EA580C]"></i> البيانات الأساسية
                                </h2>
                                <p className="text-[10px] md:text-sm font-bold text-slate-400 mt-1">تعديل اسم المطعم وبيانات التواصل الخاصة به</p>
                            </div>

                            <form onSubmit={handleSaveGeneral} className="max-w-xl space-y-4 md:space-y-5">
                                <div>
                                    <label className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 md:mb-2">اسم المطعم / الكافيه</label>
                                    <input type="text" value={restaurantData.restaurant_name} onChange={e => setRestaurantData({...restaurantData, restaurant_name: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 md:px-4 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-sm text-slate-800" />
                                </div>
                                <div>
                                    <label className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 md:mb-2">اسم المدير المسئول</label>
                                    <input type="text" value={restaurantData.owner_name} onChange={e => setRestaurantData({...restaurantData, owner_name: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 md:px-4 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-sm text-slate-800" />
                                </div>
                                <div>
                                    <label className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 md:mb-2">رقم الهاتف للتواصل</label>
                                    <input type="tel" value={restaurantData.phone} onChange={e => setRestaurantData({...restaurantData, phone: e.target.value})} required dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 md:px-4 py-2.5 md:py-3 outline-none focus:border-[#EA580C] font-bold text-sm text-slate-800 text-left" />
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full md:w-auto bg-[#EA580C] hover:bg-orange-700 text-white font-black px-8 py-3.5 md:py-3 rounded-xl shadow-lg shadow-orange-500/30 transition-all flex justify-center items-center gap-2 mt-4 active:scale-95 text-sm md:text-base">
                                    {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : 'حفظ التعديلات'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* --- 2. طاقم العمل (Users) --- */}
                    {activeTab === 'users' && (
                        <div className="p-4 md:p-8 animate-view">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                <div>
                                    <h2 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                                        <i className="fas fa-users text-[#EA580C]"></i> طاقم العمل
                                    </h2>
                                    <p className="text-[10px] md:text-sm font-bold text-slate-400 mt-1">إضافة وتعديل موظفين (كاشير، ويتر) وتحديد صلاحياتهم</p>
                                </div>
                                <button onClick={handleOpenAddUser} className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-black px-4 md:px-5 py-3 md:py-2.5 rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2 text-xs md:text-sm shrink-0 active:scale-95">
                                    <i className="fas fa-user-plus"></i> إضافة موظف جديد
                                </button>
                            </div>

                            {/* شريط البحث */}
                            <div className="mb-6 relative">
                                <input 
                                    type="text" 
                                    placeholder="ابحث بالاسم أو رقم الهاتف..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-11 py-3 outline-none focus:border-sky-500 font-bold text-sm text-slate-800 transition-colors"
                                />
                                <i className="fas fa-search absolute top-1/2 right-4 -translate-y-1/2 text-slate-400"></i>
                            </div>

                            {/* قائمة الموظفين (مع التقسيم Pagination) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                {paginatedUsers.length > 0 ? paginatedUsers.map(user => (
                                    <div key={user.id} className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 flex items-center justify-between transition-colors hover:border-sky-300 shadow-sm hover:shadow-md">
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-50 flex items-center justify-center font-black text-lg md:text-xl text-slate-400 border border-slate-200 shrink-0">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="font-black text-sm md:text-base text-slate-800 leading-tight mb-1.5">{user.name}</h4>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded ${roleColors[user.role]}`}>{roleLabels[user.role]}</span>
                                                    <span className="text-[10px] md:text-xs font-bold text-slate-400 dir-ltr"><i className="fas fa-phone text-[9px] mr-1"></i>{user.phone}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleOpenEditUser(user)} className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-50 text-sky-500 hover:bg-sky-500 hover:text-white shadow-sm border border-slate-200 flex items-center justify-center transition-colors shrink-0" title="تعديل بيانات الموظف">
                                            <i className="fas fa-pen text-xs md:text-sm"></i>
                                        </button>
                                    </div>
                                )) : (
                                    <div className="col-span-1 md:col-span-2 text-center py-8 bg-slate-50 rounded-2xl border border-slate-100">
                                        <i className="fas fa-user-slash text-3xl text-slate-300 mb-3"></i>
                                        <p className="text-slate-500 font-bold text-sm">لا يوجد موظفين يطابقون بحثك</p>
                                    </div>
                                )}
                            </div>

                            {/* أزرار التنقل (Pagination Controls) - تظهر فقط إذا كان هناك أكثر من صفحة */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-4 mt-6 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-600 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 transition-colors font-bold"
                                    >
                                        <i className="fas fa-chevron-right text-xs"></i>
                                    </button>
                                    
                                    <div className="bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
                                        <span className="text-xs font-bold text-slate-600">الصفحة {currentPage} من {totalPages}</span>
                                    </div>

                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-600 disabled:opacity-30 disabled:hover:bg-slate-100 disabled:hover:text-slate-600 transition-colors font-bold"
                                    >
                                        <i className="fas fa-chevron-left text-xs"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- 3. النسخ الاحتياطي (Backup) --- */}
                    {activeTab === 'backup' && (
                        <div className="p-4 md:p-8 animate-view">
                            <div className="mb-6 md:mb-8">
                                <h2 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                                    <i className="fas fa-shield-alt text-slate-700"></i> النسخ الاحتياطي والأمان
                                </h2>
                                <p className="text-[10px] md:text-sm font-bold text-slate-400 mt-1">حماية بيانات المطعم واستعادتها في أي وقت</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-4xl">
                                {/* كارت استخراج نسخة */}
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl md:rounded-3xl p-5 md:p-6 flex flex-col items-center text-center">
                                    <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xl md:text-2xl mb-3 md:mb-4 shadow-sm"><i className="fas fa-download"></i></div>
                                    <h3 className="font-black text-slate-800 text-base md:text-lg mb-1 md:mb-2">استخراج نسخة احتياطية</h3>
                                    <p className="text-[10px] md:text-xs font-bold text-slate-500 mb-4 md:mb-6 leading-relaxed">يقوم بتحميل ملف (JSON) يحتوي على المنيو، الفواتير، الحسابات والموظفين. احتفظ به في مكان آمن.</p>
                                    <button onClick={handleExportBackup} disabled={isLoading} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3 md:py-3.5 rounded-xl shadow-md transition-all mt-auto flex items-center justify-center gap-2 text-sm active:scale-95">
                                        {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-save"></i> تحميل النسخة لجهازي</>}
                                    </button>
                                </div>

                                {/* كارت استعادة نسخة */}
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl md:rounded-3xl p-5 md:p-6 flex flex-col items-center text-center relative">
                                    <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl md:text-2xl mb-3 md:mb-4 shadow-sm"><i className="fas fa-upload"></i></div>
                                    <h3 className="font-black text-slate-800 text-base md:text-lg mb-1 md:mb-2">استعادة بيانات سابقة</h3>
                                    <p className="text-[10px] md:text-xs font-bold text-slate-500 mb-4 md:mb-6 leading-relaxed">اختر ملف (JSON) تم استخراجه مسبقاً. <br/><span className="text-rose-500">تحذير: سيتم مسح البيانات الحالية وإحلالها!</span></p>
                                    
                                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportBackup} className="hidden" />
                                    <button onClick={() => fileInputRef.current.click()} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 md:py-3.5 rounded-xl shadow-md transition-all mt-auto flex items-center justify-center gap-2 text-sm active:scale-95">
                                        {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-folder-open"></i> اختيار ملف النسخة</>}
                                    </button>
                                </div>
                            </div>

                            {/* منطقة الخطر */}
                            <div className="mt-8 md:mt-10 border-t border-slate-100 pt-6 md:pt-8 max-w-4xl">
                                <h3 className="font-black text-rose-600 text-sm md:text-base flex items-center gap-2 mb-3 md:mb-4"><i className="fas fa-exclamation-triangle"></i> منطقة الخطر (Danger Zone)</h3>
                                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                    <div>
                                        <h4 className="font-black text-slate-800 text-sm md:text-base">حذف قاعدة بيانات المطعم الحالية</h4>
                                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-1">سيتم مسح الفواتير والمنيو نهائياً من هذا الجهاز ولن يمكن التراجع.</p>
                                    </div>
                                    <button onClick={() => {
                                        if(prompt(`للتأكيد، اكتب اسم المطعم: ${restaurantData.restaurant_name}`) === restaurantData.restaurant_name) {
                                            window.db.delete().then(() => {
                                                localStorage.removeItem('MentraRestaurant_Session');
                                                window.location.replace('subscriptions.html');
                                            });
                                        }
                                    }} className="w-full md:w-auto bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 md:py-2.5 rounded-xl font-black text-xs md:text-sm shrink-0 shadow-md active:scale-95 transition-transform">
                                        تأكيد وحذف المطعم
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===================================== */}
            {/* إعلان النسخة المدفوعة (Pro Version Ad) */}
            {/* ===================================== */}
            <div className="mt-4 animate-view relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81] rounded-3xl p-6 md:p-8 shadow-2xl border border-indigo-500/30 w-full group">
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
                    
                    <a href="https://wa.me/201099238386" target="_blank" className="w-full md:w-auto bg-gradient-to-l from-indigo-500 to-fuchsia-600 hover:from-indigo-400 hover:to-fuchsia-500 text-white font-black px-8 py-4 rounded-2xl shadow-[0_10px_30px_rgba(99,102,241,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(99,102,241,0.6)] flex items-center justify-center gap-3 shrink-0 whitespace-nowrap text-sm md:text-base group/btn">
                        تواصل للترقية الآن
                        <i className="fas fa-arrow-left group-hover/btn:-translate-x-1 transition-transform"></i>
                    </a>
                </div>
            </div>

            {/* ===================================== */}
            {/* Modal: إضافة وتعديل موظف */}
            {/* ===================================== */}
            {showUserModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowUserModal(false)}></div>
                    <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-view border border-slate-100 max-h-[90vh] flex flex-col">
                        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <h3 className="font-black text-slate-800 text-sm md:text-base">{editingUserId ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</h3>
                            <button onClick={() => setShowUserModal(false)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"><i className="fas fa-times text-xs"></i></button>
                        </div>
                        <div className="overflow-y-auto p-5 md:p-6 hide-scrollbar">
                            <form onSubmit={handleSaveUser} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">الاسم</label>
                                    <input type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-sky-500 font-bold text-xs md:text-sm" placeholder="مثال: محمد أحمد" />
                                </div>
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">رقم الهاتف (للدخول)</label>
                                    <input type="tel" required value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-sky-500 font-bold text-xs md:text-sm text-left" placeholder="01..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">
                                        كلمة المرور 
                                        {editingUserId && <span className="text-[9px] text-slate-400 font-normal mr-1">(اتركه فارغاً للاحتفاظ بالقديم)</span>}
                                    </label>
                                    <input type="password" required={!editingUserId} value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-sky-500 font-bold text-xs md:text-sm text-left" placeholder={editingUserId ? "*********" : ""} />
                                </div>
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 mb-1">الصلاحية</label>
                                    <select required value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 md:py-3 outline-none focus:border-sky-500 font-bold text-xs md:text-sm text-slate-700">
                                        <option value="cashier">كاشير (البيع وإغلاق الفواتير)</option>
                                        <option value="waiter">ويتر (طلب الأوردرات فقط)</option>
                                        <option value="owner">مدير مطعم (كامل الصلاحيات)</option>
                                    </select>
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-3 md:py-4 rounded-xl shadow-lg shadow-sky-500/30 flex justify-center items-center gap-2 mt-2 active:scale-95 transition-transform text-sm md:text-base">
                                    {isLoading ? <i className="fas fa-circle-notch fa-spin"></i> : (editingUserId ? 'حفظ التعديلات' : 'حفظ بيانات الموظف')}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};