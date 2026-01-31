const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Post = require('../models/Post'); // --- FIX: Import Model chuẩn thay vì định nghĩa lại ---
const mongoose = require('mongoose'); // Thêm mongoose để tạo Model Activity
const fs = require('fs');
const axios = require('axios');

// --- Safe Require cho csv-parse ---
let parse;
try {
    parse = require('csv-parse/sync').parse;
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa cài đặt "csv-parse". Tính năng Import Google Sheets sẽ không hoạt động.');
}

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

// --- Activity Model & Helper (Thêm mới) ---
const ActivitySchema = new mongoose.Schema({
    actor_name: String,
    actor_role: String,
    action_type: { type: String, enum: ['create', 'update', 'delete'] },
    description: String,
    created_at: { type: Date, default: Date.now }
});
const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);

// --- Middleware phân quyền Admin ---
const adminOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
        next(); // Cho phép đi tiếp nếu là admin/owner
    } else {
        res.status(403).json({ success: false, message: 'Truy cập bị từ chối. Yêu cầu quyền Quản trị viên.' });
    }
};

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
        const newId = 'M' + Date.now() + Math.random().toString(36).substr(2, 9);
        const newPid = req.body.pid || null;

        const newMember = new Member({
            ...req.body,
            id: newId
        });
        await newMember.save();

        // Nếu có gán vợ/chồng, xử lý quan hệ 2 chiều và ngắt các liên kết cũ
        if (newPid) {
            // Tìm người vợ/chồng mới được gán
            const spouse = await Member.findOne({ id: newPid });
            // Nếu người đó đang có vợ/chồng khác, ngắt liên kết đó trước
            if (spouse && spouse.pid) {
                await Member.updateOne({ id: spouse.pid }, { $set: { pid: null } });
            }
            // Tạo liên kết 2 chiều mới
            await Member.updateOne({ id: newPid }, { $set: { pid: newId } });
        }

        logToDB(req, 'create', `Thêm thành viên: ${newMember.full_name}`);
        res.status(201).json(newMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi tạo thành viên: " + err.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params; // ID của member đang sửa (M)
        const newPid = req.body.pid || null; // ID của vợ/chồng mới (S_new)

        // Lấy trạng thái cũ của M để biết vợ/chồng cũ (S_old)
        const memberM_before = await Member.findOne({ id: id });
        if (!memberM_before) return res.status(404).json({ message: "Không tìm thấy thành viên" });
        const oldPid = memberM_before.pid || null;

        // Nếu quan hệ vợ/chồng không đổi, chỉ cần cập nhật và thoát
        if (oldPid === newPid) {
            const updatedMember = await Member.findOneAndUpdate({ id: id }, req.body, { new: true });
            return res.json(updatedMember);
        }

        // Ngắt liên kết của vợ/chồng cũ (S_old)
        if (oldPid) {
            await Member.updateOne({ id: oldPid }, { $set: { pid: null } });
        }

        // Ngắt liên kết của vợ/chồng hiện tại của S_new (nếu có) và gán liên kết mới
        if (newPid) {
            const memberS_new = await Member.findOne({ id: newPid });
            if (memberS_new && memberS_new.pid) {
                await Member.updateOne({ id: memberS_new.pid }, { $set: { pid: null } });
            }
            await Member.updateOne({ id: newPid }, { $set: { pid: id } }); // Gán S_new trỏ về M
        }

        // Cập nhật M với pid mới và các thông tin khác
        const updatedMember = await Member.findOneAndUpdate(
            { id: id }, 
            req.body, 
            { new: true } // Trả về dữ liệu mới sau khi update
        );
        logToDB(req, 'update', `Cập nhật thông tin: ${updatedMember.full_name}`);
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

        logToDB(req, 'delete', `Xóa thành viên: ${memberToDelete.full_name}`);
        res.json({ message: `Đã xóa thành viên "${memberToDelete.full_name}"` });
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        res.status(500).json({ message: "Lỗi server khi xóa thành viên: " + err.message });
    }
};

const exportToCSV = async (req, res) => {
    try {
        let members = [];
        const db = req.app.get('db'); // Lấy kết nối SQL (PostgreSQL)

        if (db) {
            // --- CHẾ ĐỘ SQL (Ưu tiên) ---
            const ownerId = req.user ? req.user.id : null;
            if (!ownerId) throw new Error("Chưa đăng nhập hoặc không xác định được người dùng");

            // 1. Lấy danh sách thành viên
            const people = await new Promise((resolve, reject) => {
                db.all(`SELECT * FROM people WHERE owner_id = ? ORDER BY generation, id`, [ownerId], (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });

            // 2. Lấy quan hệ cha-con để xác định fid (cha), mid (mẹ)
            const relationships = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT r.parent_id, r.child_id, p.gender as parent_gender
                    FROM relationships r
                    JOIN people p ON r.parent_id = p.id
                    WHERE p.owner_id = ?
                `, [ownerId], (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });

            // 3. Lấy quan hệ vợ chồng để xác định pid
            const marriages = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT m.husband_id, m.wife_id
                    FROM marriages m
                    JOIN people p ON m.husband_id = p.id
                    WHERE p.owner_id = ?
                `, [ownerId], (err, rows) => {
                    if (err) reject(err); else resolve(rows);
                });
            });

            // 4. Ghép dữ liệu
            const memberMap = {};
            people.forEach(p => {
                memberMap[p.id] = { ...p, fid: '', mid: '', pid: '' };
            });

            relationships.forEach(r => {
                if (memberMap[r.child_id]) {
                    if (r.parent_gender === 'Nam') memberMap[r.child_id].fid = r.parent_id;
                    else memberMap[r.child_id].mid = r.parent_id;
                }
            });

            marriages.forEach(m => {
                if (memberMap[m.husband_id]) memberMap[m.husband_id].pid = m.wife_id;
                if (memberMap[m.wife_id]) memberMap[m.wife_id].pid = m.husband_id;
            });

            members = Object.values(memberMap);
        } else if (Member) {
            // --- CHẾ ĐỘ MONGOOSE (Dự phòng) ---
            members = await Member.find().lean();
        }
        
        // Define headers based on user request, correcting typos
        const headers = [
            'id', 'full_name', 'gender', 'pid', 'fid', 'mid', 
            'generation', 'order', 'branch', 
            'birth_date', 'death_date', 'address', 'job', 'is_live'
        ];

        // Helper to escape commas, quotes, and newlines
        const escapeCsvValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            const strValue = String(value);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
        };

        // Create CSV content, starting with the header
        let csvContent = headers.join(',') + '\n';

        for (const member of members) {
            const row = headers.map(header => escapeCsvValue(member[header]));
            csvContent += row.join(',') + '\n';
        }

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename="giapha_export_${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send('\ufeff' + csvContent); // Add BOM for Excel to correctly open UTF-8
    } catch (error) {
        console.error('Lỗi khi xuất CSV:', error);
        res.status(500).json({ message: 'Lỗi server khi xuất file CSV: ' + error.message });
    }
};

const importSheets = async (req, res) => {
    if (!parse) {
        return res.status(500).json({ message: "Server thiếu thư viện 'csv-parse'. Vui lòng chạy lệnh: npm install csv-parse" });
    }

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
    
    // Hàm chuẩn hóa giới tính: Nữ/nu -> "Nữ", còn lại (bao gồm trống, Nam, male...) mặc định là "Nam"
    const normalizeGender = (val) => {
        const s = (val || '').trim().toLowerCase();
        if (s === 'nữ' || s === 'nu') {
            return 'Nữ';
        }
        // Mặc định là "Nam" cho tất cả các trường hợp còn lại để đảm bảo dữ liệu hợp lệ.
        // Điều này xử lý các trường hợp: 'nam', 'male', chuỗi trống, hoặc các giá trị không xác định khác.
        return 'Nam';
    };

    try {
        console.log('📥 Đang tải dữ liệu từ Google Sheets...');
        const [resData, resDData] = await Promise.all([axios.get(sheetDataUrl), axios.get(sheetDDataUrl)]);
        
        console.log(`📊 Dữ liệu tải về: Sheet1 (${resData.data.length} bytes), Sheet2 (${resDData.data.length} bytes)`);

        const config = { columns: h => h.map(i => i.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true };
        const records = parse(resData.data, config);
        const spouseRecords = parse(resDData.data, config);

        console.log(`✅ Đã parse: ${records.length} người, ${spouseRecords.length} vợ/chồng`);

        await Member.deleteMany({});

        const allPeople = [
            ...records.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha', 'ma cha', 'mã cha', 'bố', 'id bố', 'mã bố', 'bo']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ', 'ma me', 'mã mẹ', 'ma mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng', 'ma vo chong', 'mã vợ chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'địa chỉ', 'dia chi'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                generation: parseInt(getCol(r, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
                order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('S' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha', 'ma cha', 'mã cha', 'bố', 'id bố', 'mã bố', 'bo']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ', 'ma me', 'mã mẹ', 'ma mẹ']),
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng', 'ma vo chong', 'mã vợ chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'địa chỉ', 'dia chi'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                generation: parseInt(getCol(r, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
                order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
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
        logToDB(req, 'create', `Đồng bộ ${docs.length} thành viên từ Google Sheets`);
        res.json({ message: `Đã nạp thành công ${docs.length} thành viên từ Google Sheets!` });
    } catch (error) {
        console.error('Google Sheets Import Error:', error);
        res.status(500).json({ message: 'Lỗi khi nạp dữ liệu từ Google Sheets: ' + error.message });
    }
};

// --- Logic Xử lý Bài viết (Posts) ---

const getPosts = async (req, res) => {
    try {
        // Sắp xếp: Ghim lên đầu, sau đó đến ngày mới nhất
        const posts = await Post.find().sort({ is_pinned: -1, created_at: -1 });
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createPost = async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        let imagePath = '';
        
        if (req.file) {
            console.log('📸 Nhận được file:', req.file.path);
            // Xử lý đường dẫn ảnh: Hỗ trợ cả đường dẫn tuyệt đối (Windows) và tương đối
            let safePath = req.file.path.replace(/\\/g, '/');
            // Lấy phần đường dẫn sau thư mục 'public/' để tạo URL web hợp lệ
            if (safePath.includes('public/')) {
                safePath = safePath.split('public/').pop();
            }
            if (!safePath.startsWith('/')) safePath = '/' + safePath;
            imagePath = safePath;
        }

        const newPost = new Post({
            title,
            content,
            category,
            is_pinned: is_pinned === 'true' || is_pinned === true,
            image: imagePath
        });

        await newPost.save();
        await logToDB(req, 'create', `Đăng bài viết mới: ${title}`);
        res.json({ success: true, post: newPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const updatePost = async (req, res) => {
    try {
        const { title, content, category, is_pinned } = req.body;
        const updateData = { title, content, category, is_pinned: is_pinned === 'true' || is_pinned === true };

        if (req.file) {
            console.log('📸 Nhận được file cập nhật:', req.file.path);
            let imagePath = req.file.path.replace(/\\/g, '/');
            if (imagePath.includes('public/')) {
                imagePath = imagePath.split('public/').pop();
            }
            if (!imagePath.startsWith('/')) imagePath = '/' + imagePath;
            updateData.image = imagePath;
        }

        const updatedPost = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
        await logToDB(req, 'update', `Cập nhật bài viết: ${title}`);
        res.json({ success: true, post: updatedPost });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const deletePost = async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.id);
        await logToDB(req, 'delete', `Xóa bài viết ID: ${req.params.id}`);
        res.json({ success: true, message: 'Đã xóa bài viết' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Định nghĩa Routes ---

// Lấy danh sách thành viên (Có thể để công khai hoặc bảo vệ tùy bạn)
router.get('/members', auth, getMembers);

// Thêm thành viên mới (Cần đăng nhập)
router.post('/members', auth, adminOnly, createMember);

// Cập nhật thành viên (Sửa)
router.put('/members/:id', auth, adminOnly, updateMember);

// Xóa thành viên
router.delete('/members/:id', auth, adminOnly, deleteMember);

// Import Google Sheets
router.post('/import-sheets', auth, adminOnly, importSheets);

// THÊM MỚI: API lấy danh sách hoạt động
router.get('/activities', auth, async (req, res) => {
    try {
        const logs = await Activity.find().sort({ created_at: -1 }).limit(20);
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// THÊM MỚI: API xóa toàn bộ hoạt động
router.delete('/activities', auth, adminOnly, async (req, res) => {
    try {
        await Activity.deleteMany({});
        res.json({ success: true, message: 'Đã xóa sạch lịch sử hoạt động.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// THÊM MỚI: Route để xuất dữ liệu ra file CSV
router.get('/export-csv', auth, exportToCSV);

// THÊM MỚI: Route để import từ file CSV do người dùng tải lên
router.post('/import-csv', auth, adminOnly, upload.single('csvfile'), async (req, res) => {
    // 'csvfile' phải khớp với tên field trong FormData ở frontend
    if (!req.file) {
        return res.status(400).json({ message: 'Vui lòng tải lên một file CSV.' });
    }

    const filePath = req.file.path;

    try {
        // Gọi hàm importCSV từ utils/importers.js đã có sẵn
        const result = await importCSV(filePath);
        
        let message = `Nhập dữ liệu thành công! Đã thêm/cập nhật ${result.total} thành viên.`;
        if (result.orphans > 0) {
            message += `\n\n⚠️ Cảnh báo: Phát hiện ${result.orphans} thành viên không có liên kết cha/mẹ. Vui lòng kiểm tra lại các cột 'fid' và 'mid' trong file CSV.`;
        }
        logToDB(req, 'create', `Import file CSV: ${result.total} thành viên`);
        res.json({ message });
    } catch (error) {
        console.error('Lỗi khi import CSV:', error);
        res.status(500).json({ message: 'Lỗi xử lý file CSV: ' + error.message });
    } finally {
        // Xóa file tạm sau khi xử lý xong để dọn dẹp server
        fs.unlink(filePath, (err) => {
            if (err) console.error("Lỗi xóa file tạm:", err);
        });
    }
});

// --- Routes cho Bài viết ---
router.get('/posts', auth, getPosts);
router.get('/posts/:id', auth, getPostById);
router.post('/posts', auth, adminOnly, upload.single('image'), createPost); // Hỗ trợ upload ảnh
router.put('/posts/:id', auth, adminOnly, upload.single('image'), updatePost);
router.delete('/posts/:id', auth, adminOnly, deletePost);

module.exports = router;