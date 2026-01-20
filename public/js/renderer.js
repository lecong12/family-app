const zoom = d3.zoom().on("zoom", (e) => g.attr("transform", e.transform));
const svg = d3.select("#tree-canvas").append("svg")
    .attr("width", "100%").attr("height", "100vh")
    .attr("width", "100%").attr("height", "100%") // Sửa thành 100% để khớp với khung chứa
    .call(zoom);
const g = svg.append("g");

// Biến toàn cục để lưu trữ cây D3
let globalRootD3 = null;

function drawTree(data) {
    g.selectAll("*").remove();
    if (!data || data.length === 0) return;

    // 1. Tiền xử lý: Gom nhóm Vợ/Chồng và tạo Node hiển thị
    const memberMap = new Map(data.map(d => [String(d.id), d])); // Chuyển ID sang String để đảm bảo khớp
    const spouseMap = new Map(); // Map lưu quan hệ: id -> Set([spouse_ids])

    // Xây dựng bản đồ quan hệ vợ chồng 2 chiều (xử lý trường hợp thiếu pid 1 chiều)
    data.forEach(d => {
        const myId = String(d.id);
        const pid = d.pid ? String(d.pid) : null;
        
        if (!spouseMap.has(myId)) spouseMap.set(myId, new Set());
        
        if (pid && memberMap.has(pid)) {
            spouseMap.get(myId).add(pid);
            // Tự động thêm quan hệ ngược lại cho người kia
            if (!spouseMap.has(pid)) spouseMap.set(pid, new Set());
            spouseMap.get(pid).add(myId);
        }
    });

    const memberToNode = new Map(); 
    const processed = new Set();
    const displayNodes = [];

    data.forEach(d => {
        const myId = String(d.id);
        if (processed.has(myId)) return;

        // Xác định chủ hộ (Head) để gom nhóm
        // Ưu tiên Nam làm chủ hộ. Nếu là Nữ, thử tìm chồng của cô ấy.
        let head = d;
        const spouses = Array.from(spouseMap.get(myId) || []);
        
        if (d.gender === 'Nữ') {
            const husbandId = spouses.find(sid => {
                const s = memberMap.get(sid);
                return s && s.gender === 'Nam';
            });
            if (husbandId) {
                head = memberMap.get(husbandId);
            }
        }

        // Nếu chủ hộ đã được xử lý (do đã duyệt qua thành viên khác trong gia đình này), bỏ qua
        if (processed.has(String(head.id))) return;

        // Tập hợp thành viên gia đình: [Chủ hộ, Vợ 1, Vợ 2...]
        const headId = String(head.id);
        const headSpouses = Array.from(spouseMap.get(headId) || []);
        
        const familyMembers = [head];
        headSpouses.forEach(sid => {
            if (sid !== headId) { // Tránh trùng lặp chính mình
                const s = memberMap.get(sid);
                if (s) familyMembers.push(s);
            }
        });

        // Đánh dấu tất cả thành viên trong gia đình là đã xử lý
        familyMembers.forEach(m => processed.add(String(m.id)));

        const node = {
            id: `node-${head.id}`,
            type: familyMembers.length > 1 ? 'couple' : 'single',
            members: familyMembers,
            children: [],
            data: head // Dùng chủ hộ làm đại diện nối với cha
        };

        familyMembers.forEach(m => memberToNode.set(String(m.id), node));
        displayNodes.push(node);
    });

    // 2. Xây dựng cây phân cấp (Hierarchy)
    const roots = [];
    displayNodes.forEach(node => {
        // Lấy người đại diện (thường là chồng hoặc người độc thân)
        const representative = node.members[0];
        
        // Tìm node cha mẹ dựa trên fid hoặc mid (chuyển sang String để khớp)
        // Ưu tiên tìm theo fid (cha), nếu không thấy thì tìm theo mid (mẹ)
        let parentNode = null;
        if (representative.fid && memberToNode.has(String(representative.fid))) {
            parentNode = memberToNode.get(String(representative.fid));
        } else if (representative.mid && memberToNode.has(String(representative.mid))) {
            parentNode = memberToNode.get(String(representative.mid));
        }

        if (parentNode) {
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sắp xếp các node con theo thứ tự (order) để đảm bảo đúng thứ tự phái/chi
    const sortNodes = (nodes) => {
        nodes.sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) sortNodes(node.children);
        });
    };
    sortNodes(roots);

    // Tạo một node gốc ảo để chứa tất cả các nhánh (trường hợp có nhiều cụ tổ)
    const superRoot = { id: 'super-root', children: roots, type: 'root', members: [] };

    // 3. Sử dụng thuật toán D3 Tree Layout
    const rootD3 = d3.hierarchy(superRoot, d => d.children);
    globalRootD3 = rootD3; // Lưu lại để hàm zoom có thể truy cập
    
    // Cấu hình kích thước
    const boxWidth = 120;
    const boxHeight = 60;
    const gap = 20; // Khoảng cách giữa vợ và chồng
    const levelSeparation = 150; // Khoảng cách giữa các đời

    const treeLayout = d3.tree()
        .nodeSize([260, levelSeparation]) // Kích thước vùng không gian cho mỗi node
        .separation((a, b) => {
            // Tăng khoảng cách nếu node là cặp vợ chồng
            const aIsCouple = a.data.type === 'couple';
            const bIsCouple = b.data.type === 'couple';
            let sep = 1;
            if (aIsCouple) sep += 0.5;
            if (bIsCouple) sep += 0.5;
            return (a.parent === b.parent ? sep : sep + 0.5);
        });

    treeLayout(rootD3);

    // Căn chỉnh lại vị trí Y theo đúng Đời (Generation) trong dữ liệu
    // Giúp các thành viên cùng đời luôn nằm trên một hàng thẳng tắp
    rootD3.each(d => {
        if (d.data.id === 'super-root') return;
        if (d.data.data && d.data.data.generation) {
            d.y = (d.data.data.generation - 1) * levelSeparation;
        }
    });

    // 4. Vẽ hiển thị
    // Tính toán offset để căn giữa cây vào màn hình
    let minX = Infinity;
    rootD3.each(d => { 
        // Bỏ qua super-root để tính toán khung hình chính xác hơn
        if (d.data.id !== 'super-root' && d.x < minX) minX = d.x; 
    });
    if (minX === Infinity) minX = 0;

    const startY = 20; // Giảm khoảng trắng ở trên
    const offsetX = -minX + 100;

    // Vẽ đường nối (Vuông góc - Orthogonal)
    g.selectAll(".link")
        .data(rootD3.links().filter(l => l.source.data.id !== 'super-root'))
        .enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("d", d => {
            const sourceX = d.source.x + offsetX;
            const sourceY = d.source.y + startY + boxHeight; // Bắt đầu từ đáy ô cha
            const targetX = d.target.x + offsetX;
            const targetY = d.target.y + startY; // Kết thúc tại đỉnh ô con
            
            const midY = sourceY + (targetY - sourceY) / 2;
            // Vẽ đường gấp khúc: Xuống -> Ngang -> Xuống
            return `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`;
        });

    // Vẽ các Node (Nhóm thẻ chứa người)
    const nodeGroup = g.selectAll(".node")
        .data(rootD3.descendants().filter(d => d.data.id !== 'super-root'))
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x + offsetX},${d.y + startY})`);

    nodeGroup.each(function(d) {
        const group = d3.select(this);
        const members = d.data.members;
        
        // Tính toán chiều rộng tổng thể để căn giữa
        const totalW = members.length * boxWidth + (members.length - 1) * gap;
        let currentX = -(totalW / 2);

        members.forEach((m, index) => {
            drawMemberBox(group, m, currentX, 0, boxWidth, boxHeight);
            
            // Vẽ đường nối ngang màu đỏ giữa các thành viên (Vợ - Chồng)
            if (index < members.length - 1) {
                group.append("line")
                    .attr("x1", currentX + boxWidth).attr("y1", boxHeight/2)
                    .attr("x2", currentX + boxWidth + gap).attr("y2", boxHeight/2)
                    .attr("stroke", "#e74c3c").attr("stroke-width", 2);
            }
            currentX += boxWidth + gap;
        });

        // Đường nối xuống con cái (Xuất phát từ giữa, nơi có đường hôn nhân)
        if (d.children && d.children.length > 0 && members.length > 1) {
            group.append("line")
                .attr("x1", 0).attr("y1", boxHeight/2)
                .attr("x2", 0).attr("y2", boxHeight)
                .attr("stroke", "#999").attr("stroke-width", 1.5);
        }
    });

    // 5. Tự động zoom vào Thủy tổ khi tải xong
    const firstAncestor = data.find(d => d.generation === 1);
    if (firstAncestor) {
        // Thêm timeout nhỏ để đảm bảo DOM đã render xong trước khi zoom
        setTimeout(() => {
            zoomToNode(firstAncestor.id, 0.8); 
        }, 100);
    }
}

// Hàm vẽ hộp thông tin thành viên
function drawMemberBox(group, member, x, y, w, h) {
    const g = group.append("g").attr("transform", `translate(${x},${y})`)
        .style("cursor", "pointer")
        .on("click", (event) => {
            event.stopPropagation();
            // Highlight khi click vào node (giữ nguyên mức zoom hiện tại)
            const currentScale = d3.zoomTransform(svg.node()).k;
            zoomToNode(member.id, currentScale);
            
            // Gọi hàm mở modal sửa (được định nghĩa trong main.js)
            if (window.openEditModal) {
                window.openEditModal(member.id);
            }
        });

    const strokeColor = member.gender === "Nam" ? "#2196f3" : "#e91e63";

    // Khung nền
    g.append("rect")
        .attr("id", `rect-${member.id}`) // Thêm ID để select
        .attr("class", "member-rect")    // Thêm class để reset style
        .attr("data-original-stroke", strokeColor) // Lưu màu gốc
        .attr("width", w).attr("height", h).attr("rx", 4)
        .attr("fill", member.gender === "Nam" ? "#e3f2fd" : "#fce4ec")
        .attr("stroke", strokeColor)
        .attr("stroke-width", 1.5);

    // Tên thành viên
    g.append("text")
        .text(member.full_name || "Chưa có tên")
        .attr("x", w/2).attr("y", h/2 - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .style("fill", "#333")
        .each(function() {
            // Tự động cắt chữ nếu quá dài
            const self = d3.select(this);
            let text = self.text();
            while (text.length > 18) { // Giới hạn độ dài
                text = text.slice(0, -1);
                self.text(text + "...");
            }
        });

    // Thông tin phụ (Năm sinh hoặc ID)
    g.append("text")
        .text(member.birth_date ? `NS: ${member.birth_date}` : `ID: ${member.id}`)
        .attr("x", w/2).attr("y", h/2 + 15)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#666");
}

// Hàm tìm kiếm và zoom tới node
function zoomToNode(memberId, customScale = 0.7) { // Đã sửa: Mặc định zoom 0.7 theo yêu cầu
    if (!globalRootD3) return;

    // 1. Xóa highlight cũ (Reset về màu gốc)
    d3.selectAll(".member-rect")
        .attr("stroke", function() { return d3.select(this).attr("data-original-stroke"); })
        .attr("stroke-width", 1.5);

    // 2. Highlight node mới (Màu cam nổi bật)
    const targetRect = document.getElementById(`rect-${memberId}`);
    if (targetRect) {
        d3.select(targetRect).attr("stroke", "#ff9800").attr("stroke-width", 4);
    }

    // Tìm node D3 tương ứng với memberId
    const targetNode = globalRootD3.descendants().find(d => 
        d.data.members && d.data.members.some(m => String(m.id) === String(memberId))
    );

    if (targetNode) {
        const canvas = document.getElementById('tree-canvas');
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;

        // Tính toán offset để căn giữa cây
        let minX = Infinity;
        globalRootD3.each(d => { 
            if (d.data.id !== 'super-root' && d.x < minX) minX = d.x; 
        });
        if (minX === Infinity) minX = 0;

        const offsetX = -minX + 100;
        const startY = 20; // Giảm khoảng trắng ở trên

        const targetX = targetNode.x + offsetX;
        const targetY = targetNode.y + startY;
        const scale = customScale; // Sử dụng scale được truyền vào

        // Thay đổi vị trí hiển thị: Đưa node mục tiêu lên cao (cách top 50px) thay vì giữa màn hình (h/2)
        // Giúp loại bỏ khoảng trắng thừa phía trên
        const transform = d3.zoomIdentity.translate(w / 2 - targetX * scale, 50 - targetY * scale).scale(scale);
        svg.transition().duration(750).call(zoom.transform, transform);
    }
}
