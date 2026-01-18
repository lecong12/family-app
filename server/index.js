const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

console.log('⏳ Đang khởi động Server...');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Tự động tạo thư mục uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log('📁 Đã tạo thư mục uploads');
}

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/family_db')
    .then(() => console.log('✅ Kết nối DB thành công'))
    .catch(err => console.error('❌ Lỗi DB:', err));

// Load Router
try {
    app.use('/api', require('./router/api'));
    console.log('✅ Đã load Router API');
} catch (error) {
    console.error('❌ Lỗi load Router:', error);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đã chạy tại http://localhost:${PORT}`));
