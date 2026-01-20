const multer = require('multer');
const os = require('os');

// Sử dụng thư mục tạm của hệ thống để tránh lỗi quyền hạn trên Render
const uploadDir = os.tmpdir();

const upload = multer({ dest: uploadDir });

module.exports = upload;