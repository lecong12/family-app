const express = require('express');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const Member = require('../models/Member');
const { importCSV, importGedcom } = require('../utils/importers');
const upload = multer({ dest: 'uploads/' });

// Lấy toàn bộ danh sách
router.get('/members', async (req, res) => {
    try {
        const members = await Member.find().sort({ generation: 1, order: 1 });
        res.json(members);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// Thêm thành viên mới
router.post('/members', async (req, res) => {
    try {
        const newId = "M" + Date.now();
        const member = new Member({ ...req.body, id: newId });
        await member.save();
        if (req.body.pid) await Member.findOneAndUpdate({ id: req.body.pid }, { pid: newId });
        res.json(member);
    } catch (e) { res.status(500).json({error: e.message}); }
});

// Import file
router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn file.' });
    const filePath = req.file.path;
    try {
        let count = 0;
        if (req.file.originalname.endsWith('.csv')) count = await importCSV(filePath);
        else if (req.file.originalname.endsWith('.ged')) count = await importGedcom(filePath);
        res.json({ message: `Đã import ${count} người.` });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi xử lý file: ' + error.message });
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});
module.exports = router;
