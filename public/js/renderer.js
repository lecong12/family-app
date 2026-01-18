const svg = d3.select("#tree-canvas").append("svg")
    .attr("width", "100%").attr("height", "100vh")
    .call(d3.zoom().on("zoom", (e) => g.attr("transform", e.transform)));
const g = svg.append("g");

function drawTree(data) {
    g.selectAll("*").remove();
    data.forEach(d => {
        // Gán giá trị mặc định để tránh lỗi tính toán
        const gen = d.generation || 1;
        const ord = d.order || 1;
        d.y = gen * 180;
        d.x = (hashBranch(d.branch) * 400) + (ord * 60);
    });

    // Vẽ đường nối Cha-Con
    g.selectAll(".link").data(data.filter(d => d.fid)).enter().append("path")
        .attr("class", "link")
        .attr("d", d => {
            const f = data.find(p => p.id === d.fid);
            if (!f) return ""; // Bỏ qua nếu không tìm thấy cha (tránh lỗi trắng trang)
            return `M${f.x},${f.y} L${d.x},${d.y}`;
        });

    // Vẽ Node
    const nodes = g.selectAll(".node").data(data).enter().append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`);
    nodes.append("circle").attr("r", 15).attr("fill", d => d.gender === "Nam" ? "#3498db" : "#e74c3c");
    nodes.append("text").text(d => d.full_name).attr("y", 25).attr("text-anchor", "middle");
}

function hashBranch(s) { 
    // Chuyển về chuỗi và gán mặc định nếu null/undefined để tránh lỗi s.split
    const str = String(s || "Gốc"); 
    return Math.abs(str.split("").reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)) % 5; 
}
