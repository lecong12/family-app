const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs'); // Thêm thư viện mã hóa

// --- CẤU HÌNH ---
// Bạn hãy thay đổi chuỗi kết nối dưới đây cho đúng với MongoDB của bạn
// Ví dụ: 'mongodb://127.0.0.1:27017/family-app' hoặc chuỗi kết nối Atlas
const MONGO_URI = 'mongodb://127.0.0.1:27017/family-app';
// ----------------

async function createAdmin() {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // Ngắt kết nối sau 5s nếu không tìm thấy DB
        });
        console.log('Đã kết nối tới MongoDB.');

        const targetUsername = 'admin';
        const targetRole = 'admin';
        
        // Mã hóa mật khẩu "123" trước khi lưu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123', salt);

        // Tìm xem user có tồn tại không
        // Sử dụng .find() thay vì .findOne() để phát hiện nếu có tài khoản trùng lặp
        const users = await User.find({ username: targetUsername });

        if (users.length > 0) {
            // Lấy tài khoản đầu tiên tìm thấy để cấp quyền
            const user = users[0];
            
            if (users.length > 1) {
                console.warn(`⚠️ CẢNH BÁO: Phát hiện ${users.length} tài khoản trùng tên "${targetUsername}"!`);
                console.warn(`👉 Hệ thống sẽ cấp quyền cho tài khoản có ID: ${user._id}`);
                console.warn(`👉 Bạn nên xóa các tài khoản trùng lặp khác để tránh lỗi đăng nhập.`);
            }

            console.log(`Tìm thấy tài khoản "${targetUsername}" (ID: ${user._id}). Đang cập nhật quyền...`);
            user.role = targetRole;
            user.password = hashedPassword; // Cập nhật lại password đã mã hóa để đảm bảo đăng nhập được
            await user.save();
            console.log('Cập nhật thành công! Tài khoản này giờ là Admin. Mật khẩu là: 123');
        } else {
            console.log(`Không tìm thấy tài khoản "${targetUsername}". Đang tạo mới...`);
            // Lưu ý: Nếu dự án của bạn có dùng bcrypt để mã hóa password trong Controller,
            // bạn có thể sẽ không đăng nhập được bằng password plain-text này.
            user = new User({
                username: targetUsername,
                password: hashedPassword, // Sử dụng mật khẩu đã mã hóa
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