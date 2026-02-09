require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs'); // Thêm thư viện mã hóa

const MONGO_URI = process.env.MONGO_URI;

async function createAccounts() {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // Ngắt kết nối sau 5s nếu không tìm thấy DB
        });
        console.log('✅ Đã kết nối tới MongoDB Atlas (Cloud).');

        // Danh sách tài khoản cần tạo
        const accounts = [
            { username: 'admin', password: '123', role: 'owner', label: 'QUẢN TRỊ VIÊN' },
            { username: 'khach', password: '123', role: 'viewer', label: 'NGƯỜI XEM (KHÁCH)' },
            { username: 'p1', password: '123', role: 'branch_1', label: 'TRƯỞNG PHÁI 1' },
            { username: 'p2', password: '123', role: 'branch_2', label: 'TRƯỞNG PHÁI 2' },
            { username: 'p3', password: '123', role: 'branch_3', label: 'TRƯỞNG PHÁI 3' },
            { username: 'p4', password: '123', role: 'branch_4', label: 'TRƯỞNG PHÁI 4' },
            { username: 'conchau', password: '123', role: 'viewer', label: 'THÀNH VIÊN (CON CHÁU)' }
        ];

        const salt = await bcrypt.genSalt(10);

        for (const acc of accounts) {
            const hashedPassword = await bcrypt.hash(acc.password, salt);
            
            // Tìm xem user có tồn tại không
            const users = await User.find({ username: acc.username });

            if (users.length > 0) {
                // Cập nhật tài khoản cũ
                const user = users[0];
                
                if (users.length > 1) {
                    console.warn(`⚠️ CẢNH BÁO: Có nhiều tài khoản trùng tên "${acc.username}". Đang cập nhật ID: ${user._id}`);
                }

                console.log(`🔄 Đang cập nhật tài khoản "${acc.username}" thành quyền [${acc.role}]...`);
                user.role = acc.role;
                user.password = hashedPassword;
                await user.save();
                console.log(`✅ ${acc.label}: Cập nhật thành công! (User: ${acc.username} / Pass: ${acc.password})`);
            } else {
                // Tạo mới
                console.log(`🆕 Đang tạo mới tài khoản "${acc.username}"...`);
                const newUser = new User({
                    username: acc.username,
                    password: hashedPassword,
                    role: acc.role
                });
                await newUser.save();
                console.log(`✅ ${acc.label}: Tạo mới thành công! (User: ${acc.username} / Pass: ${acc.password})`);
            }
        }

    } catch (error) {
        console.error('Lỗi:', error);
    } finally {
        await mongoose.disconnect();
    }
}

createAccounts();