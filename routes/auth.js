const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Thêm thư viện để kiểm tra mật khẩu mã hóa
const User = require('../models/User'); // Import model User
const auth = require('../middleware/auth'); // Import middleware xác thực

// Secret key (Nên đặt trong file .env)
const JWT_SECRET = process.env.JWT_SECRET || 'family-secret-key-123';

// Route: POST /api/auth/register (Thêm mới)
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'Vui lòng nhập đủ thông tin' });

        // Kiểm tra user tồn tại
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });

        // Tạo user mới
        const newUser = new User({ username, password });
        await newUser.save();

        res.json({ message: 'Đăng ký thành công! Vui lòng đăng nhập.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server khi đăng ký' });
    }
});

// Route: POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // 1. Giữ lại tài khoản Admin mặc định (Backdoor)
    if (username === 'admin' && password === '123456') {
        // Nâng cấp quyền backdoor lên 'owner' để đồng bộ với DB
        const token = jwt.sign({ username: 'admin', role: 'owner' }, JWT_SECRET, { expiresIn: '365d' });
        return res.json({ message: 'Đăng nhập Admin thành công', token, role: 'owner', username: 'admin' });
    }

    // 2. Kiểm tra trong Database
    try {
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        // Kiểm tra mật khẩu: Hỗ trợ cả plain-text (cũ) và bcrypt (mới do create_admin tạo)
        const isMatch = user.password === password || await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        // QUAN TRỌNG: Thêm 'role' vào payload của Token để middleware adminOnly hoạt động
        const role = user.role || 'viewer';
        const token = jwt.sign({ username: user.username, id: user._id, role: role }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ message: 'Đăng nhập thành công', token, role, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
    }
});

// --- CÁC API QUẢN LÝ TÀI KHOẢN (Dành cho Owner/Admin) ---

// Middleware kiểm tra quyền Admin/Owner
const adminOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này.' });
    }
};

// 1. Lấy danh sách tài khoản
router.get('/users', auth, adminOnly, async (req, res) => {
    try {
        // Lấy tất cả user, trừ password, sắp xếp mới nhất lên đầu
        const users = await User.find({}, '-password').sort({ _id: -1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Tạo tài khoản mới từ Web
router.post('/users', auth, adminOnly, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và mật khẩu.' });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            role: role || 'viewer' 
        });
        await newUser.save();

        res.json({ success: true, message: 'Tạo tài khoản thành công!', user: { username, role } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Cập nhật tài khoản (Sửa vai trò, mật khẩu)
router.put('/users/:id', auth, adminOnly, async (req, res) => {
    try {
        const { password, role } = req.body;
        const userToUpdate = await User.findById(req.params.id);

        if (!userToUpdate) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
        }

        // --- Các quy tắc bảo mật ---
        // 1. Không cho phép tự sửa vai trò của chính mình
        if (req.user.id === req.params.id && role && userToUpdate.role !== role) {
            return res.status(400).json({ success: false, message: 'Không thể tự thay đổi vai trò của chính mình.' });
        }
        
        // 2. Chỉ 'owner' mới có quyền sửa tài khoản 'admin' hoặc 'owner' khác
        if ((userToUpdate.role === 'admin' || userToUpdate.role === 'owner') && req.user.role !== 'owner') {
            return res.status(403).json({ success: false, message: 'Chỉ Chủ sở hữu (Owner) mới có quyền sửa tài khoản Quản trị viên.' });
        }

        // Cập nhật vai trò (nếu có)
        if (role) {
            // Không cho phép gán quyền 'owner' qua API, trừ khi người thực hiện là 'owner'
            if (role === 'owner' && req.user.role !== 'owner') {
                 return res.status(403).json({ success: false, message: 'Bạn không có quyền gán vai trò Chủ sở hữu.' });
            }
            userToUpdate.role = role;
        }

        // Cập nhật mật khẩu (nếu người dùng có nhập)
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            userToUpdate.password = await bcrypt.hash(password, salt);
        }

        await userToUpdate.save();
        res.json({ success: true, message: 'Cập nhật tài khoản thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Xóa tài khoản
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
    try {
        // Không cho phép tự xóa chính mình
        if (req.user.id === req.params.id) {
            return res.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản của mình.' });
        }
        
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
        
        if (userToDelete.username === 'admin') {
            return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Admin gốc.' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Đã xóa tài khoản.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
