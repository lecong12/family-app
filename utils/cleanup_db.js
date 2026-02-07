require('dotenv').config();
const mongoose = require('mongoose');
const Member = require('../models/Member');

// Lấy chuỗi kết nối từ biến môi trường hoặc dùng mặc định
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://lecong12:Lecong78@cluster0.onrzjrx.mongodb.net/family-app?retryWrites=true&w=majority';

const cleanup = async () => {
    try {
        console.log('🔌 Đang kết nối Database...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Kết nối thành công!');

        console.log('🧹 Bắt đầu dọn dẹp và chuẩn hóa dữ liệu...');
        
        // Lấy toàn bộ dữ liệu dạng plain object (lean) để xử lý thủ công
        const allMembers = await Member.find().lean();
        let count = 0;

        console.log(`   - Đang xử lý sắp xếp lại ${allMembers.length} bản ghi...`);

        for (const m of allMembers) {
            // 1. Tách các trường ra để sắp xếp
            const { 
                _id, 
                __v,      // Tách ra để loại bỏ (ẩn)
                images,   // Tách ra để loại bỏ (xóa)
                createdAt, 
                updatedAt, 
                image,    // Tách ra để đưa lên trên
                address,  // Tách ra để đảm bảo có
                note,     // Tách ra để đảm bảo có
                ...others // Các trường còn lại (id, full_name, gender...)
            } = m;
            
            // 2. Tạo object mới theo thứ tự mong muốn
            const newDoc = { 
                _id, 
                ...others,
                address: address || "", // Bổ sung nếu thiếu
                note: note || "",       // Bổ sung nếu thiếu
                image: image || ""      // Đưa image lên trước timestamp
            };

            // 3. Đưa createdAt và updatedAt xuống cuối cùng
            if (createdAt) newDoc.createdAt = createdAt;
            if (updatedAt) newDoc.updatedAt = updatedAt;
            
            // 4. Ghi đè lại document (Sử dụng native driver để tránh Mongoose tự thêm lại __v)
            await mongoose.connection.db.collection('members').replaceOne({ _id: _id }, newDoc);
            count++;
        }

        console.log(`✨ Hoàn tất! Đã dọn dẹp và sắp xếp lại ${count} bản ghi.`);
        process.exit(0);
    } catch (e) {
        console.error('❌ Lỗi:', e);
        process.exit(1);
    }
};

cleanup();