const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'family-secret-key-123';

const auth = (req, res, next) => {
    // Lấy token từ header (Dạng: Bearer <token>)
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'Truy cập bị từ chối. Vui lòng đăng nhập.' });
    }

    try {
        // Xác thực token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Lưu thông tin user vào request để dùng sau này
        next();
    } catch (e) {
        res.status(401).json({ message: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
    }
};

module.exports = auth;

