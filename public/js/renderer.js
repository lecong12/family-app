const svg = d3.select("#tree-canvas").append("svg")
    .attr("width", "100%").attr("height", "100vh")
    .call(d3.zoom().on("zoom", (e) => g.attr("transform", e.transform)));
const g = svg.append("g");

function drawTree(data) {
    g.selectAll("*").remove();

    // 1. Nhóm thành viên theo Đời (Generation)
    const generations = {};
    data.forEach(d => {
        const gen = d.generation || 1;
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(d);
    });

    // 2. Tính toán tọa độ (X, Y)
    const nodeWidth = 140;  // Khoảng cách ngang giữa các người (tăng lên để tên không dính)
    const levelHeight = 200; // Khoảng cách dọc giữa các đời

    Object.keys(generations).forEach(genKey => {
        const genMembers = generations[genKey];
        
        // Sắp xếp: Gom những người cùng Cha (fid) lại gần nhau để dây không bị chéo
        genMembers.sort((a, b) => {
            const fidA = a.fid || "";
            const fidB = b.fid || "";
            return fidA.localeCompare(fidB) || (a.order - b.order);
        });

        // --- Logic mới: Sắp xếp Vợ/Chồng cạnh nhau (Chồng trái - Vợ phải) ---
        const ordered = [];
        const processed = new Set();
        const memberMap = new Map(genMembers.map(m => [m.id, m]));

        genMembers.forEach(d => {
            if (processed.has(d.id)) return;

            const spouse = d.pid ? memberMap.get(d.pid) : null;

            if (spouse && !processed.has(spouse.id)) {
                // Có vợ/chồng trong cùng đời
                if (d.gender === 'Nam') {
                    ordered.push(d);
                    ordered.push(spouse);
                } else {
                    // Nếu d là Nữ, đưa Chồng lên trước (bên trái)
                    ordered.push(spouse);
                    ordered.push(d);
                }
                processed.add(d.id);
                processed.add(spouse.id);
            } else {
                ordered.push(d);
                processed.add(d.id);
            }
        });
        // ---------------------------------------------

        // Tính toán vị trí X bắt đầu để căn giữa cây
        const totalWidth = ordered.length * nodeWidth;
        const startX = -(totalWidth / 2);

        ordered.forEach((d, i) => {
            d.y = (d.generation - 1) * levelHeight + 100; // Y tăng theo đời
            d.x = startX + (i * nodeWidth); // X dàn đều sang ngang
        });
    });

    // Vẽ đường nối Vợ-Chồng
    // Lọc những người có pid. Để tránh vẽ trùng 2 đường nếu cả 2 đều trỏ nhau, ta ưu tiên vẽ từ Nam -> Nữ.
    g.selectAll(".spouse-link").data(data.filter(d => d.pid)).enter().append("path")
        .attr("class", "spouse-link")
        .attr("fill", "none")
        .attr("stroke", "#e74c3c")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4") // Nét đứt thể hiện quan hệ hôn nhân
        .attr("d", d => {
            const spouse = data.find(p => p.id === d.pid);
            if (!spouse || !spouse.x) return ""; 
            
            // Nếu cả 2 đều có pid trỏ nhau, chỉ vẽ 1 lần (ưu tiên Nam vẽ, hoặc nếu Nữ trỏ Nam mà Nam không trỏ lại thì Nữ vẽ)
            if (d.gender === 'Nữ' && spouse.pid === d.id) return "";

            // Nối từ mép người này sang mép người kia (tự động tính toán trái/phải)
            const sourceX = d.x < spouse.x ? d.x + 15 : d.x - 15;
            const targetX = d.x < spouse.x ? spouse.x - 15 : spouse.x + 15;
            
            return `M${sourceX},${d.y} L${targetX},${spouse.y}`;
    });

    // Vẽ đường nối Cha-Con
    g.selectAll(".link").data(data.filter(d => d.fid)).enter().append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1.5)
        .attr("d", d => {
            const f = data.find(p => p.id === d.fid);
            if (!f) return ""; // Bỏ qua nếu không tìm thấy cha (tránh lỗi trắng trang)
            // Vẽ đường cong Bezier cho mềm mại
            return `M${f.x},${f.y} C${f.x},${(f.y + d.y) / 2} ${d.x},${(f.y + d.y) / 2} ${d.x},${d.y}`;
        });

    // Vẽ Node
    const nodes = g.selectAll(".node").data(data).enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            alert(`Thông tin:\n- Tên: ${d.full_name}\n- Đời: ${d.generation}\n- ID: ${d.id}`);
        });

    nodes.append("circle").attr("r", 15).attr("fill", d => d.gender === "Nam" ? "#3498db" : "#e74c3c");
    
    // Tên thành viên (Tự động xuống dòng nếu quá dài hoặc hiển thị nhỏ hơn)
    nodes.append("text")
        .text(d => d.full_name || 'Chưa có tên')
        .attr("y", 25)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .style("fill", "#333")
        .style("text-shadow", "1px 1px 0px white"); // Viền trắng cho chữ dễ đọc
}
