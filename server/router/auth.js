const express = require('express');
const router = express.Router();

let authController;
try {
    authController = require('../controllers/authController');
} catch (err) {
    console.error('❌ Lỗi nạp authController:', err.message);
    // Controller dự phòng báo lỗi
    authController = {
        register: (req, res) => res.status(500).json({ error: 'authController lỗi', details: err.message }),
        login: (req, res) => res.status(500).json({ error: 'authController lỗi', details: err.message })
    };
}

router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;