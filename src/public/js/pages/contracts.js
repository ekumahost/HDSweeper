// Token Contracts page
var ContractsPage = {
    render: async function() {
        var data = await API.get("/api/contracts");
        var contracts = data.contracts || [];
        var rows = "";
        contracts.forEach(function(c) {
            rows += "<tr>" +
                "<td>" + c.symbol + "</td>" +
                "<td>" + (c.name || "\u2014") + "</td>" +
                "<td>" + c.chainId + "</td>" +
                '<td title="' + c.contractAddress + '">' + truncAddr(c.contractAddress) + "</td>" +
                "<td>" + c.decimals + "</td>" +
                "<td>" + (c.isActive ? badge("Active", "green") : badge("Inactive", "red")) + "</td>" +
                "<td>" +
                '<button class="btn btn-sm" onclick="ContractsPage.toggle(\'' + c._id + "\', " + !c.isActive + ')">' + (c.isActive ? "Disable" : "Enable") + "</button> " +
                '<button class="btn btn-sm btn-danger" onclick="ContractsPage.remove(\'' + c._id + '\')">' + 'Del</button>' +
                "</td></tr>";
        });

        return '<div class="card"><h2>Add Token Contract</h2>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Chain ID</label>' +
            '<select id="contractChain">' +
            '<option value="1">Ethereum (1)</option>' +
            '<option value="56">BSC (56)</option>' +
            '<option value="137">Polygon (137)</option>' +
            '<option value="42161">Arbitrum (42161)</option>' +
            '<option value="8453">Base (8453)</option>' +
            '<option value="42420">Asset Chain (42420)</option>' +
            "</select></div>" +
            '<div class="form-group"><label>Contract Address</label>' +
            '<input id="contractAddr" placeholder="0x..." /></div>' +
            "</div>" +
            '<button class="btn btn-primary" onclick="ContractsPage.add()">Add (auto-fetch info)</button>' +
            "</div>" +
            '<div class="card"><h2>Token Contracts (' + contracts.length + ")</h2>" +
            '<div class="table-wrap"><table>' +
            "<thead><tr><th>Symbol</th><th>Name</th><th>Chain</th><th>Address</th><th>Decimals</th><th>Status</th><th>Actions</th></tr></thead>" +
            "<tbody>" + (rows || '<tr><td colspan="7">' + emptyState("No contracts. Defaults are seeded on first boot.") + "</td></tr>") + "</tbody>" +
            "</table></div></div>";
    },

    add: async function() {
        var chainId = Number(document.getElementById("contractChain").value);
        var addr = document.getElementById("contractAddr").value.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast("Invalid address", "error");
        try {
            await API.post("/api/contracts", { chainId: chainId, contractAddress: addr });
            toast("Contract added", "success");
            App.navigate("contracts");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    toggle: async function(id, isActive) {
        try {
            await API.put("/api/contracts/" + id, { isActive: isActive });
            App.navigate("contracts");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    remove: async function(id) {
        if (!confirm("Delete this contract?")) return;
        try {
            await API.del("/api/contracts/" + id);
            toast("Deleted", "success");
            App.navigate("contracts");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },
};