const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');

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
