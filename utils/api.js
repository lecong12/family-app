const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const fs = require('fs');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

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
        // 1. Tạo ID mới ngẫu nhiên và an toàn hơn, tránh trùng lặp khi thêm nhanh
        const newId = 'M' + Date.now() + Math.random().toString(36).substr(2, 9);

        const newMember = new Member({
            ...req.body,
            id: newId
        });
        await newMember.save();

        // 2. Nếu có thêm vợ/chồng (pid), cập nhật 2 chiều cho người đó
        // Điều này đảm bảo mối quan hệ luôn được kết nối đúng trên cây gia phả
        if (req.body.pid) {
            await Member.findOneAndUpdate(
                { id: req.body.pid }, // Tìm người vợ/chồng đã có
                { pid: newId },      // Cập nhật pid của họ để trỏ về người mới
                { new: true }
            );
        }

        // Trả về mã 201 (Created) và thông tin thành viên vừa tạo
        res.status(201).json(newMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi tạo thành viên: " + err.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedMember = await Member.findOneAndUpdate(
            { id: id }, 
            req.body, 
            { new: true } // Trả về dữ liệu mới sau khi update
        );
        if (!updatedMember) return res.status(404).json({ message: "Không tìm thấy thành viên" });
        res.json(updatedMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi cập nhật: " + err.message });
    }
};

const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const memberToDelete = await Member.findOne({ id: id });
        if (!memberToDelete) {
            return res.status(404).json({ message: "Không tìm thấy thành viên để xóa" });
        }

        // Xóa thành viên khỏi database
        await Member.deleteOne({ id: id });

        // Cập nhật lại các thành viên khác có liên quan (gỡ bỏ liên kết)
        await Member.updateMany({ fid: id }, { $set: { fid: null } }); // Gỡ liên kết cha
        await Member.updateMany({ mid: id }, { $set: { mid: null } }); // Gỡ liên kết mẹ
        await Member.updateMany({ pid: id }, { $set: { pid: null } }); // Gỡ liên kết vợ/chồng

        res.json({ message: `Đã xóa thành viên "${memberToDelete.full_name}"` });
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        res.status(500).json({ message: "Lỗi server khi xóa thành viên: " + err.message });
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
                id: getCol(r, ['id', 'mã', 'ma', 'code']) || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: r.is_live !== '0',
                gender: (getCol(r, ['gender', 'sex', 'giới tính', 'phái']) || '').includes('Nữ') ? 'Nữ' : 'Nam',
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code']) || ('S' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: r.is_live !== '0',
                gender: (getCol(r, ['gender', 'sex', 'giới tính', 'phái']) || '').includes('Nam') ? 'Nam' : 'Nữ',
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

// Cập nhật thành viên (Sửa)
router.put('/members/:id', auth, updateMember);

// Xóa thành viên
router.delete('/members/:id', auth, deleteMember);

// Import Google Sheets
router.post('/import-sheets', auth, importSheets);

module.exports = router;