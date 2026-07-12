// backend/deleteAllReviews.js
require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('./models/Review');

async function deleteAllReviews() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ متصل بقاعدة البيانات');

        // حذف جميع التقييمات
        const result = await Review.deleteMany({});
        console.log(`🗑️ تم حذف ${result.deletedCount} تقييم`);

        // تحديث متوسط التقييمات في جميع الصالونات
        const Salon = require('./models/Salon');
        const salons = await Salon.find();
        for (const salon of salons) {
            const reviews = await Review.find({ salonId: salon._id });
            const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
            salon.rating = Math.round(avg * 10) / 10;
            salon.totalReviews = reviews.length;
            await salon.save();
            console.log(`✅ تم تحديث صالون: ${salon.name} (${salon.totalReviews} تقييم)`);
        }

        console.log('✅ تم الانتهاء من حذف التقييمات وتحديث الصالونات');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ:', error);
        process.exit(1);
    }
}

deleteAllReviews();
