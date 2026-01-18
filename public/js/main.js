const API_URL = '/api/members';

// Tải danh sách thành viên khi web vừa mở
document.addEventListener('DOMContentLoaded', loadMembers);

async function loadMembers() {
    try {
        const res = await fetch(API_URL);
        const members = await res.json();
        
        if (members.length === 0) {
            console.log("Database trống!");
            return;
        }

        // 1. Hiển thị danh sách vào Sidebar bên phải
        renderSidebarList(members);
        
        // 2. Cập nhật các lựa chọn trong Modal
        updateSelectOptions(members);

        // 3. Vẽ sơ đồ cây (nếu hàm drawTree đã sẵn sàng trong renderer.js)
        if (typeof drawTree === 'function') {
            drawTree(members);
        }
        
    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
    }
}

// Cập nhật danh sách chọn Cha/Mẹ trong Modal
function updateSelectOptions(members) {
    const fidSelect = document.getElementById('m-fid');
    const midSelect = document.getElementById('m-mid');
    
    if (!fidSelect || !midSelect) return;

    fidSelect.innerHTML = '<option value="">Chọn Cha</option>';
    midSelect.innerHTML = '<option value="">Chọn Mẹ</option>';

    members.forEach(m => {
        // Sử dụng m.id và m.full_name khớp với Schema của bạn
        const option = `<option value="${m.id}">${m.full_name}</option>`;
        if (m.gender === 'Nam') fidSelect.innerHTML += option;
        else midSelect.innerHTML += option;
    });
}

// Hiển thị danh sách thành viên vào Sidebar (Đã tối ưu cho 2k người)
function renderSidebarList(members) {
    const container = document.getElementById('memberList');
    if (!container) return;

    // Sử dụng DocumentFragment để tăng tốc độ xử lý 2000 bản ghi
    const fragment = document.createDocumentFragment();
    
    // Thêm tiêu đề tổng số lượng
    const title = document.createElement('h3');
    title.innerText = `Thành viên (${members.length})`;
    title.style.padding = "0 10px";
    fragment.appendChild(title);

    members.forEach(m => {
        const card = document.createElement('div');
        card.className = 'member-card'; // Khớp với CSS .member-card
        
        card.innerHTML = `
            <h4>${m.full_name}</h4>
            <p><strong>Đời:</strong> ${m.generation} | <strong>GT:</strong> ${m.gender}</p>
        `;

        // Sự kiện khi nhấn vào thẻ
        card.onclick = () => {
            console.log("Xem chi tiết:", m.full_name);
            if (typeof focusOnMember === 'function') focusOnMember(m.id);
        };

        fragment.appendChild(card);
    });

    container.innerHTML = ''; // Xóa trắng trước khi chèn mới
    container.appendChild(fragment);
}

// --- Các hàm xử lý giao diện (Modal & Upload) ---

function openModal() { 
    document.getElementById('member-modal').style.display = 'block'; 
}

function closeModal() { 
    document.getElementById('member-modal').style.display = 'none'; 
}

async function saveMember() {
    const data = {
        full_name: document.getElementById('m-name').value,
        gender: document.getElementById('m-gender').value,
        fid: document.getElementById('m-fid').value || null,
        mid: document.getElementById('m-mid').value || null
    };

    if (!data.full_name) return alert("Vui lòng nhập tên!");

    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        closeModal();
        loadMembers(); 
    } catch (err) {
        alert("Lỗi khi lưu!");
    }
}

async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch('/api/import', { method: 'POST', body: formData });
        if (res.ok) {
            alert("Import thành công!");
            loadMembers();
        }
    } catch (err) {
        alert("Lỗi import!");
    }
}
