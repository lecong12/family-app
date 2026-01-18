const fs = require('fs');
const csv = require('csv-parser');
const Member = require('../models/Member');

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
                        const memberData = {
                            id: row.id || 'M' + Date.now() + Math.random().toString(36).substr(2, 5),
                            full_name: row.full_name || row.name || 'Unknown',
                            gender: row.gender || 'Nam',
                            fid: row.fid || null,
                            mid: row.mid || null,
                            pid: row.pid || null,
                            generation: parseInt(row.generation) || 1,
                            order: parseInt(row.order) || 1,
                            branch: row.branch || 'Gốc'
                        };
                        await Member.findOneAndUpdate({ id: memberData.id }, memberData, { upsert: true, new: true });
                        count++;
                    }
                    resolve(count);
                } catch (err) { reject(err); }
            })
            .on('error', reject);
    });
};
const importGedcom = async (filePath) => { return 0; };
module.exports = { importCSV, importGedcom };
