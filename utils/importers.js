﻿﻿﻿﻿﻿﻿﻿﻿﻿const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const Member = require('../models/Member');

// Hàm hỗ trợ lấy dữ liệu từ nhiều tên cột khác nhau (Tiếng Anh/Tiếng Việt)
const getCol = (row, keys, defaultVal = null) => {
    const rowKeys = Object.keys(row);
    for (const key of keys) {
        // So sánh không phân biệt hoa thường và khoảng trắng thừa
        const match = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
        if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') {
            return String(row[match]).trim(); // Chuyển sang chuỗi để tránh lỗi với ID dạng số
        }
    }
    return defaultVal;
};

// Hàm lưu thành viên (dùng chung cho cả CSV và Excel)
const saveMember = async (row) => {
    // Xử lý giới tính: Các biến thể của "Nữ" sẽ là "Nữ", còn lại mặc định là "Nam"
    const val = getCol(row, ['gender', 'sex', 'giới tính', 'phái', 'gioi tinh']);
    let gender;
    const s = (val || '').trim().toLowerCase();

    if (s === 'nữ' || ['nu', 'female', 'f', 'gái', 'bà', 'mẹ'].some(k => s.includes(k))) {
        gender = 'Nữ';
    } else {
        gender = 'Nam'; // Mặc định là 'Nam' cho các trường hợp còn lại (nam, male, trống...)
    }
    
    const memberData = {
        id: getCol(row, ['id', 'mã', 'ma', 'code', 'stt', 'mã thành viên']) || 'M' + Date.now() + Math.random().toString(36).substr(2, 5),
        full_name: getCol(row, ['full_name', 'name', 'họ tên', 'tên', 'hoten', 'họ và tên', 'fullname'], 'Unknown'),
        gender: gender,
        fid: getCol(row, ['fid', 'father_id', 'id cha', 'cha', 'ma cha', 'mã cha', 'father', 'bố', 'id bố', 'mã bố', 'bo'], null),
        mid: getCol(row, ['mid', 'mother_id', 'id mẹ', 'mẹ', 'ma me', 'mã mẹ', 'ma mẹ', 'mother'], null),
        pid: getCol(row, ['pid', 'partner_id', 'id vợ/chồng', 'vợ/chồng', 'vợ chồng', 'ma vo chong', 'mã vợ chồng', 'partner', 'spouse'], null),
        generation: parseInt(getCol(row, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
        order: parseInt(getCol(row, ['order', 'stt', 'thứ tự'], 1)) || 1,
        branch: getCol(row, ['branch', 'nhánh', 'chi'], 'Gốc'),
        birth_date: getCol(row, ['birth_date', 'birth', 'ngày sinh', 'ngay sinh', 'dob'], ''),
        death_date: getCol(row, ['death_date', 'death', 'ngày mất', 'ngay mat', 'dod'], ''),
        is_live: getCol(row, ['is_live', 'is_alive', 'alive', 'còn sống', 'con song'], '1') !== '0',
        address: getCol(row, ['address', 'adress', 'địa chỉ', 'dia chi'], ''),
        phone: getCol(row, ['phone', 'mobile', 'sđt', 'số điện thoại', 'tel'], ''),
        job: getCol(row, ['job', 'nghề nghiệp', 'nghe nghiep', 'công việc'], ''),
        note: getCol(row, ['note', 'ghi chú', 'ghi chu', 'notes'], ''),
        image: getCol(row, ['image', 'photo', 'avatar', 'ảnh', 'anh', 'hình', 'hinh', 'url'], '')
    };

    if (memberData.full_name !== 'Unknown') {
        await Member.findOneAndUpdate({ id: memberData.id }, memberData, { upsert: true, new: true });
        return 1;
    }
    return 0;
};

const importCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                try {
                    let total = 0;
                    let orphans = 0;
                    for (const row of results) {
                        const savedCount = await saveMember(row);
                        if (savedCount > 0) {
                            total++;
                            // Kiểm tra xem thành viên này có bị "mồ côi" không
                            const generation = parseInt(getCol(row, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1;
                            const fid = getCol(row, ['fid', 'father_id', 'id cha', 'cha', 'ma cha', 'mã cha', 'father', 'bố', 'id bố', 'mã bố', 'bo'], null);
                            const mid = getCol(row, ['mid', 'mother_id', 'id mẹ', 'mẹ', 'ma me', 'mã mẹ', 'ma mẹ', 'mother'], null);

                            // Một thành viên được coi là "mồ côi" nếu thuộc đời > 1 nhưng không có thông tin cha hoặc mẹ trong file
                            if (generation > 1 && !fid && !mid) {
                                orphans++;
                            }
                        }
                    }
                    // Trả về một object chứa nhiều thông tin hơn là chỉ một con số
                    resolve({ total, orphans });
                } catch (err) { reject(err); }
            })
            .on('error', reject);
    });
};

const importExcel = async (filePath) => {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Lấy sheet đầu tiên
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        let count = 0;
        for (const row of data) {
            count += await saveMember(row);
        }
        return count;
    } catch (err) { throw err; }
};

const importGedcom = async (filePath) => { return 0; };
module.exports = { importCSV, importExcel, importGedcom };