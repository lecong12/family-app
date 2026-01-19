const axios = require('axios');
const { parse } = require('csv-parse/sync');

// Link Google Sheets của bạn
const sheetDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1705210560&single=true&output=csv";
const sheetDDataUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv6nPNO982vfr9JJmYHtwWh1XPY_3qDKhJjo1fEHy3jb9034Z_IZPqFveLZyqjODVm-OHN7aogE-MH/pub?gid=1565376107&single=true&output=csv";

const clean = (v) => v ? String(v).replace(/[^\w]/g, '').trim() : "";

// API nạp dữ liệu tự động từ Google Sheets
router.post('/import-sheets', async (req, res) => {
    try {
        // 1. Tải dữ liệu từ Google
        const [resData, resDData] = await Promise.all([axios.get(sheetDataUrl), axios.get(sheetDDataUrl)]);
        const config = { columns: h => h.map(i => i.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true };
        const records = parse(resData.data, config);
        const spouseRecords = parse(resDData.data, config);

        // 2. Xóa sạch dữ liệu cũ để nạp mới
        await Member.deleteMany({});

        // 3. Chuẩn bị dữ liệu thô (Xử lý 0 là Mất, 1/Trống là Sống)
        const allPeople = [
            ...records.map(r => ({
                ...r,
                full_name: r.full_name?.trim(),
                is_live: r.is_live !== '0', // 0 -> false (Mất), Còn lại -> true
                gender: (r.gender || '').includes('Nữ') ? 'Nữ' : 'Nam',
                temp_id: `blood_${clean(r.id)}`
            })),
            ...spouseRecords.map(r => ({
                ...r,
                full_name: r.full_name?.trim(),
                is_live: r.is_live !== '0',
                gender: (r.gender || '').includes('Nam') ? 'Nam' : 'Nữ',
                temp_id: `spouse_${clean(r.id)}`
            }))
        ];

        // Lưu vào DB
        const docs = await Member.insertMany(allPeople);
        const idMap = new Map(docs.map(d => [d.temp_id, d._id]));

        // 4. Thiết lập quan hệ bằng BulkWrite (1 Cha - Nhiều Vợ)
        const bulkOps = [];
        for (const r of records) {
            const myId = idMap.get(`blood_${clean(r.id)}`);
            if (!myId) continue;

            let parents = [];
            if (clean(r.fid) && idMap.has(`blood_${clean(r.fid)}`)) {
                parents.push(idMap.get(`blood_${clean(r.fid)}`)); // Chỉ lấy 1 Cha
            }

            let spouses = [];
            if (clean(r.check_pid) && idMap.has(`spouse_${clean(r.check_pid)}`)) {
                spouses.push(idMap.get(`spouse_${clean(r.check_pid)}`));
            }

            bulkOps.push({
                updateOne: { filter: { _id: myId }, update: { $set: { parent_id: parents, spouse_id: spouses } } }
            });
        }

        // Đồng bộ Spouse ngược lại (Gom nhiều vợ vào 1 chồng)
        for (const r of spouseRecords) {
            const myId = idMap.get(`spouse_${clean(r.id)}`);
            const pid = clean(r.pid);
            if (myId && pid && idMap.has(`blood_${pid}`)) {
                const bloodId = idMap.get(`blood_${pid}`);
                bulkOps.push({ updateOne: { filter: { _id: myId }, update: { $addToSet: { spouse_id: bloodId } } } });
                bulkOps.push({ updateOne: { filter: { _id: bloodId }, update: { $addToSet: { spouse_id: myId } } } });
            }
        }

        if (bulkOps.length > 0) await Member.bulkWrite(bulkOps);

        res.json({ message: `Đã nạp tự động thành công ${docs.length} thành viên!` });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi: ' + error.message });
    }
});
