const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // 1. Xác định đường dẫn file
    let filePath = req.url === '/' 
        ? path.join(__dirname, '../public/index.html') 
        : path.join(__dirname, '../public', req.url);

    // 2. Xác định loại file (MIME Type)
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    const mimeTypes = {
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpg'
    };
    contentType = mimeTypes[extname] || 'text/html';

    // 3. Đọc và trả về file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('404: Không tìm thấy tệp');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// QUAN TRỌNG: Render sử dụng biến môi trường PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
