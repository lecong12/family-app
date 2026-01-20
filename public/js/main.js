// Biến toàn cục lưu danh sách thành viên
let allMembers = [];

// 1. Khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    loadMembers();
});

// 2. Hàm tải dữ liệu từ Server
async function loadMembers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/members', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const errData = await res.json();
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }
            throw new Error(errData.error || errData.message || "Lỗi tải dữ liệu từ server");
        }

        allMembers = await res.json();
        
        // Cập nhật số lượng
        const countEl = document.getElementById('member-count');
        if (countEl) countEl.innerText = allMembers.length;

        // Vẽ cây (Hàm này nằm bên renderer.js)
        if (typeof drawTree === 'function') {
            drawTree(allMembers);
        }

        // Render danh sách bên phải
        renderMemberList(allMembers);
        
        // Cập nhật Select box trong Modal
        updateParentSelects();

    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        alert('⚠️ Hệ thống báo lỗi: ' + err.message); // Hiển thị lỗi cho người dùng thấy
    }
}

// 3. Render danh sách thành viên (Sidebar)
function renderMemberList(members) {
    const container = document.getElementById('members-container');
    if (!container) return;
    
    let html = '';
    members.forEach(m => {
        html += `
            <div class="member-card">
                <h4>${m.full_name}</h4>
                <p>Đời: ${m.generation} | ${m.gender}</p>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 4. Xử lý Upload File (Được gọi từ HTML onchange)
async function uploadFile(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        alert(data.message || 'Import hoàn tất');
        loadMembers(); // Tải lại dữ liệu
    } catch (err) {
        alert('Lỗi khi import: ' + err.message);
    } finally {
        input.value = ''; 
    }
}

// 5. Các hàm Modal và Form
function openModal() {
    document.getElementById('member-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('member-modal').style.display = 'none';
}

function updateParentSelects() {
    const fidSelect = document.getElementById('m-fid');
    const midSelect = document.getElementById('m-mid');
    
    // Reset options
    fidSelect.innerHTML = '<option value="">Chọn Cha</option>';
    midSelect.innerHTML = '<option value="">Chọn Mẹ</option>';

    allMembers.forEach(m => {
        const option = `<option value="${m.id}">${m.full_name}</option>`;
        if (m.gender === 'Nam') fidSelect.innerHTML += option;
        else midSelect.innerHTML += option;
    });
}

async function saveMember() {
    // Logic lưu thành viên (bạn có thể bổ sung sau nếu cần form nhập tay)
    // Hiện tại ưu tiên Import CSV
    alert("Chức năng đang cập nhật. Vui lòng dùng Import CSV.");
    closeModal();
}

// 6. Hàm đồng bộ Google Sheets
async function syncGoogleSheets() {
    const confirmSync = confirm("Hệ thống sẽ xóa dữ liệu cũ và nạp lại từ Google Sheets.\n\nQuy ước: 0 là Đã mất, 1 hoặc Trống là Còn sống.\n\nBạn có chắc chắn không?");
    if (!confirmSync) return;

    const btn = document.getElementById('btn-sync-sheets');
    const originalText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⌛ Đang xử lý...";
        btn.style.backgroundColor = "#ccc";
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/import-sheets', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok) {
            alert("✅ Thành công: " + result.message);
            loadMembers(); // Tải lại cây gia phả
        } else {
            alert("❌ Lỗi: " + (result.message || response.statusText));
        }
    } catch (error) {
        console.error("Sync Error:", error);
        alert("❌ Lỗi kết nối đến Server!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.style.backgroundColor = "#f39c12";
        }
    }
}