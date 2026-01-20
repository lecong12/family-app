// Biến toàn cục lưu danh sách thành viên
let allMembers = [];
// Biến trạng thái để biết đang Thêm hay Sửa
let currentEditingId = null;

// 1. Khởi tạo khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // 1.1. Thử nạp dữ liệu từ Cache (để hiển thị ngay lập tức khi refresh)
    const cachedData = localStorage.getItem('familyData');
    if (cachedData) {
        try {
            allMembers = JSON.parse(cachedData);
            renderData(allMembers); // Hiển thị dữ liệu cũ trong lúc chờ dữ liệu mới
        } catch (e) { console.error("Lỗi đọc cache:", e); }
    }

    loadMembers();

    // Thêm nút và modal cho chức năng thống kê
    setupStatsFeature();
});

// 2. Hàm tải dữ liệu từ Server
async function loadMembers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/members', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Kiểm tra nếu server trả về HTML (lỗi 404/500) thay vì JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            throw new Error("Server lỗi (trả về HTML): " + text.substring(0, 100) + "...");
        }

        if (!res.ok) {
            const errData = await res.json();
            if (res.status === 401) {
                logout(); // Gọi hàm đăng xuất chuẩn
                return;
            }
            throw new Error(errData.error || errData.message || "Lỗi tải dữ liệu từ server");
        }

        allMembers = await res.json();
        
        // Lưu dữ liệu vào Cache để lần sau refresh không bị mất
        localStorage.setItem('familyData', JSON.stringify(allMembers));
        
        renderData(allMembers);

    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        alert('⚠️ Hệ thống báo lỗi: ' + err.message); // Hiển thị lỗi cho người dùng thấy
    }
}

// Hàm hiển thị dữ liệu lên giao diện (Tách ra để dùng chung cho Cache và Server)
function renderData(members) {
    // Cập nhật số lượng
    const countEl = document.getElementById('member-count');
    if (countEl) countEl.innerText = members.length;

    // Vẽ cây
    if (typeof drawTree === 'function') {
        drawTree(members);
    }

    // Render danh sách bên phải
    renderMemberList(members);
    
    // Cập nhật Select box trong Modal
    updateParentSelects();
}

// Hàm Đăng xuất: Xóa Token và Xóa Dữ liệu Cache
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('familyData'); // Xóa sạch dữ liệu gia phả đã lưu
    window.location.href = '/login.html';
}

// 3. Render danh sách thành viên (Sidebar)
function renderMemberList(members) {
    const container = document.getElementById('members-container');
    if (!container) return;
    
    container.innerHTML = ''; // Xóa danh sách cũ trước khi render lại
    // 1. Sắp xếp sơ bộ theo Đời và Thứ tự
    const sorted = [...members].sort((a, b) => {
        if ((a.generation || 0) !== (b.generation || 0)) return (a.generation || 0) - (b.generation || 0);
        return (a.order || 0) - (b.order || 0);
    });

    // 2. Gom nhóm Vợ Chồng (Nam trước - Nữ sau)
    const displayList = [];
    const processed = new Set();
    const memberMap = new Map(members.map(m => [m.id, m]));

    sorted.forEach(m => {
        if (processed.has(m.id)) return;

        const spouseId = m.pid ? String(m.pid) : null;
        const spouse = spouseId ? memberMap.get(spouseId) : null;

        if (spouse && !processed.has(spouseId)) { // Chỉ xử lý cặp đôi nếu người vợ/chồng chưa được xử lý
            // Nếu là cặp vợ chồng, luôn đưa Nam lên trước
            const husband = m.gender === 'Nam' ? m : spouse;
            const wife = m.gender === 'Nam' ? spouse : m;
            
            displayList.push(husband);
            if (wife) displayList.push(wife); // Chỉ thêm vợ nếu tồn tại
            
            processed.add(husband.id);
            if (wife) processed.add(wife.id);
        } else {
            // Nếu không có vợ/chồng hoặc vợ/chồng đã được xử lý rồi, chỉ thêm người hiện tại
            displayList.push(m);
            processed.add(m.id);
        }
    });

    displayList.forEach(m => {
        // Tạo thẻ div thay vì chuỗi HTML để dễ gắn sự kiện onclick
        const card = document.createElement('div');
        card.className = 'member-card';
        card.innerHTML = `<h4>${m.full_name}</h4><p>Đời: ${m.generation} | ${m.gender}</p>`;
        
        // Thêm sự kiện click để zoom đến người đó trên cây
        card.onclick = () => { 
            if (typeof zoomToNode === 'function') zoomToNode(m.id); 
            else console.error("Hàm zoomToNode chưa được định nghĩa");
        };
        
        container.appendChild(card);
    });
}

// 5. Các hàm Modal (Tách riêng Thêm/Sửa và Import)

// Mở modal Thêm mới
function openAddModal() {
    currentEditingId = null; // Đặt lại trạng thái: đang thêm mới
    document.getElementById('modal-title').innerText = "Thêm thành viên mới";
    
    // Dọn dẹp form
    document.getElementById('m-name').value = '';
    document.getElementById('m-gender').value = 'Nam';
    
    updateParentSelects(); // Tải lại danh sách chọn
    
    // Đặt lại các lựa chọn cha/mẹ/vợ-chồng
    document.getElementById('m-fid').value = '';
    document.getElementById('m-mid').value = '';
    document.getElementById('m-pid').value = '';

    // Ẩn nút Xóa khi ở chế độ Thêm mới
    document.getElementById('btn-delete-member').style.display = 'none';
    
    document.getElementById('add-member-modal').style.display = 'block';
}

// Mở modal Sửa (Được gọi khi click vào node)
window.openEditModal = function(memberId) {
    const member = allMembers.find(m => m.id == memberId);
    if (!member) {
        console.error("Không tìm thấy thành viên với ID:", memberId);
        return;
    }

    currentEditingId = memberId; // Đặt trạng thái: đang sửa
    document.getElementById('modal-title').innerText = "Sửa thông tin thành viên";

    // Điền dữ liệu cũ vào form
    document.getElementById('m-name').value = member.full_name;
    document.getElementById('m-gender').value = member.gender;
    
    updateParentSelects(); // Tải lại danh sách chọn
    
    // Chọn đúng giá trị đã lưu cho cha/mẹ/vợ-chồng
    document.getElementById('m-fid').value = member.fid || '';
    document.getElementById('m-mid').value = member.mid || '';
    document.getElementById('m-pid').value = member.pid || '';

    // Hiển thị nút Xóa khi ở chế độ Sửa
    document.getElementById('btn-delete-member').style.display = 'inline-block';

    document.getElementById('add-member-modal').style.display = 'block';
}

// Đóng tất cả modal
function closeModal() {
    const addModal = document.getElementById('add-member-modal');
    
    if (addModal) addModal.style.display = 'none';
    
    // Reset trạng thái sửa về null
    currentEditingId = null;
}

function updateParentSelects() {
    const fidSelect = document.getElementById('m-fid');
    const midSelect = document.getElementById('m-mid');
    const pidSelect = document.getElementById('m-pid'); // Thêm select cho Vợ/Chồng
    
    // Tối ưu hóa: Tạo chuỗi HTML trong bộ nhớ thay vì thao tác DOM liên tục
    let fidHtml = '<option value="">Chọn Cha</option>';
    let midHtml = '<option value="">Chọn Mẹ</option>';
    let pidHtml = '<option value="">Chọn Vợ/Chồng</option>';

    // Sắp xếp thành viên theo tên để dễ tìm trong danh sách dropdown
    const sortedMembers = [...allMembers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));

    sortedMembers.forEach(m => {
        const option = `<option value="${m.id}">${m.full_name}</option>`;
        if (m.gender === 'Nam') fidHtml += option;
        if (m.gender === 'Nữ') midHtml += option;
        
        // Thêm tất cả mọi người vào danh sách chọn Vợ/Chồng
        pidHtml += option;
    });

    // Cập nhật DOM một lần duy nhất
    if (fidSelect) fidSelect.innerHTML = fidHtml;
    if (midSelect) midSelect.innerHTML = midHtml;
    if (pidSelect) pidSelect.innerHTML = pidHtml;
}

async function saveMember() {
    const nameInput = document.getElementById('m-name');
    const genderInput = document.getElementById('m-gender');
    const fidInput = document.getElementById('m-fid');
    const midInput = document.getElementById('m-mid');
    const pidInput = document.getElementById('m-pid'); // Thêm input cho Vợ/Chồng

    // Validate cơ bản
    if (!nameInput || !nameInput.value.trim()) { alert("Vui lòng nhập họ tên!"); return; }

    // Tự động tính đời (Generation) dựa trên cha/mẹ hoặc vợ/chồng
    let generation = 1;
    const fid = fidInput ? fidInput.value : null;
    const mid = midInput ? midInput.value : null;
    const pid = pidInput ? pidInput.value : null;

    if (fid || mid) {
        const parent = allMembers.find(m => m.id == (fid || mid));
        if (parent) {
            generation = (parent.generation || 0) + 1;
        }
    } else if (pid) {
        // Nếu không có cha mẹ nhưng có vợ/chồng, lấy cùng đời với vợ/chồng
        const spouse = allMembers.find(m => m.id == pid);
        if (spouse) {
            generation = spouse.generation || 1;
        }
    }

    const payload = {
        full_name: nameInput.value.trim(),
        gender: genderInput ? genderInput.value : 'Nam',
        fid: fid,
        mid: mid,
        pid: pid, // Thêm pid vào payload
        generation: generation,
        // Các trường mặc định khác sẽ do Server hoặc Model xử lý
    };

    try {
        const token = localStorage.getItem('token');
        
        // Quyết định URL và Method dựa trên việc đang Thêm hay Sửa
        const url = currentEditingId ? `/api/members/${currentEditingId}` : '/api/members';
        const method = currentEditingId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || "Lỗi khi lưu thành viên");
        }

        alert(currentEditingId ? "✅ Cập nhật thành công!" : "✅ Thêm thành viên thành công!");
        
        closeModal();
        loadMembers(); // Tải lại dữ liệu để cập nhật cây
    } catch (err) {
        console.error(err);
        alert("❌ Lỗi: " + err.message);
    }
}

// Hàm xóa thành viên (được gọi từ nút Xóa trong modal)
async function deleteMember() {
    if (!currentEditingId) return;

    const memberToDelete = allMembers.find(m => m.id === currentEditingId);
    if (!memberToDelete) {
        alert("Không tìm thấy thành viên để xóa.");
        return;
    }

    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa thành viên "${memberToDelete.full_name}" không?\n\nHành động này không thể hoàn tác.`);
    if (!confirmDelete) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/members/${currentEditingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Lỗi từ server");

        alert(`✅ ${data.message}`);
        closeModal();
        loadMembers(); // Tải lại cây gia phả
    } catch (err) {
        console.error("Lỗi xóa thành viên:", err);
        alert(`❌ Lỗi: ${err.message}`);
    }
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

// 7. Hàm tìm kiếm thành viên
function handleSearch() {
    const input = document.getElementById('search-input');
    const filter = input.value.toLowerCase();
    const resultsContainer = document.getElementById('search-results');

    if (!filter) {
        resultsContainer.style.display = 'none';
        return;
    }

    const results = allMembers.filter(m => 
        m.full_name.toLowerCase().includes(filter)
    );

    resultsContainer.innerHTML = '';
    if (results.length > 0) {
        results.slice(0, 10).forEach(member => { // Giới hạn 10 kết quả
            const div = document.createElement('div');
            div.innerHTML = `${member.full_name} (Đời ${member.generation})`;
            div.onclick = () => {
                if (typeof zoomToNode === 'function') zoomToNode(member.id);
                input.value = member.full_name;
                resultsContainer.style.display = 'none';
            };
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.style.display = 'none';
    }
}

// --- Chức năng Thống kê (Dashboard) ---

// Biến để tránh tạo lại chart
let chartInstances = {};

// Hàm tải script bất đồng bộ
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Không thể tải script: ${src}`));
        document.head.appendChild(script);
    });
}

function setupStatsFeature() {
    // 1. Tạo nút "Thống kê"
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        const statsButton = document.createElement('button');
        statsButton.id = 'btn-stats';
        statsButton.innerHTML = 'Thống kê';
        statsButton.onclick = openStatsModal;
        const addButton = document.querySelector('#toolbar button');
        if (addButton) {
            addButton.insertAdjacentElement('afterend', statsButton);
        } else {
            toolbar.appendChild(statsButton);
        }
    }

    // 2. Tạo HTML cho Modal
    const modalHtml = `
    <div id="stats-modal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('stats-modal').style.display='none'">&times;</span>
            <div id="stats-content-wrapper">
                <!-- Nội dung dashboard sẽ được chèn vào đây -->
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function openStatsModal() {
    const modal = document.getElementById('stats-modal');
    const wrapper = document.getElementById('stats-content-wrapper');
    if (!modal || !wrapper) return;

    modal.style.display = 'block';
    wrapper.innerHTML = '<h2 style="text-align: center;">Đang tải thư viện và tính toán...</h2>';

    try {
        await loadScript('https://cdn.jsdelivr.net/npm/chart.js');
        renderAllCharts();
    } catch (error) {
        console.error("Lỗi mở dashboard:", error);
        wrapper.innerHTML = `<h3 style="color: red; text-align: center;">❌ Đã xảy ra lỗi: ${error.message}</h3>`;
    }
}

function renderAllCharts() {
    const wrapper = document.getElementById('stats-content-wrapper');
    if (!wrapper) return;

    // Chèn HTML dashboard vào
    wrapper.innerHTML = `
        <div class="row g-4 mb-4">
          <div class="col-md-4"><div class="card bg-primary text-white shadow h-100 p-3"><h3>Tổng thành viên</h3><h1 class="display-4 fw-bold" id="total-mem">0</h1></div></div>
          <div class="col-md-4"><div class="card bg-success text-white shadow h-100 p-3"><h3>Nam</h3><h1 class="display-4 fw-bold" id="total-male">0</h1></div></div>
          <div class="col-md-4"><div class="card bg-danger text-white shadow h-100 p-3"><h3>Nữ</h3><h1 class="display-4 fw-bold" id="total-female">0</h1></div></div>
        </div>
        <div class="row g-4">
          <div class="col-md-4"><div class="card shadow p-3 h-100"><h5 class="card-title text-center text-secondary fw-bold">Thành phần</h5><div style="height: 300px; position: relative;"><canvas id="chartComp"></canvas></div></div></div>
          <div class="col-md-4"><div class="card shadow p-3 h-100"><h5 class="card-title text-center text-secondary fw-bold">Giới tính</h5><div style="height: 300px; position: relative;"><canvas id="chartGender"></canvas></div></div></div>
          <div class="col-md-4"><div class="card shadow p-3 h-100"><h5 class="card-title text-center text-secondary fw-bold">Trạng thái (Sinh/Tử)</h5><div style="height: 300px; position: relative;"><canvas id="chartStatus"></canvas></div></div></div>
        </div>
        <div class="row g-4 mt-1">
          <div class="col-md-6"><div class="card shadow p-3 h-100"><h5 class="card-title text-center text-secondary fw-bold">Phân bố theo Đời thứ</h5><div style="height: 300px; position: relative;"><canvas id="chartGen"></canvas></div></div></div>
          <div class="col-md-6"><div class="card shadow p-3 h-100"><h5 class="card-title text-center text-secondary fw-bold">Phân bố theo Phái (Branch)</h5><div style="height: 300px; position: relative;"><canvas id="chartBranch"></canvas></div></div></div>
        </div>
    `;

    if (allMembers.length === 0) {
        wrapper.innerHTML = '<h3 style="text-align: center;">Chưa có dữ liệu để thống kê.</h3>';
        return;
    }

    // --- Tính toán ---
    const total = allMembers.length;
    const males = allMembers.filter(m => m.gender === 'Nam').length;
    const females = total - males;
    const alive = allMembers.filter(m => m.is_live !== false).length; // Xử lý trường hợp undefined hoặc true
    const dead = total - alive;
    // Giả định: Dâu/Rể là người có vợ/chồng nhưng không có cha/mẹ trong gia phả
    const spouses = allMembers.filter(m => m.pid && !m.fid && !m.mid).length;
    const coreMembers = total - spouses;
    const genCounts = allMembers.reduce((acc, m) => {
        const gen = m.generation || 'Chưa rõ';
        acc[gen] = (acc[gen] || 0) + 1;
        return acc;
    }, {});
    const genLabels = Object.keys(genCounts).sort((a, b) => a - b);
    const genData = genLabels.map(label => genCounts[label]);
    const branchCounts = allMembers.reduce((acc, m) => {
        const branch = m.branch || 'Chưa rõ';
        acc[branch] = (acc[branch] || 0) + 1;
        return acc;
    }, {});
    const branchLabels = Object.keys(branchCounts);
    const branchData = branchLabels.map(label => branchCounts[label]);

    // --- Cập nhật thẻ ---
    document.getElementById('total-mem').innerText = total;
    document.getElementById('total-male').innerText = males;
    document.getElementById('total-female').innerText = females;

    // --- Vẽ biểu đồ ---
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } };

    chartInstances.comp = new Chart(document.getElementById('chartComp'), { type: 'doughnut', data: { labels: ['Thành viên chính', 'Dâu/Rể'], datasets: [{ data: [coreMembers, spouses], backgroundColor: ['#36A2EB', '#FF6384'] }] }, options: chartOptions });
    chartInstances.gender = new Chart(document.getElementById('chartGender'), { type: 'pie', data: { labels: ['Nam', 'Nữ'], datasets: [{ data: [males, females], backgroundColor: ['#4BC0C0', '#FFCD56'] }] }, options: chartOptions });
    chartInstances.status = new Chart(document.getElementById('chartStatus'), { type: 'doughnut', data: { labels: ['Còn sống', 'Đã mất'], datasets: [{ data: [alive, dead], backgroundColor: ['#9966FF', '#C9CBCF'] }] }, options: chartOptions });
    chartInstances.gen = new Chart(document.getElementById('chartGen'), { type: 'bar', data: { labels: genLabels.map(l => `Đời ${l}`), datasets: [{ label: 'Số người', data: genData, backgroundColor: '#FF9F40' }] }, options: { ...chartOptions, plugins: { legend: { display: false } } } });
    chartInstances.branch = new Chart(document.getElementById('chartBranch'), { type: 'bar', data: { labels: branchLabels, datasets: [{ label: 'Số người', data: branchData, backgroundColor: '#36A2EB' }] }, options: { ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } } });
}