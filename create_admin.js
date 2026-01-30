const mongoose = require('mongoose');
const User = require('./models/User');

// --- CẤU HÌNH ---
// Bạn hãy thay đổi chuỗi kết nối dưới đây cho đúng với MongoDB của bạn
// Ví dụ: 'mongodb://127.0.0.1:27017/family-app' hoặc chuỗi kết nối Atlas
const MONGO_URI = 'mongodb://127.0.0.1:27017/family-app';
// ----------------

async function createAdmin() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Đã kết nối tới MongoDB.');

        const targetUsername = 'admin';
        const targetRole = 'admin';
        
        // Tìm xem user có tồn tại không
        let user = await User.findOne({ username: targetUsername });

        if (user) {
            console.log(`Tìm thấy tài khoản "${targetUsername}". Đang cập nhật quyền...`);
            user.role = targetRole;
            await user.save();
            console.log('Cập nhật thành công! Tài khoản này giờ là Admin.');
        } else {
            console.log(`Không tìm thấy tài khoản "${targetUsername}". Đang tạo mới...`);
            // Lưu ý: Nếu dự án của bạn có dùng bcrypt để mã hóa password trong Controller,
            // bạn có thể sẽ không đăng nhập được bằng password plain-text này.
            user = new User({
                username: targetUsername,
                password: '123', // Mật khẩu mặc định
                role: targetRole
            });
            await user.save();
            console.log('Tạo mới thành công! Username: admin, Password: 123');
        }
    } catch (error) {
        console.error('Lỗi:', error);
    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();