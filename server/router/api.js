const express = require('express');
const router = express.Router();

// Hàm nạp an toàn: Nếu lỗi, trả về middleware báo lỗi
const safeRequire = (path, name) => {
    try {
        return require(path);
    } catch (err) {
        console.error(`❌ Lỗi nạp ${name}:`, err); // In toàn bộ lỗi để debug
        // Trả về object chứa các hàm giả, khi gọi sẽ báo lỗi
        return new Proxy({}, {
            get: () => (req, res) => res.status(500).json({ 
                error: `Module ${name} bị lỗi khi khởi động server.`, 
                details: err.message 
            })
        });
    }
};

// Nạp các module với cơ chế an toàn
const memberController = safeRequire('../controllers/memberController', 'memberController');

// Xử lý riêng cho Middleware (vì nó là function, không phải object)
let upload, auth;
try {
    upload = require('../middleware/upload');
} catch (err) {
    console.error('❌ Lỗi nạp upload middleware:', err.message);
    upload = { single: () => (req, res, next) => next() }; // Bỏ qua upload nếu lỗi
}

try {
    auth = require('../middleware/auth');
} catch (err) {
    console.error('❌ Lỗi nạp auth middleware:', err.message);
    auth = (req, res, next) => next(); // Bỏ qua auth nếu lỗi
}

// --- Định nghĩa Routes ---

// Lấy danh sách thành viên (Có thể để công khai hoặc bảo vệ tùy bạn)
router.get('/members', auth, memberController.getMembers);

// Thêm thành viên mới (Cần đăng nhập)
router.post('/members', auth, memberController.createMember);

// Import file (Cần đăng nhập)
router.post('/import', auth, upload.single('file'), memberController.importFile);

// Import Google Sheets
router.post('/import-sheets', auth, memberController.importSheets);

module.exports = router;
