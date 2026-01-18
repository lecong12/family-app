const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // 1. Xác định đường dẫn file
    let filePath = req.url === '/' 
        ? path.join(__dirname, '../public/index.html') 
        : path.join(__dirname, '../public', req.url);

    // 2. Xác định loại file (Content-Type)
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    if (extname === '.css') contentType = 'text/css';
    if (extname === '.js') contentType = 'text/javascript';

    // 3. Đọc và gửi file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Khong tim thay file');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server dang chay tai cong ${PORT}`);
});
