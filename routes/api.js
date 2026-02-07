const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Post = require('../models/Post'); // Thêm Model Post
const fs = require('fs');
const axios = require('axios');

// --- FIX: Safe Require cho csv-parse (Tránh sập server nếu thiếu thư viện) ---
let parse;
try {
    parse = require('csv-parse/sync').parse;
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa cài đặt "csv-parse". Tính năng Import Google Sheets sẽ không hoạt động.');
}

// --- Safe Require cho googleapis ---
let google;
try {
    const googleApis = require('googleapis');
    google = googleApis.google;
} catch (e) {
    console.warn('⚠️ CẢNH BÁO: Chưa cài đặt "googleapis".');
}

const mongoose = require('mongoose');

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

// --- Activity Model & Helper ---
const ActivitySchema = new mongoose.Schema({
    actor_name: String,
    actor_role: String,
    action_type: { type: String, enum: ['create', 'update', 'delete'] },
    description: String,
    created_at: { type: Date, default: Date.now }
});
const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);

const logToDB = async (req, action, description) => {
    try {
        const actor_name = (req.user && req.user.username) ? req.user.username : 'Unknown';
        const actor_role = (req.user && req.user.role) ? req.user.role : 'viewer';
        await Activity.create({ actor_name, actor_role, action_type: action, description });
    } catch (e) {
        console.error('Log Error:', e);
    }
};

// --- Middleware phân quyền Admin ---
const adminOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
        next(); 
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này.' });
    }
};

// --- HÀM ĐỒNG BỘ REAL-TIME (Copy từ utils/api.js sang để dự phòng) ---
function mapMemberToRow(m, type) {
    const fmtLive = (v) => {
        if (v === true || v === 'true' || v === 1 || v === '1') return '1';
        return '0';
    };
    const val = (v) => (v === null || v === undefined) ? '' : String(v);

    // --- FIX: Hàm làm sạch ID cha/mẹ (loại bỏ ngày tháng bị lưu nhầm và đời 1) ---
    const valParent = (v) => {
        const s = val(v);
        if (m.generation == 1) return ''; // Đời 1 không có cha mẹ
        if (s.includes('/')) return '';   // Nếu chứa dấu '/' (ngày tháng) thì bỏ
        return s;
    };

    if (type === 'Data') {
        // Sheet Data (16 cột: A -> P)
        // id, full_name, gender, fid, mid, birth_date, death_date, is_live, branch, generation, order, phone, address, job, note, image
        return [
            val(m.id), val(m.full_name), val(m.gender),
            valParent(m.fid), valParent(m.mid),
            val(m.birth_date), val(m.death_date), fmtLive(m.is_live),
            val(m.branch), val(m.generation), val(m.order),
            val(m.phone), val(m.address), val(m.job), val(m.note), val(m.image)
        ];
    } else {
        // Sheet dData: id, full_name, gender, pid, birth_date, death_date, is_live, branch, generation, order, phone, address, job, note, image
        return [
            val(m.id), val(m.full_name), val(m.gender), val(m.pid),
            val(m.birth_date), val(m.death_date), fmtLive(m.is_live),
            val(m.branch), val(m.generation), val(m.order), val(m.phone), val(m.address), val(m.job), val(m.note), val(m.image)
        ];
    }
}

async function syncToSheetRealtime(member) {
    if (!google || !process.env.GOOGLE_SHEET_ID) return;
    try {
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const SHEET_ID = process.env.GOOGLE_SHEET_ID;

        const id = parseInt(member.id);
        if (isNaN(id)) return;

        const isData = id < 5001;
        const sheetName = isData ? 'Data' : 'dData';
        const rowData = mapMemberToRow(member, sheetName);

        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A:A` });
        const rows = res.data.values || [];
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (String(rows[i][0]).trim() === String(id)) { rowIndex = i + 1; break; }
        }

        if (rowIndex > 0) {
            const rangeEnd = isData ? 'P' : 'O';
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A${rowIndex}:${rangeEnd}${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            console.log(`✅ [Real-time] Đã cập nhật ID ${id} tại dòng ${rowIndex} sheet ${sheetName}`);
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            console.log(`✅ [Real-time] Đã thêm mới ID ${id} vào sheet ${sheetName}`);
        }
    } catch (e) { console.error('❌ [Real-time] Lỗi:', e.message); }
}

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
        
        // Xử lý ảnh upload
        let imagePath = '';
        if (req.file) {
            let safePath = req.file.path.replace(/\\/g, '/');
            if (safePath.includes('public/')) {
                safePath = safePath.split('public/').pop();
            } else if (safePath.includes('uploads/')) {
                safePath = 'uploads/' + safePath.split('uploads/').pop();
            }
            if (!safePath.startsWith('/')) safePath = '/' + safePath;
            imagePath = safePath;
        }
        console.log('📸 Dữ liệu tạo thành viên:', { ...req.body, image: imagePath });

        const newMember = new Member({
            ...req.body,
            image: imagePath, // Lưu đường dẫn ảnh
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

        // --- KÍCH HOẠT ĐỒNG BỘ REAL-TIME ---
        syncToSheetRealtime(newMember);

        await logToDB(req, 'create', `Thêm thành viên: ${newMember.full_name}`);
        res.status(201).json(newMember);
    } catch (err) {
        res.status(400).json({ message: "Lỗi tạo thành viên: " + err.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params; // ID của member đang sửa (M)
        const newPid = req.body.pid || null; // ID của vợ/chồng mới (S_new)
        
        // Xử lý ảnh upload (nếu có)
        let updateData = { ...req.body };
        if (req.file) {
            let safePath = req.file.path.replace(/\\/g, '/');
            if (safePath.includes('public/')) {
                safePath = safePath.split('public/').pop();
            } else if (safePath.includes('uploads/')) {
                safePath = 'uploads/' + safePath.split('uploads/').pop();
            }
            if (!safePath.startsWith('/')) safePath = '/' + safePath;
            updateData.image = safePath;
        }
        console.log('📸 Dữ liệu cập nhật:', updateData);

        // Lấy trạng thái cũ của M để biết vợ/chồng cũ (S_old)
        const memberM_before = await Member.findOne({ id: id });
        if (!memberM_before) return res.status(404).json({ message: "Không tìm thấy thành viên" });
        const oldPid = memberM_before.pid || null;

        // Nếu quan hệ vợ/chồng không đổi, chỉ cần cập nhật và thoát
        if (oldPid === newPid) {
            const updatedMember = await Member.findOneAndUpdate({ id: id }, updateData, { new: true });
            await logToDB(req, 'update', `Cập nhật thông tin: ${updatedMember.full_name}`);
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

        // --- LOGIC GHI NHẬN THAY ĐỔI TÌNH TRẠNG SỐNG ---
        let logMsg = `Cập nhật thông tin: ${memberM_before.full_name}`;
        if (req.body.is_live !== undefined) {
            const oldStatus = (memberM_before.is_live === true || memberM_before.is_live === 'true' || memberM_before.is_live === 1);
            const newStatus = (req.body.is_live === true || req.body.is_live === 'true' || req.body.is_live === 1);
            
            if (oldStatus !== newStatus) {
                logMsg = `Đổi trạng thái: ${memberM_before.full_name} sang ${newStatus ? 'Còn sống' : 'Đã mất'}`;
            }
        }

        // Cập nhật M với pid mới và các thông tin khác
        const updatedMember = await Member.findOneAndUpdate(
            { id: id }, 
            updateData, 
            { new: true } // Trả về dữ liệu mới sau khi update
        );

        // --- KÍCH HOẠT ĐỒNG BỘ REAL-TIME ---
        syncToSheetRealtime(updatedMember);

        await logToDB(req, 'update', logMsg);
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

        await logToDB(req, 'delete', `Xóa thành viên: ${memberToDelete.full_name}`);
        res.json({ message: `Đã xóa thành viên "${memberToDelete.full_name}"` });
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        res.status(500).json({ message: "Lỗi server khi xóa thành viên: " + err.message });
    }
};

const exportToCSV = async (req, res) => {
    try {
        const members = await Member.find().lean(); // .lean() for performance

        // Define headers based on user request, correcting typos
        const headers = [
            'id', 'full_name', 'gender', 'fid', 'mid', 'pid',
            'birth_date', 'death_date', 'is_live', 'branch',
            'generation', 'order', 'phone', 'address', 'job', 'note', 'image'
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
            const row = headers.map(header => {
                let val = member[header];
                
                // --- FIX: Chuẩn hóa giới tính (Nam/Nữ) ---
                if (header === 'gender') {
                    const s = String(val || '').trim().toLowerCase();
                    if (s === 'nữ' || s === 'nu' || s === 'female' || s === 'f') val = 'Nữ';
                    else val = 'Nam';
                }
                
                // --- FIX: Chuẩn hóa trạng thái (1/0) ---
                if (header === 'is_live') {
                    if (val === undefined || val === null) val = true;
                    val = (val === true || val === 'true' || val === 1 || val === '1') ? '1' : '0';
                }

                return escapeCsvValue(val);
            });
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

// --- Logic Xuất ngược lên Google Sheets (Sync Up) ---
const exportToGoogleSheets = async (req, res) => {
    try {
        if (!google) return res.status(500).json({ message: "Server thiếu thư viện 'googleapis'." });

        // 1. Kiểm tra cấu hình môi trường
        const SHEET_ID = process.env.GOOGLE_SHEET_ID;
        const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
            return res.status(500).json({ 
                message: `Thiếu cấu hình: ${!SHEET_ID ? 'SHEET_ID ' : ''}${!CLIENT_EMAIL ? 'CLIENT_EMAIL ' : ''}${!PRIVATE_KEY ? 'PRIVATE_KEY' : ''}. Xem Terminal để biết chi tiết.` 
            });
        }

        // 2. Lấy dữ liệu từ MongoDB
        const members = await Member.find().select('-__v -_id').lean();
        if (members.length === 0) {
            return res.status(400).json({ message: 'Database trống, không có gì để đồng bộ.' });
        }

        // 3. Phân loại và Map dữ liệu (Tách Data và dData)
        const dataMembers = [];
        const dDataMembers = [];

        members.forEach(m => {
            const idVal = parseInt(m.id);
            if (!isNaN(idVal)) {
                if (idVal < 5001) dataMembers.push(m);
                else dDataMembers.push(m);
            } else {
                dataMembers.push(m);
            }
        });

        const rowsData = dataMembers.map(m => mapMemberToRow(m, 'Data'));
        const rowsdData = dDataMembers.map(m => mapMemberToRow(m, 'dData'));

        // 4. Kết nối API
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CLIENT_EMAIL,
                private_key: PRIVATE_KEY,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // 5. Thực hiện Ghi đè (Clear + Update) cho Sheet Data (A2:P)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Data!A2:P',
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Data!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsData },
        });

        // 6. Ghi vào Sheet dData (A2:O)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'dData!A2:O',
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'dData!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: rowsdData },
        });

        await logToDB(req, 'update', `Export ${members.length} thành viên lên 2 Sheets`);
        res.json({ success: true, message: `Đã đồng bộ ${dataMembers.length} dòng vào Data và ${dDataMembers.length} dòng vào dData.` });

    } catch (error) {
        console.error('Google Sheets Export Error:', error);
        res.status(500).json({ message: 'Lỗi khi ghi lên Google Sheets: ' + error.message });
    }
};

const importSheets = async (req, res) => {
    const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";
    
    // Hàm hỗ trợ lấy dữ liệu linh hoạt
    const getCol = (row, keys) => {
        // row là object { normalized_header: value }
        for (const key of keys) {
            const searchKey = key.trim().toLowerCase().replace(/[\s_]+/g, '');
            if (row[searchKey] !== undefined && row[searchKey] !== null && String(row[searchKey]).trim() !== '') {
                return String(row[searchKey]).trim();
            }
        }
        return null;
    };

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
        if (!google) return res.status(500).json({ message: "Server thiếu thư viện 'googleapis'." });

        const SHEET_ID = process.env.GOOGLE_SHEET_ID;
        const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
        let PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
        if (PRIVATE_KEY) {
            if (PRIVATE_KEY.startsWith('"') && PRIVATE_KEY.endsWith('"')) PRIVATE_KEY = PRIVATE_KEY.slice(1, -1);
            PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
            return res.status(500).json({ message: 'Chưa cấu hình Google Credentials trong file .env' });
        }

        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // Hàm đọc sheet
        const readSheet = async (sheetName) => {
            try {
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `'${sheetName}'!A:Z`,
                    valueRenderOption: 'UNFORMATTED_VALUE',
                });
                const rows = res.data.values;
                if (!rows || rows.length < 2) return [];
                
                const headers = rows[0].map(h => h.toString().trim().toLowerCase().replace(/[\s_]+/g, ''));
                return rows.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        if (header) obj[header] = row[index] !== undefined ? row[index] : '';
                    });
                    return obj;
                });
            } catch (e) { return []; }
        };

        const [records, spouseRecords] = await Promise.all([
            readSheet('Data'),
            readSheet('dData')
        ]);

        await Member.deleteMany({});

        const allPeople = [
            ...records.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('M' + Date.now() + Math.random().toString(36).substr(2, 5)),
                fid: getCol(r, ['fid', 'father_id', 'cha', 'id cha', 'ma cha', 'mã cha', 'bố', 'id bố', 'mã bố', 'bo']),
                mid: getCol(r, ['mid', 'mother_id', 'mẹ', 'id mẹ', 'ma me', 'mã mẹ', 'ma mẹ']),
                // Sheet Data không có pid, nhưng nếu có thì vẫn đọc
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'adress', 'địa chỉ', 'dia chi'], ''),
                phone: getCol(r, ['phone', 'mobile', 'sđt', 'số điện thoại', 'tel'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                note: getCol(r, ['note', 'ghi chú', 'ghi chu', 'notes'], ''),
                image: getCol(r, ['image', 'photo', 'avatar', 'ảnh', 'anh', 'hình', 'hinh', 'url'], ''),
                generation: parseInt(getCol(r, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
                order: parseInt(getCol(r, ['order', 'stt', 'thứ tự'], 1)) || 1,
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                id: getCol(r, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || ('S' + Date.now() + Math.random().toString(36).substr(2, 5)),
                // Sheet dData có pid
                pid: getCol(r, ['pid', 'partner_id', 'vợ/chồng', 'id vợ/chồng', 'ma vo chong', 'mã vợ chồng']),
                full_name: getCol(r, ['full_name', 'fullname', 'họ tên', 'tên', 'hoten', 'name']) || 'Chưa có tên',
                is_live: getCol(r, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
                gender: normalizeGender(getCol(r, ['gender', 'sex', 'giới tính', 'phái'])),
                birth_date: getCol(r, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
                death_date: getCol(r, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
                branch: getCol(r, ['branch', 'nhánh', 'chi'], 'Gốc'),
                address: getCol(r, ['address', 'adress', 'địa chỉ', 'dia chi'], ''),
                phone: getCol(r, ['phone', 'mobile', 'sđt', 'số điện thoại', 'tel'], ''),
                job: getCol(r, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
                note: getCol(r, ['note', 'ghi chú', 'ghi chu', 'notes'], ''),
                image: getCol(r, ['image', 'photo', 'avatar', 'ảnh', 'anh', 'hình', 'hinh', 'url'], ''),
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
        await logToDB(req, 'create', `Đồng bộ ${docs.length} thành viên từ Google Sheets`);
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
router.post('/members', auth, upload.single('image'), createMember);

// Cập nhật thành viên (Sửa)
router.put('/members/:id', auth, upload.single('image'), updateMember);

// Xóa thành viên
router.delete('/members/:id', auth, deleteMember);

// Import Google Sheets
router.post('/import-sheets', auth, importSheets);

// Export to Google Sheets (Sync Up)
router.post('/export-sheets', auth, adminOnly, exportToGoogleSheets);

// THÊM MỚI: Route để xuất dữ liệu ra file CSV
router.get('/export-csv', auth, adminOnly, exportToCSV);

// THÊM MỚI: Route để import từ file CSV do người dùng tải lên
router.post('/import-csv', auth, upload.single('csvfile'), async (req, res) => {
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

module.exports = router;