﻿const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const Member = require('../models/Member');

// Hàm hỗ trợ lấy dữ liệu từ nhiều tên cột khác nhau (Tiếng Anh/Tiếng Việt)
const getCol = (row, keys, defaultVal = null) => {
    const rowKeys = Object.keys(row);
    for (const key of keys) {
        // So sánh không phân biệt hoa thường và khoảng trắng thừa
        const match = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
        if (match && row[match] !== undefined && row[match] !== '') {
            return row[match].trim();
        }
    }
    return defaultVal;
};

// Hàm lưu thành viên (dùng chung cho cả CSV và Excel)
const saveMember = async (row) => {
    const memberData = {
        id: getCol(row, ['id', 'mã'], 'M' + Date.now() + Math.random().toString(36).substr(2, 5)),
        full_name: getCol(row, ['full_name', 'name', 'họ tên', 'tên', 'hoten'], 'Unknown'),
        gender: getCol(row, ['gender', 'sex', 'giới tính', 'phái'], 'Nam'),
        fid: getCol(row, ['fid', 'father_id', 'id cha', 'cha'], null),
        mid: getCol(row, ['mid', 'mother_id', 'id mẹ', 'mẹ'], null),
        pid: getCol(row, ['pid', 'partner_id', 'id vợ/chồng', 'vợ chồng'], null),
        generation: parseInt(getCol(row, ['generation', 'gen', 'đời', 'thế hệ'], 1)) || 1,
        order: parseInt(getCol(row, ['order', 'stt', 'thứ tự'], 1)) || 1,
        branch: getCol(row, ['branch', 'nhánh', 'chi'], 'Gốc')
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
                    let count = 0;
                    for (const row of results) {
                        count += await saveMember(row);
                    }
                    resolve(count);
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