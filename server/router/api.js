const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const fs = require('fs');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

console.log('✅ API Router đang khởi động...'); // Log kiểm tra phiên bản mới

console.log('✅ API Router đang khởi động...'); // Log kiểm tra phiên bản mới

// Nạp importers an toàn (nếu lỗi thì tính năng import file sẽ báo lỗi, nhưng web vẫn chạy)
let importCSV, importExcel, importGedcom;
try {
    const importers = require('../utils/importers');
    importCSV = importers.importCSV;
    importExcel = importers.importExcel;
    importGedcom = importers.importGedcom;
} catch (e) {
    console.error('❌ Lỗi nạp importers:', e.message);
    const dummyImporter = async () => { throw new Error('Module importers lỗi: ' + e.message); };
    importCSV = importExcel = importGedcom = dummyImporter;
}

// Xử lý riêng cho Middleware
let upload, auth;
try { upload = require('../middleware/upload'); } 
catch (e) { upload = { single: () => (req, res, next) => next() }; console.error('Lỗi upload:', e.message); }

try { auth = require('../middleware/auth'); } 
catch (e) { auth = (req, res, next) => next(); console.error('Lỗi auth:', e.message); }

// --- Logic Xử lý Trực tiếp (Thay thế memberController) ---

const getMembers = async (req, res) => {
    try {
        const members = await Member.find().sort({ generation: 1, order: 1 });
        res.json(members);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const createMember = async (req, res) => {
    try {
        const newMember = new Member({
            ...req.body,
            id: req.body.id || 'M' + Date.now()
        });
        await newMember.save();
        res.json(newMember);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const importFile = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn file' });
    
    const filePath = req.file.path;
    try {
        let count = 0;
        const lowerName = req.file.originalname.toLowerCase();
        
        if (lowerName.endsWith('.csv')) count = await importCSV(filePath);
        else if (lowerName.match(/\.xlsx?$/)) count = await importExcel(filePath);
        else if (lowerName.endsWith('.ged')) count = await importGedcom(filePath);
        
        res.json({ message: `Đã import ${count} người.` });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi xử lý file: ' + error.message });
    } finally {
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch(e) {}
        }
    }
};

const importSheets = async (req, res) => {
    const sheetDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1705210560&single=true&output=csv";
    const sheetDDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1565376107&single=true&output=csv";
    const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";
    
    // Hàm hỗ trợ lấy dữ liệu linh hoạt (Tiếng Anh/Việt)
    const getCol = (row, keys) => {
        const rowKeys = Object.keys(row);
        for (const key of keys) {
            const match = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
            if (match && row[match]) return row[match].trim();
        }
        return null;
    };

    try {
        const [resData, resDData] = await Promise.all([axios.get(sheetDataUrl), axios.get(sheetDDataUrl)]);
        const config = { columns: h => h.map(i => i.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true };
        const records = parse(resData.data, config);
        const spouseRecords = parse(resDData.data, config);

        await Member.deleteMany({});

        const allPeople = [
            ...records.map(r => ({
                ...r,
                id: r.id || r['mã'] || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng']),
                full_name: r.full_name?.trim() || 'Chưa có tên',
                is_live: r.is_live !== '0',
                gender: (r.gender || '').includes('Nữ') ? 'Nữ' : 'Nam',
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                id: r.id || r['mã'] || ('S' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng']),
                full_name: r.full_name?.trim() || 'Chưa có tên',
                is_live: r.is_live !== '0',
                gender: (r.gender || '').includes('Nam') ? 'Nam' : 'Nữ',
                temp_id: `spouse_${clean(r.id)}`
            }))
        ];

        // Lọc trùng lặp và loại bỏ dữ liệu rác (dòng trống)
        const uniquePeopleMap = new Map();
        allPeople.forEach(person => {
            // Bỏ qua nếu tên là "Chưa có tên" (do dòng trống sinh ra)
            if (person.full_name === 'Chưa có tên') return;

            // Chỉ thêm vào nếu ID chưa có trong Map
            if (person.id && !uniquePeopleMap.has(person.id)) {
                uniquePeopleMap.set(person.id, person);
            }
        });
        const uniquePeople = Array.from(uniquePeopleMap.values());

        const docs = await Member.insertMany(uniquePeople);
        res.json({ message: `Đã nạp thành công ${docs.length} thành viên từ Google Sheets!` });
    } catch (error) {
        console.error('Google Sheets Import Error:', error);
        res.status(500).json({ message: 'Lỗi khi nạp dữ liệu từ Google Sheets: ' + error.message });
    }
};

// --- Định nghĩa Routes ---

// Lấy danh sách thành viên (Có thể để công khai hoặc bảo vệ tùy bạn)
router.get('/members', auth, getMembers);

// Thêm thành viên mới (Cần đăng nhập)
router.post('/members', auth, createMember);

// Import file (Cần đăng nhập)
router.post('/import', auth, upload.single('file'), importFile);

// Import Google Sheets
router.post('/import-sheets', auth, importSheets);

module.exports = router;
