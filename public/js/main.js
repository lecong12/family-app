// ==========================================
// 1. BIẾN TOÀN CỤC & KHỞI TẠO
// ==========================================
let allMembers = [];
let currentDisplayedMembers = []; 
let chartInstances = {};
let currentEditingId = null;

let pagination = {
    currentPage: 1,
    itemsPerPage: 12,
    data: []
};

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    initSmartSelects();
    initTabs();
    
    // Tải dữ liệu và mặc định hiển thị Bài viết hoặc Dashboard tùy ý bạn
    // Ở đây tôi giữ nguyên loadAndRenderAll (Dashboard) theo logic gốc của bạn
    loadAndRenderAll();
});

// ==========================================
// 2. TẢI DỮ LIỆU & QUẢN LÝ TAB
// ==========================================
async function loadMembers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/members', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error("Server lỗi (trả về HTML)");
        }

        if (!res.ok) {
            if (res.status === 401) { logout(); return; }
            const errData = await res.json();
            throw new Error(errData.message || "Lỗi tải dữ liệu");
        }

        allMembers = await res.json();
        localStorage.setItem('familyData', JSON.stringify(allMembers));
        renderData(allMembers);

    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
    }
}

async function loadAndRenderAll() {
    await loadMembers();
    renderDashboardTab();
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const targetId = button.dataset.target;
            const targetContent = document.querySelector(targetId);
            if (targetContent) targetContent.classList.add('active');

            // Kích hoạt hàm render tương ứng
            switch(targetId) {
                case '#dashboard-tab': renderDashboardTab(); break;
                case '#tree-tab': renderTreeTab(); break;
                case '#members-tab': renderMembersTab(); break;
                case '#posts-tab': renderPostsTab(); break; // Đã đảm bảo gọi đúng
                case '#settings-tab': renderSettingsTab(); break;
            }
        });
    });
}

// ==========================================
// 3. QUẢN LÝ THÀNH VIÊN (RENDER & LOGIC)
// ==========================================
function renderMemberList(members) {
    const container = document.getElementById('membersGrid');
    if (!container) return;
    
    currentDisplayedMembers = members;
    
    // Logic sắp xếp huyết thống (Giữ nguyên logic phức tạp của bạn)
    const memberMap = new Map(allMembers.map(m => [String(m.id), m]));
    allMembers.forEach(m => delete m._ancestryOrder);

    const getBloodlineAncestryOrder = (member) => {
        if (!member) return [];
        if (member._ancestryOrder) return member._ancestryOrder;
        let bMember = member;
        if (bMember.pid && !bMember.fid && !bMember.mid) {
            const partner = memberMap.get(String(bMember.pid));
            if (partner) bMember = partner;
        }
        const getChain = (m) => {
            if (!m) return [];
            const parentId = m.fid || m.mid;
            const parent = parentId ? memberMap.get(String(parentId)) : null;
            return [...(parent ? getChain(parent) : []), parseInt(m.order) || 999];
        };
        member._ancestryOrder = getChain(bMember);
        return member._ancestryOrder;
    };

    pagination.data = [...members].sort((a, b) => {
        const genA = parseInt(a.generation) || 999;
        const genB = parseInt(b.generation) || 999;
        if (genA !== genB) return genA - genB;
        const ancA = getBloodlineAncestryOrder(a);
        const ancB = getBloodlineAncestryOrder(b);
        for (let i = 0; i < Math.min(ancA.length, ancB.length); i++) {
            if (ancA[i] !== ancB[i]) return ancA[i] - ancB[i];
        }
        return a.gender === 'Nam' ? -1 : 1;
    });

    pagination.currentPage = 1;
    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('membersGrid');
    if (!container) return;
    container.innerHTML = '';

    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const pageMembers = pagination.data.slice(start, start + pagination.itemsPerPage);

    pageMembers.forEach(m => {
        const isDeceased = (m.death_date && m.death_date !== '0') || m.is_live === 0;
        const avatarColor = isDeceased ? '#9ca3af' : (m.gender === 'Nam' ? '#3b82f6' : '#ec4899');
        
        // Lấy chữ cái đầu của Tên để hiển thị Avatar
        const nameParts = (m.full_name || '?').trim().split(/\s+/);
        const letter = nameParts[nameParts.length - 1].charAt(0).toUpperCase();

        const card = document.createElement('div');
        card.className = `member-card ${m.gender === 'Nam' ? 'male' : 'female'} ${isDeceased ? 'deceased' : ''}`;
        card.innerHTML = `
            <div class="member-card-header">
                <div class="member-card-avatar" style="background-color: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 50%; width: 40px; height: 40px;">
                    ${letter}
                </div>
                <div class="member-card-info">
                    <h4 class="member-card-name">${m.full_name}</h4>
                    <div class="member-card-gender">${m.gender}</div>
                </div>
            </div>
            <div class="member-card-body">
                <p><i class="fas fa-layer-group"></i> Đời ${m.generation}</p>
                <p><i class="fas fa-birthday-cake"></i> ${m.birth_date || 'N/A'}</p>
            </div>
        `;
        card.onclick = () => openEditModal(m.id);
        container.appendChild(card);
    });
    renderPaginationControls(container);
}

// ==========================================
// 4. QUẢN LÝ BÀI VIẾT (POSTS)
// ==========================================
function renderPostsTab() {
    loadPosts();
}

async function loadPosts() {
    const container = document.getElementById('posts-list-container');
    if (!container) return;
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/posts', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            if (data.posts.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:20px;">Chưa có bài viết nào.</p>';
                return;
            }

            container.innerHTML = data.posts.map(post => `
                <div class="post-card ${post.is_pinned ? 'pinned' : ''}">
                    <div class="post-header">
                        <h3>${post.title}</h3>
                        <div class="post-actions">
                            <button onclick="openEditPostModal('${post._id}')"><i class="fas fa-edit"></i></button>
                            <button onclick="deletePost('${post._id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="post-meta">
                        <span class="tag">${post.category}</span>
                        <span>${new Date(post.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                    <div class="post-content">${post.content.substring(0, 100)}...</div>
                    <button class="btn-readmore" onclick="openViewPostModal('${post._id}')">Đọc tiếp →</button>
                </div>
            `).join('');
        }
    } catch (err) {
        container.innerHTML = 'Lỗi kết nối bài viết.';
    }
}

// ==========================================
// 5. CÁC HÀM HỖ TRỢ KHÁC (GIỮ NGUYÊN)
// ==========================================
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('familyData');
    window.location.href = '/login.html';
}

// ... (Các hàm initSmartSelects, saveMember, renderDashboardTab, renderTreeTab... giữ nguyên như code bạn đã cung cấp)
