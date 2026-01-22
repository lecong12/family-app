const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Tạo thư mục 'uploads' ở thư mục gốc của dự án nếu chưa có
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Cấu hình nơi lưu trữ file và tên file
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // Lưu file vào thư mục 'uploads'
    },
    filename: function (req, file, cb) {
        // Tạo tên file duy nhất để tránh ghi đè file trùng tên
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Khởi tạo multer với cấu hình storage
module.exports = multer({ storage: storage });