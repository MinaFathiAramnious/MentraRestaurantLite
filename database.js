/**
 * MentraRestaurant Lite - Multi-Tenant Offline Database Architecture
 * Powered by Dexie.js
 */

// 1. قاعدة البيانات الرئيسية (لتسجيل المطاعم الموجودة على الجهاز)
window.masterDb = new Dexie("Mentra_Master_Directory");
window.masterDb.version(1).stores({
    restaurants: '++id, dbName, restaurantName, ownerName, phone, createdAt'
});

// متغير يحمل قاعدة بيانات المطعم النشط حالياً
window.db = null;

// دالة لتهيئة أو فتح قاعدة بيانات خاصة بمطعم معين
window.initRestaurantDB = async function(dbName) {
    if (window.db && window.db.name === dbName && window.db.isOpen()) {
        return; // مفتوحة مسبقاً
    }

    window.db = new Dexie(dbName);
    
    // هيكل الجداول لكل مطعم
    window.db.version(1).stores({
        restaurant_info: '++id, restaurant_name, owner_name, phone',
        users: '++id, name, phone, role',
        categories: '++id, name, sort_order',
        menu_items: '++id, category_id, name, barcode, is_active',
        tables: '++id, name, status', 
        orders: '++id, order_type, table_id, customer_name, status, created_at, closed_at', 
        order_items: '++id, order_id, item_id',
        accounting: '++id, type, date' 
    });

    try {
        await window.db.open();
        console.log(`✅ تم الاتصال بقاعدة بيانات المطعم: ${dbName}`);
    } catch (err) {
        console.error(`❌ فشل الاتصال بقاعدة بيانات ${dbName}:`, err);
        throw err;
    }
};

window.RestaurantQueries = {

    // إنشاء مطعم جديد بقاعدة بيانات مستقلة
    createRestaurant: async (restaurantName, ownerName, phone, password) => {
        // إنشاء اسم مميز لقاعدة البيانات (بدون مسافات)
        const safeName = restaurantName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_");
        const uniqueDbName = `MentraDB_${safeName}_${Date.now()}`;

        // تسجيل المطعم في الدليل الرئيسي
        await window.masterDb.restaurants.add({
            dbName: uniqueDbName,
            restaurantName: restaurantName,
            ownerName: ownerName,
            phone: phone,
            createdAt: Date.now()
        });

        // تهيئة وإنشاء قاعدة البيانات الخاصة بهذا المطعم
        await window.initRestaurantDB(uniqueDbName);

        const hashedPassword = btoa(password); 

        // إدخال بيانات المطعم والمستخدم الأول (المالك)
        return await window.db.transaction('rw', window.db.restaurant_info, window.db.users, async () => {
            const restaurantId = await window.db.restaurant_info.add({
                restaurant_name: restaurantName,
                owner_name: ownerName,
                phone: phone,
                created_at: new Date().getTime()
            });

            const userId = await window.db.users.add({
                name: ownerName,
                phone: phone,
                password: hashedPassword,
                role: 'owner', 
                created_at: new Date().getTime()
            });

            return { restaurantId, userId, dbName: uniqueDbName };
        });
    },

    // تسجيل الدخول (يتطلب معرفة قاعدة البيانات أولاً من واجهة الدخول)
    login: async (dbName, phone, password) => {
        await window.initRestaurantDB(dbName);

        const hashedPassword = btoa(password);
        const user = await window.db.users.where('phone').equals(phone).first();
        
        if (!user || user.password !== hashedPassword) {
            throw new Error("رقم الهاتف أو كلمة المرور غير صحيحة");
        }

        const restaurant = await window.db.restaurant_info.toCollection().first();
        return { user, restaurant, dbName };
    },

    // (باقي الدوال كما هي، لأنها تعتمد على window.db الذي أصبح يتغير ديناميكياً)
    addCategory: async (name, icon = 'fa-utensils') => { return await window.db.categories.add({ name, icon, sort_order: Date.now() }); },
    addMenuItem: async (categoryId, name, price, cost = 0, barcode = '') => { return await window.db.menu_items.add({ category_id: parseInt(categoryId), name, price: parseFloat(price), cost: parseFloat(cost), barcode, is_active: 1, created_at: new Date().getTime() }); },
    getFullMenu: async () => {
        const categories = await window.db.categories.orderBy('sort_order').toArray();
        const items = await window.db.menu_items.where('is_active').equals(1).toArray();
        return categories.map(cat => ({ ...cat, items: items.filter(item => item.category_id === cat.id) }));
    },
    createOrder: async (orderType, tableId, customerName, cartItems, discount = 0) => {
        return await window.db.transaction('rw', window.db.orders, window.db.order_items, window.db.table('tables'), async () => {
            let totalAmount = 0; const itemsToInsert = [];
            for (let item of cartItems) {
                const subtotal = item.price * item.quantity; totalAmount += subtotal;
                itemsToInsert.push({ item_id: item.id, item_name: item.name, quantity: item.quantity, price: item.price, subtotal: subtotal });
            }
            const finalTotal = totalAmount - discount;
            const orderId = await window.db.orders.add({ order_type: orderType, table_id: tableId || null, customer_name: customerName || 'عميل نقدي', total_amount: totalAmount, discount: discount, final_total: finalTotal > 0 ? finalTotal : 0, status: 'open', created_at: new Date().getTime() });
            itemsToInsert.forEach(i => i.order_id = orderId);
            await window.db.order_items.bulkAdd(itemsToInsert);
            if (orderType === 'dine_in' && tableId) await window.db.table('tables').update(tableId, { status: 'occupied' });
            return orderId;
        });
    },
    closeOrder: async (orderId) => {
        return await window.db.transaction('rw', window.db.orders, window.db.table('tables'), window.db.accounting, async () => {
            const order = await window.db.orders.get(orderId);
            if (!order) throw new Error("الفاتورة غير موجودة");
            if (order.status === 'closed') throw new Error("تم دفع وإغلاق هذه الفاتورة مسبقاً");
            const now = new Date().getTime();
            await window.db.orders.update(orderId, { status: 'closed', closed_at: now });
            if (order.order_type === 'dine_in' && order.table_id) await window.db.table('tables').update(order.table_id, { status: 'available' });
            await window.db.accounting.add({ type: 'income', amount: order.final_total, description: `مبيعات فاتورة رقم #${orderId}`, order_id: orderId, date: now });
            return true;
        });
    },
    addExpense: async (amount, description) => { return await window.db.accounting.add({ type: 'expense', amount: parseFloat(amount), description: description, date: new Date().getTime() }); },
    getDailyReport: async (dateStart, dateEnd) => {
        const transactions = await window.db.accounting.where('date').between(dateStart, dateEnd).toArray();
        let totalIncome = 0; let totalExpense = 0;
        transactions.forEach(t => { if (t.type === 'income') totalIncome += t.amount; if (t.type === 'expense') totalExpense += t.amount; });
        return { totalIncome, totalExpense, netProfit: totalIncome - totalExpense, transactions };
    }
};