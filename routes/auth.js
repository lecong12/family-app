// c:\Users\129\family-app\routes\auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import model User

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
        const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '365d' });
        return res.json({ message: 'Đăng nhập Admin thành công', token });
    }

    // 2. Kiểm tra trong Database
    try {
        const user = await User.findOne({ username });
        // So sánh password (đang ở dạng plain text, nên nâng cấp lên bcrypt sau này)
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        const token = jwt.sign({ username: user.username, id: user._id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ message: 'Đăng nhập thành công', token });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
    }
});

module.exports = router;
